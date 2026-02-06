'use client';

import { PropsWithChildren } from 'react';
import { AuthProvider } from '@/contexts/AuthContext';
import { DappKitProvider } from '@/components/DappKitProvider';

export function Providers({ children }: PropsWithChildren) {
  return (
    <DappKitProvider>
      <AuthProvider>
        {children}
      </AuthProvider>
    </DappKitProvider>
  );
}
