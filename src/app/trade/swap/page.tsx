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
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ArrowDownUp,
  Wallet,
  TrendingUp,
  PanelLeftClose,
  PanelLeftOpen,
  Network,
  Copy,
  ExternalLink,
  User,
  Info,
  Loader2,
  Home,
  BarChart3,
  Zap,
  Settings,
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
import { ConnectButton } from "@mysten/dapp-kit";
import {
  getConfig,
  getPoolByCoins,
  swapExactBaseForQuote,
  swapExactQuoteForBase,
  toUnits,
  fromUnits,
  getExplorerUrl,
  getCoinDecimals,
  type NetworkEnv,
} from "@/lib/deepbook-v3";

interface TokenInfo {
  symbol: string;
  name: string;
  decimals: number;
  coinType: string;
}

export default function SwapPage() {
  const account = useCurrentAccount();
  const suiClient = useSuiClient();
  const { mutate: signAndExecute, isPending } = useSignAndExecuteTransaction();

  // Use network context for dynamic network
  const { network, isMainnet } = useNetwork();
  const { defaultSlippageBps, allowZeroMinOutput, strictBalanceCheck } =
    useNetworkConfig();

  // Sidebar and UI state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const {
    isAuthenticated: zkLoginAuth,
    session: zkLoginSession,
    logout: zkLoginLogout,
  } = useAuth();

  const address = account?.address;
  const isAuthenticated = !!account;

  // Config based on current network
  const CONFIG = useMemo(() => getConfig(network), [network]);

  // Build available tokens from config
  const AVAILABLE_TOKENS: TokenInfo[] = useMemo(
    () =>
      Object.entries(CONFIG.coins).map(([symbol, coin]) => ({
        symbol,
        name: symbol,
        decimals: getCoinDecimals(CONFIG, symbol),
        coinType: coin.type,
      })),
    [CONFIG],
  );

  // Default tokens based on network
  const defaultToToken = isMainnet ? "USDC" : "DBUSDC";

  const [fromToken, setFromToken] = useState<TokenInfo | null>(null);
  const [toToken, setToToken] = useState<TokenInfo | null>(null);
  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [slippage, setSlippage] = useState(defaultSlippageBps / 100); // Convert bps to percent
  const [balances, setBalances] = useState<Record<string, bigint>>({});
  const [userCoinObjects, setUserCoinObjects] = useState<
    Record<string, string[]>
  >({});
  const [logs, setLogs] = useState<string[]>([]);
  const [lastTx, setLastTx] = useState<string | null>(null);

  // Initialize tokens when available
  useEffect(() => {
    if (AVAILABLE_TOKENS.length > 0) {
      const suiToken =
        AVAILABLE_TOKENS.find((t) => t.symbol === "SUI") || AVAILABLE_TOKENS[0];
      const defaultTo =
        AVAILABLE_TOKENS.find((t) => t.symbol === defaultToToken) ||
        AVAILABLE_TOKENS[1];
      setFromToken(suiToken);
      setToToken(defaultTo);
    }
  }, [AVAILABLE_TOKENS, defaultToToken]);

  // Reset when network changes
  useEffect(() => {
    setLogs([]);
    setLastTx(null);
    setFromAmount("");
    setToAmount("");
    setBalances({});
    addLog(`Switched to ${network}`);
  }, [network]);

  const addLog = useCallback((message: string) => {
    setLogs((prev) => [
      ...prev.slice(-9),
      `[${new Date().toLocaleTimeString()}] ${message}`,
    ]);
  }, []);

  // Get pool info for current pair
  const getPoolInfo = useCallback(() => {
    if (!fromToken || !toToken) return null;
    return getPoolByCoins(CONFIG, fromToken.symbol, toToken.symbol);
  }, [CONFIG, fromToken?.symbol, toToken?.symbol]);

  // Fetch user balances function
  const fetchBalances = useCallback(async () => {
    if (!account?.address) return;

    const newBalances: Record<string, bigint> = {};
    const newCoinObjects: Record<string, string[]> = {};

    for (const token of AVAILABLE_TOKENS) {
      try {
        const coins = await suiClient.getCoins({
          owner: account.address,
          coinType: token.coinType,
        });

        const totalBalance = coins.data.reduce(
          (sum, coin) => sum + BigInt(coin.balance),
          BigInt(0),
        );
        newBalances[token.symbol] = totalBalance;
        newCoinObjects[token.symbol] = coins.data.map((c) => c.coinObjectId);
      } catch {
        newBalances[token.symbol] = BigInt(0);
        newCoinObjects[token.symbol] = [];
      }
    }

    // Also fetch DEEP tokens for fees
    try {
      const deepCoins = await suiClient.getCoins({
        owner: account.address,
        coinType: CONFIG.coins["DEEP"]?.type || "",
      });
      const deepBalance = deepCoins.data.reduce(
        (sum, c) => sum + BigInt(c.balance),
        BigInt(0),
      );
      newBalances["DEEP"] = deepBalance;
      newCoinObjects["DEEP"] = deepCoins.data.map((c) => c.coinObjectId);
    } catch {
      newBalances["DEEP"] = BigInt(0);
      newCoinObjects["DEEP"] = [];
    }

    setBalances(newBalances);
    setUserCoinObjects(newCoinObjects);
  }, [account?.address, suiClient, AVAILABLE_TOKENS, CONFIG]);

  // Fetch user balances on mount and periodically
  useEffect(() => {
    if (!account?.address) return;

    fetchBalances();
    const interval = setInterval(fetchBalances, 15000);
    return () => clearInterval(interval);
  }, [account?.address, fetchBalances]);

  // Simple price estimation (1:1 for demo, real app would query orderbook)
  useEffect(() => {
    if (!fromAmount || isNaN(parseFloat(fromAmount))) {
      setToAmount("");
      return;
    }
    // Simplified estimation - in production, query the orderbook
    setToAmount(fromAmount);
  }, [fromAmount]);

  const handleSwapDirection = () => {
    const temp = fromToken;
    setFromToken(toToken);
    setToToken(temp);
    setFromAmount(toAmount);
    setToAmount(fromAmount);
  };

  const formatBalance = (amount: bigint, decimals: number): string => {
    const divisor = Math.pow(10, decimals);
    return (Number(amount) / divisor).toFixed(4);
  };

  const handleSetMax = () => {
    if (!fromToken) return;
    const balance = balances[fromToken.symbol] || BigInt(0);
    const maxAmount = Number(balance) / Math.pow(10, fromToken.decimals);
    // Leave some for gas if SUI
    const finalAmount =
      fromToken.symbol === "SUI" ? Math.max(0, maxAmount - 0.1) : maxAmount;
    setFromAmount(finalAmount.toFixed(6));
  };

  // Validate before swap
  const validateSwap = useCallback((): string | null => {
    if (!account) return "Please connect wallet";
    if (!fromToken || !toToken) return "Select tokens";

    const amount = parseFloat(fromAmount);
    if (isNaN(amount) || amount <= 0) return "Enter valid amount";

    const poolResult = getPoolInfo();
    if (!poolResult) return "No pool available for this pair";

    // Balance check
    const balance = balances[fromToken.symbol] || BigInt(0);
    const requiredAmount = toUnits(amount, fromToken.decimals);

    if (balance < requiredAmount) {
      return `Insufficient ${fromToken.symbol} balance`;
    }

    // Mainnet requires DEEP for fees (testnet may allow zero)
    if (isMainnet) {
      const deepBalance = balances["DEEP"] || BigInt(0);
      if (deepBalance < BigInt(100000)) {
        // < 0.1 DEEP
        return "Insufficient DEEP for fees (need ~0.1 DEEP)";
      }
    }

    return null;
  }, [
    account,
    fromToken,
    toToken,
    fromAmount,
    getPoolInfo,
    balances,
    isMainnet,
  ]);

  // Execute swap
  const handleSwap = useCallback(async () => {
    if (!account || !account.address) {
      addLog("[ERROR] Please connect your wallet first");
      return;
    }

    const validationError = validateSwap();
    if (validationError) {
      addLog(`[ERROR] ${validationError}`);
      return;
    }

    const poolResult = getPoolInfo();
    if (!poolResult || !fromToken || !toToken) return;

    const { poolKey, pool, isBaseToQuote } = poolResult;
    const amount = parseFloat(fromAmount);

    addLog(
      `Swapping ${fromAmount} ${fromToken.symbol} -> ${toToken.symbol}...`,
    );
    addLog(`  Network: ${network.toUpperCase()}`);
    addLog(`  Pool: ${poolKey}`);

    const tx = new Transaction();
    tx.setSender(account!.address);
    tx.setGasBudget(250_000_000);

    try {
      const amountInUnits = toUnits(amount, fromToken.decimals);

      // Calculate minOutput with slippage protection
      // On mainnet, NEVER use zero - enforce slippage protection
      // On testnet, allow zero for low-liquidity testing
      const estimatedOutput =
        parseFloat(toAmount || "0") * Math.pow(10, toToken.decimals);
      const slippageMultiplier = 1 - slippage / 100;

      let minOutput: bigint;
      if (allowZeroMinOutput) {
        // Testnet: Use zero to handle low liquidity pools
        minOutput = BigInt(0);
        addLog(`  Min output: 0 (testnet mode - low liquidity)`);
      } else {
        // Mainnet: Enforce slippage protection
        minOutput = BigInt(Math.floor(estimatedOutput * slippageMultiplier));
        addLog(
          `  Min output: ${fromUnits(minOutput, toToken.decimals).toFixed(6)} (${slippage}% slippage)`,
        );
      }

      addLog(`  Direction: ${isBaseToQuote ? "Base→Quote" : "Quote→Base"}`);
      addLog(`  Input: ${amount} ${fromToken.symbol}`);

      // Get input coins
      const inputCoins = userCoinObjects[fromToken.symbol] || [];
      if (inputCoins.length === 0 && fromToken.symbol !== "SUI") {
        addLog(`[ERROR] No ${fromToken.symbol} coins found`);
        return;
      }

      // Prepare input coin
      let inputCoin;
      if (fromToken.symbol === "SUI") {
        [inputCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(amountInUnits)]);
      } else {
        if (inputCoins.length === 1) {
          inputCoin = tx.object(inputCoins[0]);
        } else {
          tx.mergeCoins(
            tx.object(inputCoins[0]),
            inputCoins.slice(1).map((id) => tx.object(id)),
          );
          inputCoin = tx.object(inputCoins[0]);
        }
        [inputCoin] = tx.splitCoins(inputCoin, [tx.pure.u64(amountInUnits)]);
      }

      // DEEP coin for fees - get from user's wallet
      const deepBalance = balances["DEEP"] || BigInt(0);
      const deepCoinObjects = userCoinObjects["DEEP"] || [];

      // Use appropriate DEEP amount for fees
      // Mainnet requires DEEP, testnet can work with zero
      const deepAmountForFees =
        deepBalance > BigInt(100000) ? 100000 : isMainnet ? 100000 : 0;

      let deepCoin;
      if (deepAmountForFees > 0 && deepCoinObjects.length > 0) {
        // Get DEEP from user's wallet
        if (deepCoinObjects.length === 1) {
          deepCoin = tx.object(deepCoinObjects[0]);
        } else {
          // Merge multiple DEEP coins
          tx.mergeCoins(
            tx.object(deepCoinObjects[0]),
            deepCoinObjects.slice(1).map((id) => tx.object(id)),
          );
          deepCoin = tx.object(deepCoinObjects[0]);
        }
        // Split the fee amount
        [deepCoin] = tx.splitCoins(deepCoin, [tx.pure.u64(deepAmountForFees)]);
        addLog(`  DEEP fee: 0.1 DEEP`);
      } else {
        // For testnet with no DEEP, use a zero-balance coin
        deepCoin = tx.splitCoins(tx.gas, [tx.pure.u64(0)])[0];
        addLog(`  DEEP fee: zero (using gas coin)`);
      }

      const swapParams = {
        tx,
        config: CONFIG,
        poolKey,
        inputCoin,
        deepCoin,
        minOutput,
        senderAddress: account!.address,
      };

      const [baseOut, quoteOut, deepOut] = isBaseToQuote
        ? swapExactBaseForQuote(swapParams)
        : swapExactQuoteForBase(swapParams);

      tx.transferObjects([baseOut, quoteOut, deepOut], account!.address);

      signAndExecute(
        { transaction: tx as any },
        {
          onSuccess: (result) => {
            const explorerUrl = getExplorerUrl(network, result.digest);
            addLog(`[OK] Swap successful!`);
            addLog(`Explorer: ${explorerUrl}`);
            setLastTx(result.digest);
            setFromAmount("");
            setToAmount("");

            // Refresh balances immediately to show new tokens
            setTimeout(() => {
              fetchBalances();
            }, 2000); // Wait 2 seconds for blockchain to finalize
          },
          onError: (error) => {
            addLog(`[ERROR] Swap failed: ${error.message}`);
            if (error.message.includes("InsufficientCoinBalance")) {
              addLog(`Tip: Insufficient token balance`);
            } else if (
              error.message.includes("InsufficientLiquidity") ||
              error.message.includes("EINSUFFICIENT")
            ) {
              addLog(`Tip: Pool has insufficient liquidity`);
            } else if (error.message.includes("minOut")) {
              addLog(`Tip: Output below minimum - try increasing slippage`);
            }
            console.error("Swap error:", error);
          },
        },
      );
    } catch (error: any) {
      addLog(`[ERROR] ${error.message}`);
      console.error("Swap error:", error);
    }
  }, [
    account,
    fromAmount,
    fromToken,
    toToken,
    toAmount,
    slippage,
    getPoolInfo,
    signAndExecute,
    addLog,
    userCoinObjects,
    balances,
    CONFIG,
    network,
    allowZeroMinOutput,
    isMainnet,
    validateSwap,
    fetchBalances,
  ]);

  if (!fromToken || !toToken) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-primary"></div>
      </div>
    );
  }

  const validationError = validateSwap();

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
            <TrendingUp className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-foreground">Swap</h2>
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
            <Link href="/trade/swap" className="block">
              <Button
                variant="default"
                size="sm"
                className="w-full justify-start"
              >
                <TrendingUp className="w-4 h-4 mr-2" />
                Swap
              </Button>
            </Link>
            <Link href="/trade/balance-manager" className="block">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-muted-foreground hover:text-foreground hover:bg-accent"
              >
                <Wallet className="w-4 h-4 mr-2" />
                Balance Manager
              </Button>
            </Link>
            <Link href="/trade/flash-arbitrage" className="block">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-muted-foreground hover:text-foreground hover:bg-accent"
              >
                <Zap className="w-4 h-4 mr-2" />
                Flash Arbitrage
              </Button>
            </Link>
            <Link href="/trade/limit-orders" className="block">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-muted-foreground hover:text-foreground hover:bg-accent"
              >
                <Settings className="w-4 h-4 mr-2" />
                Limit Orders
              </Button>
            </Link>
          </div>

          <Separator className="mb-4" />

          {/* Wallet Balances in Sidebar */}
          {isAuthenticated && (
            <div className="mb-4 p-3 bg-accent/10 rounded-lg border border-border">
              <h3 className="text-xs font-semibold text-foreground mb-2 uppercase">
                Wallet Balance
              </h3>
              <div className="space-y-1.5">
                {AVAILABLE_TOKENS.map((token) => (
                  <div
                    key={token.symbol}
                    className="flex items-center justify-between"
                  >
                    <span className="text-sm text-foreground font-medium">
                      {token.symbol}
                    </span>
                    <span className="text-sm text-muted-foreground font-mono">
                      {formatBalance(
                        balances[token.symbol] || BigInt(0),
                        token.decimals,
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Activity Log */}
          <div className="flex-1 flex flex-col">
            <h3 className="text-sm font-semibold text-foreground mb-3">
              Activity
            </h3>
            <ScrollArea className="flex-1">
              <div className="bg-muted/30 rounded-lg p-3 h-64 overflow-y-auto font-mono text-xs">
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
                  Swap
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
                {network}
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
                        {formatBalance(
                          balances[fromToken.symbol] || BigInt(0),
                          fromToken.decimals,
                        )}{" "}
                        {fromToken.symbol}
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
                        href={`https://suiscan.xyz/${network}/account/${address}`}
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
          <div className="max-w-4xl mx-auto mb-6 sm:mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-foreground mb-1">
                  Swap Tokens
                </h1>
                <p className="text-sm sm:text-base text-muted-foreground">
                  Trade tokens instantly via DeepBook CLOB
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  fetchBalances();
                  addLog("Refreshing balances...");
                }}
                disabled={isPending}
                className="w-full sm:w-auto"
              >
                <TrendingUp className="w-4 h-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>

          {/* Mainnet Warning */}
          {isMainnet && (
            <div className="max-w-4xl mx-auto mb-6">
              <Card className="border-chart-2/20 bg-chart-2/5">
                <CardContent className="p-4">
                  <p className="text-chart-2 text-sm font-medium">
                    You are on Mainnet - transactions use real funds
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Swap Card */}
          <div className="max-w-4xl mx-auto">
            <Card>
              <CardContent className="p-6">
                {/* From Token */}
                <div className="mb-2">
                  <div className="flex justify-between text-sm text-muted-foreground mb-2">
                    <span>From</span>
                    <span>
                      Balance:{" "}
                      {formatBalance(
                        balances[fromToken.symbol] || BigInt(0),
                        fromToken.decimals,
                      )}{" "}
                      {fromToken.symbol}
                    </span>
                  </div>
                  <div className="flex gap-3 bg-muted/50 rounded-xl p-4 border border-border">
                    <input
                      type="number"
                      value={fromAmount}
                      onChange={(e) => setFromAmount(e.target.value)}
                      placeholder="0.0"
                      className="flex-1 bg-transparent text-2xl outline-none"
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleSetMax}
                        className="text-xs text-primary hover:text-primary/80"
                      >
                        MAX
                      </Button>
                      <Select
                        value={fromToken.symbol}
                        onValueChange={(value) => {
                          const token = AVAILABLE_TOKENS.find(
                            (t) => t.symbol === value,
                          );
                          if (token) setFromToken(token);
                        }}
                      >
                        <SelectTrigger className="bg-black text-white border-gray-600 w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {AVAILABLE_TOKENS.map((token) => (
                            <SelectItem key={token.symbol} value={token.symbol}>
                              {token.symbol}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Swap Direction Button */}
                <div className="flex justify-center -my-2 relative z-10">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={handleSwapDirection}
                  >
                    <ArrowDownUp className="h-4 w-4" />
                  </Button>
                </div>

                {/* To Token */}
                <div className="mt-2">
                  <div className="flex justify-between text-sm text-muted-foreground mb-2">
                    <span>To</span>
                    <span>
                      Balance:{" "}
                      {formatBalance(
                        balances[toToken.symbol] || BigInt(0),
                        toToken.decimals,
                      )}{" "}
                      {toToken.symbol}
                    </span>
                  </div>
                  <div className="flex gap-3 bg-muted/50 rounded-xl p-4 border border-border">
                    <input
                      type="number"
                      value={toAmount}
                      readOnly
                      placeholder="0.0"
                      className="flex-1 bg-transparent text-2xl outline-none text-muted-foreground"
                    />
                    <Select
                      value={toToken.symbol}
                      onValueChange={(value) => {
                        const token = AVAILABLE_TOKENS.find(
                          (t) => t.symbol === value,
                        );
                        if (token) setToToken(token);
                      }}
                    >
                      <SelectTrigger className="bg-black text-white border-gray-600 w-24">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AVAILABLE_TOKENS.map((token) => (
                          <SelectItem key={token.symbol} value={token.symbol}>
                            {token.symbol}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Trade Info */}
                {fromAmount && toAmount && (
                  <div className="mt-4 p-4 bg-muted/30 rounded-xl space-y-2 text-sm">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Rate</span>
                      <span className="text-foreground">
                        1 {fromToken.symbol} ={" "}
                        {(
                          parseFloat(toAmount) / parseFloat(fromAmount)
                        ).toFixed(6)}{" "}
                        {toToken.symbol}
                      </span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Slippage Tolerance</span>
                      <span className="text-foreground">{slippage}%</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Min. Received</span>
                      <span
                        className={isMainnet ? "text-chart-2" : "text-chart-3"}
                      >
                        {allowZeroMinOutput
                          ? "Any (testnet mode)"
                          : `${(parseFloat(toAmount) * (1 - slippage / 100)).toFixed(6)} ${toToken.symbol}`}
                      </span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Pool</span>
                      <span className="text-primary">
                        {getPoolInfo()?.poolKey || "No pool"}
                      </span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>DEEP Balance</span>
                      <span className="text-foreground">
                        {fromUnits(balances["DEEP"] || BigInt(0), 6).toFixed(4)}
                      </span>
                    </div>
                  </div>
                )}

                {/* Slippage Settings */}
                <div className="mt-4">
                  <div className="flex justify-between items-center text-sm text-muted-foreground mb-2">
                    <span>Slippage Tolerance</span>
                    {isMainnet && (
                      <Badge variant="secondary" className="text-xs">
                        Protected
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {(isMainnet ? [0.1, 0.5, 1.0] : [0.5, 1.0, 2.0, 5.0]).map(
                      (value) => (
                        <Button
                          key={value}
                          variant={slippage === value ? "default" : "outline"}
                          onClick={() => setSlippage(value)}
                          className="flex-1"
                        >
                          {value}%
                        </Button>
                      ),
                    )}
                  </div>
                </div>

                {/* Validation Error */}
                {validationError && fromAmount && (
                  <Card className="mt-4 border-destructive/20 bg-destructive/5">
                    <CardContent className="p-3">
                      <p className="text-destructive text-sm">
                        {validationError}
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* Swap Button */}
                <Button
                  onClick={handleSwap}
                  disabled={isPending || !!validationError}
                  className="w-full mt-6"
                  size="lg"
                >
                  {isPending
                    ? "Swapping..."
                    : !account
                      ? "Connect Wallet"
                      : validationError || "Swap"}
                </Button>
              </CardContent>
            </Card>

            {/* Last Transaction */}
            {lastTx && (
              <Card className="mt-4 border-chart-2/20 bg-chart-2/5">
                <CardContent className="p-4">
                  <p className="text-sm text-chart-2">
                    Last swap:{" "}
                    <a
                      href={getExplorerUrl(network, lastTx)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-chart-2/80"
                    >
                      {lastTx.slice(0, 20)}...
                    </a>
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Info */}
            <div className="mt-6 text-center text-sm text-muted-foreground">
              <p>Powered by DeepBook V3 CLOB</p>
              <p className="mt-1">
                {isMainnet
                  ? "Slippage protection enabled • Real funds"
                  : "Testnet mode • Zero min-output for low liquidity"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
