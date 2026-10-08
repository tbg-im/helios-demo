'use client';

import { Suspense, useEffect, useMemo, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type IncomingMessage = { type: 'tb:navigate-to'; path: string };

function isValidIncoming(data: unknown): data is IncomingMessage {
  if (!data || typeof data !== 'object') return false;
  const m = data as { type?: unknown; path?: unknown };
  return (
    m.type === 'tb:navigate-to' &&
    typeof m.path === 'string' &&
    m.path.startsWith('/')
  );
}

function TBRouterInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Parent origin isn't known at boot; captured from the first message received
  // from window.parent and used as targetOrigin for subsequent posts.
  const parentOriginRef = useRef<string | null>(null);
  // The most recent app-local path applied via tb:navigate-to. Used to suppress
  // the echo when usePathname/useSearchParams re-fire as a result of
  // router.replace().
  const lastReceivedPathRef = useRef<string | null>(null);
  const hasWarnedTrailingSlashRef = useRef(false);

  // App-local form (no `/apps/<slug>` prefix). With Next's `basePath` set,
  // `usePathname()` already returns the app-local pathname, so no stripping
  // is needed. The parent prepends its own mount prefix on receive.
  const advertisedPath = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('_session');
    const search = params.toString();
    return search ? `${pathname}?${search}` : pathname;
  }, [pathname, searchParams]);

  useEffect(() => {
    if (typeof window === 'undefined' || window.parent === window) return;
    if (advertisedPath === lastReceivedPathRef.current) return;
    const target = parentOriginRef.current ?? '*';
    window.parent.postMessage(
      { type: 'tb:navigate', path: advertisedPath },
      target
    );
  }, [advertisedPath]);

  useEffect(() => {
    if (typeof window === 'undefined' || window.parent === window) return;

    const handler = (event: MessageEvent) => {
      if (event.source !== window.parent) return;
      if (!isValidIncoming(event.data)) return;

      if (!parentOriginRef.current) {
        parentOriginRef.current = event.origin;
      }

      if (event.data.path === advertisedPath) return;
      lastReceivedPathRef.current = event.data.path;
      // Incoming is app-local; with Next's `basePath` set to `/apps/<slug>`,
      // `router.replace` expects the app-local form and prepends the prefix
      // internally.
      router.replace(event.data.path);
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [advertisedPath, router]);

  useEffect(() => {
    if (typeof window === 'undefined' || window.parent === window) return;
    window.parent.postMessage({ type: 'tb:ready' }, '*');
  }, []);

  // Detect missing `trailingSlash: true` in next.config. With it set, every
  // page path ends in `/`; without it, none do. The proxy serves this app at
  // `/apps/<slug>/`, so a no-slash pathname is a reliable signal that the
  // config is wrong and URL sync will drift.
  useEffect(() => {
    if (typeof window === 'undefined' || window.parent === window) return;
    if (hasWarnedTrailingSlashRef.current) return;
    if (!pathname.endsWith('/')) {
      hasWarnedTrailingSlashRef.current = true;
      console.error(
        `[Teambridge SDK] usePathname() returned \`${pathname}\` (no trailing slash). ` +
          'URL sync with the Teambridge admin requires `trailingSlash: true` in your ' +
          'next.config.ts — without it the parent URL bar and the iframe URL will drift apart ' +
          'on every navigation, and any relative `<Link href="./...">` targets will resolve incorrectly.'
      );
    }
  }, [pathname]);

  return null;
}

/**
 * Syncs the iframe's URL with the parent Teambridge admin browser URL via
 * postMessage. Mount once near the root (inside `TBProvider`).
 *
 * Behavior:
 * - In-app navigations (Next.js router pushes, Link clicks) are reflected
 *   in the parent's address bar, enabling deep links and browser back/forward.
 * - Parent-initiated changes (browser back/forward from outside the iframe)
 *   are applied here via `router.replace()`.
 * - When standalone (not embedded in an iframe), this component is a no-op.
 *
 * Requires `trailingSlash: true` in `next.config.ts`.
 */
export function TBRouter() {
  return (
    <Suspense fallback={null}>
      <TBRouterInner />
    </Suspense>
  );
}
