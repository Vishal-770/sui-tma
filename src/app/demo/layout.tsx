'use client';

import { PropsWithChildren } from 'react';
import { DappKitProvider } from '@/components/DappKitProvider';
import { ConnectButton, useCurrentAccount } from '@mysten/dapp-kit';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';

function WalletStatus() {
  const { isAuthenticated, session } = useAuth();
  const dappKitAccount = useCurrentAccount();

  // Show zkLogin status if authenticated via zkLogin
  if (isAuthenticated && session?.zkLoginAddress) {
    return (
      <div className="flex items-center gap-3">
        <div className="px-4 py-2 bg-sky-500/10 border border-sky-500/30 rounded-lg flex items-center gap-2">
          <div className="w-2 h-2 bg-sky-400 rounded-full" />
          <span className="text-sky-400 text-sm font-medium">zkLogin</span>
          <span className="text-gray-400 text-sm font-mono">
            {session.zkLoginAddress.slice(0, 6)}...{session.zkLoginAddress.slice(-4)}
          </span>
        </div>
        <Link 
          href="/dashboard" 
          className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition-colors"
        >
          Dashboard
        </Link>
      </div>
    );
  }

  // Show dapp-kit wallet if connected
  if (dappKitAccount) {
    return (
      <div className="flex items-center gap-3">
        <ConnectButton />
        <Link 
          href="/login" 
          className="px-3 py-2 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 rounded-lg text-sm text-sky-400 transition-colors"
        >
          Use zkLogin
        </Link>
      </div>
    );
  }

  // Show both connection options
  return (
    <div className="flex items-center gap-3">
      <ConnectButton />
      <span className="text-gray-600 text-sm">or</span>
      <Link 
        href="/login" 
        className="px-4 py-2 bg-sky-500 hover:bg-sky-400 rounded-lg text-sm text-white font-medium transition-colors"
      >
        Sign in with Google
      </Link>
    </div>
  );
}

export default function DemoLayout({ children }: PropsWithChildren) {
  return (
    <DappKitProvider>
      {/* Fixed Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-black/95 backdrop-blur-sm border-b border-gray-800/50">
        <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between">
          <Link href="/demo" className="flex items-center gap-2.5 text-white font-semibold hover:text-sky-400 transition-colors">
            <div className="w-8 h-8 bg-sky-500 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-base">SuiTrader</span>
          </Link>
          <WalletStatus />
        </div>
      </header>
      {/* Content with top padding for fixed header */}
      <main className="pt-16 min-h-screen bg-black flex flex-col items-center">
        <div className="w-full">
          {children}
        </div>
      </main>
    </DappKitProvider>
  );
}
