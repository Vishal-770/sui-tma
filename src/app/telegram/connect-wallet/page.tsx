'use client';

/**
 * Telegram — Connect NEAR Wallet
 *
 * Works in TWO modes:
 *
 *   1. **Telegram Mini App** (opened inside Telegram WebView):
 *      - Wallet connector popups DON'T work inside Telegram's WebView.
 *      - Shows a manual NEAR account ID input instead.
 *      - We only need the account ID (no signing), so manual input is fine.
 *
 *   2. **Standalone browser** (opened from the web link):
 *      - Uses @hot-labs/near-connect wallet selector as normal.
 *      - Auto-submits after wallet connects.
 *
 * Both modes call /api/telegram/link to store the association server-side.
 */

import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useNearWallet } from '@/contexts/NearWalletContext';

// Telegram WebApp type
declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        ready: () => void;
        close: () => void;
        sendData: (data: string) => void;
        openLink: (url: string) => void;
        initData: string;
        initDataUnsafe: {
          user?: { id: number; first_name: string; username?: string };
          query_id?: string;
        };
        MainButton: {
          text: string;
          show: () => void;
          hide: () => void;
          onClick: (cb: () => void) => void;
          offClick: (cb: () => void) => void;
          enable: () => void;
          disable: () => void;
          setParams: (params: { color?: string; text_color?: string; text?: string }) => void;
        };
        themeParams: Record<string, string | undefined>;
        expand: () => void;
        setHeaderColor: (color: string) => void;
      };
    };
  }
}

type LinkStatus = 'idle' | 'linking' | 'success' | 'error';

function ConnectWalletContent() {
  const searchParams = useSearchParams();
  const chatId = searchParams.get('chatId');
  const sig = searchParams.get('sig');

  const { accountId: walletAccountId, isConnected, isLoading, connect, disconnect } =
    useNearWallet();
  const [linkStatus, setLinkStatus] = useState<LinkStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [isTelegram, setIsTelegram] = useState(false);

  // Manual input state (used in TMA mode)
  const [manualAccountId, setManualAccountId] = useState('');
  const [manualError, setManualError] = useState('');

  const isValidParams = Boolean(chatId && sig);

  // The effective account ID: from wallet connector (browser) or manual input (TMA)
  const effectiveAccountId = isTelegram ? manualAccountId.trim() : walletAccountId;

  // Initialize Telegram WebApp
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      setIsTelegram(true);
    }
  }, []);

  // Validate a NEAR account ID
  const isValidNearAccount = (id: string): boolean => {
    const trimmed = id.trim();
    if (!trimmed) return false;
    // Named accounts: alice.near, sub.alice.near, etc.
    if (/^[a-z0-9_\-]+(\.[a-z0-9_\-]+)*\.near$/.test(trimmed)) return true;
    // Implicit accounts: 64-hex chars
    if (/^[a-f0-9]{64}$/.test(trimmed)) return true;
    // .testnet accounts
    if (/^[a-z0-9_\-]+(\.[a-z0-9_\-]+)*\.testnet$/.test(trimmed)) return true;
    return false;
  };

  // Submit wallet link to the server
  const submitLink = useCallback(
    async (accountIdToLink?: string) => {
      const finalId = accountIdToLink || effectiveAccountId;
      if (!chatId || !sig || !finalId) return;

      setLinkStatus('linking');
      setErrorMsg('');
      try {
        const res = await fetch('/api/telegram/link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId, sig, nearAccountId: finalId }),
        });

        const data = await res.json();
        if (res.ok && data.ok) {
          setLinkStatus('success');
          // Auto-close TMA after success
          if (isTelegram) {
            setTimeout(() => window.Telegram?.WebApp.close(), 2000);
          }
        } else {
          setLinkStatus('error');
          setErrorMsg(data.error || 'Failed to link wallet');
        }
      } catch {
        setLinkStatus('error');
        setErrorMsg('Network error — please try again');
      }
    },
    [chatId, sig, effectiveAccountId, isTelegram],
  );

  // Handle manual account submit (TMA mode)
  const handleManualSubmit = useCallback(() => {
    setManualError('');
    const trimmed = manualAccountId.trim();
    if (!trimmed) {
      setManualError('Please enter your NEAR account ID');
      return;
    }
    if (!isValidNearAccount(trimmed)) {
      setManualError('Invalid NEAR account. Expected: yourname.near or 64-char hex address');
      return;
    }
    submitLink(trimmed);
  }, [manualAccountId, submitLink]);

  // Auto-submit when wallet connects (browser mode only)
  useEffect(() => {
    if (!isTelegram && isConnected && walletAccountId && linkStatus === 'idle' && isValidParams) {
      submitLink(walletAccountId);
    }
  }, [isTelegram, isConnected, walletAccountId, linkStatus, isValidParams, submitLink]);

  // ── Invalid params ──
  if (!isValidParams) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-5xl">⚠️</div>
          <h1 className="text-xl font-bold">Invalid Link</h1>
          <p className="text-sm text-muted-foreground">
            This link is invalid or expired. Please use the /connect command in
            the Telegram bot to get a new link.
          </p>
        </div>
      </div>
    );
  }

  // ── Success state ──
  if (linkStatus === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-5xl">✅</div>
          <h1 className="text-xl font-bold">Wallet Connected!</h1>
          <p className="text-muted-foreground">
            <span className="font-mono text-sm bg-muted px-2 py-1 rounded">
              {effectiveAccountId || walletAccountId}
            </span>
          </p>
          <p className="text-sm text-muted-foreground">
            {isTelegram
              ? 'Returning to Telegram...'
              : 'Your NEAR wallet is now linked. You can close this page and return to Telegram.'}
          </p>
          <p className="text-xs text-muted-foreground">
            🔒 Only your account ID was shared — never your private keys.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Connect NEAR Wallet</h1>
          <p className="text-sm text-muted-foreground">
            {isTelegram
              ? 'Enter your NEAR account ID to link it with your Telegram bot. No private keys needed.'
              : 'Connect your NEAR wallet to enable cross-chain swaps directly from Telegram — no private keys needed.'}
          </p>
        </div>

        {/* ────────── TMA MODE: Manual Account Input ────────── */}
        {isTelegram ? (
          linkStatus === 'linking' ? (
            <div className="flex items-center justify-center py-8 space-x-2">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
              <span className="text-sm text-muted-foreground">Linking wallet...</span>
            </div>
          ) : linkStatus === 'error' ? (
            <div className="space-y-4">
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                <p className="text-sm text-red-400">{errorMsg}</p>
              </div>
              <button
                onClick={handleManualSubmit}
                className="w-full py-3 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition"
              >
                Retry
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="text-left space-y-2">
                <label htmlFor="near-account" className="text-sm font-medium">
                  NEAR Account ID
                </label>
                <input
                  id="near-account"
                  type="text"
                  value={manualAccountId}
                  onChange={(e) => {
                    setManualAccountId(e.target.value.toLowerCase());
                    setManualError('');
                  }}
                  placeholder="yourname.near"
                  className="w-full px-3 py-2.5 bg-muted border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground/50"
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
                {manualError && (
                  <p className="text-xs text-red-400">{manualError}</p>
                )}
              </div>

              <button
                onClick={handleManualSubmit}
                disabled={!manualAccountId.trim()}
                className="w-full py-3 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                ✅ Link This Account
              </button>

              <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground text-left space-y-1">
                <p className="font-medium text-foreground/80">Where to find your account ID:</p>
                <p>• Open your NEAR wallet (HOT, Meteor, MyNearWallet)</p>
                <p>• Your account ID looks like: <span className="font-mono">yourname.near</span></p>
                <p>• Copy it and paste it above</p>
              </div>
            </div>
          )
        ) : (
          /* ────────── BROWSER MODE: Wallet Connector ────────── */
          <>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
              </div>
            ) : linkStatus === 'linking' ? (
              <div className="flex items-center justify-center py-8 space-x-2">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
                <span className="text-sm text-muted-foreground">
                  Linking wallet...
                </span>
              </div>
            ) : linkStatus === 'error' ? (
              <div className="space-y-4">
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                  <p className="text-sm text-red-400">{errorMsg}</p>
                </div>
                <button
                  onClick={() => submitLink()}
                  className="w-full py-3 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition"
                >
                  Retry
                </button>
              </div>
            ) : isConnected && walletAccountId ? (
              <div className="space-y-4">
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                  <p className="text-sm text-green-400 font-medium">Connected</p>
                  <p className="font-mono text-sm mt-1">{walletAccountId}</p>
                </div>

                <button
                  onClick={() => submitLink()}
                  className="w-full py-3 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition"
                >
                  ✅ Link This Wallet
                </button>

                <button
                  onClick={disconnect}
                  className="w-full py-2 px-4 border border-border rounded-lg text-sm text-muted-foreground hover:bg-muted transition"
                >
                  Use Different Wallet
                </button>
              </div>
            ) : (
              <button
                onClick={connect}
                className="w-full py-3 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition"
              >
                🔗 Connect NEAR Wallet
              </button>
            )}
          </>
        )}

        <div className="text-xs text-muted-foreground space-y-1 pt-4 border-t border-border">
          {isTelegram ? (
            <p>
              🔒 Only your account ID is shared — never your private keys.
            </p>
          ) : (
            <>
              <p>Supports: HOT Wallet, Meteor, MyNearWallet, Nightly & more</p>
              <p>
                🔒 Your private keys never leave your wallet —<br />
                only your account ID is shared with the bot.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TelegramConnectWallet() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      }
    >
      <ConnectWalletContent />
    </Suspense>
  );
}
