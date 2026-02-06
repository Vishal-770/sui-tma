'use client';

import { useState, useEffect, useCallback } from 'react';
import { Transaction, coinWithBalance } from '@mysten/sui/transactions';
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import Link from 'next/link';
import {
  getConfig,
  getPoolByCoins,
  swapExactBaseForQuote,
  swapExactQuoteForBase,
  toUnits,
  fromUnits,
  getExplorerUrl,
  getCoinDecimals,
  type NetworkEnv,
} from '@/lib/deepbook-v3';

// Get network from environment
const NETWORK: NetworkEnv = (process.env.NEXT_PUBLIC_SUI_NETWORK as NetworkEnv) || 'testnet';
const CONFIG = getConfig(NETWORK);

interface TokenInfo {
  symbol: string;
  name: string;
  decimals: number;
  coinType: string;
}

// Build available tokens from config
const AVAILABLE_TOKENS: TokenInfo[] = Object.entries(CONFIG.coins).map(([symbol, coin]) => ({
  symbol,
  name: symbol,
  decimals: getCoinDecimals(CONFIG, symbol),
  coinType: coin.type,
}));

export default function SwapPage() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction();

  // Default to SUI -> DBUSDC on testnet, SUI -> USDC on mainnet
  const defaultTo = NETWORK === 'mainnet' ? 'USDC' : 'DBUSDC';
  
  const [fromToken, setFromToken] = useState<TokenInfo>(
    AVAILABLE_TOKENS.find(t => t.symbol === 'SUI') || AVAILABLE_TOKENS[0]
  );
  const [toToken, setToToken] = useState<TokenInfo>(
    AVAILABLE_TOKENS.find(t => t.symbol === defaultTo) || AVAILABLE_TOKENS[1]
  );
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [slippage, setSlippage] = useState(0.5);
  const [balances, setBalances] = useState<Record<string, bigint>>({});
  const [userCoinObjects, setUserCoinObjects] = useState<Record<string, string[]>>({});
  const [logs, setLogs] = useState<string[]>([]);
  const [lastTx, setLastTx] = useState<string | null>(null);

  const addLog = useCallback((message: string) => {
    setLogs(prev => [...prev.slice(-9), `[${new Date().toLocaleTimeString()}] ${message}`]);
  }, []);

  // Get pool info for current pair
  const getPoolInfo = useCallback(() => {
    return getPoolByCoins(CONFIG, fromToken.symbol, toToken.symbol);
  }, [fromToken.symbol, toToken.symbol]);

  // Fetch user balances
  useEffect(() => {
    if (!account?.address) return;

    const fetchBalances = async () => {
      const newBalances: Record<string, bigint> = {};
      const newCoinObjects: Record<string, string[]> = {};

      for (const token of AVAILABLE_TOKENS) {
        try {
          const coins = await suiClient.getCoins({
            owner: account.address,
            coinType: token.coinType,
          });
          
          const totalBalance = coins.data.reduce(
            (sum, coin) => sum + BigInt(coin.balance),
            BigInt(0)
          );
          newBalances[token.symbol] = totalBalance;
          newCoinObjects[token.symbol] = coins.data.map(c => c.coinObjectId);
        } catch (error) {
          newBalances[token.symbol] = BigInt(0);
          newCoinObjects[token.symbol] = [];
        }
      }

      // Also fetch DEEP tokens for fees
      try {
        const deepCoins = await suiClient.getCoins({
          owner: account.address,
          coinType: CONFIG.coins['DEEP'].type,
        });
        newBalances['DEEP'] = deepCoins.data.reduce((sum, coin) => sum + BigInt(coin.balance), BigInt(0));
        newCoinObjects['DEEP'] = deepCoins.data.map(c => c.coinObjectId);
      } catch {
        newBalances['DEEP'] = BigInt(0);
        newCoinObjects['DEEP'] = [];
      }

      setBalances(newBalances);
      setUserCoinObjects(newCoinObjects);
    };

    fetchBalances();
    const interval = setInterval(fetchBalances, 10000);
    return () => clearInterval(interval);
  }, [account?.address, suiClient]);

  // Calculate output amount when input changes (simple estimation)
  useEffect(() => {
    if (!fromAmount || parseFloat(fromAmount) <= 0) {
      setToAmount('');
      return;
    }

    const poolInfo = getPoolInfo();
    if (!poolInfo) {
      setToAmount('');
      return;
    }

    // Simple 1:1 estimation for stablecoins, or placeholder for others
    // In production, you'd query the orderbook for accurate pricing
    const inputAmount = parseFloat(fromAmount);
    const isStablePair = (fromToken.symbol.includes('USD') && toToken.symbol.includes('USD'));
    
    if (isStablePair) {
      setToAmount(inputAmount.toFixed(6));
    } else {
      // Placeholder estimation - real implementation would query pool
      // For SUI/USDC, estimate based on typical rates
      setToAmount((inputAmount * 0.95).toFixed(6)); // Conservative estimate
    }
  }, [fromAmount, fromToken, toToken, getPoolInfo]);

  // Swap tokens direction
  const handleSwapDirection = () => {
    setFromToken(toToken);
    setToToken(fromToken);
    setFromAmount(toAmount);
    setToAmount(fromAmount);
  };

  // Format balance for display
  const formatBalance = (amount: bigint, decimals: number): string => {
    const divisor = Math.pow(10, decimals);
    return (Number(amount) / divisor).toFixed(4);
  };

  // Set max amount
  const handleSetMax = () => {
    const balance = balances[fromToken.symbol] || BigInt(0);
    const maxAmount = Number(balance) / Math.pow(10, fromToken.decimals);
    // Leave some for gas if SUI
    const finalAmount = fromToken.symbol === 'SUI' ? Math.max(0, maxAmount - 0.1) : maxAmount;
    setFromAmount(finalAmount.toFixed(6));
  };

  // Execute swap
  const handleSwap = useCallback(async () => {
    if (!account) {
      addLog('❌ Please connect wallet');
      return;
    }

    const poolResult = getPoolInfo();
    if (!poolResult) {
      addLog('❌ No pool available for this pair');
      return;
    }

    const { poolKey, pool, isBaseToQuote } = poolResult;

    const amount = parseFloat(fromAmount);
    if (isNaN(amount) || amount <= 0) {
      addLog('❌ Invalid amount');
      return;
    }

    addLog(`🔄 Swapping ${fromAmount} ${fromToken.symbol} → ${toToken.symbol}...`);
    addLog(`  Pool: ${poolKey} (${pool.address.slice(0, 10)}...)`);

    const tx = new Transaction();
    
    // CRITICAL: Must set sender BEFORE using coinWithBalance
    // coinWithBalance requires the sender to be set to resolve the coin
    tx.setSender(account.address);
    tx.setGasBudget(250_000_000); // 0.25 SUI gas budget

    try {
      const amountInUnits = toUnits(amount, fromToken.decimals);
      // On testnet, set minOutput to 0 to avoid failures due to low liquidity
      // In production, use proper price calculation with slippage
      const estimatedOutput = parseFloat(toAmount || '0') * Math.pow(10, toToken.decimals) * (1 - slippage / 100);
      const minOutput = NETWORK === 'testnet' ? BigInt(0) : BigInt(Math.floor(estimatedOutput));

      addLog(`  Direction: ${isBaseToQuote ? 'Base→Quote' : 'Quote→Base'}`);
      addLog(`  Input: ${amount} ${fromToken.symbol} (${amountInUnits.toString()} units)`);
      addLog(`  Min output: ${NETWORK === 'testnet' ? '0 (testnet mode)' : fromUnits(minOutput, toToken.decimals).toFixed(6)}`);

      // Get input coins for the token being swapped
      const inputCoins = userCoinObjects[fromToken.symbol] || [];
      if (inputCoins.length === 0 && fromToken.symbol !== 'SUI') {
        addLog(`❌ No ${fromToken.symbol} coins found`);
        return;
      }

      // Prepare input coin
      let inputCoin;
      if (fromToken.symbol === 'SUI') {
        // For SUI, split from gas
        [inputCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountInUnits)]);
      } else {
        // For other tokens, merge if needed then split
        if (inputCoins.length === 1) {
          inputCoin = tx.object(inputCoins[0]);
        } else {
          tx.mergeCoins(
            tx.object(inputCoins[0]),
            inputCoins.slice(1).map(id => tx.object(id))
          );
          inputCoin = tx.object(inputCoins[0]);
        }
        [inputCoin] = tx.splitCoins(inputCoin, [tx.pure.u64(amountInUnits)]);
      }

      // CRITICAL FIX: Create DEEP coin with proper type using coinWithBalance
      // This is the key fix - we CANNOT use splitCoins from gas because that creates Coin<SUI>
      // but the swap function expects Coin<DEEP>
      // ALSO: Always use coinWithBalance - it automatically resolves coins from wallet
      const deepBalance = balances['DEEP'] || BigInt(0);
      const deepCoinType = CONFIG.coins['DEEP'].type;
      
      // Use coinWithBalance which automatically handles coin resolution
      // If user has DEEP, a small amount for fees; if not, 0 (some pools allow fee-free swaps)
      const deepAmountForFees = deepBalance > BigInt(100000) ? 100000 : 0; // 0.1 DEEP or 0
      const deepCoin = coinWithBalance({ type: deepCoinType, balance: deepAmountForFees });
      addLog(`  DEEP fee coin: ${deepAmountForFees > 0 ? '0.1 DEEP' : 'zero (no DEEP available)'}`);

      // Build the swap transaction using params API
      const swapParams = {
        tx,
        config: CONFIG,
        poolKey,
        inputCoin,
        deepCoin,
        minOutput,
        senderAddress: account.address,
      };

      const [baseOut, quoteOut, deepOut] = isBaseToQuote
        ? swapExactBaseForQuote(swapParams)
        : swapExactQuoteForBase(swapParams);

      // IMPORTANT: Transfer ALL outputs to sender to avoid UnusedValueWithoutDrop
      tx.transferObjects([baseOut, quoteOut, deepOut], account.address);

      signAndExecute(
        { transaction: tx as any },
        {
          onSuccess: (result) => {
            const explorerUrl = getExplorerUrl(NETWORK, result.digest);
            addLog(`✅ Swap transaction submitted!`);
            addLog(`📎 View on explorer: ${explorerUrl}`);
            addLog(`⏳ Check your wallet for ${toToken.symbol} balance`);
            addLog(`ℹ️ Note: Testnet pools may have low liquidity`);
            setLastTx(result.digest);
            setFromAmount('');
            setToAmount('');
          },
          onError: (error) => {
            addLog(`❌ Swap failed: ${error.message}`);
            // Parse common errors
            if (error.message.includes('InsufficientCoinBalance')) {
              addLog(`💡 Tip: You may not have enough tokens for this swap`);
            } else if (error.message.includes('InsufficientLiquidity') || error.message.includes('EINSUFFICIENT')) {
              addLog(`💡 Tip: Pool may have insufficient liquidity`);
            }
            console.error('Swap error:', error);
          },
        }
      );
    } catch (error: any) {
      addLog(`❌ Error: ${error.message}`);
      console.error('Swap error:', error);
    }
  }, [account, fromAmount, fromToken, toToken, toAmount, slippage, getPoolInfo, signAndExecute, addLog, userCoinObjects]);

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="w-full max-w-[600px] mx-auto px-6 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Swap</h1>
            <p className="text-gray-400">Trade tokens via DeepBook CLOB</p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`px-3 py-1.5 rounded-lg text-sm ${
              NETWORK === 'mainnet'
                ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
            }`}>
              {NETWORK}
            </span>
          </div>
        </div>

        {/* Swap Card */}
        <div className="bg-gray-900/50 rounded-2xl p-6 border border-gray-800">
          {/* From Token */}
          <div className="mb-2">
            <div className="flex justify-between text-sm text-gray-400 mb-2">
              <span>From</span>
              <span>
                Balance: {formatBalance(balances[fromToken.symbol] || BigInt(0), fromToken.decimals)} {fromToken.symbol}
              </span>
            </div>
            <div className="flex gap-3 bg-black rounded-xl p-4 border border-gray-800">
              <input
                type="number"
                value={fromAmount}
                onChange={(e) => setFromAmount(e.target.value)}
                placeholder="0.0"
                className="flex-1 bg-transparent text-2xl outline-none"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSetMax}
                  className="px-2 py-1 text-xs text-sky-400 hover:text-sky-300 transition-colors"
                >
                  MAX
                </button>
                <select
                  value={fromToken.symbol}
                  onChange={(e) => {
                    const token = AVAILABLE_TOKENS.find(t => t.symbol === e.target.value);
                    if (token) setFromToken(token);
                  }}
                  className="bg-gray-800 rounded-lg px-3 py-2 outline-none text-base"
                >
                  {AVAILABLE_TOKENS.map(token => (
                    <option key={token.symbol} value={token.symbol}>{token.symbol}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Swap Direction Button */}
          <div className="flex justify-center -my-2 relative z-10">
            <button
              onClick={handleSwapDirection}
              className="p-2 bg-gray-800 hover:bg-gray-700 rounded-lg border border-gray-700 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </button>
          </div>

          {/* To Token */}
          <div className="mt-2">
            <div className="flex justify-between text-sm text-gray-400 mb-2">
              <span>To</span>
              <span>
                Balance: {formatBalance(balances[toToken.symbol] || BigInt(0), toToken.decimals)} {toToken.symbol}
              </span>
            </div>
            <div className="flex gap-3 bg-black rounded-xl p-4 border border-gray-800">
              <input
                type="number"
                value={toAmount}
                readOnly
                placeholder="0.0"
                className="flex-1 bg-transparent text-2xl outline-none text-gray-300"
              />
              <select
                value={toToken.symbol}
                onChange={(e) => {
                  const token = AVAILABLE_TOKENS.find(t => t.symbol === e.target.value);
                  if (token) setToToken(token);
                }}
                className="bg-gray-800 rounded-lg px-3 py-2 outline-none text-base"
              >
                {AVAILABLE_TOKENS.map(token => (
                  <option key={token.symbol} value={token.symbol}>{token.symbol}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Trade Info */}
          {fromAmount && toAmount && (
            <div className="mt-4 p-4 bg-black/50 rounded-xl space-y-2 text-sm">
              <div className="flex justify-between text-gray-400">
                <span>Rate</span>
                <span className="text-white">
                  1 {fromToken.symbol} = {(parseFloat(toAmount) / parseFloat(fromAmount)).toFixed(6)} {toToken.symbol}
                </span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Slippage Tolerance</span>
                <span className="text-white">{slippage}%</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Pool</span>
                <span className="text-sky-400">{getPoolInfo()?.poolKey || 'No pool'}</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>DEEP Balance</span>
                <span className="text-white">{fromUnits(balances['DEEP'] || BigInt(0), 6).toFixed(4)}</span>
              </div>
            </div>
          )}

          {/* Slippage Settings */}
          <div className="mt-4">
            <div className="flex justify-between items-center text-sm text-gray-400 mb-2">
              <span>Slippage Tolerance</span>
            </div>
            <div className="flex gap-2">
              {[0.1, 0.5, 1.0, 2.0].map(value => (
                <button
                  key={value}
                  onClick={() => setSlippage(value)}
                  className={`flex-1 py-2 rounded-lg text-sm transition-colors ${
                    slippage === value
                      ? 'bg-sky-500 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {value}%
                </button>
              ))}
            </div>
          </div>

          {/* Swap Button */}
          <button
            onClick={handleSwap}
            disabled={isPending || !account || !fromAmount || parseFloat(fromAmount) <= 0 || !getPoolInfo()}
            className="w-full mt-6 py-4 bg-sky-500 hover:bg-sky-400 rounded-xl font-semibold text-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? 'Swapping...' : !account ? 'Connect Wallet' : !getPoolInfo() ? 'No Pool Available' : 'Swap'}
          </button>
        </div>

        {/* Activity Log */}
        <div className="mt-6 bg-gray-900/50 rounded-xl p-4 border border-gray-800">
          <h3 className="text-sm font-medium text-gray-300 mb-3">Activity</h3>
          <div className="bg-black/50 rounded-lg p-3 h-32 overflow-y-auto font-mono text-xs">
            {logs.length === 0 ? (
              <p className="text-gray-500">No activity yet...</p>
            ) : (
              logs.map((log, i) => (
                <p key={i} className="text-gray-400 mb-1">{log}</p>
              ))
            )}
          </div>
        </div>

        {/* Last Transaction */}
        {lastTx && (
          <div className="mt-4 p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
            <p className="text-sm text-green-400">
              Last swap: <a
                href={getExplorerUrl(NETWORK, lastTx)}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-green-300"
              >
                {lastTx.slice(0, 20)}...
              </a>
            </p>
          </div>
        )}

        {/* DeepBook Info */}
        <div className="mt-6 text-center text-sm text-gray-500">
          <p>Powered by DeepBook V3 CLOB</p>
          <p className="mt-1">Zero slippage for limit orders • Deep liquidity</p>
        </div>
      </div>
    </div>
  );
}
