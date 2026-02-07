"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  ConnectButton,
  useCurrentAccount,
  useSuiClient,
} from "@mysten/dapp-kit";
import { useAuth } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Wallet,
  Copy,
  ExternalLink,
  LogOut,
  User,
  Network,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CURRENT_ENV } from "@/lib/deepbook";
import Image from "next/image";

const navigation = [
  { name: "Home", href: "/" },
  { name: "Trade", href: "/trade" },
  { name: "Indexer", href: "/indexer" },
];

function WalletStatus() {
  const { isAuthenticated, session, logout } = useAuth();
  const dappKitAccount = useCurrentAccount();
  const suiClient = useSuiClient();
  const router = useRouter();
  const [balance, setBalance] = useState<string>("0");
  const [copied, setCopied] = useState(false);

  const activeAddress = dappKitAccount?.address || session?.zkLoginAddress;

  useEffect(() => {
    if (activeAddress) {
      suiClient
        .getBalance({ owner: activeAddress, coinType: "0x2::sui::SUI" })
        .then((res) => {
          const suiBalance = (Number(res.totalBalance) / 1_000_000_000).toFixed(
            4,
          );
          setBalance(suiBalance);
        })
        .catch(() => setBalance("0"));
    }
  }, [activeAddress, suiClient]);

  const copyAddress = () => {
    if (activeAddress) {
      navigator.clipboard.writeText(activeAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleLogout = () => {
    if (logout) {
      logout();
      router.push("/");
    }
  };

  // Show zkLogin status if authenticated via zkLogin
  if (isAuthenticated && session?.zkLoginAddress) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="px-2 py-1 text-xs">
          <Network className="w-3 h-3 mr-1" />
          {CURRENT_ENV}
        </Badge>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="flex items-center gap-2">
              <Wallet className="w-4 h-4" />
              <span className="hidden sm:inline text-xs font-mono">
                {session.zkLoginAddress.slice(0, 6)}...
                {session.zkLoginAddress.slice(-4)}
              </span>
              <Badge variant="secondary" className="ml-1 px-1.5 py-0.5 text-xs">
                {balance} SUI
              </Badge>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Account</span>
              <Badge variant="outline" className="text-xs">
                zkLogin
              </Badge>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={copyAddress} className="cursor-pointer">
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
                href={`https://suiscan.xyz/${CURRENT_ENV}/account/${session.zkLoginAddress}`}
                target="_blank"
                rel="noopener noreferrer"
                className="cursor-pointer"
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                View on Explorer
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              className="cursor-pointer text-destructive"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  // Show dapp-kit wallet if connected
  if (dappKitAccount) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="px-2 py-1 text-xs">
          <Network className="w-3 h-3 mr-1" />
          {CURRENT_ENV}
        </Badge>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="flex items-center gap-2">
              <Wallet className="w-4 h-4" />
              <span className="hidden sm:inline text-xs font-mono">
                {dappKitAccount.address.slice(0, 6)}...
                {dappKitAccount.address.slice(-4)}
              </span>
              <Badge variant="secondary" className="ml-1 px-1.5 py-0.5 text-xs">
                {balance} SUI
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
            <DropdownMenuItem onClick={copyAddress} className="cursor-pointer">
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
              <Link href="/trade/balance-manager" className="cursor-pointer">
                <Wallet className="w-4 h-4 mr-2" />
                Balance Manager
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a
                href={`https://suiscan.xyz/${CURRENT_ENV}/account/${dappKitAccount.address}`}
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
                <div className="w-8 h-8 flex items-center justify-center">
                  <Image
                    src="/logo-tma.png"
                    alt="SuiTrader Logo"
                    width={32}
                    height={32}
                    className="w-full h-full object-contain"
                  />
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
