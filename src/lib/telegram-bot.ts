/**
 * Telegram Bot — NEAR Intents Cross-Chain Swaps
 *
 * Telegram bot that enables cross-chain token swaps through natural language
 * using the NEAR Intents 1-Click API. Powered by NearIntentsAgent.
 *
 * Commands:
 *   /start      — Welcome & setup info
 *   /help       — Available commands & examples
 *   /connect    — 🔗 Securely connect NEAR wallet (Mini App or Web Link)
 *   /disconnect — Unlink NEAR wallet
 *   /swap       — Start a cross-chain swap
 *   /tokens     — List supported tokens
 *   /status     — Check swap status
 *   /wallet     — Link your receive wallet address
 *   /import     — Legacy private key import (not recommended)
 */

import { Bot, Context, session, SessionFlavor } from "grammy";
import { type AgentResponse } from "./near-intents-agent";
import { isNearAccountConfigured, getNearAccountId } from "./near-transactions";
import {
  getOrCreateAgent,
  wallets,
  nearAccounts,
  nearLegacyCreds,
  getAgentOpts as getAgentOptsFromStore,
  createLinkSignature,
} from "./telegram-store";

// ============== Types ==============

interface SessionData {
  /** User's wallet address (SUI/EVM) */
  walletAddress?: string;
}

type BotContext = Context & SessionFlavor<SessionData>;

// ============== Config ==============

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

/** Build agent options — merges session wallet with shared store */
function getAgentOptions(chatId: string, walletAddress?: string) {
  const opts = getAgentOptsFromStore(chatId);
  if (walletAddress) opts.userAddress = walletAddress;
  return opts;
}

// ============== Formatting ==============

/**
 * Convert agent response markdown to Telegram MarkdownV1.
 * Telegram doesn't support tables — convert to plain text.
 */
function formatForTelegram(response: AgentResponse): string {
  let text = response.message;

  // Convert markdown tables to plain text lines
  text = text.replace(/\|[^\n]+\|/g, (line) => {
    // Skip separator rows  |---|---|
    if (/^\|[\s\-|]+\|$/.test(line)) return "";
    const cells = line
      .split("|")
      .filter((c) => c.trim())
      .map((c) => c.trim());
    if (cells.length === 2) {
      return `  ${cells[0]}: ${cells[1]}`;
    }
    return cells.join(" | ");
  });

  // Collapse excessive blank lines
  text = text.replace(/\n{3,}/g, "\n\n");

  return text;
}

/**
 * Build Telegram inline keyboard from agent's suggested actions.
 */
function buildKeyboard(suggestedActions?: string[]) {
  if (!suggestedActions || suggestedActions.length === 0) return undefined;

  const buttons = suggestedActions.map((action) => ({
    text: action,
    callback_data: `agent:${action.slice(0, 55)}`, // Telegram limit: 64 bytes
  }));

  // Arrange in rows of 2
  const rows: { text: string; callback_data: string }[][] = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }

  return { inline_keyboard: rows };
}

// ============== Bot Setup ==============

export function createTradingBot(token: string): Bot<BotContext> {
  const bot = new Bot<BotContext>(token);

  // Session middleware
  bot.use(
    session({
      initial: (): SessionData => ({
        walletAddress: undefined,
      }),
    }),
  );

  const nearAccount = getNearAccountId();
  const nearOk = isNearAccountConfigured();

  // ─── /start ─────────────────────────────────────────

  bot.command("start", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const linked = nearAccounts.get(chatId);
    const legacy = nearLegacyCreds.get(chatId);
    const walletLinked = ctx.session.walletAddress
      ? `✅ Wallet: \`${ctx.session.walletAddress.slice(0, 10)}...${ctx.session.walletAddress.slice(-6)}\``
      : "⚠️ No wallet linked — use /wallet <address>";

    const nearStatus = linked
      ? `✅ NEAR Wallet: \`${linked}\` (connected securely)`
      : legacy
        ? `✅ NEAR Account: \`${legacy.accountId}\` (imported — consider /connect instead)`
        : nearOk
          ? `ℹ️ Server NEAR Account: \`${nearAccount}\``
          : "❌ No NEAR account — use /connect to link yours";

    await ctx.reply(
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
        `${walletLinked}`,
      {
        parse_mode: "Markdown",
        reply_markup: buildKeyboard([
          "Connect NEAR",
          "Show tokens",
          "Swap 0.01 NEAR for SUI",
        ]),
      },
    );
  });

  // ─── /help ──────────────────────────────────────────

  bot.command("help", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const agent = getOrCreateAgent(chatId);
    const response = await agent.processMessage("help", getAgentOptions(chatId, ctx.session.walletAddress));
    await ctx.reply(formatForTelegram(response), {
      parse_mode: "Markdown",
      reply_markup: buildKeyboard(response.suggestedActions),
    });
  });

  // ─── /tokens [chain] ───────────────────────────────

  bot.command("tokens", async (ctx) => {
    const chain = ctx.match?.trim() || "";
    const chatId = ctx.chat.id.toString();
    const agent = getOrCreateAgent(chatId);

    await ctx.api.sendChatAction(chatId, "typing");

    const query = chain ? `tokens on ${chain}` : "tokens";
    const response = await agent.processMessage(query, getAgentOptions(chatId, ctx.session.walletAddress));
    let text = formatForTelegram(response);

    // Telegram messages max 4096 chars
    if (text.length > 4000) {
      text = text.slice(0, 3950) + "\n\n_...truncated. Try /tokens sui_";
    }

    await ctx.reply(text, {
      parse_mode: "Markdown",
      reply_markup: buildKeyboard(response.suggestedActions),
    });
  });

  // ─── /swap <natural language> ──────────────────────

  bot.command("swap", async (ctx) => {
    const args = ctx.match?.trim();
    if (!args) {
      await ctx.reply(
        `🔄 *How to Swap*\n\n` +
          `Type the swap command with amounts:\n` +
          `• /swap 0.01 NEAR for SUI\n` +
          `• /swap 100 USDC to ETH\n` +
          `• /swap 50 USDT for BTC\n\n` +
          `Or just type without /swap:\n` +
          `"swap 10 USDC for SUI"`,
        {
          parse_mode: "Markdown",
          reply_markup: buildKeyboard([
            "Swap 0.01 NEAR for SUI",
            "Swap 10 USDC for SUI",
            "Show tokens",
          ]),
        },
      );
      return;
    }

    const chatId = ctx.chat.id.toString();
    const agent = getOrCreateAgent(chatId);
    await ctx.api.sendChatAction(chatId, "typing");

    const response = await agent.processMessage(
      `swap ${args}`,
      getAgentOptions(chatId, ctx.session.walletAddress),
    );

    await ctx.reply(formatForTelegram(response), {
      parse_mode: "Markdown",
      reply_markup: buildKeyboard(response.suggestedActions),
    });
  });

  // ─── /status [depositAddress] ──────────────────────

  bot.command("status", async (ctx) => {
    const depositAddress = ctx.match?.trim();
    if (!depositAddress) {
      await ctx.reply(
        "Usage: /status <deposit\\_address>\n\n" +
          "Paste the deposit address from your swap to check its status.",
        { parse_mode: "Markdown" },
      );
      return;
    }

    const chatId = ctx.chat.id.toString();
    const agent = getOrCreateAgent(chatId);
    await ctx.api.sendChatAction(chatId, "typing");

    const response = await agent.processMessage(
      `status ${depositAddress}`,
      getAgentOptions(chatId, ctx.session.walletAddress),
    );

    await ctx.reply(formatForTelegram(response), {
      parse_mode: "Markdown",
      reply_markup: buildKeyboard(response.suggestedActions),
    });
  });

  // ─── /wallet <address> ─────────────────────────────

  bot.command("wallet", async (ctx) => {
    const address = ctx.match?.trim();

    if (!address) {
      if (ctx.session.walletAddress) {
        await ctx.reply(
          `🔗 *Linked Wallet*\n\n\`${ctx.session.walletAddress}\`\n\nTo change: /wallet <new\\_address>`,
          { parse_mode: "Markdown" },
        );
      } else {
        await ctx.reply(
          `🔗 *Link Your Wallet*\n\n` +
            `Send your wallet address:\n` +
            `/wallet 0x1234...abcd\n\n` +
            `This is needed so swapped tokens arrive at your wallet.`,
          { parse_mode: "Markdown" },
        );
      }
      return;
    }

    // Basic validation
    if (address.startsWith("0x") && address.length >= 42) {
      ctx.session.walletAddress = address;
      await ctx.reply(
        `✅ *Wallet Linked!*\n\nAddress: \`${address.slice(0, 12)}...${address.slice(-8)}\`\n\n` +
          `Cross-chain swaps will deliver tokens to this address.\nTry: "swap 0.01 NEAR for SUI"`,
        {
          parse_mode: "Markdown",
          reply_markup: buildKeyboard(["Swap 0.01 NEAR for SUI", "Show tokens"]),
        },
      );
    } else if (address.endsWith(".near") || address.endsWith(".testnet")) {
      await ctx.reply(
        `ℹ️ NEAR account is configured server-side.\nCurrent: \`${nearAccount || "not set"}\`\n\n` +
          `Use /wallet with your *SUI* or *EVM* address to receive swapped tokens.`,
        { parse_mode: "Markdown" },
      );
    } else {
      await ctx.reply(
        "⚠️ Invalid address format.\n\n" +
          "• SUI: 0x followed by 64 hex chars\n" +
          "• EVM: 0x followed by 40 hex chars",
      );
    }
  });

  // ─── Handle raw wallet addresses ───────────────────

  bot.hears(/^0x[a-fA-F0-9]{40,64}$/, async (ctx) => {
    const address = ctx.message?.text || "";
    ctx.session.walletAddress = address;
    await ctx.reply(
      `✅ *Wallet Linked!*\n\nAddress: \`${address.slice(0, 12)}...${address.slice(-8)}\`\n\nYou can now do cross-chain swaps!`,
      {
        parse_mode: "Markdown",
        reply_markup: buildKeyboard(["Swap 0.01 NEAR for SUI", "Show tokens"]),
      },
    );
  });

  // ─── /import <accountId> <privateKey> (legacy) ─────

  bot.command("import", async (ctx) => {
    const rawArgs = (ctx.match || '').replace(/\s+/g, ' ').trim();
    const chatId = ctx.chat.id.toString();

    if (!rawArgs) {
      const existing = nearAccounts.get(chatId) || nearLegacyCreds.get(chatId)?.accountId;
      if (existing) {
        await ctx.reply(
          `🔑 *Your NEAR Account*\n\n` +
            `Account: \`${existing}\`\n` +
            `Status: ✅ Connected\n\n` +
            `Use /disconnect to remove.`,
          { parse_mode: "Markdown" },
        );
      } else {
        await ctx.reply(
          `⚠️ *Consider using /connect instead!*\n\n` +
            `/connect lets you link your NEAR wallet securely — no private keys sent through Telegram.\n\n` +
            `If you still want to import manually:\n` +
            `/import yourname.near ed25519:YourPrivateKey\n\n` +
            `⚠️ Your private key is stored in memory only and cleared when the bot restarts.\n` +
            `🔒 We strongly recommend /connect for better security.`,
          { parse_mode: "Markdown" },
        );
      }
      return;
    }

    const parts = rawArgs.split(' ');
    if (parts.length < 2) {
      await ctx.reply(
        "⚠️ Usage: /import <account\\_id> <private\\_key>\n\n" +
          "Example: /import myaccount.near ed25519:ABC123...\n\n" +
          "💡 *Tip:* Use /connect for a more secure method!",
        { parse_mode: "Markdown" },
      );
      return;
    }

    const accountId = parts[0];
    // Rejoin everything after accountId — handles newline-split keys
    const privateKey = parts.slice(1).join('');

    // Validate
    if (!accountId.includes('.') && accountId.length !== 64) {
      await ctx.reply("⚠️ Invalid NEAR account ID. Expected: yourname.near or 64-char implicit account.");
      return;
    }

    if (!privateKey.startsWith('ed25519:')) {
      await ctx.reply("⚠️ Private key should start with `ed25519:`. Please check your key format.", { parse_mode: "Markdown" });
      return;
    }

    // Store credentials
    nearLegacyCreds.set(chatId, { accountId, privateKey });
    nearAccounts.set(chatId, accountId);

    // Delete the user's message containing the private key
    try {
      await ctx.api.deleteMessage(ctx.chat.id, ctx.message!.message_id);
    } catch {
      // May fail if bot doesn't have delete permission
    }

    await ctx.reply(
      `✅ *NEAR Account Imported!*\n\n` +
        `Account: \`${accountId}\`\n` +
        `Auto-execution: *enabled*\n\n` +
        `🔒 Key stored in memory only — cleared on restart.\n` +
        `⚠️ Your message was deleted for security.\n\n` +
        `💡 *Tip:* Next time use /connect for a more secure method — no private keys needed!`,
      {
        parse_mode: "Markdown",
        reply_markup: buildKeyboard(["Swap 0.01 NEAR for SUI", "Show tokens"]),
      },
    );
  });

  // ─── /connect — Secure NEAR wallet connection ─────

  bot.command("connect", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const sig = createLinkSignature(chatId);
    const webLinkUrl = `${APP_URL}/telegram/link-wallet?chatId=${chatId}&sig=${sig}`;
    const miniAppUrl = `${APP_URL}/telegram/connect-wallet`;

    const existing = nearAccounts.get(chatId);
    const statusLine = existing
      ? `\n✅ Currently connected: \`${existing}\`\n`
      : '';

    await ctx.reply(
      `🔗 *Connect NEAR Wallet*${statusLine}\n\n` +
        `Choose how to connect:\n\n` +
        `*Option 1 — Mini App (Recommended)*\n` +
        `Tap the button below to open the wallet connector right here in Telegram.\n\n` +
        `*Option 2 — Web Link*\n` +
        `Open this link in your browser to connect:\n` +
        `[Connect via Browser](${webLinkUrl})\n\n` +
        `🔒 *Both methods are secure* — your private keys never leave your wallet.`,
      {
        parse_mode: "Markdown",
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
  });

  // ─── /disconnect — Remove NEAR wallet link ────────

  bot.command("disconnect", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const hadLink = nearAccounts.has(chatId);
    const hadLegacy = nearLegacyCreds.has(chatId);
    nearAccounts.delete(chatId);
    nearLegacyCreds.delete(chatId);

    if (hadLink || hadLegacy) {
      await ctx.reply(
        "✅ *NEAR wallet disconnected.*\n\nYour account has been unlinked. Swaps will now show deposit addresses for manual sending.\n\nUse /connect to link a new wallet.",
        { parse_mode: "Markdown" },
      );
    } else {
      await ctx.reply("ℹ️ No NEAR wallet linked. Use /connect to connect one.");
    }
  });

  // ─── /delete — Alias for /disconnect ──────────────

  bot.command("delete", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const hadLink = nearAccounts.has(chatId);
    const hadLegacy = nearLegacyCreds.has(chatId);
    nearAccounts.delete(chatId);
    nearLegacyCreds.delete(chatId);

    if (hadLink || hadLegacy) {
      await ctx.reply(
        "✅ *NEAR credentials removed.*\n\nUse /connect to link a new wallet securely.",
        { parse_mode: "Markdown" },
      );
    } else {
      await ctx.reply("ℹ️ No NEAR credentials to remove. Use /connect to add one.");
    }
  });

  // ─── Callback queries (inline button presses) ─────

  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    await ctx.answerCallbackQuery();

    const chatId = ctx.chat?.id.toString() || "";

    // Handle "Connect NEAR" button → show /connect options
    if (data === 'agent:Connect NEAR') {
      const sig = createLinkSignature(chatId);
      const webLinkUrl = `${APP_URL}/telegram/link-wallet?chatId=${chatId}&sig=${sig}`;
      const miniAppUrl = `${APP_URL}/telegram/connect-wallet`;

      await ctx.reply(
        `🔗 *Connect NEAR Wallet*\n\nChoose how to connect:`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔗 Open Wallet Connector', web_app: { url: miniAppUrl } }],
              [{ text: '🌐 Open in Browser', url: webLinkUrl }],
            ],
          },
        },
      );
      return;
    }

    // Handle "Disconnect" button
    if (data === 'agent:disconnect') {
      nearAccounts.delete(chatId);
      nearLegacyCreds.delete(chatId);
      await ctx.reply("✅ NEAR wallet disconnected. Use /connect to link a new one.");
      return;
    }

    if (!data.startsWith("agent:")) return;

    const actionText = data.slice(6);
    const agent = getOrCreateAgent(chatId);

    const response = await agent.processMessage(
      actionText,
      getAgentOptions(chatId, ctx.session.walletAddress),
    );

    let text = formatForTelegram(response);
    if (text.length > 4000) {
      text = text.slice(0, 3950) + "\n\n_...message truncated_";
    }

    // Send as new message (editing can fail with different content types)
    await ctx.reply(text, {
      parse_mode: "Markdown",
      reply_markup: buildKeyboard(response.suggestedActions),
    });
  });

  // ─── Natural language catch-all ────────────────────

  bot.on("message:text", async (ctx) => {
    const message = ctx.message.text;

    // Skip commands (already handled above)
    if (message.startsWith("/")) return;

    const chatId = ctx.chat.id.toString();
    const agent = getOrCreateAgent(chatId);

    // Show typing indicator while agent processes
    await ctx.api.sendChatAction(chatId, "typing");

    const response = await agent.processMessage(
      message,
      getAgentOptions(chatId, ctx.session.walletAddress),
    );

    let text = formatForTelegram(response);
    if (text.length > 4000) {
      text = text.slice(0, 3950) + "\n\n_...message truncated_";
    }

    await ctx.reply(text, {
      parse_mode: "Markdown",
      reply_markup: buildKeyboard(response.suggestedActions),
    });
  });

  // ─── Error handling ────────────────────────────────

  bot.catch((err) => {
    console.error("[Telegram Bot] Error:", err);
  });

  return bot;
}

// ============== Main Entry Point (polling mode) ==============

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    console.error("❌ TELEGRAM_BOT_TOKEN not set in environment");
    process.exit(1);
  }

  console.log("🤖 Starting NEAR Intents Swap Bot...");
  console.log(`   NEAR Account: ${isNearAccountConfigured() ? getNearAccountId() : "NOT CONFIGURED"}`);
  console.log("   Dynamic wallets: /import to add per-user NEAR accounts");

  const bot = createTradingBot(token);

  await bot.start({
    onStart: () => {
      console.log("✅ Bot is running!");
      console.log("   Commands: /start, /swap, /tokens, /status, /wallet, /help");
    },
  });
}

// Run if executed directly
if (require.main === module) {
  main();
}

export default createTradingBot;
