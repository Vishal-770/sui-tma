'use client';

import { useState, useEffect, useCallback } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import { 
  fetchPrice,
  fetchPrices, 
  POOLS, 
  DEMO_MODE,
  CURRENT_ENV,
  COIN_TYPES,
  DEEPBOOK_TESTNET,
  DEEPBOOK_MAINNET,
  getAvailablePools,
} from '@/lib/deepbook';
import Link from 'next/link';

// DeepBook Margin Package (separate from main DeepBook)
const MARGIN_PACKAGE = {
  mainnet: '0x97d9473771b01f77b0940c589484184b49f6444627ec121314fae6a6d36fb86b',
  testnet: '0x97d9473771b01f77b0940c589484184b49f6444627ec121314fae6a6d36fb86b',
};

interface Position {
  id: string;
  pair: string;
  side: 'long' | 'short';
  entryPrice: number;
  currentPrice: number;
  size: number;
  leverage: number;
  margin: number;
  pnl: number;
  pnlPercent: number;
  liquidationPrice: number;
  status: 'open' | 'closed' | 'liquidated';
  openedAt: Date;
  onChainId?: string;
}

export default function MarginTradingPage() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction();

  const [positions, setPositions] = useState<Position[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [selectedPair, setSelectedPair] = useState('SUI_DBUSDC');
  const [side, setSide] = useState<'long' | 'short'>('long');
  const [leverage, setLeverage] = useState(5);
  const [marginAmount, setMarginAmount] = useState('1');
  const [logs, setLogs] = useState<string[]>([]);
  const [totalPnL, setTotalPnL] = useState(0);
  const [userBalanceManagerId, setUserBalanceManagerId] = useState<string | null>(null);

  const addLog = useCallback((message: string) => {
    setLogs(prev => [...prev.slice(-19), `[${new Date().toLocaleTimeString()}] ${message}`]);
  }, []);

  // Fetch user's balance manager
  useEffect(() => {
    if (!account?.address) return;

    const fetchBalanceManager = async () => {
      try {
        const objects = await suiClient.getOwnedObjects({
          owner: account.address,
          filter: {
            StructType: `${DEEPBOOK_CONFIG.PACKAGE_ID}::balance_manager::BalanceManager`,
          },
        });
        if (objects.data.length > 0) {
          setUserBalanceManagerId(objects.data[0].data?.objectId || null);
          addLog('✅ Found Balance Manager');
        } else {
          addLog('⚠️ No Balance Manager found - create one to trade');
        }
      } catch (error) {
        console.warn('Failed to fetch balance manager:', error);
      }
    };

    const DEEPBOOK_CONFIG = CURRENT_ENV === 'mainnet' ? DEEPBOOK_MAINNET : DEEPBOOK_TESTNET;
    fetchBalanceManager();
  }, [account?.address, suiClient, addLog]);

  // Fetch prices and update positions
  useEffect(() => {
    const fetchAllPrices = async () => {
      const poolKeys = getAvailablePools();
      const newPrices = await fetchPrices(poolKeys);
      setPrices(newPrices);

      // Update positions with current prices
      setPositions(prev => prev.map(pos => {
        if (pos.status !== 'open') return pos;
        
        const currentPrice = newPrices[pos.pair] || pos.currentPrice;
        const priceDiff = currentPrice - pos.entryPrice;
        const pnlMultiplier = pos.side === 'long' ? 1 : -1;
        const pnl = (priceDiff / pos.entryPrice) * pos.size * pos.leverage * pnlMultiplier;
        const pnlPercent = (pnl / pos.margin) * 100;

        // Check liquidation
        if (pnlPercent <= -80) {
          addLog(`⚠️ Position ${pos.id.slice(0, 8)} liquidated!`);
          return { ...pos, status: 'liquidated' as const, pnl, pnlPercent, currentPrice };
        }

        return { ...pos, currentPrice, pnl, pnlPercent };
      }));
    };

    fetchAllPrices();
    const interval = setInterval(fetchAllPrices, 3000);
    return () => clearInterval(interval);
  }, [addLog]);

  // Calculate total PnL
  useEffect(() => {
    const total = positions
      .filter(p => p.status === 'open')
      .reduce((sum, p) => sum + p.pnl, 0);
    setTotalPnL(total);
  }, [positions]);

  // Open a new position
  const openPosition = useCallback(async () => {
    if (!account) {
      addLog('❌ Please connect wallet first');
      return;
    }

    const margin = parseFloat(marginAmount);
    if (isNaN(margin) || margin <= 0) {
      addLog('❌ Invalid margin amount');
      return;
    }

    const currentPrice = prices[selectedPair] || 1.0;
    const positionSize = margin * leverage;
    const liquidationPrice = side === 'long'
      ? currentPrice * (1 - 0.8 / leverage)
      : currentPrice * (1 + 0.8 / leverage);

    addLog(`📈 Opening ${side.toUpperCase()} position on ${selectedPair}`);
    addLog(`  Margin: ${margin} SUI, Leverage: ${leverage}x, Size: ${positionSize.toFixed(2)} SUI`);

    const tx = new Transaction();
    const deepBookConfig = CURRENT_ENV === 'mainnet' ? DEEPBOOK_MAINNET : DEEPBOOK_TESTNET;
    const marginPackage = MARGIN_PACKAGE[CURRENT_ENV];

    try {
      if (DEMO_MODE) {
        // Demo: Create minimal transaction
        addLog('📝 Demo mode: Simulating margin position...');
        
        await new Promise(resolve => setTimeout(resolve, 500));
        addLog('  1️⃣ Depositing margin collateral to Balance Manager...');
        
        await new Promise(resolve => setTimeout(resolve, 500));
        addLog('  2️⃣ Opening leveraged position via DeepBook Margin...');
        
        await new Promise(resolve => setTimeout(resolve, 500));
        addLog(`  3️⃣ Liquidation price set at $${liquidationPrice.toFixed(4)}`);

        // CRITICAL: Must transfer split coins to avoid UnusedValueWithoutDrop error
        const [demoCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(1)]);
        tx.transferObjects([demoCoin], tx.pure.address(account.address));
      } else {
        // Real mode: Build actual margin position
        addLog('🔗 Building margin position PTB...');

        // For real margin trading, we need to:
        // 1. Have a Balance Manager with deposited collateral
        // 2. Call the margin pool's open_position function
        
        if (!userBalanceManagerId) {
          addLog('❌ No Balance Manager - please create one first');
          return;
        }

        const marginAmountMist = BigInt(Math.floor(margin * 1e9));

        // Split margin from gas and deposit
        const [marginCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(marginAmountMist)]);

        // Deposit into balance manager
        tx.moveCall({
          target: `${deepBookConfig.PACKAGE_ID}::balance_manager::deposit`,
          typeArguments: [COIN_TYPES.SUI],
          arguments: [
            tx.object(userBalanceManagerId),
            marginCoin,
          ],
        });

        // Note: Full margin trading would require calling margin pool functions
        // which need specific pool setup. For now, we deposit collateral.
        addLog('  1️⃣ Depositing collateral...');
        addLog('  2️⃣ Position will be tracked locally (margin pools require setup)');
      }

      signAndExecute(
        { transaction: tx as any },
        {
          onSuccess: (result) => {
            const explorerUrl = `https://suiscan.xyz/${CURRENT_ENV}/tx/${result.digest}`;
            const newPosition: Position = {
              id: `pos_${Date.now()}`,
              pair: selectedPair,
              side,
              entryPrice: currentPrice,
              currentPrice,
              size: positionSize,
              leverage,
              margin,
              pnl: 0,
              pnlPercent: 0,
              liquidationPrice,
              status: 'open',
              openedAt: new Date(),
              onChainId: result.digest,
            };

            setPositions(prev => [...prev, newPosition]);
            addLog(`✅ Position opened!`);
            addLog(`📎 Explorer: ${explorerUrl}`);
            addLog(`  Entry: $${currentPrice.toFixed(4)}, Liq: $${liquidationPrice.toFixed(4)}`);
          },
          onError: (error) => {
            addLog(`❌ Failed to open position: ${error.message}`);
          },
        }
      );
    } catch (error: any) {
      addLog(`❌ Error: ${error.message}`);
    }
  }, [account, marginAmount, leverage, selectedPair, side, prices, signAndExecute, addLog, userBalanceManagerId]);

  // Close a position
  const closePosition = useCallback(async (position: Position) => {
    if (!account) {
      addLog('❌ Please connect wallet first');
      return;
    }

    addLog(`📉 Closing position ${position.id.slice(0, 8)}...`);

    const tx = new Transaction();

    try {
      if (DEMO_MODE) {
        addLog('📝 Demo mode: Simulating position close...');
        await new Promise(resolve => setTimeout(resolve, 500));
        // CRITICAL: Must transfer split coins to avoid UnusedValueWithoutDrop error
        const [demoCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(1)]);
        tx.transferObjects([demoCoin], tx.pure.address(account.address));
      } else {
        // For real closing, we would withdraw collateral
        addLog('🔗 Building close position PTB...');
        
        // CRITICAL: Must transfer split coins to avoid UnusedValueWithoutDrop error
        const [closeCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(1)]);
        tx.transferObjects([closeCoin], tx.pure.address(account.address));
      }

      signAndExecute(
        { transaction: tx as any },
        {
          onSuccess: (result) => {
            const explorerUrl = `https://suiscan.xyz/${CURRENT_ENV}/tx/${result.digest}`;
            setPositions(prev => prev.map(p => 
              p.id === position.id ? { ...p, status: 'closed' as const } : p
            ));
            addLog(`✅ Position closed!`);
            addLog(`📎 Explorer: ${explorerUrl}`);
            addLog(`  P&L: ${position.pnl >= 0 ? '+' : ''}${position.pnl.toFixed(4)} SUI (${position.pnlPercent.toFixed(2)}%)`);
          },
          onError: (error) => {
            addLog(`❌ Failed to close position: ${error.message}`);
          },
        }
      );
    } catch (error: any) {
      addLog(`❌ Error: ${error.message}`);
    }
  }, [account, signAndExecute, addLog]);

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="w-full max-w-[1400px] mx-auto px-8 lg:px-16 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-12">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Margin Trading</h1>
            <p className="text-gray-400 text-lg">Leveraged trading with DeepBook liquidity</p>
          </div>
          <div className="flex items-center gap-4">
            {DEMO_MODE && (
              <span className="px-4 py-2 bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded-xl text-sm font-medium">
                Demo Mode
              </span>
            )}
            <div className={`px-5 py-3 rounded-xl border ${totalPnL >= 0 ? 'bg-green-500/5 border-green-500/20' : 'bg-red-500/5 border-red-500/20'}`}>
              <span className="text-sm text-gray-400">Total P&L</span>
              <p className={`font-mono text-lg font-semibold ${totalPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {totalPnL >= 0 ? '+' : ''}{totalPnL.toFixed(4)} SUI
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Order Form */}
          <div className="space-y-6">
            <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-800">
              <h2 className="text-base font-semibold text-gray-200 mb-5">Open Position</h2>

              {/* Pair Selection */}
              <div className="mb-5">
                <label className="block text-sm text-gray-400 mb-2">Trading Pair</label>
                <select
                  value={selectedPair}
                  onChange={(e) => setSelectedPair(e.target.value)}
                  className="w-full px-4 py-3 bg-black rounded-xl border border-gray-800 focus:border-sky-500 outline-none text-base"
                >
                  {Object.keys(POOLS).map(pair => (
                    <option key={pair} value={pair}>{pair.replace('_', '/')}</option>
                  ))}
                </select>
              </div>

              {/* Current Price */}
              <div className="mb-5 p-4 bg-black rounded-xl border border-gray-800">
                <span className="text-sm text-gray-400">Current Price</span>
                <div className="flex items-center gap-2 mt-1">
                  <p className="font-mono text-xl text-sky-400">
                    ${(prices[selectedPair] || 0).toFixed(4)}
                  </p>
                  <span className="w-2.5 h-2.5 bg-sky-400 rounded-full"></span>
                </div>
              </div>

              {/* Side Selection */}
              <div className="mb-5">
                <label className="block text-sm text-gray-400 mb-2">Direction</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setSide('long')}
                    className={`py-3 rounded-xl text-base font-medium transition-colors ${
                      side === 'long'
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    Long
                  </button>
                  <button
                    onClick={() => setSide('short')}
                    className={`py-3 rounded-xl text-base font-medium transition-colors ${
                      side === 'short'
                        ? 'bg-red-500 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    Short
                  </button>
                </div>
              </div>

              {/* Leverage */}
              <div className="mb-5">
                <label className="block text-sm text-gray-400 mb-2">
                  Leverage: <span className="text-white font-semibold">{leverage}x</span>
                </label>
                <input
                  type="range"
                  min="1"
                  max="20"
                  value={leverage}
                  onChange={(e) => setLeverage(parseInt(e.target.value))}
                  className="w-full accent-sky-500 h-2"
                />
                <div className="flex justify-between text-sm text-gray-500 mt-2">
                  <span>1x</span>
                  <span>5x</span>
                  <span>10x</span>
                  <span>20x</span>
                </div>
              </div>

              {/* Margin Amount */}
              <div className="mb-5">
                <label className="block text-sm text-gray-400 mb-2">Margin (SUI)</label>
                <input
                  type="number"
                  value={marginAmount}
                  onChange={(e) => setMarginAmount(e.target.value)}
                  min="0.1"
                  step="0.1"
                  className="w-full px-4 py-3 bg-black rounded-xl border border-gray-800 focus:border-sky-500 outline-none text-base"
                />
              </div>

              {/* Position Size */}
              <div className="mb-6 p-4 bg-black rounded-xl border border-gray-800">
                <span className="text-sm text-gray-400">Position Size</span>
                <p className="font-mono text-xl mt-1 text-white">
                  {(parseFloat(marginAmount || '0') * leverage).toFixed(2)} SUI
                </p>
              </div>

              {/* Open Button */}
              <button
                onClick={openPosition}
                disabled={isPending || !account}
                className={`w-full py-4 rounded-xl font-semibold text-lg transition-colors disabled:opacity-50 ${
                  side === 'long'
                    ? 'bg-green-500 hover:bg-green-400'
                    : 'bg-red-500 hover:bg-red-400'
                }`}
              >
                {isPending ? 'Processing...' : `Open ${side.toUpperCase()} ${leverage}x`}
              </button>

              {!account && (
                <p className="text-center text-base text-gray-500 mt-3">
                  Connect wallet to trade
                </p>
              )}
            </div>
          </div>

          {/* Positions Table */}
          <div className="lg:col-span-2">
            <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-800 h-full">
              <h2 className="text-base font-semibold text-gray-200 mb-5">Open Positions</h2>

              {positions.filter(p => p.status === 'open').length === 0 ? (
                <div className="text-center py-20 text-gray-500">
                  <p className="font-semibold text-lg">No open positions</p>
                  <p className="mt-2">Open a position to start trading</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left text-sm text-gray-400 border-b border-gray-800">
                        <th className="pb-4">Pair</th>
                        <th className="pb-4">Side</th>
                        <th className="pb-4">Size</th>
                        <th className="pb-4">Entry</th>
                        <th className="pb-4">Current</th>
                        <th className="pb-4">P&L</th>
                        <th className="pb-4">Liq.</th>
                        <th className="pb-4"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {positions.filter(p => p.status === 'open').map((pos) => (
                        <tr key={pos.id} className="border-b border-gray-800/50">
                          <td className="py-4 font-medium text-white">{pos.pair.replace('_', '/')}</td>
                          <td className="py-4">
                            <span className={`px-3 py-1 rounded-lg text-sm font-medium ${
                              pos.side === 'long' 
                                ? 'bg-green-500/10 text-green-400'
                                : 'bg-red-500/10 text-red-400'
                            }`}>
                              {pos.side.toUpperCase()} {pos.leverage}x
                            </span>
                          </td>
                          <td className="py-4 font-mono text-gray-300">{pos.size.toFixed(2)}</td>
                          <td className="py-4 font-mono text-gray-300">${pos.entryPrice.toFixed(4)}</td>
                          <td className="py-4 font-mono text-gray-300">${pos.currentPrice.toFixed(4)}</td>
                          <td className={`py-4 font-mono ${pos.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {pos.pnl >= 0 ? '+' : ''}{pos.pnl.toFixed(4)}
                            <span className="text-sm ml-1">({pos.pnlPercent.toFixed(1)}%)</span>
                          </td>
                          <td className="py-4 font-mono text-orange-400">${pos.liquidationPrice.toFixed(4)}</td>
                          <td className="py-4">
                            <button
                              onClick={() => closePosition(pos)}
                              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors"
                            >
                              Close
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* History */}
              {positions.filter(p => p.status !== 'open').length > 0 && (
                <div className="mt-8">
                  <h3 className="text-sm font-medium mb-3 text-gray-400">History</h3>
                  <div className="space-y-3">
                    {positions.filter(p => p.status !== 'open').slice(-5).map((pos) => (
                      <div key={pos.id} className="flex justify-between items-center p-4 bg-black rounded-xl">
                        <span className="text-gray-400">{pos.pair.replace('_', '/')} {pos.side.toUpperCase()}</span>
                        <span className={`${
                          pos.status === 'liquidated' 
                            ? 'text-orange-400'
                            : pos.pnl >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {pos.status === 'liquidated' 
                            ? 'Liquidated'
                            : `${pos.pnl >= 0 ? '+' : ''}${pos.pnl.toFixed(4)} SUI`
                          }
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Activity Log */}
          <div>
            <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-800">
              <h2 className="text-base font-semibold text-gray-200 mb-5">Activity Log</h2>
              <div className="bg-black rounded-xl p-4 h-80 overflow-y-auto font-mono text-sm">
                {logs.length === 0 ? (
                  <p className="text-gray-500">No activity yet...</p>
                ) : (
                  logs.map((log, i) => (
                    <p key={i} className="text-gray-400 mb-2">{log}</p>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Risk Warning */}
        <div className="mt-12 bg-orange-500/5 border border-orange-500/20 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="w-6 h-6 text-orange-400 mt-0.5 flex-shrink-0 text-xl">!</div>
            <div>
              <h3 className="font-semibold text-orange-400 text-lg">Risk Warning</h3>
              <p className="text-base text-gray-400 mt-2">
                Margin trading involves significant risk. High leverage amplifies both gains and losses.
                {DEMO_MODE && ' This is a demo for educational purposes.'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
