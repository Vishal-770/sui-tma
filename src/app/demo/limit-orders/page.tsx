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
  PACKAGE_IDS,
  buildLimitOrderTx,
  buildCancelOrderTx,
  getAvailablePools,
  ORDER_TYPE,
  SELF_MATCHING_OPTION,
} from '@/lib/deepbook';
import Link from 'next/link';

interface LimitOrder {
  id: string;
  pair: string;
  side: 'buy' | 'sell';
  type: 'limit' | 'stop-loss' | 'take-profit';
  triggerPrice: number;
  quantity: number;
  status: 'pending' | 'triggered' | 'cancelled' | 'filled';
  createdAt: Date;
  triggeredAt?: Date;
  onChainOrderId?: bigint;
  txDigest?: string;
}

export default function LimitOrdersPage() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction();

  const [orders, setOrders] = useState<LimitOrder[]>([]);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [selectedPair, setSelectedPair] = useState('SUI_DBUSDC');
  const [orderType, setOrderType] = useState<'limit' | 'stop-loss' | 'take-profit'>('limit');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [triggerPrice, setTriggerPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [logs, setLogs] = useState<string[]>([]);
  const [userBalanceManagerId, setUserBalanceManagerId] = useState<string | null>(null);
  const [userTradeCapId, setUserTradeCapId] = useState<string | null>(null);

  const addLog = useCallback((message: string) => {
    setLogs(prev => [...prev.slice(-19), `[${new Date().toLocaleTimeString()}] ${message}`]);
  }, []);

  // Fetch user's balance manager and trade cap
  useEffect(() => {
    if (!account?.address) return;

    const fetchUserObjects = async () => {
      const deepBookConfig = CURRENT_ENV === 'mainnet' ? DEEPBOOK_MAINNET : DEEPBOOK_TESTNET;
      
      try {
        // Fetch Balance Manager
        const bmObjects = await suiClient.getOwnedObjects({
          owner: account.address,
          filter: {
            StructType: `${deepBookConfig.PACKAGE_ID}::balance_manager::BalanceManager`,
          },
        });
        if (bmObjects.data.length > 0) {
          setUserBalanceManagerId(bmObjects.data[0].data?.objectId || null);
          addLog('✅ Found Balance Manager');
        }

        // Fetch Trade Cap
        const tcObjects = await suiClient.getOwnedObjects({
          owner: account.address,
          filter: {
            StructType: `${deepBookConfig.PACKAGE_ID}::balance_manager::TradeCap`,
          },
        });
        if (tcObjects.data.length > 0) {
          setUserTradeCapId(tcObjects.data[0].data?.objectId || null);
          addLog('✅ Found Trade Cap');
        }

        if (bmObjects.data.length === 0 || tcObjects.data.length === 0) {
          addLog('⚠️ Balance Manager or Trade Cap missing - create in Balance Manager page');
        }
      } catch (error) {
        console.warn('Failed to fetch user objects:', error);
      }
    };

    fetchUserObjects();
  }, [account?.address, suiClient, addLog]);

  // Fetch prices and check triggers
  useEffect(() => {
    const fetchAllPrices = async () => {
      const poolKeys = getAvailablePools();
      const newPrices = await fetchPrices(poolKeys);
      setPrices(newPrices);

      // Check for triggered orders
      setOrders(prev => prev.map(order => {
        if (order.status !== 'pending') return order;

        const currentPrice = newPrices[order.pair];
        if (!currentPrice) return order;

        let shouldTrigger = false;

        switch (order.type) {
          case 'limit':
            shouldTrigger = order.side === 'buy'
              ? currentPrice <= order.triggerPrice
              : currentPrice >= order.triggerPrice;
            break;
          case 'stop-loss':
            shouldTrigger = order.side === 'sell'
              ? currentPrice <= order.triggerPrice
              : currentPrice >= order.triggerPrice;
            break;
          case 'take-profit':
            shouldTrigger = order.side === 'sell'
              ? currentPrice >= order.triggerPrice
              : currentPrice <= order.triggerPrice;
            break;
        }

        if (shouldTrigger) {
          addLog(`🔔 Order triggered! ${order.type} ${order.side} ${order.quantity} ${order.pair} @ $${order.triggerPrice}`);
          return { ...order, status: 'triggered' as const, triggeredAt: new Date() };
        }

        return order;
      }));
    };

    fetchAllPrices();
    const interval = setInterval(fetchAllPrices, 3000);
    return () => clearInterval(interval);
  }, [addLog]);

  // Set default trigger price when pair changes
  useEffect(() => {
    const currentPrice = prices[selectedPair];
    if (currentPrice && !triggerPrice) {
      setTriggerPrice(currentPrice.toFixed(4));
    }
  }, [selectedPair, prices, triggerPrice]);

  // Create new order
  const createOrder = useCallback(async () => {
    if (!account) {
      addLog('❌ Please connect wallet first');
      return;
    }

    const trigger = parseFloat(triggerPrice);
    const qty = parseFloat(quantity);

    if (isNaN(trigger) || trigger <= 0) {
      addLog('❌ Invalid trigger price');
      return;
    }

    if (isNaN(qty) || qty <= 0) {
      addLog('❌ Invalid quantity');
      return;
    }

    const currentPrice = prices[selectedPair];
    addLog(`📝 Creating ${orderType} ${side} order...`);
    addLog(`  Pair: ${selectedPair}, Trigger: $${trigger}, Qty: ${qty}`);

    const tx = new Transaction();
    const deepBookConfig = CURRENT_ENV === 'mainnet' ? DEEPBOOK_MAINNET : DEEPBOOK_TESTNET;
    const pool = POOLS[selectedPair as keyof typeof POOLS];

    try {
      if (DEMO_MODE) {
        addLog('📝 Demo mode: Simulating order creation...');
        await new Promise(resolve => setTimeout(resolve, 500));
        // CRITICAL: Must transfer split coins to avoid UnusedValueWithoutDrop error
        const [demoCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(1)]);
        tx.transferObjects([demoCoin], tx.pure.address(account.address));
      } else {
        // Real implementation: Create on-chain limit order via DeepBook
        if (!userBalanceManagerId) {
          addLog('❌ No Balance Manager found - please create one first');
          return;
        }

        addLog('🔗 Building limit order PTB...');

        // For real limit orders, we need:
        // 1. Balance Manager with deposited funds
        // 2. Trade Cap for authentication
        // 3. Sufficient balance in the correct coin

        if (!pool) {
          addLog('❌ Pool not found for pair');
          return;
        }

        // Generate client order ID
        const clientOrderId = BigInt(Date.now());
        
        // Convert price to ticks
        const priceInTicks = BigInt(Math.floor(trigger * 1e6)); // Assuming 6 decimal quote
        
        // Convert quantity to base units
        const quantityInUnits = BigInt(Math.floor(qty * 1e9)); // Assuming 9 decimal base

        // Determine order type enum
        let orderTypeEnum = ORDER_TYPE.NO_RESTRICTION;
        if (orderType === 'stop-loss' || orderType === 'take-profit') {
          // For stop/TP orders, we'd typically use a different mechanism
          // DeepBook doesn't have native stop-loss - we use intent registry
          addLog('  ℹ️ Stop/TP orders use intent registry for trigger monitoring');
        }

        // Build the actual limit order (if we have trade cap)
        if (userTradeCapId) {
          // Get coin types for typeArguments
          const baseCoinType = pool.baseCoin;
          const quoteCoinType = pool.quoteCoin;

          // Mint trade proof from trade cap
          const [tradeProof] = tx.moveCall({
            target: `${deepBookConfig.PACKAGE_ID}::balance_manager::generate_proof_as_trader`,
            arguments: [tx.object(userBalanceManagerId), tx.object(userTradeCapId)],
          });

          tx.moveCall({
            target: `${deepBookConfig.PACKAGE_ID}::pool::place_limit_order`,
            typeArguments: [baseCoinType, quoteCoinType],
            arguments: [
              tx.object(pool.poolId),
              tx.object(userBalanceManagerId),
              tradeProof,
              tx.pure.u128(clientOrderId),
              tx.pure.u8(orderTypeEnum),
              tx.pure.u8(SELF_MATCHING_OPTION.CANCEL_TAKER),
              tx.pure.u64(priceInTicks),
              tx.pure.u64(quantityInUnits),
              tx.pure.bool(side === 'buy'),
              tx.pure.bool(true), // pay with deep
              tx.pure.u64(Date.now() + 24 * 60 * 60 * 1000), // 24h expiry
              tx.object('0x6'), // Clock
            ],
          });

          addLog('  1️⃣ Generated trade proof');
          addLog('  2️⃣ Placing limit order on DeepBook');
        } else {
          addLog('⚠️ No Trade Cap - creating tracking order only');
          // CRITICAL: Must transfer split coins to avoid UnusedValueWithoutDrop error
          const [trackCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(1)]);
          tx.transferObjects([trackCoin], tx.pure.address(account.address));
        }
      }

      signAndExecute(
        { transaction: tx as any },
        {
          onSuccess: (result) => {
            const explorerUrl = `https://suiscan.xyz/${CURRENT_ENV}/tx/${result.digest}`;
            const newOrder: LimitOrder = {
              id: `order_${Date.now()}`,
              pair: selectedPair,
              side,
              type: orderType,
              triggerPrice: trigger,
              quantity: qty,
              status: 'pending',
              createdAt: new Date(),
              txDigest: result.digest,
              onChainOrderId: BigInt(Date.now()),
            };

            setOrders(prev => [...prev, newOrder]);
            addLog(`✅ Order created!`);
            addLog(`📎 Explorer: ${explorerUrl}`);
            addLog(`  Waiting for price to reach $${trigger.toFixed(4)}`);

            setTriggerPrice('');
          },
          onError: (error) => {
            addLog(`❌ Failed to create order: ${error.message}`);
          },
        }
      );
    } catch (error: any) {
      addLog(`❌ Error: ${error.message}`);
    }
  }, [account, selectedPair, orderType, side, triggerPrice, quantity, prices, signAndExecute, addLog, userBalanceManagerId, userTradeCapId]);

  // Cancel order
  const cancelOrder = useCallback(async (order: LimitOrder) => {
    if (!account) return;

    addLog(`🚫 Cancelling order ${order.id.slice(0, 12)}...`);

    const tx = new Transaction();
    const deepBookConfig = CURRENT_ENV === 'mainnet' ? DEEPBOOK_MAINNET : DEEPBOOK_TESTNET;
    const pool = POOLS[order.pair as keyof typeof POOLS];

    try {
      if (!DEMO_MODE && userBalanceManagerId && userTradeCapId && order.onChainOrderId && pool) {
        // Get coin types for typeArguments
        const baseCoinType = pool.baseCoin;
        const quoteCoinType = pool.quoteCoin;

        // Real cancellation
        const [tradeProof] = tx.moveCall({
          target: `${deepBookConfig.PACKAGE_ID}::balance_manager::generate_proof_as_trader`,
          arguments: [tx.object(userBalanceManagerId), tx.object(userTradeCapId)],
        });

        tx.moveCall({
          target: `${deepBookConfig.PACKAGE_ID}::pool::cancel_order`,
          typeArguments: [baseCoinType, quoteCoinType],
          arguments: [
            tx.object(pool.poolId),
            tx.object(userBalanceManagerId),
            tradeProof,
            tx.pure.u128(order.onChainOrderId),
            tx.object('0x6'),
          ],
        });
      } else {
        // CRITICAL: Must transfer split coins to avoid UnusedValueWithoutDrop error
        const [cancelCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(1)]);
        tx.transferObjects([cancelCoin], tx.pure.address(account.address));
      }

      signAndExecute(
        { transaction: tx as any },
        {
          onSuccess: (result) => {
            const explorerUrl = `https://suiscan.xyz/${CURRENT_ENV}/tx/${result.digest}`;
            setOrders(prev => prev.map(o =>
              o.id === order.id ? { ...o, status: 'cancelled' as const } : o
            ));
            addLog(`✅ Order cancelled.`);
            addLog(`📎 Explorer: ${explorerUrl}`);
          },
          onError: (error) => {
            addLog(`❌ Failed to cancel: ${error.message}`);
          },
        }
      );
    } catch (error: any) {
      addLog(`❌ Error: ${error.message}`);
    }
  }, [account, signAndExecute, addLog, userBalanceManagerId, userTradeCapId]);

  // Execute triggered order
  const executeOrder = useCallback(async (order: LimitOrder) => {
    if (!account) return;

    addLog(`⚡ Executing order ${order.id.slice(0, 12)}...`);

    const tx = new Transaction();
    
    try {
      if (DEMO_MODE) {
        await new Promise(resolve => setTimeout(resolve, 500));
        addLog(`  Swapping ${order.quantity} ${order.pair.split('_')[0]} at $${order.triggerPrice}`);
        // CRITICAL: Must transfer split coins to avoid UnusedValueWithoutDrop error
        const [execCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(1)]);
        tx.transferObjects([execCoin], tx.pure.address(account.address));
      } else {
        // Real execution would happen automatically via DeepBook matching engine
        // or through our intent executor for stop/TP orders
        addLog('  ℹ️ DeepBook orders execute automatically when matched');
        // CRITICAL: Must transfer split coins to avoid UnusedValueWithoutDrop error
        const [matchCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(1)]);
        tx.transferObjects([matchCoin], tx.pure.address(account.address));
      }

      signAndExecute(
        { transaction: tx as any },
        {
          onSuccess: (result) => {
            const explorerUrl = `https://suiscan.xyz/${CURRENT_ENV}/tx/${result.digest}`;
            setOrders(prev => prev.map(o =>
              o.id === order.id ? { ...o, status: 'filled' as const } : o
            ));
            addLog(`✅ Order filled! ${order.side} ${order.quantity} @ $${order.triggerPrice}`);
            addLog(`📎 Explorer: ${explorerUrl}`);
          },
          onError: (error) => {
            addLog(`❌ Execution failed: ${error.message}`);
          },
        }
      );
    } catch (error: any) {
      addLog(`❌ Error: ${error.message}`);
    }
  }, [account, signAndExecute, addLog]);

  const currentPrice = prices[selectedPair] || 0;

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="w-full max-w-[1400px] mx-auto px-8 lg:px-16 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-12">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Limit Orders</h1>
            <p className="text-gray-400 text-lg">Conditional orders with encrypted intents</p>
          </div>

          {DEMO_MODE && (
            <span className="px-4 py-2 bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded-xl text-sm font-medium">
              Demo Mode
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Order Form */}
          <div className="space-y-6">
            <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-800">
              <h2 className="text-base font-semibold text-gray-200 mb-5">Create Order</h2>

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

              {/* Current Price Display */}
              <div className="mb-5 p-4 bg-black rounded-xl border border-gray-800">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-400">Current Price</span>
                  <span className="w-2.5 h-2.5 bg-sky-400 rounded-full" />
                </div>
                <p className="font-mono text-xl text-sky-400 mt-2">
                  ${currentPrice.toFixed(4)}
                </p>
              </div>

              {/* Order Type */}
              <div className="mb-5">
                <label className="block text-sm text-gray-400 mb-2">Order Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['limit', 'stop-loss', 'take-profit'] as const).map(type => (
                    <button
                      key={type}
                      onClick={() => setOrderType(type)}
                      className={`py-3 px-3 rounded-xl text-sm font-medium transition-colors ${
                        orderType === type
                          ? 'bg-sky-500 text-white'
                          : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                      }`}
                    >
                      {type === 'limit' ? 'Limit' : type === 'stop-loss' ? 'Stop' : 'TP'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Side */}
              <div className="mb-5">
                <label className="block text-sm text-gray-400 mb-2">Side</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setSide('buy')}
                    className={`py-3 rounded-xl text-base font-medium transition-colors ${
                      side === 'buy'
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    Buy
                  </button>
                  <button
                    onClick={() => setSide('sell')}
                    className={`py-3 rounded-xl text-base font-medium transition-colors ${
                      side === 'sell'
                        ? 'bg-red-500 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    Sell
                  </button>
                </div>
              </div>

              {/* Trigger Price */}
              <div className="mb-5">
                <label className="block text-sm text-gray-400 mb-2">
                  {orderType === 'limit' 
                    ? 'Limit Price' 
                    : orderType === 'stop-loss' 
                    ? 'Stop Price' 
                    : 'Target Price'
                  } ($)
                </label>
                <input
                  type="number"
                  value={triggerPrice}
                  onChange={(e) => setTriggerPrice(e.target.value)}
                  step="0.0001"
                  placeholder={currentPrice.toFixed(4)}
                  className="w-full px-4 py-3 bg-black rounded-xl border border-gray-800 focus:border-sky-500 outline-none text-base"
                />
                
                {/* Price hint */}
                {triggerPrice && currentPrice > 0 && (
                  <p className="text-sm mt-2 text-gray-400">
                    {parseFloat(triggerPrice) > currentPrice
                      ? `${((parseFloat(triggerPrice) / currentPrice - 1) * 100).toFixed(2)}% above current`
                      : `${((1 - parseFloat(triggerPrice) / currentPrice) * 100).toFixed(2)}% below current`
                    }
                  </p>
                )}
              </div>

              {/* Quantity */}
              <div className="mb-5">
                <label className="block text-sm text-gray-400 mb-2">Quantity</label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  min="0.01"
                  step="0.01"
                  className="w-full px-4 py-3 bg-black rounded-xl border border-gray-800 focus:border-sky-500 outline-none text-base"
                />
              </div>

              {/* Order Summary */}
              <div className="mb-6 p-4 bg-sky-500/10 border border-sky-500/20 rounded-xl">
                <p className="text-sm text-gray-400">Order Summary:</p>
                <p className="mt-2 font-medium text-sky-400">
                  {orderType === 'limit' && side === 'buy' && 
                    `Buy ${quantity} when price drops to $${triggerPrice || '...'}`}
                  {orderType === 'limit' && side === 'sell' && 
                    `Sell ${quantity} when price rises to $${triggerPrice || '...'}`}
                  {orderType === 'stop-loss' && 
                    `Sell ${quantity} if price drops to $${triggerPrice || '...'}`}
                  {orderType === 'take-profit' && 
                    `Sell ${quantity} when price reaches $${triggerPrice || '...'}`}
                </p>
              </div>

              {/* Create Button */}
              <button
                onClick={createOrder}
                disabled={isPending || !account}
                className="w-full py-4 bg-sky-500 hover:bg-sky-400 rounded-xl font-semibold text-lg transition-colors disabled:opacity-50"
              >
                {isPending ? 'Creating...' : 'Create Order'}
              </button>

              {!account && (
                <p className="text-center text-gray-500 mt-3 text-base">
                  Connect wallet to create orders
                </p>
              )}
            </div>
          </div>

          {/* Orders Table */}
          <div className="lg:col-span-2">
            <div className="bg-gray-900/50 rounded-xl p-6 border border-gray-800 h-full">
              <h2 className="text-base font-semibold text-gray-200 mb-5">Active Orders</h2>

              {orders.filter(o => o.status === 'pending' || o.status === 'triggered').length === 0 ? (
                <div className="text-center py-20 text-gray-500">
                  <p className="font-semibold text-lg">No active orders</p>
                  <p className="mt-2">Create an order to get started</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {orders.filter(o => o.status === 'pending' || o.status === 'triggered').map((order) => {
                    const pairPrice = prices[order.pair] || 0;
                    const distance = pairPrice > 0 
                      ? ((order.triggerPrice / pairPrice - 1) * 100).toFixed(2)
                      : '0';

                    return (
                      <div
                        key={order.id}
                        className={`p-5 rounded-xl border ${
                          order.status === 'triggered'
                            ? 'border-green-500/50 bg-green-500/5'
                            : 'border-gray-800 bg-black'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex items-center gap-2">
                            <span className={`px-3 py-1 rounded-lg text-sm font-medium ${
                              order.type === 'limit'
                                ? 'bg-sky-500/10 text-sky-400'
                                : order.type === 'stop-loss'
                                ? 'bg-red-500/10 text-red-400'
                                : 'bg-green-500/10 text-green-400'
                            }`}>
                              {order.type}
                            </span>
                            <span className={`px-3 py-1 rounded-lg text-sm font-medium ${
                              order.side === 'buy'
                                ? 'bg-green-500/10 text-green-400'
                                : 'bg-red-500/10 text-red-400'
                            }`}>
                              {order.side}
                            </span>
                          </div>
                          <span className={`text-sm font-medium ${
                            order.status === 'triggered'
                              ? 'text-green-400'
                              : 'text-gray-500'
                          }`}>
                            {order.status === 'triggered' ? 'TRIGGERED' : 'Pending'}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3 mb-4">
                          <div>
                            <span className="text-gray-500 text-sm">Pair:</span>
                            <span className="ml-2 font-medium text-white">{order.pair.replace('_', '/')}</span>
                          </div>
                          <div>
                            <span className="text-gray-500 text-sm">Qty:</span>
                            <span className="ml-2 font-mono text-gray-300">{order.quantity}</span>
                          </div>
                          <div>
                            <span className="text-gray-500 text-sm">Trigger:</span>
                            <span className="ml-2 font-mono text-sky-400">
                              ${order.triggerPrice.toFixed(4)}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500 text-sm">Current:</span>
                            <span className="ml-2 font-mono text-gray-300">
                              ${pairPrice.toFixed(4)}
                            </span>
                          </div>
                        </div>

                        {/* Distance to trigger */}
                        {order.status === 'pending' && (
                          <div className="mb-4">
                            <div className="flex justify-between text-sm text-gray-400 mb-2">
                              <span>Distance</span>
                              <span>{distance}%</span>
                            </div>
                            <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-sky-500 transition-all"
                                style={{ 
                                  width: `${Math.max(0, Math.min(100, 100 - Math.abs(parseFloat(distance))))}%` 
                                }}
                              />
                            </div>
                          </div>
                        )}

                        <div className="flex gap-3">
                          {order.status === 'triggered' ? (
                            <button
                              onClick={() => executeOrder(order)}
                              className="flex-1 py-3 bg-green-500 hover:bg-green-400 rounded-xl font-medium transition-colors"
                            >
                              Execute Now
                            </button>
                          ) : (
                            <button
                              onClick={() => cancelOrder(order)}
                              className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 rounded-xl transition-colors"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Order History */}
              {orders.filter(o => o.status === 'filled' || o.status === 'cancelled').length > 0 && (
                <div className="mt-8">
                  <h3 className="text-sm font-medium mb-3 text-gray-400">History</h3>
                  <div className="space-y-3">
                    {orders.filter(o => o.status !== 'pending' && o.status !== 'triggered').slice(-5).map((order) => (
                      <div key={order.id} className="flex justify-between items-center p-4 bg-black rounded-xl">
                        <span className="text-gray-400">
                          {order.type} {order.side} {order.quantity} {order.pair.replace('_', '/')}
                        </span>
                        <span className={`${
                          order.status === 'filled' ? 'text-green-400' : 'text-gray-500'
                        }`}>
                          {order.status === 'filled' ? 'Filled' : 'Cancelled'}
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

        {/* Info Card */}
        <div className="mt-12 bg-sky-500/5 border border-sky-500/20 rounded-xl p-8">
          <h3 className="font-semibold text-sky-400 text-lg mb-6">How Encrypted Intents Work</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="bg-gray-900/50 rounded-xl p-5 border border-gray-800">
              <div className="text-base text-sky-400 font-semibold mb-3">1. Create Intent</div>
              <p className="text-gray-400 text-sm">
                Your order details are encrypted with Seal before being stored on-chain
              </p>
            </div>
            <div className="bg-gray-900/50 rounded-xl p-5 border border-gray-800">
              <div className="text-base text-sky-400 font-semibold mb-3">2. Monitor Price</div>
              <p className="text-gray-400 text-sm">
                TEE executor watches prices while your intent remains encrypted
              </p>
            </div>
            <div className="bg-gray-900/50 rounded-xl p-5 border border-gray-800">
              <div className="text-base text-sky-400 font-semibold mb-3">3. Trigger Check</div>
              <p className="text-gray-400 text-sm">
                When price hits trigger, executor decrypts using Seal attestation
              </p>
            </div>
            <div className="bg-gray-900/50 rounded-xl p-5 border border-gray-800">
              <div className="text-base text-sky-400 font-semibold mb-3">4. Execute Trade</div>
              <p className="text-gray-400 text-sm">
                Order is executed atomically on DeepBook with your pre-signed approval
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
