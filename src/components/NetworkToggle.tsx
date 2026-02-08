"use client";

import { useNetwork } from "@/contexts/NetworkContext";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";

interface NetworkToggleProps {
  className?: string;
  compact?: boolean;
}

export function NetworkToggle({
  className = "",
  compact = false,
}: NetworkToggleProps) {
  const { network, setNetwork, isMainnet } = useNetwork();
  const queryClient = useQueryClient();
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingNetwork, setPendingNetwork] = useState<
    "mainnet" | "testnet" | null
  >(null);

  const handleNetworkChange = useCallback(
    (newNetwork: "mainnet" | "testnet") => {
      if (newNetwork === network) return;

      // If switching to mainnet, show confirmation
      if (newNetwork === "mainnet") {
        setPendingNetwork(newNetwork);
        setShowConfirm(true);
        return;
      }

      // Switching to testnet doesn't need confirmation
      setNetwork(newNetwork);
      // Invalidate all queries to refetch with new network
      queryClient.invalidateQueries();
    },
    [network, setNetwork, queryClient],
  );

  const confirmSwitch = useCallback(() => {
    if (pendingNetwork) {
      setNetwork(pendingNetwork);
      queryClient.invalidateQueries();
    }
    setShowConfirm(false);
    setPendingNetwork(null);
  }, [pendingNetwork, setNetwork, queryClient]);

  const cancelSwitch = useCallback(() => {
    setShowConfirm(false);
    setPendingNetwork(null);
  }, []);

  if (compact) {
    return (
      <>
        <button
          onClick={() => handleNetworkChange(isMainnet ? "testnet" : "mainnet")}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            isMainnet
              ? "bg-chart-2/10 text-chart-2 border border-chart-2/20 hover:bg-chart-2/20"
              : "bg-chart-3/10 text-chart-3 border border-chart-3/20 hover:bg-chart-3/20"
          } ${className}`}
        >
          {network}
        </button>

        {/* Mainnet Confirmation Dialog */}
        <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-chart-3" />
                Switch to Mainnet?
              </DialogTitle>
              <DialogDescription className="text-muted-foreground">
                You are about to switch to Sui Mainnet.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <Badge
                variant="outline"
                className="w-full justify-center py-2 text-chart-3 border-chart-3/20 bg-chart-3/5"
              >
                Real Funds Mode
              </Badge>

              <div className="space-y-3 text-sm">
                <p className="text-muted-foreground">On mainnet:</p>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-foreground">•</span>
                    <span>
                      You will be using{" "}
                      <strong className="text-foreground">real funds</strong>
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground">•</span>
                    <span>
                      All transactions are{" "}
                      <strong className="text-foreground">irreversible</strong>
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground">•</span>
                    <span>Make sure you have sufficient balance</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-foreground">•</span>
                    <span>Slippage protection is enforced</span>
                  </li>
                </ul>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={cancelSwitch}>
                Cancel
              </Button>
              <Button
                onClick={confirmSwitch}
                className="bg-chart-2 hover:bg-chart-2/90 text-foreground"
              >
                Confirm Switch
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  // Full toggle UI
  return (
    <>
      <div
        className={`flex items-center gap-2 bg-muted rounded-xl p-1 ${className}`}
      >
        <button
          onClick={() => handleNetworkChange("testnet")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            !isMainnet
              ? "bg-chart-3/20 text-chart-3"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Testnet
        </button>
        <button
          onClick={() => handleNetworkChange("mainnet")}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            isMainnet
              ? "bg-chart-2/20 text-chart-2"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Mainnet
        </button>
      </div>

      {/* Mainnet Confirmation Dialog */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-chart-3" />
              Switch to Mainnet?
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              You are about to switch to Sui Mainnet.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <Badge
              variant="outline"
              className="w-full justify-center py-2 text-chart-3 border-chart-3/20 bg-chart-3/5"
            >
              Real Funds Mode
            </Badge>

            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">On mainnet:</p>
              <ul className="space-y-2 text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-foreground">•</span>
                  <span>
                    You will be using{" "}
                    <strong className="text-foreground">real funds</strong>
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-foreground">•</span>
                  <span>
                    All transactions are{" "}
                    <strong className="text-foreground">irreversible</strong>
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-foreground">•</span>
                  <span>Make sure you have sufficient balance</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-foreground">•</span>
                  <span>Slippage protection is enforced</span>
                </li>
              </ul>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={cancelSwitch}>
              Cancel
            </Button>
            <Button
              onClick={confirmSwitch}
              className="bg-chart-2 hover:bg-chart-2/90 text-foreground"
            >
              Confirm Switch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Simple indicator without toggle
export function NetworkIndicator({ className = "" }: { className?: string }) {
  const { network, isMainnet } = useNetwork();

  return (
    <span
      className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
        isMainnet
          ? "bg-chart-2/10 text-chart-2 border border-chart-2/20"
          : "bg-chart-3/10 text-chart-3 border border-chart-3/20"
      } ${className}`}
    >
      {network}
    </span>
  );
}
