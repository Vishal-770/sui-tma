'use client';

import Link from 'next/link';
import { useCurrentAccount } from '@mysten/dapp-kit';
import { useAuth } from '@/contexts/AuthContext';

const demos = [
  {
    title: 'Flash Arbitrage',
    description: 'Execute atomic flash loan arbitrage across DeepBook pools with zero upfront capital.',
    href: '/demo/flash-arbitrage',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    title: 'Margin Trading',
    description: 'Trade with up to 20x leverage using DeepBook liquidity with automatic liquidation protection.',
    href: '/demo/margin-trading',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
      </svg>
    ),
  },
  {
    title: 'Limit Orders',
    description: 'Set encrypted conditional orders with stop-loss and take-profit triggers.',
    href: '/demo/limit-orders',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
];

export default function DemoHubPage() {
  const dappKitAccount = useCurrentAccount();
  const { isAuthenticated, session } = useAuth();
  
  const isConnected = isAuthenticated || !!dappKitAccount;
  const walletAddress = session?.zkLoginAddress || dappKitAccount?.address;

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Header */}
        <div className="mb-8 sm:mb-12">
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
            DeFi Trading
          </h1>
          <p className="text-gray-400 text-base sm:text-lg">
            Advanced trading tools powered by encrypted intents
          </p>
        </div>

        {/* Connection Status */}
        <div className={`mb-8 p-4 sm:p-5 rounded-xl border ${
          isConnected 
            ? 'bg-sky-500/5 border-sky-500/20' 
            : 'bg-gray-900/50 border-gray-800'
        }`}>
          <div className="flex items-center gap-3 sm:gap-4">
            <div className={`w-3 h-3 rounded-full flex-shrink-0 ${isConnected ? 'bg-sky-400' : 'bg-gray-600'}`} />
            <div className="flex-1 min-w-0">
              <p className={`text-sm sm:text-base font-medium ${isConnected ? 'text-sky-400' : 'text-gray-400'}`}>
                {isConnected ? 'Wallet Connected' : 'No Wallet Connected'}
              </p>
              {walletAddress && (
                <p className="text-xs sm:text-sm text-gray-500 font-mono mt-1 truncate">
                  {walletAddress}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Trading Modules */}
        <div className="space-y-4 mb-8">
          {demos.map((demo, i) => (
            <Link key={i} href={demo.href} className="block group">
              <div className="p-4 sm:p-6 bg-gray-900/50 hover:bg-gray-900 border border-gray-800 hover:border-sky-500/40 rounded-xl transition-all duration-200">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-sky-500/10 border border-sky-500/20 rounded-lg flex items-center justify-center text-sky-400 flex-shrink-0">
                    {demo.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="text-base sm:text-lg font-semibold text-white group-hover:text-sky-400 transition-colors">
                        {demo.title}
                      </h3>
                      <svg className="w-5 h-5 text-gray-600 group-hover:text-sky-400 group-hover:translate-x-1 transition-all flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                    <p className="text-gray-500 mt-1 text-sm sm:text-base">
                      {demo.description}
                    </p>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-8">
          <Link href="/intents/create" className="p-3 sm:p-4 bg-gray-900/50 border border-gray-800 hover:border-sky-500/30 rounded-lg text-center transition-colors">
            <p className="text-sm font-medium text-gray-300">New Intent</p>
          </Link>
          <Link href="/intents" className="p-3 sm:p-4 bg-gray-900/50 border border-gray-800 hover:border-sky-500/30 rounded-lg text-center transition-colors">
            <p className="text-sm font-medium text-gray-300">My Intents</p>
          </Link>
          <Link href="/dashboard" className="p-3 sm:p-4 bg-gray-900/50 border border-gray-800 hover:border-sky-500/30 rounded-lg text-center transition-colors">
            <p className="text-sm font-medium text-gray-300">Dashboard</p>
          </Link>
        </div>

        {/* Footer */}
        <div className="pt-6 border-t border-gray-800">
          <p className="text-xs sm:text-sm text-gray-600 text-center">
            Built on Sui with DeepBook V3, Seal Encryption, and Nautilus TEE
          </p>
        </div>
      </div>
    </div>
  );
}
