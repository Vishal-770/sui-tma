'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCurrentAccount, useDisconnectWallet, useSuiClient } from '@mysten/dapp-kit';

import { useAuth } from '@/contexts/AuthContext';
import { formatAddress, getExplorerUrl } from '@/lib/sui';

export default function DashboardPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, session, balance: zkBalance, logout, refreshBalance, checkEpochValidity } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  
  // Wallet connection via dapp-kit
  const dappKitAccount = useCurrentAccount();
  const { mutate: disconnectWallet } = useDisconnectWallet();
  const suiClient = useSuiClient();
  const [walletBalance, setWalletBalance] = useState<string>('0');

  // Check if connected via either method
  const isConnected = isAuthenticated || !!dappKitAccount;
  const activeAddress = session?.zkLoginAddress || dappKitAccount?.address;
  const isZkLogin = isAuthenticated && !!session?.zkLoginAddress;

  // Redirect if not connected at all
  useEffect(() => {
    if (!isLoading && !isConnected) {
      router.replace('/login');
    }
  }, [isConnected, isLoading, router]);

  // Check epoch validity periodically (only for zkLogin)
  useEffect(() => {
    if (!isZkLogin) return;
    const interval = setInterval(() => {
      checkEpochValidity();
    }, 60000);
    return () => clearInterval(interval);
  }, [checkEpochValidity, isZkLogin]);

  // Fetch wallet balance for dapp-kit connected wallet
  useEffect(() => {
    if (!dappKitAccount?.address || isZkLogin) return;
    
    const fetchWalletBalance = async () => {
      try {
        const balance = await suiClient.getBalance({ owner: dappKitAccount.address });
        const sui = (Number(balance.totalBalance) / 1e9).toFixed(4);
        setWalletBalance(sui);
      } catch (e) {
        console.error('Failed to fetch wallet balance:', e);
      }
    };
    
    fetchWalletBalance();
  }, [dappKitAccount?.address, suiClient, isZkLogin]);

  const handleRefreshBalance = async () => {
    setIsRefreshing(true);
    if (isZkLogin) {
      await refreshBalance();
    } else if (dappKitAccount?.address) {
      try {
        const balance = await suiClient.getBalance({ owner: dappKitAccount.address });
        const sui = (Number(balance.totalBalance) / 1e9).toFixed(4);
        setWalletBalance(sui);
      } catch (e) {
        console.error('Failed to refresh wallet balance:', e);
      }
    }
    setIsRefreshing(false);
  };

  const handleLogout = () => {
    if (isZkLogin) {
      logout();
    } else {
      disconnectWallet();
    }
    router.replace('/');
  };

  const handleCopyAddress = () => {
    if (activeAddress) {
      navigator.clipboard.writeText(activeAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const displayBalance = isZkLogin ? zkBalance : walletBalance;

  if (isLoading || !isConnected) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="w-full max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6">
        {/* Back Link */}
        <div>
          <Link href="/" className="text-gray-400 hover:text-white text-sm flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Home
          </Link>
        </div>

        {/* Wallet Card */}
        <div className="bg-gradient-to-br from-sky-500/10 to-purple-500/10 rounded-2xl p-6 border border-sky-500/20">
          <div className="flex justify-between items-start mb-6">
            <div>
              <p className="text-gray-400 text-sm mb-1">Total Balance</p>
              <h2 className="text-3xl font-bold text-white">{displayBalance} SUI</h2>
            </div>
            <button
              onClick={handleRefreshBalance}
              disabled={isRefreshing}
              className="p-2.5 bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
            >
              <svg
                className={`w-5 h-5 text-gray-400 ${isRefreshing ? 'animate-spin' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          </div>

          <div className="flex items-center gap-2 p-3 bg-black/30 rounded-lg">
            <div className="flex-1 font-mono text-sm text-gray-300 truncate">
              {activeAddress ? formatAddress(activeAddress, 8) : ''}
            </div>
            <button onClick={handleCopyAddress} className="p-2 hover:bg-white/10 rounded transition-colors">
              {copied ? (
                <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
            <button
              onClick={() => window.open(getExplorerUrl('address', activeAddress || ''), '_blank')}
              className="p-2 hover:bg-white/10 rounded transition-colors"
            >
              <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </button>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Link href="/intents/create" className="p-4 bg-gray-900/50 hover:bg-gray-900 border border-gray-800 hover:border-green-500/30 rounded-xl text-center transition-all group">
            <div className="w-10 h-10 mx-auto mb-2 bg-green-500/10 border border-green-500/20 rounded-lg flex items-center justify-center text-green-400 group-hover:bg-green-500/20">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <p className="font-medium text-sm text-white">New Intent</p>
            <p className="text-xs text-gray-500 mt-0.5">Create trade</p>
          </Link>

          <Link href="/intents" className="p-4 bg-gray-900/50 hover:bg-gray-900 border border-gray-800 hover:border-sky-500/30 rounded-xl text-center transition-all group">
            <div className="w-10 h-10 mx-auto mb-2 bg-sky-500/10 border border-sky-500/20 rounded-lg flex items-center justify-center text-sky-400 group-hover:bg-sky-500/20">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="font-medium text-sm text-white">My Intents</p>
            <p className="text-xs text-gray-500 mt-0.5">View active</p>
          </Link>

          <Link href="/demo" className="p-4 bg-gray-900/50 hover:bg-gray-900 border border-gray-800 hover:border-purple-500/30 rounded-xl text-center transition-all group">
            <div className="w-10 h-10 mx-auto mb-2 bg-purple-500/10 border border-purple-500/20 rounded-lg flex items-center justify-center text-purple-400 group-hover:bg-purple-500/20">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <p className="font-medium text-sm text-white">Trading Hub</p>
            <p className="text-xs text-gray-500 mt-0.5">DeFi demos</p>
          </Link>

          <button
            onClick={() => window.open('https://faucet.testnet.sui.io/', '_blank')}
            className="p-4 bg-gray-900/50 hover:bg-gray-900 border border-gray-800 hover:border-orange-500/30 rounded-xl text-center transition-all group"
          >
            <div className="w-10 h-10 mx-auto mb-2 bg-orange-500/10 border border-orange-500/20 rounded-lg flex items-center justify-center text-orange-400 group-hover:bg-orange-500/20">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="font-medium text-sm text-white">Faucet</p>
            <p className="text-xs text-gray-500 mt-0.5">Get testnet SUI</p>
          </button>
        </div>

        {/* Session Info */}
        <div className="bg-gray-900/50 rounded-xl border border-gray-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-800">
            <h3 className="font-medium text-white">Session Info</h3>
          </div>
          
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-green-500/10 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-green-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">Session Active</p>
                <p className="text-xs text-gray-500">{isZkLogin ? 'Google zkLogin' : 'Wallet Connected'}</p>
              </div>
              <span className="px-2.5 py-1 text-xs font-medium bg-green-500/10 text-green-400 rounded-full">
                Connected
              </span>
            </div>

            {isZkLogin && session && (
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gray-800 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">Valid Until</p>
                  <p className="text-xs text-gray-500">Epoch {session.maxEpoch}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          className="w-full py-3 bg-transparent hover:bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span>{isZkLogin ? 'Sign Out' : 'Disconnect Wallet'}</span>
        </button>
      </div>
    </div>
  );
}
