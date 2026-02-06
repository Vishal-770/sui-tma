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
    title: "Flash Arbitrage",
    description:
      "Execute atomic flash loan arbitrage across DeepBook pools with zero upfront capital.",
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
  },
  {
    title: "Margin Trading",
    description:
      "Trade with up to 20x leverage using DeepBook liquidity with automatic liquidation protection.",
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
  },
  {
    title: "Limit Orders",
    description:
      "Set encrypted conditional orders with stop-loss and take-profit triggers.",
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
  },
];

export default function DemoHubPage() {
  const dappKitAccount = useCurrentAccount();
  const { isAuthenticated, session } = useAuth();

  const isConnected = isAuthenticated || !!dappKitAccount;
  const walletAddress = session?.zkLoginAddress || dappKitAccount?.address;

  return (
    <div className="min-h-screen w-full bg-background text-foreground">
      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        {/* Header */}
        <div className="mb-8 sm:mb-12">
          <h1 className="text-2xl sm:text-3xl font-bold mb-2">DeFi Trading</h1>
          <p className="text-muted-foreground text-base sm:text-lg">
            Advanced trading tools powered by encrypted intents
          </p>
        </div>

        {/* Connection Status */}
        <Card className="mb-8">
          <CardContent className="p-4 sm:p-5">
            <div className="flex items-center gap-3 sm:gap-4">
              <Badge
                variant={isConnected ? "default" : "secondary"}
                className="shrink-0"
              >
                <div
                  className={`w-2 h-2 rounded-full mr-2 ${isConnected ? "bg-primary-foreground" : "bg-muted-foreground"}`}
                />
                {isConnected ? "Connected" : "Not Connected"}
              </Badge>
              <div className="flex-1 min-w-0">
                {walletAddress && (
                  <p className="text-xs sm:text-sm text-muted-foreground font-mono truncate">
                    {walletAddress}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Trading Modules */}
        <div className="space-y-4 mb-8">
          {demos.map((demo, i) => (
            <Link key={i} href={demo.href} className="block group">
              <Card className="hover:border-primary/50 transition-all duration-200">
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-primary/10 border border-primary/20 rounded-lg flex items-center justify-center text-primary shrink-0">
                      {demo.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-3">
                        <h3 className="text-base sm:text-lg font-semibold group-hover:text-primary transition-colors">
                          {demo.title}
                        </h3>
                        <svg
                          className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </div>
                      <p className="text-muted-foreground mt-1 text-sm sm:text-base">
                        {demo.description}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Quick Links */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-8">
          <Link href="/intents/create">
            <Card className="hover:border-primary/30 transition-colors cursor-pointer">
              <CardContent className="p-3 sm:p-4 text-center">
                <p className="text-sm font-medium">New Intent</p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/intents">
            <Card className="hover:border-primary/30 transition-colors cursor-pointer">
              <CardContent className="p-3 sm:p-4 text-center">
                <p className="text-sm font-medium">My Intents</p>
              </CardContent>
            </Card>
          </Link>
          <Link href="/dashboard">
            <Card className="hover:border-primary/30 transition-colors cursor-pointer">
              <CardContent className="p-3 sm:p-4 text-center">
                <p className="text-sm font-medium">Dashboard</p>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Footer */}
        <Separator className="my-6" />
        <p className="text-xs sm:text-sm text-muted-foreground text-center">
          Built on Sui with DeepBook V3, Seal Encryption, and Nautilus TEE
        </p>
      </div>
    </div>
  );
}
