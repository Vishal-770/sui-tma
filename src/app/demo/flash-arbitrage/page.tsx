'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Transaction, coinWithBalance } from '@mysten/sui/transactions';
import type { TransactionObjectArgument } from '@mysten/sui/transactions';
import { useCurrentAccount, useSignAndExecuteTransaction, useSuiClient } from '@mysten/dapp-kit';
import Link from 'next/link';
import { useNetwork, useNetworkConfig } from '@/contexts/NetworkContext';
import { NetworkToggle } from '@/components/NetworkToggle';
import {
  getConfig,
  getAvailablePoolKeys,
  getPoolInfo,
  borrowFlashLoanBase,
  borrowFlashLoanQuote,
  returnFlashLoanBase,
  returnFlashLoanQuote,
  swapExactBaseForQuote,
  swapExactQuoteForBase,
  toUnits,
  fromUnits,
  getExplorerUrl,
  getCoinDecimals,
  type NetworkEnv,
  type DeepBookConfig,
} from '@/lib/deepbook-v3';

interface ArbitrageOpportunity {
  id: string;
  borrowPool: string;
  borrowAsset: 'base' | 'quote';
  swapPool: string;
  path: string[];
  borrowAmount: number;
  estimatedReturn: number;
  estimatedProfit: number;
  profitPercent: number;
}

export default function FlashArbitragePage() {
  // Network context for dynamic mainnet/testnet
  const { network, isMainnet } = useNetwork();
  const { strictBalanceCheck, allowZeroMinOutput } = useNetworkConfig();
  
  // Config based on current network
  const CONFIG = useMemo(() => getConfig(network), [network]);
  
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction();

  const [selectedBorrowPool, setSelectedBorrowPool] = useState<string>('');
  const [selectedSwapPool, setSelectedSwapPool] = useState<string>('');
  const [borrowAmount, setBorrowAmount] = useState('1');
  const [borrowAsset, setBorrowAsset] = useState<'base' | 'quote'>('base');
  const [logs, setLogs] = useState<string[]>([]);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([]);
  const [poolBalances, setPoolBalances] = useState<Record<string, { base: bigint; quote: bigint }>>({});

  const addLog = useCallback((message: string) => {
    setLogs(prev => [...prev.slice(-14), `[${new Date().toLocaleTimeString()}] ${message}`]);
  }, []);

  const availablePools = useMemo(() => getAvailablePoolKeys(CONFIG), [CONFIG]);

  // Reset on network change
  useEffect(() => {
    setLogs([]);
    setLastTx(null);
    setSelectedBorrowPool('');
    setSelectedSwapPool('');
    setOpportunities([]);
    addLog(`Network: ${network.toUpperCase()}`);
    if (isMainnet) {
      addLog('[WARN] Mainnet mode - flash loans use real funds!');
      addLog('[WARN] Ensure profitable arbitrage before execution');
    }
  }, [network, isMainnet, addLog]);

  // Set default pools
  useEffect(() => {
    if (availablePools.length > 0 && !selectedBorrowPool) {
      setSelectedBorrowPool(availablePools[0]);
      if (availablePools.length > 1) {
        setSelectedSwapPool(availablePools[1]);
      }
    }
  }, [availablePools, selectedBorrowPool]);

  // Fetch pool liquidity info
  useEffect(() => {
    const fetchPoolInfo = async () => {
      const balances: Record<string, { base: bigint; quote: bigint }> = {};
      
      for (const poolKey of availablePools) {
        const pool = getPoolInfo(CONFIG, poolKey);
        if (pool) {
          try {
            const poolObject = await suiClient.getObject({
              id: pool.address,
              options: { showContent: true },
            });
            
            // Pool liquidity would be in the object content
            // For now, mark as available
            balances[poolKey] = { base: BigInt(0), quote: BigInt(0) };
          } catch {
            balances[poolKey] = { base: BigInt(0), quote: BigInt(0) };
          }
        }
      }
      
      setPoolBalances(balances);
    };

    fetchPoolInfo();
  }, [availablePools, suiClient]);

  // Generate demo opportunities
  const scanOpportunities = useCallback(() => {
    addLog('Scanning for arbitrage opportunities...');
    
    const opps: ArbitrageOpportunity[] = [];
    
    // Generate some demo opportunities based on available pools
    for (let i = 0; i < availablePools.length; i++) {
      for (let j = 0; j < availablePools.length; j++) {
        if (i === j) continue;
        
        const borrowPool = availablePools[i];
        const swapPool = availablePools[j];
        
        const borrowPoolInfo = getPoolInfo(CONFIG, borrowPool);
        const swapPoolInfo = getPoolInfo(CONFIG, swapPool);
        
        if (!borrowPoolInfo || !swapPoolInfo) continue;
        
        // Check if there's a shared coin between pools for arbitrage path
        const sharedCoins = [borrowPoolInfo.baseCoin, borrowPoolInfo.quoteCoin].filter(
          c => c === swapPoolInfo.baseCoin || c === swapPoolInfo.quoteCoin
        );
        
        if (sharedCoins.length > 0) {
          const path = [
            borrowPoolInfo.baseCoin,
            sharedCoins[0],
            borrowPoolInfo.baseCoin,
          ];
          
          // Simulated profit calculation (in reality, would query orderbook)
          const estimatedProfit = Math.random() * 0.05; // 0-5% simulated
          
          opps.push({
            id: `opp_${i}_${j}`,
            borrowPool,
            borrowAsset: 'base',
            swapPool,
            path,
            borrowAmount: 1,
            estimatedReturn: 1 + estimatedProfit,
            estimatedProfit: estimatedProfit,
            profitPercent: estimatedProfit * 100,
          });
        }
      }
    }
    
    setOpportunities(opps.slice(0, 5)); // Top 5
    addLog(`Found ${opps.length} potential arbitrage paths`);
    addLog('[WARN] Note: Testnet pools often have no liquidity');
  }, [availablePools, addLog]);

  // Execute flash arbitrage
  const executeFlashArbitrage = useCallback(async () => {
    if (!account) {
      addLog('[ERROR] Please connect wallet first');
      return;
    }

    if (!selectedBorrowPool) {
      addLog('[ERROR] Please select a borrow pool');
      return;
    }

    const amount = parseFloat(borrowAmount);
    if (isNaN(amount) || amount <= 0) {
      addLog('[ERROR] Invalid borrow amount');
      return;
    }

    const borrowPoolInfo = getPoolInfo(CONFIG, selectedBorrowPool);
    if (!borrowPoolInfo) {
      addLog('[ERROR] Invalid borrow pool');
      return;
    }

    const assetSymbol = borrowAsset === 'base' ? borrowPoolInfo.baseCoin : borrowPoolInfo.quoteCoin;
    const assetDecimals = getCoinDecimals(CONFIG, assetSymbol);
    const borrowAmountUnits = toUnits(amount, assetDecimals);

    // Log all values for debugging
    console.log('[FlashLoan Debug] borrowAsset value:', borrowAsset);
    console.log('[FlashLoan Debug] assetSymbol:', assetSymbol);
    console.log('[FlashLoan Debug] assetDecimals:', assetDecimals);
    console.log('[FlashLoan Debug] borrowAmountUnits:', borrowAmountUnits.toString());
    
    addLog(`Executing flash loan arbitrage...`);
    addLog(`  Borrow Pool: ${selectedBorrowPool}`);
    addLog(`  Borrow Asset: ${assetSymbol} (${borrowAsset})`);
    addLog(`  Amount: ${amount} ${assetSymbol}`);
    addLog(`  Units: ${borrowAmountUnits.toString()}`);

    const tx = new Transaction();
    
    // CRITICAL: Must set sender BEFORE using coinWithBalance
    tx.setSender(account.address);
    tx.setGasBudget(500_000_000); // 0.5 SUI for complex tx

    try {
      // Step 1: Borrow via flash loan - use explicit check for 'quote' for safety
      const isQuoteBorrow = borrowAsset === 'quote';
      addLog(`  Step 1: Borrowing via flash loan (${isQuoteBorrow ? 'QUOTE' : 'BASE'})...`);
      console.log('[FlashLoan Debug] isQuoteBorrow:', isQuoteBorrow);
      
      const borrowParams = {
        tx,
        config: CONFIG,
        poolKey: selectedBorrowPool,
        borrowAmount: borrowAmountUnits,
      };
      
      // Explicit if/else for clarity
      let borrowedCoin: TransactionObjectArgument;
      let flashLoan: TransactionObjectArgument;
      
      if (isQuoteBorrow) {
        addLog(`  → Calling borrowFlashLoanQuote (borrow_flashloan_quote)`);
        [borrowedCoin, flashLoan] = borrowFlashLoanQuote(borrowParams);
      } else {
        addLog(`  → Calling borrowFlashLoanBase (borrow_flashloan_base)`);
        [borrowedCoin, flashLoan] = borrowFlashLoanBase(borrowParams);
      }

      // Step 2: In a real arbitrage, you would:
      // - Swap on another pool for profit
      // - Swap back to original asset
      // For demo, we'll just return the borrowed amount
      
      addLog('  Step 2: (Demo) Holding borrowed funds...');
      addLog('  [WARN] Real arbitrage would swap through other pools here');
      
      // Step 3: Return the flash loan
      // IMPORTANT: Must return at least the borrowed amount
      addLog('  Step 3: Returning flash loan...');
      
      const returnParams = {
        tx,
        config: CONFIG,
        poolKey: selectedBorrowPool,
        coin: borrowedCoin,
        flashLoan,
      };
      
      if (isQuoteBorrow) {
        addLog(`  → Calling returnFlashLoanQuote`);
        returnFlashLoanQuote(returnParams);
      } else {
        addLog(`  → Calling returnFlashLoanBase`);
        returnFlashLoanBase(returnParams);
      }
      
      // NOTE: In a real arbitrage, you'd have profit left over after returning
      // the loan. You'd transfer that profit to yourself.
      
      addLog('  Step 4: Flash loan cycle complete!');

      signAndExecute(
        { transaction: tx as any },
        {
          onSuccess: (result) => {
            const explorerUrl = getExplorerUrl(network, result.digest);
            addLog(`[OK] Flash loan TX successful!`);
            addLog(`Explorer: ${explorerUrl}`);
            addLog(`Note: This was a demo - borrowed and returned same amount`);
            setLastTx(result.digest);
          },
          onError: (error) => {
            addLog(`[ERROR] Flash loan failed: ${error.message}`);
            if (error.message.includes('InsufficientPoolLiquidity') || error.message.includes('EInsufficientBaseCoin')) {
              addLog(`Tip: Pool has insufficient liquidity for this borrow amount`);
            }
            console.error('Flash loan error:', error);
          },
        }
      );
    } catch (error: any) {
      addLog(`[ERROR] Error: ${error.message}`);
      console.error('Flash loan error:', error);
    }
  }, [account, selectedBorrowPool, borrowAmount, borrowAsset, signAndExecute, addLog]);

  // Execute full arbitrage cycle with swap
  const executeFullArbitrage = useCallback(async (opp: ArbitrageOpportunity) => {
    if (!account) {
      addLog('[ERROR] Please connect wallet first');
      return;
    }

    addLog(`Executing full arbitrage: ${opp.path.join(' → ')}`);
    
    const borrowPoolInfo = getPoolInfo(CONFIG, opp.borrowPool);
    const swapPoolInfo = getPoolInfo(CONFIG, opp.swapPool);
    
    if (!borrowPoolInfo || !swapPoolInfo) {
      addLog('[ERROR] Invalid pool configuration');
      return;
    }

    const baseDecimals = getCoinDecimals(CONFIG, borrowPoolInfo.baseCoin);
    const borrowAmountUnits = toUnits(opp.borrowAmount, baseDecimals);

    const tx = new Transaction();
    tx.setSender(account.address);
    tx.setGasBudget(500_000_000);

    try {
      // Step 1: Flash loan borrow base asset
      addLog(`  Step 1: Flash borrow ${opp.borrowAmount} ${borrowPoolInfo.baseCoin}...`);
      
      const [borrowedCoin, flashLoan] = borrowFlashLoanBase({
        tx,
        config: CONFIG,
        poolKey: opp.borrowPool,
        borrowAmount: borrowAmountUnits,
      });

      // Step 2: Swap on the swap pool
      addLog(`  Step 2: Swap on ${opp.swapPool}...`);
      
      // Create zero DEEP coin for fees
      const deepCoinType = CONFIG.coins['DEEP'].type;
      const deepCoin = coinWithBalance({ type: deepCoinType, balance: 0 });
      
      // Determine swap direction based on shared coin
      const swapResult = swapExactBaseForQuote({
        tx,
        config: CONFIG,
        poolKey: opp.swapPool,
        inputCoin: borrowedCoin,
        deepCoin,
        minOutput: BigInt(0), // Accept any output on testnet
        senderAddress: account.address,
      });

      // Step 3: For a complete arbitrage, you'd need another swap back
      // This is simplified - in reality you'd chain multiple swaps
      
      addLog(`  Step 3: (Simplified) Returning flash loan...`);
      
      // Note: In a real arbitrage, you'd have more of the base asset after swaps
      // and return the borrowed amount, keeping profit
      // This demo just shows the pattern
      
      // For now, we can't return directly because we swapped the coin
      // This would need more complex logic to work properly
      
      // Transfer swap results to user
      tx.transferObjects([swapResult[0], swapResult[1], swapResult[2]], account.address);
      
      addLog(`[WARN] Note: Full cycle requires matching pools with liquidity`);
      addLog(`  This demo shows the flash loan + swap pattern`);

      signAndExecute(
        { transaction: tx as any },
        {
          onSuccess: (result) => {
            const explorerUrl = getExplorerUrl(network, result.digest);
            addLog(`[OK] Transaction submitted!`);
            addLog(`Explorer: ${explorerUrl}`);
            setLastTx(result.digest);
          },
          onError: (error) => {
            addLog(`[ERROR] Failed: ${error.message}`);
            if (error.message.includes('FlashLoan')) {
              addLog(`Tip: Flash loan must be returned in same transaction`);
            }
            console.error('Arbitrage error:', error);
          },
        }
      );
    } catch (error: any) {
      addLog(`[ERROR] Error: ${error.message}`);
      console.error('Arbitrage error:', error);
    }
  }, [account, signAndExecute, addLog]);

  const borrowPoolInfo = selectedBorrowPool ? getPoolInfo(CONFIG, selectedBorrowPool) : null;

  return (
    <div className="min-h-screen w-full bg-black text-white">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Link href="/demo" className="text-gray-400 hover:text-white text-sm">Back</Link>
              <h1 className="text-xl sm:text-2xl font-bold text-white">Flash Loan Arbitrage</h1>
            </div>
            <p className="text-sm text-gray-400">Atomic arbitrage using DeepBook V3 flash loans</p>
          </div>
          <NetworkToggle compact />
        </div>

        {/* Mainnet Warning */}
        {isMainnet && (
          <div className="mb-5 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <p className="text-yellow-400 text-sm font-medium">
              Mainnet Mode - Flash loans use real pool liquidity!
            </p>
            <p className="text-yellow-300/70 text-xs mt-1">
              Ensure profitable arbitrage opportunity before execution
            </p>
          </div>
        )}

        {/* Info Banner */}
        <div className="mb-5 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <h3 className="font-medium text-blue-400 text-sm mb-1.5">How Flash Loan Arbitrage Works</h3>
          <ol className="text-xs text-gray-300 space-y-0.5 list-decimal list-inside">
            <li>Borrow assets from DeepBook pool via flash loan (no collateral)</li>
            <li>Swap on another pool at better price</li>
            <li>Swap back to original asset with profit</li>
            <li>Return borrowed amount + keep profit</li>
            <li className="text-yellow-400">All steps MUST complete in one transaction</li>
          </ol>
        </div>

        {/* Flash Loan Config */}
        <div className="bg-gray-900/50 rounded-lg p-4 sm:p-5 border border-gray-800 mb-5">
          <h2 className="text-base font-semibold mb-3">Flash Loan Configuration</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
            {/* Borrow Pool */}
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Borrow Pool</label>
              <select
                value={selectedBorrowPool}
                onChange={(e) => setSelectedBorrowPool(e.target.value)}
                className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-sky-500"
              >
                {availablePools.map(pool => {
                  const info = getPoolInfo(CONFIG, pool);
                  return (
                    <option key={pool} value={pool}>
                      {pool} ({info?.baseCoin}/{info?.quoteCoin})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Borrow Asset */}
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Borrow Asset</label>
              <select
                value={borrowAsset}
                onChange={(e) => setBorrowAsset(e.target.value as 'base' | 'quote')}
                className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-sky-500"
              >
                <option value="base">Base ({borrowPoolInfo?.baseCoin})</option>
                <option value="quote">Quote ({borrowPoolInfo?.quoteCoin})</option>
              </select>
            </div>
          </div>

          {/* Borrow Amount */}
          <div className="mb-3">
            <label className="block text-sm text-gray-400 mb-1.5">Borrow Amount</label>
            <div className="flex gap-2">
              <input
                type="number"
                value={borrowAmount}
                onChange={(e) => setBorrowAmount(e.target.value)}
                placeholder="1.0"
                className="flex-1 bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-sky-500"
              />
              <span className="flex items-center px-3 bg-gray-800 rounded-lg text-sm text-gray-400">
                {borrowAsset === 'base' ? borrowPoolInfo?.baseCoin : borrowPoolInfo?.quoteCoin}
              </span>
            </div>
          </div>

          {/* Swap Pool (optional) */}
          <div className="mb-4">
            <label className="block text-sm text-gray-400 mb-1.5">Swap Pool (for arbitrage)</label>
            <select
              value={selectedSwapPool}
              onChange={(e) => setSelectedSwapPool(e.target.value)}
              className="w-full bg-black border border-gray-700 rounded-lg px-3 py-2 text-sm outline-none focus:border-sky-500"
            >
              <option value="">-- Select swap pool --</option>
              {availablePools.filter(p => p !== selectedBorrowPool).map(pool => {
                const info = getPoolInfo(CONFIG, pool);
                return (
                  <option key={pool} value={pool}>
                    {pool} ({info?.baseCoin}/{info?.quoteCoin})
                  </option>
                );
              })}
            </select>
          </div>

          {/* Execute Buttons */}
          <div className="flex gap-2">
            <button
              onClick={executeFlashArbitrage}
              disabled={isPending || !account || !selectedBorrowPool}
              className="flex-1 py-2.5 bg-sky-500 hover:bg-sky-400 rounded-lg font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? 'Executing...' : 'Execute Flash Loan'}
            </button>
            <button
              onClick={scanOpportunities}
              className="px-4 py-2.5 bg-gray-700 hover:bg-gray-600 rounded-lg font-medium text-sm transition-colors"
            >
              Scan
            </button>
          </div>
        </div>

        {/* Opportunities */}
        {opportunities.length > 0 && (
          <div className="bg-gray-900/50 rounded-lg p-4 sm:p-5 border border-gray-800 mb-5">
            <h2 className="text-base font-semibold mb-3">Arbitrage Opportunities</h2>
            <div className="space-y-2">
              {opportunities.map(opp => (
                <div
                  key={opp.id}
                  className="p-3 bg-black/50 rounded-lg border border-gray-700 hover:border-sky-500/50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-medium text-sky-400 text-sm">{opp.path.join(' -> ')}</span>
                    <span className={`text-xs ${opp.profitPercent > 0.5 ? 'text-green-400' : 'text-yellow-400'}`}>
                      ~{opp.profitPercent.toFixed(2)}% profit
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>Borrow: {opp.borrowPool} | Swap: {opp.swapPool}</span>
                    <button
                      onClick={() => executeFullArbitrage(opp)}
                      disabled={isPending}
                      className="px-2.5 py-1 bg-sky-500/20 text-sky-400 rounded hover:bg-sky-500/30 disabled:opacity-50"
                    >
                      Execute
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Note: Simulated profits. Real arbitrage requires pools with liquidity.
            </p>
          </div>
        )}

        {/* Activity Log */}
        <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-800 mb-5">
          <h3 className="text-sm font-medium text-gray-300 mb-2">Activity Log</h3>
          <div className="bg-black/50 rounded-lg p-2.5 h-40 overflow-y-auto font-mono text-xs">
            {logs.length === 0 ? (
              <p className="text-gray-500">No activity yet. Execute a flash loan to see logs...</p>
            ) : (
              logs.map((log, i) => (
                <p key={i} className="text-gray-400 mb-1">{log}</p>
              ))
            )}
          </div>
        </div>

        {/* Last Transaction */}
        {lastTx && (
          <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg mb-5">
            <p className="text-xs text-green-400">
              Last TX: <a
                href={getExplorerUrl(network, lastTx)}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-green-300"
              >
                {lastTx.slice(0, 20)}...
              </a>
            </p>
          </div>
        )}

        {/* Info */}
        <div className="text-center text-xs text-gray-500 space-y-1">
          <p>Flash loans allow you to borrow without collateral within a single transaction.</p>
          <p className="text-yellow-400">Note: Testnet pools often lack liquidity for arbitrage.</p>
        </div>

        {/* Back Link */}
        <div className="mt-6 text-center">
          <Link href="/demo" className="text-sky-400 hover:text-sky-300 text-sm transition-colors">
            Back to Demo
          </Link>
        </div>
      </div>
    </div>
  );
}
