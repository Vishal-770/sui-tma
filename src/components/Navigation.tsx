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
  Menu,
  X,
  Sparkles,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CURRENT_ENV } from "@/lib/deepbook";
import Image from "next/image";

const navigation = [
  { name: "Home", href: "/" },
  { name: "Trade", href: "/trade" },
  { name: "Agent", href: "/agent" },
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
      <div className="flex items-center gap-2.5">
        <Badge
          variant="outline"
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border-primary/20 bg-primary/5"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-chart-2 animate-pulse" />
          {CURRENT_ENV}
        </Badge>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="flex items-center gap-2 hover:bg-accent transition-all duration-200 shadow-sm hover:shadow-md"
            >
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                <Wallet className="w-4 h-4 text-primary" />
              </div>
              <div className="hidden sm:flex flex-col items-start gap-0.5">
                <span className="text-[10px] text-muted-foreground font-medium leading-none">
                  zkLogin
                </span>
                <span className="text-xs font-mono leading-none">
                  {session.zkLoginAddress.slice(0, 6)}...
                  {session.zkLoginAddress.slice(-4)}
                </span>
              </div>
              <Badge
                variant="secondary"
                className="ml-1 px-2 py-0.5 text-[11px] font-semibold"
              >
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
      <div className="flex items-center gap-2.5">
        <Badge
          variant="outline"
          className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border-primary/20 bg-primary/5"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-chart-2 animate-pulse" />
          {CURRENT_ENV}
        </Badge>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="flex items-center gap-2 hover:bg-accent transition-all duration-200 shadow-sm hover:shadow-md"
            >
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
                <Wallet className="w-4 h-4 text-primary" />
              </div>
              <div className="hidden sm:flex flex-col items-start gap-0.5">
                <span className="text-[10px] text-muted-foreground font-medium leading-none">
                  Wallet
                </span>
                <span className="text-xs font-mono leading-none">
                  {dappKitAccount.address.slice(0, 6)}...
                  {dappKitAccount.address.slice(-4)}
                </span>
              </div>
              <Badge
                variant="secondary"
                className="ml-1 px-2 py-0.5 text-[11px] font-semibold"
              >
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
    <div className="flex items-center gap-2.5">
      <div className="hidden sm:block">
        <ConnectButton />
      </div>
      <span className="text-muted-foreground text-xs hidden sm:inline font-medium">
        or
      </span>
      <Link
        href="/login"
        className="group relative px-4 py-2 bg-primary hover:bg-primary/90 rounded-lg text-sm text-primary-foreground font-semibold transition-all duration-200 shadow-sm hover:shadow-md overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
        <span className="relative flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" />
          Sign in
        </span>
      </Link>
    </div>
  );
}

export function Navigation() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="bg-background/80 border-b sticky top-0 z-50 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 justify-between items-center">
          {/* Logo Section */}
          <div className="flex items-center gap-8">
            <Link
              href="/"
              className="flex items-center gap-2.5 group transition-all duration-300 hover:opacity-80"
            >
              <div className="w-9 h-9 flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
                <Image
                  src="/logo-tma.png"
                  alt="Abyss Protocol Logo"
                  width={36}
                  height={36}
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="flex flex-col">
                <span className="hidden sm:inline text-lg font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                  Abyss Protocol
                </span>
                <span className="hidden sm:inline text-[10px] text-muted-foreground font-medium -mt-1">
                  Dive into DeepBook
                </span>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center gap-1">
              {navigation.map((item) => {
                const isActive =
                  pathname === item.href ||
                  pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      "relative px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200",
                      isActive
                        ? "text-primary bg-primary/10"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent",
                    )}
                  >
                    {item.name}
                    {isActive && (
                      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/2 h-0.5 bg-primary rounded-full" />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Right Section */}
          <div className="flex items-center gap-3">
            <WalletStatus />

            {/* Mobile menu button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden inline-flex items-center justify-center p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5" />
              ) : (
                <Menu className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t animate-in slide-in-from-top-2 duration-200">
            <div className="flex flex-col gap-1">
              {navigation.map((item) => {
                const isActive =
                  pathname === item.href ||
                  pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      "px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200",
                      isActive
                        ? "text-primary bg-primary/10"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent",
                    )}
                  >
                    {item.name}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
