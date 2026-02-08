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
 *   /balance    — Check wallet balance
 *   /fund       — Fund your wallet
 *   /wallet     — Link your receive wallet address
 */

import { Bot, Context, session, SessionFlavor } from "grammy";
import { type AgentResponse } from "./near-intents-agent";
import { isNearAccountConfigured, getNearAccountId } from "./near-transactions";
import {
  getOrCreateAgent,
  wallets,
  nearAccounts,
  nearLegacyCreds,
  privyWallets,
  getAgentOpts as getAgentOptsFromStore,
  createLinkSignature,
} from "./telegram-store";
import {
  createPrivyUserAndWallet,
  isPrivyConfigured,
  getNearBalance,
} from "./privy";

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

/**
 * Send an agent response, intercepting deposit_needed for client-sign users.
 * Opens a sign-deposit Mini App page instead of showing "approve in wallet".
 */
async function replyWithAgentResponse(
  ctx: BotContext,
  chatId: string,
  response: AgentResponse,
) {
  const opts = getAgentOptsFromStore(chatId);
  const isClientSign = opts.executionMode === 'client-sign';

  if (response.type === 'deposit_needed' && isClientSign && response.data) {
    const sig = createLinkSignature(chatId);
    const data = response.data;

    const params = new URLSearchParams({
      chatId,
      sig,
      depositAddress: String(data.depositAddress || ''),
      amount: String(data.amount || ''),
      originAsset: String(data.originAsset || ''),
      tokenSymbol: String(data.tokenSymbol || data.tokenInSymbol || ''),
      amountFormatted: String(data.amountFormatted || data.amountIn || ''),
      tokenOut: String(data.tokenOutSymbol || ''),
      amountOut: String(
        data.quote &&
          typeof data.quote === 'object' &&
          'amountOutFormatted' in data.quote
          ? data.quote.amountOutFormatted
          : data.amountOut || '',
      ),
    });

    const signUrl = `${APP_URL}/telegram/sign-deposit?${params.toString()}`;

    const text =
      `💳 *Deposit Required*\n\n` +
      `To complete your swap, sign the deposit with your NEAR wallet.\n\n` +
      `• *Send:* ${data.amountFormatted || data.amountIn} ${data.tokenSymbol || data.tokenInSymbol}\n` +
      `• *Receive:* ~${
        data.quote &&
        typeof data.quote === 'object' &&
        'amountOutFormatted' in data.quote
          ? data.quote.amountOutFormatted
          : data.amountOut || '?'
      } ${data.tokenOutSymbol || '?'}\n` +
      `• *Deposit to:* \`${data.depositAddress}\`\n\n` +
      `Tap the button below to sign with your connected wallet:`;

    await ctx.reply(text, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '✅ Sign & Send Deposit', web_app: { url: signUrl } }],
          [{ text: '🌐 Open in Browser', url: signUrl }],
        ],
      },
    });
    return;
  }

  // Default: send formatted text with suggested actions
  let text = formatForTelegram(response);
  if (text.length > 4000) {
    text = text.slice(0, 3950) + '\n\n_...message truncated_';
  }
  await ctx.reply(text, {
    parse_mode: 'Markdown',
    reply_markup: buildKeyboard(response.suggestedActions),
  });
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

    const privyEntry = privyWallets.get(chatId);
    const nearStatus = linked
      ? `✅ NEAR Wallet: \`${linked}\` (connected securely)`
      : privyEntry
        ? `✅ NEAR Wallet: \`${privyEntry.nearAddress}\` (auto-sign enabled)`
        : legacy
          ? `✅ NEAR Account: \`${legacy.accountId}\` (imported — consider /connect instead)`
          : nearOk
            ? `ℹ️ Server NEAR Account: \`${nearAccount}\``
            : "❌ No NEAR account — use /connect to link yours";

    await ctx.reply(
      `🚀 *Welcome to NEAR Intents Swap Bot!*\n\n` +
        `Cross-chain token swaps powered by NEAR Intents 1-Click API.\n\n` +
        `*How to swap — just type naturally:*\n` +
        `• "swap 1 NEAR for SUI"\n` +
        `• "swap 100 USDC for ETH"\n` +
        `• "quote 50 USDT to BTC"\n\n` +
        `*Commands:*\n` +
        `/connect — 🔗 Connect NEAR wallet\n` +
        `/balance — 💰 Check wallet balance\n` +
        `/fund — 💳 Fund your wallet\n` +
        `/disconnect — Unlink NEAR wallet\n` +
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
          "Balance",
          "Show tokens",
        ]),
      },
    );
  });

  // ─── /help ──────────────────────────────────────────

  bot.command("help", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const agent = getOrCreateAgent(chatId);
    const response = await agent.processMessage("help", getAgentOptions(chatId, ctx.session.walletAddress));
    await replyWithAgentResponse(ctx, chatId, response);
  });

  // ─── /tokens [chain] ───────────────────────────────

  bot.command("tokens", async (ctx) => {
    const chain = ctx.match?.trim() || "";
    const chatId = ctx.chat.id.toString();
    const agent = getOrCreateAgent(chatId);

    await ctx.api.sendChatAction(chatId, "typing");

    const query = chain ? `tokens on ${chain}` : "tokens";
    const response = await agent.processMessage(query, getAgentOptions(chatId, ctx.session.walletAddress));
    await replyWithAgentResponse(ctx, chatId, response);
  });

  // ─── /balance — Check NEAR wallet balance ──────────

  bot.command("balance", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const privyEntry = privyWallets.get(chatId);
    const linked = nearAccounts.get(chatId);
    const nearAddr = privyEntry?.nearAddress || linked;

    if (!nearAddr) {
      await ctx.reply("⚠️ No NEAR wallet connected. Use /connect to create one.", { parse_mode: "Markdown" });
      return;
    }

    await ctx.api.sendChatAction(chatId, "typing");
    const balance = await getNearBalance(nearAddr);

    if (!balance.isInitialized) {
      await ctx.reply(
        `💰 *Wallet Balance*\n\n` +
          `*Account:* \`${nearAddr}\`\n` +
          `*Status:* ❌ Not initialized\n\n` +
          `Send NEAR to this address to activate it.\nUse /fund to see your deposit address.`,
        { parse_mode: "Markdown", reply_markup: buildKeyboard(["Fund wallet", "Help"]) },
      );
      return;
    }

    await ctx.reply(
      `💰 *Wallet Balance*\n\n` +
        `*Account:* \`${nearAddr}\`\n` +
        `*Total:* ${balance.nearBalance} NEAR\n` +
        `*Available:* ${balance.availableNear} NEAR\n\n` +
        `💡 Swap any amount: "swap 0.5 NEAR for SUI"`,
      {
        parse_mode: "Markdown",
        reply_markup: buildKeyboard([`Swap ${balance.availableNear} NEAR for SUI`, "Fund wallet", "Show tokens"]),
      },
    );
  });

  // ─── /fund — Show deposit address to fund wallet ──

  bot.command("fund", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const privyEntry = privyWallets.get(chatId);
    const linked = nearAccounts.get(chatId);
    const nearAddr = privyEntry?.nearAddress || linked;

    if (!nearAddr) {
      await ctx.reply("⚠️ No NEAR wallet connected. Use /connect to create one first.", { parse_mode: "Markdown" });
      return;
    }

    await ctx.reply(
      `💳 *Fund Your Wallet*\n\n` +
        `Send NEAR to this address:\n\`${nearAddr}\`\n\n` +
        `*How to fund:*\n` +
        `1️⃣ Copy the address above\n` +
        `2️⃣ Go to your exchange (Binance, Coinbase, etc.)\n` +
        `3️⃣ Withdraw NEAR to this address\n` +
        `4️⃣ Use the *NEAR network* (not ERC-20)\n\n` +
        `After funding, use /balance to check your balance!`,
      { parse_mode: "Markdown", reply_markup: buildKeyboard(["Balance", "Show tokens", "Help"]) },
    );
  });

  // ─── /swap <natural language> ──────────────────────

  bot.command("swap", async (ctx) => {
    const args = ctx.match?.trim();
    if (!args) {
      await ctx.reply(
        `🔄 *How to Swap*\n\n` +
          `Just type naturally with any amount:\n` +
          `• "swap 1 NEAR for SUI"\n` +
          `• "swap 100 USDC to ETH"\n` +
          `• "swap 0.5 NEAR for USDC"\n\n` +
          `You choose the amount! Supports 15+ chains.`,
        {
          parse_mode: "Markdown",
          reply_markup: buildKeyboard([
            "Swap 1 NEAR for SUI",
            "Show tokens",
            "Balance",
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
    await replyWithAgentResponse(ctx, chatId, response);
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
    await replyWithAgentResponse(ctx, chatId, response);
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
          `Cross-chain swaps will deliver tokens to this address.\nTry: "swap 1 NEAR for SUI"`,
        {
          parse_mode: "Markdown",
          reply_markup: buildKeyboard(["Swap 1 NEAR for SUI", "Show tokens"]),
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
        reply_markup: buildKeyboard(["Swap 1 NEAR for SUI", "Show tokens"]),
      },
    );
  });

  // ─── /connect — Connect NEAR wallet (dual options) ──

  bot.command("connect", async (ctx) => {
    const chatId = ctx.chat.id.toString();

    // Check for existing Privy wallet
    const existingPrivy = privyWallets.get(chatId);
    if (existingPrivy) {
      await ctx.reply(
        `✅ *NEAR Wallet Already Connected (Privy)*\n\n` +
          `Account: \`${existingPrivy.nearAddress}\`\n\n` +
          `Your swaps will auto-execute from this wallet.\n` +
          `Use /disconnect to unlink.`,
        {
          parse_mode: "Markdown",
          reply_markup: buildKeyboard(["Balance", "Show tokens", "Disconnect"]),
        },
      );
      return;
    }

    // Check for existing browser-linked wallet
    const existingNear = nearAccounts.get(chatId);
    if (existingNear) {
      await ctx.reply(
        `✅ *NEAR Wallet Already Connected*\n\n` +
          `Account: \`${existingNear}\`\n\n` +
          `Use /disconnect first to switch wallets.`,
        { parse_mode: "Markdown", reply_markup: buildKeyboard(["Disconnect", "Show tokens"]) },
      );
      return;
    }

    // Show choice menu: Privy (auto) or External wallet
    if (isPrivyConfigured()) {
      await ctx.reply(
        `🔗 *Connect NEAR Wallet*\n\nChoose how to connect:\n\n` +
          `🤖 *Auto Wallet (Privy)* — Instant setup, bot signs for you\n` +
          `🔑 *External Wallet* — Use your own HOT Wallet, MyNearWallet, etc.`,
        {
          parse_mode: "Markdown",
          reply_markup: {
            inline_keyboard: [
              [{ text: '🤖 Create Auto Wallet (Privy)', callback_data: 'connect:privy' }],
              [{ text: '🔑 Connect External Wallet', callback_data: 'connect:wallet' }],
            ],
          },
        },
      );
    } else {
      const sig = createLinkSignature(chatId);
      const webLinkUrl = `${APP_URL}/telegram/link-wallet?chatId=${chatId}&sig=${sig}`;
      await ctx.reply(
        `🔗 *Connect NEAR Wallet*\n\nOpen this link in your browser to connect:\n[Connect via Browser](${webLinkUrl})`,
        { parse_mode: "Markdown" },
      );
    }
  });

  // ─── /disconnect — Remove NEAR wallet link ────────

  bot.command("disconnect", async (ctx) => {
    const chatId = ctx.chat.id.toString();
    const hadLink = nearAccounts.has(chatId);
    const hadLegacy = nearLegacyCreds.has(chatId);
    const hadPrivy = privyWallets.has(chatId);
    nearAccounts.delete(chatId);
    nearLegacyCreds.delete(chatId);
    privyWallets.delete(chatId);

    if (hadLink || hadLegacy || hadPrivy) {
      await ctx.reply(
        "✅ *NEAR wallet disconnected.*\n\nYour account has been unlinked. Swaps will now show deposit addresses for manual sending.\n\nUse /connect to set up a new Privy wallet.",
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
    const hadPrivy = privyWallets.has(chatId);
    nearAccounts.delete(chatId);
    nearLegacyCreds.delete(chatId);
    privyWallets.delete(chatId);

    if (hadLink || hadLegacy || hadPrivy) {
      await ctx.reply(
        "✅ *NEAR credentials removed.*\n\nUse /connect to set up a new Privy wallet.",
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

    // Handle connect:privy — Create Privy embedded wallet
    if (data === 'connect:privy') {
      const existingPrivy = privyWallets.get(chatId);
      if (existingPrivy) {
        await ctx.reply(
          `✅ *Already connected!*\n\nNEAR Address: \`${existingPrivy.nearAddress}\``,
          { parse_mode: "Markdown" },
        );
        return;
      }

      await ctx.reply(`⏳ *Setting up your NEAR wallet...*`, { parse_mode: "Markdown" });

      try {
        const chatIdNum = Number(chatId);
        const walletInfo = await createPrivyUserAndWallet(chatIdNum);

        privyWallets.set(chatId, {
          privyUserId: walletInfo.privyUserId,
          walletId: walletInfo.walletId,
          nearAddress: walletInfo.nearAddress,
          telegramUserId: chatIdNum,
        });

        await ctx.reply(
          `✅ *NEAR Wallet Created!*\n\n` +
            `🔑 *Your NEAR Address:*\n\`${walletInfo.nearAddress}\`\n\n` +
            `This is a Privy-managed embedded wallet. To start swapping:\n\n` +
            `1️⃣ Send NEAR to the address above\n` +
            `2️⃣ Then say "swap 1 NEAR for SUI"\n` +
            `3️⃣ The bot will auto-sign deposits for you!\n\n` +
            `🔒 *Fully secure* — keys are managed by Privy's TEE infrastructure.`,
          {
            parse_mode: "Markdown",
            reply_markup: buildKeyboard(["Balance", "Show tokens"]),
          },
        );
      } catch (error) {
        console.error('[Privy] Failed to create wallet:', error);
        await ctx.reply(
          `❌ Wallet setup failed: ${error instanceof Error ? error.message : 'Unknown error'}\n\nTry again with /connect`,
        );
      }
      return;
    }

    // Handle connect:wallet — Open browser link for external wallet
    if (data === 'connect:wallet') {
      const sig = createLinkSignature(chatId);
      const webLinkUrl = `${APP_URL}/telegram/link-wallet?chatId=${chatId}&sig=${sig}`;
      await ctx.reply(
        `🔗 *Connect External Wallet*\n\n` +
          `Open this link in your browser to connect your own NEAR wallet ` +
          `(HOT Wallet, MyNearWallet, etc.):\n\n` +
          `[Open Wallet Connection Page](${webLinkUrl})`,
        { parse_mode: "Markdown" },
      );
      return;
    }

    // Handle "Connect NEAR" button (legacy / agent keyboard)
    if (data === 'agent:Connect NEAR') {
      // Redirect to /connect flow
      if (isPrivyConfigured()) {
        await ctx.reply(
          `🔗 *Connect NEAR Wallet*\n\nChoose how to connect:`,
          {
            parse_mode: "Markdown",
            reply_markup: {
              inline_keyboard: [
                [{ text: '🤖 Create Auto Wallet (Privy)', callback_data: 'connect:privy' }],
                [{ text: '🔑 Connect External Wallet', callback_data: 'connect:wallet' }],
              ],
            },
          },
        );
      } else {
        const sig = createLinkSignature(chatId);
        const webLinkUrl = `${APP_URL}/telegram/link-wallet?chatId=${chatId}&sig=${sig}`;
        await ctx.reply(
          `🔗 *Connect NEAR Wallet*\n\n[Connect via Browser](${webLinkUrl})`,
          { parse_mode: "Markdown" },
        );
      }
      return;
    }

    // Handle "Disconnect" button
    if (data === 'agent:disconnect' || data === 'agent:Disconnect') {
      nearAccounts.delete(chatId);
      nearLegacyCreds.delete(chatId);
      privyWallets.delete(chatId);
      await ctx.reply("✅ NEAR wallet disconnected. Use /connect to set up a new one.");
      return;
    }

    if (!data.startsWith("agent:")) return;

    const actionText = data.slice(6);
    const agent = getOrCreateAgent(chatId);

    const response = await agent.processMessage(
      actionText,
      getAgentOptions(chatId, ctx.session.walletAddress),
    );

    // Send as new message (editing can fail with different content types)
    await replyWithAgentResponse(ctx, chatId, response);
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

    await replyWithAgentResponse(ctx, chatId, response);
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
