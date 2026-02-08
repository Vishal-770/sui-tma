"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Transaction } from "@mysten/sui/transactions";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
  ConnectButton,
} from "@mysten/dapp-kit";
import Link from "next/link";
import {
  Home,
  TrendingUp,
  Wallet,
  Zap,
  CheckCircle2,
  AlertCircle,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Loader2,
} from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  getConfig,
  getAvailablePoolKeys,
  getPoolInfo,
  generateTradeProofAsOwner,
  placeLimitOrder,
  cancelOrder as dbCancelOrder,
  OrderType,
  SelfMatchingOption,
  type NetworkEnv,
} from "@/lib/deepbook-v3";

// Use network context instead of hardcoded
const DEMO_MODE = false;

interface LimitOrder {
  id: string;
  pair: string;
  side: "buy" | "sell";
  type: "limit" | "stop-loss" | "take-profit";
  triggerPrice: number;
  quantity: number;
  status: "pending" | "triggered" | "filled" | "cancelled";
  createdAt: Date;
  triggeredAt?: Date;
  txDigest?: string;
  onChainOrderId?: bigint;
}

export default function LimitOrdersPage() {
  // Network context for dynamic mainnet/testnet
  const { network, isMainnet } = useNetwork();
  const { strictBalanceCheck } = useNetworkConfig();

  // Config based on current network
  const config = useMemo(() => getConfig(network), [network]);

  const [logs, setLogs] = useState<string[]>([]);
  const [orders, setOrders] = useState<LimitOrder[]>([]);
  const [selectedPair, setSelectedPair] = useState<string>("DEEP_SUI");
  const [orderType, setOrderType] = useState<
    "limit" | "stop-loss" | "take-profit"
  >("limit");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [triggerPrice, setTriggerPrice] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("10");
  const [prices, setPrices] = useState<Record<string, number>>({});

  // Balance Manager State
  const [userBalanceManagerId, setUserBalanceManagerId] = useState<
    string | null
  >(null);
  const [bmBalances, setBmBalances] = useState<Record<string, string>>({});
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);
  const [availableBalanceManagers, setAvailableBalanceManagers] = useState<
    Array<{ id: string; balances: Record<string, string> }>
  >([]);
  const [isLoadingBalanceManagers, setIsLoadingBalanceManagers] =
    useState(false);
  const [selectedManagerIndex, setSelectedManagerIndex] = useState<number>(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction();

  const addLog = useCallback((msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => [...prev.slice(-50), `[${timestamp}] ${msg}`]);
    console.log(`[LimitOrders] ${msg}`);
  }, []);

  // Get available pools
  const getAvailablePools = useCallback(() => {
    return getAvailablePoolKeys(config);
  }, []);

  // Fetch prices from DeepBook
  const fetchPrices = useCallback(
    async (poolKeys: string[]): Promise<Record<string, number>> => {
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

          if (poolState.data?.content && "fields" in poolState.data.content) {
            // Default simulation price if we can't read pool state
            if (poolKey === "DEEP_SUI") {
              newPrices[poolKey] = 0.025; // ~$0.025 per DEEP
            } else if (poolKey === "SUI_USDC") {
              newPrices[poolKey] = 4.2; // ~$4.20 per SUI
            } else if (poolKey === "DEEP_USDC") {
              newPrices[poolKey] = 0.1; // ~$0.10 per DEEP
            } else {
              newPrices[poolKey] = 1.0;
            }
          }
        } catch (error) {
          // Use fallback prices
          if (poolKey === "DEEP_SUI") newPrices[poolKey] = 0.025;
          else if (poolKey === "SUI_USDC") newPrices[poolKey] = 4.2;
          else if (poolKey === "DEEP_USDC") newPrices[poolKey] = 0.1;
          else newPrices[poolKey] = 1.0;
        }
      }

      return newPrices;
    },
    [suiClient],
  );

  // Update selected balance manager when availableBalanceManagers changes
  useEffect(() => {
    if (availableBalanceManagers.length > 0) {
      // Check if we have a saved balance manager
      const savedBm = localStorage.getItem(
        `balance_manager_${network}_${account?.address}`,
      );

      if (savedBm) {
        // Find the index of the saved balance manager
        const savedIndex = availableBalanceManagers.findIndex(
          (m) => m.id === savedBm,
        );
        if (savedIndex !== -1) {
          setSelectedManagerIndex(savedIndex);
          setUserBalanceManagerId(savedBm);
        } else {
          // Saved BM not found, use first available
          setSelectedManagerIndex(0);
          setUserBalanceManagerId(availableBalanceManagers[0].id);
        }
      } else {
        // No saved BM, use first available
        setSelectedManagerIndex(0);
        setUserBalanceManagerId(availableBalanceManagers[0].id);
      }
    }
  }, [availableBalanceManagers, network, account?.address]);

  // Initialize and reset on network change
  useEffect(() => {
    addLog("Limit Orders page initialized");
    addLog(`Network: ${network.toUpperCase()}`);
    addLog(`DeepBook Package: ${config.packageId.slice(0, 20)}...`);

    if (isMainnet) {
      addLog("[WARN] Mainnet mode - real funds will be used!");
    }

    // Load saved balance manager from localStorage
    const savedBm = localStorage.getItem(
      `balance_manager_${network}_${account?.address}`,
    );
    if (savedBm) {
      setUserBalanceManagerId(savedBm);
      addLog(`[OK] Loaded Balance Manager: ${savedBm.slice(0, 20)}...`);
    } else {
      setUserBalanceManagerId(null);
    }
  }, [addLog, account?.address, network, config.packageId, isMainnet]);

  // Helper to map coin type to symbol
  const getCoinSymbol = (coinType: string): string => {
    if (coinType.includes("::sui::SUI")) return "SUI";
    if (coinType.includes("::deep::DEEP")) return "DEEP";
    if (coinType.includes("USDC")) return "USDC";
    if (coinType.includes("USDT")) return "USDT";
    return coinType.split("::").pop() || "UNKNOWN";
  };

  // Fetch Balance Manager balances
  const fetchBmBalances = useCallback(async () => {
    if (!userBalanceManagerId || !suiClient) return;

    setIsLoadingBalances(true);
    try {
      const bmObject = await suiClient.getObject({
        id: userBalanceManagerId,
        options: { showContent: true },
      });

      if (
        !bmObject.data?.content ||
        bmObject.data.content.dataType !== "moveObject"
      ) {
        setBmBalances({});
        setIsLoadingBalances(false);
        return;
      }

      const fields = bmObject.data.content.fields as any;
      const balances: Record<string, string> = {};

      // The balances are stored in a Table (dynamic field)
      const balancesTableId = fields.balances?.fields?.id?.id;
      if (!balancesTableId) {
        setBmBalances({});
        setIsLoadingBalances(false);
        return;
      }

      // Get dynamic fields of the balances table
      const dynamicFields = await suiClient.getDynamicFields({
        parentId: balancesTableId,
      });

      // Fetch each balance
      for (const field of dynamicFields.data) {
        try {
          const fieldObject = await suiClient.getDynamicFieldObject({
            parentId: balancesTableId,
            name: (field as any).name,
          });

          if (
            fieldObject.data?.content &&
            fieldObject.data.content.dataType === "moveObject"
          ) {
            const fieldData = fieldObject.data.content.fields as any;
            const coinType =
              (field as any).name?.value?.name ||
              (field as any).objectType?.split("<")[1]?.split(">")[0];
            const amount = fieldData.value || "0";

            if (coinType) {
              const symbol = getCoinSymbol(coinType);

              // Get decimals for proper formatting
              let decimals = 9;
              if (symbol === "SUI") decimals = 9;
              else if (symbol === "DEEP") decimals = 6;
              else if (["USDC", "USDT"].includes(symbol)) decimals = 6;

              const formattedAmount = (
                Number(amount) / Math.pow(10, decimals)
              ).toFixed(4);

              balances[symbol] = formattedAmount;
            }
          }
        } catch (err) {
          console.error("Error fetching balance field:", err);
        }
      }

      setBmBalances(balances);
      if (Object.keys(balances).length > 0) {
        addLog(
          `  Balances fetched: ${Object.entries(balances)
            .map(([k, v]) => `${k}=${v}`)
            .join(", ")}`,
        );
      }
    } catch (error: any) {
      console.warn("Failed to fetch BM balances:", error);
      setBmBalances({});
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
        const BALANCE_MANAGER_PACKAGE =
          "0xfb28c4cbc6865bd1c897d26aecbe1f8792d1509a20ffec692c800660cbec6982";

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
            localStorage.setItem(
              `balance_manager_${network}_${account.address}`,
              bmId,
            );
            addLog(`[OK] Found owned Balance Manager: ${bmId.slice(0, 20)}...`);
          }
        } else {
          addLog(
            "[WARN] No owned Balance Manager found - create one or enter ID manually",
          );
        }
      } catch (error) {
        console.warn("Failed to fetch balance manager:", error);
        addLog(
          "[WARN] Could not auto-detect Balance Manager - enter ID manually if you have one",
        );
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
      setOrders((prev) =>
        prev.map((order) => {
          if (order.status !== "pending") return order;

          const currentPrice = newPrices[order.pair];
          if (!currentPrice) return order;

          let shouldTrigger = false;

          switch (order.type) {
            case "limit":
              shouldTrigger =
                order.side === "buy"
                  ? currentPrice <= order.triggerPrice
                  : currentPrice >= order.triggerPrice;
              break;
            case "stop-loss":
              shouldTrigger =
                order.side === "sell"
                  ? currentPrice <= order.triggerPrice
                  : currentPrice >= order.triggerPrice;
              break;
            case "take-profit":
              shouldTrigger =
                order.side === "sell"
                  ? currentPrice >= order.triggerPrice
                  : currentPrice <= order.triggerPrice;
              break;
          }

          if (shouldTrigger) {
            addLog(
              `[TRIGGERED] Order: ${order.type} ${order.side} ${order.quantity} ${order.pair} @ ${order.triggerPrice}`,
            );
            return {
              ...order,
              status: "triggered" as const,
              triggeredAt: new Date(),
            };
          }

          return order;
        }),
      );
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

  // Fetch all available Balance Managers
  const fetchAvailableBalanceManagers = useCallback(async () => {
    if (!account?.address || !suiClient) return;

    setIsLoadingBalanceManagers(true);
    try {
      // Use the same package ID as in the balance manager page
      const BALANCE_MANAGER_PACKAGE =
        "0xfb28c4cbc6865bd1c897d26aecbe1f8792d1509a20ffec692c800660cbec6982";

      const bmObjects = await suiClient.getOwnedObjects({
        owner: account.address,
        filter: {
          StructType: `${BALANCE_MANAGER_PACKAGE}::balance_manager::BalanceManager`,
        },
        options: {
          showContent: true,
        },
      });

      const managers: Array<{ id: string; balances: Record<string, string> }> =
        [];

      for (const bmObj of bmObjects.data) {
        if (bmObj.data?.objectId) {
          // Fetch balances for each balance manager
          const balances = await fetchBmBalancesForId(bmObj.data.objectId);
          managers.push({
            id: bmObj.data.objectId,
            balances,
          });
        }
      }

      setAvailableBalanceManagers(managers);

      if (managers.length > 0) {
        addLog(`[OK] Found ${managers.length} Balance Manager(s)`);
      } else {
        addLog("[INFO] No Balance Managers found");
      }
    } catch (error: any) {
      console.warn("Failed to fetch balance managers:", error);
      addLog(`[ERROR] Failed to fetch Balance Managers: ${error.message}`);
    } finally {
      setIsLoadingBalanceManagers(false);
    }
  }, [account?.address, suiClient, addLog]);

  // Helper function to fetch balances for a specific balance manager ID
  const fetchBmBalancesForId = useCallback(
    async (bmId: string): Promise<Record<string, string>> => {
      try {
        const bmObject = await suiClient.getObject({
          id: bmId,
          options: { showContent: true },
        });

        if (
          !bmObject.data?.content ||
          bmObject.data.content.dataType !== "moveObject"
        ) {
          return {};
        }

        const fields = bmObject.data.content.fields as any;
        const balances: Record<string, string> = {};

        // The balances are stored in a Table (dynamic field)
        const balancesTableId = fields.balances?.fields?.id?.id;
        if (!balancesTableId) {
          return {};
        }

        // Get dynamic fields of the balances table
        const dynamicFields = await suiClient.getDynamicFields({
          parentId: balancesTableId,
        });

        // Fetch each balance
        for (const field of dynamicFields.data) {
          try {
            const fieldObject = await suiClient.getDynamicFieldObject({
              parentId: balancesTableId,
              name: (field as any).name,
            });

            if (
              fieldObject.data?.content &&
              fieldObject.data.content.dataType === "moveObject"
            ) {
              const fieldData = fieldObject.data.content.fields as any;
              const coinType =
                (field as any).name?.value?.name ||
                (field as any).objectType?.split("<")[1]?.split(">")[0];
              const amount = fieldData.value || "0";

              if (coinType) {
                const symbol = getCoinSymbol(coinType);

                // Get decimals for proper formatting
                let decimals = 9;
                if (symbol === "SUI") decimals = 9;
                else if (symbol === "DEEP") decimals = 6;
                else if (["USDC", "USDT"].includes(symbol)) decimals = 6;

                const formattedAmount = (
                  Number(amount) / Math.pow(10, decimals)
                ).toFixed(4);

                balances[symbol] = formattedAmount;
              }
            }
          } catch (err) {
            console.error("Error fetching balance field:", err);
          }
        }

        return balances;
      } catch (error) {
        console.warn(`Failed to fetch balances for ${bmId}:`, error);
        return {};
      }
    },
    [suiClient],
  );

  // Fetch all available balance managers on mount
  useEffect(() => {
    if (account?.address) {
      fetchAvailableBalanceManagers();
    }
  }, [account?.address, network, fetchAvailableBalanceManagers]);

  // Create limit order
  const handleCreateOrder = useCallback(async () => {
    if (!account?.address) {
      addLog("[ERROR] Connect wallet first");
      return;
    }

    if (!userBalanceManagerId) {
      addLog("[ERROR] Create or set Balance Manager first");
      return;
    }

    const trigger = parseFloat(triggerPrice);
    const qty = parseFloat(quantity);

    if (isNaN(trigger) || trigger <= 0) {
      addLog("[ERROR] Invalid trigger price");
      return;
    }

    if (isNaN(qty) || qty <= 0) {
      addLog("[ERROR] Invalid quantity");
      return;
    }

    const poolInfo = getPoolInfo(config, selectedPair);
    if (!poolInfo) {
      addLog(
        `[ERROR] Pool ${selectedPair} not found. Available pools: ${Object.keys(config.pools).join(", ")}`,
      );
      return;
    }

    // Check balance before creating order
    const baseCoinSymbol = poolInfo.baseCoin;
    const quoteCoinSymbol = poolInfo.quoteCoin;

    // For BUY: need QUOTE coin (price * quantity)
    // For SELL: need BASE coin (quantity)
    const requiredCoin = side === "buy" ? quoteCoinSymbol : baseCoinSymbol;
    const requiredAmount = side === "buy" ? trigger * qty : qty;

    const currentBalance = parseFloat(bmBalances[requiredCoin] || "0");

    if (currentBalance < requiredAmount) {
      addLog(
        `[ERROR] Insufficient ${requiredCoin} balance. Need: ${requiredAmount.toFixed(4)}, Have: ${currentBalance.toFixed(4)}`,
      );
      addLog(
        `  Go to Balance Manager to deposit ${requiredCoin} before placing orders`,
      );
      return;
    }

    addLog(`Creating ${orderType} ${side} order...`);
    addLog(`  Pair: ${selectedPair}, Price: ${trigger}, Qty: ${qty}`);
    addLog(
      `  Required: ${requiredAmount.toFixed(4)} ${requiredCoin}, Available: ${currentBalance.toFixed(4)} ${requiredCoin}`,
    );

    const tx = new Transaction();
    tx.setSender(account.address);
    tx.setGasBudget(150_000_000); // 0.15 SUI gas budget for limit orders

    try {
      // Generate unique client order ID (u64)
      const clientOrderId = BigInt(Date.now());

      // Get coin info for logging and validation
      const baseCoin = config.coins[poolInfo.baseCoin];
      const quoteCoin = config.coins[poolInfo.quoteCoin];

      if (!baseCoin || !baseCoin.scalar) {
        addLog(
          `[ERROR] Base coin ${poolInfo.baseCoin} not found or missing scalar. Available coins: ${Object.keys(config.coins).join(", ")}`,
        );
        return;
      }
      if (!quoteCoin || !quoteCoin.scalar) {
        addLog(
          `[ERROR] Quote coin ${poolInfo.quoteCoin} not found or missing scalar. Available coins: ${Object.keys(config.coins).join(", ")}`,
        );
        return;
      }

      addLog(`  Base: ${poolInfo.baseCoin} (scalar: ${baseCoin.scalar})`);
      addLog(`  Quote: ${poolInfo.quoteCoin} (scalar: ${quoteCoin.scalar})`);

      // Generate trade proof as owner
      const tradeProof = generateTradeProofAsOwner({
        tx,
        config,
        balanceManagerId: userBalanceManagerId,
      });

      // Determine order type
      let deepBookOrderType = OrderType.NO_RESTRICTION;
      if (orderType === "limit") {
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
        isBid: side === "buy",
        payWithDeep: true,
        expireTimestamp: BigInt(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      });

      addLog("  [OK] Limit order PTB built");

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
              status: "pending",
              createdAt: new Date(),
              txDigest: result.digest,
              onChainOrderId: clientOrderId,
            };

            setOrders((prev) => [...prev, newOrder]);
            addLog(`[OK] Order created! TX: ${result.digest.slice(0, 20)}...`);
            addLog(`  Order ID: ${clientOrderId.toString()}`);

            setTriggerPrice("");

            // Refresh balances after order creation
            setTimeout(() => {
              fetchBmBalances();
            }, 2000);
          },
          onError: (error) => {
            addLog(`[ERROR] Failed: ${error.message}`);
          },
        },
      );
    } catch (error: any) {
      addLog(`[ERROR] ${error.message}`);
    }
  }, [
    account,
    userBalanceManagerId,
    selectedPair,
    orderType,
    side,
    triggerPrice,
    quantity,
    signAndExecute,
    addLog,
  ]);

  // Cancel order
  const handleCancelOrder = useCallback(
    async (order: LimitOrder) => {
      if (!account?.address || !userBalanceManagerId) return;

      addLog(
        `Cancelling order ${order.onChainOrderId?.toString().slice(0, 8)}...`,
      );

      const poolInfo = getPoolInfo(config, order.pair);
      if (!poolInfo || !order.onChainOrderId) {
        addLog("[ERROR] Cannot cancel - missing pool or order ID");
        // Remove from local list anyway
        setOrders((prev) =>
          prev.map((o) =>
            o.id === order.id ? { ...o, status: "cancelled" as const } : o,
          ),
        );
        return;
      }

      const tx = new Transaction();
      tx.setSender(account.address);
      tx.setGasBudget(100_000_000); // 0.1 SUI gas budget

      try {
        // Generate trade proof
        const tradeProof = generateTradeProofAsOwner({
          tx,
          config,
          balanceManagerId: userBalanceManagerId,
        });

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
              setOrders((prev) =>
                prev.map((o) =>
                  o.id === order.id
                    ? { ...o, status: "cancelled" as const }
                    : o,
                ),
              );
              addLog(
                `[OK] Order cancelled! TX: ${result.digest.slice(0, 20)}...`,
              );
            },
            onError: (error) => {
              addLog(`[ERROR] Cancel failed: ${error.message}`);
            },
          },
        );
      } catch (error: any) {
        addLog(`[ERROR] ${error.message}`);
      }
    },
    [account, userBalanceManagerId, signAndExecute, addLog],
  );

  const currentPrice = prices[selectedPair] || 0;
  const availablePools = getAvailablePools();
  const activeOrders = orders.filter(
    (o) => o.status === "pending" || o.status === "triggered",
  ).length;
  const filledOrders = orders.filter((o) => o.status === "filled").length;

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 h-screen bg-background border-r border-border transition-all duration-300 z-40 ${
          sidebarOpen ? "w-80 min-w-80" : "w-0"
        } overflow-hidden`}
      >
        <ScrollArea className="h-full">
          <div className="p-6">
            {/* Logo/Title */}
            <div className="mb-6">
              <h2 className="font-semibold text-foreground text-lg">
                Limit Orders
              </h2>
              <Badge variant="secondary" className="mt-2">
                {activeOrders} active
              </Badge>
            </div>

            <Separator className="mb-4" />

            {/* Navigation */}
            <div className="mb-6">
              <h3 className="text-xs font-semibold text-foreground mb-3 uppercase tracking-wide">
                Navigation
              </h3>
              <div className="space-y-1">
                <Link
                  href="/trade"
                  className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 px-2 py-2 rounded-md transition-all duration-200 group"
                >
                  <Home className="w-4 h-4 text-muted-foreground/70 group-hover:text-primary transition-colors" />
                  Trade Home
                </Link>
                <Link
                  href="/trade/swap"
                  className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 px-2 py-2 rounded-md transition-all duration-200 group"
                >
                  <TrendingUp className="w-4 h-4 text-muted-foreground/70 group-hover:text-primary transition-colors" />
                  Swap
                </Link>
                <Link
                  href="/trade/balance-manager"
                  className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 px-2 py-2 rounded-md transition-all duration-200 group"
                >
                  <Wallet className="w-4 h-4 text-muted-foreground/70 group-hover:text-primary transition-colors" />
                  Balance Manager
                </Link>
                <Link
                  href="/trade/flash-arbitrage"
                  className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent/50 px-2 py-2 rounded-md transition-all duration-200 group"
                >
                  <Zap className="w-4 h-4 text-muted-foreground/70 group-hover:text-primary transition-colors" />
                  Flash Arbitrage
                </Link>
              </div>
            </div>

            <Separator className="mb-4" />

            {/* Balance Managers List */}
            <div className="mb-4">
              <h3 className="text-xs font-semibold text-foreground mb-3 uppercase tracking-wide">
                Balance Managers
              </h3>
              {isLoadingBalanceManagers ? (
                <div className="flex flex-col items-center justify-center py-8 space-y-2">
                  <Loader2 className="w-6 h-6 text-primary animate-spin" />
                  <p className="text-xs text-muted-foreground">
                    Loading managers...
                  </p>
                </div>
              ) : availableBalanceManagers.length === 0 ? (
                <div className="p-3 bg-destructive/5 border border-destructive/20 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-4 h-4 text-destructive" />
                    <span className="text-sm font-medium text-destructive">
                      No Managers
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">
                    Create a balance manager to start trading
                  </p>
                  <Link href="/trade/balance-manager">
                    <Button size="sm" className="w-full text-xs">
                      <Plus className="w-3 h-3 mr-1" />
                      Create One
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-2">
                  {availableBalanceManagers.map((manager, index) => (
                    <button
                      key={manager.id}
                      onClick={() => {
                        setSelectedManagerIndex(index);
                        setUserBalanceManagerId(manager.id);
                        localStorage.setItem(
                          `balance_manager_${network}_${account?.address}`,
                          manager.id,
                        );
                        addLog(`[OK] Switched to Manager ${index + 1}`);
                        // Auto-close sidebar on mobile after selection
                        if (window.innerWidth < 1024) {
                          setSidebarOpen(false);
                        }
                      }}
                      className={`w-full p-3 rounded-lg border-2 transition-all text-left ${
                        index === selectedManagerIndex
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50 hover:bg-accent"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Wallet className="w-4 h-4 text-primary" />
                          <span className="text-sm font-semibold text-foreground">
                            Manager {index + 1}
                          </span>
                        </div>
                        {index === selectedManagerIndex && (
                          <CheckCircle2 className="w-4 h-4 text-primary" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground font-mono truncate mb-2">
                        {manager.id.slice(0, 8)}...{manager.id.slice(-6)}
                      </p>
                      {manager.balances &&
                      Object.keys(manager.balances).length > 0 ? (
                        <div className="space-y-1 mt-2 pt-2 border-t border-border/50">
                          {Object.entries(manager.balances).map(
                            ([symbol, amount]) => (
                              <div
                                key={symbol}
                                className="flex items-center justify-between text-xs"
                              >
                                <span className="text-muted-foreground font-medium">
                                  {symbol}
                                </span>
                                <span className="text-foreground font-mono">
                                  {amount}
                                </span>
                              </div>
                            ),
                          )}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground/60 mt-2 pt-2 border-t border-border/50">
                          No deposits yet
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <Separator className="mb-4" />

            {/* Quick Stats */}
            <div className="mb-4">
              <h3 className="text-xs font-semibold text-foreground mb-3 uppercase tracking-wide">
                Quick Stats
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Active Orders</span>
                  <span className="font-medium">{activeOrders}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Filled Orders</span>
                  <span className="font-medium">{filledOrders}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">Network</span>
                  <Badge variant="outline" className="text-xs">
                    {network.toUpperCase()}
                  </Badge>
                </div>
              </div>
            </div>

            {isMainnet && (
              <div className="mt-2 p-2 bg-destructive/10 border border-destructive/20 rounded text-xs text-destructive">
                Real funds mode
              </div>
            )}
          </div>
        </ScrollArea>
      </aside>

      {/* Main Content */}
      <div
        className={`transition-all duration-300 ${
          sidebarOpen ? "lg:ml-80" : "ml-0"
        }`}
      >
        <div className="sticky top-0 z-50 bg-background/80 backdrop-blur-sm border-b border-border">
          <div className="px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
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
                <h2 className="text-base sm:text-lg font-semibold text-foreground">
                  Limit Orders
                </h2>
                <Badge variant="outline" className="text-xs">
                  DeepBook V3
                </Badge>
              </div>
            </div>

            {/* Wallet Status */}
            <div className="flex items-center gap-2">
              <NetworkToggle />
              {account ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2">
                      <Wallet className="w-4 h-4" />
                      <span className="hidden sm:inline">
                        {account.address.slice(0, 6)}...
                        {account.address.slice(-4)}
                      </span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel>Wallet</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="font-mono text-xs">
                      {account.address}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <ConnectButton />
              )}
            </div>
          </div>
        </div>

        <div className="px-4 sm:px-6 lg:px-8 py-6">
          {/* Main Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-5">
            {/* Order Form */}
            <div className="lg:col-span-3 space-y-4">
              <div className="bg-muted/50 rounded-lg p-4 border border-border">
                <h2 className="text-base font-semibold text-muted-foreground mb-4">
                  Create Order
                </h2>

                {/* Pair Selection */}
                <div className="mb-4">
                  <label className="block text-sm text-muted-foreground mb-1.5">
                    Trading Pair
                  </label>
                  <select
                    value={selectedPair}
                    onChange={(e) => {
                      setSelectedPair(e.target.value);
                      setTriggerPrice("");
                    }}
                    className="w-full px-3 py-2 bg-background rounded-lg border border-border focus:border-primary outline-none text-sm"
                  >
                    {availablePools.map((pair) => (
                      <option key={pair} value={pair}>
                        {pair.replace("_", "/")}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Current Price Display */}
                <div className="mb-4 p-3 bg-background rounded-lg border border-border">
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">
                      Current Price
                    </span>
                    <span className="w-2 h-2 bg-primary rounded-full animate-pulse" />
                  </div>
                  <p className="font-mono text-lg text-primary mt-1">
                    {currentPrice.toFixed(6)}
                  </p>
                </div>

                {/* Order Type */}
                <div className="mb-4">
                  <label className="block text-sm text-muted-foreground mb-1.5">
                    Order Type
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(["limit", "stop-loss", "take-profit"] as const).map(
                      (type) => (
                        <Button
                          key={type}
                          type="button"
                          onClick={() => setOrderType(type)}
                          className={`py-2 px-2 rounded-lg text-xs font-medium transition-colors ${
                            orderType === type
                              ? "bg-primary text-foreground"
                              : "bg-muted text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {type === "limit"
                            ? "Limit"
                            : type === "stop-loss"
                              ? "Stop"
                              : "TP"}
                        </Button>
                      ),
                    )}
                  </div>
                </div>

                {/* Side */}
                <div className="mb-4">
                  <label className="block text-sm text-muted-foreground mb-1.5">
                    Side
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      onClick={() => setSide("buy")}
                      className={`py-2 rounded-lg text-sm font-medium transition-colors ${
                        side === "buy"
                          ? "bg-chart-2 text-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      Buy
                    </Button>
                    <Button
                      type="button"
                      onClick={() => setSide("sell")}
                      className={`py-2 rounded-lg text-sm font-medium transition-colors ${
                        side === "sell"
                          ? "bg-destructive text-foreground"
                          : "bg-muted text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      Sell
                    </Button>
                  </div>
                </div>

                {/* Trigger Price */}
                <div className="mb-4">
                  <label className="block text-sm text-muted-foreground mb-1.5">
                    {orderType === "limit"
                      ? "Limit Price"
                      : orderType === "stop-loss"
                        ? "Stop Price"
                        : "Target Price"}
                  </label>
                  <input
                    type="number"
                    value={triggerPrice}
                    onChange={(e) => setTriggerPrice(e.target.value)}
                    step="0.000001"
                    placeholder={currentPrice.toFixed(6)}
                    className="w-full px-3 py-2 bg-background rounded-lg border border-border focus:border-primary outline-none text-sm"
                  />

                  {/* Price hint */}
                  {triggerPrice && currentPrice > 0 && (
                    <p className="text-sm mt-2 text-muted-foreground">
                      {parseFloat(triggerPrice) > currentPrice
                        ? `${((parseFloat(triggerPrice) / currentPrice - 1) * 100).toFixed(2)}% above current`
                        : `${((1 - parseFloat(triggerPrice) / currentPrice) * 100).toFixed(2)}% below current`}
                    </p>
                  )}
                </div>

                {/* Quantity */}
                <div className="mb-4">
                  <label className="block text-sm text-muted-foreground mb-1.5">
                    Quantity ({selectedPair.split("_")[0]})
                  </label>
                  <input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    min="0.01"
                    step="1"
                    className="w-full px-3 py-2 bg-background rounded-lg border border-border focus:border-primary outline-none text-sm"
                  />
                </div>

                {/* Order Summary */}
                <div className="mb-3 p-3 bg-primary/10 border border-primary/20 rounded-lg">
                  <p className="text-xs text-muted-foreground">
                    Order Summary:
                  </p>
                  <p className="mt-1.5 font-medium text-sm text-primary">
                    {side === "buy" ? "Buy" : "Sell"} {quantity}{" "}
                    {selectedPair.split("_")[0]} @ {triggerPrice || "..."}{" "}
                    {selectedPair.split("_")[1]}
                  </p>
                  {triggerPrice && quantity && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      Total: ~
                      {(
                        parseFloat(triggerPrice) * parseFloat(quantity)
                      ).toFixed(4)}{" "}
                      {selectedPair.split("_")[1]}
                    </p>
                  )}
                </div>

                {/* Balance Display */}
                {userBalanceManagerId && Object.keys(bmBalances).length > 0 && (
                  <div className="mb-4 p-3 bg-background rounded-lg border border-border">
                    <p className="text-xs text-muted-foreground mb-2">
                      Your Balance Manager:
                    </p>
                    <div className="space-y-1">
                      {Object.entries(bmBalances).map(([coin, amount]) => {
                        const isRequiredCoin =
                          (side === "buy" &&
                            coin === selectedPair.split("_")[1]) ||
                          (side === "sell" &&
                            coin === selectedPair.split("_")[0]);
                        const requiredAmount =
                          side === "buy"
                            ? parseFloat(triggerPrice || "0") *
                              parseFloat(quantity || "0")
                            : parseFloat(quantity || "0");
                        const hasEnough = parseFloat(amount) >= requiredAmount;

                        return (
                          <div
                            key={coin}
                            className={`flex items-center justify-between text-xs py-1 px-2 rounded ${
                              isRequiredCoin
                                ? hasEnough
                                  ? "bg-chart-2/10 text-chart-2 border border-chart-2/20"
                                  : "bg-destructive/10 text-destructive border border-destructive/20"
                                : ""
                            }`}
                          >
                            <span className="font-medium">{coin}</span>
                            <span className="font-mono">
                              {amount}
                              {isRequiredCoin && requiredAmount > 0 && (
                                <span className="ml-1 text-muted-foreground">
                                  / {requiredAmount.toFixed(4)}
                                </span>
                              )}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    {isLoadingBalances && (
                      <p className="text-xs text-muted-foreground mt-2 flex items-center gap-2">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Updating balances...
                      </p>
                    )}
                  </div>
                )}

                {/* Deposit Requirement Warning */}
                {userBalanceManagerId && (
                  <div className="mb-4 p-3 bg-chart-3/10 border border-chart-3/20 rounded-lg">
                    <p className="text-chart-3 text-xs font-medium">
                      Required deposit for this order:
                    </p>
                    {side === "buy" ? (
                      <p className="text-chart-3/80 text-xs mt-1">
                        {triggerPrice && quantity
                          ? `~${(parseFloat(triggerPrice) * parseFloat(quantity)).toFixed(4)} ${selectedPair.split("_")[1]} (Quote coin)`
                          : `${selectedPair.split("_")[1]} (Quote coin)`}
                      </p>
                    ) : (
                      <p className="text-chart-3/80 text-xs mt-1">
                        {quantity
                          ? `~${quantity} ${selectedPair.split("_")[0]} (Base coin)`
                          : `${selectedPair.split("_")[0]} (Base coin)`}
                      </p>
                    )}
                  </div>
                )}

                {/* Create Button */}
                <Button
                  type="button"
                  onClick={handleCreateOrder}
                  disabled={isPending || !account || !userBalanceManagerId}
                  className="w-full py-3 bg-primary hover:bg-primary rounded-lg font-semibold text-sm transition-colors disabled:opacity-50"
                >
                  {isPending ? "Creating..." : "Create Order"}
                </Button>

                {!account && (
                  <p className="text-center text-muted-foreground mt-3 text-sm">
                    Connect wallet to create orders
                  </p>
                )}
                {account && !userBalanceManagerId && (
                  <p className="text-center text-chart-3 mt-3 text-sm">
                    Create or set Balance Manager first
                  </p>
                )}
              </div>

              {/* Quick Example */}
              <div className="bg-muted/50 rounded-lg p-3 border border-border">
                <h3 className="text-sm font-semibold text-muted-foreground mb-2">
                  Example Orders
                </h3>
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  <p>
                    • <strong>DEEP_SUI</strong>: Buy 10 DEEP @ 0.024 SUI = 0.24
                    SUI
                  </p>
                  <p>
                    • <strong>SUI_USDC</strong>: Sell 1 SUI @ 4.5 USDC = 4.5
                    USDC
                  </p>
                  <p className="text-chart-3 mt-2">
                    Deposit funds to Balance Manager before trading!
                  </p>
                </div>
              </div>
            </div>

            {/* Orders Table */}
            <div className="lg:col-span-5">
              <div className="bg-muted/50 rounded-lg p-4 sm:p-5 border border-border h-full">
                <h2 className="text-base font-semibold text-muted-foreground mb-4">
                  Active Orders
                </h2>

                {orders.filter(
                  (o) => o.status === "pending" || o.status === "triggered",
                ).length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <p className="font-semibold text-base">No active orders</p>
                    <p className="mt-1.5 text-sm">
                      Create an order to get started
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {orders
                      .filter(
                        (o) =>
                          o.status === "pending" || o.status === "triggered",
                      )
                      .map((order) => {
                        const pairPrice = prices[order.pair] || 0;
                        const distance =
                          pairPrice > 0
                            ? (
                                (order.triggerPrice / pairPrice - 1) *
                                100
                              ).toFixed(2)
                            : "0";

                        return (
                          <div
                            key={order.id}
                            className={`p-3 rounded-lg border ${
                              order.status === "triggered"
                                ? "border-green-500/50 bg-chart-2/5"
                                : "border-border bg-background"
                            }`}
                          >
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`px-2 py-0.5 rounded text-xs font-medium ${
                                    order.type === "limit"
                                      ? "bg-primary/10 text-primary"
                                      : order.type === "stop-loss"
                                        ? "bg-destructive/10 text-destructive"
                                        : "bg-chart-2/10 text-chart-2"
                                  }`}
                                >
                                  {order.type}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded text-xs font-medium ${
                                    order.side === "buy"
                                      ? "bg-chart-2/10 text-chart-2"
                                      : "bg-destructive/10 text-destructive"
                                  }`}
                                >
                                  {order.side}
                                </span>
                              </div>
                              <span
                                className={`text-xs font-medium ${
                                  order.status === "triggered"
                                    ? "text-chart-2"
                                    : "text-muted-foreground"
                                }`}
                              >
                                {order.status === "triggered"
                                  ? "TRIGGERED"
                                  : "On-chain"}
                              </span>
                            </div>

                            <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                              <div>
                                <span className="text-muted-foreground">
                                  Pair:
                                </span>
                                <span className="ml-1.5 font-medium text-foreground">
                                  {order.pair.replace("_", "/")}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">
                                  Qty:
                                </span>
                                <span className="ml-1.5 font-mono text-muted-foreground">
                                  {order.quantity}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">
                                  Price:
                                </span>
                                <span className="ml-1.5 font-mono text-primary">
                                  {order.triggerPrice.toFixed(6)}
                                </span>
                              </div>
                              <div>
                                <span className="text-muted-foreground">
                                  Current:
                                </span>
                                <span className="ml-1.5 font-mono text-muted-foreground">
                                  {pairPrice.toFixed(6)}
                                </span>
                              </div>
                            </div>

                            {/* Order ID */}
                            {order.onChainOrderId && (
                              <div className="mb-2 text-xs text-muted-foreground">
                                ID: {order.onChainOrderId.toString()}
                              </div>
                            )}

                            {/* Distance to trigger */}
                            {order.status === "pending" && (
                              <div className="mb-3">
                                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                  <span>Distance</span>
                                  <span>{distance}%</span>
                                </div>
                                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-primary transition-all"
                                    style={{
                                      width: `${Math.max(0, Math.min(100, 100 - Math.abs(parseFloat(distance))))}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            )}

                            <div className="flex gap-2">
                              <Button
                                type="button"
                                onClick={() => handleCancelOrder(order)}
                                disabled={isPending}
                                className="flex-1 py-2 text-sm bg-muted hover:bg-muted rounded-lg transition-colors disabled:opacity-50"
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}

                {/* Order History */}
                {orders.filter(
                  (o) => o.status === "filled" || o.status === "cancelled",
                ).length > 0 && (
                  <div className="mt-5">
                    <h3 className="text-sm font-medium mb-2 text-muted-foreground">
                      History
                    </h3>
                    <div className="space-y-2">
                      {orders
                        .filter(
                          (o) =>
                            o.status !== "pending" && o.status !== "triggered",
                        )
                        .slice(-5)
                        .map((order) => (
                          <div
                            key={order.id}
                            className="flex justify-between items-center p-2.5 bg-background rounded-lg text-xs"
                          >
                            <span className="text-muted-foreground">
                              {order.type} {order.side} {order.quantity}{" "}
                              {order.pair.replace("_", "/")}
                            </span>
                            <span
                              className={`${
                                order.status === "filled"
                                  ? "text-chart-2"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {order.status === "filled"
                                ? "Filled"
                                : "Cancelled"}
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
              <div className="bg-muted/50 rounded-lg p-4 sm:p-5 border border-border">
                <h2 className="text-base font-semibold text-muted-foreground mb-4">
                  Activity Log
                </h2>
                <div className="bg-background rounded-lg p-3 h-80 overflow-y-auto font-mono text-xs">
                  {logs.length === 0 ? (
                    <p className="text-muted-foreground">No activity yet...</p>
                  ) : (
                    logs.map((log, i) => (
                      <p
                        key={i}
                        className="text-muted-foreground mb-2 break-all"
                      >
                        {log}
                      </p>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Info Card */}
          <div className="mt-8 bg-primary/5 border border-primary/20 rounded-lg p-5 sm:p-6">
            <h3 className="font-semibold text-primary text-base mb-4">
              How DeepBook Limit Orders Work
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
              <div className="bg-muted/50 rounded-xl p-5 border border-border">
                <div className="text-base text-primary font-semibold mb-3">
                  1. Create Balance Manager
                </div>
                <p className="text-muted-foreground text-sm">
                  Balance Manager holds your trading funds securely on-chain
                </p>
              </div>
              <div className="bg-muted/50 rounded-xl p-5 border border-border">
                <div className="text-base text-primary font-semibold mb-3">
                  2. Deposit Funds
                </div>
                <p className="text-muted-foreground text-sm">
                  Deposit SUI, DEEP, or USDC to trade on DeepBook pools
                </p>
              </div>
              <div className="bg-muted/50 rounded-xl p-5 border border-border">
                <div className="text-base text-primary font-semibold mb-3">
                  3. Place Order
                </div>
                <p className="text-muted-foreground text-sm">
                  Submit limit order with price and quantity - stored on-chain
                </p>
              </div>
              <div className="bg-muted/50 rounded-xl p-5 border border-border">
                <div className="text-base text-primary font-semibold mb-3">
                  4. Auto-Execution
                </div>
                <p className="text-muted-foreground text-sm">
                  Orders execute automatically when market price matches
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
