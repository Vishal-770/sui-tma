/**
 * Telegram Webhook API Route — NEAR Intents Swap Bot
 *
 * Handles incoming Telegram updates via webhook (serverless).
 * Uses NearIntentsAgent to parse natural language and execute cross-chain swaps.
 *
 * Wallet connection methods:
 *   /connect   — Secure wallet link (Mini App or Web Link, no private keys)
 *   /import    — Legacy private key import (not recommended)
 *   /disconnect — Unlink NEAR account
 *
 * Setup:
 *   1. Set TELEGRAM_BOT_TOKEN and NEXT_PUBLIC_APP_URL in .env
 *   2. Deploy your app (e.g. to Vercel)
 *   3. Register webhook:
 *      curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
 *        -H "Content-Type: application/json" \
 *        -d '{"url": "https://your-domain.com/api/telegram/webhook"}'
 */

import { NextRequest, NextResponse } from "next/server";
import { type AgentResponse } from "@/lib/near-intents-agent";
import {
  isNearAccountConfigured,
  getNearAccountId,
} from "@/lib/near-transactions";
import {
  getOrCreateAgent,
  wallets,
  nearAccounts,
  nearLegacyCreds,
  getAgentOpts,
  createLinkSignature,
} from "@/lib/telegram-store";

// ============== Config ==============

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BOT_ENABLED = Boolean(TELEGRAM_TOKEN);
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

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
  const linked = nearAccounts.get(chatId.toString());
  const legacy = nearLegacyCreds.get(chatId.toString());
  const walletLine = wallet
    ? `✅ Wallet: \`${wallet.slice(0, 10)}...${wallet.slice(-6)}\``
    : "⚠️ No wallet linked — use /wallet <address>";

  const nearStatus = linked
    ? `✅ NEAR Wallet: \`${linked}\` (connected securely)`
    : legacy
      ? `✅ NEAR Account: \`${legacy.accountId}\` (imported — consider /connect instead)`
      : nearOk
        ? `ℹ️ Server NEAR Account: \`${nearAccount}\``
        : "❌ No NEAR account — use /connect to link yours";

  await sendMessage(
    chatId,
    `🚀 *Welcome to NEAR Intents Swap Bot!*\n\n` +
      `Cross-chain token swaps powered by NEAR Intents 1-Click API.\n\n` +
      `*How to swap — just type naturally:*\n` +
      `• "swap 0.01 NEAR for SUI"\n` +
      `• "swap 100 USDC for ETH"\n` +
      `• "quote 50 USDT to BTC"\n\n` +
      `*Commands:*\n` +
      `/connect — 🔗 Connect NEAR wallet (secure)\n` +
      `/disconnect — Unlink NEAR wallet\n` +
      `/swap — Start a swap\n` +
      `/tokens — Supported tokens\n` +
      `/status — Check swap status\n` +
      `/wallet — Link SUI/EVM receive address\n` +
      `/help — Full guide\n\n` +
      `*Setup:*\n` +
      `${nearStatus}\n` +
      `${walletLine}`,
    { reply_markup: buildKeyboard(["Connect NEAR", "Show tokens", "Swap 0.01 NEAR for SUI"]) },
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

    if (!chatId) return;

    // Handle "Connect NEAR" button press → show /connect options
    if (data === 'agent:Connect NEAR') {
      await handleConnectCommand(chatId);
      return;
    }

    // Handle "Disconnect" button press
    if (data === 'agent:disconnect') {
      nearAccounts.delete(chatId.toString());
      nearLegacyCreds.delete(chatId.toString());
      await sendMessage(chatId, "✅ NEAR wallet disconnected.", {
        reply_markup: buildKeyboard(["Connect NEAR", "Help"]),
      });
      return;
    }

    if (!data?.startsWith("agent:")) return;

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
  if (!message) return;

  const chat = message.chat as Record<string, unknown>;
  const chatId = chat.id as number;

  // ── Handle web_app_data from Telegram Mini App ──
  const webAppData = message.web_app_data as Record<string, unknown> | undefined;
  if (webAppData?.data) {
    try {
      const payload = JSON.parse(webAppData.data as string);
      if (payload.type === 'near_connect' && payload.accountId) {
        nearAccounts.set(chatId.toString(), payload.accountId);
        await sendMessage(
          chatId,
          `✅ *NEAR Wallet Connected!*\n\n` +
            `Account: \`${payload.accountId}\`\n\n` +
            `Your swaps will now use this account. No private keys were shared! 🔒\n\n` +
            `Try: "swap 0.01 NEAR for SUI"\n` +
            `Use /disconnect to unlink.`,
          { reply_markup: buildKeyboard(["Swap 0.01 NEAR for SUI", "Show tokens"]) },
        );
      }
    } catch {
      console.error('[Telegram] Failed to parse web_app_data');
    }
    return;
  }

  // If no text, skip
  if (!message.text) return;
  const text = (message.text as string).trim();

  // ── /start ──
  if (text === "/start") {
    await handleStart(chatId);
    return;
  }

  // ── /help ──
  if (text === "/help") {
    await sendChatAction(chatId);
    const agent = getOrCreateAgent(chatId.toString());
    const opts = getAgentOpts(chatId.toString());
    const response = await agent.processMessage("help", opts);
    await sendMessage(chatId, truncate(formatForTelegram(response)), {
      reply_markup: buildKeyboard(response.suggestedActions),
    });
    return;
  }

  // ── /connect — Secure NEAR wallet connection ──
  if (text === "/connect") {
    await handleConnectCommand(chatId);
    return;
  }

  // ── /disconnect — Unlink NEAR wallet ──
  if (text === "/disconnect" || text === "/delete") {
    const hadLink = nearAccounts.has(chatId.toString());
    const hadLegacy = nearLegacyCreds.has(chatId.toString());
    nearAccounts.delete(chatId.toString());
    nearLegacyCreds.delete(chatId.toString());

    if (hadLink || hadLegacy) {
      await sendMessage(
        chatId,
        "✅ *NEAR wallet disconnected.*\n\nYour account has been unlinked. Swaps will now show deposit addresses for manual sending.\n\nUse /connect to link a new wallet.",
        { reply_markup: buildKeyboard(["Connect NEAR", "Help"]) },
      );
    } else {
      await sendMessage(chatId, "ℹ️ No NEAR wallet linked. Use /connect to connect one.");
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

  // ── /import — Legacy private key import (multi-line safe) ──
  if (text.startsWith("/import")) {
    // Join all text after "/import" and split by whitespace (handles newlines)
    const rawArgs = text.replace(/^\/import/, '').replace(/\s+/g, ' ').trim();
    const parts = rawArgs.split(' ');

    if (parts.length < 2 || !parts[0] || !parts[1]) {
      await sendMessage(
        chatId,
        `⚠️ *Consider using /connect instead!*\n\n` +
          `/connect lets you link your NEAR wallet securely — no private keys sent through Telegram.\n\n` +
          `If you still want to import manually:\n` +
          `Usage: /import <nearAccountId> <privateKey>\n\n` +
          `Example:\n/import alice.near ed25519:5abc...`,
      );
      return;
    }

    const accountId = parts[0];
    // The private key may have been split — rejoin everything after accountId
    const privateKey = parts.slice(1).join('');

    // Auto-delete the user's message containing the private key
    try {
      await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/deleteMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, message_id: (message as Record<string, unknown>).message_id }),
      });
    } catch { /* best effort */ }

    // Validate
    if (!accountId.includes('.') && accountId.length !== 64) {
      await sendMessage(chatId, "⚠️ Invalid NEAR account ID. Expected: yourname.near or 64-char implicit account.");
      return;
    }
    if (!privateKey.startsWith('ed25519:')) {
      await sendMessage(chatId, "⚠️ Private key should start with `ed25519:`. Please check your key format.");
      return;
    }

    nearLegacyCreds.set(chatId.toString(), { accountId, privateKey });
    nearAccounts.set(chatId.toString(), accountId);

    await sendMessage(
      chatId,
      `✅ *NEAR Account Imported*\n\n` +
        `Account: \`${accountId}\`\n` +
        `Auto-execution: enabled\n\n` +
        `🔒 Credentials in memory only (cleared on restart).\n` +
        `⚠️ Your message was deleted for security.\n\n` +
        `💡 *Tip:* Next time use /connect for a more secure method — no private keys needed!`,
      { reply_markup: buildKeyboard(["Swap 0.01 NEAR for SUI", "Show tokens"]) },
    );
    return;
  }

  // Skip unrecognized commands
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

// ============== /connect Command =============================

async function handleConnectCommand(chatId: number) {
  const sig = createLinkSignature(chatId.toString());
  const webLinkUrl = `${APP_URL}/telegram/link-wallet?chatId=${chatId}&sig=${sig}`;
  const miniAppUrl = `${APP_URL}/telegram/connect-wallet`;

  // Check if already connected
  const existing = nearAccounts.get(chatId.toString());
  const statusLine = existing
    ? `\n✅ Currently connected: \`${existing}\`\n`
    : '';

  await sendMessage(
    chatId,
    `🔗 *Connect NEAR Wallet*${statusLine}\n\n` +
      `Choose how to connect:\n\n` +
      `*Option 1 — Mini App (Recommended)*\n` +
      `Tap the button below to open the wallet connector right here in Telegram.\n\n` +
      `*Option 2 — Web Link*\n` +
      `Open this link in your browser to connect:\n` +
      `[Connect via Browser](${webLinkUrl})\n\n` +
      `🔒 *Both methods are secure* — your private keys never leave your wallet. Only your account ID (e.g. \`alice.near\`) is shared with the bot.`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '🔗 Open Wallet Connector',
              web_app: { url: miniAppUrl },
            },
          ],
          [
            {
              text: '🌐 Open in Browser',
              url: webLinkUrl,
            },
          ],
          ...(existing
            ? [
                [
                  {
                    text: '❌ Disconnect Current',
                    callback_data: 'agent:disconnect',
                  },
                ],
              ]
            : []),
        ],
      },
    },
  );
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
    version: "4.0.0",
    enabled: BOT_ENABLED,
    nearAccount: isNearAccountConfigured() ? getNearAccountId() : null,
    features: [
      "cross-chain-swaps",
      "natural-language",
      "near-intents-1click",
      "secure-wallet-connect",
      "telegram-mini-app",
      "web-link-auth",
      "legacy-import",
    ],
  });
}
