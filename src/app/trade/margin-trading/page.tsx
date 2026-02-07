"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Transaction } from "@mysten/sui/transactions";
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
  isMarginTradingAvailable,
  toUnits,
  fromUnits,
  getCoinDecimals,
  createMarginManagerWithInitializer,
  shareMarginManager,
  type NetworkEnv,
  type DeepBookConfig,
} from "@/lib/deepbook-v3";
import {
  createDeepBookClient,
  queryMarginManagerState,
  type MarginManagerMap,
  type DeepBookExtendedClient,
} from "@/lib/deepbook-client";

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

  // DeepBook SDK client (recreated when margin managers change)
  const [deepBookClient, setDeepBookClient] =
    useState<DeepBookExtendedClient | null>(null);
  const [marginManagerState, setMarginManagerState] = useState<{
    baseDeposited: bigint;
    quoteDeposited: bigint;
    deepDeposited: bigint;
    baseBorrowed: bigint;
    quoteBorrowed: bigint;
  } | null>(null);

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

  // Create/recreate DeepBook client when margin managers or account changes
  useEffect(() => {
    if (!account?.address) {
      setDeepBookClient(null);
      return;
    }

    // Convert StoredMarginManager[] to MarginManagerMap
    const marginManagerMap: MarginManagerMap = {};
    marginManagers.forEach((mgr) => {
      const key = `MGR_${mgr.id.slice(0, 8)}`;
      marginManagerMap[key] = {
        address: mgr.id,
        poolKey: mgr.poolKey,
      };
    });

    // Create extended client with margin managers
    // This creates its own SuiClient instance with $extend support
    const client = createDeepBookClient({
      env: network,
      address: account.address,
      marginManagers: marginManagerMap,
    });

    setDeepBookClient(client);
    addLog(
      `DeepBook client initialized with ${marginManagers.length} margin manager(s)`,
    );
  }, [account?.address, marginManagers, network, addLog]);

  // Query margin manager state when selected manager changes
  useEffect(() => {
    if (!selectedManager || !suiClient) {
      setMarginManagerState(null);
      return;
    }

    const queryState = async () => {
      const state = await queryMarginManagerState({
        client: suiClient,
        marginManagerId: selectedManager,
      });

      if (state) {
        setMarginManagerState(state);
        addLog(
          `[INFO] Manager state: ${fromUnits(state.baseDeposited, 9)} base, ${fromUnits(state.quoteDeposited, 6)} quote deposited`,
        );
      }
    };

    queryState();
  }, [selectedManager, suiClient, addLog]);

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
    if (!account || !deepBookClient) {
      addLog(
        "[ERROR] Please connect wallet and wait for client initialization",
      );
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

    addLog(`Depositing ${amount} ${coinSymbol} to margin manager...`);

    const tx = new Transaction();
    tx.setSender(account.address);
    tx.setGasBudget(100_000_000);

    try {
      // Find the manager key for this manager ID
      const managerKey = `MGR_${selectedManager.slice(0, 8)}`;

      // Get coin type and decimals
      const poolInfo = CONFIG.pools[selectedPool];
      if (!poolInfo) throw new Error("Pool info not found");

      let coinType: string;
      let coinDecimals: number;

      if (depositCoinType === "base") {
        const baseCoin = CONFIG.coins[poolInfo.baseCoin];
        coinType = baseCoin.type;
        coinDecimals = baseCoin.scalar;
      } else if (coinSymbol === "DEEP") {
        const deepCoin = CONFIG.coins["DEEP"];
        coinType = deepCoin.type;
        coinDecimals = deepCoin.scalar;
      } else {
        const quoteCoin = CONFIG.coins[poolInfo.quoteCoin];
        coinType = quoteCoin.type;
        coinDecimals = quoteCoin.scalar;
      }

      // Convert amount to base units
      const amountInBaseUnits = BigInt(Math.floor(amount * coinDecimals));

      // Manually select coins - SDK's auto selection needs getBalance() which SuiGrpcClient doesn't have
      let coinArg;

      if (coinType.includes("::sui::SUI")) {
        // For SUI, split from gas
        coinArg = tx.splitCoins(tx.gas, [amountInBaseUnits]);
      } else {
        // For other coins, query user's coins and merge them
        const userCoins = await suiClient.getCoins({
          owner: account.address,
          coinType,
        });

        if (!userCoins.data.length) {
          throw new Error(`No ${coinSymbol} coins found in wallet`);
        }

        // Create coin references and merge if needed
        const [firstCoin, ...otherCoins] = userCoins.data;
        const primaryCoin = tx.object(firstCoin.coinObjectId);

        if (otherCoins.length > 0) {
          tx.mergeCoins(
            primaryCoin,
            otherCoins.map((c) => tx.object(c.coinObjectId)),
          );
        }

        // Split the required amount
        coinArg = tx.splitCoins(primaryCoin, [amountInBaseUnits]);
      }

      // Use SDK method based on coin type - pass coin TransactionArgument
      if (depositCoinType === "base") {
        deepBookClient.deepbook.marginManager.depositBase({
          managerKey,
          coin: coinArg,
        })(tx);
      } else if (coinSymbol === "DEEP") {
        deepBookClient.deepbook.marginManager.depositDeep({
          managerKey,
          coin: coinArg,
        })(tx);
      } else {
        deepBookClient.deepbook.marginManager.depositQuote({
          managerKey,
          coin: coinArg,
        })(tx);
      }

      signAndExecute(
        { transaction: tx as any },
        {
          onSuccess: (result) => {
            addLog(`[OK] Deposited ${amount} ${coinSymbol}!`);
            addLog(`TX: ${result.digest.slice(0, 20)}...`);
            setLastTx(result.digest);

            // Refresh margin manager state
            queryMarginManagerState({
              client: suiClient,
              marginManagerId: selectedManager,
            }).then((state) => {
              if (state) setMarginManagerState(state);
            });
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
    deepBookClient,
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
    if (!account || !deepBookClient) {
      addLog(
        "[ERROR] Please connect wallet and wait for client initialization",
      );
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

    addLog(`Withdrawing ${amount} ${coinSymbol} from margin manager...`);

    const tx = new Transaction();
    tx.setSender(account.address);
    tx.setGasBudget(100_000_000);

    try {
      const managerKey = `MGR_${selectedManager.slice(0, 8)}`;

      // Get coin decimals
      const poolInfo = CONFIG.pools[selectedPool];
      if (!poolInfo) throw new Error("Pool info not found");

      let coinDecimals: number;
      if (withdrawCoinType === "base") {
        coinDecimals = CONFIG.coins[poolInfo.baseCoin].scalar;
      } else if (coinSymbol === "DEEP") {
        coinDecimals = CONFIG.coins["DEEP"].scalar;
      } else {
        coinDecimals = CONFIG.coins[poolInfo.quoteCoin].scalar;
      }

      const amountInBaseUnits = Math.floor(amount * coinDecimals);

      // Withdraw takes coins from margin manager and returns to wallet
      // Use positional arguments (managerKey, amount as number)
      if (withdrawCoinType === "base") {
        deepBookClient.deepbook.marginManager.withdrawBase(
          managerKey,
          amountInBaseUnits,
        )(tx);
      } else if (coinSymbol === "DEEP") {
        deepBookClient.deepbook.marginManager.withdrawDeep(
          managerKey,
          amountInBaseUnits,
        )(tx);
      } else {
        deepBookClient.deepbook.marginManager.withdrawQuote(
          managerKey,
          amountInBaseUnits,
        )(tx);
      }

      signAndExecute(
        { transaction: tx as any },
        {
          onSuccess: (result) => {
            addLog(`[OK] Withdrew ${amount} ${coinSymbol}!`);
            addLog(`TX: ${result.digest.slice(0, 20)}...`);
            setLastTx(result.digest);

            // Refresh state
            queryMarginManagerState({
              client: suiClient,
              marginManagerId: selectedManager,
            }).then((state) => {
              if (state) setMarginManagerState(state);
            });
          },
          onError: (error) => {
            addLog(`[ERROR] Withdraw failed: ${error.message}`);
            if (error.message.includes("RiskRatio")) {
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
    deepBookClient,
    selectedManager,
    selectedPool,
    poolInfo,
    withdrawAmount,
    withdrawCoinType,
    signAndExecute,
    addLog,
    suiClient,
  ]);

  // Borrow from margin pool
  const handleBorrow = useCallback(async () => {
    if (!account || !deepBookClient) {
      addLog(
        "[ERROR] Please connect wallet and wait for client initialization",
      );
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
    addLog(`Borrowing ${amount} ${coinSymbol} from margin pool...`);

    const tx = new Transaction();
    tx.setSender(account.address);
    tx.setGasBudget(100_000_000);

    try {
      const managerKey = `MGR_${selectedManager.slice(0, 8)}`;

      // Get pool key
      const poolKey = `POOL_${selectedPool}`;

      // Get coin decimals
      const poolInfo = CONFIG.pools[selectedPool];
      if (!poolInfo) throw new Error("Pool info not found");

      let coinDecimals: number;
      if (borrowIsBase) {
        coinDecimals = CONFIG.coins[poolInfo.baseCoin].scalar;
      } else {
        coinDecimals = CONFIG.coins[poolInfo.quoteCoin].scalar;
      }

      const amountInBaseUnits = Math.floor(amount * coinDecimals);

      // Borrow takes from pool and deposits into margin manager
      // Use positional arguments (managerKey, amount) - pool determined from manager config
      if (borrowIsBase) {
        deepBookClient.deepbook.marginManager.borrowBase(
          managerKey,
          amountInBaseUnits,
        )(tx);
      } else {
        deepBookClient.deepbook.marginManager.borrowQuote(
          managerKey,
          amountInBaseUnits,
        )(tx);
      }

      signAndExecute(
        { transaction: tx as any },
        {
          onSuccess: (result) => {
            addLog(`[OK] Borrowed ${amount} ${coinSymbol}!`);
            addLog(`TX: ${result.digest.slice(0, 20)}...`);
            addLog(`[WARN] Remember to repay your loan with interest`);
            setLastTx(result.digest);

            // Refresh state
            queryMarginManagerState({
              client: suiClient,
              marginManagerId: selectedManager,
            }).then((state) => {
              if (state) setMarginManagerState(state);
            });
          },
          onError: (error) => {
            addLog(`[ERROR] Borrow failed: ${error.message}`);
            if (error.message.includes("RiskRatio")) {
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
    deepBookClient,
    selectedManager,
    selectedPool,
    poolInfo,
    borrowAmount,
    borrowIsBase,
    signAndExecute,
    addLog,
    suiClient,
  ]);

  // Repay loan
  const handleRepay = useCallback(async () => {
    if (!account || !deepBookClient) {
      addLog(
        "[ERROR] Please connect wallet and wait for client initialization",
      );
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

    addLog(`Repaying ${amount || "all"} ${coinSymbol} to margin pool...`);

    const tx = new Transaction();
    tx.setSender(account.address);
    tx.setGasBudget(100_000_000);

    try {
      const managerKey = `MGR_${selectedManager.slice(0, 8)}`;

      // Get pool key
      const poolKey = `POOL_${selectedPool}`;

      // Get coin type and decimals
      const poolInfo = CONFIG.pools[selectedPool];
      if (!poolInfo) throw new Error("Pool info not found");

      let coinType: string;
      let coinDecimals: number;
      if (repayIsBase) {
        const baseCoin = CONFIG.coins[poolInfo.baseCoin];
        coinType = baseCoin.type;
        coinDecimals = baseCoin.scalar;
      } else {
        const quoteCoin = CONFIG.coins[poolInfo.quoteCoin];
        coinType = quoteCoin.type;
        coinDecimals = quoteCoin.scalar;
      }

      // If amount specified, convert to base units
      let amountInBaseUnits: number | undefined;
      if (amount !== undefined) {
        amountInBaseUnits = Math.floor(amount * coinDecimals);
      }

      // Repay from margin manager balance (not wallet)
      // Pass managerKey and optional amount. If no amount, repays all debt
      if (repayIsBase) {
        deepBookClient.deepbook.marginManager.repayBase(
          managerKey,
          amountInBaseUnits,
        )(tx);
      } else {
        deepBookClient.deepbook.marginManager.repayQuote(
          managerKey,
          amountInBaseUnits,
        )(tx);
      }

      signAndExecute(
        { transaction: tx as any },
        {
          onSuccess: (result) => {
            addLog(`[OK] Repaid ${amount} ${coinSymbol}!`);
            addLog(`TX: ${result.digest.slice(0, 20)}...`);
            setLastTx(result.digest);

            // Refresh state
            queryMarginManagerState({
              client: suiClient,
              marginManagerId: selectedManager,
            }).then((state) => {
              if (state) setMarginManagerState(state);
            });
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
    deepBookClient,
    selectedManager,
    selectedPool,
    poolInfo,
    repayAmount,
    repayIsBase,
    signAndExecute,
    addLog,
    suiClient,
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
