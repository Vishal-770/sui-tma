"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Volume2 } from "lucide-react";

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

interface PoolCardProps {
  market: CombinedMarketData;
}

export function PoolCard({ market }: PoolCardProps) {
  const priceChange = formatPriceChange(market.priceChange24h);

  return (
    <Link href={`/indexer/${market.poolId}`}>
      <Card className="hover:shadow-lg transition-shadow duration-200 cursor-pointer border-border/50 hover:border-primary/20">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            {/* Left side - Pair info */}
            <div className="flex items-center gap-4">
              <div>
                <h3 className="text-xl font-bold">
                  {market.baseSymbol}/{market.quoteSymbol}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {market.poolName}
                </p>
              </div>
              <Badge
                variant={market.isFrozen ? "destructive" : "secondary"}
                className="text-xs"
              >
                {market.isFrozen ? "Frozen" : "Active"}
              </Badge>
            </div>

            {/* Right side - Price and change */}
            <div className="text-right">
              <div className="text-2xl font-mono font-bold">
                {market.lastPrice.toFixed(4)}
              </div>
              <div className="flex items-center gap-1 justify-end">
                {priceChange.isPositive ? (
                  <TrendingUp className="h-4 w-4 text-green-600" />
                ) : (
                  <TrendingDown className="h-4 w-4 text-red-600" />
                )}
                <span
                  className={`font-medium ${
                    priceChange.isPositive ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {priceChange.value}
                </span>
              </div>
            </div>
          </div>

          {/* Bottom row - Additional stats */}
          <div className="flex items-center justify-between mt-4 pt-4 border-t">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Volume2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  24h Volume
                </span>
                <span className="font-medium">
                  {formatNumber(market.quoteVolume24h)} {market.quoteSymbol}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">24h Range</span>
                <span className="font-mono text-sm">
                  {market.low24h.toFixed(2)} - {market.high24h.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Spread</span>
                <span className="font-mono text-sm">
                  {market.bestBid.toFixed(4)} / {market.bestAsk.toFixed(4)}
                </span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
