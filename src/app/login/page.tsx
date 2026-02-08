"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

import { useAuth } from "@/contexts/AuthContext";
import {
  setupZkLogin,
  getGoogleAuthUrl,
  storeZkLoginSetup,
} from "@/lib/zklogin";

export default function LoginPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect if already authenticated
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      router.replace("/dashboard");
    }
  }, [isAuthenticated, authLoading, router]);

  const handleGoogleLogin = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Setup zkLogin (generate ephemeral keypair and nonce)
      const setup = await setupZkLogin();

      // Store setup data for callback
      const ephemeralPrivateKey = setup.ephemeralKeyPair.getSecretKey();
      const ephemeralPublicKey = setup.ephemeralKeyPair
        .getPublicKey()
        .toBase64();

      storeZkLoginSetup({
        ephemeralPrivateKey,
        ephemeralPublicKey,
        randomness: setup.randomness,
        maxEpoch: setup.maxEpoch,
        nonce: setup.nonce,
      });

      // Get redirect URL based on current location
      const redirectUrl = `${window.location.origin}/auth/callback`;

      // Get Google OAuth URL and redirect
      const authUrl = getGoogleAuthUrl(setup.nonce, redirectUrl);

      window.location.href = authUrl;
    } catch (err) {
      console.error("Login setup failed:", err);
      setError(err instanceof Error ? err.message : "Failed to start login");
      setIsLoading(false);
    }
  }, []);

  if (authLoading) {
    return (
      <div className="w-full max-w-2xl mx-auto px-5 py-6 min-h-screen flex flex-col items-center justify-center bg-background">
        <div className="w-10 h-10 border-2 border-border border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto px-5 py-6 flex flex-col min-h-[90vh] bg-background">
      {/* Back Button */}
      <div className="pt-2 pb-2">
        <Link
          href="/"
          className="text-muted-foreground hover:text-foreground text-sm flex items-center gap-2 transition-colors"
        >
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
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back
        </Link>
      </div>

      {/* Hero Section */}
      <div className="flex-1 flex flex-col items-center justify-center text-center pt-5">
        {/* Logo */}
        <div className="w-18 h-18 mb-6 flex items-center justify-center shrink-0">
          <Image
            src="/logo-tma.png"
            alt="Abyss Protocol Logo"
            width={72}
            height={72}
            className="w-9 h-9 object-contain"
          />
        </div>

        {/* Title */}
        <h1 className="text-[26px] font-bold mb-2 text-foreground">
          Abyss Protocol
        </h1>
        <p className="text-muted-foreground text-[15px] mb-8">
          Private Intent Trading on Sui
        </p>

        {/* Features List */}
        <div className="w-full max-w-[340px] mb-6 flex flex-col gap-0.5 bg-card border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center gap-3.5 p-3.5 bg-transparent first:border-t-0 border-t border-border">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-green-600/10 text-green-600">
              <svg
                className="w-[18px] h-[18px]"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="text-left">
              <p className="text-[15px] font-medium text-foreground">
                No Private Keys
              </p>
              <p className="text-muted-foreground text-[13px]">
                Sign in with Google OAuth
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3.5 p-3.5 bg-transparent border-t border-border">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-primary/10 text-primary">
              <svg
                className="w-[18px] h-[18px]"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="text-left">
              <p className="text-[15px] font-medium text-foreground">
                Zero-Knowledge Proofs
              </p>
              <p className="text-muted-foreground text-[13px]">
                Privacy-preserving authentication
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3.5 p-3.5 bg-transparent border-t border-border">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-primary/15 text-primary">
              <svg
                className="w-[18px] h-[18px]"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
              </svg>
            </div>
            <div className="text-left">
              <p className="text-[15px] font-medium text-foreground">
                Private Trading
              </p>
              <p className="text-muted-foreground text-[13px]">
                Encrypted intents on DeepBook
              </p>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="w-full max-w-[340px] mb-4 p-3.5 px-4 bg-destructive/10 border border-destructive rounded-xl text-destructive text-sm text-center">
            {error}
          </div>
        )}

        {/* Login Button */}
        <button
          onClick={handleGoogleLogin}
          disabled={isLoading}
          className="w-full max-w-[340px] flex items-center justify-center gap-3 px-6 py-4 bg-primary text-primary-foreground border-none rounded-xl text-base font-semibold cursor-pointer transition-all duration-150 hover:bg-primary/90 hover:-translate-y-px active:translate-y-0 disabled:opacity-60 disabled:cursor-not-allowed shadow-md"
        >
          {isLoading ? (
            <>
              <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              <span>Connecting...</span>
            </>
          ) : (
            <>
              {/* Google Logo */}
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span>Continue with Google</span>
            </>
          )}
        </button>
      </div>

      {/* Footer */}
      <div className="pt-6 pb-4 text-center">
        <p className="text-muted-foreground text-xs">
          Secured by zkLogin on Sui Blockchain
        </p>
      </div>
    </div>
  );
}
