/**
 * Context extracted from Teambridge proxy headers
 */
export interface TBContext {
  /** UUID of the current account */
  accountId: string;
  /** UUID of the requesting user */
  userId: string;
  /** Current user information */
  user: TBUser;
  /** Signed X-User-Context header value to forward to the Open API */
  userContext?: string;
}

/**
 * User information from Teambridge headers
 */
export interface TBUser {
  id: string;
  email: string;
  name: string;
}

/**
 * Headers sent by Teambridge proxy
 */
export interface TBHeaders {
  'x-tb-account-id': string;
  'x-tb-user-id': string;
  'x-tb-user-email': string;
  'x-tb-user-name': string;
  'x-tb-timestamp': string;
  'x-tb-signature': string;
}

/**
 * Middleware configuration options
 */
export interface TBMiddlewareConfig {
  /** Webhook secret for HMAC signature validation */
  webhookSecret: string;
  /** Maximum age of request in seconds (default: 300) */
  maxRequestAge?: number;
}

/**
 * Install webhook payload from Teambridge
 */
export interface TBInstallPayload {
  /** UUID of the account installing the app */
  accountId: string;
  /** API token for making calls to Teambridge */
  apiToken: string;
  /** Base URL for Teambridge API */
  apiBaseUrl: string;
}

/**
 * Uninstall webhook payload from Teambridge
 */
export interface TBUninstallPayload {
  /** UUID of the account uninstalling the app */
  accountId: string;
}

/**
 * Handler configuration for lifecycle webhooks
 */
export interface TBHandlerConfig {
  /** Webhook secret for HMAC signature validation */
  webhookSecret: string;
}

/**
 * Install handler context passed to the callback
 */
export type TBInstallContext = TBInstallPayload;

/**
 * Uninstall handler context passed to the callback
 */
export type TBUninstallContext = TBUninstallPayload;
