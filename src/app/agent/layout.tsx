import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Manta - Cross-chain Intelligence | Abyss Protocol",
  description:
    "AI-powered cross-chain swaps across 15+ blockchains. Glide between chains with intelligent routing.",
};

export default function AgentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
