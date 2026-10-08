import { tbPath } from './url';

/**
 * Drop-in replacement for `fetch` that prepends the Teambridge app base path
 * (`/apps/<slug>`) to same-origin string URLs so they route correctly through
 * the Teambridge proxy. `URL` and `Request` inputs already carry absolute URLs
 * and pass through unchanged. Absolute string URLs (`http://`, `https://`)
 * also pass through unchanged.
 *
 * Use this in place of `fetch` in client components, server components, route
 * handlers, and server actions when calling your own app's API routes.
 *
 * @example
 *   await tbFetch('/api/foo')                // prefixed when proxied
 *   await tbFetch('https://example.com/api') // unchanged
 *   await tbFetch(new URL('...'))            // unchanged
 */
export function tbFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  if (typeof input === 'string') {
    return fetch(tbPath(input), init);
  }
  return fetch(input, init);
}
