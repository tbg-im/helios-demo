import { TBClient, TBApiError } from './TBClient';

export { TBClient, TBApiError };
export * from './types';

/**
 * Get a TBClient instance using OAuth2 credentials from environment variables.
 * Pass `userContext` from `getTBContext()` for user-scoped collection reads and
 * writes; it forwards the signed `X-User-Context` header to OpenAPI.
 *
 * @example
 * ```ts
 * import { getTBClient } from '@/lib/teambridge';
 *
 * const client = getTBClient();
 * const collections = await client.collections.list();
 * ```
 *
 * @example
 * ```ts
 * import { getTBClient, getTBContext } from '@/lib/teambridge';
 *
 * export async function GET() {
 *   const { userContext } = await getTBContext();
 *   const client = getTBClient(userContext);
 *   const records = await client.collections.records.list(collectionId, {
 *     page: 0,
 *     pageSize: 50,
 *   });
 *   return Response.json(records);
 * }
 * ```
 *
 * @param userContext Signed Teambridge user context to forward as
 * `X-User-Context` for current-user-scoped OpenAPI requests.
 */
export function getTBClient(userContext?: string | null) {
  const clientId = process.env.TB_CLIENT_ID;
  const clientSecret = process.env.TB_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'TB_CLIENT_ID and TB_CLIENT_SECRET environment variables must be set'
    );
  }

  return new TBClient({
    clientId,
    clientSecret,
    baseUrl: process.env.TB_OPEN_API_BASE_URL,
    authUrl: process.env.TB_AUTH_URL,
    audience: process.env.TB_AUDIENCE,
    userContext: userContext ?? undefined,
  });
}
