"use client";

/**
 * Balance Manager Setup Page
 *
 * This page allows users to:
 * 1. Create a new Balance Manager for DeepBook V3 trading
 * 2. Mint Trade Caps for specific pools
 * 3. Deposit/Withdraw tokens to/from Balance Manager
 * 4. View current balances and positions
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  useCurrentAccount,
  useSignAndExecuteTransaction,
  useSuiClient,
} from "@mysten/dapp-kit";
import { Transaction } from "@mysten/sui/transactions";
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
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  buildCreateBalanceManagerTx,
  buildMintTradeCapTx,
  buildMintAndAssignTradeCapTx,
  buildWithdrawFromManagerTx,
  BalanceManagerContract,
  createBalanceManagerContract,
  COIN_TYPES,
  COIN_DECIMALS,
  POOLS,
  CURRENT_ENV,
  DEEPBOOK_TESTNET,
  DEEPBOOK_MAINNET,
} from "@/lib/deepbook";
import Link from "next/link";
import {
  Wallet,
  TrendingUp,
  ArrowDownToLine,
  ArrowUpFromLine,
  Shield,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Plus,
  Info,
  Zap,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronRight,
  Copy,
  ExternalLink,
  X,
  User,
  LogOut,
  Network,
  Ticket,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { ConnectButton } from "@mysten/dapp-kit";

interface BalanceManagerInfo {
  objectId: string;
  owner: string;
  balances: {
    coin: string;
    amount: string;
    symbol: string;
  }[];
}

// Coin type to symbol mapping
const COIN_SYMBOL_MAP: Record<string, string> = {
  [COIN_TYPES.SUI]: "SUI",
  [COIN_TYPES.DEEP]: "DEEP",
  [COIN_TYPES.USDC]: "USDC",
  [COIN_TYPES.DBUSDC]: "USDC",
  [COIN_TYPES.DBUSDT]: "USDT",
};

interface TradeCap {
  objectId: string;
  balanceManagerId: string;
  owner: string;
  isOwnedByUser: boolean;
  isEligible: boolean;
}

export default function BalanceManagerPage() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction();

  const address = account?.address;
  const isAuthenticated = !!account;

  // State
  const [balanceManagers, setBalanceManagers] = useState<BalanceManagerInfo[]>(
    [],
  );
  const [selectedManagerIndex, setSelectedManagerIndex] = useState(0);
  const balanceManager = balanceManagers[selectedManagerIndex] || null;
  const [tradeCaps, setTradeCaps] = useState<TradeCap[]>([]);
  const [selectedPool, setSelectedPool] = useState<string>(
    Object.keys(POOLS)[0],
  );
  const [traderAddress, setTraderAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [walletBalance, setWalletBalance] = useState<string>("0");
  const [copied, setCopied] = useState(false);

  // Form states
  const [depositAmount, setDepositAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [selectedCoin, setSelectedCoin] = useState<string>("SUI");

  // User balances
  const [userBalances, setUserBalances] = useState<Record<string, string>>({});

  // Network info
  const networkLabel = CURRENT_ENV === "mainnet" ? "Mainnet" : "Testnet";
  const networkName = CURRENT_ENV === "mainnet" ? "Mainnet" : "Testnet";
  const deepBookConfig =
    CURRENT_ENV === "mainnet" ? DEEPBOOK_MAINNET : DEEPBOOK_TESTNET;

  // Initialize Balance Manager Contract
  const balanceManagerContract = createBalanceManagerContract(deepBookConfig);

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
        const managers: BalanceManagerInfo[] = [];
        for (const managerObj of objects.data) {
          if (managerObj.data?.content?.dataType === "moveObject") {
            // Parse balance manager data
            const fields = managerObj.data.content.fields as any;
            // Fetch internal balances
            const balances = await fetchBalanceManagerBalances(
              managerObj.data.objectId,
            );
            const bmInfo = {
              objectId: managerObj.data.objectId,
              owner: address,
              balances,
            };
            managers.push(bmInfo);
          }
        }

        const previousCount = balanceManagers.length;
        setBalanceManagers(managers);

        // If a new Balance Manager was just created, select it automatically
        if (managers.length > previousCount) {
          setSelectedManagerIndex(managers.length - 1);
        }
        // Reset selection if current index is out of bounds
        else if (selectedManagerIndex >= managers.length) {
          setSelectedManagerIndex(0);
        }
      } else {
        // Fallback: Check all objects to see if Balance Manager exists with different naming
        const allObjects = await suiClient.getOwnedObjects({
          owner: address,
          options: {
            showContent: true,
            showType: true,
          },
        });

        // Look for any object from the DeepBook package
        const deepbookObjects = allObjects.data.filter((obj: any) =>
          obj.data?.type?.includes(deepBookConfig.PACKAGE_ID),
        );

        // Check if any of them is a BalanceManager
        const managerInAll = deepbookObjects.find(
          (obj: any) =>
            obj.data?.type?.includes("balance_manager") &&
            obj.data?.type?.includes("BalanceManager"),
        );

        if (managerInAll) {
          const balances = await fetchBalanceManagerBalances(
            managerInAll.data!.objectId,
          );
          setBalanceManagers([
            {
              objectId: managerInAll.data!.objectId,
              owner: address,
              balances,
            },
          ]);
          setSelectedManagerIndex(0);
        } else {
          setBalanceManagers([]);
        }
      }

      // Fetch Trade Caps owned by the user
      const ownedCapObjects = await suiClient.getOwnedObjects({
        owner: address,
        filter: {
          StructType: `${deepBookConfig.PACKAGE_ID}::balance_manager::TradeCap`,
        },
        options: {
          showContent: true,
          showType: true,
          showOwner: true,
        },
      });

      const caps: TradeCap[] = [];
      for (const cap of ownedCapObjects.data) {
        if (cap.data?.content?.dataType === "moveObject") {
          const fields = cap.data.content.fields as any;
          console.log("Full TradeCap object:", cap); // Debug log - entire object
          console.log("TradeCap fields:", fields); // Debug log - fields only

          // Extract owner address from the owner field
          let ownerAddress = address; // Default to current user
          if (
            cap.data.owner &&
            typeof cap.data.owner === "object" &&
            "AddressOwner" in cap.data.owner
          ) {
            ownerAddress = cap.data.owner.AddressOwner;
          }

          const isOwnedByUser = ownerAddress === address;

          caps.push({
            objectId: cap.data.objectId,
            balanceManagerId:
              fields.balance_manager_id || fields.id || "Unknown",
            owner: ownerAddress,
            isEligible: true, // Assume eligible if not revoked
            isOwnedByUser: isOwnedByUser,
          });
        }
      }

      setTradeCaps(caps);

      // Fetch user balances
      await fetchUserBalances();
    } catch (err) {
      console.error("Error fetching user data:", err);
      setError("Failed to fetch Balance Manager data");
    } finally {
      setLoading(false);
    }
  }, [address, suiClient, deepBookConfig.PACKAGE_ID, selectedManagerIndex]);

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
      balances["SUI"] = (Number(suiBalance.totalBalance) / 1e9).toFixed(4);

      // DEEP balance
      try {
        const deepBalance = await suiClient.getBalance({
          owner: address,
          coinType: COIN_TYPES.DEEP,
        });
        balances["DEEP"] = (Number(deepBalance.totalBalance) / 1e6).toFixed(4);
      } catch (err) {
        console.error("Error fetching DEEP balance:", err);
        balances["DEEP"] = "0";
      }

      // USDC balance (testnet: DBUSDC)
      try {
        const usdcType =
          CURRENT_ENV === "mainnet" ? COIN_TYPES.USDC : COIN_TYPES.DBUSDC;
        const usdcBalance = await suiClient.getBalance({
          owner: address,
          coinType: usdcType,
        });
        balances["USDC"] = (Number(usdcBalance.totalBalance) / 1e6).toFixed(4);
      } catch (err) {
        console.error("Error fetching USDC balance:", err);
        balances["USDC"] = "0";
      }

      setUserBalances(balances);
    } catch (err) {
      console.error("Error fetching balances:", err);
    }
  };

  // Get pool name from ID
  const getPoolNameFromId = (poolId: string): string => {
    console.log("🔍 getPoolNameFromId called with:", poolId);
    console.log("📋 Available POOLS:", Object.keys(POOLS));

    // Normalize the pool ID for comparison
    const normalizedPoolId = poolId?.toLowerCase()?.trim();
    console.log("🔄 Normalized poolId:", normalizedPoolId);

    for (const [name, info] of Object.entries(POOLS)) {
      const poolInfoId = (info as any).poolId?.toLowerCase()?.trim();
      console.log(`🔎 Checking ${name}:`, poolInfoId);
      if (poolInfoId === normalizedPoolId) {
        console.log("✅ Found match:", name);
        return name;
      }
    }

    console.log("❌ No match found, returning shortened ID");
    // If no match found, return a shortened version of the pool ID
    return `Pool ${poolId.slice(0, 8)}...${poolId.slice(-6)}`;
  };

  // Fetch Balance Manager internal balances
  const fetchBalanceManagerBalances = async (
    managerObjectId: string,
  ): Promise<{ coin: string; amount: string; symbol: string }[]> => {
    if (!suiClient) return [];

    try {
      // Get the balance manager object
      const bmObject = await suiClient.getObject({
        id: managerObjectId,
        options: {
          showContent: true,
          showType: true,
        },
      });

      if (
        !bmObject.data?.content ||
        bmObject.data.content.dataType !== "moveObject"
      ) {
        return [];
      }

      const fields = bmObject.data.content.fields as any;

      // The balances are stored in a Table (dynamic field)
      // We need to query the dynamic fields of the balance manager
      const balancesTableId = fields.balances?.fields?.id?.id;
      if (!balancesTableId) {
        return [];
      }

      // Get dynamic fields of the balances table
      const dynamicFields = await suiClient.getDynamicFields({
        parentId: balancesTableId,
      });

      const balances: { coin: string; amount: string; symbol: string }[] = [];

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

            // Get coin symbol
            let symbol = "UNKNOWN";
            if (coinType) {
              symbol =
                COIN_SYMBOL_MAP[coinType] ||
                coinType.split("::").pop() ||
                "UNKNOWN";
            }

            // Get decimals for proper formatting
            let decimals = 9;
            if (symbol === "SUI") decimals = 9;
            else if (symbol === "DEEP") decimals = 6;
            else if (["USDC", "USDT", "DBUSDC", "DBUSDT"].includes(symbol))
              decimals = 6;

            const formattedAmount = (
              Number(amount) / Math.pow(10, decimals)
            ).toFixed(4);

            balances.push({
              coin: coinType || "unknown",
              amount: formattedAmount,
              symbol,
            });
          }
        } catch (err) {
          console.error("Error fetching balance field:", err);
        }
      }

      return balances;
    } catch (err) {
      console.error("Error fetching balance manager balances:", err);
      return [];
    }
  };

  // Create Balance Manager
  const handleCreateBalanceManager = async () => {
    if (!account || !account.address) {
      setError("Please connect your wallet first");
      return;
    }

    setActionLoading("create");
    setError(null);
    setSuccess(null);

    try {
      const tx = buildCreateBalanceManagerTx(account.address!);
      tx.setSender(account.address!);
      tx.setGasBudget(100_000_000); // 0.1 SUI gas budget

      signAndExecute(
        {
          transaction: tx as any, // Cast to any to avoid version conflict between @mysten/sui versions
        },
        {
          onSuccess: async (result) => {
            const accountNumber = balanceManagers.length + 1;
            setSuccess(
              `Balance Manager #${accountNumber} created successfully! Refreshing...`,
            );
            // Wait a bit for indexer to catch up
            await new Promise((resolve) => setTimeout(resolve, 2000));
            await fetchUserData();
            setActionLoading(null);
          },
          onError: (err) => {
            console.error("Error creating Balance Manager:", err);
            setError(err.message || "Failed to create Balance Manager");
            setActionLoading(null);
          },
        },
      );
    } catch (err) {
      console.error("Error creating Balance Manager:", err);
      setError(
        err instanceof Error ? err.message : "Failed to create Balance Manager",
      );
      setActionLoading(null);
    }
  };

  // Mint Trade Cap
  // Mint Trade Cap (optionally assign to trader)
  const handleMintTradeCap = async (assignToTrader: boolean = false) => {
    if (!address || !balanceManager || !account) return;

    try {
      setActionLoading(assignToTrader ? "assignCap" : "mintCap");
      setError(null);
      setSuccess(null);

      const poolInfo = POOLS[selectedPool as keyof typeof POOLS];
      if (!poolInfo) throw new Error("Invalid pool selected");

      let tx: Transaction;

      if (assignToTrader) {
        // Validate trader address
        if (!traderAddress.trim()) {
          throw new Error("Trader address is required");
        }
        if (!traderAddress.startsWith("0x")) {
          throw new Error("Invalid trader address format");
        }

        tx = buildMintAndAssignTradeCapTx(
          balanceManager.objectId,
          traderAddress.trim(),
        );
      } else {
        tx = buildMintTradeCapTx(balanceManager.objectId, address);
      }

      tx.setSender(account.address);
      tx.setGasBudget(100_000_000); // 0.1 SUI gas budget

      signAndExecute(
        {
          transaction: tx as any, // Cast to any to avoid version conflict
        },
        {
          onSuccess: async () => {
            const action = assignToTrader ? "assigned" : "minted";
            const target = assignToTrader
              ? `to ${traderAddress.slice(0, 6)}...${traderAddress.slice(-4)}`
              : "for you";
            setSuccess(`Trade Cap ${action} ${target} for ${selectedPool}!`);
            setTraderAddress(""); // Clear trader address
            await fetchUserData();
            setActionLoading(null);
          },
          onError: (err) => {
            console.error("Error with Trade Cap:", err);
            setError(
              err.message ||
                `Failed to ${assignToTrader ? "assign" : "mint"} Trade Cap`,
            );
            setActionLoading(null);
          },
        },
      );
    } catch (err) {
      console.error("Error with Trade Cap:", err);
      setError(
        err instanceof Error
          ? err.message
          : `Failed to ${assignToTrader ? "assign" : "mint"} Trade Cap`,
      );
      setActionLoading(null);
    }
  };

  // Deposit to Balance Manager
  const handleDeposit = async () => {
    if (!address || !balanceManager) return;
    if (!depositAmount || parseFloat(depositAmount) <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    setActionLoading("deposit");
    setError(null);
    setSuccess(null);

    try {
      const coinType = getCoinType(selectedCoin);
      const decimals = COIN_DECIMALS[selectedCoin] || 9;
      const amount = BigInt(
        Math.floor(parseFloat(depositAmount) * Math.pow(10, decimals)),
      );

      // Gas reserve for SUI transactions (increase to 0.2 SUI for safety)
      const GAS_RESERVE = BigInt(200_000_000); // 0.2 SUI in MIST
      const isSUI = selectedCoin === "SUI";

      // Need to get user's coins for this type
      const coins = await suiClient?.getCoins({
        owner: address,
        coinType,
      });

      if (!coins?.data.length) {
        throw new Error(`No ${selectedCoin} coins found`);
      }

      // Get SUI coins for gas payment (always needed for transactions)
      const suiCoins = await suiClient?.getCoins({
        owner: address,
        coinType: COIN_TYPES.SUI,
      });

      if (!suiCoins?.data.length) {
        throw new Error("No SUI coins found for gas payment");
      }

      // Filter SUI coins that have enough balance for gas (0.1 SUI = 100_000_000 MIST)
      const GAS_BUDGET = BigInt(100_000_000);
      const eligibleGasCoins = suiCoins.data.filter(
        (coin) => BigInt(coin.balance) >= GAS_BUDGET,
      );

      if (!eligibleGasCoins.length) {
        throw new Error(
          "No SUI coin has enough balance for gas payment (need at least 0.1 SUI)",
        );
      }

      // Sort eligible gas coins by balance ascending (smallest first)
      const sortedSuiCoins = eligibleGasCoins.sort((a, b) =>
        BigInt(a.balance) < BigInt(b.balance) ? -1 : 1,
      );

      // Calculate total balance
      const totalBalance = coins.data.reduce(
        (sum, coin) => sum + BigInt(coin.balance),
        BigInt(0),
      );

      // Check total balance (no gas reserve for any token)
      // For SUI deposits, we need to account for excluding gas coin from available coins
      let availableBalance = totalBalance;
      if (isSUI && sortedSuiCoins.length > 0) {
        // If we have multiple SUI coins, subtract smallest gas coin balance from available
        if (coins.data.length > 1) {
          const gasCoinBalance = BigInt(sortedSuiCoins[0].balance);
          availableBalance = totalBalance - gasCoinBalance;
        }
        // If only one SUI coin, we can't deposit (it's used for gas)
        else if (coins.data.length === 1) {
          throw new Error(
            "You need at least 2 SUI coins to deposit SUI (one for gas, one for deposit)",
          );
        }
      }

      if (availableBalance < amount) {
        throw new Error(
          `Insufficient balance. Need: ${parseFloat(depositAmount).toFixed(4)} ${selectedCoin}, Available: ${(Number(availableBalance) / Math.pow(10, decimals)).toFixed(4)} ${selectedCoin}`,
        );
      }

      // Build transaction
      const tx = new Transaction();
      tx.setSender(account.address);
      tx.setGasBudget(100_000_000); // 0.1 SUI gas budget

      let coinToDeposit;
      let gasCoinId: string | null = null;

      // Use the smallest SUI coin for gas to maximize available balance
      gasCoinId = sortedSuiCoins[0].coinObjectId;
      tx.setGasPayment([
        {
          objectId: gasCoinId,
          version: sortedSuiCoins[0].version,
          digest: sortedSuiCoins[0].digest,
        },
      ]);

      // Handle coin selection and merging (same logic for all tokens)
      if (coins.data.length === 1) {
        const [split] = tx.splitCoins(tx.object(coins.data[0].coinObjectId), [
          tx.pure.u64(amount),
        ]);
        coinToDeposit = split;
      } else {
        // For SUI deposits, exclude the gas coin from merging to avoid mutable object conflicts
        let coinsToUse = coins.data;
        if (isSUI && gasCoinId) {
          coinsToUse = coins.data.filter(
            (coin) => coin.coinObjectId !== gasCoinId,
          );
          // If filtering removed all coins, fall back to original logic (shouldn't happen)
          if (coinsToUse.length === 0) {
            coinsToUse = coins.data;
          }
        }

        if (coinsToUse.length === 1) {
          const [split] = tx.splitCoins(tx.object(coinsToUse[0].coinObjectId), [
            tx.pure.u64(amount),
          ]);
          coinToDeposit = split;
        } else {
          // Merge all available coins then split
          tx.mergeCoins(
            tx.object(coinsToUse[0].coinObjectId),
            coinsToUse.slice(1).map((c) => tx.object(c.coinObjectId)),
          );
          const [split] = tx.splitCoins(tx.object(coinsToUse[0].coinObjectId), [
            tx.pure.u64(amount),
          ]);
          coinToDeposit = split;
        }
      }

      // Call deposit function directly to avoid multiple mutable references
      tx.moveCall({
        target: `${deepBookConfig.PACKAGE_ID}::balance_manager::deposit`,
        arguments: [tx.object(balanceManager.objectId), coinToDeposit],
        typeArguments: [coinType],
      });

      signAndExecute(
        {
          transaction: tx as any, // Cast to any to avoid version conflict
        },
        {
          onSuccess: async () => {
            setSuccess(`Deposited ${depositAmount} ${selectedCoin}!`);
            setDepositAmount("");
            await fetchUserData();
            setActionLoading(null);
          },
          onError: (err) => {
            console.error("Error depositing:", err);
            setError(err.message || "Failed to deposit");
            setActionLoading(null);
          },
        },
      );
    } catch (err) {
      console.error("Error depositing:", err);
      setError(err instanceof Error ? err.message : "Failed to deposit");
      setActionLoading(null);
    }
  };

  // Withdraw from Balance Manager
  const handleWithdraw = async () => {
    if (!address || !balanceManager) return;
    if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    setActionLoading("withdraw");
    setError(null);
    setSuccess(null);

    try {
      const coinType = getCoinType(selectedCoin);
      const decimals = COIN_DECIMALS[selectedCoin] || 9;
      const amount = BigInt(
        Math.floor(parseFloat(withdrawAmount) * Math.pow(10, decimals)),
      );

      const tx = buildWithdrawFromManagerTx(
        balanceManager.objectId,
        coinType,
        amount,
        address,
      );
      tx.setSender(account.address);
      tx.setGasBudget(100_000_000); // 0.1 SUI gas budget

      signAndExecute(
        {
          transaction: tx as any, // Cast to any to avoid version conflict
        },
        {
          onSuccess: async () => {
            setSuccess(`Withdrawn ${withdrawAmount} ${selectedCoin}!`);
            setWithdrawAmount("");
            await fetchUserData();
            setActionLoading(null);
          },
          onError: (err) => {
            console.error("Error withdrawing:", err);
            setError(err.message || "Failed to withdraw");
            setActionLoading(null);
          },
        },
      );
    } catch (err) {
      console.error("Error withdrawing:", err);
      setError(err instanceof Error ? err.message : "Failed to withdraw");
      setActionLoading(null);
    }
  };

  // Get coin type from symbol
  const getCoinType = (symbol: string): string => {
    const mapping: Record<string, string> = {
      SUI: COIN_TYPES.SUI,
      DEEP: COIN_TYPES.DEEP,
      USDC: CURRENT_ENV === "mainnet" ? COIN_TYPES.USDC : COIN_TYPES.DBUSDC,
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
  const availableCoins =
    CURRENT_ENV === "mainnet"
      ? ["SUI", "DEEP", "USDC"]
      : ["SUI", "DEEP", "DBUSDC", "DBUSDT"];

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
        className={`fixed left-0 top-0 h-screen bg-card border-r border-border transition-all duration-300 z-40 ${
          sidebarOpen ? "w-full sm:w-80 lg:w-80" : "w-0"
        } overflow-hidden`}
      >
        <div className="h-full flex flex-col p-4 sm:p-6">
          {/* Sidebar Header */}
          <div className="flex items-center gap-2 mb-6">
            <Wallet className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-foreground">Balance Managers</h2>
            <Badge variant="secondary">{balanceManagers.length}</Badge>
          </div>

          <Separator className="mb-4" />

          {/* Create New Balance Manager Button */}
          <Button
            onClick={handleCreateBalanceManager}
            disabled={actionLoading === "create"}
            className="w-full mb-4"
            size="sm"
          >
            {actionLoading === "create" ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating Balance Manager {balanceManagers.length + 1}
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                New Balance Manager
              </>
            )}
          </Button>

          {/* Wallet Balances in Sidebar */}
          {isAuthenticated && !loading && (
            <div className="mb-4 p-3 bg-accent/10 rounded-lg border border-border">
              <h3 className="text-xs font-semibold text-foreground mb-2 uppercase">
                Wallet Balance
              </h3>
              <div className="space-y-1.5">
                {["SUI", "DEEP", "USDC"].map((token) => (
                  <div
                    key={token}
                    className="flex items-center justify-between"
                  >
                    <span className="text-sm text-foreground font-medium">
                      {token}
                    </span>
                    <span className="text-sm text-muted-foreground font-mono">
                      {userBalances[token]
                        ? parseFloat(userBalances[token]).toFixed(4)
                        : "0.0000"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Balance Managers List */}
          <ScrollArea className="flex-1">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-3">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                <p className="text-sm text-muted-foreground">
                  Loading balance managers...
                </p>
              </div>
            ) : balanceManagers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-3">
                <Wallet className="w-12 h-12 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground text-center">
                  No balance managers yet.
                  <br />
                  Create your first one!
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {balanceManagers.map((manager, index) => (
                  <button
                    key={manager.objectId}
                    onClick={() => {
                      setSelectedManagerIndex(index);
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
                      {manager.objectId.slice(0, 8)}...
                      {manager.objectId.slice(-6)}
                    </p>
                    {manager.balances && manager.balances.length > 0 ? (
                      <div className="space-y-1 mt-2 pt-2 border-t border-border/50">
                        {manager.balances.map((balance) => (
                          <div
                            key={balance.symbol}
                            className="flex items-center justify-between text-xs"
                          >
                            <span className="text-muted-foreground font-medium">
                              {balance.symbol}
                            </span>
                            <span className="text-foreground font-mono">
                              {balance.amount}
                            </span>
                          </div>
                        ))}
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
          </ScrollArea>

          {/* How It Works Button */}
          <div className="mt-4 pt-4 border-t border-border">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setHowItWorksOpen(true)}
              className="w-full"
            >
              <Info className="w-4 h-4 mr-2" />
              How It Works
            </Button>
          </div>

          {/* Network Badge */}
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Network</span>
              <Badge variant="outline">{CURRENT_ENV}</Badge>
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
        {/* Sidebar Toggle Button - Always Visible */}
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
                <h2 className="text-base sm:text-lg font-semibold text-foreground">
                  Balance Manager
                </h2>
              </div>
            </div>

            {/* Wallet Status */}
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className="px-2 py-1 text-xs hidden sm:flex"
              >
                <Network className="w-3 h-3 mr-1" />
                {CURRENT_ENV}
              </Badge>

              {account ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2"
                    >
                      <Wallet className="w-4 h-4" />
                      <span className="hidden sm:inline text-xs font-mono">
                        {address?.slice(0, 6)}...{address?.slice(-4)}
                      </span>
                      <Badge
                        variant="secondary"
                        className="px-1.5 py-0.5 text-xs"
                      >
                        {userBalances.SUI || "0"} SUI
                      </Badge>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel className="flex items-center justify-between">
                      <span>Wallet</span>
                      <Badge variant="outline" className="text-xs">
                        Connected
                      </Badge>
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => {
                        if (address) {
                          navigator.clipboard.writeText(address);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        }
                      }}
                      className="cursor-pointer"
                    >
                      <Copy className="w-4 h-4 mr-2" />
                      {copied ? "Copied!" : "Copy Address"}
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link href="/dashboard" className="cursor-pointer">
                        <User className="w-4 h-4 mr-2" />
                        Dashboard
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <a
                        href={`https://suiscan.xyz/${CURRENT_ENV}/account/${address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="cursor-pointer"
                      >
                        <ExternalLink className="w-4 h-4 mr-2" />
                        View on Explorer
                      </a>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <div className="px-2 py-1.5">
                      <ConnectButton />
                    </div>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <ConnectButton />
              )}
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-6 lg:p-8">
          {/* Header */}
          <div className="max-w-6xl mx-auto mb-6 sm:mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-sm sm:text-base text-muted-foreground">
                  Your professional trading account for DeepBook V3
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchUserData()}
                disabled={loading}
                className="w-full sm:w-auto"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <TrendingUp className="w-4 h-4 mr-2" />
                    Refresh
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Error/Success Messages */}
          <div className="max-w-6xl mx-auto space-y-4 mb-6">
            {error && (
              <Card className="bg-destructive/10 border-destructive/30">
                <CardContent className="p-4 flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-destructive mt-0.5" />
                    <p className="text-destructive text-sm">{error}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setError(null)}
                    className="h-8 w-8 p-0"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </CardContent>
              </Card>
            )}
            {success && (
              <Card className="bg-primary/10 border-primary/30">
                <CardContent className="p-4 flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-primary mt-0.5" />
                    <p className="text-primary text-sm">{success}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSuccess(null)}
                    className="h-8 w-8 p-0"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Not Connected Warning */}
          {!isAuthenticated && (
            <div className="max-w-6xl mx-auto">
              <Card>
                <CardContent className="p-12 text-center space-y-6">
                  <div className="w-20 h-20 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
                    <Shield className="w-10 h-10 text-primary" />
                  </div>
                  <div className="space-y-2">
                    <h3 className="text-2xl font-bold text-foreground">
                      Connect Your Wallet
                    </h3>
                    <p className="text-muted-foreground">
                      Please connect your wallet to access Balance Manager
                      features
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="text-center py-12">
              <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
              <p className="text-muted-foreground font-medium">
                Loading your trading account...
              </p>
            </div>
          )}

          {isAuthenticated && !loading && (
            <div className="space-y-6 max-w-6xl mx-auto">
              {/* Balance Manager Section */}
              <Card className="border-border">
                <CardContent className="pt-4 sm:pt-6">
                  {!balanceManager ? (
                    <div className="text-center py-12 space-y-6">
                      <div className="w-20 h-20 mx-auto bg-primary/10 rounded-full flex items-center justify-center">
                        <Plus className="w-10 h-10 text-primary" />
                      </div>
                      <div className="space-y-2">
                        <h3 className="text-lg sm:text-xl font-semibold text-foreground">
                          No Balance Manager Found
                        </h3>
                        <p className="text-sm sm:text-base text-muted-foreground max-w-md mx-auto px-4">
                          Create your first Balance Manager to start trading on
                          DeepBook V3
                        </p>
                      </div>
                      <Button
                        onClick={handleCreateBalanceManager}
                        disabled={actionLoading === "create"}
                        className="px-8 py-6"
                        size="lg"
                      >
                        {actionLoading === "create" ? (
                          <span className="flex items-center gap-2">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Creating Account #1...
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <Plus className="w-5 h-5" />
                            Create First Account
                          </span>
                        )}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* Active Account Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-border">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <TrendingUp className="w-5 h-5 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <h3 className="text-base sm:text-lg font-semibold text-foreground">
                                Account #{selectedManagerIndex + 1}
                              </h3>
                              <Badge
                                variant="outline"
                                className="text-primary border-primary"
                              >
                                Active
                              </Badge>
                            </div>
                            <p className="text-muted-foreground text-xs font-mono mt-0.5 truncate">
                              {balanceManager.objectId.slice(0, 16)}...
                              {balanceManager.objectId.slice(-8)}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Balance Manager Assets Card */}
                      <Card className="bg-accent/10 border-border">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Wallet className="w-4 h-4 text-primary" />
                            Balance Manager Assets
                          </CardTitle>
                          <CardDescription className="text-xs">
                            Tokens deposited in this Balance Manager
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          {balanceManager.balances &&
                          balanceManager.balances.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                              {balanceManager.balances.map((balance) => (
                                <div
                                  key={balance.symbol}
                                  className="p-3 rounded-lg bg-background border border-border"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="text-sm text-muted-foreground font-medium">
                                      {balance.symbol}
                                    </span>
                                    <Badge
                                      variant="secondary"
                                      className="text-xs"
                                    >
                                      Available
                                    </Badge>
                                  </div>
                                  <p className="text-xl font-semibold text-foreground font-mono mt-2">
                                    {balance.amount}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-center py-8 space-y-2">
                              <div className="w-12 h-12 mx-auto bg-muted rounded-full flex items-center justify-center">
                                <Wallet className="w-6 h-6 text-muted-foreground" />
                              </div>
                              <p className="text-sm text-muted-foreground">
                                No assets deposited yet
                              </p>
                              <p className="text-xs text-muted-foreground/70">
                                Deposit tokens below to start trading
                              </p>
                            </div>
                          )}
                        </CardContent>
                      </Card>

                      {/* Deposit/Withdraw Section */}
                      <Tabs defaultValue="deposit" className="w-full">
                        <TabsList className="grid w-full grid-cols-2">
                          <TabsTrigger value="deposit">
                            <ArrowDownToLine className="w-4 h-4 mr-2" />
                            Deposit
                          </TabsTrigger>
                          <TabsTrigger value="withdraw">
                            <ArrowUpFromLine className="w-4 h-4 mr-2" />
                            Withdraw
                          </TabsTrigger>
                        </TabsList>

                        <TabsContent value="deposit" className="mt-6 space-y-4">
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label htmlFor="deposit-token">
                                Select Token
                              </Label>
                              <Select
                                value={selectedCoin}
                                onValueChange={setSelectedCoin}
                              >
                                <SelectTrigger id="deposit-token">
                                  <SelectValue placeholder="Choose a token" />
                                </SelectTrigger>
                                <SelectContent>
                                  {availableCoins.map((coin) => (
                                    <SelectItem key={coin} value={coin}>
                                      {coin}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="deposit-amount">Amount</Label>
                              <Input
                                type="number"
                                value={depositAmount}
                                onChange={(e) =>
                                  setDepositAmount(e.target.value)
                                }
                                placeholder="0.00"
                                className="text-lg h-12"
                              />
                              <p className="text-xs text-muted-foreground mt-2">
                                Available: {userBalances[selectedCoin] || "0"}{" "}
                                {selectedCoin}
                              </p>
                            </div>
                            <Button
                              onClick={handleDeposit}
                              disabled={actionLoading === "deposit"}
                              className="w-full h-12"
                            >
                              {actionLoading === "deposit" ? (
                                <span className="flex items-center gap-2">
                                  <Loader2 className="w-5 h-5 animate-spin" />
                                  Depositing...
                                </span>
                              ) : (
                                <span className="flex items-center gap-2">
                                  <ArrowDownToLine className="w-5 h-5" />
                                  Deposit Funds
                                </span>
                              )}
                            </Button>
                          </div>
                        </TabsContent>

                        <TabsContent
                          value="withdraw"
                          className="mt-6 space-y-4"
                        >
                          <div className="space-y-4">
                            <div className="space-y-2">
                              <Label htmlFor="withdraw-token">
                                Select Token
                              </Label>
                              <Select
                                value={selectedCoin}
                                onValueChange={setSelectedCoin}
                              >
                                <SelectTrigger id="withdraw-token">
                                  <SelectValue placeholder="Choose a token" />
                                </SelectTrigger>
                                <SelectContent>
                                  {availableCoins.map((coin) => (
                                    <SelectItem key={coin} value={coin}>
                                      {coin}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label htmlFor="withdraw-amount">Amount</Label>
                              <Input
                                type="number"
                                value={withdrawAmount}
                                onChange={(e) =>
                                  setWithdrawAmount(e.target.value)
                                }
                                placeholder="0.00"
                                className="text-lg h-12"
                              />
                            </div>
                            <Button
                              onClick={handleWithdraw}
                              disabled={actionLoading === "withdraw"}
                              variant="destructive"
                              className="w-full h-12"
                            >
                              {actionLoading === "withdraw" ? (
                                <span className="flex items-center gap-2">
                                  <Loader2 className="w-5 h-5 animate-spin" />
                                  Withdrawing...
                                </span>
                              ) : (
                                <span className="flex items-center gap-2">
                                  <ArrowUpFromLine className="w-5 h-5" />
                                  Withdraw Funds
                                </span>
                              )}
                            </Button>
                          </div>
                        </TabsContent>
                      </Tabs>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Trade Caps Section */}
              {balanceManager && (
                <Card className="border-border">
                  <CardHeader className="space-y-1">
                    <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                      <Ticket className="w-5 h-5 text-accent" />
                      Trade Caps
                    </CardTitle>
                    <CardDescription className="text-sm">
                      Manage trading permissions for your Balance Manager. Mint
                      TradeCaps and assign them to traders, or revoke access
                      when needed.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* Explanation of TradeCap workflow */}
                    <div className="p-3 bg-muted border border-border rounded-lg">
                      <p className="text-sm text-muted-foreground">
                        <Info className="w-4 h-4 inline mr-1" />
                        <strong>How TradeCaps work:</strong> Mint a cap for a
                        pool, then assign it to a trader by transferring the
                        object. TradeCaps grant trading permissions on DeepBook
                        V3.
                      </p>
                    </div>

                    {/* Note about current limitations */}
                    <div className="p-3 bg-muted border border-border rounded-lg">
                      <p className="text-sm text-muted-foreground">
                        <Info className="w-4 h-4 inline mr-1" />
                        Currently showing TradeCaps owned by you. TradeCaps
                        assigned to other traders won't appear here. Track
                        assignments in your app for full visibility.
                      </p>
                    </div>

                    {/* Existing Trade Caps */}
                    {tradeCaps.length > 0 && (
                      <div className="space-y-3">
                        <h3 className="text-sm font-medium text-foreground">
                          Your Trade Caps
                        </h3>
                        <div className="grid gap-3">
                          {tradeCaps.map((cap) => (
                            <div
                              key={cap.objectId}
                              className="p-4 bg-card rounded-lg border border-border hover:border-primary hover:bg-accent/50 transition-all duration-200 shadow-sm"
                            >
                              <div className="flex justify-between items-start">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-2">
                                    <p className="text-foreground font-semibold">
                                      TradeCap
                                    </p>
                                    <Badge
                                      variant={
                                        cap.isEligible ? "default" : "secondary"
                                      }
                                      className={
                                        cap.isEligible
                                          ? "bg-emerald-600 text-white hover:bg-emerald-700"
                                          : ""
                                      }
                                    >
                                      {cap.isEligible
                                        ? "Eligible"
                                        : "Ineligible"}
                                    </Badge>
                                    {cap.isOwnedByUser && (
                                      <Badge
                                        variant="outline"
                                        className="text-xs"
                                      >
                                        Owned by You
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-muted-foreground text-xs font-mono">
                                    ID: {cap.objectId.slice(0, 12)}...
                                    {cap.objectId.slice(-8)}
                                  </p>
                                  <p className="text-muted-foreground text-xs mt-1">
                                    Owner: {cap.owner.slice(0, 6)}...
                                    {cap.owner.slice(-4)}
                                    {cap.isOwnedByUser && " (You)"}
                                  </p>
                                  <p className="text-muted-foreground text-xs mt-1">
                                    Balance Manager:{" "}
                                    {cap.balanceManagerId.slice(0, 8)}...
                                    {cap.balanceManagerId.slice(-6)}
                                  </p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Mint New Trade Cap */}
                    <div className="p-4 rounded-lg border border-border space-y-4">
                      <h3 className="text-foreground font-semibold flex items-center gap-2">
                        <Plus className="w-5 h-5 text-primary" />
                        Mint New Trade Cap
                      </h3>
                      <div className="space-y-3">
                        <div className="flex flex-col sm:flex-row gap-3">
                          <Select
                            value={selectedPool}
                            onValueChange={setSelectedPool}
                          >
                            <SelectTrigger className="flex-1">
                              <SelectValue placeholder="Select a pool" />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.keys(POOLS).map((pool) => (
                                <SelectItem key={pool} value={pool}>
                                  {pool}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            onClick={() => handleMintTradeCap(false)}
                            disabled={actionLoading === "mintCap"}
                            variant="secondary"
                            className="w-full sm:w-auto"
                          >
                            {actionLoading === "mintCap" ? (
                              <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                              "Mint for Me"
                            )}
                          </Button>
                        </div>

                        {/* Assign to Trader Section */}
                        <div className="pt-3 border-t border-border">
                          <h4 className="text-sm font-medium text-foreground mb-2">
                            Or assign directly to a trader:
                          </h4>
                          <div className="flex flex-col sm:flex-row gap-3">
                            <Input
                              type="text"
                              value={traderAddress}
                              onChange={(e) => setTraderAddress(e.target.value)}
                              placeholder="Trader address (0x...)"
                              className="flex-1"
                            />
                            <Button
                              onClick={() => handleMintTradeCap(true)}
                              disabled={
                                actionLoading === "assignCap" ||
                                !traderAddress.trim()
                              }
                              variant="default"
                              className="w-full sm:w-auto"
                            >
                              {actionLoading === "assignCap" ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                              ) : (
                                "Mint & Assign"
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </div>
      </div>

      {/* How It Works Dialog */}
      <Dialog open={howItWorksOpen} onOpenChange={setHowItWorksOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl sm:text-2xl">
              <Info className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
              How It Works
            </DialogTitle>
            <DialogDescription className="text-sm">
              Learn how to use Balance Manager for trading on DeepBook V3
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 mt-4">
            {/* Steps */}
            <div className="grid sm:grid-cols-2 gap-3 sm:gap-4">
              {[
                {
                  step: "1",
                  title: "Create Balance Manager",
                  description: "Your personal trading account on DeepBook V3",
                  icon: Wallet,
                },
                {
                  step: "2",
                  title: "Mint Trade Caps",
                  description: "Authorize trading on specific pools",
                  icon: Ticket,
                },
                {
                  step: "3",
                  title: "Deposit Funds",
                  description: "Move tokens into your Balance Manager",
                  icon: ArrowDownToLine,
                },
                {
                  step: "4",
                  title: "Start Trading",
                  description: "Place orders and use advanced features",
                  icon: Zap,
                },
              ].map((item) => (
                <div
                  key={item.step}
                  className="flex gap-4 p-4 rounded-lg border border-border hover:border-primary hover:bg-accent/50 transition-all group"
                >
                  <div className="shrink-0">
                    <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                      <item.icon className="w-6 h-6 text-primary" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold text-muted-foreground">
                        STEP {item.step}
                      </span>
                    </div>
                    <h4 className="text-foreground font-semibold mb-1">
                      {item.title}
                    </h4>
                    <p className="text-muted-foreground text-sm">
                      {item.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Quick Navigation */}
            <div>
              <h3 className="text-base sm:text-lg font-semibold text-foreground mb-3">
                Quick Navigation
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                {[
                  { label: "Swap", href: "/trade/swap" },
                  { label: "Limit Orders", href: "/trade/limit-orders" },
                  { label: "Margin Trading", href: "/trade/margin-trading" },
                  {
                    label: "Flash Arbitrage",
                    href: "/trade/flash-arbitrage",
                  },
                ].map((item) => (
                  <a
                    key={item.label}
                    href={item.href}
                    className="p-4 bg-primary text-primary-foreground rounded-lg font-semibold text-center hover:scale-105 hover:bg-primary/90 transition-all shadow"
                    onClick={() => setHowItWorksOpen(false)}
                  >
                    {item.label}
                  </a>
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
