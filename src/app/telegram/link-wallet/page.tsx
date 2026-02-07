'use client';

/**
 * Web Link — Connect NEAR Wallet for Telegram Bot
 *
 * Opened via a link the bot sends: /telegram/link-wallet?chatId=xxx&sig=yyy
 * User connects their NEAR wallet, the page calls /api/telegram/link to
 * store the association and notify the user in Telegram.
 */

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useNearWallet } from '@/contexts/NearWalletContext';

type LinkStatus = 'idle' | 'linking' | 'success' | 'error';

function LinkWalletContent() {
  const searchParams = useSearchParams();
  const chatId = searchParams.get('chatId');
  const sig = searchParams.get('sig');

  const { accountId, isConnected, isLoading, connect, disconnect } =
    useNearWallet();

  const [linkStatus, setLinkStatus] = useState<LinkStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const isValidParams = Boolean(chatId && sig);

  // When wallet connects, automatically submit the link
  const submitLink = useCallback(async () => {
    if (!chatId || !sig || !accountId) return;

    setLinkStatus('linking');
    try {
      const res = await fetch('/api/telegram/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId, sig, nearAccountId: accountId }),
      });

      const data = await res.json();
      if (res.ok && data.ok) {
        setLinkStatus('success');
      } else {
        setLinkStatus('error');
        setErrorMsg(data.error || 'Failed to link wallet');
      }
    } catch {
      setLinkStatus('error');
      setErrorMsg('Network error — please try again');
    }
  }, [chatId, sig, accountId]);

  // Auto-submit when wallet connects
  useEffect(() => {
    if (isConnected && accountId && linkStatus === 'idle' && isValidParams) {
      submitLink();
    }
  }, [isConnected, accountId, linkStatus, isValidParams, submitLink]);

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

  if (linkStatus === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-5xl">✅</div>
          <h1 className="text-xl font-bold">Wallet Linked!</h1>
          <p className="text-muted-foreground">
            <span className="font-mono text-sm bg-muted px-2 py-1 rounded">
              {accountId}
            </span>
          </p>
          <p className="text-sm text-muted-foreground">
            Your NEAR wallet is now linked to the Telegram bot. You can close
            this page and return to Telegram.
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
          <h1 className="text-2xl font-bold">Link NEAR Wallet</h1>
          <p className="text-sm text-muted-foreground">
            Connect your NEAR wallet below to link it to your Telegram bot
            session. No private keys are shared.
          </p>
        </div>

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
              onClick={submitLink}
              className="w-full py-3 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition"
            >
              Retry
            </button>
          </div>
        ) : isConnected && accountId ? (
          <div className="space-y-4">
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
              <p className="text-sm text-green-400 font-medium">Connected</p>
              <p className="font-mono text-sm mt-1">{accountId}</p>
            </div>
            <button
              onClick={submitLink}
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

        <div className="text-xs text-muted-foreground space-y-1 pt-4 border-t border-border">
          <p>Supports: HOT Wallet, Meteor, MyNearWallet, Nightly & more</p>
          <p>
            🔒 Your private keys never leave your wallet.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function TelegramLinkWallet() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      }
    >
      <LinkWalletContent />
    </Suspense>
  );
}
