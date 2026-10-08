// Types
export type {
  TBContext,
  TBUser,
  TBHeaders,
  TBMiddlewareConfig,
  TBInstallPayload,
  TBUninstallPayload,
  TBHandlerConfig,
  TBInstallContext,
  TBUninstallContext,
} from './types';

// Middleware
export {
  tbMiddleware,
  getCredentialsForAccount,
} from './middleware';
export type { TBAccountCredentials } from './middleware';

// Context
export { TBProvider, useTBContext, getTBContext } from './context';

// Router (URL sync with parent iframe host, host record detail panel)
export { TBRouter, TBRecordLink, TBRecordEditWatcher, useOpenRecord, isRecordId } from './router';

// Client
export { TBClient, TBApiError, getTBClient } from './client';
export type {
  TBClientConfig,
  PaginationOptions,
  ListRecordsOptions,
  ListAllRecordsOptions,
  RecordFilters,
  PaginatedResponse,
  Collection,
  Field,
  DataRecord,
  Shift,
  CreateShiftRequest,
  ShiftTimestamp,
  Placement,
  CreatePlacementRequest,
  User,
  CreateUserRequest,
  UserLookupQuery,
  Job,
  CreateJobRequest,
  Location,
  Timezone,
  Document,
  DocumentUploadOptions,
} from './client';

// Handlers
export { handleTBInstall, handleTBUninstall } from './handlers';

// URL + fetch helpers live at their own sub-paths so they're importable from
// Client Components without pulling the rest of the barrel — which includes
// `TBProvider` (uses `next/headers`) and would trip the server/client
// boundary if reached from a `'use client'` module. Import directly:
//
//   import { tbFetch } from '@/lib/teambridge/fetch';
//   import { tbPath, TB_APP_BASE_PATH } from '@/lib/teambridge/url';
//
// Routing primitives (`<Link>`, `useRouter`, `redirect`, `usePathname`) all
// handle the /apps/<slug> prefix natively via Next.js's `basePath` config —
// apps should import them from `next/link` and `next/navigation` directly.
// Native `fetch` is the one exception, since it doesn't honor basePath; use
// `tbFetch` for same-origin requests.
