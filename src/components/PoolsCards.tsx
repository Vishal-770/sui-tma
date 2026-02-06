"use client";

import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { MarketFiltersType } from "@/components/MarketFilters";
import { useState, useEffect, useMemo } from "react";
import { Activity } from "lucide-react";
import { PoolCard } from "@/components/PoolCard";

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

interface PoolsTableProps {
  network: "testnet" | "mainnet";
  filters: MarketFiltersType;
}

export function PoolsCards({ network, filters }: PoolsTableProps) {
  const {
    data: marketData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["marketData", network],
    queryFn: () => fetchMarketData(network),
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  const filteredAndSortedData = useMemo(() => {
    if (!marketData) return [];

    let filtered = marketData.filter((market) => {
      // Search filter
      if (filters.search) {
        const searchTerm = filters.search.toLowerCase();
        const pair = `${market.baseSymbol}/${market.quoteSymbol}`.toLowerCase();
        const name = market.poolName.toLowerCase();
        if (!pair.includes(searchTerm) && !name.includes(searchTerm)) {
          return false;
        }
      }

      // Volume filter
      if (
        market.quoteVolume24h < filters.minVolume ||
        market.quoteVolume24h > filters.maxVolume
      ) {
        return false;
      }

      // Price change filter
      if (filters.priceChangeFilter !== "all") {
        const isPositive = market.priceChange24h >= 0;
        switch (filters.priceChangeFilter) {
          case "positive":
            if (!isPositive) return false;
            break;
          case "negative":
            if (isPositive) return false;
            break;
          case "gainers":
            if (market.priceChange24h <= 0) return false;
            break;
          case "losers":
            if (market.priceChange24h >= 0) return false;
            break;
        }
      }

      // Base currencies filter
      if (filters.baseCurrencies.length > 0) {
        if (!filters.baseCurrencies.includes(market.baseSymbol)) {
          return false;
        }
      }

      // Quote currencies filter
      if (filters.quoteCurrencies.length > 0) {
        if (!filters.quoteCurrencies.includes(market.quoteSymbol)) {
          return false;
        }
      }

      // Show frozen filter
      if (!filters.showFrozen && market.isFrozen) {
        return false;
      }

      return true;
    });

    // Sort
    filtered.sort((a, b) => {
      let aValue: number | string;
      let bValue: number | string;

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
        case "name":
          aValue = `${a.baseSymbol}/${a.quoteSymbol}`;
          bValue = `${b.baseSymbol}/${b.quoteSymbol}`;
          break;
        default:
          return 0;
      }

      if (typeof aValue === "string" && typeof bValue === "string") {
        return filters.sortOrder === "asc"
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      }

      const numA = aValue as number;
      const numB = bValue as number;

      return filters.sortOrder === "asc" ? numA - numB : numB - numA;
    });

    return filtered;
  }, [marketData, filters]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Activity className="h-6 w-6 animate-spin" />
        <span className="ml-2">Loading market data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-destructive">
        Error loading market data. Please try again later.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {filteredAndSortedData.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No pools match the current filters.
        </div>
      ) : (
        <div className=" flex flex-col space-y-8">
          {filteredAndSortedData.map((market) => (
            <PoolCard key={market.poolId} market={market} />
          ))}
        </div>
      )}
    </div>
  );
}
