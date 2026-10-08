import { handleTBUninstall } from '@/lib/teambridge';

export const POST = handleTBUninstall(
  { webhookSecret: process.env.TB_WEBHOOK_SECRET! },
  async (context) => {
    // TODO: Clean up data for this account
    // In production, remove from your database:
    //
    // await db.appInstallations.delete({
    //   where: { accountId: context.accountId },
    // });

    console.log(
      '[Teambridge] App uninstalled for account:',
      context.accountId
    );

    return { success: true };
  }
);
