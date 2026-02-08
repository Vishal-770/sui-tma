"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";

import { useAuth } from "@/contexts/AuthContext";
import {
  formatTriggerCondition,
  unscalePrice,
  isIntentExpired,
  fetchUserIntents,
  buildCancelIntentTx,
  OnChainIntentSummary,
  PACKAGE_IDS,
} from "@/lib/seal";
import { getSuiClient, signAndExecuteZkLoginTransaction } from "@/lib/zklogin";
import { Transaction } from "@mysten/sui/transactions";

// Intent status labels and colors
const STATUS_CONFIG: Record<
  number,
  { label: string; color: string; bg: string }
> = {
  0: {
    label: "Active",
    color: "rgb(34, 197, 94)",
    bg: "rgba(34, 197, 94, 0.1)",
  },
  1: {
    label: "Executing",
    color: "rgb(14, 165, 233)",
    bg: "rgba(14, 165, 233, 0.1)",
  },
  2: {
    label: "Executed",
    color: "rgb(34, 197, 94)",
    bg: "rgba(34, 197, 94, 0.1)",
  },
  3: {
    label: "Cancelled",
    color: "rgb(156, 163, 175)",
    bg: "rgba(156, 163, 175, 0.1)",
  },
  4: {
    label: "Expired",
    color: "rgb(234, 179, 8)",
    bg: "rgba(234, 179, 8, 0.1)",
  },
  5: {
    label: "Failed",
    color: "rgb(239, 68, 68)",
    bg: "rgba(239, 68, 68, 0.1)",
  },
};

// Use the OnChainIntentSummary type from seal.ts
type IntentSummary = OnChainIntentSummary & {
  side?: "buy" | "sell";
  quantity?: number;
};

export default function IntentsPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading, session } = useAuth();

  // Wallet connection via dapp-kit
  const dappKitAccount = useCurrentAccount();
  const suiClient = useSuiClient();

  // Check if connected via either method
  const isConnected = isAuthenticated || !!dappKitAccount;
  const activeAddress = session?.zkLoginAddress || dappKitAccount?.address;
  const isZkLogin = isAuthenticated && !!session?.zkLoginAddress;

  const [intents, setIntents] = useState<IntentSummary[]>([]);
  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  // Redirect if not connected at all
  useEffect(() => {
    if (!isLoading && !isConnected) {
      router.replace("/login");
    }
  }, [isConnected, isLoading, router]);

  // Load intents on mount
  useEffect(() => {
    if (activeAddress) {
      loadIntents();
    }
  }, [activeAddress]);

  const loadIntents = async () => {
    if (!activeAddress) return;

    setIsRefreshing(true);
    try {
      // Fetch real intents from blockchain
      const client = isZkLogin ? getSuiClient() : suiClient;
      const onChainIntents = await fetchUserIntents(activeAddress, client);
      setIntents(onChainIntents);
    } catch (error) {
      console.error("Failed to load intents:", error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRefresh = async () => {
    await loadIntents();
  };

  const handleCancel = async (intentId: string) => {
    if (!isZkLogin || !session?.zkProof) {
      console.error("zkLogin session required for cancelling intents");
      return;
    }

    setCancellingId(intentId);

    try {
      // Build and execute cancel transaction
      const tx = buildCancelIntentTx(
        intentId,
        PACKAGE_IDS.intentRegistryObject,
      );
      await signAndExecuteZkLoginTransaction(tx, session);

      // Refresh intents after cancellation
      await loadIntents();
    } catch (error) {
      console.error("Failed to cancel intent:", error);
    } finally {
      setCancellingId(null);
    }
  };

  const filteredIntents = intents.filter((intent) => {
    if (filter === "active") return intent.status === 0 || intent.status === 1;
    if (filter === "completed") return intent.status >= 2;
    return true;
  });

  const activeCount = intents.filter(
    (i) => i.status === 0 || i.status === 1,
  ).length;
  const completedCount = intents.filter((i) => i.status >= 2).length;

  if (isLoading || !isConnected) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="w-full max-w-4xl mx-auto px-4 py-6 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/dashboard")}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <svg
                className="w-5 h-5 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <h1 className="text-xl font-bold">Phantom - Private Intents</h1>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="p-2 bg-gray-900 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <svg
                className={`w-5 h-5 text-gray-400 ${isRefreshing ? "animate-spin" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
            <Link
              href="/intents/create"
              className="p-2 bg-sky-500 hover:bg-sky-400 rounded-lg transition-colors"
            >
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </Link>
          </div>
        </div>

        {/* Non-zkLogin Warning */}
        {!isZkLogin && (
          <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
            <p className="text-yellow-400 text-sm">
              You're connected with a wallet. To create or cancel intents, you
              need to sign in with zkLogin.
            </p>
            <Link
              href="/login"
              className="text-yellow-300 text-sm underline mt-1 inline-block"
            >
              Switch to zkLogin
            </Link>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-800 text-center">
            <span className="text-2xl font-bold text-white">
              {intents.length}
            </span>
            <span className="block text-xs text-gray-500 mt-1">Total</span>
          </div>
          <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-800 text-center">
            <span className="text-2xl font-bold text-green-400">
              {activeCount}
            </span>
            <span className="block text-xs text-gray-500 mt-1">Active</span>
          </div>
          <div className="bg-gray-900/50 rounded-xl p-4 border border-gray-800 text-center">
            <span className="text-2xl font-bold text-gray-400">
              {completedCount}
            </span>
            <span className="block text-xs text-gray-500 mt-1">Completed</span>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 p-1 bg-gray-900/50 rounded-lg border border-gray-800">
          {(["all", "active", "completed"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-1 py-2 px-4 rounded-md text-sm font-medium transition-colors ${
                filter === f
                  ? "bg-sky-500 text-white"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Intent List */}
        <div className="flex-1 flex flex-col gap-3">
          {filteredIntents.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 bg-gray-900 rounded-2xl flex items-center justify-center mb-4">
                <svg
                  className="w-8 h-8 text-gray-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
              </div>
              <p className="text-white font-medium mb-1">No intents found</p>
              <p className="text-gray-500 text-sm mb-6">
                {filter === "all"
                  ? "Create your first trading intent"
                  : `No ${filter} intents`}
              </p>
              {filter === "all" && isZkLogin && (
                <Link
                  href="/intents/create"
                  className="px-6 py-2.5 bg-sky-500 hover:bg-sky-400 rounded-lg font-medium text-sm transition-colors"
                >
                  Create Intent
                </Link>
              )}
            </div>
          ) : (
            filteredIntents.map((intent, index) => {
              const status = STATUS_CONFIG[intent.status] || STATUS_CONFIG[0];
              const canCancel = intent.status === 0 && isZkLogin;

              return (
                <div
                  key={intent.id}
                  className="bg-gray-900/50 rounded-xl p-4 border border-gray-800 hover:border-gray-700 transition-colors"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-semibold text-white">
                          {intent.pair.replace("_", "/")}
                        </span>
                        <span
                          className="px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{ background: status.bg, color: status.color }}
                        >
                          {status.label}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500">
                        {formatTriggerCondition(
                          intent.triggerType,
                          intent.triggerValue,
                          intent.pair,
                        )}
                      </p>
                    </div>

                    {intent.side && (
                      <span
                        className={`font-semibold ${intent.side === "buy" ? "text-green-400" : "text-red-400"}`}
                      >
                        {intent.side.toUpperCase()}
                      </span>
                    )}
                  </div>

                  <div className="flex justify-between items-center">
                    <div className="flex gap-4 text-sm">
                      {intent.quantity && (
                        <span>
                          <span className="text-gray-500">Qty: </span>
                          <span className="text-gray-300 font-medium">
                            {intent.quantity}
                          </span>
                        </span>
                      )}
                      <span>
                        <span className="text-gray-500">Expires: </span>
                        <span className="text-gray-300 font-medium">
                          {new Date(intent.expiresAt).toLocaleDateString()}
                        </span>
                      </span>
                    </div>

                    {canCancel && (
                      <button
                        onClick={() => handleCancel(intent.id)}
                        disabled={cancellingId === intent.id}
                        className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        {cancellingId === intent.id ? (
                          <div className="w-4 h-4 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          "Cancel"
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Floating action button */}
        {isZkLogin && (
          <Link
            href="/intents/create"
            className="fixed bottom-6 right-6 w-14 h-14 bg-sky-500 hover:bg-sky-400 rounded-full shadow-lg shadow-sky-500/25 flex items-center justify-center transition-colors"
          >
            <svg
              className="w-6 h-6 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
          </Link>
        )}
      </div>
    </div>
  );
}
