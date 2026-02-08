"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import Image from "next/image";

import { useAuth } from "@/contexts/AuthContext";
import {
  getZkLoginSetup,
  clearZkLoginSetup,
  decodeJwt,
  getZkLoginAddressFromJwt,
  generateUserSalt,
  generateTelegramUserSalt,
  requestZkProof,
  ZkLoginSession,
} from "@/lib/zklogin";

type CallbackStatus = "processing" | "success" | "error";

interface ProgressStep {
  id: string;
  label: string;
  status: "pending" | "active" | "complete" | "error";
}

export default function AuthCallbackPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [status, setStatus] = useState<CallbackStatus>("processing");
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<ProgressStep[]>([
    { id: "token", label: "Verifying token", status: "active" },
    { id: "session", label: "Loading session", status: "pending" },
    { id: "address", label: "Generating wallet", status: "pending" },
    { id: "proof", label: "Creating ZK proof", status: "pending" },
    { id: "complete", label: "Finalizing", status: "pending" },
  ]);
  const processedRef = useRef(false);

  const updateStep = (stepId: string, stepStatus: ProgressStep["status"]) => {
    setSteps((prev) =>
      prev.map((step) =>
        step.id === stepId ? { ...step, status: stepStatus } : step,
      ),
    );
  };

  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

    const processCallback = async () => {
      try {
        // Extract JWT from URL hash
        const hashParams = new URLSearchParams(window.location.hash.slice(1));
        const jwt = hashParams.get("id_token");

        if (!jwt) {
          throw new Error("No authentication token received");
        }

        // Decode and validate JWT
        const decodedJwt = decodeJwt(jwt);
        if (!decodedJwt.sub) {
          throw new Error("Invalid token: missing subject");
        }

        updateStep("token", "complete");
        updateStep("session", "active");

        // Get stored setup data
        const setup = getZkLoginSetup();
        if (!setup) {
          throw new Error("Session expired. Please try logging in again.");
        }

        const telegramUserId = sessionStorage.getItem("telegram_user_id");

        updateStep("session", "complete");
        updateStep("address", "active");

        // Generate salt
        const userSalt = telegramUserId
          ? generateTelegramUserSalt(parseInt(telegramUserId), decodedJwt.sub)
          : generateUserSalt(decodedJwt.sub);

        // Get zkLogin address
        const zkLoginAddress = getZkLoginAddressFromJwt(jwt, userSalt);

        updateStep("address", "complete");
        updateStep("proof", "active");

        // Reconstruct ephemeral keypair from Bech32-encoded string
        const ephemeralKeyPair = Ed25519Keypair.fromSecretKey(
          setup.ephemeralPrivateKey,
        );

        // Request ZK proof from prover
        const zkProof = await requestZkProof(
          jwt,
          ephemeralKeyPair,
          setup.maxEpoch,
          setup.randomness,
          userSalt,
        );

        updateStep("proof", "complete");
        updateStep("complete", "active");

        // Create session object
        const session: ZkLoginSession = {
          ephemeralPrivateKey: setup.ephemeralPrivateKey,
          ephemeralPublicKey: setup.ephemeralPublicKey,
          randomness: setup.randomness,
          maxEpoch: setup.maxEpoch,
          jwt,
          userSalt,
          zkLoginAddress,
          zkProof,
          telegramUserId: telegramUserId ? parseInt(telegramUserId) : undefined,
        };

        // Store session and update auth context
        login(session);

        // Clean up
        clearZkLoginSetup();
        sessionStorage.removeItem("telegram_user_id");

        updateStep("complete", "complete");
        setStatus("success");

        // Redirect to dashboard
        setTimeout(() => {
          router.replace("/dashboard");
        }, 1500);
      } catch (err) {
        console.error("Auth callback error:", err);
        setStatus("error");
        setError(err instanceof Error ? err.message : "Authentication failed");

        // Mark current active step as error
        setSteps((prev) =>
          prev.map((step) =>
            step.status === "active" ? { ...step, status: "error" } : step,
          ),
        );

        // Clean up on error
        clearZkLoginSetup();
        sessionStorage.removeItem("telegram_user_id");
      }
    };

    processCallback();
  }, [login, router]);

  const getStepIcon = (stepStatus: ProgressStep["status"]) => {
    switch (stepStatus) {
      case "complete":
        return (
          <div className="w-8 h-8 rounded-lg bg-green-600/10 border border-green-600/20 flex items-center justify-center text-green-600">
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
        );
      case "active":
        return (
          <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary relative">
            <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin absolute" />
          </div>
        );
      case "error":
        return (
          <div className="w-8 h-8 rounded-lg bg-red-600/10 border border-red-600/20 flex items-center justify-center text-red-600">
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
        );
      default:
        return (
          <div className="w-8 h-8 rounded-lg bg-muted border border-border flex items-center justify-center text-muted-foreground">
            <div className="w-2 h-2 rounded-full bg-current opacity-40" />
          </div>
        );
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-5">
      <div className="w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          {status === "processing" && (
            <>
              <div className="w-16 h-16 mx-auto flex items-center justify-center">
                <Image
                  src="/logo-tma.png"
                  alt="Abyss Protocol Logo"
                  width={64}
                  height={64}
                  className="w-12 h-12 object-contain"
                />
              </div>
              <h2 className="text-2xl font-semibold text-foreground">
                Setting up your wallet
              </h2>
              <p className="text-muted-foreground">
                This may take a few moments...
              </p>
            </>
          )}

          {status === "success" && (
            <>
              <div className="w-16 h-16 mx-auto rounded-full bg-linear-to-br from-green-600 to-green-700 flex items-center justify-center shadow-lg">
                <svg
                  className="w-8 h-8 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-semibold text-green-600">
                Success!
              </h2>
              <p className="text-muted-foreground">
                Redirecting to dashboard...
              </p>
            </>
          )}

          {status === "error" && (
            <>
              <div className="w-16 h-16 mx-auto rounded-full bg-linear-to-br from-red-600 to-red-700 flex items-center justify-center shadow-lg">
                <svg
                  className="w-8 h-8 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h2 className="text-2xl font-semibold text-red-600">
                Authentication Failed
              </h2>
              <p className="text-muted-foreground">{error}</p>
            </>
          )}
        </div>

        {/* Progress Steps */}
        <div className="bg-card border border-border rounded-xl p-6 space-y-4">
          {steps.map((step) => (
            <div key={step.id} className="flex items-center gap-4">
              {getStepIcon(step.status)}
              <span
                className={`text-[15px] font-medium ${
                  step.status === "pending"
                    ? "text-muted-foreground"
                    : step.status === "error"
                      ? "text-red-600"
                      : "text-foreground"
                }`}
              >
                {step.label}
              </span>
            </div>
          ))}
        </div>

        {/* Error Actions */}
        {status === "error" && (
          <div className="w-full">
            <button
              onClick={() => router.replace("/login")}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-xl font-medium transition-colors hover:bg-primary/90 shadow-md"
            >
              <svg
                className="w-5 h-5"
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
              <span>Try Again</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
