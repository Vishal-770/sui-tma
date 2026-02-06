"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import {
  Search,
  Filter,
  SortAsc,
  SortDesc,
  TrendingUp,
  TrendingDown,
  Volume2,
  DollarSign,
  X,
  Settings,
  Star,
} from "lucide-react";

export interface MarketFiltersType {
  search: string;
  sortBy: "volume" | "price" | "change";
  sortOrder: "asc" | "desc";
  minVolume: number;
  maxVolume: number;
  priceChangeFilter: "all" | "positive" | "negative" | "gainers" | "losers";
  baseCurrencies: string[];
  quoteCurrencies: string[];
  showFrozen: boolean;
}

interface MarketFiltersProps {
  filters: MarketFiltersType;
  onFiltersChange: (filters: MarketFiltersType) => void;
}

export function MarketFilters({
  filters,
  onFiltersChange,
}: MarketFiltersProps) {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  const updateFilter = <K extends keyof MarketFiltersType>(
    key: K,
    value: MarketFiltersType[K],
  ) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearFilters = () => {
    onFiltersChange({
      search: "",
      sortBy: "volume",
      sortOrder: "desc",
      minVolume: 0,
      maxVolume: 10000000,
      priceChangeFilter: "all",
      baseCurrencies: [],
      quoteCurrencies: [],
      showFrozen: true,
    });
  };

  const activeFiltersCount =
    (filters.search ? 1 : 0) +
    (filters.priceChangeFilter !== "all" ? 1 : 0) +
    (filters.baseCurrencies.length > 0 ? 1 : 0) +
    (filters.quoteCurrencies.length > 0 ? 1 : 0) +
    (!filters.showFrozen ? 1 : 0) +
    (filters.minVolume > 0 || filters.maxVolume < 10000000 ? 1 : 0);

  return (
    <Card className="p-4">
      <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
          <Input
            placeholder="Search trading pairs..."
            value={filters.search}
            onChange={(e) => updateFilter("search", e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Sort Options */}
        <div className="flex items-center gap-2">
          <Select
            value={filters.sortBy}
            onValueChange={(value: "volume" | "price" | "change") =>
              updateFilter("sortBy", value)
            }
          >
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="volume">
                <div className="flex items-center gap-2">
                  <Volume2 className="h-4 w-4" />
                  Volume
                </div>
              </SelectItem>
              <SelectItem value="price">
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Price
                </div>
              </SelectItem>
              <SelectItem value="change">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Change
                </div>
              </SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              updateFilter(
                "sortOrder",
                filters.sortOrder === "asc" ? "desc" : "asc",
              )
            }
          >
            {filters.sortOrder === "asc" ? (
              <SortAsc className="h-4 w-4" />
            ) : (
              <SortDesc className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Price Change Filter */}
        <Select
          value={filters.priceChangeFilter}
          onValueChange={(
            value: "all" | "positive" | "negative" | "gainers" | "losers",
          ) => updateFilter("priceChangeFilter", value)}
        >
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Changes</SelectItem>
            <SelectItem value="positive">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-green-600" />
                Positive
              </div>
            </SelectItem>
            <SelectItem value="negative">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-red-600" />
                Negative
              </div>
            </SelectItem>
            <SelectItem value="gainers">Top Gainers</SelectItem>
            <SelectItem value="losers">Top Losers</SelectItem>
          </SelectContent>
        </Select>

        {/* Watchlist */}
        <Button variant="outline" size="sm">
          <Star className="h-4 w-4 mr-2" />
          Watchlist
        </Button>

        {/* Advanced Filters */}
        <Drawer>
          <DrawerTrigger asChild>
            <Button variant="outline" className="relative">
              <Settings className="h-4 w-4 mr-2" />
              Filters
              {activeFiltersCount > 0 && (
                <Badge
                  variant="destructive"
                  className="ml-2 h-5 w-5 p-0 flex items-center justify-center text-xs"
                >
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>
          </DrawerTrigger>
          <DrawerContent className="max-h-[85vh]">
            <DrawerHeader className="text-left">
              <DrawerTitle>Advanced Filters</DrawerTitle>
              <DrawerDescription>
                Customize your market view with advanced filtering options
              </DrawerDescription>
            </DrawerHeader>
            <div className="px-6 pb-6 space-y-6 max-h-[60vh] overflow-y-auto">
              {/* Volume Range */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">
                    24h Volume Range
                  </label>
                  <div className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                    ${filters.minVolume.toLocaleString()} - $
                    {filters.maxVolume.toLocaleString()}
                  </div>
                </div>
                <div className="px-2">
                  <Slider
                    value={[filters.minVolume, filters.maxVolume]}
                    onValueChange={([min, max]) => {
                      updateFilter("minVolume", min);
                      updateFilter("maxVolume", max);
                    }}
                    max={10000000}
                    min={0}
                    step={1000}
                    className="w-full"
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>$0</span>
                  <span>$10M+</span>
                </div>
              </div>

              {/* Show Frozen Markets */}
              <div className="flex items-center justify-between p-4 border rounded-lg bg-card">
                <div className="space-y-0.5">
                  <label className="text-sm font-medium">Frozen Markets</label>
                  <p className="text-xs text-muted-foreground">
                    Include markets that are currently frozen
                  </p>
                </div>
                <Checkbox
                  checked={filters.showFrozen}
                  onCheckedChange={(checked) =>
                    updateFilter("showFrozen", checked as boolean)
                  }
                />
              </div>

              {/* Base Currency Filter */}
              <div className="space-y-3">
                <label className="text-sm font-medium">Base Currencies</label>
                <p className="text-xs text-muted-foreground">
                  Filter by the base currency of trading pairs
                </p>
                <div className="flex flex-wrap gap-2">
                  {["SUI", "USDC", "USDT", "ETH", "BTC", "WBTC", "WETH"].map(
                    (currency) => (
                      <Badge
                        key={currency}
                        variant={
                          filters.baseCurrencies.includes(currency)
                            ? "default"
                            : "outline"
                        }
                        className="cursor-pointer hover:bg-primary/10 transition-colors px-3 py-1.5 text-sm"
                        onClick={() => {
                          const newCurrencies = filters.baseCurrencies.includes(
                            currency,
                          )
                            ? filters.baseCurrencies.filter(
                                (c) => c !== currency,
                              )
                            : [...filters.baseCurrencies, currency];
                          updateFilter("baseCurrencies", newCurrencies);
                        }}
                      >
                        {currency}
                      </Badge>
                    ),
                  )}
                </div>
              </div>

              {/* Quote Currency Filter */}
              <div className="space-y-3">
                <label className="text-sm font-medium">Quote Currencies</label>
                <p className="text-xs text-muted-foreground">
                  Filter by the quote currency of trading pairs
                </p>
                <div className="flex flex-wrap gap-2">
                  {["USDC", "USDT", "SUI"].map((currency) => (
                    <Badge
                      key={currency}
                      variant={
                        filters.quoteCurrencies.includes(currency)
                          ? "default"
                          : "outline"
                      }
                      className="cursor-pointer hover:bg-primary/10 transition-colors px-3 py-1.5 text-sm"
                      onClick={() => {
                        const newCurrencies = filters.quoteCurrencies.includes(
                          currency,
                        )
                          ? filters.quoteCurrencies.filter(
                              (c) => c !== currency,
                            )
                          : [...filters.quoteCurrencies, currency];
                        updateFilter("quoteCurrencies", newCurrencies);
                      }}
                    >
                      {currency}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Clear Filters */}
              <div className="pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={clearFilters}
                  className="w-full"
                  disabled={activeFiltersCount === 0}
                >
                  <X className="h-4 w-4 mr-2" />
                  Clear All Filters ({activeFiltersCount})
                </Button>
              </div>
            </div>
          </DrawerContent>
        </Drawer>
      </div>

      {/* Active Filters Display */}
      {activeFiltersCount > 0 && (
        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t">
          <span className="text-sm text-muted-foreground">Active filters:</span>
          {filters.search && (
            <Badge variant="secondary">
              Search: {filters.search}
              <X
                className="h-3 w-3 ml-1 cursor-pointer"
                onClick={() => updateFilter("search", "")}
              />
            </Badge>
          )}
          {filters.priceChangeFilter !== "all" && (
            <Badge variant="secondary">
              {filters.priceChangeFilter}
              <X
                className="h-3 w-3 ml-1 cursor-pointer"
                onClick={() => updateFilter("priceChangeFilter", "all")}
              />
            </Badge>
          )}
          {filters.baseCurrencies.length > 0 && (
            <Badge variant="secondary">
              Base: {filters.baseCurrencies.join(", ")}
              <X
                className="h-3 w-3 ml-1 cursor-pointer"
                onClick={() => updateFilter("baseCurrencies", [])}
              />
            </Badge>
          )}
          {filters.quoteCurrencies.length > 0 && (
            <Badge variant="secondary">
              Quote: {filters.quoteCurrencies.join(", ")}
              <X
                className="h-3 w-3 ml-1 cursor-pointer"
                onClick={() => updateFilter("quoteCurrencies", [])}
              />
            </Badge>
          )}
        </div>
      )}
    </Card>
  );
}
