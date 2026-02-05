'use client';

import { useState, useEffect, useCallback } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import {
  fetchPrice,
  POOLS,
  DEMO_MODE,
  CURRENT_ENV,
  COIN_TYPES,
  COIN_DECIMALS,
  DEEPBOOK_TESTNET,
  DEEPBOOK_MAINNET,
  simulateTrade,
  buildCompleteSwapTx,
  getAvailablePools,
} from '@/lib/deepbook';
import Link from 'next/link';

interface TokenInfo {
  symbol: string;
  name: string;
  decimals: number;
  coinType: string;
  balance?: bigint;
}

const AVAILABLE_TOKENS: TokenInfo[] = [
  { symbol: 'SUI', name: 'Sui', decimals: 9, coinType: COIN_TYPES.SUI },
  { symbol: 'DEEP', name: 'DeepBook', decimals: 6, coinType: COIN_TYPES.DEEP },
  { symbol: 'DBUSDC', name: 'DB USD Coin', decimals: 6, coinType: COIN_TYPES.DBUSDC },
  { symbol: 'DBUSDT', name: 'DB Tether', decimals: 6, coinType: COIN_TYPES.DBUSDT },
];

export default function SwapPage() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction();

  const [fromToken, setFromToken] = useState<TokenInfo>(AVAILABLE_TOKENS[0]); // SUI
  const [toToken, setToToken] = useState<TokenInfo>(AVAILABLE_TOKENS[2]); // DBUSDC
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [slippage, setSlippage] = useState(0.5);
  const [price, setPrice] = useState(0);
  const [priceImpact, setPriceImpact] = useState(0);
  const [isLoadingQuote, setIsLoadingQuote] = useState(false);
  const [balances, setBalances] = useState<Record<string, bigint>>({});
  const [userCoinObjects, setUserCoinObjects] = useState<Record<string, string[]>>({});
  const [logs, setLogs] = useState<string[]>([]);
  const [lastTx, setLastTx] = useState<string | null>(null);

  const addLog = useCallback((message: string) => {
    setLogs(prev => [...prev.slice(-9), `[${new Date().toLocaleTimeString()}] ${message}`]);
  }, []);

  // Get pool key for current pair
  const getPoolKey = useCallback(() => {
    const possibleKeys = [
      `${fromToken.symbol}_${toToken.symbol}`,
      `${toToken.symbol}_${fromToken.symbol}`,
    ];
    const availablePools = getAvailablePools();
    return possibleKeys.find(key => availablePools.includes(key)) || null;
  }, [fromToken, toToken]);

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

      setBalances(newBalances);
      setUserCoinObjects(newCoinObjects);
    };

    fetchBalances();
    const interval = setInterval(fetchBalances, 10000);
    return () => clearInterval(interval);
  }, [account?.address, suiClient]);

  // Fetch price when tokens change
  useEffect(() => {
    const poolKey = getPoolKey();
    if (!poolKey) {
      setPrice(0);
      return;
    }

    const updatePrice = async () => {
      const fetchedPrice = await fetchPrice(poolKey);
      setPrice(fetchedPrice);
    };

    updatePrice();
    const interval = setInterval(updatePrice, 5000);
    return () => clearInterval(interval);
  }, [getPoolKey]);

  // Calculate output amount when input changes
  useEffect(() => {
    if (!fromAmount || parseFloat(fromAmount) <= 0 || price <= 0) {
      setToAmount('');
      setPriceImpact(0);
      return;
    }

    const calculate = async () => {
      setIsLoadingQuote(true);
      try {
        const poolKey = getPoolKey();
        if (!poolKey) {
          setToAmount('');
          return;
        }

        const simulation = await simulateTrade(
          poolKey,
          fromToken.symbol === poolKey.split('_')[0] ? 'sell' : 'buy',
          parseFloat(fromAmount)
        );

        setToAmount(simulation.minimumReceived.toFixed(6));
        setPriceImpact(simulation.priceImpact);
      } catch (error) {
        console.warn('Failed to calculate:', error);
      } finally {
        setIsLoadingQuote(false);
      }
    };

    const debounce = setTimeout(calculate, 300);
    return () => clearTimeout(debounce);
  }, [fromAmount, fromToken, toToken, price, getPoolKey]);

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

    const poolKey = getPoolKey();
    if (!poolKey) {
      addLog('❌ No pool available for this pair');
      return;
    }

    const amount = parseFloat(fromAmount);
    if (isNaN(amount) || amount <= 0) {
      addLog('❌ Invalid amount');
      return;
    }

    addLog(`🔄 Swapping ${fromAmount} ${fromToken.symbol} → ${toToken.symbol}...`);

    const tx = new Transaction();
    const deepBookConfig = CURRENT_ENV === 'mainnet' ? DEEPBOOK_MAINNET : DEEPBOOK_TESTNET;

    try {
      if (DEMO_MODE) {
        addLog('📝 Demo mode: Simulating swap...');
        await new Promise(resolve => setTimeout(resolve, 500));
        addLog(`  Input: ${fromAmount} ${fromToken.symbol}`);
        addLog(`  Output: ~${toAmount} ${toToken.symbol}`);
        // CRITICAL: Must transfer split coins to avoid UnusedValueWithoutDrop error
        const [demoCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(1)]);
        tx.transferObjects([demoCoin], tx.pure.address(account.address));
      } else {
        // Real swap implementation
        const inputCoins = userCoinObjects[fromToken.symbol] || [];
        const deepCoins = userCoinObjects['DEEP'] || [];

        if (inputCoins.length === 0) {
          addLog(`❌ No ${fromToken.symbol} coins found`);
          return;
        }

        const pool = POOLS[poolKey as keyof typeof POOLS];
        if (!pool) {
          addLog('❌ Pool not found');
          return;
        }

        const isBaseToQuote = fromToken.coinType === pool.baseCoin;
        const amountInUnits = BigInt(Math.floor(amount * Math.pow(10, fromToken.decimals)));
        const minOutput = BigInt(Math.floor(parseFloat(toAmount) * Math.pow(10, toToken.decimals) * (1 - slippage / 100)));

        addLog(`  Building swap transaction...`);
        addLog(`  Slippage: ${slippage}%, Min output: ${formatBalance(minOutput, toToken.decimals)}`);

        // Merge coins if needed
        let inputCoin;
        if (inputCoins.length === 1) {
          inputCoin = tx.object(inputCoins[0]);
        } else {
          tx.mergeCoins(
            tx.object(inputCoins[0]),
            inputCoins.slice(1).map(id => tx.object(id))
          );
          inputCoin = tx.object(inputCoins[0]);
        }

        // Split exact amount
        const [splitCoin] = tx.splitCoins(inputCoin, [tx.pure.u64(amountInUnits)]);

        // Handle DEEP coins for fees
        let deepCoin;
        if (deepCoins.length > 0) {
          if (deepCoins.length > 1) {
            tx.mergeCoins(
              tx.object(deepCoins[0]),
              deepCoins.slice(1).map(id => tx.object(id))
            );
          }
          const [splitDeep] = tx.splitCoins(tx.object(deepCoins[0]), [tx.pure.u64(BigInt(1000000))]); // 1 DEEP
          deepCoin = splitDeep;
        } else {
          // Zero DEEP coin (may fail if pool requires DEEP)
          addLog('⚠️ No DEEP tokens for fees');
          const [zeroCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(0)]);
          deepCoin = zeroCoin;
        }

        const functionName = isBaseToQuote ? 'swap_exact_base_for_quote' : 'swap_exact_quote_for_base';

        // Get coin types for typeArguments
        const baseCoinType = pool.baseCoin;
        const quoteCoinType = pool.quoteCoin;

        const [baseOut, quoteOut, deepOut] = tx.moveCall({
          target: `${deepBookConfig.PACKAGE_ID}::pool::${functionName}`,
          typeArguments: [baseCoinType, quoteCoinType],
          arguments: [
            tx.object(pool.poolId),
            splitCoin,
            deepCoin,
            tx.pure.u64(minOutput),
            tx.object('0x6'), // Clock
          ],
        });

        // Transfer outputs back to sender
        tx.transferObjects([baseOut, quoteOut, deepOut], tx.pure.address(account.address));
      }

      signAndExecute(
        { transaction: tx as any },
        {
          onSuccess: (result) => {
            const explorerUrl = `https://suiscan.xyz/${CURRENT_ENV}/tx/${result.digest}`;
            addLog(`✅ Swap successful!`);
            addLog(`📎 Explorer: ${explorerUrl}`);
            setLastTx(result.digest);
            setFromAmount('');
            setToAmount('');
          },
          onError: (error) => {
            addLog(`❌ Swap failed: ${error.message}`);
          },
        }
      );
    } catch (error: any) {
      addLog(`❌ Error: ${error.message}`);
    }
  }, [account, fromAmount, fromToken, toToken, toAmount, slippage, getPoolKey, signAndExecute, addLog, userCoinObjects]);

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
            {DEMO_MODE && (
              <span className="px-3 py-1.5 bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded-lg text-sm">
                Demo
              </span>
            )}
            <span className={`px-3 py-1.5 rounded-lg text-sm ${
              CURRENT_ENV === 'mainnet'
                ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
            }`}>
              {CURRENT_ENV}
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
                <span>Price Impact</span>
                <span className={priceImpact > 1 ? 'text-red-400' : 'text-green-400'}>
                  {priceImpact.toFixed(2)}%
                </span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Slippage Tolerance</span>
                <span className="text-white">{slippage}%</span>
              </div>
              <div className="flex justify-between text-gray-400">
                <span>Pool</span>
                <span className="text-sky-400">{getPoolKey() || 'No pool'}</span>
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
            disabled={isPending || !account || !fromAmount || parseFloat(fromAmount) <= 0 || !getPoolKey()}
            className="w-full mt-6 py-4 bg-sky-500 hover:bg-sky-400 rounded-xl font-semibold text-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? 'Swapping...' : !account ? 'Connect Wallet' : !getPoolKey() ? 'No Pool Available' : 'Swap'}
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
                href={`https://suiscan.xyz/${CURRENT_ENV}/tx/${lastTx}`}
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
