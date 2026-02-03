'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { hapticFeedback } from '@tma.js/sdk-react';

import { Page } from '@/components/Page';
import { Link } from '@/components/Link/Link';
import { useAuth } from '@/contexts/AuthContext';
import { formatAddress, getExplorerUrl } from '@/lib/sui';

export default function DashboardPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, session, balance, logout, refreshBalance, checkEpochValidity } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  // Check epoch validity periodically
  useEffect(() => {
    const interval = setInterval(() => {
      checkEpochValidity();
    }, 60000);
    return () => clearInterval(interval);
  }, [checkEpochValidity]);

  const handleRefreshBalance = async () => {
    setIsRefreshing(true);
    hapticFeedback.impactOccurred.ifAvailable('light');
    await refreshBalance();
    setIsRefreshing(false);
    hapticFeedback.notificationOccurred.ifAvailable('success');
  };

  const handleLogout = () => {
    hapticFeedback.impactOccurred.ifAvailable('medium');
    logout();
    router.replace('/');
  };

  const handleCopyAddress = () => {
    if (session?.zkLoginAddress) {
      navigator.clipboard.writeText(session.zkLoginAddress);
      setCopied(true);
      hapticFeedback.notificationOccurred.ifAvailable('success');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isLoading || !session) {
    return (
      <Page back={false}>
        <div className="tma-page-centered">
          <div className="tma-spinner" />
        </div>
      </Page>
    );
  }

  return (
    <Page back={false}>
      <div className="tma-page" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Wallet Card */}
        <div className="tma-balance-card animate-fadeIn">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
            <div>
              <p className="tma-balance-label">Total Balance</p>
              <h2 className="tma-balance-value">{balance} SUI</h2>
            </div>
            <button
              onClick={handleRefreshBalance}
              disabled={isRefreshing}
              className="tma-address-btn"
              style={{ padding: 10 }}
            >
              <svg
                style={{ 
                  width: 20, 
                  height: 20,
                  animation: isRefreshing ? 'spin 0.8s linear infinite' : 'none'
                }}
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

          <div className="tma-address">
            <div style={{ flex: 1, fontFamily: 'monospace', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {formatAddress(session.zkLoginAddress, 8)}
            </div>
            <button onClick={handleCopyAddress} className="tma-address-btn">
              {copied ? (
                <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
            <button
              onClick={() => window.open(getExplorerUrl('address', session.zkLoginAddress), '_blank')}
              className="tma-address-btn"
            >
              <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </button>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="tma-action-grid animate-fadeIn" style={{ animationDelay: '0.1s' }}>
          <Link href="/intents/create" className="tma-action-item">
            <div className="tma-icon tma-icon-green" style={{ margin: '0 auto' }}>
              <svg style={{ width: 24, height: 24 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <p className="tma-action-title">New Intent</p>
            <p className="tma-action-subtitle">Create trade</p>
          </Link>

          <Link href="/intents" className="tma-action-item">
            <div className="tma-icon tma-icon-blue" style={{ margin: '0 auto' }}>
              <svg style={{ width: 24, height: 24 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="tma-action-title">My Intents</p>
            <p className="tma-action-subtitle">View active</p>
          </Link>

          <Link href="/market" className="tma-action-item">
            <div className="tma-icon tma-icon-purple" style={{ margin: '0 auto' }}>
              <svg style={{ width: 24, height: 24 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
              </svg>
            </div>
            <p className="tma-action-title">Market</p>
            <p className="tma-action-subtitle">View prices</p>
          </Link>

          <button
            onClick={() => window.open('https://faucet.testnet.sui.io/', '_blank')}
            className="tma-action-item"
            style={{ border: 'none', cursor: 'pointer' }}
          >
            <div className="tma-icon tma-icon-orange" style={{ margin: '0 auto' }}>
              <svg style={{ width: 24, height: 24 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="tma-action-title">Faucet</p>
            <p className="tma-action-subtitle">Get testnet SUI</p>
          </button>
        </div>

        {/* Session Info */}
        <div className="tma-section animate-fadeIn" style={{ animationDelay: '0.2s' }}>
          <div className="tma-section-header">Session Info</div>
          
          <div className="tma-list-item">
            <div className="tma-icon-sm tma-icon-green">
              <svg style={{ width: 16, height: 16 }} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 15, fontWeight: 500 }}>Session Active</p>
              <p className="tma-hint" style={{ fontSize: 13 }}>Google zkLogin</p>
            </div>
            <span className="tma-badge tma-badge-success">Connected</span>
          </div>

          <div className="tma-list-item">
            <div className="tma-icon-sm" style={{ background: 'var(--tg-theme-secondary-bg-color)', color: 'var(--tg-theme-hint-color)' }}>
              <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 15, fontWeight: 500 }}>Valid Until</p>
              <p className="tma-hint" style={{ fontSize: 13 }}>Epoch {session.maxEpoch}</p>
            </div>
          </div>

          {session.telegramUserId && (
            <div className="tma-list-item">
              <div className="tma-icon-sm tma-icon-blue">
                <svg style={{ width: 16, height: 16 }} fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.562 8.161c-.18 1.897-.962 6.502-1.359 8.627-.168.9-.5 1.201-.82 1.23-.697.064-1.226-.461-1.901-.903-1.056-.693-1.653-1.124-2.678-1.8-1.185-.781-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.139-5.062 3.345-.479.329-.913.489-1.302.481-.428-.009-1.252-.242-1.865-.442-.751-.244-1.349-.374-1.297-.789.027-.216.324-.437.893-.663 3.498-1.524 5.831-2.529 6.998-3.015 3.333-1.386 4.025-1.627 4.477-1.635.099-.002.321.023.465.141a.506.506 0 01.171.325c.016.093.036.306.02.472z"/>
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 15, fontWeight: 500 }}>Telegram ID</p>
                <p className="tma-hint" style={{ fontSize: 13 }}>{session.telegramUserId}</p>
              </div>
            </div>
          )}
        </div>

        {/* Logout Button */}
        <button
          onClick={handleLogout}
          className="tma-btn tma-btn-full animate-fadeIn"
          style={{ 
            background: 'transparent',
            color: 'var(--tg-theme-destructive-text-color, #ef4444)',
            animationDelay: '0.3s'
          }}
        >
          <svg style={{ width: 20, height: 20 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span>Sign Out</span>
        </button>
      </div>
    </Page>
  );
}
