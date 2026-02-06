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
  sortBy: "volume" | "price" | "change" | "name";
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
    <div className="space-y-3">
      {/* Main Filter Bar - Compact and Sophisticated */}
      <Card className="p-3 bg-gradient-to-r from-background to-muted/20 border-border/50 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search - More compact */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search pairs..."
              value={filters.search}
              onChange={(e) => updateFilter("search", e.target.value)}
              className="pl-9 h-9 text-sm bg-background/50 border-border/50 focus:border-primary/50"
            />
          </div>

          {/* Sort Controls - Compact */}
          <div className="flex items-center gap-1">
            <Select
              value={filters.sortBy}
              onValueChange={(value: "volume" | "price" | "change" | "name") =>
                updateFilter("sortBy", value)
              }
            >
              <SelectTrigger className="w-28 h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="volume" className="text-sm">
                  <div className="flex items-center gap-2">
                    <Volume2 className="h-3 w-3" />
                    Volume
                  </div>
                </SelectItem>
                <SelectItem value="price" className="text-sm">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-3 w-3" />
                    Price
                  </div>
                </SelectItem>
                <SelectItem value="change" className="text-sm">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-3 w-3" />
                    Change
                  </div>
                </SelectItem>
                <SelectItem value="name" className="text-sm">
                  <div className="flex items-center gap-2">
                    <Star className="h-3 w-3" />
                    Name
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
              className="h-9 w-9 p-0"
            >
              {filters.sortOrder === "asc" ? (
                <SortAsc className="h-4 w-4" />
              ) : (
                <SortDesc className="h-4 w-4" />
              )}
            </Button>
          </div>

          {/* Quick Filters - Compact buttons */}
          <div className="flex items-center gap-2">
            <div className="flex gap-1">
              {[
                { key: "all", label: "All", icon: null },
                { key: "gainers", label: "Gainers", icon: TrendingUp },
                { key: "losers", label: "Losers", icon: TrendingDown },
              ].map(({ key, label, icon: Icon }) => (
                <Button
                  key={key}
                  variant={
                    filters.priceChangeFilter === key ? "default" : "ghost"
                  }
                  size="sm"
                  onClick={() => updateFilter("priceChangeFilter", key as any)}
                  className="h-8 px-3 text-xs font-medium"
                >
                  {Icon && <Icon className="h-3 w-3 mr-1" />}
                  {label}
                </Button>
              ))}
            </div>

            {/* Advanced Filters Button */}
            <Drawer>
              <DrawerTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="relative h-8 px-3 text-xs font-medium bg-background/50 hover:bg-background"
                >
                  <Settings className="h-3 w-3 mr-1.5" />
                  Advanced
                  {activeFiltersCount > 0 && (
                    <Badge
                      variant="destructive"
                      className="ml-1.5 h-4 w-4 p-0 flex items-center justify-center text-xs"
                    >
                      {activeFiltersCount}
                    </Badge>
                  )}
                </Button>
              </DrawerTrigger>
              <DrawerContent className="max-h-[85vh]">
                <DrawerHeader className="text-left">
                  <DrawerTitle className="flex items-center gap-2">
                    <Filter className="h-5 w-5" />
                    Advanced Filters
                  </DrawerTitle>
                  <DrawerDescription>
                    Fine-tune your market view with precision filters
                  </DrawerDescription>
                </DrawerHeader>
                <div className="px-6 pb-6 space-y-6 max-h-[60vh] overflow-y-auto">
                  {/* Volume Range */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium flex items-center gap-2">
                        <Volume2 className="h-4 w-4" />
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
                      <label className="text-sm font-medium">
                        Frozen Markets
                      </label>
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
                    <label className="text-sm font-medium">
                      Base Currencies
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Filter by the base currency of trading pairs
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {[
                        "SUI",
                        "USDC",
                        "USDT",
                        "ETH",
                        "BTC",
                        "WBTC",
                        "WETH",
                      ].map((currency) => (
                        <Badge
                          key={currency}
                          variant={
                            filters.baseCurrencies.includes(currency)
                              ? "default"
                              : "outline"
                          }
                          className="cursor-pointer hover:bg-primary/10 transition-colors px-3 py-1.5 text-sm"
                          onClick={() => {
                            const newCurrencies =
                              filters.baseCurrencies.includes(currency)
                                ? filters.baseCurrencies.filter(
                                    (c) => c !== currency,
                                  )
                                : [...filters.baseCurrencies, currency];
                            updateFilter("baseCurrencies", newCurrencies);
                          }}
                        >
                          {currency}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Quote Currency Filter */}
                  <div className="space-y-3">
                    <label className="text-sm font-medium">
                      Quote Currencies
                    </label>
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
                            const newCurrencies =
                              filters.quoteCurrencies.includes(currency)
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
        </div>
      </Card>

      {/* Active Filters Display - More compact */}
      {activeFiltersCount > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">
            Active:
          </span>
          {filters.search && (
            <Badge variant="secondary" className="text-xs px-2 py-0.5">
              Search: {filters.search}
              <X
                className="h-3 w-3 ml-1 cursor-pointer hover:text-destructive"
                onClick={() => updateFilter("search", "")}
              />
            </Badge>
          )}
          {filters.priceChangeFilter !== "all" && (
            <Badge variant="secondary" className="text-xs px-2 py-0.5">
              {filters.priceChangeFilter}
              <X
                className="h-3 w-3 ml-1 cursor-pointer hover:text-destructive"
                onClick={() => updateFilter("priceChangeFilter", "all")}
              />
            </Badge>
          )}
          {filters.baseCurrencies.length > 0 && (
            <Badge variant="secondary" className="text-xs px-2 py-0.5">
              Base: {filters.baseCurrencies.join(", ")}
              <X
                className="h-3 w-3 ml-1 cursor-pointer hover:text-destructive"
                onClick={() => updateFilter("baseCurrencies", [])}
              />
            </Badge>
          )}
          {filters.quoteCurrencies.length > 0 && (
            <Badge variant="secondary" className="text-xs px-2 py-0.5">
              Quote: {filters.quoteCurrencies.join(", ")}
              <X
                className="h-3 w-3 ml-1 cursor-pointer hover:text-destructive"
                onClick={() => updateFilter("quoteCurrencies", [])}
              />
            </Badge>
          )}
          {!filters.showFrozen && (
            <Badge variant="secondary" className="text-xs px-2 py-0.5">
              Hide Frozen
              <X
                className="h-3 w-3 ml-1 cursor-pointer hover:text-destructive"
                onClick={() => updateFilter("showFrozen", true)}
              />
            </Badge>
          )}
          {(filters.minVolume > 0 || filters.maxVolume < 10000000) && (
            <Badge variant="secondary" className="text-xs px-2 py-0.5">
              Volume: ${filters.minVolume.toLocaleString()} - $
              {filters.maxVolume.toLocaleString()}
              <X
                className="h-3 w-3 ml-1 cursor-pointer hover:text-destructive"
                onClick={() => {
                  updateFilter("minVolume", 0);
                  updateFilter("maxVolume", 10000000);
                }}
              />
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
