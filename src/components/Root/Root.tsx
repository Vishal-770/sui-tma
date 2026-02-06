'use client';

import { type PropsWithChildren } from 'react';
import {
  miniApp,
  useLaunchParams,
  useSignal,
} from '@tma.js/sdk-react';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ErrorPage } from '@/components/ErrorPage';
import { AuthProvider } from '@/contexts/AuthContext';
import { useDidMount } from '@/hooks/useDidMount';

import './styles.css';

function RootInner({ children }: PropsWithChildren) {
  return (
    <AuthProvider>
      <div className="app-root">
        {children}
      </div>
    </AuthProvider>
  );
}

export function Root(props: PropsWithChildren) {
  // Unfortunately, Telegram Mini Apps does not allow us to use all features of
  // the Server Side Rendering. That's why we are showing loader on the server
  // side.
  const didMount = useDidMount();

  return didMount ? (
    <ErrorBoundary fallback={ErrorPage}>
      <RootInner {...props} />
    </ErrorBoundary>
  ) : (
    <div className="root__loading">
      <div className="root__loading-spinner" />
      <span>Loading...</span>
    </div>
  );
}
