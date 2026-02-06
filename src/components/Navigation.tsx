"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { ConnectButton, useCurrentAccount } from "@mysten/dapp-kit";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";

const navigation = [
  { name: "Home", href: "/" },
  { name: "Trade", href: "/trade" },
  { name: "Indexer", href: "/indexer" },
];

function WalletStatus() {
  const { isAuthenticated, session } = useAuth();
  const dappKitAccount = useCurrentAccount();

  // Show zkLogin status if authenticated via zkLogin
  if (isAuthenticated && session?.zkLoginAddress) {
    return (
      <div className="flex items-center gap-3">
        <Badge
          variant="secondary"
          className="px-3 py-1.5 flex items-center gap-2"
        >
          <div className="w-2 h-2 bg-primary rounded-full" />
          <span className="text-primary text-xs font-medium">zkLogin</span>
          <span className="text-muted-foreground text-xs font-mono">
            {session.zkLoginAddress.slice(0, 6)}...
            {session.zkLoginAddress.slice(-4)}
          </span>
        </Badge>
        <Link
          href="/dashboard"
          className="px-3 py-1.5 bg-secondary hover:bg-secondary/80 rounded-lg text-sm text-secondary-foreground transition-colors"
        >
          Dashboard
        </Link>
      </div>
    );
  }

  // Show dapp-kit wallet if connected
  if (dappKitAccount) {
    return (
      <div className="flex items-center gap-3">
        <ConnectButton />
        <Link
          href="/dashboard"
          className="px-3 py-1.5 bg-primary/10 hover:bg-primary/20 border border-primary/30 rounded-lg text-sm text-primary transition-colors"
        >
          Dashboard
        </Link>
      </div>
    );
  }

  // Show both connection options
  return (
    <div className="flex items-center gap-2">
      <ConnectButton />
      <span className="text-muted-foreground text-sm hidden sm:inline">or</span>
      <Link
        href="/login"
        className="px-3 py-1.5 bg-primary hover:bg-primary/90 rounded-lg text-sm text-primary-foreground font-medium transition-colors"
      >
        Sign in
      </Link>
    </div>
  );
}

export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="bg-background border-b sticky top-0 z-50 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 justify-between">
          <div className="flex">
            <div className="flex shrink-0 items-center">
              <Link
                href="/"
                className="text-xl font-bold flex items-center gap-2"
              >
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                  <svg
                    className="w-4 h-4 text-primary-foreground"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                </div>
                <span className="hidden sm:inline">SuiTrader</span>
              </Link>
            </div>
            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    "inline-flex items-center border-b-2 px-1 pt-1 text-sm font-medium",
                    pathname === item.href ||
                      pathname.startsWith(item.href + "/")
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:border-muted-foreground hover:text-foreground",
                  )}
                >
                  {item.name}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center">
            <WalletStatus />
          </div>
        </div>
      </div>
    </nav>
  );
}
