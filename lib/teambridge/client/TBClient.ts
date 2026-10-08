import type {
  TBClientConfig,
  TokenResponse,
  ListRecordsOptions,
  ListAllRecordsOptions,
  PaginatedResponse,
  Collection,
  Field,
  DataRecord,
  Timezone,
  Document,
  DocumentUploadOptions,
  UserLookupQuery,
} from './types';

const DEFAULT_BASE_URL = 'https://open-api.teambridge.com';
const DEFAULT_AUTH_URL = 'https://teambridge.us.auth0.com/oauth/token';
const DEFAULT_AUDIENCE = 'https://api.teambridge.com/openapi/';
const MAX_PAGE_SIZE = 50;
/** Pages `listAll` reads at once — well inside the 720 requests/minute limit. */
const LIST_ALL_CONCURRENCY = 4;

/**
 * Error thrown for non-2xx Teambridge API responses. Carries the HTTP status
 * and the response body so callers can tell a 403 (missing scope or no access)
 * from a 400 (bad payload) from a 404 — and show a specific message instead of
 * a generic one. Never swallow these silently; see AGENTS.md → "Errors".
 */
export class TBApiError extends Error {
  readonly status: number;
  readonly body: string;
  readonly path: string;

  constructor(status: number, statusText: string, body: string, path: string) {
    super(`Teambridge API error: ${status} ${statusText} on ${path} - ${body}`);
    this.name = 'TBApiError';
    this.status = status;
    this.body = body;
    this.path = path;
  }
}

// ---------------------------------------------------------------------------
// Access-token cache — module scoped, keyed on auth endpoint + client id +
// audience. A TBClient is constructed per request (it carries that request's
// user context), so a per-instance cache would re-run the client-credentials
// flow on every render. Storing the in-flight promise also collapses
// concurrent callers into a single token request.
// ---------------------------------------------------------------------------

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

const tokenCache = new Map<string, Promise<CachedToken>>();
const TOKEN_EXPIRY_BUFFER_MS = 60_000;

async function fetchToken(authUrl: string, body: Record<string, string>): Promise<CachedToken> {
  const response = await fetch(authUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to obtain access token: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  const tokenResponse: TokenResponse = await response.json();
  return {
    accessToken: tokenResponse.access_token,
    expiresAt: Date.now() + tokenResponse.expires_in * 1000,
  };
}

/**
 * Teambridge API client for making authenticated requests to the Teambridge API.
 *
 * Uses OAuth2 Client Credentials flow to obtain access tokens from Auth0.
 *
 * @example
 * ```ts
 * const client = new TBClient({
 *   clientId: process.env.TB_CLIENT_ID!,
 *   clientSecret: process.env.TB_CLIENT_SECRET!,
 * });
 *
 * // List collections and fetch records
 * const collections = await client.collections.list();
 * const records = await client.collections.records.list(collectionId, { page: 0, pageSize: 50 });
 * ```
 */
export class TBClient {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly baseUrl: string;
  private readonly authUrl: string;
  private readonly audience: string;
  private readonly userContext: string | undefined;

  constructor(config: TBClientConfig) {
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
    this.authUrl = config.authUrl || DEFAULT_AUTH_URL;
    this.audience = config.audience || DEFAULT_AUDIENCE;
    this.userContext = config.userContext;
  }

  /**
   * Get a valid access token from the shared cache, refreshing if necessary.
   */
  private async getAccessToken(): Promise<string> {
    const key = `${this.authUrl}|${this.clientId}|${this.audience}`;

    const cached = tokenCache.get(key);
    if (cached) {
      try {
        const token = await cached;
        if (Date.now() < token.expiresAt - TOKEN_EXPIRY_BUFFER_MS) {
          return token.accessToken;
        }
      } catch {
        // A failed token request must not poison the cache — fall through and retry.
      }
      tokenCache.delete(key);
    }

    const pending = fetchToken(this.authUrl, {
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      audience: this.audience,
    });
    tokenCache.set(key, pending);
    pending.catch(() => tokenCache.delete(key));

    return (await pending).accessToken;
  }

  private async request<T>(
    method: string,
    path: string,
    options?: {
      body?: unknown;
      params?: Record<string, string | number | boolean | undefined>;
    }
  ): Promise<T> {
    const accessToken = await this.getAccessToken();
    const url = new URL(path, this.baseUrl);

    if (options?.params) {
      Object.entries(options.params).forEach(([key, value]) => {
        if (value !== undefined) {
          url.searchParams.set(key, String(value));
        }
      });
    }
    const requestHeaders: Record<string, string> = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };
    if (this.userContext) {
      requestHeaders['X-User-Context'] = this.userContext;
    }

    const response = await fetch(url.toString(), {
      method,
      headers: requestHeaders,
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new TBApiError(response.status, response.statusText, errorText, `${method} ${path}`);
    }

    const json = await response.json();
    // API wraps responses in a `data` object
    return json.data as T;
  }

  /** Unwraps a list endpoint that answers either a bare array or `{ <key>: [...] }`. */
  private unwrapList<T>(response: T[] | Record<string, unknown>, ...keys: string[]): T[] {
    if (Array.isArray(response)) return response;
    for (const key of keys) {
      const value = response[key];
      if (Array.isArray(value)) return value as T[];
    }
    return [];
  }

  private paginationParams(options?: ListRecordsOptions) {
    return {
      ...options?.filters,
      page: options?.page,
      size: options?.pageSize, // API uses 'size', we accept 'pageSize' for ergonomics
    };
  }

  /**
   * Normalize API records response to DataRecord[].
   * Handles: { metadata: { recordId }, data: { [fieldId]: value } }[]
   * or column-oriented: { [fieldId]: values[] } or record-oriented: { [recordId]: { [fieldId]: value } }.
   */
  private normalizeRecordsData(
    data: unknown
  ): Array<Record<string, unknown> & { id: string }> {
    if (Array.isArray(data)) {
      return data.map((item: unknown) => {
        const record = item as { metadata?: { recordId?: string }; data?: Record<string, unknown> };
        if (record?.metadata?.recordId != null && record?.data && typeof record.data === 'object') {
          return {
            id: record.metadata.recordId,
            ...record.data,
          } as Record<string, unknown> & { id: string };
        }
        return item as Record<string, unknown> & { id: string };
      });
    }

    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const obj = data as Record<string, unknown>;
      const entries = Object.entries(obj);

      // Column-oriented: { [fieldId]: [v1, v2, ...] } - first array determines length
      const firstArray = entries.find(([, v]) => Array.isArray(v))?.[1] as unknown[] | undefined;
      if (firstArray) {
        const fieldIds = entries.map(([k]) => k);
        return firstArray.map((_, i) => {
          const record: Record<string, unknown> = {};
          for (const fieldId of fieldIds) {
            const vals = obj[fieldId];
            record[fieldId] = Array.isArray(vals) ? vals[i] : vals;
          }
          record.id = (record.id ?? record.Id ?? record.recordId ?? String(i)) as string;
          return record as Record<string, unknown> & { id: string };
        });
      }

      // Record-oriented: { [recordId]: { [fieldId]: value } }
      return entries.map(([id, fields]) => ({
        id,
        ...(typeof fields === 'object' && fields && !Array.isArray(fields)
          ? (fields as Record<string, unknown>)
          : {}),
      })) as Array<Record<string, unknown> & { id: string }>;
    }

    return [];
  }

  /**
   * Collections API - access custom data tables
   */
  collections = {
    /**
     * List all collections in the account
     */
    list: async (): Promise<Collection[]> => {
      const response = await this.request<Collection[] | Record<string, unknown>>('GET', '/v1/collections');
      return this.unwrapList(response, 'collections', 'items');
    },

    /**
     * Get field definitions for a collection
     */
    getFields: async (collectionId: string): Promise<Field[]> => {
      const response = await this.request<Field[] | Record<string, unknown>>(
        'GET',
        `/v1/collections/${collectionId}/fields`
      );
      return this.unwrapList(response, 'fields', 'items');
    },

    /**
     * Record operations within a collection
     */
    records: {
      /**
       * List records in a collection
       */
      list: async (
        collectionId: string,
        options?: ListRecordsOptions
      ): Promise<PaginatedResponse<DataRecord>> => {
        const response = await this.request<{
          data?: unknown;
          page?: number;
          size?: number;
          totalCount?: number;
        }>('GET', `/v1/collections/${collectionId}/records`, {
          params: this.paginationParams(options),
        });
        const data = this.normalizeRecordsData(response.data ?? response);
        return {
          data: data as DataRecord[],
          page: response.page ?? 0,
          size: response.size ?? data.length,
          totalCount: response.totalCount ?? data.length,
        };
      },

      /**
       * Read every record matching `filters`, 50 per page, a few pages at a
       * time, up to `maxPages`. Filter server-side — a full scan of a large
       * collection (Users, Shifts, Locations) takes seconds and burns the
       * 720 requests/minute rate limit shared by every request this app makes.
       */
      listAll: async (
        collectionId: string,
        options?: ListAllRecordsOptions
      ): Promise<{ data: DataRecord[]; totalCount: number; truncated: boolean }> => {
        const maxPages = options?.maxPages ?? 20;
        const readPage = (page: number) =>
          this.collections.records.list(collectionId, {
            filters: options?.filters,
            page,
            pageSize: MAX_PAGE_SIZE,
          });

        const first = await readPage(0);
        const totalPages = Math.ceil(first.totalCount / MAX_PAGE_SIZE);
        const pagesToRead = Math.min(totalPages, maxPages);

        // A pool of LIST_ALL_CONCURRENCY readers: each takes the next page as
        // soon as its last one lands, so one slow page doesn't stall a batch.
        const pages: DataRecord[][] = [first.data];
        let nextPage = 1;
        const reader = async () => {
          while (nextPage < pagesToRead) {
            const page = nextPage++;
            pages[page] = (await readPage(page)).data;
          }
        };
        await Promise.all(Array.from({ length: Math.max(0, Math.min(LIST_ALL_CONCURRENCY, pagesToRead - 1)) }, reader));
        const data = pages.flat();

        const truncated = totalPages > maxPages;
        if (truncated) {
          console.warn(
            `[Teambridge] listAll(${collectionId}) stopped at ${maxPages} pages of ${totalPages}; ` +
              'filter server-side or page the view instead of scanning.'
          );
        }

        // Pages can overlap if records are written mid-scan; dedupe by id.
        const byId = new Map(data.map((record) => [record.id, record]));
        return { data: [...byId.values()], totalCount: first.totalCount, truncated };
      },

      /**
       * Get a specific record
       */
      get: async (
        collectionId: string,
        recordId: string
      ): Promise<DataRecord> => {
        const response = await this.request<Record<string, unknown>>(
          'GET',
          `/v1/collections/${collectionId}/records/${recordId}`
        );
        if (!response || typeof response !== 'object' || Array.isArray(response)) {
          return response as unknown as DataRecord;
        }
        // Normalize { metadata: { recordId }, data: { [fieldId]: value } } to flat { id, ...data }
        const normalized = this.normalizeRecordsData([response]);
        const record = normalized[0];
        if (record) {
          return { ...record, id: record.id ?? recordId } as DataRecord;
        }
        return { ...response, id: (response.id as string) ?? recordId } as DataRecord;
      },

      /**
       * Create a new record.
       * Body must be a map of field UUIDs to values (use /fields to discover IDs and writeFormatHint).
       * API docs: https://docs.teambridge.com/#tag/Collections-(Unified-API)
       */
      create: async (
        collectionId: string,
        data: Record<string, unknown>
      ): Promise<{ id: string }> => {
        const response = await this.request<string | { id?: string }>(
          'POST',
          `/v1/collections/${collectionId}/records`,
          { body: { data } }
        );
        if (typeof response === 'object' && response?.id) {
          return { id: response.id };
        }
        const idMatch = typeof response === 'string' && response.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        return { id: idMatch ? idMatch[0] : '' };
      },

      /**
       * Update an existing record
       * Body should contain only fields to update, keyed by field UUID.
       */
      update: async (
        collectionId: string,
        recordId: string,
        data: Record<string, unknown>
      ): Promise<DataRecord> => {
        const response = await this.request<Record<string, unknown>>(
          'PUT',
          `/v1/collections/${collectionId}/records/${recordId}`,
          { body: { data } }
        );
        if (!response || typeof response !== 'object' || Array.isArray(response)) {
          return response as unknown as DataRecord;
        }
        return { ...response, id: (response.id as string) ?? recordId } as DataRecord;
      },
    },
  };

  /**
   * Platform Users API — separate from the Users *collection*.
   */
  users = {
    /**
     * Get a platform user by ID (e.g. `userId` from `getTBContext()`).
     * `recordId` on the result is that user's record in the Users collection.
     */
    get: (userId: string): Promise<{ recordId: string; email: string; first_name?: string; last_name?: string; [key: string]: unknown }> => {
      return this.request('GET', `/v1/users/${userId}`);
    },

    /**
     * Find a user by exact email or phone. The phone must match the stored
     * value exactly, so write and look up numbers in one format (E.164).
     * Returns null when nobody matches.
     */
    lookup: async (query: UserLookupQuery): Promise<{ recordId: string; [key: string]: unknown } | null> => {
      try {
        return await this.request('GET', '/v1/users/lookup', { params: query });
      } catch (e) {
        if (e instanceof TBApiError && e.status === 404) return null;
        throw e;
      }
    },

    /**
     * Locations assigned to a user. Prefer this over reading the Users
     * collection's Locations field: native link fields like that one can be
     * absent from records responses. Requires `userContext`.
     */
    getLocations: async (userId: string): Promise<Array<{ id: string; name: string; [key: string]: unknown }>> => {
      const response = await this.request<Array<{ id: string; name: string }> | Record<string, unknown>>(
        'GET',
        `/v1/users/${userId}/locations`
      );
      return this.unwrapList(response, 'locations');
    },
  };

  /**
   * Timezones API
   */
  timezones = {
    /**
     * List available timezones
     */
    list: (): Promise<Timezone[]> => {
      return this.request<Timezone[]>('GET', '/v1/timezones');
    },
  };

  /**
   * Documents API
   */
  documents = {
    /**
     * Upload a document
     */
    upload: async (
      file: File,
      options?: DocumentUploadOptions
    ): Promise<Document> => {
      const accessToken = await this.getAccessToken();
      const formData = new FormData();
      formData.append('file', file);
      if (options?.roles) {
        formData.append('roles', JSON.stringify(options.roles));
      }

      const response = await fetch(`${this.baseUrl}/v1/documents`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new TBApiError(response.status, response.statusText, errorText, 'POST /v1/documents');
      }

      return response.json();
    },
  };
}
