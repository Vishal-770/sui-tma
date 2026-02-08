'use client';

/**
 * Telegram Mini App — Fund NEAR Wallet
 *
 * Opens inside Telegram as a WebApp. Shows:
 *   - QR code for the NEAR address
 *   - One-tap copy button
 *   - Current balance (fetched from API)
 *   - Deep links to popular NEAR wallets
 *
 * URL: /telegram/fund?address=<NEAR_ADDRESS>&chatId=<CHAT_ID>
 */

import { Suspense, useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';

function FundWalletContent() {
  const searchParams = useSearchParams();
  const address = searchParams.get('address');
  const chatId = searchParams.get('chatId');

  const [copied, setCopied] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  // Fetch balance on load
  const fetchBalance = useCallback(async () => {
    if (!address) return;
    setBalanceLoading(true);
    try {
      const res = await fetch('https://rpc.mainnet.fastnear.com', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'bal',
          method: 'query',
          params: { request_type: 'view_account', finality: 'final', account_id: address },
        }),
      });
      const data = await res.json();
      if (data.result?.amount) {
        const yocto = BigInt(data.result.amount);
        const near = Number(yocto / BigInt(1e18)) / 1e6;
        setBalance(near.toFixed(4));
      } else {
        setBalance('0.0000');
      }
    } catch {
      setBalance(null);
    } finally {
      setBalanceLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  const copyAddress = useCallback(async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for environments where clipboard API isn't available
      const input = document.createElement('input');
      input.value = address;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [address]);

  // Close Telegram WebApp when done
  const closeMiniApp = useCallback(() => {
    try {
      // Telegram WebApp SDK
      const tg = (window as unknown as { Telegram?: { WebApp?: { close: () => void } } }).Telegram;
      if (tg?.WebApp?.close) {
        tg.WebApp.close();
        return;
      }
    } catch { /* ignore */ }
    window.close();
  }, []);

  if (!address) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1a1a2e] p-4">
        <div className="text-center space-y-4 max-w-sm">
          <div className="text-5xl">⚠️</div>
          <h1 className="text-xl font-bold text-white">Invalid Link</h1>
          <p className="text-sm text-gray-400">
            No address provided. Use the /fund command in the Telegram bot.
          </p>
        </div>
      </div>
    );
  }

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(address)}&size=280x280&bgcolor=1a1a2e&color=ffffff&format=png`;

  // Deep links to popular NEAR wallets
  const walletLinks = [
    {
      name: 'MyNearWallet',
      url: `https://app.mynearwallet.com/send-money/${address}`,
      icon: '🌐',
    },
    {
      name: 'Meteor Wallet',
      url: `https://wallet.meteorwallet.app/transfer?receiver=${address}`,
      icon: '☄️',
    },
    {
      name: 'HOT Wallet',
      url: `https://t.me/haborwallet`,
      icon: '🔥',
    },
  ];

  return (
    <div className="min-h-screen bg-[#1a1a2e] text-white p-4">
      <div className="max-w-sm mx-auto space-y-6 pt-4">
        {/* Header */}
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold">💳 Fund Wallet</h1>
          <p className="text-sm text-gray-400">
            Send NEAR to this address to fund your wallet
          </p>
        </div>

        {/* Balance Card */}
        <div className="bg-[#16213e] rounded-xl p-4 border border-gray-700">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">Current Balance</span>
            <button
              onClick={fetchBalance}
              className="text-xs text-blue-400 hover:text-blue-300 transition"
            >
              ↻ Refresh
            </button>
          </div>
          <div className="mt-1">
            {balanceLoading ? (
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-400" />
                <span className="text-sm text-gray-400">Loading...</span>
              </div>
            ) : balance !== null ? (
              <span className="text-2xl font-bold">{balance} <span className="text-base text-gray-400">NEAR</span></span>
            ) : (
              <span className="text-sm text-gray-500">Unable to fetch</span>
            )}
          </div>
        </div>

        {/* QR Code */}
        <div className="flex justify-center">
          <div className="bg-white rounded-2xl p-4 shadow-lg">
            <img
              src={qrUrl}
              alt="QR Code for NEAR address"
              width={280}
              height={280}
              className="rounded-lg"
            />
          </div>
        </div>

        {/* Address + Copy */}
        <div className="space-y-2">
          <label className="text-xs text-gray-400 uppercase tracking-wider">Your NEAR Address</label>
          <div className="bg-[#16213e] rounded-xl p-3 border border-gray-700 flex items-center gap-2">
            <code className="text-xs font-mono text-gray-300 break-all flex-1">
              {address}
            </code>
            <button
              onClick={copyAddress}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                copied
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : 'bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30'
              }`}
            >
              {copied ? '✓ Copied' : '📋 Copy'}
            </button>
          </div>
        </div>

        {/* Send from Wallet */}
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-gray-300">Send from NEAR Wallet</h2>
          <div className="grid gap-2">
            {walletLinks.map((wallet) => (
              <a
                key={wallet.name}
                href={wallet.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 bg-[#16213e] rounded-xl p-3 border border-gray-700 hover:border-blue-500/50 transition-all"
              >
                <span className="text-xl">{wallet.icon}</span>
                <span className="text-sm font-medium">{wallet.name}</span>
                <span className="ml-auto text-gray-500 text-xs">→</span>
              </a>
            ))}
          </div>
        </div>

        {/* Exchange Instructions */}
        <div className="bg-[#16213e] rounded-xl p-4 border border-gray-700 space-y-2">
          <h2 className="text-sm font-medium text-gray-300">Send from Exchange</h2>
          <div className="text-xs text-gray-400 space-y-1.5">
            <p>1️⃣ Go to your exchange (Binance, Coinbase, OKX, etc.)</p>
            <p>2️⃣ Withdraw NEAR to the address above</p>
            <p>3️⃣ Use the <strong className="text-yellow-400">NEAR network</strong> (not ERC-20 or BEP-20)</p>
            <p>4️⃣ Wait 1-2 min for confirmation</p>
          </div>
        </div>

        {/* Close / Back */}
        <div className="pb-6">
          <button
            onClick={closeMiniApp}
            className="w-full py-3 px-4 bg-gray-700 text-white rounded-xl font-medium hover:bg-gray-600 transition"
          >
            ← Back to Chat
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TelegramFundWallet() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#1a1a2e]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400" />
        </div>
      }
    >
      <FundWalletContent />
    </Suspense>
  );
}
