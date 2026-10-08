/**
 * Base path prefix that the Teambridge proxy serves this app at. Next.js's
 * `basePath` setting already handles this for routing primitives (`<Link>`,
 * `useRouter`, `redirect`, `usePathname`). This export exists for the
 * remaining cases — most notably native `fetch`, which doesn't honor basePath.
 *
 * Empty string in dev mode (when the app runs standalone at `localhost:3000`).
 * Otherwise `/apps/<slug>`, derived in `next.config.ts` from `APP_SLUG` and
 * inlined into the client bundle at build time.
 */
export const TB_APP_BASE_PATH = process.env.NEXT_PUBLIC_TB_APP_BASE_PATH ?? '';

/**
 * Prepend the Teambridge base path to a same-origin URL so it routes correctly
 * through the Teambridge proxy. Pass-through for absolute URLs (`http://...`,
 * `https://...`) and for any path when no base path is configured (dev mode).
 *
 * @example
 *   tbPath('/api/foo')       // dev:  '/api/foo'
 *                            // prod: '/apps/<slug>/api/foo'
 *   tbPath('https://x.com')  // 'https://x.com' (unchanged)
 */
export function tbPath(path: string): string {
  if (!TB_APP_BASE_PATH) return path;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path)) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${TB_APP_BASE_PATH}${normalized}`;
}

