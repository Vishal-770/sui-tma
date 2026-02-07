/**
 * Telegram Webhook API Route — NEAR Intents Swap Bot
 *
 * Handles incoming Telegram updates via webhook (serverless).
 * Uses NearIntentsAgent to parse natural language and execute cross-chain swaps.
 *
 * Setup:
 *   1. Set TELEGRAM_BOT_TOKEN in .env.local
 *   2. Deploy your app (e.g. to Vercel)
 *   3. Register webhook:
 *      curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
 *        -H "Content-Type: application/json" \
 *        -d '{"url": "https://your-domain.com/api/telegram/webhook"}'
 */

import { NextRequest, NextResponse } from "next/server";
import { NearIntentsAgent, type AgentResponse } from "@/lib/near-intents-agent";
import {
  isNearAccountConfigured,
  getNearAccountId,
} from "@/lib/near-transactions";

// ============== Config ==============

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BOT_ENABLED = Boolean(TELEGRAM_TOKEN);

// ============== Agent Pool & Credentials ==============

const agents = new Map<string, NearIntentsAgent>();
const wallets = new Map<string, string>(); // chatId → wallet address
/** Per-user NEAR credentials (in-memory, cleared on redeploy) */
const nearCreds = new Map<string, { accountId: string; privateKey: string }>();
const AGENT_POOL_MAX = 500;

function getOrCreateAgent(chatId: string): NearIntentsAgent {
  let agent = agents.get(chatId);
  if (!agent) {
    agent = new NearIntentsAgent();
    agents.set(chatId, agent);
    if (agents.size > AGENT_POOL_MAX) {
      const oldest = agents.keys().next().value;
      if (oldest) {
        agents.delete(oldest);
        wallets.delete(oldest);
        nearCreds.delete(oldest);
      }
    }
  }
  return agent;
}

/** Build agent options from per-user state */
function getAgentOpts(chatId: string) {
  const wallet = wallets.get(chatId);
  const creds = nearCreds.get(chatId);
  return {
    userAddress: wallet,
    nearAccountId: creds?.accountId,
    nearPrivateKey: creds?.privateKey,
    executionMode: (creds?.privateKey ? 'auto' : 'manual') as 'auto' | 'manual',
  };
}

// ============== Telegram API Helpers ==============

async function sendMessage(
  chatId: number,
  text: string,
  options: Record<string, unknown> = {},
) {
  if (!TELEGRAM_TOKEN) return;

  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
        ...options,
      }),
    });
  } catch (err) {
    console.error("[Telegram] Failed to send message:", err);
  }
}

async function sendChatAction(chatId: number, action = "typing") {
  if (!TELEGRAM_TOKEN) return;
  try {
    await fetch(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendChatAction`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, action }),
      },
    );
  } catch {
    // Ignore typing indicator failures
  }
}

async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  if (!TELEGRAM_TOKEN) return;
  try {
    await fetch(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/answerCallbackQuery`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callback_query_id: callbackQueryId, text }),
      },
    );
  } catch {
    // Ignore
  }
}

// ============== Formatting ==============

function formatForTelegram(response: AgentResponse): string {
  let text = response.message;

  // Convert markdown tables → plain text
  text = text.replace(/\|[^\n]+\|/g, (line) => {
    if (/^\|[\s\-|]+\|$/.test(line)) return "";
    const cells = line
      .split("|")
      .filter((c) => c.trim())
      .map((c) => c.trim());
    if (cells.length === 2) return `  ${cells[0]}: ${cells[1]}`;
    return cells.join(" | ");
  });

  text = text.replace(/\n{3,}/g, "\n\n");
  return text;
}

function buildKeyboard(suggestedActions?: string[]) {
  if (!suggestedActions || suggestedActions.length === 0) return undefined;

  const buttons = suggestedActions.map((action) => ({
    text: action,
    callback_data: `agent:${action.slice(0, 55)}`,
  }));

  const rows: { text: string; callback_data: string }[][] = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }

  return { inline_keyboard: rows };
}

// ============== Command Handlers ==============

async function handleStart(chatId: number) {
  const nearOk = isNearAccountConfigured();
  const nearAccount = getNearAccountId();
  const wallet = wallets.get(chatId.toString());
  const creds = nearCreds.get(chatId.toString());
  const walletLine = wallet
    ? `✅ Wallet: \`${wallet.slice(0, 10)}...${wallet.slice(-6)}\``
    : "⚠️ No wallet linked — use /wallet <address>";

  const nearStatus = creds
    ? `✅ Your NEAR Account: \`${creds.accountId}\` (auto-execution)`
    : nearOk
      ? `ℹ️ Server NEAR Account: \`${nearAccount}\``
      : "❌ No NEAR account — use /import to add yours";

  await sendMessage(
    chatId,
    `🚀 *Welcome to NEAR Intents Swap Bot!*\n\n` +
      `Cross-chain token swaps powered by NEAR Intents 1-Click API.\n\n` +
      `*How to swap — just type naturally:*\n` +
      `• "swap 0.01 NEAR for SUI"\n` +
      `• "swap 100 USDC for ETH"\n` +
      `• "quote 50 USDT to BTC"\n\n` +
      `*Commands:*\n` +
      `/swap — Start a swap\n` +
      `/tokens — Supported tokens\n` +
      `/status — Check swap status\n` +
      `/wallet — Link your wallet\n` +
      `/import — Import NEAR account\n` +
      `/delete — Remove NEAR account\n` +
      `/help — Full guide\n\n` +
      `*Setup:*\n` +
      `${nearStatus}\n` +
      `${walletLine}`,
    { reply_markup: buildKeyboard(["Show tokens", "Help", "Swap 0.01 NEAR for SUI"]) },
  );
}

async function handleSwapCommand(chatId: number, args: string) {
  if (!args) {
    await sendMessage(
      chatId,
      `🔄 *How to Swap*\n\n` +
        `Type the swap command with amounts:\n` +
        `• /swap 0.01 NEAR for SUI\n` +
        `• /swap 100 USDC to ETH\n` +
        `• /swap 50 USDT for BTC\n\n` +
        `Or just type without /swap:\n` +
        `"swap 10 USDC for SUI"`,
      {
        reply_markup: buildKeyboard([
          "Swap 0.01 NEAR for SUI",
          "Swap 10 USDC for SUI",
          "Show tokens",
        ]),
      },
    );
    return;
  }

  await sendChatAction(chatId);
  const agent = getOrCreateAgent(chatId.toString());
  const opts = getAgentOpts(chatId.toString());
  const response = await agent.processMessage(`swap ${args}`, opts);
  const text = formatForTelegram(response);

  await sendMessage(chatId, truncate(text), {
    reply_markup: buildKeyboard(response.suggestedActions),
  });
}

async function handleWalletCommand(chatId: number, address: string) {
  if (!address) {
    const existing = wallets.get(chatId.toString());
    if (existing) {
      await sendMessage(
        chatId,
        `🔗 *Linked Wallet*\n\n\`${existing}\`\n\nTo change: /wallet <new\\_address>`,
      );
    } else {
      await sendMessage(
        chatId,
        `🔗 *Link Your Wallet*\n\nSend your wallet address:\n/wallet 0x1234...abcd\n\nThis is needed so swapped tokens arrive at your wallet.`,
      );
    }
    return;
  }

  if (address.startsWith("0x") && address.length >= 42) {
    wallets.set(chatId.toString(), address);
    await sendMessage(
      chatId,
      `✅ *Wallet Linked!*\n\nAddress: \`${address.slice(0, 12)}...${address.slice(-8)}\`\n\nTry: "swap 0.01 NEAR for SUI"`,
      { reply_markup: buildKeyboard(["Swap 0.01 NEAR for SUI", "Show tokens"]) },
    );
  } else if (address.endsWith(".near") || address.endsWith(".testnet")) {
    const nearAccount = getNearAccountId();
    await sendMessage(
      chatId,
      `ℹ️ NEAR account is configured server-side.\nCurrent: \`${nearAccount || "not set"}\`\n\nUse /wallet with your *SUI* or *EVM* address to receive swapped tokens.`,
    );
  } else {
    await sendMessage(
      chatId,
      "⚠️ Invalid address format.\n\n• SUI: 0x followed by 64 hex chars\n• EVM: 0x followed by 40 hex chars",
    );
  }
}

function truncate(text: string, max = 4000): string {
  return text.length > max
    ? text.slice(0, max - 50) + "\n\n_...message truncated_"
    : text;
}

// ============== Update Handler ==============

async function handleUpdate(update: Record<string, unknown>) {
  // ─── Callback queries (button presses) ─────────────
  const callbackQuery = update.callback_query as Record<string, unknown> | undefined;
  if (callbackQuery) {
    const queryId = callbackQuery.id as string;
    const data = callbackQuery.data as string;
    const msg = callbackQuery.message as Record<string, unknown> | undefined;
    const chat = msg?.chat as Record<string, unknown> | undefined;
    const chatId = chat?.id as number;

    await answerCallbackQuery(queryId);

    if (!data?.startsWith("agent:") || !chatId) return;

    const actionText = data.slice(6);
    const agent = getOrCreateAgent(chatId.toString());
    const opts = getAgentOpts(chatId.toString());

    await sendChatAction(chatId);
    const response = await agent.processMessage(actionText, opts);
    await sendMessage(chatId, truncate(formatForTelegram(response)), {
      reply_markup: buildKeyboard(response.suggestedActions),
    });
    return;
  }

  // ─── Regular messages ──────────────────────────────
  const message = update.message as Record<string, unknown> | undefined;
  if (!message?.text) return;

  const chat = message.chat as Record<string, unknown>;
  const chatId = chat.id as number;
  const text = (message.text as string).trim();

  // ── Commands ──

  if (text === "/start" || text === "/help") {
    if (text === "/help") {
      await sendChatAction(chatId);
      const agent = getOrCreateAgent(chatId.toString());
      const opts = getAgentOpts(chatId.toString());
      const response = await agent.processMessage("help", opts);
      await sendMessage(chatId, truncate(formatForTelegram(response)), {
        reply_markup: buildKeyboard(response.suggestedActions),
      });
    } else {
      await handleStart(chatId);
    }
    return;
  }

  if (text.startsWith("/swap")) {
    const args = text.replace(/^\/swap\s*/, "").trim();
    await handleSwapCommand(chatId, args);
    return;
  }

  if (text.startsWith("/tokens")) {
    const chain = text.replace(/^\/tokens\s*/, "").trim();
    const query = chain ? `tokens on ${chain}` : "tokens";
    await sendChatAction(chatId);
    const agent = getOrCreateAgent(chatId.toString());
    const opts = getAgentOpts(chatId.toString());
    const response = await agent.processMessage(query, opts);
    await sendMessage(chatId, truncate(formatForTelegram(response)), {
      reply_markup: buildKeyboard(response.suggestedActions),
    });
    return;
  }

  if (text.startsWith("/status")) {
    const depositAddr = text.replace(/^\/status\s*/, "").trim();
    if (!depositAddr) {
      await sendMessage(
        chatId,
        "Usage: /status <deposit\\_address>\n\nPaste the deposit address from your swap to check status.",
      );
      return;
    }
    await sendChatAction(chatId);
    const agent = getOrCreateAgent(chatId.toString());
    const opts = getAgentOpts(chatId.toString());
    const response = await agent.processMessage(`status ${depositAddr}`, opts);
    await sendMessage(chatId, truncate(formatForTelegram(response)), {
      reply_markup: buildKeyboard(response.suggestedActions),
    });
    return;
  }

  if (text.startsWith("/wallet")) {
    const address = text.replace(/^\/wallet\s*/, "").trim();
    await handleWalletCommand(chatId, address);
    return;
  }

  // /import <accountId> <privateKey>
  if (text.startsWith("/import")) {
    const parts = text.replace(/^\/import\s*/, "").trim().split(/\s+/);
    if (parts.length < 2) {
      await sendMessage(chatId, "Usage: /import <nearAccountId> <privateKey>\n\nExample:\n/import alice.near ed25519:5abc...\n\n⚠️ Your message will be auto-deleted for safety.");
      return;
    }
    const [accountId, privateKey] = parts;
    // Auto-delete the user's message containing the private key
    try {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/deleteMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, message_id: (message as Record<string, unknown>).message_id }),
      });
    } catch { /* best effort */ }
    nearCreds.set(chatId.toString(), { accountId, privateKey });
    await sendMessage(chatId, `✅ *NEAR Account Imported*\n\nAccount: \`${accountId}\`\nAuto-execution: enabled\n\n🔒 Credentials stored in memory only (cleared on server restart).\n⚠️ Your message was deleted for security.`, {
      reply_markup: buildKeyboard(["Swap 0.01 NEAR for SUI", "Show tokens"]),
    });
    return;
  }

  // /delete — remove imported NEAR credentials
  if (text === "/delete") {
    const had = nearCreds.has(chatId.toString());
    nearCreds.delete(chatId.toString());
    await sendMessage(chatId, had ? "✅ NEAR credentials removed." : "ℹ️ No imported credentials to remove.");
    return;
  }

  // Skip other unrecognized commands
  if (text.startsWith("/")) {
    await sendMessage(
      chatId,
      "Unknown command. Try /help for available commands.",
    );
    return;
  }

  // ── Raw wallet address ──
  if (/^0x[a-fA-F0-9]{40,64}$/.test(text)) {
    wallets.set(chatId.toString(), text);
    await sendMessage(
      chatId,
      `✅ *Wallet Linked!*\n\nAddress: \`${text.slice(0, 12)}...${text.slice(-8)}\`\n\nYou can now do cross-chain swaps!`,
      { reply_markup: buildKeyboard(["Swap 0.01 NEAR for SUI", "Show tokens"]) },
    );
    return;
  }

  // ── Natural language → Agent ──
  await sendChatAction(chatId);
  const agent = getOrCreateAgent(chatId.toString());
  const opts = getAgentOpts(chatId.toString());
  const response = await agent.processMessage(text, opts);

  await sendMessage(chatId, truncate(formatForTelegram(response)), {
    reply_markup: buildKeyboard(response.suggestedActions),
  });
}

// ============== Route Handlers ==============

export async function POST(req: NextRequest) {
  if (!BOT_ENABLED) {
    return NextResponse.json({ error: "Bot not configured" }, { status: 503 });
  }

  try {
    const update = await req.json();
    await handleUpdate(update);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[Telegram Webhook] Error:", error);
    return NextResponse.json({ error: "Webhook error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    bot: "NEAR Intents Swap Bot",
    version: "3.0.0",
    enabled: BOT_ENABLED,
    nearAccount: isNearAccountConfigured() ? getNearAccountId() : null,
    features: [
      "cross-chain-swaps",
      "natural-language",
      "near-intents-1click",
      "auto-execution",
    ],
  });
}
