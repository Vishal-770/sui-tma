"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ShieldCheck,
  Zap,
  Lock,
  ArrowRight,
  BarChart3,
  TrendingUp,
  Bot,
  Waves,
  Shield,
  Sparkles,
  Activity,
  Eye,
  Globe,
  MessageCircle,
  ExternalLink,
} from "lucide-react";
import Image from "next/image";

const modules = [
  {
    name: "Marlin",
    title: "Lightning-Fast Pool Explorer",
    description:
      "Real-time market data and liquidity analytics from DeepBook V3. Track pools, analyze assets, and monitor trading pairs with the fastest indexer in the ocean.",
    image: "/marlin.png",
    href: "/indexer",
    gradient: "from-blue-500/20 to-cyan-500/20",
    icon: BarChart3,
    features: ["Real-time Data", "Pool Analytics", "Asset Tracking"],
  },
  {
    name: "Barracuda",
    title: "Aggressive Trading Terminal",
    description:
      "Hunt the best prices with advanced trading tools. Swap tokens, place limit orders, execute flash arbitrage, and leverage margin trading on DeepBook V3.",
    image: "/Barracuda.png",
    href: "/trade",
    gradient: "from-red-500/20 to-orange-500/20",
    icon: TrendingUp,
    features: ["Instant Swaps", "Flash Arbitrage", "Margin Trading"],
  },
  {
    name: "Manta",
    title: "Cross-Chain Intelligence",
    description:
      "Glide effortlessly across 15+ blockchains with AI-powered routing. Execute cross-chain swaps with intelligent pathfinding and optimal fee management.",
    image: "/manta.png",
    href: "/agent",
    gradient: "from-purple-500/20 to-pink-500/20",
    icon: Bot,
    features: ["15+ Chains", "AI Routing", "Best Rates"],
  },
  {
    name: "Phantom",
    title: "Private Intent Trading",
    description:
      "Execute trades with complete privacy using encrypted intents. Your strategies remain invisible while automated execution finds the perfect conditions.",
    image: "/phantom.png",
    href: "/intents",
    gradient: "from-violet-500/20 to-indigo-500/20",
    icon: Shield,
    features: ["Encrypted Intents", "Auto Execution", "Privacy First"],
  },
];

const stats = [
  { label: "Blockchains", value: "15+", icon: Globe },
  { label: "Trading Volume", value: "$50M+", icon: Activity },
  { label: "Active Users", value: "10K+", icon: Eye },
  { label: "Uptime", value: "99.9%", icon: Zap },
];

export default function Home() {
  return (
    <div className="bg-background text-foreground min-h-screen">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Gradient Background */}
        <div className="absolute inset-0 bg-linear-to-br from-primary/5 via-background to-accent/5 pointer-events-none" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          {/* Hero Content */}
          <div className="text-center mb-16">
            <div className="flex items-center justify-center gap-3 mb-8">
              <div className="relative w-24 h-24 sm:w-28 sm:h-28">
                <Image
                  src="/logo-tma.png"
                  alt="Abyss Protocol Logo"
                  width={112}
                  height={112}
                  className="relative"
                  priority
                />
              </div>
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold mb-6 tracking-tight">
              Abyss Protocol
            </h1>

            <p className="text-xl sm:text-2xl text-muted-foreground mb-4 font-medium">
              Professional DeFi Trading on Sui
            </p>

            <p className="text-base sm:text-lg text-muted-foreground/80 mb-10 max-w-2xl mx-auto leading-relaxed">
              Enterprise-grade trading infrastructure with privacy, speed, and
              cross-chain intelligence. Built on DeepBook V3.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-4 mb-8">
              <Link href="/trade">
                <Button size="lg" className="h-12 px-8 text-base font-medium">
                  Launch Trading Terminal
                </Button>
              </Link>
              <Link href="/indexer">
                <Button
                  variant="outline"
                  size="lg"
                  className="h-12 px-8 text-base font-medium"
                >
                  Explore Markets
                </Button>
              </Link>
              <a
                href="https://t.me/DeepIntentBot"
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button
                  variant="outline"
                  size="lg"
                  className="h-12 px-8 text-base font-medium border-primary/30 hover:bg-primary/5"
                >
                  <Image
                    src="/telegram.png"
                    alt="Telegram"
                    width={50}
                    height={50}
                    className="mr-2"
                  />
                  Try Echo Bot
                </Button>
              </a>
            </div>

            {/* Telegram Bot Banner */}
            {/* <div className="mb-16 max-w-2xl mx-auto">
              <a
                href="https://t.me/DeepIntentBot"
                target="_blank"
                rel="noopener noreferrer"
                className="block group"
              >
                <Card className="border-primary/20 bg-primary/5 hover:bg-primary/10 transition-all duration-200 hover:border-primary/40">
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex items-center justify-center gap-3 text-center">
                      <MessageCircle className="w-5 h-5 text-primary shrink-0" />
                      <p className="text-sm sm:text-base font-medium">
                        <span className="text-foreground">Trade on Telegram:</span>
                        <span className="text-primary ml-2">@DeepIntentBot</span>
                      </p>
                      <ExternalLink className="w-4 h-4 text-primary shrink-0 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </CardContent>
                </Card>
              </a>
            </div> */}

            {/* Stats Bar */}
            <div className="mt-20 grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-4xl mx-auto">
              {stats.map((stat) => (
                <Card key={stat.label} className="border-muted/40 shadow-sm">
                  <CardContent className="p-5 text-center">
                    <stat.icon className="w-5 h-5 mx-auto mb-2 text-primary" />
                    <div className="text-2xl sm:text-3xl font-bold mb-1 tracking-tight">
                      {stat.value}
                    </div>
                    <div className="text-xs sm:text-sm text-muted-foreground font-medium">
                      {stat.label}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modules Section */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">
            Ocean-Powered Trading Suite
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-6">
            Four specialized modules working together to give you the deepest
            trading experience on Sui
          </p>
          
          {/* Telegram Bot CTA */}
          <div className="max-w-xl mx-auto my-20">
            <a
              href="https://t.me/DeepIntentBot"
              target="_blank"
              rel="noopener noreferrer"
              className="block group"
            >
              <Card className="border-primary/20 hover:border-primary/40 transition-all duration-200">
                <CardContent className="p-4">
                  <div className="flex items-center justify-center gap-3">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center">
                      <Image
                        src="/telegram.png"
                        alt="Telegram"
                        width={32}
                        height={32}
                      />
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-semibold text-foreground">
                        Also on Telegram: @DeepIntentBot
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Trade instantly from your mobile
                      </p>
                    </div>
                    <ExternalLink className="w-4 h-4 text-primary ml-auto group-hover:translate-x-1 transition-transform" />
                  </div>
                </CardContent>
              </Card>
            </a>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-16">
          {modules.map((module, index) => {
            const Icon = module.icon;
            return (
              <Link key={module.name} href={module.href}>
                <Card className="group hover:shadow-xl transition-all duration-200 border-muted/50 hover:border-primary/20 overflow-hidden h-full">
                  <CardContent className="relative p-6 sm:p-8">
                    <div className="flex flex-col sm:flex-row gap-6 items-start">
                      {/* Image */}
                      <div className="relative w-28 h-28 sm:w-32 sm:h-32 shrink-0 mx-auto sm:mx-0 bg-muted/30 rounded-xl p-2">
                        <Image
                          src={module.image}
                          alt={module.name}
                          width={128}
                          height={128}
                          className="relative w-full h-full object-contain"
                        />
                      </div>

                      {/* Content */}
                      <div className="flex-1 text-center sm:text-left space-y-3">
                        <div className="flex items-center gap-2.5 justify-center sm:justify-start">
                          <Icon className="w-5 h-5 text-primary" />
                          <h3 className="text-2xl font-bold tracking-tight">
                            {module.name}
                          </h3>
                        </div>

                        <p className="text-base font-semibold text-foreground/90">
                          {module.title}
                        </p>

                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {module.description}
                        </p>

                        {/* Features */}
                        <div className="flex flex-wrap gap-2 justify-center sm:justify-start pt-1">
                          {module.features.map((feature) => (
                            <span
                              key={feature}
                              className="px-2.5 py-1 rounded-md bg-muted text-foreground text-xs font-medium border border-border"
                            >
                              {feature}
                            </span>
                          ))}
                        </div>

                        <div className="flex items-center gap-2 pt-2 text-primary font-medium text-sm justify-center sm:justify-start group-hover:text-primary/80 transition-colors">
                          <span>Learn more</span>
                          <ArrowRight className="w-4 h-4" />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Features Section */}
      <div className="bg-muted/30 py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              Why Choose Abyss Protocol?
            </h2>
            <p className="text-lg text-muted-foreground">
              Built on cutting-edge technology for the modern DeFi trader
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="border-muted/50 shadow-sm">
              <CardContent className="p-8 text-center space-y-4">
                <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
                  <ShieldCheck className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold tracking-tight">
                  Maximum Privacy
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Encrypted intents and private execution through Nautilus TEE
                  ensure your trading strategies stay confidential
                </p>
              </CardContent>
            </Card>

            <Card className="border-muted/50 shadow-sm">
              <CardContent className="p-8 text-center space-y-4">
                <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
                  <Zap className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold tracking-tight">
                  Lightning Fast
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Powered by Sui's parallel execution and DeepBook V3's CLOB for
                  instant trades and real-time market data
                </p>
              </CardContent>
            </Card>

            <Card className="border-muted/50 shadow-sm">
              <CardContent className="p-8 text-center space-y-4">
                <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
                  <Lock className="w-8 h-8 text-primary" />
                </div>
                <h3 className="text-xl font-semibold tracking-tight">
                  Battle-Tested Security
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Built on Sui's Move language with audited smart contracts and
                  industry-leading security practices
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* How it Works Section */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold mb-4">How It Works</h2>
          <p className="text-lg text-muted-foreground">
            Get started with Abyss Protocol in three simple steps
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <div className="text-center space-y-4">
            <div className="w-16 h-16 rounded-xl bg-primary text-primary-foreground flex items-center justify-center text-2xl font-bold mx-auto shadow-sm">
              1
            </div>
            <h3 className="text-xl font-semibold tracking-tight">
              Connect Wallet
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Connect your Sui wallet or use zkLogin for seamless access to all
              trading features
            </p>
          </div>

          <div className="text-center space-y-4">
            <div className="w-16 h-16 rounded-xl bg-primary text-primary-foreground flex items-center justify-center text-2xl font-bold mx-auto shadow-sm">
              2
            </div>
            <h3 className="text-xl font-semibold tracking-tight">
              Choose Your Module
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Select from Marlin, Barracuda, Manta, or Phantom based on your
              trading needs
            </p>
          </div>

          <div className="text-center space-y-4">
            <div className="w-16 h-16 rounded-xl bg-primary text-primary-foreground flex items-center justify-center text-2xl font-bold mx-auto shadow-sm">
              3
            </div>
            <h3 className="text-xl font-semibold tracking-tight">
              Start Trading
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Execute trades, monitor markets, or set up automated strategies
              with ease
            </p>
          </div>
        </div>

        {/* Final CTA */}
        <div className="text-center mt-16">
          <Card className="border-muted/50 shadow-sm overflow-hidden max-w-3xl mx-auto">
            <CardContent className="relative p-8 sm:p-12 space-y-6">
              <h3 className="text-2xl sm:text-3xl font-bold tracking-tight">
                Ready to Get Started?
              </h3>
              <p className="text-base text-muted-foreground">
                Join thousands of traders using Abyss Protocol for professional
                DeFi trading on Sui
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center pt-2">
                <Link href="/trade">
                  <Button size="lg" className="w-full sm:w-auto h-12 px-8">
                    Launch Terminal
                  </Button>
                </Link>
                <Link href="/agent">
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full sm:w-auto h-12 px-8"
                  >
                    Explore Cross-Chain
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Telegram Bot Section - Prominent */}
        <div className="text-center mt-12">
          <a
            href="https://t.me/DeepIntentBot"
            target="_blank"
            rel="noopener noreferrer"
            className="block group"
          >
            <Card className="border-primary/30 shadow-lg overflow-hidden max-w-3xl mx-auto hover:shadow-xl hover:border-primary/50 transition-all duration-300">
              <CardContent className="relative p-8 sm:p-12">
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <div className="w-20 h-20 rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300">
                    <Image
                      src="/telegram.png"
                      alt="Telegram"
                      width={64}
                      height={64}
                    />
                  </div>
                  <div className="flex-1 text-center sm:text-left">
                    <h3 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
                      Trade on Telegram
                    </h3>
                    <p className="text-base text-muted-foreground mb-4">
                      Meet Echo - your intelligent trading assistant. Execute trades, check prices, and manage positions directly from Telegram.
                    </p>
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-primary/30 text-primary font-semibold group-hover:border-primary/50 transition-colors">
                      <span className="text-lg">@DeepIntentBot</span>
                      <ExternalLink className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </a>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-primary/10 py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-center text-muted-foreground">
            Built on Sui Blockchain • Powered by DeepBook V3 • Secured by
            Nautilus TEE
          </p>
        </div>
      </div>
    </div>
  );
}
