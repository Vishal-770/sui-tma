"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ShieldCheck,
  Zap,
  Lock,
  ArrowRight,
  BarChart3,
  TrendingUp,
} from "lucide-react";
import Image from "next/image";

export default function Home() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      <div className="mx-auto max-w-4xl px-4 py-12">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-6">
            <div className="w-16 h-16 bg-card flex items-center justify-center rounded-xl">
              <Image
                src="/logo-tma.png"
                alt="SuiTrader Logo"
                width={64}
                height={64}
              />
            </div>
          </div>

          <h1 className="text-4xl font-bold mb-4">SuiTrader</h1>
          <p className="text-xl text-muted-foreground mb-8">
            Private intent-based trading on Sui
          </p>
        </div>

        {/* Features */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="rounded-2xl bg-card p-6 text-center">
            <ShieldCheck className="w-12 h-12 mx-auto mb-4 text-primary" />
            <h3 className="text-lg font-semibold mb-2">Private</h3>
            <p className="text-muted-foreground">
              Encrypted trade intents ensure your strategies remain confidential
            </p>
          </div>

          <div className="rounded-2xl bg-card p-6 text-center">
            <Zap className="w-12 h-12 mx-auto mb-4 text-primary" />
            <h3 className="text-lg font-semibold mb-2">Fast</h3>
            <p className="text-muted-foreground">
              Lightning-fast execution through automated trading systems
            </p>
          </div>

          <div className="rounded-2xl bg-card p-6 text-center">
            <Lock className="w-12 h-12 mx-auto mb-4 text-primary" />
            <h3 className="text-lg font-semibold mb-2">Secure</h3>
            <p className="text-muted-foreground">
              Built on Sui blockchain with advanced security measures
            </p>
          </div>
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
          <Link href="/trade">
            <Button
              size="lg"
              className="w-full sm:w-auto flex items-center gap-2"
            >
              <TrendingUp className="w-5 h-5" />
              Start Trading
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>

          <Link href="/indexer">
            <Button
              variant="outline"
              size="lg"
              className="w-full sm:w-auto flex items-center gap-2"
            >
              <BarChart3 className="w-5 h-5" />
              View Indexer
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>

        {/* How it works */}
        <div className="rounded-2xl bg-card p-8">
          <h2 className="text-2xl font-semibold mb-6 text-center">
            How it works
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-lg font-bold mx-auto mb-4">
                1
              </div>
              <h3 className="text-lg font-semibold mb-2">Create Intent</h3>
              <p className="text-muted-foreground">
                Define your trading strategy with encrypted intent rules
              </p>
            </div>

            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-lg font-bold mx-auto mb-4">
                2
              </div>
              <h3 className="text-lg font-semibold mb-2">Submit to Network</h3>
              <p className="text-muted-foreground">
                Your intent is securely submitted to the Sui network
              </p>
            </div>

            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-lg font-bold mx-auto mb-4">
                3
              </div>
              <h3 className="text-lg font-semibold mb-2">Auto Execution</h3>
              <p className="text-muted-foreground">
                Nautilus TEE handles execution when conditions are met
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-muted-foreground mt-12">
          Built on Sui • Advanced Trading Technology
        </p>
      </div>
    </div>
  );
}
