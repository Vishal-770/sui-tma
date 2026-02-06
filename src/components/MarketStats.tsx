"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  TrendingDown,
  Volume2,
  Activity,
  DollarSign,
  BarChart3,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

interface MarketOverviewData {
  totalMarkets: number;
  totalVolume24h: number;
  topGainer: {
    pair: string;
    change: number;
  } | null;
  topLoser: {
    pair: string;
    change: number;
  } | null;
  activeMarkets: number;
}

async function fetchMarketOverview(
  network: "testnet" | "mainnet",
): Promise<MarketOverviewData> {
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

    const pools = poolsRes.data;
    const ticker: { [key: string]: any } = tickerRes.data;
    const summary: any[] = summaryRes.data;

    const totalMarkets = pools.length;
    const activeMarkets = Object.keys(ticker).length;

    let totalVolume24h = 0;
    let topGainer: MarketOverviewData["topGainer"] = null;
    let topLoser: MarketOverviewData["topLoser"] = null;

    summary.forEach((item) => {
      totalVolume24h += item.quote_volume || 0;

      const change = item.price_change_percent_24h || 0;
      if (!topGainer || change > topGainer.change) {
        topGainer = { pair: item.trading_pairs, change };
      }
      if (!topLoser || change < topLoser.change) {
        topLoser = { pair: item.trading_pairs, change };
      }
    });

    return {
      totalMarkets,
      totalVolume24h,
      topGainer,
      topLoser,
      activeMarkets,
    };
  } catch (error) {
    console.error("Error fetching market overview:", error);
    return {
      totalMarkets: 0,
      totalVolume24h: 0,
      topGainer: null,
      topLoser: null,
      activeMarkets: 0,
    };
  }
}

interface MarketStatsProps {
  network?: "testnet" | "mainnet";
}

export function MarketStats({ network = "testnet" }: MarketStatsProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["market-overview", network],
    queryFn: () => fetchMarketOverview(network),
    refetchInterval: 30000, // Update every 30 seconds
    staleTime: 15000,
  });

  const formatNumber = (num: number): string => {
    if (num >= 1e9) return (num / 1e9).toFixed(2) + "B";
    if (num >= 1e6) return (num / 1e6).toFixed(2) + "M";
    if (num >= 1e3) return (num / 1e3).toFixed(2) + "K";
    return num.toFixed(2);
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="p-4">
            <div className="animate-pulse">
              <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
              <div className="h-6 bg-muted rounded w-1/2"></div>
            </div>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* Total Markets */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Total Markets</p>
            <p className="text-2xl font-bold">{data?.totalMarkets || 0}</p>
          </div>
          <BarChart3 className="h-8 w-8 text-primary" />
        </div>
      </Card>

      {/* 24h Volume */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">24h Volume</p>
            <p className="text-2xl font-bold">
              ${formatNumber(data?.totalVolume24h || 0)}
            </p>
          </div>
          <Volume2 className="h-8 w-8 text-blue-500" />
        </div>
      </Card>

      {/* Top Gainer */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Top Gainer</p>
            <p className="text-lg font-bold truncate">
              {data?.topGainer?.pair || "N/A"}
            </p>
            {data?.topGainer && (
              <Badge variant="default" className="text-green-600 bg-green-50">
                <TrendingUp className="h-3 w-3 mr-1" />+
                {data.topGainer.change.toFixed(2)}%
              </Badge>
            )}
          </div>
          <TrendingUp className="h-8 w-8 text-green-500" />
        </div>
      </Card>

      {/* Top Loser */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Top Loser</p>
            <p className="text-lg font-bold truncate">
              {data?.topLoser?.pair || "N/A"}
            </p>
            {data?.topLoser && (
              <Badge variant="destructive">
                <TrendingDown className="h-3 w-3 mr-1" />
                {data.topLoser.change.toFixed(2)}%
              </Badge>
            )}
          </div>
          <TrendingDown className="h-8 w-8 text-red-500" />
        </div>
      </Card>
    </div>
  );
}
