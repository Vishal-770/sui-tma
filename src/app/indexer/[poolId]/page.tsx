"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState, useEffect } from "react";

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

async function fetchPoolDetails(
  poolId: string,
  network: "testnet" | "mainnet",
): Promise<CombinedMarketData | null> {
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

    const pool = pools.find((p) => p.pool_id === poolId);
    if (!pool) return null;

    // Create lookup map for summary data
    const summaryMap: { [key: string]: SummaryData } = {};
    summary.forEach((item) => {
      summaryMap[item.trading_pairs] = item;
    });

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
  } catch (error) {
    console.error("Error fetching pool details:", error);
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

export default function PoolDetailsPage() {
  const params = useParams();
  const poolId = params.poolId as string;
  const [network, setNetwork] = useState<"testnet" | "mainnet">("testnet");

  const {
    data: pool,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["poolDetails", poolId, network],
    queryFn: () => fetchPoolDetails(poolId, network),
    enabled: !!poolId,
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
    
        <div className="container mx-auto px-4 py-6">
          <div className="flex items-center justify-center py-8">
            Loading pool details...
          </div>
        </div>
      
    );
  }

  if (error || !pool) {
    return (
     
        <div className="container mx-auto px-4 py-6">
          <div className="text-center py-8 text-destructive">
            Pool not found or error loading data.
          </div>
        </div>
    );
  }

  const priceChange = formatPriceChange(pool.priceChange24h);

  return (
   
      <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/indexer">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Markets
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">
              {pool.baseSymbol}/{pool.quoteSymbol}
            </h1>
            <p className="text-muted-foreground">{pool.poolName}</p>
          </div>
        </div>

        {/* Network Selector */}
        <div className="flex gap-2">
          <Button
            variant={network === "testnet" ? "default" : "outline"}
            onClick={() => setNetwork("testnet")}
          >
            Testnet
          </Button>
          <Button
            variant={network === "mainnet" ? "default" : "outline"}
            onClick={() => setNetwork("mainnet")}
          >
            Mainnet
          </Button>
        </div>

        {/* Pool Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Pool Status
              <Badge variant={pool.isFrozen ? "destructive" : "default"}>
                {pool.isFrozen ? "🔴 Frozen" : "🟢 Active"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Current Price</p>
                <p className="text-2xl font-bold font-mono">
                  {pool.lastPrice.toFixed(6)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">24h Change</p>
                <p
                  className={`text-2xl font-bold ${
                    priceChange.isPositive ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {priceChange.value}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">24h Volume</p>
                <p className="text-2xl font-bold">
                  {formatNumber(pool.quoteVolume24h)} {pool.quoteSymbol}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Spread</p>
                <p className="text-2xl font-bold font-mono">
                  {pool.spreadPercent.toFixed(2)}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Price Information */}
        <Card>
          <CardHeader>
            <CardTitle>Price Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">24h High</span>
                  <span className="font-mono font-medium text-green-600">
                    {pool.high24h.toFixed(6)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">24h Low</span>
                  <span className="font-mono font-medium text-red-600">
                    {pool.low24h.toFixed(6)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Best Bid</span>
                  <span className="font-mono font-medium">
                    {pool.bestBid.toFixed(6)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Best Ask</span>
                  <span className="font-mono font-medium">
                    {pool.bestAsk.toFixed(6)}
                  </span>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Base Volume 24h</span>
                  <span className="font-mono font-medium">
                    {formatNumber(pool.baseVolume24h)} {pool.baseSymbol}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Quote Volume 24h
                  </span>
                  <span className="font-mono font-medium">
                    {formatNumber(pool.quoteVolume24h)} {pool.quoteSymbol}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Spread Amount</span>
                  <span className="font-mono font-medium">
                    {pool.spread.toFixed(6)}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pool Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>Pool Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Base Asset</span>
                  <span className="font-medium">
                    {pool.baseName} ({pool.baseSymbol})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Quote Asset</span>
                  <span className="font-medium">
                    {pool.quoteName} ({pool.quoteSymbol})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Base Decimals</span>
                  <span className="font-mono font-medium">
                    {pool.baseDecimals}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Quote Decimals</span>
                  <span className="font-mono font-medium">
                    {pool.quoteDecimals}
                  </span>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Min Size</span>
                  <span className="font-mono font-medium">{pool.minSize}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Lot Size</span>
                  <span className="font-mono font-medium">{pool.lotSize}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tick Size</span>
                  <span className="font-mono font-medium">{pool.tickSize}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pool ID</span>
                  <span className="font-mono font-medium text-xs">
                    {pool.poolId}
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
   
  );
}
