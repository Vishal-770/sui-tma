"use client";

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, Loader } from "lucide-react";

interface OrderUpdate {
  order_id: string;
  balance_manager_id: string;
  timestamp: number;
  original_quantity: number;
  remaining_quantity: number;
  filled_quantity: number;
  price: number;
  status: string;
  type: string;
}

interface OrderUpdatesProps {
  poolName: string;
  network: "testnet" | "mainnet";
}

async function fetchOrderUpdates(
  network: "testnet" | "mainnet",
  poolName: string,
  limit: number = 10,
  startTime?: number,
  endTime?: number,
  status?: "Placed" | "Canceled",
): Promise<OrderUpdate[]> {
  const BASE_URL =
    network === "mainnet"
      ? "https://deepbook-indexer.mainnet.mystenlabs.com"
      : "https://deepbook-indexer.testnet.mystenlabs.com";

  const params = new URLSearchParams();
  params.append("limit", limit.toString());
  if (startTime) params.append("start_time", startTime.toString());
  if (endTime) params.append("end_time", endTime.toString());
  if (status) params.append("status", status);

  try {
    const response = await axios.get<OrderUpdate[]>(
      `${BASE_URL}/order_updates/${poolName}?${params.toString()}`,
    );
    console.log("Order Updates API Response:", response.data);
    if (response.data.length > 0) {
      console.log("Sample order:", response.data[0]);
    }
    return response.data;
  } catch (error) {
    console.error("Error fetching order updates:", error);
    return [];
  }
}

function formatTimestamp(timestamp: number): string {
  // Timestamp is already in milliseconds according to API docs
  return new Date(timestamp).toLocaleString();
}

function formatQuantity(quantity: number | string): string {
  const num = typeof quantity === "string" ? parseFloat(quantity) : quantity;
  if (isNaN(num)) return "0.0000";
  return (num / 1e9).toFixed(4);
}

function formatPrice(price: number | string): string {
  const num = typeof price === "string" ? parseFloat(price) : price;
  if (isNaN(num)) return "0.000000";
  return (num / 1e9).toFixed(6);
}

export function OrderUpdates({ poolName, network }: OrderUpdatesProps) {
  const [statusFilter, setStatusFilter] = useState<
    "Placed" | "Canceled" | undefined
  >();

  const limit = 10;

  const {
    data: orders,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["orderUpdates", network, poolName, statusFilter],
    queryFn: async () => {
      const fetchedOrders = await fetchOrderUpdates(
        network,
        poolName,
        limit,
        undefined,
        undefined,
        statusFilter,
      );

      return fetchedOrders;
    },
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const handleStatusChange = useCallback((newStatus: string) => {
    setStatusFilter(newStatus === "all" ? undefined : (newStatus as any));
  }, []);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Recent Order Updates</CardTitle>
          <div className="flex items-center gap-2">
            <Tabs
              value={statusFilter || "all"}
              onValueChange={handleStatusChange}
            >
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="Placed">Placed</TabsTrigger>
                <TabsTrigger value="Canceled">Canceled</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isLoading}
            >
              <RefreshCw
                className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
              />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && orders === undefined ? (
          <div className="flex items-center justify-center py-8">
            <Loader className="h-6 w-6 animate-spin" />
            <span className="ml-2">Loading orders...</span>
          </div>
        ) : orders && orders.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Order ID</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead className="text-right">Filled</TableHead>
                    <TableHead className="text-right">Remaining</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map(
                    (order, index) => (
                      console.log(order),
                      (
                        <TableRow
                          key={`${order.order_id}-${order.timestamp}-${index}`}
                        >
                          <TableCell className="text-sm">
                            {formatTimestamp(order.timestamp)}
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {order.order_id.slice(0, 8)}...
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                order.type === "BUY" ? "default" : "secondary"
                              }
                            >
                              {order.type}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                order.status === "Placed"
                                  ? "default"
                                  : "destructive"
                              }
                            >
                              {order.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {order.price}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {order.original_quantity}
                          </TableCell>
                          <TableCell className="text-right font-mono text-chart-2">
                            {order.filled_quantity}
                          </TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">
                            {order.remaining_quantity}
                          </TableCell>
                        </TableRow>
                      )
                    ),
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            No orders found
          </div>
        )}
      </CardContent>
    </Card>
  );
}
