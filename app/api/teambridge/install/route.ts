import { handleTBInstall } from '@/lib/teambridge';

export const POST = handleTBInstall(
  { webhookSecret: process.env.TB_WEBHOOK_SECRET! },
  async (context) => {
    // TODO: Store the API token for this account
    // In production, save to your database:
    //
    // await db.appInstallations.create({
    //   accountId: context.accountId,
    //   apiToken: context.apiToken,
    //   apiBaseUrl: context.apiBaseUrl,
    // });

    console.log('[Teambridge] App installed for account:', context.accountId);
    console.log('[Teambridge] API Token received (store securely!)');

    return { success: true };
  }
);
