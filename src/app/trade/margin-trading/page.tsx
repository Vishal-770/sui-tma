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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
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
import {
  Menu,
  X,
  Wallet,
  ArrowDownCircle,
  ArrowUpCircle,
  DollarSign,
  TrendingUp,
  AlertTriangle,
  Info,
  Plus,
  Settings,
  Activity,
  ChevronRight,
} from "lucide-react";
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
  const [sidebarOpen, setSidebarOpen] = useState(true);

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
    if (!account || !account.address) {
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

  const getExplorerUrl = (network: string, digest: string) => {
    return `https://suiscan.xyz/${network}/tx/${digest}`;
  };

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
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              <h2 className="font-semibold text-lg">Margin Info</h2>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>

          <ScrollArea className="flex-1 pr-2">
            <div className="space-y-4">
              {/* Network Badge */}
              <div>
                <Label className="text-xs text-muted-foreground">Network</Label>
                <div className="mt-1.5">
                  <Badge
                    variant={isMainnet ? "destructive" : "secondary"}
                    className="text-xs"
                  >
                    {network.toUpperCase()}
                  </Badge>
                </div>
              </div>

              {isMainnet && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Mainnet mode - real funds at risk!
                  </AlertDescription>
                </Alert>
              )}

              <Separator />

              {/* Selected Pool */}
              <div>
                <Label className="text-xs text-muted-foreground">
                  Trading Pool
                </Label>
                <div className="mt-1.5">
                  {poolInfo ? (
                    <div className="space-y-1">
                      <Badge variant="outline" className="font-mono text-xs">
                        {selectedPool}
                      </Badge>
                      <p className="text-xs text-muted-foreground">
                        {poolInfo.baseCoin} / {poolInfo.quoteCoin}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No pool selected
                    </p>
                  )}
                </div>
              </div>

              <Separator />

              {/* Margin Manager */}
              <div>
                <Label className="text-xs text-muted-foreground">
                  Margin Manager
                </Label>
                <div className="mt-1.5">
                  {selectedManager ? (
                    <div className="space-y-1">
                      <p className="text-xs font-mono break-all text-foreground">
                        {selectedManager}
                      </p>
                      <Badge variant="secondary" className="text-xs">
                        Active
                      </Badge>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No manager selected
                    </p>
                  )}
                </div>
              </div>

              {marginManagers.length > 0 && (
                <div>
                  <Label className="text-xs text-muted-foreground">
                    Saved Managers ({marginManagers.length})
                  </Label>
                  <div className="mt-1.5 space-y-1">
                    {marginManagers.map((mgr) => (
                      <div
                        key={mgr.id}
                        className={`text-xs font-mono p-2 rounded border ${
                          selectedManager === mgr.id
                            ? "bg-primary/10 border-primary/50"
                            : "bg-muted border-border"
                        }`}
                      >
                        {mgr.id.slice(0, 12)}...{mgr.id.slice(-6)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Separator />

              {/* How It Works */}
              <div>
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5 mb-2">
                  <Info className="w-3 h-3" />
                  How It Works
                </Label>
                <div className="space-y-2 text-xs text-muted-foreground">
                  <div className="flex items-start gap-2">
                    <span className="text-primary font-bold">1.</span>
                    <span>Create a Margin Manager for your trading pair</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-primary font-bold">2.</span>
                    <span>Deposit collateral (base or quote asset)</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-primary font-bold">3.</span>
                    <span>Borrow against collateral at variable rates</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-primary font-bold">4.</span>
                    <span>Use borrowed funds for leveraged trading</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-primary font-bold">5.</span>
                    <span>Repay loans to avoid liquidation</span>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Risk Warning */}
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Margin trading involves significant risk. Borrowed positions
                  accrue interest and may be liquidated if collateral falls
                  below the required ratio.
                </AlertDescription>
              </Alert>

              {lastTx && (
                <>
                  <Separator />
                  <div>
                    <Label className="text-xs text-muted-foreground">
                      Last Transaction
                    </Label>
                    <a
                      href={getExplorerUrl(network, lastTx)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1.5 text-xs text-primary hover:underline break-all block"
                    >
                      {lastTx.slice(0, 20)}...
                    </a>
                  </div>
                </>
              )}
            </div>
          </ScrollArea>
        </div>
      </aside>

      {/* Main Content */}
      <main
        className={`transition-all duration-300 ${
          sidebarOpen ? "lg:pl-80" : "pl-0"
        }`}
      >
        <div className="p-4 sm:p-6 lg:p-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(!sidebarOpen)}
              >
                <Menu className="w-5 h-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold">Margin Trading</h1>
                <p className="text-sm text-muted-foreground">
                  DeepBook V3 leveraged positions
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <NetworkToggle compact />
              <Link href="/trade">
                <Button variant="outline" size="sm">
                  Back to Trade
                </Button>
              </Link>
            </div>
          </div>

          {/* Info Banner */}
          {availablePools.length === 0 && (
            <Alert className="mb-6">
              <Info className="h-4 w-4" />
              <AlertDescription className="text-sm">
                No margin pools available. Margin trading requires Pyth price
                oracles. Only pools with price feeds are shown.
              </AlertDescription>
            </Alert>
          )}

          {/* Configuration Section */}
          <Card className="mb-6">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-primary" />
                <CardTitle>Configuration</CardTitle>
              </div>
              <CardDescription>
                Select pool and margin manager to get started
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Pool Selection */}
                <div className="space-y-2">
                  <Label htmlFor="pool-select">Trading Pool</Label>
                  <Select value={selectedPool} onValueChange={setSelectedPool}>
                    <SelectTrigger id="pool-select">
                      <SelectValue placeholder="Select pool" />
                    </SelectTrigger>
                    <SelectContent>
                      {availablePools.length === 0 ? (
                        <SelectItem value="none" disabled>
                          No margin pools available
                        </SelectItem>
                      ) : (
                        availablePools.map((pool) => {
                          const info = getPoolInfo(CONFIG, pool);
                          return (
                            <SelectItem key={pool} value={pool}>
                              {pool} ({info?.baseCoin}/{info?.quoteCoin})
                            </SelectItem>
                          );
                        })
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {/* Margin Manager Selection */}
                <div className="space-y-2">
                  <Label htmlFor="manager-select">Margin Manager</Label>
                  {marginManagers.length === 0 ? (
                    <div>
                      <Input
                        id="manager-select"
                        value="No manager available"
                        disabled
                        className="mb-2"
                      />
                      <p className="text-xs text-muted-foreground">
                        Create one or add manually below
                      </p>
                    </div>
                  ) : (
                    <Select
                      value={selectedManager}
                      onValueChange={setSelectedManager}
                    >
                      <SelectTrigger id="manager-select">
                        <SelectValue placeholder="Select manager" />
                      </SelectTrigger>
                      <SelectContent>
                        {marginManagers.map((manager) => (
                          <SelectItem key={manager.id} value={manager.id}>
                            {manager.id.slice(0, 16)}...{manager.id.slice(-8)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              {/* Add Manager Manually */}
              <div className="space-y-2 border-t border-border pt-4">
                <Button
                  variant="link"
                  size="sm"
                  onClick={() => setShowManualInput(!showManualInput)}
                  className="h-auto p-0 text-xs"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  {showManualInput
                    ? "Hide manual input"
                    : "Add manager ID manually"}
                </Button>

                {showManualInput && (
                  <div className="flex gap-2">
                    <Input
                      type="text"
                      value={manualManagerId}
                      onChange={(e) => setManualManagerId(e.target.value)}
                      placeholder="0x... (paste manager ID from transaction)"
                      className="flex-1 text-xs"
                    />
                    <Button
                      onClick={handleAddManualManager}
                      size="sm"
                      disabled={!manualManagerId}
                    >
                      Add
                    </Button>
                  </div>
                )}
              </div>

              {/* Create Manager Button */}
              <Button
                onClick={handleCreateMarginManager}
                disabled={isPending || !account || !selectedPool}
                className="w-full max-w-md mx-auto"
                size="lg"
              >
                <Plus className="w-4 h-4 mr-2" />
                {isPending ? "Creating..." : "Create New Margin Manager"}
              </Button>

              {!account && (
                <p className="text-center text-xs text-muted-foreground">
                  Connect wallet to create margin manager
                </p>
              )}
            </CardContent>
          </Card>

          {/* Operations Tabs */}
          <Tabs defaultValue="collateral" className="mb-6">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="collateral">
                <Wallet className="w-4 h-4 mr-2" />
                Deposit
              </TabsTrigger>
              <TabsTrigger value="withdraw">
                <ArrowUpCircle className="w-4 h-4 mr-2" />
                Withdraw
              </TabsTrigger>
              <TabsTrigger value="borrow">
                <DollarSign className="w-4 h-4 mr-2" />
                Borrow
              </TabsTrigger>
              <TabsTrigger value="repay">
                <ArrowDownCircle className="w-4 h-4 mr-2" />
                Repay
              </TabsTrigger>
            </TabsList>

            {/* Deposit Tab */}
            <TabsContent value="collateral">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Deposit Collateral
                  </CardTitle>
                  <CardDescription>
                    Add funds to your margin manager as collateral
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="deposit-amount">Amount</Label>
                      <Input
                        id="deposit-amount"
                        type="number"
                        value={depositAmount}
                        onChange={(e) => setDepositAmount(e.target.value)}
                        placeholder="0.0"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="deposit-coin">Coin Type</Label>
                      <Select
                        value={depositCoinType}
                        onValueChange={(value: "base" | "quote") =>
                          setDepositCoinType(value)
                        }
                      >
                        <SelectTrigger id="deposit-coin">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="base">
                            {poolInfo?.baseCoin || "Base"}
                          </SelectItem>
                          <SelectItem value="quote">
                            {poolInfo?.quoteCoin || "Quote"}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button
                    onClick={handleDeposit}
                    disabled={isPending || !account || !selectedManager}
                    className="w-full max-w-md mx-auto"
                    size="lg"
                  >
                    <ArrowDownCircle className="w-4 h-4 mr-2" />
                    Deposit Collateral
                  </Button>
                  {!selectedManager && account && (
                    <p className="text-xs text-muted-foreground text-center">
                      Select or create a margin manager first
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Withdraw Tab */}
            <TabsContent value="withdraw">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Withdraw Collateral
                  </CardTitle>
                  <CardDescription>
                    Remove funds from your margin manager
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="withdraw-amount">Amount</Label>
                      <Input
                        id="withdraw-amount"
                        type="number"
                        value={withdrawAmount}
                        onChange={(e) => setWithdrawAmount(e.target.value)}
                        placeholder="0.0"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="withdraw-coin">Coin Type</Label>
                      <Select
                        value={withdrawCoinType}
                        onValueChange={(value: "base" | "quote") =>
                          setWithdrawCoinType(value)
                        }
                      >
                        <SelectTrigger id="withdraw-coin">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="base">
                            {poolInfo?.baseCoin || "Base"}
                          </SelectItem>
                          <SelectItem value="quote">
                            {poolInfo?.quoteCoin || "Quote"}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button
                    onClick={handleWithdraw}
                    disabled={isPending || !account || !selectedManager}
                    className="w-full max-w-md mx-auto"
                    size="lg"
                    variant="secondary"
                  >
                    <ArrowUpCircle className="w-4 h-4 mr-2" />
                    Withdraw Collateral
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Borrow Tab */}
            <TabsContent value="borrow">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Borrow from Pool</CardTitle>
                  <CardDescription>
                    Borrow against your collateral at variable rates
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="borrow-amount">Amount</Label>
                      <Input
                        id="borrow-amount"
                        type="number"
                        value={borrowAmount}
                        onChange={(e) => setBorrowAmount(e.target.value)}
                        placeholder="0.0"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="borrow-coin">Coin Type</Label>
                      <Select
                        value={borrowIsBase ? "base" : "quote"}
                        onValueChange={(value) =>
                          setBorrowIsBase(value === "base")
                        }
                      >
                        <SelectTrigger id="borrow-coin">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="base">
                            {poolInfo?.baseCoin || "Base"}
                          </SelectItem>
                          <SelectItem value="quote">
                            {poolInfo?.quoteCoin || "Quote"}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      Borrowed funds accrue interest over time. Monitor your
                      position to avoid liquidation.
                    </AlertDescription>
                  </Alert>
                  <Button
                    onClick={handleBorrow}
                    disabled={isPending || !account || !selectedManager}
                    className="w-full max-w-md mx-auto"
                    size="lg"
                  >
                    <DollarSign className="w-4 h-4 mr-2" />
                    Borrow from Pool
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Repay Tab */}
            <TabsContent value="repay">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Repay Loan</CardTitle>
                  <CardDescription>
                    Return borrowed funds to close or reduce your position
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="repay-amount">Amount</Label>
                      <Input
                        id="repay-amount"
                        type="number"
                        value={repayAmount}
                        onChange={(e) => setRepayAmount(e.target.value)}
                        placeholder="Empty = repay all"
                      />
                      <p className="text-xs text-muted-foreground">
                        Leave empty to repay full loan amount
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="repay-coin">Coin Type</Label>
                      <Select
                        value={repayIsBase ? "base" : "quote"}
                        onValueChange={(value) =>
                          setRepayIsBase(value === "base")
                        }
                      >
                        <SelectTrigger id="repay-coin">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="base">
                            {poolInfo?.baseCoin || "Base"}
                          </SelectItem>
                          <SelectItem value="quote">
                            {poolInfo?.quoteCoin || "Quote"}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button
                    onClick={handleRepay}
                    disabled={isPending || !account || !selectedManager}
                    className="w-full max-w-md mx-auto"
                    size="lg"
                    variant="destructive"
                  >
                    <ArrowDownCircle className="w-4 h-4 mr-2" />
                    {repayAmount ? "Repay Amount" : "Repay All"}
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Activity Log */}
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                <CardTitle>Activity Log</CardTitle>
              </div>
              <CardDescription>
                Recent margin trading operations
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-64 w-full rounded border border-border p-4">
                <div className="space-y-1 font-mono text-xs">
                  {logs.length === 0 ? (
                    <p className="text-muted-foreground">No activity yet...</p>
                  ) : (
                    logs.map((log, i) => (
                      <p key={i} className="text-muted-foreground">
                        {log}
                      </p>
                    ))
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
