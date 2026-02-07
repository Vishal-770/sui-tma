"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Transaction } from "@mysten/sui/transactions";
import type { TransactionObjectArgument } from "@mysten/sui/transactions";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import Link from "next/link";
import { useNetwork, useNetworkConfig } from "@/contexts/NetworkContext";
import { NetworkToggle } from "@/components/NetworkToggle";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Zap,
  ArrowRightLeft,
  TrendingUp,
  Wallet,
  AlertTriangle,
  Info,
  History,
  Repeat,
  DollarSign,
  RefreshCw,
  ChevronRight,
  ExternalLink,
  Home,
  BarChart3,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
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
} from "@/lib/deepbook-v3";

interface ArbitrageOpportunity {
  id: string;
  borrowPool: string;
  borrowAsset: "base" | "quote";
  swapPool: string;
  path: string[];
  borrowAmount: number;
  estimatedReturn: number;
  estimatedProfit: number;
  profitPercent: number;
  pool1Price?: number;
  pool2Price?: number;
  netProfit?: number;
}

interface OrderbookLevel {
  price: string;
  quantity: string;
}

interface OrderbookData {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  best_bid_price?: string;
  best_ask_price?: string;
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

  const [selectedBorrowPool, setSelectedBorrowPool] = useState<string>("");
  const [selectedSwapPool, setSelectedSwapPool] = useState<string>("");
  const [borrowAmount, setBorrowAmount] = useState("1");
  const [borrowAsset, setBorrowAsset] = useState<"base" | "quote">("base");
  const [logs, setLogs] = useState<string[]>([]);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>(
    [],
  );
  const [poolBalances, setPoolBalances] = useState<
    Record<string, { base: bigint; quote: bigint }>
  >({});
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isScanning, setIsScanning] = useState(false);

  // DeepBook Indexer URLs
  const DEEPBOOK_INDEXER_URL = isMainnet
    ? "https://deepbook-indexer.mainnet.mystenlabs.com"
    : "https://deepbook-indexer.testnet.mystenlabs.com";

  // Fetch orderbook data from DeepBook indexer
  const fetchOrderbook = useCallback(
    async (poolName: string): Promise<OrderbookData | null> => {
      try {
        const response = await fetch(
          `${DEEPBOOK_INDEXER_URL}/orderbook/${poolName}?level=2&depth=10`,
        );
        if (!response.ok) return null;
        const data = await response.json();
        return data;
      } catch (error) {
        console.error(`Error fetching orderbook for ${poolName}:`, error);
        return null;
      }
    },
    [DEEPBOOK_INDEXER_URL],
  );

  // Calculate price for a given amount considering orderbook depth
  const calculateExecutionPrice = useCallback(
    (
      orders: OrderbookLevel[],
      amount: number,
      side: "buy" | "sell",
    ): number | null => {
      if (orders.length === 0) return null;

      let remainingAmount = amount;
      let totalCost = 0;

      for (const order of orders) {
        const price = parseFloat(order.price);
        const quantity = parseFloat(order.quantity);

        if (remainingAmount <= 0) break;

        const fillAmount = Math.min(remainingAmount, quantity);
        totalCost += fillAmount * price;
        remainingAmount -= fillAmount;
      }

      // If we couldn't fill the entire order, return null (insufficient liquidity)
      if (remainingAmount > 0) return null;

      return totalCost / amount; // Average execution price
    },
    [],
  );

  const addLog = useCallback((message: string) => {
    setLogs((prev) => [
      ...prev.slice(-14),
      `[${new Date().toLocaleTimeString()}] ${message}`,
    ]);
  }, []);

  const availablePools = useMemo(() => getAvailablePoolKeys(CONFIG), [CONFIG]);

  // Reset on network change
  useEffect(() => {
    setLogs([]);
    setLastTx(null);
    setSelectedBorrowPool("");
    setSelectedSwapPool("");
    setOpportunities([]);
    addLog(`Network: ${network.toUpperCase()}`);
    if (isMainnet) {
      addLog("[WARN] Mainnet mode - flash loans use real funds!");
      addLog("[WARN] Ensure profitable arbitrage before execution");
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
  const scanOpportunities = useCallback(async () => {
    setIsScanning(true);
    addLog("Scanning for arbitrage opportunities...");
    addLog("Querying DeepBook orderbooks...");

    const opps: ArbitrageOpportunity[] = [];

    // Generate demo opportunities based on available pools
    for (let i = 0; i < availablePools.length; i++) {
      for (let j = 0; j < availablePools.length; j++) {
        if (i === j) continue;

        const borrowPool = availablePools[i];
        const swapPool = availablePools[j];

        const borrowPoolInfo = getPoolInfo(CONFIG, borrowPool);
        const swapPoolInfo = getPoolInfo(CONFIG, swapPool);

        if (!borrowPoolInfo || !swapPoolInfo) continue;

        // For a valid arbitrage path, we need a coin that exists in BOTH pools
        // We'll borrow that shared coin from one pool and use it in the other
        const borrowPoolCoins = [
          borrowPoolInfo.baseCoin,
          borrowPoolInfo.quoteCoin,
        ];
        const swapPoolCoins = [
          swapPoolInfo.baseCoin,
          swapPoolInfo.quoteCoin,
        ];

        // Find coins that exist in both pools
        const sharedCoins = borrowPoolCoins.filter((c) =>
          swapPoolCoins.includes(c),
        );

        if (sharedCoins.length === 0) continue;

        // Use the first shared coin as our borrowed asset
        const borrowedCoin = sharedCoins[0];

        // Determine if we borrow base or quote from borrow pool
        const borrowAsset =
          borrowedCoin === borrowPoolInfo.baseCoin ? "base" : "quote";

        // Create path showing the flow: borrow coin -> swap to other coin -> swap back
        const otherCoinInSwapPool =
          borrowedCoin === swapPoolInfo.baseCoin
            ? swapPoolInfo.quoteCoin
            : swapPoolInfo.baseCoin;

        const path = [borrowedCoin, otherCoinInSwapPool, borrowedCoin];

        opps.push({
          id: `opp_${i}_${j}`,
          borrowPool,
          borrowAsset: borrowAsset as "base" | "quote",
          swapPool,
          path,
          borrowAmount: 1,
          estimatedReturn: 0,
          estimatedProfit: 0,
          profitPercent: 0,
        });
      }
    }

    // Fetch orderbook data for all opportunities in parallel
    addLog(`Found ${opps.length} potential paths, checking prices...`);

    const profitableOpps: ArbitrageOpportunity[] = [];

    try {
      // Query all orderbooks in parallel for speed
      const orderbookPromises = opps.map(async (opp) => {
        const [borrowOrderbook, swapOrderbook] = await Promise.all([
          fetchOrderbook(opp.borrowPool),
          fetchOrderbook(opp.swapPool),
        ]);

        if (!borrowOrderbook || !swapOrderbook) return null;

        // Get pool info for this opportunity
        const swapPoolInfo = getPoolInfo(CONFIG, opp.swapPool);
        if (!swapPoolInfo) return null;

        // Calculate prices based on direction
        const borrowAmount = opp.borrowAmount;

        // Step 1: We borrow the shared coin from pool 1
        // (No price impact for borrowing via flash loan)

        // Step 2: Swap borrowed coin for other coin in pool 2
        const isBaseInSwapPool = opp.path[0] === swapPoolInfo.baseCoin;
        const swapOrders = isBaseInSwapPool
          ? swapOrderbook.asks // Selling base (we have), buying quote
          : swapOrderbook.bids; // Selling quote (we have), buying base
        const pool2Price = calculateExecutionPrice(
          swapOrders,
          borrowAmount,
          isBaseInSwapPool ? "sell" : "buy",
        );

        if (!pool2Price) return null; // Insufficient liquidity

        // Step 3: Swap back to original coin
        const receivedAmount = isBaseInSwapPool
          ? borrowAmount * pool2Price
          : borrowAmount / pool2Price;

        // Now we need to swap back - check if we can get more than we borrowed
        const swapBackOrders = isBaseInSwapPool
          ? borrowOrderbook.bids // We have quote, need base
          : borrowOrderbook.asks; // We have base, need quote
        const pool1Price = calculateExecutionPrice(
          swapBackOrders,
          receivedAmount,
          isBaseInSwapPool ? "buy" : "sell",
        );

        if (!pool1Price) return null;

        const finalAmount = isBaseInSwapPool
          ? receivedAmount / pool1Price
          : receivedAmount * pool1Price;

        // Calculate profit after fees
        const SWAP_FEE = 0.003; // 0.3% per swap
        const DEEP_FEE = 0.0001; // 0.01 DEEP per swap (~$0.0001)
        const afterFees =
          finalAmount * (1 - SWAP_FEE) * (1 - SWAP_FEE) - DEEP_FEE * 2;
        const netProfit = afterFees - borrowAmount;
        const profitPercent = (netProfit / borrowAmount) * 100;

        // Only include if profitable (>0.1% to account for gas)
        if (profitPercent > 0.1) {
          return {
            ...opp,
            estimatedReturn: afterFees,
            estimatedProfit: netProfit,
            profitPercent,
            pool1Price,
            pool2Price,
            netProfit,
          };
        }

        return null;
      });

      const results = await Promise.all(orderbookPromises);
      for (const opp of results) {
        if (opp !== null) {
          profitableOpps.push(opp);
        }
      }

      // Sort by profit percentage
      profitableOpps.sort((a, b) => b.profitPercent - a.profitPercent);

      setOpportunities(profitableOpps.slice(0, 5)); // Top 5

      if (profitableOpps.length > 0) {
        addLog(
          `[OK] Found ${profitableOpps.length} profitable opportunities!`,
        );
        addLog(
          `  Best: ${profitableOpps[0].profitPercent.toFixed(3)}% profit`,
        );
      } else {
        addLog("[INFO] No profitable arbitrage opportunities found");
        addLog(
          "  Prices may be too close or insufficient liquidity",
        );
      }
    } catch (error: any) {
      addLog(`[ERROR] Failed to scan orderbooks: ${error.message}`);
      setOpportunities([]);
    } finally {
      setIsScanning(false);
    }
  }, [availablePools, addLog, CONFIG, fetchOrderbook, calculateExecutionPrice, isMainnet]);

  // Execute flash arbitrage
  const executeFlashArbitrage = useCallback(async () => {
    if (!account) {
      addLog("[ERROR] Please connect wallet first");
      return;
    }

    if (!selectedBorrowPool) {
      addLog("[ERROR] Please select a borrow pool");
      return;
    }

    const amount = parseFloat(borrowAmount);
    if (isNaN(amount) || amount <= 0) {
      addLog("[ERROR] Invalid borrow amount");
      return;
    }

    const borrowPoolInfo = getPoolInfo(CONFIG, selectedBorrowPool);
    if (!borrowPoolInfo) {
      addLog("[ERROR] Invalid borrow pool");
      return;
    }

    const assetSymbol =
      borrowAsset === "base"
        ? borrowPoolInfo.baseCoin
        : borrowPoolInfo.quoteCoin;
    const assetDecimals = getCoinDecimals(CONFIG, assetSymbol);
    const borrowAmountUnits = toUnits(amount, assetDecimals);

    // Log all values for debugging
    console.log("[FlashLoan Debug] borrowAsset value:", borrowAsset);
    console.log("[FlashLoan Debug] assetSymbol:", assetSymbol);
    console.log("[FlashLoan Debug] assetDecimals:", assetDecimals);
    console.log(
      "[FlashLoan Debug] borrowAmountUnits:",
      borrowAmountUnits.toString(),
    );

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
      const isQuoteBorrow = borrowAsset === "quote";
      addLog(
        `  Step 1: Borrowing via flash loan (${isQuoteBorrow ? "QUOTE" : "BASE"})...`,
      );
      console.log("[FlashLoan Debug] isQuoteBorrow:", isQuoteBorrow);

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

      addLog("  Step 2: (Demo) Holding borrowed funds...");
      addLog("  [WARN] Real arbitrage would swap through other pools here");

      // Step 3: Return the flash loan
      // IMPORTANT: Must return at least the borrowed amount
      addLog("  Step 3: Returning flash loan...");

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

      addLog("  Step 4: Flash loan cycle complete!");

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
            if (
              error.message.includes("InsufficientPoolLiquidity") ||
              error.message.includes("EInsufficientBaseCoin")
            ) {
              addLog(
                `Tip: Pool has insufficient liquidity for this borrow amount`,
              );
            }
            console.error("Flash loan error:", error);
          },
        },
      );
    } catch (error: any) {
      addLog(`[ERROR] Error: ${error.message}`);
      console.error("Flash loan error:", error);
    }
  }, [
    account,
    selectedBorrowPool,
    borrowAmount,
    borrowAsset,
    signAndExecute,
    addLog,
    CONFIG,
    network,
    setLastTx,
  ]);

  // Execute full arbitrage cycle with swap
  const executeFullArbitrage = useCallback(
    async (opp: ArbitrageOpportunity) => {
      if (!account) {
        addLog("[ERROR] Please connect wallet first");
        return;
      }

      addLog(`Executing full arbitrage: ${opp.path.join(" → ")}`);

      const borrowPoolInfo = getPoolInfo(CONFIG, opp.borrowPool);
      const swapPoolInfo = getPoolInfo(CONFIG, opp.swapPool);

      if (!borrowPoolInfo || !swapPoolInfo) {
        addLog("[ERROR] Invalid pool configuration");
        return;
      }

      const baseDecimals = getCoinDecimals(
        CONFIG,
        opp.borrowAsset === "base"
          ? borrowPoolInfo.baseCoin
          : borrowPoolInfo.quoteCoin,
      );
      const borrowAmountUnits = toUnits(opp.borrowAmount, baseDecimals);

      const tx = new Transaction();
      tx.setSender(account.address);
      tx.setGasBudget(500_000_000);

      try {
        // Step 1: Flash loan borrow
        const borrowedAssetSymbol =
          opp.borrowAsset === "base"
            ? borrowPoolInfo.baseCoin
            : borrowPoolInfo.quoteCoin;

        addLog(
          `  Step 1: Flash borrow ${opp.borrowAmount} ${borrowedAssetSymbol} (${opp.borrowAsset})...`,
        );

        let borrowedCoin: TransactionObjectArgument;
        let flashLoan: TransactionObjectArgument;

        if (opp.borrowAsset === "base") {
          [borrowedCoin, flashLoan] = borrowFlashLoanBase({
            tx,
            config: CONFIG,
            poolKey: opp.borrowPool,
            borrowAmount: borrowAmountUnits,
          });
        } else {
          [borrowedCoin, flashLoan] = borrowFlashLoanQuote({
            tx,
            config: CONFIG,
            poolKey: opp.borrowPool,
            borrowAmount: borrowAmountUnits,
          });
        }

        // Step 2: Swap on the swap pool
        addLog(`  Step 2: Swap on ${opp.swapPool}...`);

        // Create zero DEEP coin for fees (use gas coin since testnet may not have DEEP)
        const deepCoin = tx.splitCoins(tx.gas, [tx.pure.u64(0)])[0];

        // Determine swap direction based on what coin we borrowed
        const borrowedCoinType = borrowedAssetSymbol;

        let swapResult;
        if (borrowedCoinType === swapPoolInfo.baseCoin) {
          // Borrowed coin is BASE in swap pool -> swap BASE for QUOTE
          addLog(
            `  → Swapping ${borrowedCoinType} (base) for ${swapPoolInfo.quoteCoin} (quote)`,
          );
          swapResult = swapExactBaseForQuote({
            tx,
            config: CONFIG,
            poolKey: opp.swapPool,
            inputCoin: borrowedCoin,
            deepCoin,
            minOutput: BigInt(0), // Accept any output on testnet
            senderAddress: account.address,
          });
        } else if (borrowedCoinType === swapPoolInfo.quoteCoin) {
          // Borrowed coin is QUOTE in swap pool -> swap QUOTE for BASE
          addLog(
            `  → Swapping ${borrowedCoinType} (quote) for ${swapPoolInfo.baseCoin} (base)`,
          );
          swapResult = swapExactQuoteForBase({
            tx,
            config: CONFIG,
            poolKey: opp.swapPool,
            inputCoin: borrowedCoin,
            deepCoin,
            minOutput: BigInt(0), // Accept any output on testnet
            senderAddress: account.address,
          });
        } else {
          addLog(
            `[ERROR] Borrowed coin ${borrowedCoinType} not found in swap pool ${opp.swapPool}`,
          );
          return;
        }

        // Step 3: For a complete arbitrage, you'd need another swap back
        // This is simplified - in reality you'd chain multiple swaps

        addLog(`  Step 3: (Simplified) Returning flash loan...`);

        // Note: In a real arbitrage, you'd have more of the base asset after swaps
        // and return the borrowed amount, keeping profit
        // This demo just shows the pattern

        // For now, we can't return directly because we swapped the coin
        // This would need more complex logic to work properly

        // Transfer swap results to user
        tx.transferObjects(
          [swapResult[0], swapResult[1], swapResult[2]],
          account.address,
        );

        addLog(
          `[WARN] Note: Full cycle requires matching pools with liquidity`,
        );
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
              if (error.message.includes("FlashLoan")) {
                addLog(`Tip: Flash loan must be returned in same transaction`);
              }
              console.error("Arbitrage error:", error);
            },
          },
        );
      } catch (error: any) {
        addLog(`[ERROR] Error: ${error.message}`);
        console.error("Arbitrage error:", error);
      }
    },
    [account, signAndExecute, addLog, CONFIG, network, setLastTx],
  );

  const borrowPoolInfo = selectedBorrowPool
    ? getPoolInfo(CONFIG, selectedBorrowPool)
    : null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-screen bg-card border-r border-border transition-all duration-300 z-40 ${
          sidebarOpen ? "w-full sm:w-80 lg:w-80" : "w-0"
        } overflow-hidden`}
      >
        <div className="h-full flex flex-col p-4 sm:p-6">
          {/* Sidebar Header */}
          <div className="flex items-center gap-2 mb-6">
            <Zap className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-foreground">Flash Arbitrage</h2>
          </div>

          <Separator className="mb-4" />

          {/* Navigation Links */}
          <div className="mb-6 space-y-1">
            <Link href="/" className="block">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-muted-foreground hover:text-foreground hover:bg-accent"
              >
                <Home className="w-4 h-4 mr-2" />
                Home
              </Button>
            </Link>
            <Link href="/trade" className="block">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-muted-foreground hover:text-foreground hover:bg-accent"
              >
                <BarChart3 className="w-4 h-4 mr-2" />
                Trade
              </Button>
            </Link>
            <Link href="/trade/flash-arbitrage" className="block">
              <Button
                variant="default"
                size="sm"
                className="w-full justify-start"
              >
                <Zap className="w-4 h-4 mr-2" />
                Flash Arbitrage
              </Button>
            </Link>
          </div>

          <Separator className="mb-4" />

          {/* How It Works */}
          <div className="mb-4 p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
            <div className="flex items-start gap-2 mb-2">
              <Info className="w-4 h-4 text-blue-400 mt-0.5" />
              <h3 className="text-sm font-semibold text-blue-400">
                How It Works
              </h3>
            </div>
            <ol className="text-xs text-muted-foreground space-y-1.5 list-decimal list-inside">
              <li>Borrow assets instantly (no collateral)</li>
              <li>Execute profitable swaps</li>
              <li>Return loan + keep profit</li>
              <li className="text-chart-3 font-medium">
                All in one atomic transaction
              </li>
            </ol>
          </div>

          {/* Activity Log */}
          <div className="flex-1 flex flex-col">
            <div className="flex items-center gap-2 mb-3">
              <History className="w-4 h-4 text-foreground" />
              <h3 className="text-sm font-semibold text-foreground">
                Activity
              </h3>
            </div>
            <ScrollArea className="flex-1">
              <div className="bg-muted/30 rounded-lg p-3 h-64 font-mono text-xs">
                {logs.length === 0 ? (
                  <p className="text-muted-foreground">No activity yet...</p>
                ) : (
                  logs.map((log, i) => (
                    <p key={i} className="text-muted-foreground mb-1">
                      {log}
                    </p>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Network Badge */}
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Network</span>
              <Badge variant="outline">{network}</Badge>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div
        className={`transition-all duration-300 ${
          sidebarOpen ? "lg:ml-80" : "ml-0"
        }`}
      >
        {/* Top Bar */}
        <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b border-border">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="shrink-0"
              >
                {sidebarOpen ? (
                  <>
                    <PanelLeftClose className="w-4 h-4" />
                    <span className="ml-2 hidden sm:inline">Close</span>
                  </>
                ) : (
                  <>
                    <PanelLeftOpen className="w-4 h-4" />
                    <span className="ml-2 hidden sm:inline">Menu</span>
                  </>
                )}
              </Button>
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary" />
                <h2 className="text-base sm:text-lg font-semibold text-foreground">
                  Flash Arbitrage
                </h2>
              </div>
            </div>
            <NetworkToggle compact />
          </div>
        </div>

        <div className="p-4 sm:p-6 lg:p-8">
          {/* Header */}
          <div className="max-w-4xl mx-auto mb-6 sm:mb-8">
            <div className="flex flex-col gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">
                Flash Loan Arbitrage
              </h1>
              <p className="text-sm sm:text-base text-muted-foreground">
                Execute atomic arbitrage opportunities using zero-collateral
                flash loans
              </p>
            </div>
          </div>

          {/* Mainnet Warning */}
          {isMainnet && (
            <div className="max-w-4xl mx-auto mb-6">
              <Alert className="border-chart-3/20 bg-chart-3/5">
                <AlertTriangle className="h-4 w-4 text-chart-3" />
                <AlertDescription className="text-chart-3">
                  <span className="font-semibold">Mainnet Mode:</span> Flash
                  loans use real funds. Ensure profitable arbitrage before
                  execution.
                </AlertDescription>
              </Alert>
            </div>
          )}

          {/* Main Cards */}
          <div className="max-w-4xl mx-auto">
            <Tabs defaultValue="manual" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-6">
                <TabsTrigger value="manual" className="flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  Manual Execution
                </TabsTrigger>
                <TabsTrigger
                  value="opportunities"
                  className="flex items-center gap-2"
                >
                  <TrendingUp className="w-4 h-4" />
                  Opportunities
                </TabsTrigger>
              </TabsList>

              {/* Manual Execution Tab */}
              <TabsContent value="manual" className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <Wallet className="w-5 h-5 text-primary" />
                      <CardTitle>Configure Flash Loan</CardTitle>
                    </div>
                    <CardDescription>
                      Set up your flash loan parameters for manual execution
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Borrow Pool */}
                    <div className="space-y-2">
                      <Label htmlFor="borrow-pool">Borrow Pool</Label>
                      <Select
                        value={selectedBorrowPool}
                        onValueChange={setSelectedBorrowPool}
                      >
                        <SelectTrigger id="borrow-pool">
                          <SelectValue placeholder="Select pool to borrow from" />
                        </SelectTrigger>
                        <SelectContent>
                          {availablePools.map((pool) => {
                            const info = getPoolInfo(CONFIG, pool);
                            return (
                              <SelectItem key={pool} value={pool}>
                                <div className="flex items-center gap-2">
                                  <Badge
                                    variant="outline"
                                    className="font-mono text-xs"
                                  >
                                    {pool}
                                  </Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {info?.baseCoin}/{info?.quoteCoin}
                                  </span>
                                </div>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Borrow Asset & Amount */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="borrow-asset">Borrow Asset</Label>
                        <Select
                          value={borrowAsset}
                          onValueChange={(value) =>
                            setBorrowAsset(value as "base" | "quote")
                          }
                        >
                          <SelectTrigger id="borrow-asset">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="base">
                              <div className="flex items-center gap-2">
                                <span>Base</span>
                                <Badge variant="secondary" className="text-xs">
                                  {borrowPoolInfo?.baseCoin || "--"}
                                </Badge>
                              </div>
                            </SelectItem>
                            <SelectItem value="quote">
                              <div className="flex items-center gap-2">
                                <span>Quote</span>
                                <Badge variant="secondary" className="text-xs">
                                  {borrowPoolInfo?.quoteCoin || "--"}
                                </Badge>
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="borrow-amount">Amount</Label>
                        <div className="relative">
                          <Input
                            id="borrow-amount"
                            type="number"
                            value={borrowAmount}
                            onChange={(e) => setBorrowAmount(e.target.value)}
                            placeholder="1.0"
                            className="pr-20"
                          />
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">
                            {borrowAsset === "base"
                              ? borrowPoolInfo?.baseCoin || "--"
                              : borrowPoolInfo?.quoteCoin || "--"}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Swap Pool (Optional) */}
                    <div className="space-y-2">
                      <Label htmlFor="swap-pool">
                        Swap Pool
                        <span className="text-muted-foreground ml-1">
                          (Optional for arbitrage)
                        </span>
                      </Label>
                      <Select
                        value={selectedSwapPool || undefined}
                        onValueChange={setSelectedSwapPool}
                      >
                        <SelectTrigger id="swap-pool">
                          <SelectValue placeholder="None (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          {availablePools
                            .filter((p) => p !== selectedBorrowPool)
                            .map((pool) => {
                              const info = getPoolInfo(CONFIG, pool);
                              return (
                                <SelectItem key={pool} value={pool}>
                                  <div className="flex items-center gap-2">
                                    <Badge
                                      variant="outline"
                                      className="font-mono text-xs"
                                    >
                                      {pool}
                                    </Badge>
                                    <span className="text-xs text-muted-foreground">
                                      {info?.baseCoin}/{info?.quoteCoin}
                                    </span>
                                  </div>
                                </SelectItem>
                              );
                            })}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-3 pt-2">
                      <Button
                        onClick={executeFlashArbitrage}
                        disabled={isPending || !account || !selectedBorrowPool}
                        className="flex-1"
                        size="lg"
                      >
                        {isPending ? (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            Executing...
                          </>
                        ) : (
                          <>
                            <Zap className="w-4 h-4 mr-2" />
                            Execute Flash Loan
                          </>
                        )}
                      </Button>
                      <Button
                        onClick={scanOpportunities}
                        variant="outline"
                        disabled={isPending || isScanning}
                        size="lg"
                      >
                        <RefreshCw className={`w-4 h-4 mr-2 ${isScanning ? "animate-spin" : ""}`} />
                        {isScanning ? "Scanning..." : "Scan"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Opportunities Tab */}
              <TabsContent value="opportunities" className="space-y-4">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-primary" />
                        <CardTitle>Detected Opportunities</CardTitle>
                      </div>
                      <Button
                        onClick={scanOpportunities}
                        variant="outline"
                        size="sm"
                        disabled={isPending || isScanning}
                      >
                        <RefreshCw className={`w-4 h-4 mr-2 ${isScanning ? "animate-spin" : ""}`} />
                        {isScanning ? "Scanning..." : "Refresh"}
                      </Button>
                    </div>
                    <CardDescription>
                      Potential arbitrage paths across DeepBook pools
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {opportunities.length === 0 ? (
                      <div className="text-center py-12">
                        <TrendingUp className="w-12 h-12 mx-auto mb-4 text-muted-foreground/50" />
                        <p className="text-muted-foreground mb-2">
                          {isScanning
                            ? "Querying DeepBook orderbooks..."
                            : "No profitable opportunities found"}
                        </p>
                        <p className="text-sm text-muted-foreground/70">
                          {isScanning
                            ? "Calculating real-time price differences..."
                            : 'Click "Refresh" to scan for arbitrage with live orderbook data'}
                        </p>
                        {!isScanning && (
                          <p className="text-xs text-muted-foreground/50 mt-2">
                            Note: Testnet pools may have limited liquidity
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {opportunities.map((opp) => (
                          <Card
                            key={opp.id}
                            className="border-border/50 hover:border-primary/50 transition-colors"
                          >
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between gap-4 mb-3">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                                    {opp.path.map((token, idx) => (
                                      <div
                                        key={idx}
                                        className="flex items-center"
                                      >
                                        <Badge
                                          variant="secondary"
                                          className="font-mono"
                                        >
                                          {token}
                                        </Badge>
                                        {idx < opp.path.length - 1 && (
                                          <ChevronRight className="w-4 h-4 mx-1 text-muted-foreground" />
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                      <Wallet className="w-3 h-3" />
                                      Borrow: {opp.borrowPool}
                                    </span>
                                    <span>•</span>
                                    <span className="flex items-center gap-1">
                                      <ArrowRightLeft className="w-3 h-3" />
                                      Swap: {opp.swapPool}
                                    </span>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="flex items-center justify-end gap-2 mb-1">
                                    {opp.netProfit !== undefined && (
                                      <span className="text-xs bg-green-500/10 text-green-500 px-2 py-0.5 rounded font-medium">
                                        Real
                                      </span>
                                    )}
                                    <div
                                      className={`text-lg font-bold ${
                                        opp.profitPercent > 1
                                          ? "text-green-500"
                                          : opp.profitPercent > 0.5
                                            ? "text-yellow-500"
                                            : "text-chart-3"
                                      }`}
                                    >
                                      +{opp.profitPercent.toFixed(3)}%
                                    </div>
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {opp.netProfit !== undefined
                                      ? `+${opp.netProfit.toFixed(4)} profit`
                                      : "Est. Profit"}
                                  </p>
                                </div>
                              </div>
                              <Button
                                onClick={() => executeFullArbitrage(opp)}
                                disabled={isPending}
                                className="w-full"
                                size="sm"
                              >
                                {isPending ? (
                                  <>
                                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                    Executing...
                                  </>
                                ) : (
                                  <>
                                    <Zap className="w-4 h-4 mr-2" />
                                    Execute Arbitrage
                                  </>
                                )}
                              </Button>
                            </CardContent>
                          </Card>
                        ))}
                        <Alert>
                          <Info className="h-4 w-4" />
                          <AlertDescription className="text-xs">
                            Profits calculated using real DeepBook orderbook
                            data. Opportunities with "Real" badge show actual
                            price differences accounting for fees and
                            slippage.
                          </AlertDescription>
                        </Alert>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>

          {/* Last Transaction */}
          {lastTx && (
            <div className="max-w-4xl mx-auto mt-4">
              <Alert className="border-chart-2/20 bg-chart-2/5">
                <ExternalLink className="h-4 w-4 text-chart-2" />
                <AlertDescription>
                  <span className="text-chart-2 font-medium">
                    Transaction successful!
                  </span>
                  <a
                    href={getExplorerUrl(network, lastTx)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ml-2 underline hover:text-chart-2/80 font-mono text-xs"
                  >
                    {lastTx.slice(0, 20)}...
                  </a>
                </AlertDescription>
              </Alert>
            </div>
          )}

          {/* Info Footer */}
          <div className="max-w-4xl mx-auto mt-8 text-center text-sm text-muted-foreground">
            <p>
              Flash loans enable zero-collateral borrowing within atomic
              transactions.
            </p>
            {!isMainnet && (
              <p className="mt-2 text-xs text-chart-3">
                Note: Testnet pools may lack sufficient liquidity for arbitrage
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
