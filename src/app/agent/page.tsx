"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { useAuth } from "@/contexts/AuthContext";
import { useNearWallet } from "@/contexts/NearWalletContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Send,
  Bot,
  User,
  Loader2,
  Zap,
  ArrowLeft,
  Copy,
  Check,
  ExternalLink,
  Sparkles,
  Wallet,
  LogOut,
} from "lucide-react";
import Link from "next/link";
import type { AgentResponse, MessageType } from "@/lib/near-intents-agent";

// ============== Types ==============

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AgentData = Record<string, any>;

interface ChatMessage {
  id: string;
  role: "user" | "agent";
  content: string;
  type: MessageType;
  data?: AgentData;
  timestamp: number;
  suggestedActions?: string[];
}

// ============== Session ID ==============

function getSessionId(): string {
  if (typeof window === "undefined") return "server";
  let sessionId = sessionStorage.getItem("agent-session-id");
  if (!sessionId) {
    sessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    sessionStorage.setItem("agent-session-id", sessionId);
  }
  return sessionId;
}

// ============== Component ==============

export default function AgentPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // NEAR wallet via @hot-labs/near-connect
  const {
    accountId: nearAccountId,
    isConnected: nearConnected,
    isLoading: nearLoading,
    connect: connectNear,
    disconnect: disconnectNear,
    signAndSendTransaction,
  } = useNearWallet();

  // SUI wallet connection
  const dappKitAccount = useCurrentAccount();
  const { isAuthenticated, session } = useAuth();
  const activeAddress = dappKitAccount?.address || session?.zkLoginAddress;

  // When wallet is connected, use 'client-sign' so the agent returns deposit info for us to sign
  const executionMode = nearConnected ? "client-sign" : undefined;

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Send welcome message on mount
  useEffect(() => {
    if (messages.length === 0) {
      const welcomeMessage: ChatMessage = {
        id: "welcome",
        role: "agent",
        content: `👋 **Welcome to Manta!**

I'm your cross-chain intelligence assistant. I glide across **15+ blockchains** to find you the best swap rates.

**Try saying:**
• "Swap 100 USDC for SUI"
• "Show tokens on SUI"
• "What chains are supported?"

${activeAddress ? `✅ SUI Wallet: \`${activeAddress.slice(0, 8)}...${activeAddress.slice(-6)}\`` : "⚠️ Connect your SUI wallet to receive swapped tokens."}
${nearAccountId ? `✅ NEAR Wallet: \`${nearAccountId}\`` : "💡 **Tip:** Click the **Connect NEAR** button to link your NEAR wallet for cross-chain swaps."}`,
        type: "help",
        timestamp: Date.now(),
        suggestedActions: [
          "Show tokens on SUI",
          "Swap 10 USDC for SUI",
          "What chains are supported?",
          "Help",
        ],
      };
      setMessages([welcomeMessage]);
    }
  }, []);

  // Copy to clipboard
  const copyToClipboard = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  }, []);

  /**
   * Submit the tx hash to the server after wallet signing.
   */
  const submitTxHash = useCallback(
    async (txHash: string, depositAddress: string) => {
      try {
        const res = await fetch("/api/agent/deposit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ txHash, depositAddress }),
        });
        const data = await res.json();

        setMessages((prev) => [
          ...prev,
          {
            id: `txok-${Date.now()}`,
            role: "agent",
            content: `✅ **Deposit Sent!**\n\nTransaction: \`${txHash}\`\n\n🔄 Your swap is now being processed. It typically takes 1-5 minutes.\n\n[View on NEAR Explorer](https://nearblocks.io/txns/${txHash}) · [Track Swap](${data.explorerUrl || "#"})`,
            type: "execution",
            timestamp: Date.now(),
            suggestedActions: [`status ${depositAddress}`],
          },
        ]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: `txsubmiterr-${Date.now()}`,
            role: "agent",
            content: `✅ Transaction sent: \`${txHash}\`\n\n⚠️ Could not notify the relay, but your swap should still process. Track it on [NEAR Explorer](https://nearblocks.io/txns/${txHash}).`,
            type: "execution",
            timestamp: Date.now(),
            suggestedActions: [`status ${depositAddress}`],
          },
        ]);
      }
    },
    [],
  );

  /**
   * Use the connected NEAR wallet to sign the deposit transaction.
   * After signing, submit the tx hash to the server.
   */
  const handleWalletDeposit = useCallback(
    async (depositData: AgentData) => {
      const { depositAddress, originAsset, amount } = depositData;
      if (!depositAddress || !signAndSendTransaction) return;

      // Add a "signing" message
      const signingMsg: ChatMessage = {
        id: `signing-${Date.now()}`,
        role: "agent",
        content: "⏳ Requesting signature from your NEAR wallet...",
        type: "text",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, signingMsg]);

      try {
        // Build the transaction actions based on the origin asset type
        const assetId = String(originAsset || "");
        const rawAmount = String(amount || "0");

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let actions: any[];

        if (assetId === "native:near" || assetId === "nep141:wrap.near") {
          // Native NEAR → simple transfer
          actions = [
            {
              type: "Transfer",
              params: { deposit: rawAmount },
            },
          ];
        } else if (assetId.startsWith("nep141:")) {
          // NEP-141 token → ft_transfer_call on the token contract
          const tokenContract = assetId.replace("nep141:", "");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result: any = await signAndSendTransaction({
            receiverId: tokenContract,
            actions: [
              {
                type: "FunctionCall",
                params: {
                  methodName: "ft_transfer_call",
                  args: {
                    receiver_id: String(depositAddress),
                    amount: rawAmount,
                    msg: "",
                  },
                  gas: "100000000000000", // 100 TGas
                  deposit: "1", // 1 yoctoNEAR
                },
              },
            ],
          });

          const txHash =
            result?.transaction?.hash || result?.transaction_outcome?.id || "";
          await submitTxHash(txHash, String(depositAddress));
          return;
        } else {
          // Unknown asset type — fallback to transfer
          actions = [
            {
              type: "Transfer",
              params: { deposit: rawAmount },
            },
          ];
        }

        // Execute the transaction
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const result: any = await signAndSendTransaction({
          receiverId: String(depositAddress),
          actions,
        });

        const txHash =
          result?.transaction?.hash || result?.transaction_outcome?.id || "";
        await submitTxHash(txHash, String(depositAddress));
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : "Unknown error";
        setMessages((prev) => [
          ...prev,
          {
            id: `txerr-${Date.now()}`,
            role: "agent",
            content: `❌ **Transaction Failed**\n\n${errMsg}\n\nYou can try again or manually deposit using the address above.`,
            type: "error",
            timestamp: Date.now(),
            suggestedActions: ["Try again", "Help"],
          },
        ]);
      }
    },
    [signAndSendTransaction, submitTxHash],
  );

  // Send message to agent
  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      const userMessage: ChatMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text.trim(),
        type: "text",
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setInputText("");
      setIsLoading(true);

      try {
        const response = await fetch("/api/agent/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text.trim(),
            userAddress: activeAddress,
            nearAccountId: nearAccountId || undefined,
            executionMode,
            sessionId: getSessionId(),
          }),
        });

        const data: AgentResponse = await response.json();

        const agentMessage: ChatMessage = {
          id: `agent-${Date.now()}`,
          role: "agent",
          content: data.message,
          type: data.type,
          data: data.data,
          timestamp: Date.now(),
          suggestedActions: data.suggestedActions,
        };

        setMessages((prev) => [...prev, agentMessage]);

        // ── Auto-sign deposit with connected NEAR wallet ──
        if (
          data.type === "deposit_needed" &&
          data.data?.depositAddress &&
          nearConnected
        ) {
          await handleWalletDeposit(data.data);
        }
      } catch {
        const errorMessage: ChatMessage = {
          id: `error-${Date.now()}`,
          role: "agent",
          content: `Connection error. Please check your network and try again.`,
          type: "error",
          timestamp: Date.now(),
          suggestedActions: ["Try again"],
        };
        setMessages((prev) => [...prev, errorMessage]);
      } finally {
        setIsLoading(false);
        inputRef.current?.focus();
      }
    },
    [
      activeAddress,
      nearAccountId,
      nearConnected,
      executionMode,
      isLoading,
      handleWalletDeposit,
    ],
  );

  // Handle suggested action click
  const handleSuggestedAction = useCallback(
    (action: string) => {
      sendMessage(action);
    },
    [sendMessage],
  );

  // Handle form submit
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(inputText);
  };

  return (
    <div className="flex flex-col h-dvh bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm px-4 py-3 flex items-center gap-3 shrink-0">
        <Link
          href="/"
          className="p-1.5 rounded-lg hover:bg-accent transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>

        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
            <Bot className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-semibold flex items-center gap-1.5">
              NEAR Intents Agent
              <Sparkles className="w-3.5 h-3.5 text-primary" />
            </h1>
            <p className="text-[11px] text-muted-foreground">
              Cross-chain swaps for SUI
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* NEAR Wallet — via @hot-labs/near-connect */}
          {nearConnected && nearAccountId ? (
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="text-xs font-mono gap-1">
                <Wallet className="w-3 h-3 text-green-500" />
                {nearAccountId.length > 16
                  ? `${nearAccountId.slice(0, 8)}...`
                  : nearAccountId}
              </Badge>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={disconnectNear}
                title="Disconnect NEAR wallet"
              >
                <LogOut className="w-3 h-3" />
              </Button>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7 gap-1"
              onClick={connectNear}
              disabled={nearLoading}
            >
              {nearLoading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Wallet className="w-3 h-3" />
              )}
              Connect NEAR
            </Button>
          )}

          {/* SUI Wallet */}
          {activeAddress ? (
            <Badge variant="outline" className="text-xs font-mono">
              {activeAddress.slice(0, 6)}...{activeAddress.slice(-4)}
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-xs">
              No SUI wallet
            </Badge>
          )}
        </div>
      </header>

      {/* Messages Area */}
      <ScrollArea className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-4 space-y-4">
          {messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              onCopy={copyToClipboard}
              copiedText={copiedText}
              onSuggestedAction={handleSuggestedAction}
            />
          ))}

          {isLoading && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Bot className="w-4 h-4 text-primary" />
              </div>
              <div className="bg-card rounded-2xl rounded-tl-md px-4 py-3 border">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Thinking...
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="border-t bg-card/50 backdrop-blur-sm px-4 py-3 shrink-0">
        <form
          onSubmit={handleSubmit}
          className="max-w-3xl mx-auto flex items-center gap-2"
        >
          <Input
            ref={inputRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Ask me to swap tokens, get quotes, or check status..."
            className="flex-1 bg-background"
            disabled={isLoading}
            autoFocus
          />
          <Button
            type="submit"
            size="icon"
            disabled={isLoading || !inputText.trim()}
            className="shrink-0"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </form>
        <p className="text-[10px] text-muted-foreground text-center mt-2 max-w-3xl mx-auto">
          Powered by NEAR Intents Protocol &bull; Cross-chain swaps across 15+
          blockchains
        </p>
      </div>
    </div>
  );
}

// ============== Message Bubble Component ==============

function MessageBubble({
  message,
  onCopy,
  copiedText,
  onSuggestedAction,
}: {
  message: ChatMessage;
  onCopy: (text: string) => void;
  copiedText: string | null;
  onSuggestedAction: (action: string) => void;
}) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="flex items-start gap-3 justify-end">
        <div className="bg-primary text-primary-foreground rounded-2xl rounded-tr-md px-4 py-2.5 max-w-[85%]">
          <p className="text-sm whitespace-pre-wrap">{message.content}</p>
        </div>
        <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
          <User className="w-4 h-4 text-secondary-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
        <Bot className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 max-w-[85%] space-y-2">
        {/* Message content */}
        <div
          className={`rounded-2xl rounded-tl-md px-4 py-3 border ${
            message.type === "error"
              ? "bg-destructive/5 border-destructive/20"
              : "bg-card"
          }`}
        >
          <MarkdownContent
            content={message.content}
            onCopy={onCopy}
            copiedText={copiedText}
          />
        </div>

        {/* Deposit address copy button (for live quotes and deposit_needed) */}
        {(message.type === "live_quote" || message.type === "deposit_needed") &&
          message.data?.depositAddress && (
            <div className="flex flex-wrap items-center gap-2 px-1">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => onCopy(String(message.data!.depositAddress))}
              >
                {copiedText === String(message.data.depositAddress) ? (
                  <Check className="w-3 h-3 mr-1" />
                ) : (
                  <Copy className="w-3 h-3 mr-1" />
                )}
                Copy Deposit Address
              </Button>
              <a
                href={`https://explorer.near-intents.org/transactions/${String(message.data.depositAddress)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="ghost" size="sm" className="text-xs">
                  <ExternalLink className="w-3 h-3 mr-1" />
                  Explorer
                </Button>
              </a>
            </div>
          )}

        {/* Suggested actions */}
        {message.suggestedActions && message.suggestedActions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-1">
            {message.suggestedActions.map((action, i) => (
              <Button
                key={i}
                variant="outline"
                size="sm"
                className="text-xs h-7 px-2.5 rounded-full"
                onClick={() => onSuggestedAction(action)}
              >
                <Zap className="w-3 h-3 mr-1" />
                {action}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============== Markdown Renderer ==============

function MarkdownContent({
  content,
  onCopy,
  copiedText,
}: {
  content: string;
  onCopy: (text: string) => void;
  copiedText: string | null;
}) {
  // Simple markdown renderer for agent messages
  // Supports: **bold**, `code`, tables, links, lists, and line breaks

  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let inTable = false;
  let tableRows: string[][] = [];
  let tableKey = 0;

  const flushTable = () => {
    if (tableRows.length > 0) {
      elements.push(
        <div key={`table-${tableKey++}`} className="overflow-x-auto my-2">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr>
                {tableRows[0].map((cell, i) => (
                  <th
                    key={i}
                    className="text-left px-2 py-1.5 border-b font-medium text-muted-foreground"
                  >
                    <InlineMarkdown
                      text={cell.trim()}
                      onCopy={onCopy}
                      copiedText={copiedText}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.slice(2).map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td
                      key={ci}
                      className="px-2 py-1.5 border-b border-border/50"
                    >
                      <InlineMarkdown
                        text={cell.trim()}
                        onCopy={onCopy}
                        copiedText={copiedText}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      tableRows = [];
      inTable = false;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Table detection
    if (line.trim().startsWith("|")) {
      inTable = true;
      const cells = line
        .split("|")
        .filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
      // Skip separator rows (|---|---|)
      if (!/^\s*[-:]+\s*$/.test(cells[0]?.trim() || "")) {
        tableRows.push(cells);
      } else {
        tableRows.push(cells); // Keep separator for structure
      }
      continue;
    }

    if (inTable) {
      flushTable();
    }

    // Empty line
    if (line.trim() === "") {
      elements.push(<div key={`br-${i}`} className="h-2" />);
      continue;
    }

    // Bullet list
    if (/^[•\-\*]\s/.test(line.trim())) {
      elements.push(
        <div
          key={`li-${i}`}
          className="flex items-start gap-1.5 text-sm py-0.5 pl-1"
        >
          <span className="text-muted-foreground mt-0.5">•</span>
          <span>
            <InlineMarkdown
              text={line.trim().slice(2)}
              onCopy={onCopy}
              copiedText={copiedText}
            />
          </span>
        </div>,
      );
      continue;
    }

    // Numbered list
    if (/^\d+\.\s/.test(line.trim())) {
      const num = line.trim().match(/^(\d+)\./)?.[1];
      const text = line.trim().replace(/^\d+\.\s*/, "");
      elements.push(
        <div
          key={`ol-${i}`}
          className="flex items-start gap-1.5 text-sm py-0.5 pl-1"
        >
          <span className="text-primary font-medium min-w-5">{num}.</span>
          <span>
            <InlineMarkdown
              text={text}
              onCopy={onCopy}
              copiedText={copiedText}
            />
          </span>
        </div>,
      );
      continue;
    }

    // Regular text
    elements.push(
      <p key={`p-${i}`} className="text-sm leading-relaxed">
        <InlineMarkdown text={line} onCopy={onCopy} copiedText={copiedText} />
      </p>,
    );
  }

  flushTable(); // Flush any remaining table

  return <div className="space-y-0.5">{elements}</div>;
}

// ============== Inline Markdown ==============

function InlineMarkdown({
  text,
  onCopy,
  copiedText,
}: {
  text: string;
  onCopy: (text: string) => void;
  copiedText: string | null;
}) {
  // Parse inline markdown: **bold**, `code`, [links](url)
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining.length > 0) {
    // Bold
    const boldMatch = remaining.match(/\*\*(.+?)\*\*/);
    // Code
    const codeMatch = remaining.match(/`(.+?)`/);
    // Link
    const linkMatch = remaining.match(/\[(.+?)\]\((.+?)\)/);

    // Find earliest match
    const matches = [
      boldMatch
        ? { type: "bold", match: boldMatch, index: boldMatch.index! }
        : null,
      codeMatch
        ? { type: "code", match: codeMatch, index: codeMatch.index! }
        : null,
      linkMatch
        ? { type: "link", match: linkMatch, index: linkMatch.index! }
        : null,
    ]
      .filter(Boolean)
      .sort((a, b) => a!.index - b!.index);

    if (matches.length === 0) {
      parts.push(<span key={key++}>{remaining}</span>);
      break;
    }

    const first = matches[0]!;

    // Add text before the match
    if (first.index > 0) {
      parts.push(<span key={key++}>{remaining.slice(0, first.index)}</span>);
    }

    switch (first.type) {
      case "bold":
        parts.push(
          <strong key={key++} className="font-semibold">
            {first.match[1]}
          </strong>,
        );
        remaining = remaining.slice(first.index + first.match[0].length);
        break;

      case "code": {
        const codeText = first.match[1];
        parts.push(
          <code
            key={key++}
            className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono cursor-pointer hover:bg-muted/80 transition-colors inline-flex items-center gap-1"
            onClick={() => onCopy(codeText)}
            title="Click to copy"
          >
            {codeText.length > 20
              ? `${codeText.slice(0, 10)}...${codeText.slice(-8)}`
              : codeText}
            {copiedText === codeText ? (
              <Check className="w-3 h-3 text-green-500 inline" />
            ) : (
              <Copy className="w-2.5 h-2.5 text-muted-foreground inline" />
            )}
          </code>,
        );
        remaining = remaining.slice(first.index + first.match[0].length);
        break;
      }

      case "link":
        parts.push(
          <a
            key={key++}
            href={first.match[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2 hover:text-primary/80 inline-flex items-center gap-0.5"
          >
            {first.match[1]}
            <ExternalLink className="w-3 h-3 inline" />
          </a>,
        );
        remaining = remaining.slice(first.index + first.match[0].length);
        break;
    }
  }

  return <>{parts}</>;
}
