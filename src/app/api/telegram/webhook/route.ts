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
  privyWallets,
  getAgentOpts,
  createLinkSignature,
} from "@/lib/telegram-store";
import {
  createPrivyUserAndWallet,
  isPrivyConfigured,  getNearBalance,} from "@/lib/privy";

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

async function sendPhoto(
  chatId: number,
  photoUrl: string,
  caption: string,
  options: Record<string, unknown> = {},
) {
  if (!TELEGRAM_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        photo: photoUrl,
        caption,
        parse_mode: 'Markdown',
        ...options,
      }),
    });
  } catch (err) {
    console.error('[Telegram] Failed to send photo:', err);
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

/**
 * Send an agent response to the user.
 * Intercepts `deposit_needed` responses for `/connect` users and sends
 * a "Sign Deposit" button that opens the sign-deposit Mini App page
 * instead of just an "approve in your wallet" message.
 */
async function sendAgentResponse(chatId: number, response: AgentResponse) {
  const opts = getAgentOpts(chatId.toString());
  const isClientSign = opts.executionMode === 'client-sign';

  if (response.type === 'deposit_needed' && isClientSign && response.data) {
    const sig = createLinkSignature(chatId.toString());
    const data = response.data;

    // Build sign-deposit URL with deposit params
    const params = new URLSearchParams({
      chatId: chatId.toString(),
      sig,
      depositAddress: String(data.depositAddress || ''),
      amount: String(data.amount || ''),
      originAsset: String(data.originAsset || ''),
      tokenSymbol: String(data.tokenSymbol || data.tokenInSymbol || ''),
      amountFormatted: String(data.amountFormatted || data.amountIn || ''),
      tokenOut: String(data.tokenOutSymbol || ''),
      amountOut: String(data.quote && typeof data.quote === 'object' && 'amountOutFormatted' in data.quote
        ? data.quote.amountOutFormatted
        : data.amountOut || ''),
    });

    const signUrl = `${APP_URL}/telegram/sign-deposit?${params.toString()}`;

    // Send a nicer message with a "Sign Deposit" button
    const text =
      `💳 *Deposit Required*\n\n` +
      `To complete your swap, please sign the deposit transaction with your NEAR wallet.\n\n` +
      `• *Send:* ${data.amountFormatted || data.amountIn} ${data.tokenSymbol || data.tokenInSymbol}\n` +
      `• *Receive:* ~${data.quote && typeof data.quote === 'object' && 'amountOutFormatted' in data.quote ? data.quote.amountOutFormatted : data.amountOut || '?'} ${data.tokenOutSymbol || '?'}\n` +
      `• *Deposit to:* \`${data.depositAddress}\`\n\n` +
      `Tap the button below to sign with your connected wallet:`;

    await sendMessage(chatId, text, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: '✅ Sign & Send Deposit',
              web_app: { url: signUrl },
            },
          ],
          [
            {
              text: '🌐 Open in Browser',
              url: signUrl,
            },
          ],
        ],
      },
    });
    return;
  }

  // Default: send as formatted text with suggested actions
  await sendMessage(chatId, truncate(formatForTelegram(response)), {
    reply_markup: buildKeyboard(response.suggestedActions),
  });
}

// ============== Command Handlers ==============

async function handleStart(chatId: number) {
  const nearOk = isNearAccountConfigured();
  const nearAccount = getNearAccountId();
  const wallet = wallets.get(chatId.toString());
  const linked = nearAccounts.get(chatId.toString());
  const legacy = nearLegacyCreds.get(chatId.toString());
  const privyEntry = privyWallets.get(chatId.toString());
  const walletLine = wallet
    ? `✅ Wallet: \`${wallet.slice(0, 10)}...${wallet.slice(-6)}\``
    : "⚠️ No wallet linked — use /wallet <address>";

  const nearStatus = privyEntry
    ? `✅ NEAR Wallet: \`${privyEntry.nearAddress.slice(0, 12)}...\` (Privy embedded — auto-sign enabled)`
    : linked
      ? `✅ NEAR Wallet: \`${linked}\` (connected securely)`
      : legacy
        ? `✅ NEAR Account: \`${legacy.accountId}\` (imported — consider /connect instead)`
        : nearOk
          ? `ℹ️ Server NEAR Account: \`${nearAccount}\``
          : "❌ No NEAR account — use /connect to create one";

  await sendMessage(
    chatId,
    `🚀 *Welcome to NEAR Intents Swap Bot!*\n\n` +
      `Cross-chain token swaps powered by NEAR Intents 1-Click API.\n\n` +
      `*How to swap — just type naturally:*\n` +
      `• "swap 1 NEAR for SUI"\n` +
      `• "swap 100 USDC for ETH"\n` +
      `• "quote 50 USDT to BTC"\n\n` +
      `*Commands:*\n` +
      `/connect — 🔗 Create or connect NEAR wallet\n` +
      `/balance — 💰 Check wallet balance\n` +
      `/fund — 💳 Fund your wallet\n` +
      `/disconnect — Unlink NEAR wallet\n` +
      `/tokens — Supported tokens\n` +
      `/status — Check swap status\n` +
      `/wallet — Link SUI/EVM receive address\n` +
      `/help — Full guide\n\n` +
      `*Setup:*\n` +
      `${nearStatus}\n` +
      `${walletLine}`,
    { reply_markup: buildKeyboard(["Connect NEAR", "Balance", "Show tokens"]) },
  );
}

async function handleBalanceCommand(chatId: number) {
  const privyEntry = privyWallets.get(chatId.toString());
  const linked = nearAccounts.get(chatId.toString());
  const nearAddr = privyEntry?.nearAddress || linked;

  if (!nearAddr) {
    await sendMessage(chatId, '⚠️ No NEAR wallet connected. Use /connect to create one.');
    return;
  }

  await sendChatAction(chatId);
  const balance = await getNearBalance(nearAddr);

  if (!balance.isInitialized) {
    await sendMessage(
      chatId,
      `💰 *Wallet Balance*\n\n` +
        `*Account:* \`${nearAddr}\`\n` +
        `*Status:* ❌ Not initialized\n\n` +
        `Send NEAR to this address to activate it.\nUse /fund to see your deposit address.`,
      { reply_markup: buildKeyboard(['Fund wallet', 'Help']) },
    );
    return;
  }

  await sendMessage(
    chatId,
    `💰 *Wallet Balance*\n\n` +
      `*Account:* \`${nearAddr}\`\n` +
      `*Total:* ${balance.nearBalance} NEAR\n` +
      `*Available:* ${balance.availableNear} NEAR\n\n` +
      `💡 Swap any amount: "swap 0.5 NEAR for SUI"`,
    { reply_markup: buildKeyboard([`Swap ${balance.availableNear} NEAR for SUI`, 'Fund wallet', 'Show tokens']) },
  );
}

async function handleFundCommand(chatId: number) {
  const privyEntry = privyWallets.get(chatId.toString());
  const linked = nearAccounts.get(chatId.toString());
  const nearAddr = privyEntry?.nearAddress || linked;

  if (!nearAddr) {
    await sendMessage(chatId, '⚠️ No NEAR wallet connected. Use /connect to create one first.');
    return;
  }

  // Generate QR code URL
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(nearAddr)}&size=300x300&format=png`;

  // Build Mini App URL for rich funding page
  const fundAppUrl = `${APP_URL}/telegram/fund?address=${encodeURIComponent(nearAddr)}&chatId=${chatId}`;

  // Send QR code as a photo with caption
  await sendPhoto(
    chatId,
    qrUrl,
    `💳 *Fund Your Wallet*\n\n` +
      `Send NEAR to this address:\n\`${nearAddr}\`\n\n` +
      `Scan the QR code above or tap the button below for the full funding page with copy button & wallet links.`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '📱 Open Funding Page', web_app: { url: fundAppUrl } }],
          [{ text: '📋 Copy Address', callback_data: `copy:${nearAddr}` }],
          [{ text: '💰 Check Balance', callback_data: 'agent:Balance' }],
        ],
      },
    },
  );
}

async function handleSwapCommand(chatId: number, args: string) {
  if (!args) {
    await sendMessage(
      chatId,
      `🔄 *How to Swap*\n\n` +
        `Just type naturally with any amounts:\n` +
        `• "swap 1 NEAR for SUI"\n` +
        `• "swap 100 USDC to ETH"\n` +
        `• "swap 0.5 NEAR for USDC"\n\n` +
        `You choose the amount! The bot supports 15+ chains including SUI, ETH, SOL, BTC, and more.`,
      {
        reply_markup: buildKeyboard([
          "Swap 1 NEAR for SUI",
          "Show tokens",
          "Balance",
        ]),
      },
    );
    return;
  }

  await sendChatAction(chatId);
  const agent = getOrCreateAgent(chatId.toString());
  const opts = getAgentOpts(chatId.toString());
  const response = await agent.processMessage(`swap ${args}`, opts);
  await sendAgentResponse(chatId, response);
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
      `✅ *Wallet Linked!*\n\nAddress: \`${address.slice(0, 12)}...${address.slice(-8)}\`\n\nTry: "swap 1 NEAR for SUI"`,
      { reply_markup: buildKeyboard(["Swap 1 NEAR for SUI", "Show tokens"]) },
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

    // Handle connect mode selection
    if (data === 'connect:privy') {
      await createPrivyWalletForChat(chatId);
      return;
    }
    if (data === 'connect:wallet') {
      await handleConnectCommand(chatId, 'wallet');
      return;
    }

    // Handle "Copy Address" from fund command
    if (data?.startsWith('copy:')) {
      const addr = data.slice(5);
      await sendMessage(chatId, `\`${addr}\`\n\nTap and hold the address above to copy it.`);
      return;
    }

    // Handle "Disconnect" button press
    if (data === 'agent:disconnect' || data === 'agent:Disconnect') {
      nearAccounts.delete(chatId.toString());
      nearLegacyCreds.delete(chatId.toString());
      privyWallets.delete(chatId.toString());
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
    await sendAgentResponse(chatId, response);
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
            `Try: "swap 1 NEAR for SUI"\n` +
            `Use /disconnect to unlink.`,
          { reply_markup: buildKeyboard(["Swap 1 NEAR for SUI", "Show tokens"]) },
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
    await sendAgentResponse(chatId, response);
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
    const hadPrivy = privyWallets.has(chatId.toString());
    nearAccounts.delete(chatId.toString());
    nearLegacyCreds.delete(chatId.toString());
    privyWallets.delete(chatId.toString());

    if (hadLink || hadLegacy || hadPrivy) {
      await sendMessage(
        chatId,
        "✅ *NEAR wallet disconnected.*\n\nYour account has been unlinked. Swaps will now show deposit addresses for manual sending.\n\nUse /connect to set up a new Privy wallet.",
        { reply_markup: buildKeyboard(["Connect NEAR", "Help"]) },
      );
    } else {
      await sendMessage(chatId, "ℹ️ No NEAR wallet linked. Use /connect to connect one.");
    }
    return;
  }

  // ── /balance — Check NEAR balance ──
  if (text === "/balance") {
    await handleBalanceCommand(chatId);
    return;
  }

  // ── /fund — Show deposit address ──
  if (text === "/fund") {
    await handleFundCommand(chatId);
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
    await sendAgentResponse(chatId, response);
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
    await sendAgentResponse(chatId, response);
    return;
  }

  if (text.startsWith("/wallet")) {
    const address = text.replace(/^\/wallet\s*/, "").trim();
    await handleWalletCommand(chatId, address);
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
      { reply_markup: buildKeyboard(["Swap 1 NEAR for SUI", "Show tokens"]) },
    );
    return;
  }

  // ── Natural language → Agent ──
  await sendChatAction(chatId);
  const agent = getOrCreateAgent(chatId.toString());
  const opts = getAgentOpts(chatId.toString());
  const response = await agent.processMessage(text, opts);
  await sendAgentResponse(chatId, response);
}

// ============== /connect Command =============================

async function handleConnectCommand(chatId: number, mode?: string) {
  // Check for existing Privy wallet
  const existingPrivy = privyWallets.get(chatId.toString());
  if (existingPrivy) {
    await sendMessage(
      chatId,
      `✅ *NEAR Wallet Already Connected (Privy)*\n\n` +
        `Account: \`${existingPrivy.nearAddress}\`\n\n` +
        `Your swaps will auto-execute from this wallet.\n` +
        `Use /disconnect to unlink.`,
      { reply_markup: buildKeyboard(["Balance", "Show tokens", "Disconnect"]) },
    );
    return;
  }

  // Check for existing browser-linked wallet
  const existingNear = nearAccounts.get(chatId.toString());
  if (existingNear) {
    await sendMessage(
      chatId,
      `✅ *NEAR Wallet Already Connected*\n\n` +
        `Account: \`${existingNear}\`\n\n` +
        `Use /disconnect first to switch wallets.`,
      { reply_markup: buildKeyboard(["Disconnect", "Show tokens"]) },
    );
    return;
  }

  // If mode specified, skip the choice menu
  if (mode === 'wallet') {
    // Connect external wallet via browser
    const sig = createLinkSignature(chatId.toString());
    const webLinkUrl = `${APP_URL}/telegram/link-wallet?chatId=${chatId}&sig=${sig}`;
    await sendMessage(
      chatId,
      `🔗 *Connect External NEAR Wallet*\n\n` +
        `Open this link to connect your HOT Wallet, MyNearWallet, or any NEAR wallet:\n\n` +
        `[Connect via Browser](${webLinkUrl})\n\n` +
        `After connecting, your swaps will require signing through the browser.`,
    );
    return;
  }

  if (mode === 'privy') {
    // Create Privy embedded wallet
    await createPrivyWalletForChat(chatId);
    return;
  }

  // Show choice menu: Privy (auto) or External wallet
  if (isPrivyConfigured()) {
    await sendMessage(
      chatId,
      `🔗 *Connect NEAR Wallet*\n\nChoose how to connect:\n\n` +
        `🤖 *Auto Wallet (Privy)* — Instant setup, bot signs for you automatically\n` +
        `🔑 *External Wallet* — Use your own HOT Wallet, MyNearWallet, etc.`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🤖 Create Auto Wallet (Privy)', callback_data: 'connect:privy' }],
            [{ text: '🔑 Connect External Wallet', callback_data: 'connect:wallet' }],
          ],
        },
      },
    );
  } else {
    // Privy not configured — only browser option
    const sig = createLinkSignature(chatId.toString());
    const webLinkUrl = `${APP_URL}/telegram/link-wallet?chatId=${chatId}&sig=${sig}`;
    await sendMessage(
      chatId,
      `🔗 *Connect NEAR Wallet*\n\n` +
        `Open this link in your browser to connect:\n` +
        `[Connect via Browser](${webLinkUrl})`,
    );
  }
}

async function createPrivyWalletForChat(chatId: number) {
  await sendMessage(chatId, `⏳ *Setting up your NEAR wallet...*\n\nCreating a secure embedded wallet via Privy. Please wait...`);

  try {
    const walletInfo = await createPrivyUserAndWallet(chatId);

    privyWallets.set(chatId.toString(), {
      privyUserId: walletInfo.privyUserId,
      walletId: walletInfo.walletId,
      nearAddress: walletInfo.nearAddress,
      telegramUserId: chatId,
    });

    await sendMessage(
      chatId,
      `✅ *NEAR Wallet Created!*\n\n` +
        `🔑 *Your NEAR Address:*\n\`${walletInfo.nearAddress}\`\n\n` +
        `To start swapping:\n\n` +
        `1️⃣ Fund your wallet — use /fund to see the address\n` +
        `2️⃣ Then say "swap 1 NEAR for SUI" (any amount!)\n` +
        `3️⃣ The bot will auto-sign deposits for you!\n\n` +
        `🔒 *Fully secure* — keys managed by Privy's TEE infrastructure.\n\n` +
        `Use /disconnect to unlink.`,
      { reply_markup: buildKeyboard(["Fund wallet", "Balance", "Show tokens"]) },
    );
  } catch (error) {
    console.error('[Privy] Failed to create wallet:', error);
    await sendMessage(
      chatId,
      `❌ *Wallet Setup Failed*\n\n${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease try again with /connect.`,
    );
  }
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
    version: "5.0.0",
    enabled: BOT_ENABLED,
    nearAccount: isNearAccountConfigured() ? getNearAccountId() : null,
    privyConfigured: isPrivyConfigured(),
    features: [
      "cross-chain-swaps",
      "natural-language",
      "near-intents-1click",
      "privy-embedded-wallets",
      "server-side-signing",
      "legacy-import",
    ],
  });
}
