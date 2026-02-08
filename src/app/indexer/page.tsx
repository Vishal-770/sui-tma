"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MarketFilters } from "@/components/MarketFilters";
import { MarketStats } from "@/components/MarketStats";
import { useState } from "react";
import { PoolsCards } from "@/components/PoolsCards";
import { AssetsTable } from "@/components/AssetsTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";

const IndexerPage = () => {
  const [currentNetwork, setCurrentNetwork] = useState<"testnet" | "mainnet">(
    "testnet",
  );
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [currentView, setCurrentView] = useState<"markets" | "assets">(
    "markets",
  );
  const [assetSearch, setAssetSearch] = useState("");
  const [filters, setFilters] = useState({
    search: "",
    sortBy: "volume" as "volume" | "price" | "change" | "name",
    sortOrder: "desc" as "asc" | "desc",
    minVolume: 0,
    maxVolume: 10000000,
    priceChangeFilter: "all" as
      | "all"
      | "positive"
      | "negative"
      | "gainers"
      | "losers",
    baseCurrencies: [] as string[],
    quoteCurrencies: [] as string[],
    showFrozen: true,
  });

  return (
    <div className="flex min-h-screen">
      {/* Fixed Sidebar */}
      <aside
        className={`${
          sidebarOpen ? "w-80" : "w-0"
        } border-r border-border bg-card fixed left-0 top-0 h-screen z-10 transition-all duration-300 overflow-hidden`}
      >
        <div className="h-full overflow-y-auto scrollbar-hide">
          <div className="p-6 pt-24 space-y-6">
            {/* Network Selection */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold uppercase text-muted-foreground">
                Network
              </h3>
              <Tabs
                value={currentNetwork}
                onValueChange={(value) =>
                  setCurrentNetwork(value as "testnet" | "mainnet")
                }
                className="w-full"
              >
                <TabsList className="grid w-full grid-cols-2 h-10">
                  <TabsTrigger value="testnet" className="text-xs font-medium">
                    Testnet
                  </TabsTrigger>
                  <TabsTrigger value="mainnet" className="text-xs font-medium">
                    Mainnet
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* View Selection */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold uppercase text-muted-foreground">
                View
              </h3>
              <Tabs
                value={currentView}
                onValueChange={(value) =>
                  setCurrentView(value as "markets" | "assets")
                }
                className="w-full"
              >
                <TabsList className="grid w-full grid-cols-2 h-10">
                  <TabsTrigger value="markets" className="text-xs font-medium">
                    Markets
                  </TabsTrigger>
                  <TabsTrigger value="assets" className="text-xs font-medium">
                    Assets
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            {/* Market Stats */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold uppercase text-muted-foreground">
                Market Overview
              </h3>
              <MarketStats network={currentNetwork} />
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main
        className={`flex-1 transition-all duration-300 ${
          sidebarOpen ? "ml-80" : "ml-0"
        }`}
      >
        <div className="container mx-auto px-4 py-8 space-y-6">
          {/* Header with Collapse Button */}
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="hover:bg-accent transition-colors"
            >
              {sidebarOpen ? (
                <PanelLeftClose className="h-4 w-4" />
              ) : (
                <PanelLeftOpen className="h-4 w-4" />
              )}
            </Button>

            <div className="text-center flex-1">
              <h1 className="text-4xl font-bold bg-linear-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                {currentView === "markets"
                  ? "Marlin Pool Explorer"
                  : "Marlin Asset Scanner"}
              </h1>
              <p className="text-muted-foreground text-sm mt-1">
                {currentView === "markets"
                  ? "Lightning-fast market data from DeepBook V3"
                  : "Real-time asset tracking and liquidity analysis"}
              </p>
            </div>

            <div className="w-10"></div>
          </div>

          {/* Content based on view */}
          {currentView === "markets" ? (
            <>
              {/* Filters */}
              <div className="space-y-4">
                <MarketFilters filters={filters} onFiltersChange={setFilters} />
              </div>

              {/* Markets Table */}
              <Tabs value={currentNetwork} className="w-full">
                <TabsContent value="testnet" className="mt-0">
                  <PoolsCards network="testnet" filters={filters} />
                </TabsContent>

                <TabsContent value="mainnet" className="mt-0">
                  <PoolsCards network="mainnet" filters={filters} />
                </TabsContent>
              </Tabs>
            </>
          ) : (
            <>
              {/* Assets Search */}
              <div className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search assets by symbol, name, or contract address..."
                    value={assetSearch}
                    onChange={(e) => setAssetSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Assets Table */}
              <Tabs value={currentNetwork} className="w-full">
                <TabsContent value="testnet" className="mt-0">
                  <AssetsTable network="testnet" searchQuery={assetSearch} />
                </TabsContent>

                <TabsContent value="mainnet" className="mt-0">
                  <AssetsTable network="mainnet" searchQuery={assetSearch} />
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default IndexerPage;
