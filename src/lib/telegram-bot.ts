/**
 * Telegram Bot — NEAR Intents Cross-Chain Swaps
 *
 * Telegram bot that enables cross-chain token swaps through natural language
 * using the NEAR Intents 1-Click API. Powered by NearIntentsAgent.
 *
 * Commands:
 *   /start  — Welcome & setup info
 *   /help   — Available commands & examples
 *   /swap   — Start a cross-chain swap
 *   /tokens — List supported tokens
 *   /status — Check swap status
 *   /wallet — Link your wallet address
 */

import { Bot, Context, session, SessionFlavor } from "grammy";
import { NearIntentsAgent, type AgentResponse } from "./near-intents-agent";
import { isNearAccountConfigured, getNearAccountId } from "./near-transactions";

// ============== Types ==============

interface SessionData {
  /** User's wallet address (SUI/EVM) */
  walletAddress?: string;
}

/** Per-user NEAR credentials for auto-execution */
interface NearUserCredentials {
  accountId: string;
  privateKey: string;
}

type BotContext = Context & SessionFlavor<SessionData>;

// ============== Agent Pool & Credentials ==============

/** One NearIntentsAgent per chat to maintain swap state (pending quotes, etc.) */
const agents = new Map<string, NearIntentsAgent>();
/** Per-user NEAR credentials (in-memory, cleared on restart) */
const nearCredentials = new Map<string, NearUserCredentials>();
const AGENT_POOL_MAX = 500;

function getOrCreateAgent(chatId: string): NearIntentsAgent {
  let agent = agents.get(chatId);
  if (!agent) {
    agent = new NearIntentsAgent();
    agents.set(chatId, agent);

    // Evict oldest if pool grows too large
    if (agents.size > AGENT_POOL_MAX) {
      const oldest = agents.keys().next().value;
      if (oldest) agents.delete(oldest);
    }
  }
  return agent;
}

/** Build agent options from per-user state */
function getAgentOptions(chatId: string, walletAddress?: string) {
  const creds = nearCredentials.get(chatId);
  return {
    userAddress: walletAddress,
    nearAccountId: creds?.accountId,
    nearPrivateKey: creds?.privateKey,
    executionMode: (creds?.privateKey ? 'auto' : 'manual') as 'auto' | 'manual',
  };
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
    const userCreds = nearCredentials.get(chatId);
    const walletLinked = ctx.session.walletAddress
      ? `✅ Wallet: \`${ctx.session.walletAddress.slice(0, 10)}...${ctx.session.walletAddress.slice(-6)}\``
      : "⚠️ No wallet linked — use /wallet <address>";

    const nearStatus = userCreds
      ? `✅ Your NEAR Account: \`${userCreds.accountId}\` (auto-execution)`
      : nearOk
        ? `ℹ️ Server NEAR Account: \`${nearAccount}\``
        : "❌ No NEAR account — use /import to add yours";

    await ctx.reply(
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
        `/import — Import NEAR account for auto-execution\n` +
        `/delete — Remove imported NEAR account\n` +
        `/help — Full guide\n\n` +
        `*Setup:*\n` +
        `${nearStatus}\n` +
        `${walletLinked}`,
      {
        parse_mode: "Markdown",
        reply_markup: buildKeyboard([
          "Show tokens",
          "Help",
          "Swap 0.01 NEAR for SUI",
        ]),
      },
    );
  });

  // ─── /help ──────────────────────────────────────────

  bot.command("help", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const agent = getOrCreateAgent(chatId);
    const creds = nearCredentials.get(chatId);
    const response = await agent.processMessage("help", {
      userAddress: ctx.session.walletAddress,
      nearAccountId: creds?.accountId,
      nearPrivateKey: creds?.privateKey,
      executionMode: creds?.privateKey ? 'auto' : 'manual',
    });
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

  // ─── /import <accountId> <privateKey> ─────────────

  bot.command("import", async (ctx) => {
    const args = ctx.match?.trim();
    const chatId = ctx.chat.id.toString();

    if (!args) {
      const existing = nearCredentials.get(chatId);
      if (existing) {
        await ctx.reply(
          `🔑 *Your NEAR Account*\n\n` +
            `Account: \`${existing.accountId}\`\n` +
            `Status: ✅ Imported (auto-execution enabled)\n\n` +
            `Use /delete to remove your credentials.`,
          { parse_mode: "Markdown" },
        );
      } else {
        await ctx.reply(
          `🔑 *Import NEAR Account*\n\n` +
            `Import your NEAR account for auto-execution:\n` +
            `/import yourname.near ed25519:YourPrivateKey\n\n` +
            `⚠️ Your private key is stored in memory only and cleared when the bot restarts.\n` +
            `Only import keys for accounts you control.`,
          { parse_mode: "Markdown" },
        );
      }
      return;
    }

    const parts = args.split(/\s+/);
    if (parts.length < 2) {
      await ctx.reply(
        "⚠️ Usage: /import <account\\_id> <private\\_key>\n\n" +
          "Example: /import myaccount.near ed25519:ABC123...",
        { parse_mode: "Markdown" },
      );
      return;
    }

    const accountId = parts[0];
    const privateKey = parts.slice(1).join(' ');

    // Basic validation
    if (!accountId.includes('.') && accountId.length !== 64) {
      await ctx.reply("⚠️ Invalid NEAR account ID. Expected format: yourname.near or a 64-char implicit account.");
      return;
    }

    if (!privateKey.startsWith('ed25519:')) {
      await ctx.reply("⚠️ Private key should start with `ed25519:`. Please check your key format.", { parse_mode: "Markdown" });
      return;
    }

    // Store credentials
    nearCredentials.set(chatId, { accountId, privateKey });

    // Delete the user's message containing the private key for security
    try {
      await ctx.api.deleteMessage(ctx.chat.id, ctx.message!.message_id);
    } catch {
      // May fail if bot doesn't have delete permission
    }

    await ctx.reply(
      `✅ *NEAR Account Imported!*\n\n` +
        `Account: \`${accountId}\`\n` +
        `Auto-execution: *enabled*\n\n` +
        `Your swaps from NEAR will now execute automatically.\n` +
        `🔒 Your key is stored in memory only — it's cleared when the bot restarts.\n\n` +
        `Try: "swap 0.01 NEAR for SUI"`,
      {
        parse_mode: "Markdown",
        reply_markup: buildKeyboard(["Swap 0.01 NEAR for SUI", "Show tokens"]),
      },
    );
  });

  // ─── /delete — Remove imported credentials ────────

  bot.command("delete", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const had = nearCredentials.has(chatId);
    nearCredentials.delete(chatId);

    if (had) {
      await ctx.reply(
        "🗑️ *NEAR credentials removed.*\n\nYour account has been disconnected. Swaps will now show deposit addresses for manual sending.",
        { parse_mode: "Markdown" },
      );
    } else {
      await ctx.reply(
        "ℹ️ No NEAR credentials to remove. Use /import to add your NEAR account.",
      );
    }
  });

  // ─── Callback queries (inline button presses) ─────

  bot.on("callback_query:data", async (ctx) => {
    const data = ctx.callbackQuery.data;
    await ctx.answerCallbackQuery();

    if (!data.startsWith("agent:")) return;

    const actionText = data.slice(6); // Remove "agent:" prefix
    const chatId = ctx.chat?.id.toString() || "";
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
