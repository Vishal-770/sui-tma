import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Agent - NEAR Intents | Abyss Protocol",
  description:
    "Chat with our AI agent to perform cross-chain token swaps using NEAR Intents",
};

export default function AgentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
