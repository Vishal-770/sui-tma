'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

import { useAuth } from '@/contexts/AuthContext';
import {
  setupZkLogin,
  getGoogleAuthUrl,
  storeZkLoginSetup,
} from '@/lib/zklogin';

export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect if already authenticated
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.replace('/dashboard');
    }
  }, [isAuthenticated, authLoading, router]);

  const handleGoogleLogin = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Setup zkLogin (generate ephemeral keypair and nonce)
      const setup = await setupZkLogin();

      // Store setup data for callback
      const ephemeralPrivateKey = setup.ephemeralKeyPair.getSecretKey();
      const ephemeralPublicKey = setup.ephemeralKeyPair.getPublicKey().toBase64();

      storeZkLoginSetup({
        ephemeralPrivateKey,
        ephemeralPublicKey,
        randomness: setup.randomness,
        maxEpoch: setup.maxEpoch,
        nonce: setup.nonce,
      });

      // Get redirect URL based on current location
      const redirectUrl = `${window.location.origin}/auth/callback`;

      // Get Google OAuth URL and redirect
      const authUrl = getGoogleAuthUrl(setup.nonce, redirectUrl);
      
      window.location.href = authUrl;
    } catch (err) {
      console.error('Login setup failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to start login');
      setIsLoading(false);
    }
  }, []);

  if (authLoading) {
    return (
      <div className="page-centered">
        <div className="spinner" />
      </div>
    );
  }

  return (
    <div className="page-container" style={{ display: 'flex', flexDirection: 'column', minHeight: '90vh' }}>
      {/* Back Button */}
      <div style={{ paddingTop: 8, paddingBottom: 8 }}>
        <Link href="/" className="text-gray-400 hover:text-white text-sm flex items-center gap-2">
          <svg style={{ width: 16, height: 16 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Link>
      </div>

      {/* Hero Section */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', paddingTop: 20 }}>
        {/* Logo */}
        <div className="icon-box animate-float" style={{
          width: 72,
          height: 72,
          borderRadius: 20,
          background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
          marginBottom: 24,
          boxShadow: '0 8px 24px rgba(99, 102, 241, 0.3)'
        }}>
          <svg style={{ width: 36, height: 36, color: 'white' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>

        {/* Title */}
        <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 8 }}>SuiTrader</h1>
        <p className="text-muted" style={{ fontSize: 15, marginBottom: 32 }}>Private Intent Trading on Sui</p>

        {/* Features List */}
        <div className="section" style={{ width: '100%', maxWidth: 340, marginBottom: 24 }}>
          <div className="list-item">
            <div className="icon-box-sm icon-green">
              <svg style={{ width: 18, height: 18 }} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
            </div>
            <div style={{ textAlign: 'left' }}>
              <p style={{ fontSize: 15, fontWeight: 500 }}>No Private Keys</p>
              <p className="text-muted" style={{ fontSize: 13 }}>Sign in with Google OAuth</p>
            </div>
          </div>

          <div className="list-item">
            <div className="icon-box-sm icon-blue">
              <svg style={{ width: 18, height: 18 }} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
              </svg>
            </div>
            <div style={{ textAlign: 'left' }}>
              <p style={{ fontSize: 15, fontWeight: 500 }}>Zero-Knowledge Proofs</p>
              <p className="text-muted" style={{ fontSize: 13 }}>Privacy-preserving authentication</p>
            </div>
          </div>

          <div className="list-item">
            <div className="icon-box-sm icon-purple">
              <svg style={{ width: 18, height: 18 }} fill="currentColor" viewBox="0 0 20 20">
                <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
              </svg>
            </div>
            <div style={{ textAlign: 'left' }}>
              <p style={{ fontSize: 15, fontWeight: 500 }}>Private Trading</p>
              <p className="text-muted" style={{ fontSize: 13 }}>Encrypted intents on DeepBook</p>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="card" style={{ 
            width: '100%', 
            maxWidth: 340, 
            marginBottom: 16,
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)'
          }}>
            <p style={{ color: '#dc2626', fontSize: 14, textAlign: 'center' }}>{error}</p>
          </div>
        )}

        {/* Login Button */}
        <button
          onClick={handleGoogleLogin}
          disabled={isLoading}
          className="google-btn"
          style={{ width: '100%', maxWidth: 340 }}
        >
          {isLoading ? (
            <>
              <div className="spinner-sm" />
              <span>Connecting...</span>
            </>
          ) : (
            <>
              {/* Google Logo */}
              <svg className="google-icon" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              <span>Continue with Google</span>
            </>
          )}
        </button>
      </div>

      {/* Footer */}
      <div style={{ paddingTop: 24, paddingBottom: 16, textAlign: 'center' }}>
        <p className="text-muted" style={{ fontSize: 12 }}>
          Secured by zkLogin on Sui Blockchain
        </p>
      </div>
    </div>
  );
}
