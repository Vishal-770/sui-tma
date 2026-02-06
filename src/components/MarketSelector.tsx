"use client";

import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Separator } from "@/components/ui/separator";
import { MarketFiltersType } from "@/components/MarketFilters";
import { useState, useEffect, useMemo } from "react";
import { Activity } from "lucide-react";

function ValueChange({
  value,
  className = "",
  duration = 300,
}: {
  value: string | number;
  className?: string;
  duration?: number;
}) {
  const [displayValue, setDisplayValue] = useState(value);
  const [isChanging, setIsChanging] = useState(false);

  useEffect(() => {
    if (value !== displayValue) {
      setIsChanging(true);
      const timer = setTimeout(() => {
        setDisplayValue(value);
        setIsChanging(false);
      }, duration / 2);

      return () => clearTimeout(timer);
    }
  }, [value, displayValue, duration]);

  return (
    <span
      className={`transition-all duration-${duration} ${
        isChanging ? "text-primary scale-105" : ""
      } ${className}`}
    >
      {displayValue}
    </span>
  );
}

interface PoolData {
  pool_id: string;
  pool_name: string;
  base_asset_id: string;
  base_asset_decimals: number;
  base_asset_symbol: string;
  base_asset_name: string;
  quote_asset_id: string;
  quote_asset_decimals: number;
  quote_asset_symbol: string;
  quote_asset_name: string;
  min_size: number;
  lot_size: number;
  tick_size: number;
}

interface TickerData {
  [key: string]: {
    last_price: number;
    base_volume: number;
    quote_volume: number;
    isFrozen: number;
  };
}

interface SummaryData {
  trading_pairs: string;
  base_currency: string;
  quote_currency: string;
  last_price: number;
  lowest_price_24h: number;
  highest_price_24h: number;
  lowest_ask: number;
  highest_bid: number;
  base_volume: number;
  quote_volume: number;
  price_change_percent_24h: number;
}

interface CombinedMarketData {
  poolId: string;
  poolName: string;
  baseSymbol: string;
  quoteSymbol: string;
  baseName: string;
  quoteName: string;
  baseDecimals: number;
  quoteDecimals: number;
  lastPrice: number;
  baseVolume24h: number;
  quoteVolume24h: number;
  isFrozen: boolean;
  priceChange24h: number;
  low24h: number;
  high24h: number;
  bestAsk: number;
  bestBid: number;
  spread: number;
  spreadPercent: number;
  minSize: number;
  lotSize: number;
  tickSize: number;
}

async function fetchMarketData(
  network: "testnet" | "mainnet",
): Promise<CombinedMarketData[]> {
  const BASE_URL =
    network === "mainnet"
      ? "https://deepbook-indexer.mainnet.mystenlabs.com"
      : "https://deepbook-indexer.testnet.mystenlabs.com";

  try {
    const [poolsRes, tickerRes, summaryRes] = await Promise.all([
      axios.get(`${BASE_URL}/get_pools`),
      axios.get(`${BASE_URL}/ticker`),
      axios.get(`${BASE_URL}/summary`),
    ]);

    const pools: PoolData[] = poolsRes.data;
    const ticker: TickerData = tickerRes.data;
    const summary: SummaryData[] = summaryRes.data;

    // Create lookup map for summary data
    const summaryMap: { [key: string]: SummaryData } = {};
    summary.forEach((item) => {
      summaryMap[item.trading_pairs] = item;
    });

    // Combine all data
    const marketData: CombinedMarketData[] = pools.map((pool) => {
      const poolName = pool.pool_name;
      const tickerInfo = ticker[poolName] || {};
      const summaryInfo = summaryMap[poolName] || {};

      return {
        poolId: pool.pool_id,
        poolName: pool.pool_name,
        baseSymbol: pool.base_asset_symbol,
        quoteSymbol: pool.quote_asset_symbol,
        baseName: pool.base_asset_name,
        quoteName: pool.quote_asset_name,
        baseDecimals: pool.base_asset_decimals,
        quoteDecimals: pool.quote_asset_decimals,
        lastPrice: tickerInfo.last_price || 0,
        baseVolume24h: tickerInfo.base_volume || 0,
        quoteVolume24h: tickerInfo.quote_volume || 0,
        isFrozen: tickerInfo.isFrozen === 1,
        priceChange24h: summaryInfo.price_change_percent_24h || 0,
        low24h: summaryInfo.lowest_price_24h || 0,
        high24h: summaryInfo.highest_price_24h || 0,
        bestAsk: summaryInfo.lowest_ask || 0,
        bestBid: summaryInfo.highest_bid || 0,
        spread:
          summaryInfo.lowest_ask && summaryInfo.highest_bid
            ? summaryInfo.lowest_ask - summaryInfo.highest_bid
            : 0,
        spreadPercent:
          summaryInfo.lowest_ask && summaryInfo.highest_bid
            ? ((summaryInfo.lowest_ask - summaryInfo.highest_bid) /
                summaryInfo.highest_bid) *
              100
            : 0,
        minSize: pool.min_size,
        lotSize: pool.lot_size,
        tickSize: pool.tick_size,
      };
    });

    return marketData;
  } catch (error) {
    console.error("Error fetching market data:", error);
    throw error;
  }
}

function formatNumber(num: number): string {
  if (num >= 1e9) return (num / 1e9).toFixed(2) + "B";
  if (num >= 1e6) return (num / 1e6).toFixed(2) + "M";
  if (num >= 1e3) return (num / 1e3).toFixed(2) + "K";
  return num.toFixed(4);
}

function formatPriceChange(change: number): {
  value: string;
  isPositive: boolean;
} {
  const percent = (change * 100).toFixed(2);
  return {
    value: `${change >= 0 ? "+" : ""}${percent}%`,
    isPositive: change >= 0,
  };
}

interface MarketCardProps {
  market: CombinedMarketData;
  isUpdating?: boolean;
}

function MarketCard({ market, isUpdating = false }: MarketCardProps) {
  const priceChange = formatPriceChange(market.priceChange24h);

  return (
    <Card
      className={`transition-all duration-200 hover:shadow-md ${
        market.isFrozen ? "opacity-60 border-destructive/20" : ""
      } ${isUpdating ? "ring-1 ring-primary/20" : ""}`}
    >
      <Accordion type="single" collapsible>
        <AccordionItem value={market.poolId} className="border-none">
          <AccordionTrigger className="px-6 py-4 hover:no-underline hover:bg-muted/50">
            {/* Grid layout with headers for consistent alignment across all cards */}
            <div className="w-full">
              {/* Column headers */}
              <div className="grid grid-cols-12 gap-4 mb-2 text-xs text-muted-foreground font-medium">
                <div className="col-span-3">Trading Pair</div>
                <div className="col-span-2 text-right">Price</div>
                <div className="col-span-1 text-right">24h Change</div>
                <div className="col-span-2 text-right">24h Volume</div>
                <div className="col-span-2 text-right">Spread</div>
                <div className="col-span-2 text-right">24h Range</div>
              </div>

              {/* Data row */}
              <div className="grid grid-cols-12 gap-4 items-center text-sm">
                {/* Column 1-3: Trading Pair */}
                <div className="col-span-3 flex items-center gap-2">
                  <div className="flex flex-col items-start min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-base truncate">
                        {market.baseSymbol}/{market.quoteSymbol}
                      </span>
                      {market.isFrozen && (
                        <Badge
                          variant="destructive"
                          className="text-xs px-1.5 py-0.5 shrink-0"
                        >
                          FROZEN
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground truncate max-w-full">
                      {market.poolName}
                    </span>
                  </div>
                </div>

                {/* Column 4-5: Current Price */}
                <div className="col-span-2 flex flex-col items-end">
                  <ValueChange
                    value={`$${market.lastPrice.toFixed(4)}`}
                    className="font-bold text-base"
                  />
                </div>

                {/* Column 6: 24h Change */}
                <div className="col-span-1 flex flex-col items-end">
                  <ValueChange
                    value={priceChange.value}
                    className={`font-medium ${priceChange.isPositive ? "text-green-600" : "text-red-600"}`}
                  />
                </div>

                {/* Column 7-8: 24h Volume */}
                <div className="col-span-2 flex flex-col items-end">
                  <ValueChange
                    value={`$${formatNumber(market.quoteVolume24h)}`}
                    className="font-medium"
                  />
                </div>

                {/* Column 9-10: Spread */}
                <div className="col-span-2 flex flex-col items-end">
                  <ValueChange
                    value={`${market.spreadPercent.toFixed(2)}%`}
                    className="font-medium"
                  />
                </div>

                {/* Column 11-12: 24h Range */}
                <div className="col-span-2 flex flex-col items-end">
                  <ValueChange
                    value={`$${market.low24h.toFixed(2)}-${market.high24h.toFixed(2)}`}
                    className="font-medium text-xs"
                  />
                </div>
              </div>
            </div>
          </AccordionTrigger>

          <AccordionContent className="px-6 pb-6">
            <Separator className="mb-6" />

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Detailed Price Info */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm text-foreground border-b pb-2">
                  Detailed Price
                </h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">
                      Current
                    </span>
                    <ValueChange
                      value={`$${market.lastPrice.toFixed(6)}`}
                      className="text-sm font-medium"
                    />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">
                      24h High
                    </span>
                    <ValueChange
                      value={`$${market.high24h.toFixed(6)}`}
                      className="text-sm font-medium text-green-600"
                    />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">
                      24h Low
                    </span>
                    <ValueChange
                      value={`$${market.low24h.toFixed(6)}`}
                      className="text-sm font-medium text-red-600"
                    />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">
                      Change
                    </span>
                    <ValueChange
                      value={priceChange.value}
                      className={`text-sm font-medium ${priceChange.isPositive ? "text-green-600" : "text-red-600"}`}
                    />
                  </div>
                </div>
              </div>

              {/* Order Book Details */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm text-foreground border-b pb-2">
                  Order Book
                </h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">
                      Best Bid
                    </span>
                    <ValueChange
                      value={`$${market.bestBid.toFixed(6)}`}
                      className="text-sm font-medium text-green-600"
                    />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">
                      Best Ask
                    </span>
                    <ValueChange
                      value={`$${market.bestAsk.toFixed(6)}`}
                      className="text-sm font-medium text-red-600"
                    />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">
                      Spread
                    </span>
                    <ValueChange
                      value={`$${market.spread.toFixed(6)}`}
                      className="text-sm font-medium"
                    />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">
                      Spread %
                    </span>
                    <ValueChange
                      value={`${market.spreadPercent.toFixed(4)}%`}
                      className="text-sm font-medium"
                    />
                  </div>
                </div>
              </div>

              {/* Trading Rules */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm text-foreground border-b pb-2">
                  Trading Rules
                </h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">
                      Min Size
                    </span>
                    <span className="text-sm font-medium">
                      {formatNumber(market.minSize)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">
                      Lot Size
                    </span>
                    <span className="text-sm font-medium">
                      {formatNumber(market.lotSize)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">
                      Tick Size
                    </span>
                    <span className="text-sm font-medium">
                      {formatNumber(market.tickSize)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Asset Information & Pool ID */}
            <div className="mt-6 pt-6 border-t">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold text-sm text-foreground mb-3">
                    Assets
                  </h4>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-medium text-xs">
                        {market.baseSymbol}
                      </Badge>
                      <span className="text-sm truncate">
                        {market.baseName}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-medium text-xs">
                        {market.quoteSymbol}
                      </Badge>
                      <span className="text-sm truncate">
                        {market.quoteName}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Decimals: {market.baseDecimals} / {market.quoteDecimals}
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-sm text-foreground mb-3">
                    Pool ID
                  </h4>
                  <div className="text-xs font-mono bg-muted p-3 rounded break-all">
                    {market.poolId}
                  </div>
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </Card>
  );
}

interface MarketSelectorProps {
  network: "testnet" | "mainnet";
  filters?: MarketFiltersType;
}

export function MarketSelector({ network, filters }: MarketSelectorProps) {
  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ["markets", network],
    queryFn: () => fetchMarketData(network),
    refetchInterval: 3000, // Refetch every 3 seconds for real-time feel
    staleTime: 2000, // Consider data stale after 2 seconds
  });

  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Update last updated timestamp when data changes
  useEffect(() => {
    if (data) {
      setLastUpdated(new Date());
    }
  }, [data]);

  // Apply filters and sorting
  const filteredAndSortedData = useMemo(() => {
    if (!data) return [];

    let filtered = data.filter((market) => {
      // Search filter
      if (filters?.search) {
        const searchTerm = filters.search.toLowerCase();
        const matchesSearch =
          market.baseSymbol.toLowerCase().includes(searchTerm) ||
          market.quoteSymbol.toLowerCase().includes(searchTerm) ||
          market.poolName.toLowerCase().includes(searchTerm) ||
          market.baseName.toLowerCase().includes(searchTerm) ||
          market.quoteName.toLowerCase().includes(searchTerm);
        if (!matchesSearch) return false;
      }

      // Frozen markets filter
      if (!filters?.showFrozen && market.isFrozen) return false;

      // Volume range filter
      if (filters?.minVolume && market.quoteVolume24h < filters.minVolume)
        return false;
      if (filters?.maxVolume && market.quoteVolume24h > filters.maxVolume)
        return false;

      // Price change filter
      if (filters?.priceChangeFilter) {
        switch (filters.priceChangeFilter) {
          case "positive":
            if (market.priceChange24h <= 0) return false;
            break;
          case "negative":
            if (market.priceChange24h >= 0) return false;
            break;
          case "gainers":
            // Top 10 gainers
            break;
          case "losers":
            // Top 10 losers
            break;
        }
      }

      // Base currency filter
      if (filters?.baseCurrencies && filters.baseCurrencies.length > 0) {
        if (!filters.baseCurrencies.includes(market.baseSymbol)) return false;
      }

      // Quote currency filter
      if (filters?.quoteCurrencies && filters.quoteCurrencies.length > 0) {
        if (!filters.quoteCurrencies.includes(market.quoteSymbol)) return false;
      }

      return true;
    });

    // Apply sorting
    if (filters?.sortBy) {
      filtered.sort((a, b) => {
        let aValue: number, bValue: number;

        switch (filters.sortBy) {
          case "volume":
            aValue = a.quoteVolume24h;
            bValue = b.quoteVolume24h;
            break;
          case "price":
            aValue = a.lastPrice;
            bValue = b.lastPrice;
            break;
          case "change":
            aValue = a.priceChange24h;
            bValue = b.priceChange24h;
            break;
          default:
            return 0;
        }

        if (filters.sortOrder === "asc") {
          return aValue - bValue;
        } else {
          return bValue - aValue;
        }
      });
    }

    // Special handling for gainers/losers
    if (filters?.priceChangeFilter === "gainers") {
      filtered = filtered
        .sort((a, b) => b.priceChange24h - a.priceChange24h)
        .slice(0, 10);
    } else if (filters?.priceChangeFilter === "losers") {
      filtered = filtered
        .sort((a, b) => a.priceChange24h - b.priceChange24h)
        .slice(0, 10);
    }

    return filtered;
  }, [data, filters]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">
            Loading {network} markets...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center text-destructive">
          <p className="text-sm">Failed to load markets</p>
          <p className="text-xs text-muted-foreground mt-1">
            {error instanceof Error ? error.message : "Unknown error"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Live update indicator and market status */}
      <div className="flex items-center justify-between px-1 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${isFetching ? "bg-green-500 animate-pulse" : "bg-green-400"}`}
            />
            <span className="text-xs text-muted-foreground">
              Live • {network}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Activity className="h-3 w-3" />
            {filteredAndSortedData?.length || 0} markets
          </div>
        </div>
        {lastUpdated && (
          <span className="text-xs text-muted-foreground">
            Updated {lastUpdated.toLocaleTimeString()}
          </span>
        )}
      </div>

      {filteredAndSortedData && filteredAndSortedData.length > 0 ? (
        filteredAndSortedData.map((market) => (
          <MarketCard
            key={market.poolId}
            market={market}
            isUpdating={isFetching}
          />
        ))
      ) : (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            {data && data.length > 0
              ? "No markets match your filters"
              : "No markets found on " + network}
          </p>
        </div>
      )}
    </div>
  );
}
