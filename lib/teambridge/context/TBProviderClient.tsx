'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { TBContext } from '../types';

const TBContextInternal = createContext<TBContext | null>(null);

interface TBProviderClientProps {
  context: TBContext;
  children: ReactNode;
}

/**
 * Client-side provider component that makes Teambridge context available
 * to all child components via the useTBContext hook.
 */
export function TBProviderClient({ context, children }: TBProviderClientProps) {
  return (
    <TBContextInternal.Provider value={context}>
      {children}
    </TBContextInternal.Provider>
  );
}

/**
 * Hook to access Teambridge context in client components.
 *
 * @throws Error if used outside of TBProvider
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { accountId, userId, user } = useTBContext();
 *   return <div>Hello, {user.name}!</div>;
 * }
 * ```
 */
export function useTBContext(): TBContext {
  const context = useContext(TBContextInternal);
  if (!context) {
    throw new Error('useTBContext must be used within a TBProvider');
  }
  return context;
}
