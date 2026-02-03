'use client';

import { initData, useSignal } from '@tma.js/sdk-react';

import { Link } from '@/components/Link/Link';
import { Page } from '@/components/Page';
import { useAuth } from '@/contexts/AuthContext';
import { formatAddress } from '@/lib/sui';

export default function Home() {
  const { isAuthenticated, session, balance } = useAuth();
  const initDataUser = useSignal(initData.user);

  return (
    <Page back={false}>
      <div className="tma-page">
        {/* Hero Section */}
        <div className="flex flex-col items-center text-center pt-8 pb-6">
          {/* Animated Logo */}
          <div className="tma-icon animate-float mb-6" style={{
            width: 80,
            height: 80,
            borderRadius: 24,
            background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
            boxShadow: '0 8px 24px rgba(99, 102, 241, 0.3)'
          }}>
            <svg style={{ width: 40, height: 40, color: 'white' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>

          {/* Title */}
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>
            SuiTrader
          </h1>
          <p className="tma-hint" style={{ fontSize: 15, maxWidth: 280, marginBottom: 20 }}>
            Private intent-based trading powered by zkLogin and Nautilus TEE
          </p>

          {/* Welcome Message */}
          {initDataUser && (
            <div className="tma-badge tma-badge-info" style={{ marginBottom: 16 }}>
              👋 Welcome, {initDataUser.first_name}!
            </div>
          )}
        </div>

        {/* Auth-based Content */}
        {isAuthenticated && session ? (
          <div className="animate-fadeIn" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Balance Card */}
            <div className="tma-balance-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <p className="tma-balance-label">Your Balance</p>
                  <p className="tma-balance-value">{balance} SUI</p>
                </div>
                <div className="tma-badge" style={{ background: 'rgba(255,255,255,0.2)', color: 'white' }}>
                  {formatAddress(session.zkLoginAddress, 4)}
                </div>
              </div>
            </div>

            {/* CTA */}
            <Link href="/dashboard" style={{ textDecoration: 'none' }}>
              <button className="tma-btn tma-btn-full tma-btn-secondary" style={{ gap: 10 }}>
                <span>Go to Dashboard</span>
                <svg style={{ width: 20, height: 20 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </button>
            </Link>
          </div>
        ) : (
          <div className="animate-fadeIn" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Feature Highlights */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              <div className="tma-card" style={{ textAlign: 'center', padding: 14 }}>
                <div style={{ fontSize: 28, marginBottom: 6 }}>🔐</div>
                <p style={{ fontSize: 12, fontWeight: 600 }}>Private</p>
              </div>
              <div className="tma-card" style={{ textAlign: 'center', padding: 14 }}>
                <div style={{ fontSize: 28, marginBottom: 6 }}>⚡</div>
                <p style={{ fontSize: 12, fontWeight: 600 }}>Fast</p>
              </div>
              <div className="tma-card" style={{ textAlign: 'center', padding: 14 }}>
                <div style={{ fontSize: 28, marginBottom: 6 }}>🛡️</div>
                <p style={{ fontSize: 12, fontWeight: 600 }}>Secure</p>
              </div>
            </div>

            {/* CTA Button */}
            <Link href="/login" style={{ textDecoration: 'none' }}>
              <button className="tma-btn tma-btn-gradient tma-btn-full" style={{ padding: '16px 24px' }}>
                <svg style={{ width: 20, height: 20 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>Get Started</span>
              </button>
            </Link>
          </div>
        )}

        {/* How It Works */}
        <div style={{ marginTop: 32 }}>
          <h2 style={{ fontSize: 17, fontWeight: 600, textAlign: 'center', marginBottom: 16 }}>How It Works</h2>
          <div className="tma-steps">
            <div className="tma-step">
              <div className="tma-icon-sm tma-icon-blue">
                <span style={{ fontSize: 14, fontWeight: 600 }}>1</span>
              </div>
              <div>
                <p className="tma-step-title">Connect with zkLogin</p>
                <p className="tma-hint" style={{ fontSize: 13 }}>Sign in with Google, no private keys needed</p>
              </div>
            </div>

            <div className="tma-step">
              <div className="tma-icon-sm tma-icon-purple">
                <span style={{ fontSize: 14, fontWeight: 600 }}>2</span>
              </div>
              <div>
                <p className="tma-step-title">Create Private Intents</p>
                <p className="tma-hint" style={{ fontSize: 13 }}>Set your trade conditions encrypted with Seal</p>
              </div>
            </div>

            <div className="tma-step">
              <div className="tma-icon-sm tma-icon-green">
                <span style={{ fontSize: 14, fontWeight: 600 }}>3</span>
              </div>
              <div>
                <p className="tma-step-title">Automatic Execution</p>
                <p className="tma-hint" style={{ fontSize: 13 }}>Nautilus TEE executes when conditions are met</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ paddingTop: 32, textAlign: 'center' }}>
          <p className="tma-hint" style={{ fontSize: 12 }}>
            Built on Sui • Powered by zkLogin & Nautilus
          </p>
        </div>
      </div>
    </Page>
  );
}
