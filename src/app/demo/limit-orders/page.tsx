'use client';

import { useState, useEffect, useCallback } from 'react';
import { Transaction } from '@mysten/sui/transactions';
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import Link from 'next/link';
import {
  getConfig, getAvailablePoolKeys, getPoolInfo,
  createBalanceManager, generateTradeProofAsOwner,
  depositToBalanceManager, placeLimitOrder, 
  cancelOrder as dbCancelOrder,
  OrderType, SelfMatchingOption, type NetworkEnv,
} from '@/lib/deepbook-v3';

// Use testnet
const CURRENT_ENV: NetworkEnv = 'testnet';
const DEMO_MODE = false;

// Pool configurations
const config = getConfig(CURRENT_ENV);

interface LimitOrder {
  id: string;
  pair: string;
  side: 'buy' | 'sell';
  type: 'limit' | 'stop-loss' | 'take-profit';
  triggerPrice: number;
  quantity: number;
  status: 'pending' | 'triggered' | 'filled' | 'cancelled';
  createdAt: Date;
  triggeredAt?: Date;
  txDigest?: string;
  onChainOrderId?: bigint;
}

export default function LimitOrdersPage() {
  const [logs, setLogs] = useState<string[]>([]);
  const [orders, setOrders] = useState<LimitOrder[]>([]);
  const [selectedPair, setSelectedPair] = useState<string>('DEEP_SUI');
  const [orderType, setOrderType] = useState<'limit' | 'stop-loss' | 'take-profit'>('limit');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [triggerPrice, setTriggerPrice] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('10');
  const [prices, setPrices] = useState<Record<string, number>>({});
  
  // Balance Manager State
  const [userBalanceManagerId, setUserBalanceManagerId] = useState<string | null>(null);
  const [manualBmId, setManualBmId] = useState<string>('');
  const [depositAmount, setDepositAmount] = useState<string>('');
  const [depositCoinType, setDepositCoinType] = useState<string>('SUI');
  const [bmBalances, setBmBalances] = useState<Record<string, string>>({});
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);
  
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction();

  const addLog = useCallback((msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-50), `[${timestamp}] ${msg}`]);
    console.log(`[LimitOrders] ${msg}`);
  }, []);

  // Get available pools
  const getAvailablePools = useCallback(() => {
    return getAvailablePoolKeys(config);
  }, []);

  // Fetch prices from DeepBook
  const fetchPrices = useCallback(async (poolKeys: string[]): Promise<Record<string, number>> => {
    const newPrices: Record<string, number> = {};
    
    for (const poolKey of poolKeys) {
      const poolInfo = getPoolInfo(config, poolKey);
      if (!poolInfo) continue;
      
      try {
        // Get mid price from pool state
        const poolState = await suiClient.getObject({
          id: poolInfo.address,
          options: { showContent: true },
        });
        
        if (poolState.data?.content && 'fields' in poolState.data.content) {
          // Default simulation price if we can't read pool state
          if (poolKey === 'DEEP_SUI') {
            newPrices[poolKey] = 0.025; // ~$0.025 per DEEP
          } else if (poolKey === 'SUI_USDC') {
            newPrices[poolKey] = 4.2; // ~$4.20 per SUI
          } else if (poolKey === 'DEEP_USDC') {
            newPrices[poolKey] = 0.10; // ~$0.10 per DEEP
          } else {
            newPrices[poolKey] = 1.0;
          }
        }
      } catch (error) {
        // Use fallback prices
        if (poolKey === 'DEEP_SUI') newPrices[poolKey] = 0.025;
        else if (poolKey === 'SUI_USDC') newPrices[poolKey] = 4.2;
        else if (poolKey === 'DEEP_USDC') newPrices[poolKey] = 0.10;
        else newPrices[poolKey] = 1.0;
      }
    }
    
    return newPrices;
  }, [suiClient]);

  // Initialize
  useEffect(() => {
    addLog('Limit Orders page initialized');
    addLog(`Network: ${CURRENT_ENV}`);
    addLog(`DeepBook Package: ${config.packageId.slice(0, 20)}...`);
    
    // Load saved balance manager from localStorage
    const savedBm = localStorage.getItem(`balance_manager_${account?.address}`);
    if (savedBm) {
      setUserBalanceManagerId(savedBm);
      addLog(`[OK] Loaded Balance Manager: ${savedBm.slice(0, 20)}...`);
    }
  }, [addLog, account?.address]);

  // Clear Balance Manager
  const handleClearBalanceManager = useCallback(() => {
    // Clear state first, regardless of account
    setUserBalanceManagerId(null);
    setBmBalances({});
    
    // Then clear localStorage if account is available
    if (account?.address) {
      localStorage.removeItem(`balance_manager_${account.address}`);
    }
    addLog('Balance Manager cleared');
  }, [account?.address, addLog]);

  // Fetch Balance Manager balances
  const fetchBmBalances = useCallback(async () => {
    if (!userBalanceManagerId || !suiClient) return;
    
    setIsLoadingBalances(true);
    try {
      const bmObject = await suiClient.getObject({
        id: userBalanceManagerId,
        options: { showContent: true },
      });
      
      if (bmObject.data?.content && 'fields' in bmObject.data.content) {
        const fields = bmObject.data.content.fields as any;
        const balances: Record<string, string> = {};
        
        // Extract balances from the object (structure may vary)
        if (fields.balances && fields.balances.fields) {
          const balanceFields = fields.balances.fields;
          // Dynamic field structure - parse as needed
          addLog('  Balance Manager object found');
        }
        
        setBmBalances(balances);
      }
    } catch (error: any) {
      console.warn('Failed to fetch BM balances:', error);
    } finally {
      setIsLoadingBalances(false);
    }
  }, [userBalanceManagerId, suiClient, addLog]);

  // Fetch balances when balance manager changes
  useEffect(() => {
    if (userBalanceManagerId) {
      fetchBmBalances();
    }
  }, [userBalanceManagerId, fetchBmBalances]);

  // Fetch user's balance manager
  useEffect(() => {
    if (!account?.address) return;
    // Skip fetching if we already have one from localStorage
    if (userBalanceManagerId) return;

    const fetchUserObjects = async () => {
      try {
        // Search for any Balance Manager objects (the package ID may differ from DeepBook package)
        // The actual Balance Manager type is from a different package
        const BALANCE_MANAGER_PACKAGE = '0xfb28c4cbc6865bd1c897d26aecbe1f8792d1509a20ffec692c800660cbec6982';
        
        const bmObjects = await suiClient.getOwnedObjects({
          owner: account.address,
          filter: {
            StructType: `${BALANCE_MANAGER_PACKAGE}::balance_manager::BalanceManager`,
          },
        });
        
        if (bmObjects.data.length > 0) {
          const bmId = bmObjects.data[0].data?.objectId;
          if (bmId) {
            setUserBalanceManagerId(bmId);
            localStorage.setItem(`balance_manager_${account.address}`, bmId);
            addLog(`[OK] Found owned Balance Manager: ${bmId.slice(0, 20)}...`);
          }
        } else {
          addLog('[WARN] No owned Balance Manager found - create one or enter ID manually');
        }
      } catch (error) {
        console.warn('Failed to fetch balance manager:', error);
        addLog('[WARN] Could not auto-detect Balance Manager - enter ID manually if you have one');
      }
    };

    fetchUserObjects();
  }, [account?.address, suiClient, addLog, userBalanceManagerId]);

  // Fetch prices periodically
  useEffect(() => {
    const fetchAllPrices = async () => {
      const poolKeys = getAvailablePools();
      const newPrices = await fetchPrices(poolKeys);
      setPrices(newPrices);

      // Check for triggered orders (for demo/intent-based orders)
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
          addLog(`[TRIGGERED] Order: ${order.type} ${order.side} ${order.quantity} ${order.pair} @ ${order.triggerPrice}`);
          return { ...order, status: 'triggered' as const, triggeredAt: new Date() };
        }

        return order;
      }));
    };

    fetchAllPrices();
    const interval = setInterval(fetchAllPrices, 5000);
    return () => clearInterval(interval);
  }, [getAvailablePools, fetchPrices, addLog]);

  // Set default trigger price when pair changes
  useEffect(() => {
    const currentPrice = prices[selectedPair];
    if (currentPrice && !triggerPrice) {
      setTriggerPrice(currentPrice.toFixed(6));
    }
  }, [selectedPair, prices, triggerPrice]);

  // Create Balance Manager
  const handleCreateBalanceManager = useCallback(async () => {
    if (!account?.address) {
      addLog('[ERROR] Connect wallet first');
      return;
    }

    addLog('Creating Balance Manager...');
    const tx = new Transaction();

    try {
      const balanceManager = createBalanceManager({ tx, config });
      
      // Transfer to self (owner) - BalanceManager is an owned object initially
      tx.transferObjects([balanceManager], tx.pure.address(account.address));

      signAndExecute(
        { transaction: tx as any },
        {
          onSuccess: async (result) => {
            addLog(`[OK] Balance Manager created! TX: ${result.digest.slice(0, 20)}...`);
            addLog('Extracting Balance Manager ID from transaction...');
            
            try {
              // Wait for transaction to be confirmed and get full details
              const txDetails = await suiClient.waitForTransaction({
                digest: result.digest,
                options: {
                  showEffects: true,
                  showObjectChanges: true,
                  showEvents: true,
                },
              });
              
              // Extract Balance Manager ID from created objects
              let bmId: string | null = null;
              
              // Method 1: From objectChanges (created objects)
              if (txDetails.objectChanges) {
                const createdBm = txDetails.objectChanges.find(
                  (change: any) => change.type === 'created' && 
                    change.objectType?.includes('balance_manager::BalanceManager')
                );
                if (createdBm && 'objectId' in createdBm) {
                  bmId = createdBm.objectId;
                }
              }
              
              // Method 2: From events (BalanceManagerEvent)
              if (!bmId && txDetails.events) {
                const bmEvent = txDetails.events.find(
                  (e: any) => e.type?.includes('BalanceManagerEvent')
                );
                if (bmEvent) {
                  const parsed = bmEvent.parsedJson as any;
                  if (parsed?.balance_manager_id) {
                    bmId = parsed.balance_manager_id;
                  }
                }
              }
              
              // Method 3: From effects.created
              if (!bmId && txDetails.effects?.created) {
                const created = txDetails.effects.created[0];
                if (created?.reference?.objectId) {
                  bmId = created.reference.objectId;
                }
              }
              
              if (bmId) {
                setUserBalanceManagerId(bmId);
                localStorage.setItem(`balance_manager_${account.address}`, bmId);
                addLog(`[OK] Balance Manager ID: ${bmId}`);
              } else {
                addLog('[WARN] Could not extract Balance Manager ID automatically');
                addLog('  Check your wallet for the new Balance Manager object');
              }
            } catch (waitError: any) {
              addLog(`[WARN] Could not verify transaction: ${waitError.message}`);
              addLog('  The Balance Manager was likely created - check your wallet');
            }
          },
          onError: (error) => {
            addLog(`[ERROR] Failed: ${error.message}`);
          },
        }
      );
    } catch (error: any) {
      addLog(`[ERROR] ${error.message}`);
    }
  }, [account, signAndExecute, addLog, suiClient]);

  // Set manual Balance Manager ID
  const handleSetManualBmId = useCallback(() => {
    if (!manualBmId || !account?.address) return;
    
    setUserBalanceManagerId(manualBmId);
    localStorage.setItem(`balance_manager_${account.address}`, manualBmId);
    addLog(`[OK] Set Balance Manager: ${manualBmId.slice(0, 20)}...`);
    setManualBmId('');
  }, [manualBmId, account?.address, addLog]);

  // Deposit to Balance Manager
  const handleDeposit = useCallback(async () => {
    if (!account?.address || !userBalanceManagerId) {
      addLog('[ERROR] Need wallet and Balance Manager');
      return;
    }

    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      addLog('[ERROR] Invalid deposit amount');
      return;
    }

    addLog(`Depositing ${amount} ${depositCoinType}...`);
    const tx = new Transaction();

    try {
      // Get coin info from config
      const coinInfo = config.coins[depositCoinType];
      if (!coinInfo) {
        addLog(`[ERROR] Coin ${depositCoinType} not found in config. Available: ${Object.keys(config.coins).join(', ')}`);
        return;
      }
      if (!coinInfo.scalar || typeof coinInfo.scalar !== 'number') {
        addLog(`[ERROR] Invalid scalar for ${depositCoinType}: ${coinInfo.scalar}`);
        return;
      }
      const coinType = coinInfo.type;
      addLog(`  Coin type: ${coinType.slice(0, 30)}...`);
      addLog(`  Scalar: ${coinInfo.scalar}`);

      const amountUnits = BigInt(Math.floor(amount * coinInfo.scalar));
      addLog(`  Amount in units: ${amountUnits.toString()}`);

      // For SUI, split from gas
      if (depositCoinType === 'SUI') {
        const [depositCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountUnits)]);
        
        depositToBalanceManager({
          tx,
          config,
          balanceManagerId: userBalanceManagerId,
          coinSymbol: depositCoinType,
          coin: depositCoin,
        });
      } else {
        // For other coins, fetch and merge
        const coins = await suiClient.getCoins({
          owner: account.address,
          coinType,
        });

        if (coins.data.length === 0) {
          addLog(`[ERROR] No ${depositCoinType} coins found`);
          return;
        }

        // Merge all coins into one
        const coinIds = coins.data.map(c => c.coinObjectId);
        
        if (coinIds.length === 1) {
          const [depositCoin] = tx.splitCoins(tx.object(coinIds[0]), [tx.pure.u64(amountUnits)]);
          depositToBalanceManager({
            tx,
            config,
            balanceManagerId: userBalanceManagerId,
            coinSymbol: depositCoinType,
            coin: depositCoin,
          });
        } else {
          const primaryCoin = tx.object(coinIds[0]);
          tx.mergeCoins(primaryCoin, coinIds.slice(1).map(id => tx.object(id)));
          const [depositCoin] = tx.splitCoins(primaryCoin, [tx.pure.u64(amountUnits)]);
          depositToBalanceManager({
            tx,
            config,
            balanceManagerId: userBalanceManagerId,
            coinSymbol: depositCoinType,
            coin: depositCoin,
          });
        }
      }

      signAndExecute(
        { transaction: tx as any },
        {
          onSuccess: (result) => {
            addLog(`[OK] Deposited ${amount} ${depositCoinType}`);
            addLog(`TX: ${result.digest.slice(0, 20)}...`);
            setDepositAmount('');
          },
          onError: (error) => {
            addLog(`[ERROR] Deposit failed: ${error.message}`);
          },
        }
      );
    } catch (error: any) {
      addLog(`[ERROR] ${error.message}`);
    }
  }, [account, userBalanceManagerId, depositAmount, depositCoinType, signAndExecute, addLog, suiClient]);

  // Create limit order
  const handleCreateOrder = useCallback(async () => {
    if (!account?.address) {
      addLog('[ERROR] Connect wallet first');
      return;
    }

    if (!userBalanceManagerId) {
      addLog('[ERROR] Create or set Balance Manager first');
      return;
    }

    const trigger = parseFloat(triggerPrice);
    const qty = parseFloat(quantity);

    if (isNaN(trigger) || trigger <= 0) {
      addLog('[ERROR] Invalid trigger price');
      return;
    }

    if (isNaN(qty) || qty <= 0) {
      addLog('[ERROR] Invalid quantity');
      return;
    }

    const poolInfo = getPoolInfo(config, selectedPair);
    if (!poolInfo) {
      addLog(`[ERROR] Pool ${selectedPair} not found. Available pools: ${Object.keys(config.pools).join(', ')}`);
      return;
    }

    addLog(`Creating ${orderType} ${side} order...`);
    addLog(`  Pair: ${selectedPair}, Price: ${trigger}, Qty: ${qty}`);

    const tx = new Transaction();

    try {
      // Generate unique client order ID (u64)
      const clientOrderId = BigInt(Date.now());

      // Get coin info for logging and validation
      const baseCoin = config.coins[poolInfo.baseCoin];
      const quoteCoin = config.coins[poolInfo.quoteCoin];

      if (!baseCoin || !baseCoin.scalar) {
        addLog(`[ERROR] Base coin ${poolInfo.baseCoin} not found or missing scalar. Available coins: ${Object.keys(config.coins).join(', ')}`);
        return;
      }
      if (!quoteCoin || !quoteCoin.scalar) {
        addLog(`[ERROR] Quote coin ${poolInfo.quoteCoin} not found or missing scalar. Available coins: ${Object.keys(config.coins).join(', ')}`);
        return;
      }

      addLog(`  Base: ${poolInfo.baseCoin} (scalar: ${baseCoin.scalar})`);
      addLog(`  Quote: ${poolInfo.quoteCoin} (scalar: ${quoteCoin.scalar})`);

      // Generate trade proof as owner
      const tradeProof = generateTradeProofAsOwner({ tx, config, balanceManagerId: userBalanceManagerId });

      // Determine order type
      let deepBookOrderType = OrderType.NO_RESTRICTION;
      if (orderType === 'limit') {
        deepBookOrderType = OrderType.POST_ONLY; // Maker order
      }

      // Place the limit order (price and quantity are human-readable, converted internally)
      placeLimitOrder({
        tx,
        config,
        poolKey: selectedPair,
        balanceManagerId: userBalanceManagerId,
        tradeProof,
        clientOrderId,
        orderType: deepBookOrderType,
        selfMatchingOption: SelfMatchingOption.CANCEL_TAKER,
        price: trigger,
        quantity: qty,
        isBid: side === 'buy',
        payWithDeep: true,
        expireTimestamp: BigInt(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      });

      addLog('  [OK] Limit order PTB built');

      signAndExecute(
        { transaction: tx as any },
        {
          onSuccess: (result) => {
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
              onChainOrderId: clientOrderId,
            };

            setOrders(prev => [...prev, newOrder]);
            addLog(`[OK] Order created! TX: ${result.digest.slice(0, 20)}...`);
            addLog(`  Order ID: ${clientOrderId.toString()}`);
            
            setTriggerPrice('');
          },
          onError: (error) => {
            addLog(`[ERROR] Failed: ${error.message}`);
          },
        }
      );
    } catch (error: any) {
      addLog(`[ERROR] ${error.message}`);
    }
  }, [account, userBalanceManagerId, selectedPair, orderType, side, triggerPrice, quantity, signAndExecute, addLog]);

  // Cancel order
  const handleCancelOrder = useCallback(async (order: LimitOrder) => {
    if (!account?.address || !userBalanceManagerId) return;

    addLog(`Cancelling order ${order.onChainOrderId?.toString().slice(0, 8)}...`);

    const poolInfo = getPoolInfo(config, order.pair);
    if (!poolInfo || !order.onChainOrderId) {
      addLog('[ERROR] Cannot cancel - missing pool or order ID');
      // Remove from local list anyway
      setOrders(prev => prev.map(o =>
        o.id === order.id ? { ...o, status: 'cancelled' as const } : o
      ));
      return;
    }

    const tx = new Transaction();

    try {
      // Generate trade proof
      const tradeProof = generateTradeProofAsOwner({ tx, config, balanceManagerId: userBalanceManagerId });

      // Cancel the order
      dbCancelOrder({
        tx,
        config,
        poolKey: order.pair,
        balanceManagerId: userBalanceManagerId,
        tradeProof,
        orderId: order.onChainOrderId,
      });

      signAndExecute(
        { transaction: tx as any },
        {
          onSuccess: (result) => {
            setOrders(prev => prev.map(o =>
              o.id === order.id ? { ...o, status: 'cancelled' as const } : o
            ));
            addLog(`[OK] Order cancelled! TX: ${result.digest.slice(0, 20)}...`);
          },
          onError: (error) => {
            addLog(`[ERROR] Cancel failed: ${error.message}`);
          },
        }
      );
    } catch (error: any) {
      addLog(`[ERROR] ${error.message}`);
    }
  }, [account, userBalanceManagerId, signAndExecute, addLog]);

  const currentPrice = prices[selectedPair] || 0;
  const availablePools = getAvailablePools();

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white mb-1">Limit Orders</h1>
            <p className="text-sm text-gray-400">DeepBook V3 on-chain limit orders</p>
          </div>
          <Link href="/demo" className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm">
            Back
          </Link>
        </div>

        {/* Balance Manager Section */}
        <div className="bg-gray-900/50 rounded-lg p-4 sm:p-5 border border-gray-800 mb-6">
          <h2 className="text-base font-semibold text-gray-200 mb-3">Balance Manager</h2>
          
          {userBalanceManagerId ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-green-400 text-sm font-medium">Active</span>
                <code className="text-sky-400 text-xs bg-gray-800 px-2 py-1 rounded break-all flex-1 min-w-0">
                  {userBalanceManagerId.slice(0, 20)}...{userBalanceManagerId.slice(-8)}
                </code>
                <button
                  type="button"
                  onClick={handleClearBalanceManager}
                  className="px-2 py-1 bg-red-600 hover:bg-red-500 rounded text-xs"
                >
                  Clear
                </button>
              </div>

              {/* Important Deposit Warning */}
              <div className="bg-yellow-900/30 border border-yellow-700 rounded p-2.5">
                <p className="text-yellow-400 text-xs font-medium">Deposit funds BEFORE placing orders</p>
                <p className="text-yellow-300/70 text-xs mt-1">
                  Buy = QUOTE coin | Sell = BASE coin
                </p>
              </div>

              {/* Deposit Section */}
              <div className="flex flex-wrap gap-2 items-end">
                <div className="flex-1 min-w-[100px]">
                  <label className="block text-xs text-gray-400 mb-1">Amount</label>
                  <input
                    type="number"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    placeholder="0.5"
                    className="w-full px-2.5 py-1.5 bg-black rounded border border-gray-700 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Coin</label>
                  <select
                    value={depositCoinType}
                    onChange={(e) => setDepositCoinType(e.target.value)}
                    className="px-2.5 py-1.5 bg-black rounded border border-gray-700 text-sm"
                  >
                    <option value="SUI">SUI</option>
                    <option value="DEEP">DEEP</option>
                    <option value="DBUSDC">DBUSDC</option>
                  </select>
                </div>
                <button
                  type="button"
                  onClick={handleDeposit}
                  disabled={isPending || !depositAmount}
                  className="px-3 py-1.5 bg-green-600 hover:bg-green-500 rounded text-sm disabled:opacity-50"
                >
                  Deposit
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-400">No Balance Manager found. Create one or enter ID:</p>
              
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleCreateBalanceManager}
                  disabled={isPending || !account}
                  className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 rounded text-sm disabled:opacity-50"
                >
                  Create Balance Manager
                </button>
                
                <div className="flex gap-2 flex-1 min-w-[200px]">
                  <input
                    type="text"
                    value={manualBmId}
                    onChange={(e) => setManualBmId(e.target.value)}
                    placeholder="0x..."
                    className="flex-1 px-2.5 py-1.5 bg-black rounded border border-gray-700 text-sm"
                  />
                  <button
                    type="button"
                    onClick={handleSetManualBmId}
                    disabled={!manualBmId}
                    className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 rounded text-sm disabled:opacity-50"
                  >
                    Set
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5">
          {/* Order Form */}
          <div className="lg:col-span-3 space-y-4">
            <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-800">
              <h2 className="text-base font-semibold text-gray-200 mb-4">Create Order</h2>

              {/* Pair Selection */}
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-1.5">Trading Pair</label>
                <select
                  value={selectedPair}
                  onChange={(e) => {
                    setSelectedPair(e.target.value);
                    setTriggerPrice('');
                  }}
                  className="w-full px-3 py-2 bg-black rounded-lg border border-gray-800 focus:border-sky-500 outline-none text-sm"
                >
                  {availablePools.map(pair => (
                    <option key={pair} value={pair}>{pair.replace('_', '/')}</option>
                  ))}
                </select>
              </div>

              {/* Current Price Display */}
              <div className="mb-4 p-3 bg-black rounded-lg border border-gray-800">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">Current Price</span>
                  <span className="w-2 h-2 bg-sky-400 rounded-full animate-pulse" />
                </div>
                <p className="font-mono text-lg text-sky-400 mt-1">
                  {currentPrice.toFixed(6)}
                </p>
              </div>

              {/* Order Type */}
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-1.5">Order Type</label>
                <div className="grid grid-cols-3 gap-1.5">
                  {(['limit', 'stop-loss', 'take-profit'] as const).map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setOrderType(type)}
                      className={`py-2 px-2 rounded-lg text-xs font-medium transition-colors ${
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
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-1.5">Side</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSide('buy')}
                    className={`py-2 rounded-lg text-sm font-medium transition-colors ${
                      side === 'buy'
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                    }`}
                  >
                    Buy
                  </button>
                  <button
                    type="button"
                    onClick={() => setSide('sell')}
                    className={`py-2 rounded-lg text-sm font-medium transition-colors ${
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
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-1.5">
                  {orderType === 'limit' 
                    ? 'Limit Price' 
                    : orderType === 'stop-loss' 
                    ? 'Stop Price' 
                    : 'Target Price'
                  }
                </label>
                <input
                  type="number"
                  value={triggerPrice}
                  onChange={(e) => setTriggerPrice(e.target.value)}
                  step="0.000001"
                  placeholder={currentPrice.toFixed(6)}
                  className="w-full px-3 py-2 bg-black rounded-lg border border-gray-800 focus:border-sky-500 outline-none text-sm"
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
              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-1.5">
                  Quantity ({selectedPair.split('_')[0]})
                </label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  min="0.01"
                  step="1"
                  className="w-full px-3 py-2 bg-black rounded-lg border border-gray-800 focus:border-sky-500 outline-none text-sm"
                />
              </div>

              {/* Order Summary */}
              <div className="mb-3 p-3 bg-sky-500/10 border border-sky-500/20 rounded-lg">
                <p className="text-xs text-gray-400">Order Summary:</p>
                <p className="mt-1.5 font-medium text-sm text-sky-400">
                  {side === 'buy' ? 'Buy' : 'Sell'} {quantity} {selectedPair.split('_')[0]} @ {triggerPrice || '...'} {selectedPair.split('_')[1]}
                </p>
                {triggerPrice && quantity && (
                  <p className="mt-1 text-sm text-gray-500">
                    Total: ~{(parseFloat(triggerPrice) * parseFloat(quantity)).toFixed(4)} {selectedPair.split('_')[1]}
                  </p>
                )}
              </div>

              {/* Deposit Requirement Warning */}
              {userBalanceManagerId && (
                <div className="mb-4 p-3 bg-amber-900/30 border border-amber-700/50 rounded-lg">
                  <p className="text-amber-400 text-xs font-medium">
                    Required deposit for this order:
                  </p>
                  {side === 'buy' ? (
                    <p className="text-amber-300/80 text-xs mt-1">
                      {triggerPrice && quantity 
                        ? `~${(parseFloat(triggerPrice) * parseFloat(quantity)).toFixed(4)} ${selectedPair.split('_')[1]} (Quote coin)`
                        : `${selectedPair.split('_')[1]} (Quote coin)`
                      }
                    </p>
                  ) : (
                    <p className="text-amber-300/80 text-xs mt-1">
                      {quantity 
                        ? `~${quantity} ${selectedPair.split('_')[0]} (Base coin)`
                        : `${selectedPair.split('_')[0]} (Base coin)`
                      }
                    </p>
                  )}
                </div>
              )}

              {/* Create Button */}
              <button
                type="button"
                onClick={handleCreateOrder}
                disabled={isPending || !account || !userBalanceManagerId}
                className="w-full py-3 bg-sky-500 hover:bg-sky-400 rounded-lg font-semibold text-sm transition-colors disabled:opacity-50"
              >
                {isPending ? 'Creating...' : 'Create Order'}
              </button>

              {!account && (
                <p className="text-center text-gray-500 mt-3 text-sm">
                  Connect wallet to create orders
                </p>
              )}
              {account && !userBalanceManagerId && (
                <p className="text-center text-amber-500 mt-3 text-sm">
                  Create or set Balance Manager first
                </p>
              )}
            </div>

            {/* Quick Example */}
            <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-800">
              <h3 className="text-sm font-semibold text-gray-300 mb-2">Example Orders</h3>
              <div className="space-y-1.5 text-xs text-gray-400">
                <p>• <strong>DEEP_SUI</strong>: Buy 10 DEEP @ 0.024 SUI = 0.24 SUI</p>
                <p>• <strong>SUI_USDC</strong>: Sell 1 SUI @ 4.5 USDC = 4.5 USDC</p>
                <p className="text-amber-400 mt-2">Deposit funds to Balance Manager before trading!</p>
              </div>
            </div>
          </div>

          {/* Orders Table */}
          <div className="lg:col-span-5">
            <div className="bg-gray-900/50 rounded-lg p-4 sm:p-5 border border-gray-800 h-full">
              <h2 className="text-base font-semibold text-gray-200 mb-4">Active Orders</h2>

              {orders.filter(o => o.status === 'pending' || o.status === 'triggered').length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <p className="font-semibold text-base">No active orders</p>
                  <p className="mt-1.5 text-sm">Create an order to get started</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {orders.filter(o => o.status === 'pending' || o.status === 'triggered').map((order) => {
                    const pairPrice = prices[order.pair] || 0;
                    const distance = pairPrice > 0 
                      ? ((order.triggerPrice / pairPrice - 1) * 100).toFixed(2)
                      : '0';

                    return (
                      <div
                        key={order.id}
                        className={`p-3 rounded-lg border ${
                          order.status === 'triggered'
                            ? 'border-green-500/50 bg-green-500/5'
                            : 'border-gray-800 bg-black'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-1.5">
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              order.type === 'limit'
                                ? 'bg-sky-500/10 text-sky-400'
                                : order.type === 'stop-loss'
                                ? 'bg-red-500/10 text-red-400'
                                : 'bg-green-500/10 text-green-400'
                            }`}>
                              {order.type}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                              order.side === 'buy'
                                ? 'bg-green-500/10 text-green-400'
                                : 'bg-red-500/10 text-red-400'
                            }`}>
                              {order.side}
                            </span>
                          </div>
                          <span className={`text-xs font-medium ${
                            order.status === 'triggered'
                              ? 'text-green-400'
                              : 'text-gray-500'
                          }`}>
                            {order.status === 'triggered' ? 'TRIGGERED' : 'On-chain'}
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                          <div>
                            <span className="text-gray-500">Pair:</span>
                            <span className="ml-1.5 font-medium text-white">{order.pair.replace('_', '/')}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Qty:</span>
                            <span className="ml-1.5 font-mono text-gray-300">{order.quantity}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Price:</span>
                            <span className="ml-1.5 font-mono text-sky-400">
                              {order.triggerPrice.toFixed(6)}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500">Current:</span>
                            <span className="ml-1.5 font-mono text-gray-300">
                              {pairPrice.toFixed(6)}
                            </span>
                          </div>
                        </div>

                        {/* Order ID */}
                        {order.onChainOrderId && (
                          <div className="mb-2 text-xs text-gray-500">
                            ID: {order.onChainOrderId.toString()}
                          </div>
                        )}

                        {/* Distance to trigger */}
                        {order.status === 'pending' && (
                          <div className="mb-3">
                            <div className="flex justify-between text-xs text-gray-400 mb-1">
                              <span>Distance</span>
                              <span>{distance}%</span>
                            </div>
                            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                              <div 
                                className="h-full bg-sky-500 transition-all"
                                style={{ 
                                  width: `${Math.max(0, Math.min(100, 100 - Math.abs(parseFloat(distance))))}%` 
                                }}
                              />
                            </div>
                          </div>
                        )}

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleCancelOrder(order)}
                            disabled={isPending}
                            className="flex-1 py-2 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Order History */}
              {orders.filter(o => o.status === 'filled' || o.status === 'cancelled').length > 0 && (
                <div className="mt-5">
                  <h3 className="text-sm font-medium mb-2 text-gray-400">History</h3>
                  <div className="space-y-2">
                    {orders.filter(o => o.status !== 'pending' && o.status !== 'triggered').slice(-5).map((order) => (
                      <div key={order.id} className="flex justify-between items-center p-2.5 bg-black rounded-lg text-xs">
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
          <div className="lg:col-span-4">
            <div className="bg-gray-900/50 rounded-lg p-4 sm:p-5 border border-gray-800">
              <h2 className="text-base font-semibold text-gray-200 mb-4">Activity Log</h2>
              <div className="bg-black rounded-lg p-3 h-80 overflow-y-auto font-mono text-xs">
                {logs.length === 0 ? (
                  <p className="text-gray-500">No activity yet...</p>
                ) : (
                  logs.map((log, i) => (
                    <p key={i} className="text-gray-400 mb-2 break-all">{log}</p>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Info Card */}
        <div className="mt-8 bg-sky-500/5 border border-sky-500/20 rounded-lg p-5 sm:p-6">
          <h3 className="font-semibold text-sky-400 text-base mb-4">How DeepBook Limit Orders Work</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-gray-900/50 rounded-xl p-5 border border-gray-800">
              <div className="text-base text-sky-400 font-semibold mb-3">1. Create Balance Manager</div>
              <p className="text-gray-400 text-sm">
                Balance Manager holds your trading funds securely on-chain
              </p>
            </div>
            <div className="bg-gray-900/50 rounded-xl p-5 border border-gray-800">
              <div className="text-base text-sky-400 font-semibold mb-3">2. Deposit Funds</div>
              <p className="text-gray-400 text-sm">
                Deposit SUI, DEEP, or USDC to trade on DeepBook pools
              </p>
            </div>
            <div className="bg-gray-900/50 rounded-xl p-5 border border-gray-800">
              <div className="text-base text-sky-400 font-semibold mb-3">3. Place Order</div>
              <p className="text-gray-400 text-sm">
                Submit limit order with price and quantity - stored on-chain
              </p>
            </div>
            <div className="bg-gray-900/50 rounded-xl p-5 border border-gray-800">
              <div className="text-base text-sky-400 font-semibold mb-3">4. Auto-Execution</div>
              <p className="text-gray-400 text-sm">
                Orders execute automatically when market price matches
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
