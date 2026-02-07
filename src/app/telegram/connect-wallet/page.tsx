'use client';

/**
 * Telegram Mini App — Connect NEAR Wallet
 *
 * Opened as a Telegram WebApp inside the chat.  Uses @hot-labs/near-connect
 * to show the wallet selector.  Once the user connects, the page sends the
 * accountId back to the bot via `WebApp.sendData()`.
 *
 * The bot receives this in `message.web_app_data.data` and stores it.
 */

import { useEffect, useState, useCallback } from 'react';
import { useNearWallet } from '@/contexts/NearWalletContext';

// Telegram WebApp type
declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        ready: () => void;
        close: () => void;
        sendData: (data: string) => void;
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
        themeParams: {
          bg_color?: string;
          text_color?: string;
          hint_color?: string;
          button_color?: string;
          button_text_color?: string;
        };
        expand: () => void;
        setHeaderColor: (color: string) => void;
      };
    };
  }
}

export default function TelegramConnectWallet() {
  const { accountId, isConnected, isLoading, connect, disconnect } =
    useNearWallet();
  const [sent, setSent] = useState(false);
  const [isTelegram, setIsTelegram] = useState(false);

  // Initialize Telegram WebApp
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      setIsTelegram(true);
    }
  }, []);

  // When wallet connects, send data back to bot
  const handleSendToBotAndClose = useCallback(() => {
    if (!accountId) return;
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.sendData(JSON.stringify({ type: 'near_connect', accountId }));
      setSent(true);
      // Close mini app after short delay so user sees confirmation
      setTimeout(() => tg.close(), 1500);
    }
  }, [accountId]);

  // Auto-send when wallet connects in TMA mode
  useEffect(() => {
    if (isConnected && accountId && isTelegram && !sent) {
      handleSendToBotAndClose();
    }
  }, [isConnected, accountId, isTelegram, sent, handleSendToBotAndClose]);

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-4">
          <div className="text-5xl">✅</div>
          <h1 className="text-xl font-bold">Wallet Connected!</h1>
          <p className="text-muted-foreground">
            <span className="font-mono text-sm bg-muted px-2 py-1 rounded">
              {accountId}
            </span>
          </p>
          <p className="text-sm text-muted-foreground">
            Returning to Telegram...
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
            Connect your NEAR wallet to enable cross-chain swaps directly from
            Telegram — no private keys needed.
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : isConnected && accountId ? (
          <div className="space-y-4">
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
              <p className="text-sm text-green-400 font-medium">Connected</p>
              <p className="font-mono text-sm mt-1">{accountId}</p>
            </div>

            {isTelegram ? (
              <button
                onClick={handleSendToBotAndClose}
                className="w-full py-3 px-4 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition"
              >
                ✅ Confirm & Return to Bot
              </button>
            ) : (
              <p className="text-sm text-muted-foreground">
                Open this page from Telegram to link your wallet.
              </p>
            )}

            <button
              onClick={disconnect}
              className="w-full py-2 px-4 border border-border rounded-lg text-sm text-muted-foreground hover:bg-muted transition"
            >
              Disconnect
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
            🔒 Your private keys never leave your wallet —<br />
            only your account ID is shared with the bot.
          </p>
        </div>
      </div>
    </div>
  );
}
