"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Transaction, coinWithBalance } from "@mysten/sui/transactions";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import Link from "next/link";
import { useNetwork, useNetworkConfig } from "@/contexts/NetworkContext";
import { NetworkToggle } from "@/components/NetworkToggle";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  getConfig,
  getAvailablePoolKeys,
  getPoolInfo,
  getAvailableMarginPoolKeys,
  getMarginPoolInfo,
  isMarginTradingAvailable,
  createMarginManager,
  createMarginManagerWithInitializer,
  shareMarginManager,
  depositMargin,
  withdrawMargin,
  borrowFromMarginPool,
  repayToMarginPool,
  toUnits,
  fromUnits,
  getCoinDecimals,
  type NetworkEnv,
  type DeepBookConfig,
} from "@/lib/deepbook-v3";

// LocalStorage key for storing margin manager IDs (includes network)
const getMarginManagersKey = (network: NetworkEnv) =>
  `deepbook_margin_managers_${network}`;

// Event type for margin manager creation
const MARGIN_MANAGER_CREATED_EVENT =
  "0xb8620c24c9ea1a4a41e79613d2b3d1d93648d1bb6f6b789a7c8f261c94110e4b::margin_manager::MarginManagerCreatedEvent";

interface StoredMarginManager {
  id: string;
  poolKey: string;
  createdAt: number;
  owner: string;
}

export default function MarginTradingPage() {
  // Network context for dynamic mainnet/testnet
  const { network, isMainnet } = useNetwork();
  const { strictBalanceCheck } = useNetworkConfig();

  // Config based on current network
  const CONFIG = useMemo(() => getConfig(network), [network]);

  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction();

  const [selectedPool, setSelectedPool] = useState<string>("");
  const [logs, setLogs] = useState<string[]>([]);
  const [lastTx, setLastTx] = useState<string | null>(null);
  const [marginManagers, setMarginManagers] = useState<StoredMarginManager[]>(
    [],
  );
  const [selectedManager, setSelectedManager] = useState<string>("");
  const [manualManagerId, setManualManagerId] = useState("");
  const [showManualInput, setShowManualInput] = useState(false);

  // Operation states
  const [depositAmount, setDepositAmount] = useState("0.5");
  const [depositCoinType, setDepositCoinType] = useState<"base" | "quote">(
    "quote",
  );
  const [withdrawAmount, setWithdrawAmount] = useState("0.2");
  const [withdrawCoinType, setWithdrawCoinType] = useState<"base" | "quote">(
    "quote",
  );
  const [borrowAmount, setBorrowAmount] = useState("0.1");
  const [borrowIsBase, setBorrowIsBase] = useState(false);
  const [repayAmount, setRepayAmount] = useState("");
  const [repayIsBase, setRepayIsBase] = useState(false);

  const addLog = useCallback((message: string) => {
    console.log("[MarginTrading]", message);
    setLogs((prev) => [
      ...prev.slice(-19),
      `[${new Date().toLocaleTimeString()}] ${message}`,
    ]);
  }, []);

  // Get pools that support margin trading
  const availablePools = useMemo(
    () =>
      getAvailablePoolKeys(CONFIG).filter((poolKey) =>
        isMarginTradingAvailable(CONFIG, poolKey),
      ),
    [CONFIG],
  );

  // Reset on network change
  useEffect(() => {
    setLogs([]);
    setLastTx(null);
    setSelectedManager("");
    setMarginManagers([]);
    addLog(`Network: ${network.toUpperCase()}`);
    if (isMainnet) {
      addLog("[WARN] Mainnet - real funds and margin positions!");
    }
  }, [network, isMainnet, addLog]);

  // Set default pool
  useEffect(() => {
    if (availablePools.length > 0 && !selectedPool) {
      setSelectedPool(availablePools[0]);
    }
  }, [availablePools, selectedPool]);

  // Load stored margin managers from localStorage and query events
  useEffect(() => {
    if (!account?.address) return;

    const loadMarginManagers = async () => {
      try {
        // Load from localStorage first (network-specific key)
        const stored = localStorage.getItem(getMarginManagersKey(network));
        let managers: StoredMarginManager[] = stored ? JSON.parse(stored) : [];

        // Filter to only this user's managers
        managers = managers.filter((m) => m.owner === account.address);

        // Also query events to find any managers created by this user
        try {
          const events = await suiClient.queryEvents({
            query: {
              MoveEventType: MARGIN_MANAGER_CREATED_EVENT,
            },
            limit: 50,
          });

          for (const event of events.data) {
            const parsed = event.parsedJson as any;
            if (
              parsed?.owner === account.address &&
              parsed?.margin_manager_id
            ) {
              // Check if already in list
              const exists = managers.some(
                (m) => m.id === parsed.margin_manager_id,
              );
              if (!exists) {
                managers.push({
                  id: parsed.margin_manager_id,
                  poolKey: "DEEP_SUI", // Default, could be improved
                  createdAt: Number(parsed.timestamp) || Date.now(),
                  owner: account.address,
                });
              }
            }
          }
        } catch (eventError) {
          console.warn("Failed to query margin manager events:", eventError);
        }

        setMarginManagers(managers);

        if (managers.length > 0 && !selectedManager) {
          setSelectedManager(managers[0].id);
          addLog(`Found ${managers.length} margin manager(s)`);
        } else if (managers.length === 0) {
          addLog("No margin managers found. Create one first.");
        }

        // Save back to localStorage (network-specific)
        localStorage.setItem(
          getMarginManagersKey(network),
          JSON.stringify(managers),
        );
      } catch (error) {
        console.warn("Failed to load margin managers:", error);
        addLog("Failed to load margin managers");
      }
    };

    loadMarginManagers();
  }, [account?.address, suiClient, addLog, selectedManager, network]);

  // Save margin manager to storage
  const saveMarginManager = useCallback(
    (managerId: string, poolKey: string) => {
      if (!account?.address) return;

      const stored = localStorage.getItem(getMarginManagersKey(network));
      const managers: StoredMarginManager[] = stored ? JSON.parse(stored) : [];

      // Check if already exists
      if (!managers.some((m) => m.id === managerId)) {
        managers.push({
          id: managerId,
          poolKey,
          createdAt: Date.now(),
          owner: account.address,
        });
        localStorage.setItem(
          getMarginManagersKey(network),
          JSON.stringify(managers),
        );
      }
    },
    [account?.address, network],
  );

  // Add manual manager ID
  const handleAddManualManager = useCallback(() => {
    if (!manualManagerId || !account?.address) {
      addLog("[ERROR] Please enter a valid manager ID");
      return;
    }

    // Validate it looks like an object ID
    if (!manualManagerId.startsWith("0x") || manualManagerId.length < 64) {
      addLog("[ERROR] Invalid manager ID format");
      return;
    }

    saveMarginManager(manualManagerId, selectedPool);

    setMarginManagers((prev) => {
      const exists = prev.some((m) => m.id === manualManagerId);
      if (exists) return prev;
      return [
        ...prev,
        {
          id: manualManagerId,
          poolKey: selectedPool,
          createdAt: Date.now(),
          owner: account.address,
        },
      ];
    });

    setSelectedManager(manualManagerId);
    setManualManagerId("");
    setShowManualInput(false);
    addLog(`[OK] Added manager: ${manualManagerId.slice(0, 16)}...`);
  }, [
    manualManagerId,
    account?.address,
    selectedPool,
    saveMarginManager,
    addLog,
  ]);

  const poolInfo = selectedPool ? getPoolInfo(CONFIG, selectedPool) : null;

  // Create a new margin manager
  const handleCreateMarginManager = useCallback(async () => {
    if (!account) {
      addLog("[ERROR] Please connect wallet first");
      return;
    }

    if (!selectedPool) {
      addLog("[ERROR] Please select a pool first");
      return;
    }

    addLog(`Creating new margin manager for ${selectedPool}...`);
    console.log("[MarginTrading] Creating margin manager with config:", {
      pool: selectedPool,
      marginPackageId: CONFIG.marginPackageId,
      marginRegistryId: CONFIG.marginRegistryId,
    });

    const tx = new Transaction();
    tx.setSender(account.address);
    tx.setGasBudget(100_000_000);

    try {
      // Create margin manager with initializer (so we can deposit in same tx)
      const { manager, initializer } = createMarginManagerWithInitializer({
        tx,
        config: CONFIG,
        poolKey: selectedPool,
      });

      // Share the margin manager
      shareMarginManager({
        tx,
        config: CONFIG,
        poolKey: selectedPool,
        manager,
        initializer,
      });

      signAndExecute(
        { transaction: tx as any },
        {
          onSuccess: async (result) => {
            addLog(`[OK] Margin manager created!`);
            addLog(`TX: ${result.digest.slice(0, 20)}...`);
            setLastTx(result.digest);

            // Extract the created margin manager ID from the transaction
            try {
              const txResult = await suiClient.getTransactionBlock({
                digest: result.digest,
                options: {
                  showObjectChanges: true,
                  showEvents: true,
                },
              });

              // Find the created MarginManager object
              const created = txResult.objectChanges?.find(
                (change: any) =>
                  change.type === "created" &&
                  change.objectType?.includes("margin_manager::MarginManager"),
              );

              if (created && "objectId" in created) {
                const managerId = created.objectId;
                addLog(`Manager ID: ${managerId.slice(0, 20)}...`);

                // Save to storage
                saveMarginManager(managerId, selectedPool);

                // Update state
                setMarginManagers((prev) => {
                  const exists = prev.some((m) => m.id === managerId);
                  if (exists) return prev;
                  return [
                    ...prev,
                    {
                      id: managerId,
                      poolKey: selectedPool,
                      createdAt: Date.now(),
                      owner: account.address,
                    },
                  ];
                });
                setSelectedManager(managerId);
              }
            } catch (fetchError) {
              console.warn("Failed to fetch created manager ID:", fetchError);
              addLog("[WARN] Manager created but ID could not be fetched");
            }
          },
          onError: (error) => {
            addLog(`[ERROR] Failed: ${error.message}`);
            console.error("Create margin manager error:", error);
          },
        },
      );
    } catch (error: any) {
      addLog(`[ERROR] Error: ${error.message}`);
      console.error("Create margin manager error:", error);
    }
  }, [
    account,
    selectedPool,
    signAndExecute,
    addLog,
    suiClient,
    saveMarginManager,
  ]);

  // Deposit collateral
  const handleDeposit = useCallback(async () => {
    console.log("[MarginTrading] handleDeposit called");
    console.log("[MarginTrading] State:", {
      account: !!account,
      selectedManager,
      selectedPool,
      poolInfo: !!poolInfo,
    });

    if (!account) {
      addLog("[ERROR] Please connect wallet first");
      return;
    }

    if (!selectedManager) {
      addLog("[ERROR] Please select or create a margin manager first");
      return;
    }

    if (!selectedPool || !poolInfo) {
      addLog("[ERROR] Please select a pool first");
      return;
    }

    const amount = parseFloat(depositAmount);
    if (isNaN(amount) || amount <= 0) {
      addLog("[ERROR] Invalid deposit amount");
      return;
    }

    const coinSymbol =
      depositCoinType === "base" ? poolInfo.baseCoin : poolInfo.quoteCoin;
    const decimals = getCoinDecimals(CONFIG, coinSymbol);
    const amountUnits = toUnits(amount, decimals);

    addLog(`Depositing ${amount} ${coinSymbol} to margin manager...`);
    console.log("[MarginTrading] Deposit params:", {
      coinSymbol,
      amount,
      amountUnits: amountUnits.toString(),
      marginManagerId: selectedManager,
      coinType: depositCoinType,
    });

    const tx = new Transaction();
    tx.setSender(account.address);
    tx.setGasBudget(100_000_000);

    try {
      const coinType = CONFIG.coins[coinSymbol].type;
      const isSUI = coinType === "0x2::sui::SUI";

      let depositCoinArg;

      if (isSUI) {
        // For SUI, split from gas coin (much more reliable than coinWithBalance)
        console.log("[MarginTrading] Splitting SUI from gas coin");
        [depositCoinArg] = tx.splitCoins(tx.gas, [tx.pure.u64(amountUnits)]);
      } else {
        // For other coins, fetch coins and merge/split
        console.log("[MarginTrading] Fetching coins of type:", coinType);
        const coins = await suiClient.getCoins({
          owner: account.address,
          coinType: coinType,
        });

        if (coins.data.length === 0) {
          addLog(`[ERROR] No ${coinSymbol} coins found in wallet`);
          return;
        }

        // Sum available balance
        const totalBalance = coins.data.reduce(
          (sum, c) => sum + BigInt(c.balance),
          BigInt(0),
        );
        if (totalBalance < amountUnits) {
          addLog(
            `[ERROR] Insufficient ${coinSymbol} balance: ${fromUnits(totalBalance, decimals).toFixed(4)} < ${amount}`,
          );
          return;
        }

        // Use first coin and merge others if needed
        const primaryCoinId = coins.data[0].coinObjectId;

        if (coins.data.length > 1) {
          // Merge all coins into the first one
          const otherCoins = coins.data
            .slice(1)
            .map((c) => tx.object(c.coinObjectId));
          tx.mergeCoins(tx.object(primaryCoinId), otherCoins);
        }

        // Split the exact amount needed
        [depositCoinArg] = tx.splitCoins(tx.object(primaryCoinId), [
          tx.pure.u64(amountUnits),
        ]);
      }

      // Get price info objects
      const baseCoin = CONFIG.coins[poolInfo.baseCoin];
      const quoteCoin = CONFIG.coins[poolInfo.quoteCoin];
      const basePriceInfo = baseCoin.priceInfoObjectId;
      const quotePriceInfo = quoteCoin.priceInfoObjectId;

      if (!basePriceInfo || !quotePriceInfo) {
        addLog("[ERROR] Price info objects not available for margin trading");
        return;
      }

      // Call deposit directly on transaction
      tx.moveCall({
        target: `${CONFIG.marginPackageId}::margin_manager::deposit`,
        arguments: [
          tx.object(selectedManager),
          tx.object(CONFIG.marginRegistryId),
          tx.object(basePriceInfo),
          tx.object(quotePriceInfo),
          depositCoinArg,
          tx.object("0x6"), // Clock
        ],
        typeArguments: [baseCoin.type, quoteCoin.type, coinType],
      });

      console.log("[MarginTrading] Executing deposit transaction...");
      signAndExecute(
        { transaction: tx as any },
        {
          onSuccess: (result) => {
            addLog(`[OK] Deposited ${amount} ${coinSymbol}!`);
            addLog(`TX: ${result.digest.slice(0, 20)}...`);
            setLastTx(result.digest);
          },
          onError: (error) => {
            addLog(`[ERROR] Deposit failed: ${error.message}`);
            console.error("Deposit error:", error);
          },
        },
      );
    } catch (error: any) {
      addLog(`[ERROR] Error: ${error.message}`);
      console.error("Deposit error:", error);
    }
  }, [
    account,
    selectedManager,
    selectedPool,
    poolInfo,
    depositAmount,
    depositCoinType,
    signAndExecute,
    addLog,
    suiClient,
  ]);

  // Withdraw collateral
  const handleWithdraw = useCallback(async () => {
    console.log("[MarginTrading] handleWithdraw called");
    console.log("[MarginTrading] State:", {
      account: !!account,
      selectedManager,
      selectedPool,
      poolInfo: !!poolInfo,
    });

    if (!account) {
      addLog("[ERROR] Please connect wallet first");
      return;
    }

    if (!selectedManager) {
      addLog("[ERROR] Please select or create a margin manager first");
      return;
    }

    if (!selectedPool || !poolInfo) {
      addLog("[ERROR] Please select a pool first");
      return;
    }

    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      addLog("[ERROR] Invalid withdraw amount");
      return;
    }

    const coinSymbol =
      withdrawCoinType === "base" ? poolInfo.baseCoin : poolInfo.quoteCoin;
    const decimals = getCoinDecimals(CONFIG, coinSymbol);
    const amountUnits = toUnits(amount, decimals);

    addLog(`Withdrawing ${amount} ${coinSymbol} from margin manager...`);
    console.log("[MarginTrading] Withdraw params:", {
      coinSymbol,
      amount,
      amountUnits: amountUnits.toString(),
      marginManagerId: selectedManager,
      coinType: withdrawCoinType,
    });

    const tx = new Transaction();
    tx.setSender(account.address);
    tx.setGasBudget(100_000_000);

    try {
      const withdrawnCoin = withdrawMargin({
        tx,
        config: CONFIG,
        poolKey: selectedPool,
        marginManagerId: selectedManager,
        coinType: withdrawCoinType,
        amount: amountUnits,
      });

      // Transfer withdrawn coin to user
      tx.transferObjects([withdrawnCoin], account.address);

      console.log("[MarginTrading] Executing withdraw transaction...");
      signAndExecute(
        { transaction: tx as any },
        {
          onSuccess: (result) => {
            addLog(`[OK] Withdrew ${amount} ${coinSymbol}!`);
            addLog(`TX: ${result.digest.slice(0, 20)}...`);
            setLastTx(result.digest);
          },
          onError: (error) => {
            addLog(`[ERROR] Withdraw failed: ${error.message}`);
            if (error.message.includes("WithdrawRiskRatioExceeded")) {
              addLog(`Tip: Cannot withdraw - would exceed risk ratio`);
            }
            console.error("Withdraw error:", error);
          },
        },
      );
    } catch (error: any) {
      addLog(`[ERROR] Error: ${error.message}`);
      console.error("Withdraw error:", error);
    }
  }, [
    account,
    selectedManager,
    selectedPool,
    poolInfo,
    withdrawAmount,
    withdrawCoinType,
    signAndExecute,
    addLog,
  ]);

  // Borrow from margin pool
  const handleBorrow = useCallback(async () => {
    console.log("[MarginTrading] handleBorrow called");
    console.log("[MarginTrading] State:", {
      account: !!account,
      selectedManager,
      selectedPool,
      poolInfo: !!poolInfo,
    });

    if (!account) {
      addLog("[ERROR] Please connect wallet first");
      return;
    }

    if (!selectedManager) {
      addLog("[ERROR] Please select or create a margin manager first");
      return;
    }

    if (!selectedPool || !poolInfo) {
      addLog("[ERROR] Please select a pool first");
      return;
    }

    const amount = parseFloat(borrowAmount);
    if (isNaN(amount) || amount <= 0) {
      addLog("[ERROR] Invalid borrow amount");
      return;
    }

    const coinSymbol = borrowIsBase ? poolInfo.baseCoin : poolInfo.quoteCoin;
    const decimals = getCoinDecimals(CONFIG, coinSymbol);
    const amountUnits = toUnits(amount, decimals);

    addLog(`Borrowing ${amount} ${coinSymbol} from margin pool...`);
    console.log("[MarginTrading] Borrow params:", {
      coinSymbol,
      amount,
      amountUnits: amountUnits.toString(),
      marginManagerId: selectedManager,
      isBase: borrowIsBase,
    });

    const tx = new Transaction();
    tx.setSender(account.address);
    tx.setGasBudget(100_000_000);

    try {
      borrowFromMarginPool({
        tx,
        config: CONFIG,
        poolKey: selectedPool,
        marginManagerId: selectedManager,
        isBase: borrowIsBase,
        amount: amountUnits,
      });

      console.log("[MarginTrading] Executing borrow transaction...");
      signAndExecute(
        { transaction: tx as any },
        {
          onSuccess: (result) => {
            addLog(`[OK] Borrowed ${amount} ${coinSymbol}!`);
            addLog(`TX: ${result.digest.slice(0, 20)}...`);
            addLog(`[WARN] Remember to repay your loan with interest`);
            setLastTx(result.digest);
          },
          onError: (error) => {
            addLog(`[ERROR] Borrow failed: ${error.message}`);
            if (error.message.includes("BorrowRiskRatioExceeded")) {
              addLog(`Tip: Not enough collateral for this borrow`);
            }
            console.error("Borrow error:", error);
          },
        },
      );
    } catch (error: any) {
      addLog(`[ERROR] Error: ${error.message}`);
      console.error("Borrow error:", error);
    }
  }, [
    account,
    selectedManager,
    selectedPool,
    poolInfo,
    borrowAmount,
    borrowIsBase,
    signAndExecute,
    addLog,
  ]);

  // Repay loan
  const handleRepay = useCallback(async () => {
    console.log("[MarginTrading] handleRepay called");
    console.log("[MarginTrading] State:", {
      account: !!account,
      selectedManager,
      selectedPool,
      poolInfo: !!poolInfo,
    });

    if (!account) {
      addLog("[ERROR] Please connect wallet first");
      return;
    }

    if (!selectedManager) {
      addLog("[ERROR] Please select or create a margin manager first");
      return;
    }

    if (!selectedPool || !poolInfo) {
      addLog("[ERROR] Please select a pool first");
      return;
    }

    const coinSymbol = repayIsBase ? poolInfo.baseCoin : poolInfo.quoteCoin;
    const amount = repayAmount ? parseFloat(repayAmount) : undefined;

    if (amount !== undefined && (isNaN(amount) || amount <= 0)) {
      addLog("[ERROR] Invalid repay amount");
      return;
    }

    const decimals = getCoinDecimals(CONFIG, coinSymbol);
    const amountUnits = amount ? toUnits(amount, decimals) : undefined;

    addLog(`Repaying ${amount || "all"} ${coinSymbol} to margin pool...`);
    console.log("[MarginTrading] Repay params:", {
      coinSymbol,
      amount,
      amountUnits: amountUnits?.toString(),
      marginManagerId: selectedManager,
      isBase: repayIsBase,
    });

    const tx = new Transaction();
    tx.setSender(account.address);
    tx.setGasBudget(100_000_000);

    try {
      repayToMarginPool({
        tx,
        config: CONFIG,
        poolKey: selectedPool,
        marginManagerId: selectedManager,
        isBase: repayIsBase,
        amount: amountUnits,
      });

      console.log("[MarginTrading] Executing repay transaction...");
      signAndExecute(
        { transaction: tx as any },
        {
          onSuccess: (result) => {
            addLog(`[OK] Repaid ${amount || "all"} ${coinSymbol}!`);
            addLog(`TX: ${result.digest.slice(0, 20)}...`);
            setLastTx(result.digest);
          },
          onError: (error) => {
            addLog(`[ERROR] Repay failed: ${error.message}`);
            console.error("Repay error:", error);
          },
        },
      );
    } catch (error: any) {
      addLog(`[ERROR] Error: ${error.message}`);
      console.error("Repay error:", error);
    }
  }, [
    account,
    selectedManager,
    selectedPool,
    poolInfo,
    repayAmount,
    repayIsBase,
    signAndExecute,
    addLog,
  ]);

  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Link
                href="/trade"
                className="text-muted-foreground hover:text-foreground text-sm"
              >
                Back
              </Link>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">
                Margin Trading
              </h1>
            </div>
            <p className="text-sm text-muted-foreground">
              DeepBook V3 Margin Trading with Leverage
            </p>
          </div>
          <NetworkToggle compact />
        </div>

        {/* Mainnet Warning */}
        {isMainnet && (
          <div className="mb-5 p-3 bg-chart-3/10 border border-chart-3/20 rounded-lg">
            <p className="text-chart-3 text-sm font-medium">
              Mainnet Mode - Margin positions use real funds!
            </p>
          </div>
        )}

        {/* Info Banner */}
        <div className="mb-5 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
          <h3 className="font-medium text-blue-400 text-sm mb-1.5">
            How Margin Trading Works
          </h3>
          <ol className="text-xs text-muted-foreground space-y-0.5 list-decimal list-inside">
            <li>Create a Margin Manager for your trading pair</li>
            <li>Deposit collateral (base or quote asset)</li>
            <li>Borrow against your collateral at variable rates</li>
            <li>Use borrowed funds for leveraged trading</li>
            <li>Repay loans to avoid liquidation</li>
          </ol>
          <p className="mt-1.5 text-xs text-chart-3">
            Note: Margin trading requires Pyth price oracles. Only pools with
            price feeds are shown.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5">
          {/* Pool & Manager Selection */}
          <div className="lg:col-span-4 bg-muted/50 rounded-lg p-4 sm:p-5 border border-border">
            <h2 className="text-base font-semibold mb-3">Configuration</h2>

            {/* Pool Selection */}
            <div className="mb-3">
              <label className="block text-sm text-muted-foreground mb-1.5">
                Trading Pool
              </label>
              <select
                value={selectedPool}
                onChange={(e) => setSelectedPool(e.target.value)}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"
              >
                {availablePools.length === 0 && (
                  <option value="">No margin pools available</option>
                )}
                {availablePools.map((pool) => {
                  const info = getPoolInfo(CONFIG, pool);
                  return (
                    <option key={pool} value={pool}>
                      {pool} ({info?.baseCoin}/{info?.quoteCoin})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Margin Manager Selection */}
            <div className="mb-3">
              <label className="block text-sm text-muted-foreground mb-1.5">
                Margin Manager
              </label>
              {marginManagers.length === 0 ? (
                <p className="text-xs text-chart-3 mb-1.5">
                  No margin manager found. Create one or add manually.
                </p>
              ) : (
                <select
                  value={selectedManager}
                  onChange={(e) => setSelectedManager(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"
                >
                  {marginManagers.map((manager) => (
                    <option key={manager.id} value={manager.id}>
                      {manager.id.slice(0, 16)}...{manager.id.slice(-8)}
                    </option>
                  ))}
                </select>
              )}

              {/* Manual Manager ID Input */}
              <Button
                type="button"
                onClick={() => setShowManualInput(!showManualInput)}
                className="mt-2 text-xs text-primary hover:text-primary"
              >
                {showManualInput
                  ? "Hide manual input"
                  : "+ Add manager ID manually"}
              </Button>

              {showManualInput && (
                <div className="mt-2 space-y-2">
                  <input
                    type="text"
                    value={manualManagerId}
                    onChange={(e) => setManualManagerId(e.target.value)}
                    placeholder="0x... (paste manager ID from tx)"
                    className="w-full bg-background border border-border rounded-lg px-3 py-2 text-xs outline-none focus:border-primary"
                  />
                  <Button
                    type="button"
                    onClick={handleAddManualManager}
                    className="w-full py-2 bg-muted hover:bg-muted rounded-lg text-sm transition-colors"
                  >
                    Add Manager
                  </Button>
                </div>
              )}

              {selectedManager && (
                <p className="mt-2 text-xs text-muted-foreground break-all">
                  Selected: {selectedManager}
                </p>
              )}
            </div>

            {/* Create Manager Button */}
            <Button
              type="button"
              onClick={handleCreateMarginManager}
              disabled={isPending || !account || !selectedPool}
              className="w-full py-2.5 bg-primary hover:bg-primary rounded-lg font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? "Creating..." : "Create New Margin Manager"}
            </Button>

            {!account && (
              <p className="text-center text-xs text-muted-foreground mt-2">
                Connect wallet to trade
              </p>
            )}
          </div>

          {/* Operations */}
          <div className="lg:col-span-4 bg-muted/50 rounded-lg p-4 sm:p-5 border border-border">
            <h2 className="text-base font-semibold mb-3">
              Collateral & Borrowing
            </h2>

            {/* Deposit Section */}
            <div className="mb-4 p-3 bg-background/50 rounded-lg">
              <h3 className="text-sm font-medium text-chart-2 mb-2">
                Deposit Collateral
              </h3>
              <div className="flex gap-2 mb-3">
                <input
                  type="number"
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
                  placeholder="Amount"
                  className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <select
                  value={depositCoinType}
                  onChange={(e) =>
                    setDepositCoinType(e.target.value as "base" | "quote")
                  }
                  className="bg-muted border border-border rounded-lg px-2 py-2 text-sm outline-none"
                >
                  <option value="base">{poolInfo?.baseCoin || "Base"}</option>
                  <option value="quote">
                    {poolInfo?.quoteCoin || "Quote"}
                  </option>
                </select>
              </div>
              <Button
                type="button"
                onClick={handleDeposit}
                disabled={isPending || !account || !selectedManager}
                className="w-full py-2 bg-chart-2/20 text-chart-2 hover:bg-chart-2/30 rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
              >
                Deposit
              </Button>
              {!selectedManager && account && (
                <p className="text-xs text-chart-3 mt-1">
                  Select or add a margin manager first
                </p>
              )}
            </div>

            {/* Withdraw Section */}
            <div className="mb-4 p-3 bg-background/50 rounded-lg">
              <h3 className="text-sm font-medium text-orange-400 mb-2">
                Withdraw Collateral
              </h3>
              <div className="flex gap-2 mb-3">
                <input
                  type="number"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="Amount"
                  className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <select
                  value={withdrawCoinType}
                  onChange={(e) =>
                    setWithdrawCoinType(e.target.value as "base" | "quote")
                  }
                  className="bg-muted border border-border rounded-lg px-2 py-2 text-sm outline-none"
                >
                  <option value="base">{poolInfo?.baseCoin || "Base"}</option>
                  <option value="quote">
                    {poolInfo?.quoteCoin || "Quote"}
                  </option>
                </select>
              </div>
              <Button
                type="button"
                onClick={handleWithdraw}
                disabled={isPending || !account || !selectedManager}
                className="w-full py-2 bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
              >
                Withdraw
              </Button>
            </div>

            {/* Borrow Section */}
            <div className="p-3 bg-background/50 rounded-lg">
              <h3 className="text-sm font-medium text-primary mb-2">
                Borrow from Pool
              </h3>
              <div className="flex gap-2 mb-3">
                <input
                  type="number"
                  value={borrowAmount}
                  onChange={(e) => setBorrowAmount(e.target.value)}
                  placeholder="Amount"
                  className="flex-1 bg-muted border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <select
                  value={borrowIsBase ? "base" : "quote"}
                  onChange={(e) => setBorrowIsBase(e.target.value === "base")}
                  className="bg-muted border border-border rounded-lg px-2 py-2 text-sm outline-none"
                >
                  <option value="base">{poolInfo?.baseCoin || "Base"}</option>
                  <option value="quote">
                    {poolInfo?.quoteCoin || "Quote"}
                  </option>
                </select>
              </div>
              <Button
                type="button"
                onClick={handleBorrow}
                disabled={isPending || !account || !selectedManager}
                className="w-full py-2 bg-primary/20 text-primary hover:bg-primary/30 rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
              >
                Borrow
              </Button>
            </div>
          </div>

          {/* Repay & Activity */}
          <div className="lg:col-span-4 space-y-4">
            {/* Repay Section */}
            <div className="bg-muted/50 rounded-lg p-4 sm:p-5 border border-border">
              <h2 className="text-base font-semibold mb-3">Repay Loan</h2>
              <div className="flex gap-2 mb-3">
                <input
                  type="number"
                  value={repayAmount}
                  onChange={(e) => setRepayAmount(e.target.value)}
                  placeholder="Amount (empty = all)"
                  className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm outline-none focus:border-primary"
                />
                <select
                  value={repayIsBase ? "base" : "quote"}
                  onChange={(e) => setRepayIsBase(e.target.value === "base")}
                  className="bg-background border border-border rounded-lg px-2 py-2 text-sm outline-none"
                >
                  <option value="base">{poolInfo?.baseCoin || "Base"}</option>
                  <option value="quote">
                    {poolInfo?.quoteCoin || "Quote"}
                  </option>
                </select>
              </div>
              <Button
                type="button"
                onClick={handleRepay}
                disabled={isPending || !account || !selectedManager}
                className="w-full py-2.5 bg-purple-500 hover:bg-purple-400 rounded-lg font-semibold text-sm transition-colors disabled:opacity-50"
              >
                {repayAmount ? "Repay Amount" : "Repay All"}
              </Button>
            </div>

            {/* Activity Log */}
            <div className="bg-muted/50 rounded-lg p-4 sm:p-5 border border-border">
              <h2 className="text-base font-semibold mb-3">Activity Log</h2>
              <div className="bg-background/50 rounded-lg p-2.5 h-40 overflow-y-auto font-mono text-xs">
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
            </div>
          </div>
        </div>

        {/* Last Transaction */}
        {lastTx && (
          <div className="mt-5 p-3 bg-chart-2/10 border border-green-500/20 rounded-lg">
            <p className="text-xs text-chart-2">
              Last TX:{" "}
              <a
                href={`https://suiscan.xyz/${network}/tx/${lastTx}`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-chart-2"
              >
                {lastTx.slice(0, 20)}...
              </a>
            </p>
          </div>
        )}

        {/* Risk Warning */}
        <div className="mt-4 p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg">
          <h3 className="font-medium text-orange-400 text-sm mb-1">
            Risk Warning
          </h3>
          <p className="text-xs text-muted-foreground">
            Margin trading involves significant risk. Borrowed positions accrue
            interest and may be liquidated if your collateral falls below the
            required ratio.
          </p>
        </div>

        {/* Back Link */}
        <div className="mt-6 text-center">
          <Link
            href="/trade"
            className="text-primary hover:text-primary text-sm transition-colors"
          >
            Back to Trade
          </Link>
        </div>
      </div>
    </div>
  );
}
