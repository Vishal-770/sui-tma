'use client';

/**
 * Telegram — Sign & Send Deposit
 *
 * Works in TWO modes:
 *
 *   1. **Telegram Mini App** (opened inside Telegram WebView):
 *      - Wallet connector popups DON'T work in Telegram's WebView.
 *      - Detects TMA environment and immediately opens the same URL
 *        in the system browser via WebApp.openLink(), then closes the Mini App.
 *      - The browser handles the actual wallet connection + signing.
 *
 *   2. **System browser** (opened via "Open in Browser" button or redirected from TMA):
 *      - Uses @hot-labs/near-connect to connect wallet and sign deposit.
 *      - Reports tx hash back to the server.
 *
 * URL params:
 *   chatId, sig — HMAC-authenticated chat ID
 *   depositAddress — where to send tokens
 *   amount — raw amount in smallest unit
 *   originAsset — e.g. "native:near" or "nep141:wrap.near"
 *   tokenSymbol — display name (e.g. "NEAR")
 *   amountFormatted — human-readable amount (e.g. "0.01")
 *   tokenOut — destination token symbol
 *   amountOut — destination amount
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

type SignStatus = 'idle' | 'signing' | 'submitting' | 'success' | 'error';

function SignDepositContent() {
  const searchParams = useSearchParams();
  const chatId = searchParams.get('chatId');
  const sig = searchParams.get('sig');
  const depositAddress = searchParams.get('depositAddress');
  const amount = searchParams.get('amount');
  const originAsset = searchParams.get('originAsset');
  const tokenSymbol = searchParams.get('tokenSymbol') || 'NEAR';
  const amountFormatted = searchParams.get('amountFormatted') || '?';
  const tokenOut = searchParams.get('tokenOut') || '?';
  const amountOut = searchParams.get('amountOut') || '?';

  const { accountId, isConnected, isLoading, connect, signAndSendTransaction } =
    useNearWallet();
  const [signStatus, setSignStatus] = useState<SignStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [txHash, setTxHash] = useState('');
  const [tmaRedirected, setTmaRedirected] = useState(false);

  const isValidParams = Boolean(chatId && sig && depositAddress && amount);

  // ── TMA detection & redirect ──
  // If opened inside Telegram's WebView, immediately redirect to the
  // system browser where the wallet connector actually works.
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg && tg.initData) {
      tg.ready();
      tg.expand();

      // Build the full URL with all params preserved
      const currentUrl = window.location.href;

      // Open in system browser
      tg.openLink(currentUrl);
      setTmaRedirected(true);

      // Close the Mini App after a brief delay so the user sees the redirect
      setTimeout(() => {
        try { tg.close(); } catch { /* ignore */ }
      }, 1500);
    }
  }, []);

  // Sign and send the deposit transaction
  const handleSign = useCallback(async () => {
    if (!depositAddress || !amount || !originAsset) return;

    setSignStatus('signing');
    setErrorMsg('');

    try {
      const assetId = String(originAsset);
      const rawAmount = String(amount);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let result: any;

      if (assetId === 'native:near' || assetId === 'nep141:wrap.near') {
        // Native NEAR transfer
        result = await signAndSendTransaction({
          receiverId: depositAddress,
          actions: [
            {
              type: 'Transfer',
              params: { deposit: rawAmount },
            },
          ],
        });
      } else if (assetId.startsWith('nep141:')) {
        // NEP-141 token → ft_transfer_call
        const tokenContract = assetId.replace('nep141:', '');
        result = await signAndSendTransaction({
          receiverId: tokenContract,
          actions: [
            {
              type: 'FunctionCall',
              params: {
                methodName: 'ft_transfer_call',
                args: {
                  receiver_id: depositAddress,
                  amount: rawAmount,
                  msg: '',
                },
                gas: '100000000000000',
                deposit: '1',
              },
            },
          ],
        });
      } else {
        // Fallback — treat as transfer
        result = await signAndSendTransaction({
          receiverId: depositAddress,
          actions: [
            {
              type: 'Transfer',
              params: { deposit: rawAmount },
            },
          ],
        });
      }

      const hash =
        result?.transaction?.hash ||
        result?.transaction_outcome?.id ||
        '';
      setTxHash(hash);

      // Submit tx hash to server so bot can notify user
      setSignStatus('submitting');

      try {
        const res = await fetch('/api/telegram/deposit-signed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chatId,
            sig,
            txHash: hash,
            depositAddress,
          }),
        });

        const data = await res.json();
        if (res.ok && data.ok) {
          setSignStatus('success');
        } else {
          // Tx went through but server notification failed — still show success
          setSignStatus('success');
        }
      } catch {
        // Tx went through but server notification failed — still show success
        setSignStatus('success');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Transaction rejected or failed';
      setSignStatus('error');
      setErrorMsg(msg);
    }
  }, [depositAddress, amount, originAsset, signAndSendTransaction, chatId, sig]);

  // ── Invalid params ──
  if (!isValidParams) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-5xl">⚠️</div>
          <h1 className="text-xl font-bold">Invalid Link</h1>
          <p className="text-sm text-muted-foreground">
            This deposit link is invalid or expired. Please try the swap again
            in the Telegram bot.
          </p>
        </div>
      </div>
    );
  }

  // ── TMA redirect screen ──
  if (tmaRedirected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-5xl">🌐</div>
          <h1 className="text-xl font-bold">Opening Browser...</h1>
          <p className="text-sm text-muted-foreground">
            Signing transactions requires your system browser.
            The page is opening now — please complete the deposit there.
          </p>
          <p className="text-xs text-muted-foreground">
            This window will close automatically.
          </p>
        </div>
      </div>
    );
  }

  // ── Success state ──
  if (signStatus === 'success') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-5xl">✅</div>
          <h1 className="text-xl font-bold">Deposit Sent!</h1>
          {txHash && (
            <p className="text-muted-foreground">
              <span className="font-mono text-xs bg-muted px-2 py-1 rounded break-all">
                {txHash}
              </span>
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            Your swap is being processed. It typically takes 1-5 minutes.
            Check the bot for updates.
          </p>
          {txHash && (
            <a
              href={`https://nearblocks.io/txns/${txHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-sm text-primary underline"
            >
              View on NEAR Explorer →
            </a>
          )}
          <p className="text-sm text-muted-foreground">
            You can close this page and return to Telegram.
          </p>
        </div>
      </div>
    );
  }

  // ── Browser mode: Wallet connector + sign ──
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Sign Deposit</h1>
          <p className="text-sm text-muted-foreground">
            Approve the deposit transaction in your NEAR wallet to complete the swap.
          </p>
        </div>

        {/* Swap details */}
        <div className="bg-muted/50 rounded-lg p-4 text-left space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">From</span>
            <span className="font-medium">{amountFormatted} {tokenSymbol}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">To</span>
            <span className="font-medium">{amountOut} {tokenOut}</span>
          </div>
          <div className="pt-2 border-t border-border">
            <span className="text-muted-foreground text-xs">Deposit Address</span>
            <p className="font-mono text-xs break-all mt-1">{depositAddress}</p>
          </div>
          {accountId && (
            <div className="pt-2 border-t border-border">
              <span className="text-muted-foreground text-xs">Your NEAR Account</span>
              <p className="font-mono text-xs mt-1">{accountId}</p>
            </div>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : signStatus === 'signing' || signStatus === 'submitting' ? (
          <div className="flex items-center justify-center py-4 space-x-2">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            <span className="text-sm text-muted-foreground">
              {signStatus === 'signing'
                ? 'Waiting for wallet approval...'
                : 'Confirming deposit...'}
            </span>
          </div>
        ) : signStatus === 'error' ? (
          <div className="space-y-4">
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <p className="text-sm text-red-400">{errorMsg}</p>
            </div>
            <button
              onClick={handleSign}
              className="w-full py-3 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition"
            >
              Try Again
            </button>
          </div>
        ) : !isConnected ? (
          <div className="space-y-3">
            <p className="text-sm text-amber-400">
              Please connect your NEAR wallet to sign the deposit.
            </p>
            <button
              onClick={connect}
              className="w-full py-3 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition"
            >
              🔗 Connect NEAR Wallet
            </button>
          </div>
        ) : (
          <button
            onClick={handleSign}
            className="w-full py-3 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition"
          >
            ✅ Approve & Send Deposit
          </button>
        )}

        <p className="text-xs text-muted-foreground">
          🔒 Your private keys never leave your wallet.
        </p>
      </div>
    </div>
  );
}

export default function TelegramSignDeposit() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      }
    >
      <SignDepositContent />
    </Suspense>
  );
}
