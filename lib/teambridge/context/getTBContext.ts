import { headers } from 'next/headers';
import type { TBContext } from '../types';

/**
 * Get Teambridge context in server components or API routes.
 *
 * This function reads the context from request headers that were
 * set by the Teambridge middleware.
 *
 * @example
 * ```tsx
 * // In a Server Component
 * import { getTBContext } from '@/lib/teambridge';
 *
 * export default async function Page() {
 *   const { accountId, user } = await getTBContext();
 *   return <div>Welcome, {user.name}!</div>;
 * }
 * ```
 *
 * @example
 * ```tsx
 * // In an API Route
 * import { getTBContext } from '@/lib/teambridge';
 *
 * export async function GET() {
 *   const { accountId, userId } = await getTBContext();
 *   // ... handle request
 * }
 * ```
 */
export async function getTBContext(): Promise<TBContext> {
  const headersList = await headers();

  const accountId = headersList.get('x-tb-account-id') || '';
  const userId = headersList.get('x-tb-user-id') || '';
  const userEmail = headersList.get('x-tb-user-email') || '';
  const userName = headersList.get('x-tb-user-name') || '';
  const userContext = headersList.get('x-user-context') || undefined;

  return {
    accountId,
    userId,
    user: {
      id: userId,
      email: userEmail,
      name: userName,
    },
    userContext,
  };
}
