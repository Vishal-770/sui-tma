"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MarketFilters } from "@/components/MarketFilters";
import { MarketStats } from "@/components/MarketStats";
import { useState } from "react";
import { PoolsCards } from "@/components/PoolsCards";

const IndexerPage = () => {
  const [currentNetwork, setCurrentNetwork] = useState<"testnet" | "mainnet">(
    "testnet",
  );
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
    <div className="container mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
          Deepbook Markets
        </h1>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
          Real-time trading pairs and market data from the Deepbook
          decentralized exchange
        </p>
      </div>

      {/* Market Statistics Overview */}
      <MarketStats network={currentNetwork} />

      {/* Network Tabs */}
      <Tabs
        value={currentNetwork}
        onValueChange={(value) =>
          setCurrentNetwork(value as "testnet" | "mainnet")
        }
        className="w-full"
      >
        <div className="flex justify-center mb-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="testnet" className="text-sm font-medium">
              Testnet
            </TabsTrigger>
            <TabsTrigger value="mainnet" className="text-sm font-medium">
              Mainnet
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Filters - Shared across both tabs */}
        <div className="mb-6">
          <MarketFilters filters={filters} onFiltersChange={setFilters} />
        </div>

        <TabsContent value="testnet" className="mt-6">
          <PoolsCards network="testnet" filters={filters} />
        </TabsContent>

        <TabsContent value="mainnet" className="mt-6">
          <PoolsCards network="mainnet" filters={filters} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default IndexerPage;
