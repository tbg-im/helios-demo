/**
 * Client configuration options
 */
export interface TBClientConfig {
  /** OAuth2 Client ID for authentication */
  clientId: string;
  /** OAuth2 Client Secret for authentication */
  clientSecret: string;
  /** Base URL for Teambridge API (defaults to production) */
  baseUrl?: string;
  /** Auth0 token endpoint (defaults to Teambridge Auth0) */
  authUrl?: string;
  /** OAuth2 audience (defaults to API base URL) */
  audience?: string;
  /** Signed X-User-Context header value — forwarded to the Open API to act as the requesting user */
  userContext?: string;
}

/**
 * OAuth2 token response from Auth0
 */
export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

/**
 * Pagination options for list endpoints
 */
export interface PaginationOptions {
  /** Page number (0-indexed) */
  page?: number;
  /** Number of items per page (max 50 — the API rejects more) */
  pageSize?: number;
}

/**
 * Server-side record filters, keyed `{fieldId}_{operator}` → value. Always key
 * by field **UUID**, never by field name.
 *
 * Operators by field type:
 *   TEXT / EMAIL / PHONE: `_is`, `_contains`
 *   NUMBER / DATETIME:    `_is`, `_gt`, `_gte`, `_lt`, `_lte`
 *   BOOLEAN / SELECT:     `_is` (select matches the option *name*, case-insensitive)
 *   LINK_TO_* :           `_is` (the linked record's ID)
 *
 * Up to 10 filters per request, combined with AND (there is no OR, and no sort
 * parameter). Some fields cannot be filtered at all — COMPUTED fields, native
 * system selects, and native system fields such as a user's access groups. An
 * unsupported filter either 400s or is silently ignored, so check the result
 * the first time you filter on a new field. See AGENTS.md → "Filtering".
 *
 * @example { [`${startField.id}_gte`]: '2026-09-01T00:00:00Z', [`${locationField.id}_is`]: locationId }
 */
export type RecordFilters = Record<string, string | number | boolean | undefined>;

/**
 * Options for listing records.
 */
export interface ListRecordsOptions extends PaginationOptions {
  /** Server-side filters — see {@link RecordFilters} */
  filters?: RecordFilters;
}

/**
 * Options for reading every matching record across pages.
 */
export interface ListAllRecordsOptions {
  /** Server-side filters — see {@link RecordFilters}. Filter here, not in JS. */
  filters?: RecordFilters;
  /**
   * Hard stop, in pages of 50. Defaults to 20 (1,000 records). Hitting it logs
   * a warning and returns what was read, with `truncated: true` — a view that
   * needs more than this should be filtered or paged, not scanned.
   */
  maxPages?: number;
}

/**
 * Paginated response wrapper
 */
export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  size: number;
  totalCount: number;
}

/**
 * Collection (custom data table)
 */
export interface Collection {
  id: string;
  name: string;
  description?: string;
}

/**
 * Field definition within a collection
 */
export interface Field {
  id: string;
  /** Display name. NOT unique within a collection — see AGENTS.md → "Field mapping". */
  name: string;
  /** Public field type, e.g. TEXT, NUMBER, DATETIME, SINGLE_SELECT, MULTI_SELECT, LINK_TO_USER */
  type: string;
  required: boolean;
  /** True for system-managed fields (e.g. a native Status). Writing one fails. */
  readOnly?: boolean;
  /**
   * How to encode a write to this field. `comma_separated_uuids` means a
   * single string `"id1,id2"` — **not** a JSON array. `single_uuid` means one
   * UUID string. Use `toWriteValue()` from `@/lib/teambridge/schema`.
   */
  writeFormatHint?: string;
  /** For link fields, the collection the IDs point into */
  linkedCollectionId?: string;
  /** Options for select fields */
  selectOptions?: Array<{ id: string; name: string }>;
}

/**
 * Generic record from a collection
 */
export interface DataRecord {
  id: string;
  [key: string]: unknown;
}

/**
 * Shift data
 */
export interface Shift {
  recordId: string;
  startAt: string;
  endAt: string;
  published: boolean;
  userId: string | null;
  locationId: string | null;
  clockIn: string;
  clockOut: string;
  openCount: number;
  bonus: number | null;
  payRate: number;
  hoursWorkedMilliseconds: number;
  hoursScheduledMilliseconds: number;
  billRate: number | null;
  timezone: string;
  billBonus: number | null;
  roles: string[];
  [key: string]: unknown;
}

/**
 * Request to create a shift
 */
export interface CreateShiftRequest {
  jobId: string;
  locationId: string;
  startTime: string;
  endTime: string;
  [key: string]: unknown;
}

/**
 * Shift timestamp (clock in/out)
 */
export interface ShiftTimestamp {
  id: string;
  shiftId: string;
  userId: string;
  type: 'clock_in' | 'clock_out' | 'break_start' | 'break_end';
  timestamp: string;
  [key: string]: unknown;
}

/**
 * Placement (user assignment to a shift)
 */
export interface Placement {
  id: string;
  shiftId: string;
  userId: string;
  status: string;
  [key: string]: unknown;
}

/**
 * Request to create a placement
 */
export interface CreatePlacementRequest {
  shiftId: string;
  userId: string;
  [key: string]: unknown;
}

/**
 * User data
 */
export interface User {
  recordId: string;
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  date_of_birth?: string | null;
  [key: string]: unknown;
}

/**
 * Request to create a user
 */
export interface CreateUserRequest {
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  date_of_birth?: string | null;
  [key: string]: unknown;
}

/**
 * User lookup query
 */
export interface UserLookupQuery {
  email?: string;
  phone?: string;
  [key: string]: string | undefined;
}

/**
 * Job data
 */
export interface Job {
  id: string;
  name: string;
  description?: string;
  [key: string]: unknown;
}

/**
 * Request to create a job
 */
export interface CreateJobRequest {
  name: string;
  description?: string;
  [key: string]: unknown;
}

/**
 * Location data
 */
export interface Location {
  id: string;
  name: string;
  address?: string;
  [key: string]: unknown;
}

/**
 * Timezone data
 */
export interface Timezone {
  id: string;
  name: string;
  offset: string;
}

/**
 * Document upload options
 */
export interface DocumentUploadOptions {
  roles?: string[];
}

/**
 * Uploaded document
 */
export interface Document {
  id: string;
  name: string;
  url: string;
  mimeType: string;
  size: number;
}
