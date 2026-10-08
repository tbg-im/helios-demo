# AGENTS.md

Guidance for AI coding agents (Claude Code, v0, Cursor, etc.) and human contributors working on apps built from this template.

## What this template is

A Next.js starter for apps embedded inside the Teambridge interface (iframe). All apps built from this template should look and feel like Teambridge by following the **Alloy design system** — replicated locally via Tailwind tokens + shadcn/ui (no runtime dependency on the Alloy package).

## ⚠️ Example code — replace before shipping a real app

These files exist only as a working demonstration of how to read Teambridge data and render it with the design system. Treat them as scaffolding to learn from, not a foundation to build on:

- `app/page.tsx` — sample shifts dashboard (file required by Next.js — replace its contents, don't delete the file)
- `app/create-shift-modal.tsx` — sample modal (delete or replace)
- `app/actions.ts` — sample server action (delete or replace)
- `app/schema.ts` — sample schema spec (replace with your app's collections and fields)

When the user starts building their actual app, **replace this content** before adding real features. Don't extend the demo — start fresh from these files.

The Teambridge integration in `lib/teambridge/`, the API route handlers in `app/api/teambridge/`, the layout in `app/layout.tsx`, the styling in `app/globals.css`, and the shadcn components in `components/ui/` are all part of the template and should be kept.

## Navigation & data fetching

Apps render inside the Teambridge proxy at `https://api.teambridge.com/apps/<slug>/…`. Next.js's `basePath` config (set in `next.config.ts` from the `APP_SLUG` env var) tells the framework about the prefix, so the routing primitives all handle it automatically — `<Link>`, `useRouter`, `redirect`, and `usePathname` from `next/link` and `next/navigation` work the way you'd expect, and you write app-local paths (`/dashboards/123`, not `/apps/<slug>/dashboards/123`).

```tsx
// ✓ on-template — write paths relative to your app, Next adds the prefix
import Link from 'next/link';
import { useRouter, redirect } from 'next/navigation';

const router = useRouter();
router.push('/dashboards/123');                // navigates to /apps/<slug>/dashboards/123
redirect('/dashboards/789');                   // server actions
<Link href="/reports/456">View report</Link>
```

**The one exception is `fetch`.** Native `fetch` doesn't honor `basePath`, so a bare `fetch('/api/dashboards')` hits `/api/dashboards` instead of `/apps/<slug>/api/dashboards` and 404s through the proxy. Use `tbFetch` from `@/lib/teambridge/fetch` for same-origin requests. ESLint will error on bare `fetch` calls.

```tsx
import { tbFetch } from '@/lib/teambridge/fetch';

await tbFetch('/api/dashboards');              // prepends /apps/<slug>
```

Import `tbFetch` (and `tbPath` / `TB_APP_BASE_PATH`) from their sub-paths rather than the top-level `@/lib/teambridge` barrel. The barrel also re-exports `TBProvider`, which imports `next/headers` and is server-only; pulling it into a Client Component's import graph trips Turbopack's server/client boundary check. Sub-path imports load only the helper itself.

In dev mode (`TB_DEV_MODE=true`), `basePath` is empty and `tbFetch` is a no-op — paths pass through unchanged. The prefix is derived at build time from `APP_SLUG` and inlined into the client bundle via `NEXT_PUBLIC_TB_APP_BASE_PATH` (also accessible via `import { TB_APP_BASE_PATH } from '@/lib/teambridge/url'`) for the rare cases where you need to construct a same-origin URL manually.

A few cases to be careful with manually:

- Raw `<a href="/foo">` and `<form action="/foo">` — `basePath` only applies to Next.js's own primitives. For native HTML, prepend the prefix yourself with `tbPath()` (imported from `@/lib/teambridge/url`) if the URL needs to be same-origin.
- Self-fetching your own route handlers from a server component. Don't; call the underlying logic directly instead (per [Vercel's guidance](https://vercel.com/blog/common-mistakes-with-the-next-js-app-router-and-how-to-fix-them)).
- `lib/teambridge/client/TBClient.ts` deliberately uses raw `fetch` — it talks to external Teambridge APIs at absolute URLs, not to your app's own routes.

## Living inside the Teambridge shell

The app is not a standalone site. It runs in an iframe inside the Teambridge web app (the "host" or "shell"), and the two share responsibilities:

| The host owns | The app owns |
|---|---|
| Global navigation, account switcher, breadcrumbs, sign-in | Its own pages and, if it has several, a section nav inside the iframe |
| The browser address bar (it mirrors the app's path and query) | Its app-local routes (`/`, `/reports/123?tab=open`) |
| **The record detail panel** for any Teambridge record | Deciding *when* to open one (`?rid=`) |
| Who the user is, and the signed `X-User-Context` | Passing that context to every user-scoped API call |

### URL sync and deep links

`TBRouter` (mounted in `app/layout.tsx`) posts every app-local path **including its query string** to the parent, which mirrors it into its own URL. When the user uses back and forward, or opens a deep link, the parent sends the path back down and `TBRouter` applies it with `router.replace`. So:

- Put view state that should survive a reload or a shared link (selected tab, filters, the open record) in the URL.
- `trailingSlash: true` in `next.config.ts` is required. Don't remove it.
- The URL is visible to the host, so never put secrets or personal data in it.

### Record detail: open the host's panel, don't build one

Teambridge already has a full record detail panel: every field, permissions, activity, and editing. **Never build your own record detail modal or page for a Teambridge record.** Open the host's instead by setting `?rid=<recordId>` on the app's URL. The host watches for it and opens that record.

Use the template's helpers, which handle the details that broke hand-written versions:

```tsx
import { TBRecordLink, useOpenRecord, isRecordId } from '@/lib/teambridge/router';

// A link: a real anchor, so hover shows the URL and cmd-click opens a new tab
<TBRecordLink recordId={shift.id} className="text-primary hover:underline">Open</TBRecordLink>

// On a shadcn button
<Button asChild variant="outline" size="sm"><TBRecordLink recordId={id}>View</TBRecordLink></Button>

// From a handler (e.g. a clickable table row)
const { openRecord } = useOpenRecord();
onClick={() => openRecord(record.id)}
```

What they get right, and what to watch if you ever change them:

- **History API, not `<Link>`.** A `<Link href="?rid=…">` or `router.push` is a route navigation: Next re-renders the whole page on the server, re-running every Teambridge read, and the URL only updates once that finishes (~0.5 s). Nothing on the server reads `rid`, so the helpers use `history.pushState`. Next keeps `useSearchParams` in sync, so `TBRouter` still tells the parent. Opening takes about 10 ms, with no network requests.
- **Reopening the same record.** The host only reacts when `rid` *changes*. Dismissing the panel by clicking away leaves the host holding the old `rid`, so the helpers clear it and set it again in two separate commits, with a nonce (`ridClear`) so `TBRouter`'s echo suppression doesn't drop the clear.
- **Only real ids.** Use `isRecordId()` to hide the control for drafts or synthetic ids the host can't find.
- **Refresh after edits.** The host panel writes straight to Teambridge, so none of the app's code runs. `TBRecordEditWatcher` (in the layout) calls `router.refresh()` when the panel closes. Pass it `onPanelClosed` to clear your own caches first.

**Test checklist for anything touching record detail.** Open a record, close it **by saving**, reopen it. Close it **by clicking away**, reopen it. Repeat several times. Then do it after the list holding the link has re-rendered or remounted (change a filter, switch tab), because a fix that works for repeated clicks can still fail after an unmount. This only works embedded in Teambridge. Standalone dev mode has no host, so say so rather than claiming it verified.

### Layout and in-app navigation

The iframe fills the host's content area, and the host provides the page chrome.

- No global nav, account switcher, app title bar, or breadcrumbs. Teambridge owns those.
- A multi-section app may have its **own section nav**. Put it on the left, keep it compact, and let the content scroll beside it:

```tsx
// app/layout.tsx, inside <TBProvider>
<div className="flex min-h-0 flex-col md:h-dvh md:flex-row">
  <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-border p-2
                  md:w-56 md:flex-col md:overflow-visible md:border-r md:border-b-0 md:p-3">
    {/* items: rounded-md px-2.5 py-2 text-sm, icon size-4, active = bg-accent font-medium */}
  </nav>
  <main className="min-w-0 flex-1 md:overflow-y-auto">{children}</main>
</div>
```

  - Width `w-56` (224 px). Don't go wider; the host's own sidebar already sits to the left of the iframe. Labels are one line (`whitespace-nowrap`); if they don't fit, shorten them.
  - `h-dvh` is the *iframe's* height, so the nav stays put and only `<main>` scrolls. Use `min-w-0` on `<main>` so wide tables scroll inside it instead of widening the page.
  - Below `md` the nav becomes a horizontal strip across the top. The iframe is often narrow.
  - Keep configuration (settings) at the foot of the nav, apart from the day-to-day sections.
- Default to full width. Constrain with a max width (e.g. `max-w-6xl`) only inside content containers, not at the page root.
- Don't set `min-h-screen` on the body or page roots. Page background is `bg-background`, not a colored hero.
- Give each route a `loading.tsx` (skeletons). Next prefetches it, so in-app navigations show the skeleton at once. The *first* load can't stream, because the proxy buffers the whole response, so that one just has to be fast. Wrap slow reads in a layout in their own `<Suspense>`, or they hold up every page.

### Error messages

The app lives inside Teambridge, so an error must never say the app "can't connect to Teambridge" or "can't reach your Teambridge account". To the user, they are *in* Teambridge. Say what couldn't load and what to do:

- ✓ "Couldn't load shifts. Try again, and if it keeps happening check the app's installation."
- ✓ "You don't have permission to edit this location."
- ✓ "This app needs a "Start Time" field on Shifts." (a setup notice, not an error)
- ✗ "Cannot connect to Teambridge account" / "Teambridge API error: 500 …"

Log the full `TBApiError` (status, path, body) with `console.error` on the server, and map it to a short message for the UI: 403 → permission, 404 → not found or removed, 400 → the values being saved.

## Design system rules

### Use shadcn primitives, not hand-rolled HTML

Buttons, inputs, dialogs, tables, alerts, etc. live in `components/ui/`. They're already styled to match Alloy. Reaching for raw `<button>` or `<input>` with custom Tailwind drifts off-system and forces inconsistency across apps.

```tsx
// ✓ on-system
import { Button } from '@/components/ui/button';
<Button>Save</Button>

// ✗ drift
<button className="bg-blue-600 px-4 py-2 rounded text-white">Save</button>
```

To add primitives the template doesn't already include:

```bash
npx shadcn@latest add <name>
```

Already installed: `alert`, `avatar`, `badge`, `button`, `card`, `checkbox`, `dialog`, `dropdown-menu`, `input`, `label`, `popover`, `radio-group`, `scroll-area`, `select`, `separator`, `skeleton`, `sonner`, `switch`, `table`, `tabs`, `textarea`, `tooltip`.

### Colors

Two namespaces, both already wired into Tailwind:

**Semantic aliases (preferred for surfaces and text)** — adapt to light/dark automatically:

| Class | Use for |
|---|---|
| `bg-background` / `text-foreground` | Page surface and primary text |
| `bg-card` / `text-card-foreground` | Card surface |
| `bg-popover` / `text-popover-foreground` | Floating menus, tooltips |
| `bg-primary` / `text-primary-foreground` | Primary action (Alloy blue) |
| `bg-secondary` / `text-secondary-foreground` | Secondary surface |
| `bg-muted` / `text-muted-foreground` | Recessed surface, supporting text |
| `bg-accent` / `text-accent-foreground` | Hover / selected state |
| `bg-destructive` / `text-destructive-foreground` | Destructive action (Alloy red) |
| `border-border`, `border-input`, `ring-ring` | Borders, input edges, focus ring |

**Alloy palette (for color accents — badges, charts, status tags)**:

`blue`, `azure`, `purple`, `pink`, `red`, `orange`, `yellow`, `matcha`, `green`, `slate`, `grey`/`gray`. Each has stops `50, 100, 150, 200, 300, 400, 500, 600, 700, 800, 850, 900, 950`. Examples: `bg-azure-500`, `text-matcha-700`, `border-purple-200`.

`gray` is aliased to Alloy `grey`. `gray-*` and `grey-*` resolve to the same value.

Do not introduce new hex values in component code. If you find a need for a color outside this palette, raise it — the design system needs to grow rather than be bypassed.

Direct CSS variable access for places where utilities aren't a fit: `var(--color-content-secondary)`, `var(--color-bg-tertiary)`, `var(--color-border-opaque)`, etc. (defined in `app/globals.css`).

### Spacing

4 px scale. Tailwind's defaults already match Alloy: `p-1` = 4 px, `p-2` = 8 px, `p-4` = 16 px. Stay on this scale; don't introduce arbitrary values like `px-[7px]`.

### Border radius

| Class | Value | Use |
|---|---|---|
| `rounded-button` | 6 px | Buttons, inputs, selects, textareas (Alloy convention) |
| `rounded-sm` | 4 px | Inset elements (menu items, etc.) |
| `rounded-md` | 8 px | General surfaces |
| `rounded-lg` | 12 px | Cards, dialogs, alerts |
| `rounded-xl` | 16 px | Large cards |
| `rounded-2xl` | 24 px | Hero surfaces |
| `rounded-full` | pill | Avatars, badges, switches, status dots |

### Shadows

Use `shadow-sm` / `shadow-md` / `shadow-lg` (mapped to Alloy `below-low` / `below-md` / `below-high`). For shadows projecting upward (toasts, bottom sheets), use `shadow-above-low` / `shadow-above-md` / `shadow-above-high`.

### Charts

Use the `Chart*` primitives from `components/ui/chart.tsx` (Recharts under the hood). Reference series colors via `var(--chart-1)` through `var(--chart-5)` in your `ChartConfig` — these map to Alloy's default chart palette (blue, green, yellow, red, purple). Don't reach for raw hex values or pick arbitrary palette stops.

### Typography

Geist (sans) and Geist Mono are the only sanctioned faces — already loaded via `next/font` in `app/layout.tsx`. Use `font-mono` for IDs / code, default sans everywhere else. Don't introduce other fonts.

Type scale: Tailwind defaults (`text-xs` 12 px → `text-7xl` 96 px) match Alloy.

### Icons

Use `lucide-react`. Import the **`Icon`-suffixed** names to match the convention shadcn uses internally:

```tsx
import { CalendarDaysIcon, UserIcon, AlertTriangleIcon } from 'lucide-react';

<UserIcon className="size-4 text-muted-foreground" />
```

Default size in shadcn buttons / alerts / badges is `size-4` (16 px). Use `size-3.5` inside small chips, `size-5` for prominent action icons.

Don't hand-roll inline `<svg>` icons — lucide covers the same coverage as Alloy's icon set.

### Dark mode

`.dark` class on `<html>` flips all semantic aliases automatically. Don't write `dark:` variants for surface colors — they're handled. Only add `dark:` overrides when a specific element needs different behavior than the semantic token implies (rare).

### Iframe context

See "Living inside the Teambridge shell → Layout and in-app navigation" above.

## Data access

All app data — shifts, users, jobs, placements, anything — lives in **collections** (custom data tables). Every read and write goes through the Unified Collections API: `client.collections.list()`, `client.collections.getFields(id)`, `client.collections.records.{list,get,create,update}`. The full canonical workflow with examples lives in README → "Using the API Client". The notes below cover gotchas that have tripped up agents in practice.

### API constraints

- **Page size limit**: the Teambridge API enforces a max of **50 records per page** (default 20). The template client forwards `pageSize` as the API's `size` query param; it does not clamp the value for you. Never request more than 50 in a single call. To fetch all records, loop with `pageSize: 50`, incrementing `page` (0-indexed), until either `data.length < 50` or you've consumed `totalCount`.

### User-scoped Teambridge clients

For user-scoped reads and writes in Server Components, Server Actions, and app API routes, pass the signed Teambridge user context into the OpenAPI client:

```ts
import { getTBClient, getTBContext } from '@/lib/teambridge';

export async function GET() {
  const { userContext } = await getTBContext();
  const client = getTBClient(userContext);
  // ...
}
```

Do **not** use a module-level singleton or plain `getTBClient()` for user-scoped collection operations. Embedded production requests include a signed `X-User-Context` header. `getTBContext()` reads that header on the server, and `getTBClient(userContext)` forwards it to OpenAPI so Teambridge evaluates collection access as the current embedded user. If you drop that context, the app can work locally but show empty or incorrectly scoped data in production.

Use `getTBContext()` only in Server Components, Server Actions, and app API routes; it depends on `next/headers`. In Client Components, read current account/user metadata through `TBProvider` and `useTBContext()`. Client Components should call your app's API routes with `tbFetch()` rather than instantiating `TBClient` directly.

### Large collection performance

Do not assume the first page is the full dataset. For data-heavy views, fetch and filter records in API routes, then return a paged response to the browser:

```ts
type PagedResponse<T> = {
  data: T[];
  page: number;
  size: number;
  totalCount: number;
  hasMore: boolean;
};
```

Recommended pattern:

- Scope records to the current Teambridge user before returning anything.
- Fetch records in batches of 50.
- Use page-based pagination with `page` and `pageSize`; this template's Teambridge client exposes those pagination inputs.
- Deduplicate records by `id` when querying multiple owner/user aliases.
- Enforce a max page cap and log when the cap is hit.
- Return only the requested browser page, even if the backend scanned more records to compute exact counts or search matches.

Search must also be backend-backed. Do not implement global or page-level search by filtering only the records currently loaded in the browser; that silently misses matches beyond the first 50 records. The client should send `search`, `page`, and `pageSize`; the API route should search the full current-user-scoped dataset and return `totalCount` / `hasMore`. If the app owns a database, use indexed database queries for search. If the app only uses Teambridge Collections, search in the API route after batched owner-scoped loading, with caching where appropriate.

Board views need special care: do not derive columns or counts from only the first loaded page. Return group metadata from the server, such as `{ key, label, count }`, or load cards per group/column with a per-column "Load more". Field options are fine for select-like columns such as status, role, or candidate status; dynamic groups such as state, client, facility, or owner need server-computed group counts.

Cache batched datasets carefully. Include owner/user scope, search, filters, archived flags, group-by fields, page size, and page in cache keys. Never cache unscoped collection results for user-specific views.

### Field mapping: declare it once, pin the ids

Records come back **keyed by field UUID**, and collections and fields are found by name. Don't scatter `fields.find(f => f.name === …)` through the code. Declare what the app uses in one schema file and resolve it once:

```ts
// app/schema.ts
import { defineSchema } from '@/lib/teambridge/schema';

export const schema = defineSchema({
  shifts: {
    name: 'Shifts',
    id: '6d1f…',                                   // pin once known
    fields: {
      start:    { name: 'Start Time', type: 'DATETIME', required: true, id: 'a41c…' },
      location: { name: 'Location', type: 'LINK_TO_LOCATION' },
    },
  },
});

// in a server component / action / route
const { accountId } = await getTBContext();
const resolved = await resolveSchema(getTBClient(), schema, { cacheKey: accountId });
if (!resolved.ready) { /* render a setup notice from resolved.issues */ }
const start = resolved.collections.shifts.fields.start; // Field | null
```

- **Names find things, ids keep them.** Admins rename fields ("Location" becomes "Facility"), and an app that matches names on every request breaks when they do. After the first run against the real account, copy the resolved ids into the spec. A pinned id wins, and the name stays as the fallback and the readable label. A rename then shows up as a non-blocking `renamed` issue, not an outage.
- **Names are not unique.** One collection can have two fields with the same name (e.g. a BOOLEAN and a MULTI_SELECT both called "Affiliate Vendor"). Give each spec a `type` so the resolver picks the right one. Otherwise which one you get depends on the order the API returns them in.
- **Use the exact name.** Look at the real field list rather than guessing: it is "Roles", not "role", and "Location", not "facility". A field that doesn't resolve is always `null`, so every read of it silently yields nothing. The resolver reports it instead.
- **Resolve with the app client** (`getTBClient()` with no user context) and cache by `accountId`. The schema is account structure, not user data. Never use `userContext` as a cache key: it is re-signed on every request, so nothing would ever hit.

### When a field or collection doesn't exist

Accounts differ, so plan for the one that lacks a field the app wants:

1. Mark it `required: true` only if the app truly can't work without it. Otherwise leave it optional and degrade the feature that uses it: hide the column, disable the action.
2. When `resolved.ready` is false, render a setup notice listing `resolved.issues` (see `SetupNotice` in `app/page.tsx`). Each message names the collection, field and type to add, so an admin can fix it without reading code.
3. When building, **tell the user** which fields their account is missing and what type each should be. Don't invent a substitute field, repurpose a similarly named one, or hard-code values. Creating the missing fields during app onboarding is planned, but not built yet.

### Collection name matching

Match by **exact, case-insensitive equality** — never `includes()` or other partial matching. Accounts often have additional collections whose names contain the substring you want (e.g. `"Shifts Group"`, `"Archived Users"`); a partial match grabs whichever appears first.

```ts
// ✓ Exact, case-insensitive
const shifts = collections.find((c) => c.name.toLowerCase() === 'shifts');

// ✗ Partial — silently picks "Shifts Group" or similar
const shifts = collections.find((c) => c.name.toLowerCase().includes('shift'));
```

### Record field mapping

Records come back **keyed by field UUID, not by semantic property name**. There is no `record.locationId` or `record.startTime` — only `record["<uuid>"]`. The workflow:

1. Fetch field definitions: `const fields = await client.collections.getFields(collectionId)`.
2. Look up each field by name (exact, case-insensitive): `const locationField = fields.find((f) => f.name.toLowerCase() === 'location')`.
3. Read the value via the field's `id`: `const locationId = locationField ? record[locationField.id] : null`.

```ts
// ✓ Look up the field, then index by its id
const fields = await client.collections.getFields(shiftsCollection.id);
const locationField = fields.find((f) => f.name.toLowerCase() === 'location');
const locationId = locationField ? record[locationField.id] : null;

// ✗ Records have no semantic keys — this is always undefined
const locationId = record.locationId;
```

**Reference fields** (e.g. `Location` on a Shift, `Assignee` linking to Users) store the **record ID** of the related record, not its display name. To render names, build a `recordId → name` map from the related collection and look up by ID at render time. Fetch only the ids you need (`records.get` per id, or a filter), not the whole related collection. The `app/page.tsx` demo does this for the Assignee column.

### Reading values

- **Links and selects come in several shapes.** Multi-selects and multi links read back as JSON arrays, single ones as a bare string, and some as a comma-joined string. Use `readIds(value)` from `@/lib/teambridge/schema`, which handles all three. Otherwise a multi-select silently resolves to nothing.
- **Some native link fields are missing from record responses.** For example, a user's Locations (`LINK_TO_LOCATION` on Users) may simply be absent from `records.get`/`records.list`, and the `/links/` endpoint returns 403 for app credentials. Read a user's locations with `client.users.getLocations(userId)` (needs `userContext`). A platform user id resolves to its Users-collection record with `client.users.get(userId)` → `recordId`.
- **Native system fields are not normal fields.** A user's access groups (`NATIVE_USER_ACCESS_GROUP_IDS`) look like a multi-select but support no filter operator. Read them and filter in the route (see Filtering).
- If a value you expect is `undefined`, check that the field resolved and that it is actually present in the response before rewriting the reading code. Log one raw record (`console.log(JSON.stringify(record))`) to see.

### Filtering

Filter on the server with `filters`, never over a page you already loaded:

```ts
await client.collections.records.list(shifts.id, {
  pageSize: 50,
  filters: {
    [`${start.id}_gte`]: weekStart.toISOString(),
    [`${location.id}_is`]: locationId,
  },
});
```

| Field type | Operators |
|---|---|
| TEXT, EMAIL, PHONE | `_is`, `_contains` |
| NUMBER, DATETIME | `_is`, `_gt`, `_gte`, `_lt`, `_lte` |
| BOOLEAN | `_is` |
| SINGLE_SELECT, MULTI_SELECT (custom) | `_is` with the option **name**, case-insensitive; a multi-select matches if any option does |
| LINK_TO_* / linked records | `_is` with the linked record's id |

- Keys are `{fieldUUID}_{op}`, never the field name. Up to 10 filters, combined with AND. There is **no OR** (e.g. first name OR last name takes one request per field) and **no sort parameter**, so sort in the route.
- **Not filterable:** COMPUTED fields (Created At, etc.), native system selects (they report as `SINGLE_SELECT` just like custom ones, so you can't tell from the field list), native system fields such as access groups, and ADDRESS, FILE, GEOFENCE, AGGREGATE, DATETIME_RANGE.
- **A bad filter isn't always an error.** An unsupported field type returns 400 `UNSUPPORTED_FIELD_TYPE`, but an **operator that doesn't exist** (`_in`, `_has`, `_includes`) is accepted and **silently ignored**, returning everything. Use only the operators above, and the first time you filter on a field, check that `totalCount` actually dropped. If a field can't be filtered, narrow with the filters that do work, then filter the rest in the API route, paging with `listAll`.

### Writing values

Encode every write with `toWriteValue(field, value)` from `@/lib/teambridge/schema`. It follows the field's `writeFormatHint` and type:

- **`readOnly` fields can't be written.** A native Status, for example. Writing one is often an unhelpful 500. `toWriteValue` throws first, with a clear message.
- **`comma_separated_uuids`** (multi links such as a user's Locations or Roles) takes a single string `"id1,id2"`, **not** an array. A one-element array happens to work, so the bug only appears with two or more ids. Clear it with `null`, not `''`.
- **DATETIME** needs a timezone: an ISO string ending in `Z` or an offset. Convert `<input type="datetime-local">` values **in the browser** (`new Date(v).toISOString()`), where the user's timezone is known. The server would read them in its own zone.
- `update` sends only the fields you pass. Don't round-trip a whole record back.

### Performance

Every Teambridge read is a network round trip from the app server, and the host adds its own boot time before the iframe even loads. Budget accordingly:

- **The proxy times out at 30 seconds** and returns a 504, which the host shows as a failed load. It also buffers the response, so nothing paints until the whole page is ready. By the time the iframe loads, the host has already spent seconds booting, so the app's own render must stay far from that limit.
- **Rate limit: 720 requests/minute per app client**, shared by every user and every render. A full scan of a 2,000-user collection is 40+ requests.
- **Never full-scan big collections** (Users, Shifts, Locations) per render, and never inside a per-record loop. Filter server-side, fetch related records by id, or build lookup maps once per request.
- `listAll(collectionId, { filters, maxPages })` pages 50 at a time, a few pages at once, and stops at `maxPages` (default 20) with a warning. If you hit the cap, the view needs a filter or paging, not a higher cap.
- **Share work within a request.** Don't construct a separate client and schema lookup in every function. The token cache is module-wide (one token request per client, however many `TBClient`s you create), and `resolveSchema` is cached per account.
- **Cache keys use `userId`, not `userContext`.** The signed context rotates every request, so keying on it means nothing is ever cached. Include every input that scopes the result: user, filters, page, search.
- **Next's Data Cache rejects items over 2 MB.** Cache projected rows (just the fields you render), not raw API records.
- **Keep payloads small.** Everything passed from a server component to a client component is serialized into the page. Pass the rows on screen, not 90 days of records for a nudge that shows three.

### Errors

- **Never swallow Teambridge errors.** A `try { … } catch { return [] }` around a read or write turns a 403 or 400 into "no data" or "nothing happened", and that sends debugging down the wrong path. Catch at the edge (the route, action or page), `console.error` the `TBApiError`, and show a specific message (see "Error messages" above).
- `TBApiError` has `status`, `path` and `body`. The body usually names the bad field or format. Read it before changing code.
- When a write "does nothing", first log the exact request body and the response. The usual causes are, in order: wrong encoding (`toWriteValue`), a read-only field, a field that didn't resolve (`undefined` key), and a permission error that was caught and ignored.

## Project structure

```
app/
  layout.tsx          # Root layout, TBProvider wired in
  page.tsx            # ⚠ Example — replace
  schema.ts           # ⚠ Example — your app's collections + fields
  globals.css         # Alloy tokens + Tailwind theme bridge — keep
  api/teambridge/
    install/route.ts  # Lifecycle webhook
    uninstall/route.ts
components/ui/        # shadcn primitives (own them, edit freely)
lib/
  teambridge/         # Teambridge integration — keep
    client/           # TBClient (token cache, filters, listAll, TBApiError)
    schema.ts         # defineSchema / resolveSchema / toWriteValue / readIds
    router/           # TBRouter (URL sync), TBRecordLink / useOpenRecord / TBRecordEditWatcher
    fetch.ts, url.ts  # tbFetch / tbPath for the /apps/<slug> base path
  utils.ts            # cn() helper
middleware.ts         # Request validation
```

## Common mistakes to avoid

- Adding hex colors or `text-[#...]` arbitrary values. Use the tokens.
- Using `<button>` / `<input>` directly instead of shadcn's `Button` / `Input`.
- Importing fonts other than Geist.
- Editing `app/globals.css` to inject app-specific colors. Extend the Alloy palette there only with semantic justification.
- Treating `app/page.tsx` as the starting point of a real app instead of replacing it.
- Adding `dark:` variants for surface colors that the semantic tokens already handle.
- Setting `min-h-screen` on root containers (breaks iframe sizing).
- Building a record detail modal, or opening one with `<Link href="?rid=…">`. Use `TBRecordLink` / `useOpenRecord`.
- Matching collections or fields by name on every request instead of resolving a schema once and pinning ids.
- Filtering or searching over a loaded page in JS when the API can filter, or full-scanning Users/Shifts/Locations per render.
- Writing multi links as arrays, datetimes without a timezone, or read-only fields.
- Catching Teambridge errors and returning empty data.
- Error copy that says the app can't connect to Teambridge.
- Using `userContext` in a cache key.

## When in doubt

If a component or pattern doesn't have a shadcn equivalent already in this template, prefer composing it from existing primitives over reaching for new dependencies. When stuck on visual choices, lean on the semantic tokens (`bg-muted`, `text-muted-foreground`, etc.) — they're calibrated to match Alloy without you needing to remember the exact values.
