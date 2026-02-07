"use client";

import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import { CandleChart } from "@/components/CandleChart";
import { OrderUpdates } from "@/components/OrderUpdates";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader } from "lucide-react";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

interface OHLCVData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface OHLCVResponse {
  candles: [number, number, number, number, number, number][];
}

type IntervalType = "1m" | "5m" | "15m" | "1h" | "4h" | "1d";

async function fetchOHLCVData(
  poolName: string,
  interval: IntervalType,
): Promise<OHLCVData[]> {
  const BASE_URL = "https://deepbook-indexer.testnet.mystenlabs.com";

  try {
    const response = await axios.get<OHLCVResponse>(
      `${BASE_URL}/ohclv/${poolName}?interval=${interval}`,
    );

    return response.data.candles.map(
      ([timestamp, open, high, low, close, volume]) => ({
        time: Math.floor(timestamp / 1000),
        open,
        high,
        low,
        close,
      }),
    );
  } catch (error) {
    console.error("Error fetching OHLCV data:", error);
    return [];
  }
}

async function fetchPoolDetails(
  poolId: string,
): Promise<CombinedMarketData | null> {
  const BASE_URL = "https://deepbook-indexer.testnet.mystenlabs.com";

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

export default function TestnetPoolDetailsPage() {
  const params = useParams();
  const poolId = params.poolId as string;
  const [interval, setInterval] = useState<IntervalType>("1h");

  const {
    data: pool,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["poolDetails", "testnet", poolId],
    queryFn: () => fetchPoolDetails(poolId),
    enabled: !!poolId,
    refetchInterval: 30000,
  });

  const { data: ohlcvData, isLoading: isLoadingChart } = useQuery({
    queryKey: ["ohlcv", "testnet", pool?.poolName, interval],
    queryFn: () => fetchOHLCVData(pool!.poolName, interval),
    enabled: !!pool?.poolName,
    refetchInterval: 60000,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex items-center justify-center">
          <Loader className="h-6 w-6 animate-spin" />
          <span className="ml-2">Loading pool details...</span>
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
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">
              {pool.baseSymbol}/{pool.quoteSymbol}
            </h1>
            <Badge variant="secondary">Testnet</Badge>
          </div>
          <p className="text-muted-foreground">{pool.poolName}</p>
        </div>
      </div>

      {/* Candlestick Chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Price Chart</CardTitle>
            <Tabs
              value={interval}
              onValueChange={(v) => setInterval(v as IntervalType)}
            >
              <TabsList>
                <TabsTrigger value="1m">1m</TabsTrigger>
                <TabsTrigger value="5m">5m</TabsTrigger>
                <TabsTrigger value="15m">15m</TabsTrigger>
                <TabsTrigger value="1h">1h</TabsTrigger>
                <TabsTrigger value="4h">4h</TabsTrigger>
                <TabsTrigger value="1d">1d</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingChart ? (
            <div className="flex items-center justify-center h-[400px]">
              <Loader className="h-6 w-6 animate-spin" />
              <span className="ml-2">Loading chart data...</span>
            </div>
          ) : ohlcvData && ohlcvData.length > 0 ? (
            <CandleChart candles={ohlcvData} height={400} />
          ) : (
            <div className="flex items-center justify-center h-[400px] text-muted-foreground">
              No chart data available
            </div>
          )}
        </CardContent>
      </Card>

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
                  priceChange.isPositive ? "text-chart-2" : "text-destructive"
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
                <span className="font-mono font-medium text-chart-2">
                  {pool.high24h.toFixed(6)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">24h Low</span>
                <span className="font-mono font-medium text-destructive">
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
                <span className="text-muted-foreground">Quote Volume 24h</span>
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
                <span className="font-mono font-medium text-xs break-all">
                  {pool.poolId}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Order Updates */}
      <OrderUpdates poolName={pool.poolName} network="testnet" />
    </div>
  );
}
