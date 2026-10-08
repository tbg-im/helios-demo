import { headers } from 'next/headers';
import type { ReactNode } from 'react';
import { TBProviderClient } from './TBProviderClient';
import type { TBContext } from '../types';

interface TBProviderProps {
  children: ReactNode;
}

/**
 * Server component that extracts Teambridge context from request headers
 * and provides it to client components.
 *
 * Use this in your root layout to make context available throughout your app.
 *
 * @example
 * ```tsx
 * // app/layout.tsx
 * import { TBProvider } from '@/lib/teambridge';
 *
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         <TBProvider>{children}</TBProvider>
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 */
export async function TBProvider({ children }: TBProviderProps) {
  const headersList = await headers();

  const accountId = headersList.get('x-tb-account-id') || '';
  const userId = headersList.get('x-tb-user-id') || '';
  const userEmail = headersList.get('x-tb-user-email') || '';
  const userName = headersList.get('x-tb-user-name') || '';

  const context: TBContext = {
    accountId,
    userId,
    user: {
      id: userId,
      email: userEmail,
      name: userName,
    },
  };

  return <TBProviderClient context={context}>{children}</TBProviderClient>;
}
