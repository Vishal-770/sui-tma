'use client';

/**
 * Balance Manager Setup Page
 * 
 * This page allows users to:
 * 1. Create a new Balance Manager for DeepBook V3 trading
 * 2. Mint Trade Caps for specific pools
 * 3. Deposit/Withdraw tokens to/from Balance Manager
 * 4. View current balances and positions
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import { Transaction } from '@mysten/sui/transactions';
import { 
  buildCreateBalanceManagerTx,
  buildMintTradeCapTx,
  buildDepositToManagerTx,
  buildWithdrawFromManagerTx,
  COIN_TYPES,
  COIN_DECIMALS,
  POOLS,
  CURRENT_ENV,
  DEEPBOOK_TESTNET,
  DEEPBOOK_MAINNET,
} from '@/lib/deepbook';
import Link from 'next/link';

interface BalanceManagerInfo {
  objectId: string;
  owner: string;
  balances: {
    coin: string;
    amount: string;
    symbol: string;
  }[];
}

interface TradeCap {
  objectId: string;
  poolId: string;
  poolName: string;
}

export default function BalanceManagerPage() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction();
  
  const address = account?.address;
  const isAuthenticated = !!account;
  
  // State
  const [balanceManager, setBalanceManager] = useState<BalanceManagerInfo | null>(null);
  const [tradeCaps, setTradeCaps] = useState<TradeCap[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Form states
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [selectedCoin, setSelectedCoin] = useState<string>('SUI');
  const [selectedPool, setSelectedPool] = useState<string>(Object.keys(POOLS)[0]);
  
  // User balances
  const [userBalances, setUserBalances] = useState<Record<string, string>>({});
  
  // Network info
  const networkEmoji = CURRENT_ENV === 'mainnet' ? '🌐' : '🧪';
  const networkName = CURRENT_ENV === 'mainnet' ? 'Mainnet' : 'Testnet';
  const deepBookConfig = CURRENT_ENV === 'mainnet' ? DEEPBOOK_MAINNET : DEEPBOOK_TESTNET;

  // Fetch user's Balance Manager and Trade Caps
  const fetchUserData = useCallback(async () => {
    if (!address || !suiClient) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Fetch owned objects to find Balance Manager
      const objects = await suiClient.getOwnedObjects({
        owner: address,
        filter: {
          StructType: `${deepBookConfig.PACKAGE_ID}::balance_manager::BalanceManager`,
        },
        options: {
          showContent: true,
          showType: true,
        },
      });
      
      if (objects.data.length > 0) {
        const managerObj = objects.data[0];
        if (managerObj.data?.content?.dataType === 'moveObject') {
          // Parse balance manager data
          const fields = managerObj.data.content.fields as any;
          setBalanceManager({
            objectId: managerObj.data.objectId,
            owner: address,
            balances: [], // Would need additional queries to get balances
          });
        }
      } else {
        setBalanceManager(null);
      }
      
      // Fetch Trade Caps
      const capObjects = await suiClient.getOwnedObjects({
        owner: address,
        filter: {
          StructType: `${deepBookConfig.PACKAGE_ID}::balance_manager::TradeCap`,
        },
        options: {
          showContent: true,
          showType: true,
        },
      });
      
      const caps: TradeCap[] = [];
      for (const cap of capObjects.data) {
        if (cap.data?.content?.dataType === 'moveObject') {
          const fields = cap.data.content.fields as any;
          caps.push({
            objectId: cap.data.objectId,
            poolId: fields.pool_id || 'Unknown',
            poolName: getPoolNameFromId(fields.pool_id),
          });
        }
      }
      setTradeCaps(caps);
      
      // Fetch user balances
      await fetchUserBalances();
      
    } catch (err) {
      console.error('Error fetching user data:', err);
      setError('Failed to fetch Balance Manager data');
    } finally {
      setLoading(false);
    }
  }, [address, suiClient, deepBookConfig.PACKAGE_ID]);
  
  // Fetch user's token balances
  const fetchUserBalances = async () => {
    if (!address || !suiClient) return;
    
    const balances: Record<string, string> = {};
    
    try {
      // SUI balance
      const suiBalance = await suiClient.getBalance({
        owner: address,
        coinType: COIN_TYPES.SUI,
      });
      balances['SUI'] = (Number(suiBalance.totalBalance) / 1e9).toFixed(4);
      
      // DEEP balance
      try {
        const deepBalance = await suiClient.getBalance({
          owner: address,
          coinType: COIN_TYPES.DEEP,
        });
        balances['DEEP'] = (Number(deepBalance.totalBalance) / 1e6).toFixed(4);
      } catch {
        balances['DEEP'] = '0';
      }
      
      // USDC balance (testnet: DBUSDC)
      try {
        const usdcType = CURRENT_ENV === 'mainnet' ? COIN_TYPES.USDC : COIN_TYPES.DBUSDC;
        const usdcBalance = await suiClient.getBalance({
          owner: address,
          coinType: usdcType,
        });
        balances['USDC'] = (Number(usdcBalance.totalBalance) / 1e6).toFixed(4);
      } catch {
        balances['USDC'] = '0';
      }
      
      setUserBalances(balances);
    } catch (err) {
      console.error('Error fetching balances:', err);
    }
  };
  
  // Get pool name from ID
  const getPoolNameFromId = (poolId: string): string => {
    for (const [name, info] of Object.entries(POOLS)) {
      if ((info as any).poolId === poolId) return name;
    }
    return 'Unknown Pool';
  };

  // Create Balance Manager
  const handleCreateBalanceManager = async () => {
    if (!address) return;
    
    setActionLoading('create');
    setError(null);
    setSuccess(null);
    
    try {
      const tx = buildCreateBalanceManagerTx();
      
      signAndExecute(
        {
          transaction: tx as any, // Cast to any to avoid version conflict between @mysten/sui versions
        },
        {
          onSuccess: async (result) => {
            setSuccess('Balance Manager created successfully!');
            await fetchUserData();
            setActionLoading(null);
          },
          onError: (err) => {
            console.error('Error creating Balance Manager:', err);
            setError(err.message || 'Failed to create Balance Manager');
            setActionLoading(null);
          },
        }
      );
    } catch (err) {
      console.error('Error creating Balance Manager:', err);
      setError(err instanceof Error ? err.message : 'Failed to create Balance Manager');
      setActionLoading(null);
    }
  };

  // Mint Trade Cap
  const handleMintTradeCap = async () => {
    if (!address || !balanceManager) return;
    
    setActionLoading('mintCap');
    setError(null);
    setSuccess(null);
    
    try {
      const poolInfo = POOLS[selectedPool as keyof typeof POOLS];
      if (!poolInfo) throw new Error('Invalid pool selected');
      
      const tx = buildMintTradeCapTx(
        balanceManager.objectId,
        (poolInfo as any).poolId
      );
      
      signAndExecute(
        {
          transaction: tx as any, // Cast to any to avoid version conflict
        },
        {
          onSuccess: async () => {
            setSuccess(`Trade Cap minted for ${selectedPool}!`);
            await fetchUserData();
            setActionLoading(null);
          },
          onError: (err) => {
            console.error('Error minting Trade Cap:', err);
            setError(err.message || 'Failed to mint Trade Cap');
            setActionLoading(null);
          },
        }
      );
    } catch (err) {
      console.error('Error minting Trade Cap:', err);
      setError(err instanceof Error ? err.message : 'Failed to mint Trade Cap');
      setActionLoading(null);
    }
  };

  // Deposit to Balance Manager
  const handleDeposit = async () => {
    if (!address || !balanceManager) return;
    if (!depositAmount || parseFloat(depositAmount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    
    setActionLoading('deposit');
    setError(null);
    setSuccess(null);
    
    try {
      const coinType = getCoinType(selectedCoin);
      const decimals = COIN_DECIMALS[selectedCoin] || 9;
      const amount = BigInt(Math.floor(parseFloat(depositAmount) * Math.pow(10, decimals)));
      
      // Need to get user's coins for this type
      const coins = await suiClient?.getCoins({
        owner: address,
        coinType,
      });
      
      if (!coins?.data.length) {
        throw new Error(`No ${selectedCoin} coins found`);
      }
      
      // Build transaction
      const tx = new Transaction();
      
      // Merge coins if needed and split the amount
      let coinToDeposit;
      if (coins.data.length === 1) {
        const [split] = tx.splitCoins(tx.object(coins.data[0].coinObjectId), [tx.pure.u64(amount)]);
        coinToDeposit = split;
      } else {
        // Merge then split
        tx.mergeCoins(
          tx.object(coins.data[0].coinObjectId),
          coins.data.slice(1).map(c => tx.object(c.coinObjectId))
        );
        const [split] = tx.splitCoins(tx.object(coins.data[0].coinObjectId), [tx.pure.u64(amount)]);
        coinToDeposit = split;
      }
      
      // Use the deposit function
      const finalTx = buildDepositToManagerTx(
        balanceManager.objectId,
        coinType,
        coinToDeposit,
        tx
      );
      
      signAndExecute(
        {
          transaction: finalTx as any, // Cast to any to avoid version conflict
        },
        {
          onSuccess: async () => {
            setSuccess(`Deposited ${depositAmount} ${selectedCoin}!`);
            setDepositAmount('');
            await fetchUserData();
            setActionLoading(null);
          },
          onError: (err) => {
            console.error('Error depositing:', err);
            setError(err.message || 'Failed to deposit');
            setActionLoading(null);
          },
        }
      );
    } catch (err) {
      console.error('Error depositing:', err);
      setError(err instanceof Error ? err.message : 'Failed to deposit');
      setActionLoading(null);
    }
  };

  // Withdraw from Balance Manager
  const handleWithdraw = async () => {
    if (!address || !balanceManager) return;
    if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    
    setActionLoading('withdraw');
    setError(null);
    setSuccess(null);
    
    try {
      const coinType = getCoinType(selectedCoin);
      const decimals = COIN_DECIMALS[selectedCoin] || 9;
      const amount = BigInt(Math.floor(parseFloat(withdrawAmount) * Math.pow(10, decimals)));
      
      const tx = buildWithdrawFromManagerTx(
        balanceManager.objectId,
        coinType,
        amount,
        address
      );
      
      signAndExecute(
        {
          transaction: tx as any, // Cast to any to avoid version conflict
        },
        {
          onSuccess: async () => {
            setSuccess(`Withdrawn ${withdrawAmount} ${selectedCoin}!`);
            setWithdrawAmount('');
            await fetchUserData();
            setActionLoading(null);
          },
          onError: (err) => {
            console.error('Error withdrawing:', err);
            setError(err.message || 'Failed to withdraw');
            setActionLoading(null);
          },
        }
      );
    } catch (err) {
      console.error('Error withdrawing:', err);
      setError(err instanceof Error ? err.message : 'Failed to withdraw');
      setActionLoading(null);
    }
  };

  // Get coin type from symbol
  const getCoinType = (symbol: string): string => {
    const mapping: Record<string, string> = {
      SUI: COIN_TYPES.SUI,
      DEEP: COIN_TYPES.DEEP,
      USDC: CURRENT_ENV === 'mainnet' ? COIN_TYPES.USDC : COIN_TYPES.DBUSDC,
      DBUSDC: COIN_TYPES.DBUSDC,
      DBUSDT: COIN_TYPES.DBUSDT,
    };
    return mapping[symbol] || COIN_TYPES.SUI;
  };

  // Load data on mount
  useEffect(() => {
    if (isAuthenticated && address) {
      fetchUserData();
    }
  }, [isAuthenticated, address, fetchUserData]);

  // Available coins for deposit/withdraw
  const availableCoins = CURRENT_ENV === 'mainnet' 
    ? ['SUI', 'DEEP', 'USDC']
    : ['SUI', 'DEEP', 'DBUSDC', 'DBUSDT'];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">
            🏦 Balance Manager
          </h1>
          <p className="text-gray-400">
            Manage your DeepBook V3 trading account
          </p>
          <div className="inline-flex items-center gap-2 mt-2 px-3 py-1 bg-slate-800/50 rounded-full">
            <span>{networkEmoji}</span>
            <span className="text-sm text-gray-300">{networkName}</span>
          </div>
        </div>

        {/* Not Connected Warning */}
        {!isAuthenticated && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-6 text-center mb-6">
            <h3 className="text-yellow-400 font-semibold text-lg mb-2">
              🔐 Connect Your Wallet
            </h3>
            <p className="text-gray-400 text-sm">
              Please connect your wallet to manage your Balance Manager
            </p>
          </div>
        )}

        {/* Error/Success Messages */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-6">
            <p className="text-red-400 text-sm">❌ {error}</p>
          </div>
        )}
        {success && (
          <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 mb-6">
            <p className="text-green-400 text-sm">✅ {success}</p>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mx-auto mb-4"></div>
            <p className="text-gray-400">Loading Balance Manager data...</p>
          </div>
        )}

        {isAuthenticated && !loading && (
          <>
            {/* User Wallet Balances */}
            <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-xl p-6 mb-6">
              <h2 className="text-xl font-semibold text-white mb-4">💰 Your Wallet Balances</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {Object.entries(userBalances).map(([coin, balance]) => (
                  <div key={coin} className="bg-slate-700/50 rounded-lg p-4">
                    <p className="text-gray-400 text-sm">{coin}</p>
                    <p className="text-white font-semibold text-lg">{balance}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Balance Manager Section */}
            <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-xl p-6 mb-6">
              <h2 className="text-xl font-semibold text-white mb-4">🏦 Balance Manager</h2>
              
              {!balanceManager ? (
                <div className="text-center py-8">
                  <p className="text-gray-400 mb-4">
                    You don't have a Balance Manager yet. Create one to start trading on DeepBook.
                  </p>
                  <button
                    onClick={handleCreateBalanceManager}
                    disabled={actionLoading === 'create'}
                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 
                             text-white font-semibold rounded-lg transition-all duration-200"
                  >
                    {actionLoading === 'create' ? (
                      <span className="flex items-center gap-2">
                        <span className="animate-spin">⏳</span> Creating...
                      </span>
                    ) : (
                      '➕ Create Balance Manager'
                    )}
                  </button>
                  <p className="text-gray-500 text-sm mt-3">
                    A Balance Manager is required for placing orders and managing positions on DeepBook V3.
                  </p>
                </div>
              ) : (
                <div>
                  <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 mb-4">
                    <p className="text-green-400 text-sm">
                      ✅ Balance Manager Active
                    </p>
                    <p className="text-gray-400 text-xs mt-1 font-mono">
                      ID: {balanceManager.objectId.slice(0, 16)}...{balanceManager.objectId.slice(-8)}
                    </p>
                  </div>

                  {/* Deposit/Withdraw Section */}
                  <div className="grid md:grid-cols-2 gap-4">
                    {/* Deposit */}
                    <div className="bg-slate-700/30 rounded-lg p-4">
                      <h3 className="text-white font-medium mb-3">📥 Deposit</h3>
                      <div className="space-y-3">
                        <select
                          value={selectedCoin}
                          onChange={(e) => setSelectedCoin(e.target.value)}
                          className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600"
                        >
                          {availableCoins.map(coin => (
                            <option key={coin} value={coin}>{coin}</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          value={depositAmount}
                          onChange={(e) => setDepositAmount(e.target.value)}
                          placeholder="Amount"
                          className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600"
                        />
                        <button
                          onClick={handleDeposit}
                          disabled={actionLoading === 'deposit'}
                          className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-600 
                                   text-white font-medium rounded-lg transition-all"
                        >
                          {actionLoading === 'deposit' ? 'Depositing...' : 'Deposit'}
                        </button>
                      </div>
                    </div>

                    {/* Withdraw */}
                    <div className="bg-slate-700/30 rounded-lg p-4">
                      <h3 className="text-white font-medium mb-3">📤 Withdraw</h3>
                      <div className="space-y-3">
                        <select
                          value={selectedCoin}
                          onChange={(e) => setSelectedCoin(e.target.value)}
                          className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600"
                        >
                          {availableCoins.map(coin => (
                            <option key={coin} value={coin}>{coin}</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          value={withdrawAmount}
                          onChange={(e) => setWithdrawAmount(e.target.value)}
                          placeholder="Amount"
                          className="w-full bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600"
                        />
                        <button
                          onClick={handleWithdraw}
                          disabled={actionLoading === 'withdraw'}
                          className="w-full px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-600 
                                   text-white font-medium rounded-lg transition-all"
                        >
                          {actionLoading === 'withdraw' ? 'Withdrawing...' : 'Withdraw'}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Trade Caps Section */}
            <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-xl p-6 mb-6">
              <h2 className="text-xl font-semibold text-white mb-4">🎫 Trade Caps</h2>
              <p className="text-gray-400 text-sm mb-4">
                Trade Caps authorize your Balance Manager to trade on specific pools.
              </p>
              
              {/* Existing Trade Caps */}
              {tradeCaps.length > 0 ? (
                <div className="space-y-2 mb-4">
                  {tradeCaps.map((cap) => (
                    <div key={cap.objectId} className="bg-slate-700/30 rounded-lg p-3 flex justify-between items-center">
                      <div>
                        <p className="text-white font-medium">{cap.poolName}</p>
                        <p className="text-gray-500 text-xs font-mono">
                          {cap.objectId.slice(0, 12)}...{cap.objectId.slice(-8)}
                        </p>
                      </div>
                      <span className="text-green-400 text-sm">✅ Active</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm mb-4">No Trade Caps found.</p>
              )}
              
              {/* Mint New Trade Cap */}
              {balanceManager && (
                <div className="bg-slate-700/30 rounded-lg p-4">
                  <h3 className="text-white font-medium mb-3">➕ Mint New Trade Cap</h3>
                  <div className="flex gap-3">
                    <select
                      value={selectedPool}
                      onChange={(e) => setSelectedPool(e.target.value)}
                      className="flex-1 bg-slate-700 text-white rounded-lg px-3 py-2 border border-slate-600"
                    >
                      {Object.keys(POOLS).map(pool => (
                        <option key={pool} value={pool}>{pool}</option>
                      ))}
                    </select>
                    <button
                      onClick={handleMintTradeCap}
                      disabled={actionLoading === 'mintCap'}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-600 
                               text-white font-medium rounded-lg transition-all"
                    >
                      {actionLoading === 'mintCap' ? 'Minting...' : 'Mint Cap'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Info Section */}
            <div className="bg-slate-800/50 backdrop-blur border border-slate-700 rounded-xl p-6">
              <h2 className="text-xl font-semibold text-white mb-4">ℹ️ How It Works</h2>
              <div className="space-y-4 text-gray-400 text-sm">
                <div className="flex gap-3">
                  <span className="text-2xl">1️⃣</span>
                  <div>
                    <p className="text-white font-medium">Create Balance Manager</p>
                    <p>Your personal trading account on DeepBook V3.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="text-2xl">2️⃣</span>
                  <div>
                    <p className="text-white font-medium">Mint Trade Caps</p>
                    <p>Authorize trading on specific pools (SUI/USDC, DEEP/SUI, etc.).</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="text-2xl">3️⃣</span>
                  <div>
                    <p className="text-white font-medium">Deposit Funds</p>
                    <p>Move tokens into your Balance Manager for trading.</p>
                  </div>
                </div>
                <div className="flex gap-3">
                  <span className="text-2xl">4️⃣</span>
                  <div>
                    <p className="text-white font-medium">Start Trading</p>
                    <p>Place limit orders, market orders, and use flash loans!</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="mt-6 flex flex-wrap gap-3 justify-center">
              <a
                href="/demo/swap"
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-all"
              >
                🔄 Swap
              </a>
              <a
                href="/demo/limit-orders"
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-all"
              >
                📊 Limit Orders
              </a>
              <a
                href="/demo/margin-trading"
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-all"
              >
                📈 Margin Trading
              </a>
              <a
                href="/demo/flash-arbitrage"
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-all"
              >
                ⚡ Flash Arbitrage
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
