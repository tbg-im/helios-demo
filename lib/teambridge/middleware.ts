import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { TBMiddlewareConfig } from './types';

/**
 * Credentials for a specific account
 */
export interface TBAccountCredentials {
  clientId: string;
  clientSecret: string;
}


/**
 * Read the app's OAuth2 client credentials from environment variables.
 * Returns null when either TB_CLIENT_ID or TB_CLIENT_SECRET is missing.
 */
export function getCredentialsForAccount(): TBAccountCredentials | null {
  const clientId = process.env.TB_CLIENT_ID;
  const clientSecret = process.env.TB_CLIENT_SECRET;

  if (clientId && clientSecret) {
    return { clientId, clientSecret };
  }

  return null;
}

const TB_HEADER_ACCOUNT_ID = 'X-TB-Account-Id';
const TB_HEADER_USER_ID = 'X-TB-User-Id';
const TB_HEADER_USER_EMAIL = 'X-TB-User-Email';
const TB_HEADER_USER_NAME = 'X-TB-User-Name';
const TB_HEADER_TIMESTAMP = 'X-TB-Timestamp';
const TB_HEADER_SIGNATURE = 'X-TB-Signature';
const TB_HEADER_USER_CONTEXT = 'X-User-Context';

/**
 * Get fallback context from environment variables (used when TB headers are missing)
 */
function getFallbackContext() {
  return {
    accountId: process.env.TB_DEV_ACCOUNT_ID || '',
    userId: process.env.TB_DEV_USER_ID || '',
    userEmail: process.env.TB_DEV_USER_EMAIL || 'test@teambridge.com',
    userName: process.env.TB_DEV_USER_NAME || 'Test User',
  };
}

/**
 * Convert Uint8Array to hex string
 */
function uint8ArrayToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Timing-safe comparison of two strings
 */
function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const aBytes = new TextEncoder().encode(a);
  const bBytes = new TextEncoder().encode(b);
  let result = 0;
  for (let i = 0; i < aBytes.length; i++) {
    result |= aBytes[i] ^ bBytes[i];
  }
  return result === 0;
}

/**
 * Validate HMAC signature from Teambridge using Web Crypto API
 */
async function validateSignature(
  webhookSecret: string,
  timestamp: string,
  accountId: string,
  userId: string,
  path: string,
  signature: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(webhookSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  // zserver's path canonicalization for signing has historically stripped
  // trailing slashes, but that's not guaranteed — accept either form so
  // a mismatch on that single byte doesn't 401 an otherwise-valid request.
  const withoutSlash =
    path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
  const withSlash = path.endsWith('/') ? path : `${path}/`;
  const variants = withoutSlash === withSlash ? [path] : [withoutSlash, withSlash];

  for (const variant of variants) {
    const message = `${timestamp}.${accountId}.${userId}.${variant}`;
    const signatureBuffer = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(message)
    );
    const expectedSignature = `sha256=${uint8ArrayToHex(new Uint8Array(signatureBuffer))}`;
    if (timingSafeCompare(signature, expectedSignature)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if the request is too old (replay attack prevention)
 */
function isRequestTooOld(timestamp: string, maxAge: number): boolean {
  const requestTime = parseInt(timestamp, 10);
  const now = Math.floor(Date.now() / 1000);
  return now - requestTime > maxAge;
}

/**
 * Creates Teambridge middleware for Next.js
 *
 * This middleware validates incoming requests from the Teambridge proxy
 * and extracts user/account context from headers.
 *
 * If Teambridge headers are present, it validates the signature and uses them.
 * If headers are missing, it falls back to environment variables (dev mode).
 */
export function tbMiddleware(config: TBMiddlewareConfig) {
  const { webhookSecret, maxRequestAge = 300 } = config;

  return async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Check for Teambridge headers
    const accountId = request.headers.get(TB_HEADER_ACCOUNT_ID);
    const userId = request.headers.get(TB_HEADER_USER_ID);
    const userEmail = request.headers.get(TB_HEADER_USER_EMAIL);
    const userName = request.headers.get(TB_HEADER_USER_NAME);
    const timestamp = request.headers.get(TB_HEADER_TIMESTAMP);
    const signature = request.headers.get(TB_HEADER_SIGNATURE);
    const userContext = request.headers.get(TB_HEADER_USER_CONTEXT);

    // Check if we have the required Teambridge headers
    const hasTeambridgeHeaders = accountId && userId && timestamp && signature;

    if (hasTeambridgeHeaders) {
      // Production mode: validate signature from Teambridge proxy
      
      // Check request age (prevent replay attacks)
      if (isRequestTooOld(timestamp, maxRequestAge)) {
        return new NextResponse('Unauthorized: Request too old', {
          status: 401,
        });
      }

      // Validate signature
      const isValid = await validateSignature(
        webhookSecret,
        timestamp,
        accountId,
        userId,
        pathname,
        signature
      );

      if (!isValid) {
        return new NextResponse('Unauthorized: Invalid signature', {
          status: 401,
        });
      }

      // Request is valid, continue with Teambridge headers
      const response = NextResponse.next();
      response.headers.set(TB_HEADER_ACCOUNT_ID, accountId);
      response.headers.set(TB_HEADER_USER_ID, userId);
      response.headers.set(TB_HEADER_USER_EMAIL, userEmail || '');
      response.headers.set(TB_HEADER_USER_NAME, userName || '');
      if (userContext) {
        response.headers.set(TB_HEADER_USER_CONTEXT, userContext);
      }
      return response;
    }

    // In production, require a valid Teambridge signature — no fallback.
    if (process.env.VERCEL_ENV === 'production') {
      return new NextResponse('Unauthorized: Missing Teambridge signature', {
        status: 401,
      });
    }

    // Fallback mode: no Teambridge headers, use environment variables
    const fallbackContext = getFallbackContext();

    if (!fallbackContext.accountId || !fallbackContext.userId) {
      console.warn(
        '[Teambridge] No TB headers found and TB_DEV_ACCOUNT_ID or TB_DEV_USER_ID not set'
      );
    }

    const response = NextResponse.next();
    response.headers.set(TB_HEADER_ACCOUNT_ID, fallbackContext.accountId);
    response.headers.set(TB_HEADER_USER_ID, fallbackContext.userId);
    response.headers.set(TB_HEADER_USER_EMAIL, fallbackContext.userEmail);
    response.headers.set(TB_HEADER_USER_NAME, fallbackContext.userName);
    return response;
  };
}
