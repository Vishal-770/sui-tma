"use client";

import Link from "next/link";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { useAuth } from "@/contexts/AuthContext";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const demos = [
  {
    title: "Balance Manager",
    description:
      "Create and manage your Balance Manager for secure trading. Deposit tokens, mint trade caps, and track your positions across DeepBook V3 pools.",
    href: "/trade/balance-manager",
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1"
        />
      </svg>
    ),
    features: [
      "Secure token deposits",
      "Trade cap management",
      "Position tracking",
      "Multi-pool support",
    ],
  },
  {
    title: "Swap",
    description:
      "Perform instant token swaps across DeepBook V3 pools with optimal routing and minimal slippage. Exchange any supported token pair directly.",
    href: "/trade/swap",
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
        />
      </svg>
    ),
    features: [
      "Instant token swaps",
      "Optimal routing",
      "Minimal slippage",
      "Multi-pool support",
    ],
  },
  {
    title: "Flash Arbitrage",
    description:
      "Execute atomic flash loan arbitrage across DeepBook pools with zero upfront capital. Borrow assets instantly, perform arbitrage, and repay in a single transaction.",
    href: "/trade/flash-arbitrage",
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M13 10V3L4 14h7v7l9-11h-7z"
        />
      </svg>
    ),
    features: [
      "Zero capital required",
      "Atomic transactions",
      "Cross-pool arbitrage",
      "Real-time opportunity scanning",
    ],
  },
  {
    title: "Margin Trading",
    description:
      "Trade with up to 20x leverage using DeepBook liquidity with automatic liquidation protection. Borrow against your collateral for amplified positions.",
    href: "/trade/margin-trading",
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
        />
      </svg>
    ),
    features: [
      "Up to 20x leverage",
      "Auto-liquidation protection",
      "Collateral management",
      "Risk monitoring",
    ],
  },
  {
    title: "Limit Orders",
    description:
      "Set encrypted conditional orders with stop-loss and take-profit triggers. Execute trades automatically when price conditions are met.",
    href: "/trade/limit-orders",
    icon: (
      <svg
        className="w-6 h-6"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
        />
      </svg>
    ),
    features: [
      "Encrypted conditional orders",
      "Stop-loss & take-profit",
      "Automated execution",
      "Advanced order types",
    ],
  },
];

export default function DemoHubPage() {
  const dappKitAccount = useCurrentAccount();
  const { isAuthenticated, session } = useAuth();

  const isConnected = isAuthenticated || !!dappKitAccount;
  const walletAddress = session?.zkLoginAddress || dappKitAccount?.address;

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold mb-4">
            DeFi Trading Hub
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Advanced trading tools powered by encrypted intents on Sui
            blockchain
          </p>
        </div>

        {/* Connection Status */}
        <div className="flex justify-center mb-12">
          <Card className="w-full max-w-md">
            <CardContent className="p-4">
              <div className="flex items-center justify-center gap-3">
                <Badge variant={isConnected ? "default" : "secondary"}>
                  <div
                    className={`w-2 h-2 rounded-full mr-2 ${
                      isConnected
                        ? "bg-primary-foreground"
                        : "bg-muted-foreground"
                    }`}
                  />
                  {isConnected ? "Connected" : "Not Connected"}
                </Badge>
                {walletAddress && (
                  <p className="text-sm text-muted-foreground font-mono truncate">
                    {walletAddress}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Trading Modules */}
        <div className="mb-16">
          <h2 className="text-2xl font-semibold text-center mb-8">
            Trading Modules
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {demos.map((demo, i) => (
              <Link key={i} href={demo.href}>
                <Card className="h-full hover:border-primary/50 transition-colors">
                  <CardContent className="p-6">
                    <div className="flex flex-col h-full">
                      <div className="w-12 h-12 bg-muted border rounded-lg flex items-center justify-center text-muted-foreground mb-4">
                        {demo.icon}
                      </div>
                      <h3 className="text-lg font-semibold mb-2">
                        {demo.title}
                      </h3>
                      <p className="text-muted-foreground text-sm mb-4 flex-grow">
                        {demo.description}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {demo.features.map((feature, idx) => (
                          <Badge
                            key={idx}
                            variant="outline"
                            className="text-xs"
                          >
                            {feature}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mb-16">
          <h2 className="text-2xl font-semibold text-center mb-8">
            Quick Actions
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <Link href="/intents/create">
              <Card className="hover:border-primary/50 transition-colors">
                <CardContent className="p-6 text-center">
                  <div className="w-12 h-12 bg-muted border rounded-lg flex items-center justify-center text-muted-foreground mx-auto mb-3">
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                      />
                    </svg>
                  </div>
                  <h3 className="font-semibold mb-1">New Intent</h3>
                  <p className="text-sm text-muted-foreground">
                    Create encrypted trading intents
                  </p>
                </CardContent>
              </Card>
            </Link>
            <Link href="/intents">
              <Card className="hover:border-primary/50 transition-colors">
                <CardContent className="p-6 text-center">
                  <div className="w-12 h-12 bg-muted border rounded-lg flex items-center justify-center text-muted-foreground mx-auto mb-3">
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                      />
                    </svg>
                  </div>
                  <h3 className="font-semibold mb-1">My Intents</h3>
                  <p className="text-sm text-muted-foreground">
                    View and manage your intents
                  </p>
                </CardContent>
              </Card>
            </Link>
            <Link href="/dashboard">
              <Card className="hover:border-primary/50 transition-colors">
                <CardContent className="p-6 text-center">
                  <div className="w-12 h-12 bg-muted border rounded-lg flex items-center justify-center text-muted-foreground mx-auto mb-3">
                    <svg
                      className="w-6 h-6"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                      />
                    </svg>
                  </div>
                  <h3 className="font-semibold mb-1">Dashboard</h3>
                  <p className="text-sm text-muted-foreground">
                    Portfolio overview & analytics
                  </p>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>

        {/* Important Notes */}
        <Card className="border-amber-200 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/20">
          <CardHeader>
            <CardTitle className="text-amber-800 dark:text-amber-200 flex items-center gap-2">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              Important Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-amber-500 rounded-full mt-2 flex-shrink-0" />
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Balance Manager setup required for margin trading and limit
                  orders
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-amber-500 rounded-full mt-2 flex-shrink-0" />
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Flash arbitrage operates on mainnet with real funds - test on
                  devnet first
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-amber-500 rounded-full mt-2 flex-shrink-0" />
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Margin trading involves liquidation risk - monitor positions
                  closely
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-amber-500 rounded-full mt-2 flex-shrink-0" />
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  All trades use encrypted intents for privacy and security
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 bg-amber-500 rounded-full mt-2 flex-shrink-0" />
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Network switching affects available pools and balances
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t">
          <p className="text-sm text-muted-foreground text-center">
            Built on Sui with DeepBook V3, Seal Encryption, and Nautilus TEE
          </p>
        </div>
      </div>
    </div>
  );
}
