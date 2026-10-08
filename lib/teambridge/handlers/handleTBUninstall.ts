import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import type {
  TBHandlerConfig,
  TBUninstallPayload,
  TBUninstallContext,
} from '../types';

/**
 * Validates the webhook signature from Teambridge
 */
function validateWebhookSignature(
  webhookSecret: string,
  timestamp: string,
  body: string,
  signature: string
): boolean {
  const message = `${timestamp}.${body}`;
  const expectedSignature = createHmac('sha256', webhookSecret)
    .update(message)
    .digest('hex');

  try {
    return timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

/**
 * Creates a handler for the Teambridge uninstall webhook.
 *
 * This handler validates the webhook signature and calls your callback
 * with the uninstallation context (accountId).
 *
 * @example
 * ```ts
 * // app/api/teambridge/uninstall/route.ts
 * import { handleTBUninstall } from '@/lib/teambridge';
 *
 * export const POST = handleTBUninstall(
 *   { webhookSecret: process.env.TB_WEBHOOK_SECRET! },
 *   async (context) => {
 *     // Clean up data for this account
 *     await db.appInstallations.delete({
 *       where: { accountId: context.accountId },
 *     });
 *
 *     return { success: true };
 *   }
 * );
 * ```
 */
export function handleTBUninstall(
  config: TBHandlerConfig,
  callback: (
    context: TBUninstallContext
  ) => Promise<{ success: boolean; error?: string }>
) {
  return async function handler(request: Request) {
    try {
      const timestamp = request.headers.get('x-tb-timestamp');
      const signature = request.headers.get('x-tb-signature');

      if (!timestamp || !signature) {
        return NextResponse.json(
          { success: false, error: 'Missing required headers' },
          { status: 401 }
        );
      }

      const bodyText = await request.text();

      // Validate signature
      if (
        !validateWebhookSignature(
          config.webhookSecret,
          timestamp,
          bodyText,
          signature
        )
      ) {
        return NextResponse.json(
          { success: false, error: 'Invalid signature' },
          { status: 401 }
        );
      }

      const payload: TBUninstallPayload = JSON.parse(bodyText);

      // Validate required fields
      if (!payload.accountId) {
        return NextResponse.json(
          { success: false, error: 'Invalid payload' },
          { status: 400 }
        );
      }

      // Call the user's callback
      const result = await callback({
        accountId: payload.accountId,
      });

      return NextResponse.json(result, {
        status: result.success ? 200 : 500,
      });
    } catch (error) {
      console.error('[Teambridge] Uninstall handler error:', error);
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: 500 }
      );
    }
  };
}
