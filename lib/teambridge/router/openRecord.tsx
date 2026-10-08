'use client';

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ComponentProps,
  type MouseEvent,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { tbPath } from '../url';

/**
 * Opening a Teambridge record's detail panel from inside an app.
 *
 * Apps do not build their own record detail modal — the Teambridge host owns
 * it. `?rid=<recordId>` on the app's own URL is what the host watches for:
 * `TBRouter` posts the app-local path *including the query string* to the
 * parent frame, the parent mirrors it into its own URL, and the host's record
 * detail container opens that record.
 *
 * The URL is changed with the History API rather than the router, because
 * nothing on the server reads `rid`. A `<Link>` or `router.push` to the same
 * route with a different query string is still a route navigation: Next
 * re-renders the whole page on the server (re-running every Teambridge read on
 * it) and only updates the URL once that commits, ~0.5s later, for an
 * identical page. Next keeps `useSearchParams` in sync with `pushState`, so
 * TBRouter still sees the change and tells the parent.
 *
 * Re-opening the same record clears `rid` first and sets it again, rather than
 * writing the same URL twice. Two things have to change for the panel to
 * reopen:
 *
 *  - TBRouter only tells the host about a path that *differs* from the last
 *    one it advertised, so writing an identical URL posts nothing.
 *  - The host only reacts when `rid` changes. Dismissing a panel by clicking
 *    away leaves the host still holding that `rid`, so a message carrying the
 *    same one is ignored. (Saving clears it, which is why "close by saving"
 *    and "close by clicking off" behave differently if you only test one.)
 *
 * Clearing and re-setting satisfies both, given two details:
 *
 *  - The two writes must land in separate React commits, or they coalesce and
 *    the cleared state is never advertised — hence `useCommitCount`.
 *  - The cleared URL carries a nonce (`ridClear`). Without it the cleared path
 *    can be character-for-character the path TBRouter last *received* from the
 *    host, which its echo suppression drops.
 *
 * Test any change here by opening, closing (both by saving and by clicking
 * away) and reopening the same record several times — including after the
 * component that holds the link has unmounted and remounted.
 */

/** True for a real collection record id (a UUID). Synthetic/draft ids have no panel to open. */
export function isRecordId(id: string | null | undefined): id is string {
  return (
    typeof id === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  );
}

/** Counts commits, so a handler can tell when React has rendered a URL change. */
function useCommitCount() {
  const commits = useRef(0);
  useEffect(() => {
    commits.current += 1;
  });
  return commits;
}

/** Resolves once React has committed a render past `seen`, plus one turn for its effects. */
async function waitForCommit(commits: { current: number }, seen: number, budgetMs = 250) {
  const deadline = Date.now() + budgetMs;
  while (commits.current === seen && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  await new Promise((resolve) => setTimeout(resolve, 0));
}

// Module-level, not component state: links unmount and remount freely (a list
// re-renders, a detail view opens), and a per-instance counter would restart
// and repeat a value the URL already carries.
let clearSequence = 0;
function nextClearToken(): string {
  clearSequence += 1;
  return `${Date.now().toString(36)}.${clearSequence}`;
}

/** `params` pointing at `recordId`, without our clear-step nonce. */
function withRid(params: URLSearchParams, recordId: string): URLSearchParams {
  params.delete('ridClear');
  params.set('rid', recordId);
  return params;
}

/**
 * Returns `openRecord(recordId)` and `hrefFor(recordId)`. Must render inside a
 * `<Suspense>` boundary (it reads `useSearchParams`); `TBRecordLink` already is.
 */
export function useOpenRecord() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const commits = useCommitCount();

  // A raw URL for history/anchors is not a Next routing primitive, so
  // basePath has to be applied by hand.
  const urlWith = useCallback(
    (params: URLSearchParams) => {
      const query = params.toString();
      return query ? `${tbPath(pathname)}?${query}` : tbPath(pathname);
    },
    [pathname]
  );

  const hrefFor = useCallback(
    (recordId: string) => urlWith(withRid(new URLSearchParams(searchParams.toString()), recordId)),
    [searchParams, urlWith]
  );

  const openRecord = useCallback(
    async (recordId: string) => {
      // Read the live location, not the hook: after the host has navigated
      // us, the hook can be a render behind.
      const current = new URLSearchParams(window.location.search);

      if (current.get('rid') === recordId) {
        current.delete('rid');
        current.set('ridClear', nextClearToken());
        const seen = commits.current;
        window.history.replaceState(null, '', urlWith(current));
        await waitForCommit(commits, seen);
      }

      // Re-read: the host may have navigated us while we waited.
      const next = withRid(new URLSearchParams(window.location.search), recordId);
      window.history.pushState(null, '', urlWith(next));
    },
    [commits, urlWith]
  );

  return { openRecord, hrefFor };
}

type TBRecordLinkProps = Omit<ComponentProps<'a'>, 'href'> & {
  recordId: string;
};

function TBRecordLinkInner({ recordId, onClick, children, ...props }: TBRecordLinkProps) {
  const { openRecord, hrefFor } = useOpenRecord();
  const href = useMemo(() => hrefFor(recordId), [hrefFor, recordId]);

  const handleClick = useCallback(
    (event: MouseEvent<HTMLAnchorElement>) => {
      onClick?.(event);
      if (event.defaultPrevented) return;
      // Leave cmd/ctrl/shift-click and middle-click to the browser.
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      event.preventDefault();
      // A row or card around the link often has its own click handler.
      event.stopPropagation();
      void openRecord(recordId);
    },
    [onClick, openRecord, recordId]
  );

  // `ref` is an ordinary prop in React 19, so it travels in `props`.
  return (
    <a href={href} onClick={handleClick} {...props}>
      {children}
    </a>
  );
}

/**
 * An anchor that opens a record in the Teambridge record detail panel.
 * Style it like any link, or wrap it: `<Button asChild><TBRecordLink …/></Button>`.
 *
 * @example
 *   <TBRecordLink recordId={shift.id} className="text-primary hover:underline">Open</TBRecordLink>
 */
export function TBRecordLink(props: TBRecordLinkProps) {
  return (
    <Suspense fallback={<span className={props.className}>{props.children}</span>}>
      <TBRecordLinkInner {...props} />
    </Suspense>
  );
}

/**
 * Re-renders the page after a record may have been edited in the host's
 * record detail panel. That panel writes straight to Teambridge, so none of
 * this app's write paths run and nothing re-reads — without this the page
 * keeps showing the values it was rendered with.
 *
 * Two signals, because neither covers both ways a panel is closed:
 *  - `rid` leaving the URL — the host clears it when a panel is *saved*.
 *  - The window regaining focus after a panel was opened — dismissing by
 *    clicking away does not clear `rid`, so focus returning to the iframe is
 *    the only signal left.
 *
 * Mount once in the root layout, inside `TBProvider`. Pass `onPanelClosed` to
 * also invalidate your own caches before the refresh.
 */
function TBRecordEditWatcherInner({ onPanelClosed }: { onPanelClosed?: () => void | Promise<void> }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const rid = searchParams.get('rid');
  const clearing = searchParams.has('ridClear');
  const panelWasOpened = useRef(false);
  const lastRefresh = useRef(0);

  const refresh = useCallback(async () => {
    // Throttled: focus fires readily, and each refresh is a real re-read.
    if (Date.now() - lastRefresh.current < 2_000) return;
    lastRefresh.current = Date.now();
    panelWasOpened.current = false;
    try {
      await onPanelClosed?.();
    } finally {
      router.refresh();
    }
  }, [onPanelClosed, router]);

  useEffect(() => {
    if (clearing) return;
    if (rid) {
      panelWasOpened.current = true;
    } else if (panelWasOpened.current) {
      void refresh();
    }
  }, [rid, clearing, refresh]);

  useEffect(() => {
    const onFocus = () => {
      if (panelWasOpened.current) void refresh();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refresh]);

  return null;
}

export function TBRecordEditWatcher(props: { onPanelClosed?: () => void | Promise<void> }) {
  return (
    <Suspense fallback={null}>
      <TBRecordEditWatcherInner {...props} />
    </Suspense>
  );
}
