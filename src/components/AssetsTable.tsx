"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Loader,
} from "lucide-react";
import axios from "axios";
import { useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

interface Asset {
  asset_type: string;
  can_withdraw: string;
  can_deposit: string;
  name: string;
  contractAddress: string;
  contractAddressUrl: string;
  unified_cryptoasset_id?: string;
}

interface AssetsData {
  [symbol: string]: Asset;
}

async function fetchAssets(
  network: "testnet" | "mainnet",
): Promise<AssetsData> {
  const BASE_URL =
    network === "mainnet"
      ? "https://deepbook-indexer.mainnet.mystenlabs.com"
      : "https://deepbook-indexer.testnet.mystenlabs.com";

  try {
    const response = await axios.get(`${BASE_URL}/assets`);
    return response.data;
  } catch (error) {
    console.error("Error fetching assets:", error);
    throw error;
  }
}

interface AssetsTableProps {
  network: "testnet" | "mainnet";
  searchQuery?: string;
}

export function AssetsTable({ network, searchQuery = "" }: AssetsTableProps) {
  const {
    data: assetsData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["assets", network],
    queryFn: () => fetchAssets(network),
    refetchInterval: 30000,
  });

  const assets = assetsData ? Object.entries(assetsData) : [];

  // Filter assets based on search query
  const filteredAssets = useMemo(() => {
    if (!searchQuery) return assets;

    const query = searchQuery.toLowerCase();
    return assets.filter(([symbol, asset]) => {
      return (
        (symbol && symbol.toLowerCase().includes(query)) ||
        (asset.name && asset.name.toLowerCase().includes(query)) ||
        (asset.contractAddress &&
          asset.contractAddress.toLowerCase().includes(query))
      );
    });
  }, [assets, searchQuery]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex items-center justify-center">
          <Loader className="h-6 w-6 animate-spin" />
          <span className="ml-2">Loading assets...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8 text-destructive">
        Error loading assets. Please try again later.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {filteredAssets.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          {searchQuery ? "No assets match your search." : "No assets found."}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent border-b border-border">
                <TableHead className="w-12 text-xs uppercase font-semibold">
                  #
                </TableHead>
                <TableHead className="text-xs uppercase font-semibold">
                  Symbol
                </TableHead>
                <TableHead className="text-xs uppercase font-semibold">
                  Name
                </TableHead>
                <TableHead className="text-xs uppercase font-semibold">
                  Contract Address
                </TableHead>
                <TableHead className="text-center text-xs uppercase font-semibold">
                  Deposit
                </TableHead>
                <TableHead className="text-center text-xs uppercase font-semibold">
                  Withdraw
                </TableHead>
                <TableHead className="text-center text-xs uppercase font-semibold">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAssets.map(([symbol, asset], index) => (
                <TableRow
                  key={symbol}
                  className="hover:bg-accent/50 transition-colors border-b border-border/50 last:border-b-0"
                >
                  <TableCell className="font-medium text-muted-foreground text-sm">
                    {index + 1}
                  </TableCell>
                  <TableCell>
                    <div className="font-semibold text-foreground">
                      {symbol}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-foreground">{asset.name}</div>
                  </TableCell>
                  <TableCell>
                    <div className="font-mono text-xs text-muted-foreground max-w-xs truncate">
                      {asset.contractAddress}
                    </div>
                  </TableCell>
                  <TableCell className="text-center">
                    {asset.can_deposit === "true" ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600 inline-block" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600 inline-block" />
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    {asset.can_withdraw === "true" ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600 inline-block" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600 inline-block" />
                    )}
                  </TableCell>
                  <TableCell className="text-center">
                    <a
                      href={asset.contractAddressUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span className="text-xs">View</span>
                    </a>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
