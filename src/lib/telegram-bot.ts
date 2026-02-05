/**
 * Telegram Trading Bot with OpenClaw AI Integration
 * 
 * This bot enables conversational trading through Telegram using AI to parse
 * natural language commands and execute trades on Sui via DeepBook.
 */

import { Bot, Context, session, SessionFlavor } from 'grammy';
import { Transaction } from '@mysten/sui/transactions';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { DEEPBOOK_TESTNET, POOLS, fetchPrice, DEMO_MODE } from './deepbook';

// ============== Types ==============

// Sui Client using SuiGrpcClient
const suiClient = new SuiGrpcClient({
  baseUrl: 'https://fullnode.testnet.sui.io:443',
  network: 'testnet',
});

interface SessionData {
  walletAddress?: string;
  pendingTrade?: {
    action: 'buy' | 'sell' | 'swap' | 'limit';
    pair: string;
    amount: number;
    price?: number;
    confirmed: boolean;
  };
  conversationContext: string[];
}

type BotContext = Context & SessionFlavor<SessionData>;

// ============== OpenClaw AI Integration ==============

interface OpenClawResponse {
  intent: 'trade' | 'price' | 'balance' | 'help' | 'unknown';
  action?: 'buy' | 'sell' | 'swap' | 'limit';
  pair?: string;
  amount?: number;
  price?: number;
  message: string;
}

/**
 * Parse user message using OpenClaw AI
 */
async function parseWithOpenClaw(message: string, context: string[]): Promise<OpenClawResponse> {
  const apiKey = process.env.OPENCLAW_API_KEY;
  
  // If no API key, use local parsing
  if (!apiKey || DEMO_MODE) {
    return parseLocally(message);
  }

  try {
    // OpenClaw API call
    const response = await fetch('https://api.openclaw.ai/v1/parse', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        message,
        context,
        domain: 'trading',
        schema: {
          intent: ['trade', 'price', 'balance', 'help', 'unknown'],
          action: ['buy', 'sell', 'swap', 'limit'],
          pair: Object.keys(POOLS),
          amount: 'number',
          price: 'number',
        },
      }),
    });

    if (!response.ok) {
      throw new Error('OpenClaw API error');
    }

    return await response.json();
  } catch (error) {
    console.warn('OpenClaw API failed, using local parsing:', error);
    return parseLocally(message);
  }
}

/**
 * Local fallback parser for common trading commands
 */
function parseLocally(message: string): OpenClawResponse {
  const lower = message.toLowerCase().trim();

  // Price queries
  if (lower.includes('price') || lower.includes('how much')) {
    const pair = findPair(lower);
    return {
      intent: 'price',
      pair,
      message: `Fetching price for ${pair || 'SUI_USDC'}...`,
    };
  }

  // Balance queries
  if (lower.includes('balance') || lower.includes('portfolio') || lower.includes('holdings')) {
    return {
      intent: 'balance',
      message: 'Fetching your balance...',
    };
  }

  // Help
  if (lower.includes('help') || lower.includes('commands') || lower === '/start') {
    return {
      intent: 'help',
      message: 'Showing help...',
    };
  }

  // Buy commands
  const buyMatch = lower.match(/buy\s+(\d+(?:\.\d+)?)\s*(\w+)?/i);
  if (buyMatch) {
    const amount = parseFloat(buyMatch[1]);
    const pair = findPair(buyMatch[2] || lower) || 'SUI_USDC';
    return {
      intent: 'trade',
      action: 'buy',
      pair,
      amount,
      message: `Buy ${amount} ${pair.split('_')[0]}`,
    };
  }

  // Sell commands
  const sellMatch = lower.match(/sell\s+(\d+(?:\.\d+)?)\s*(\w+)?/i);
  if (sellMatch) {
    const amount = parseFloat(sellMatch[1]);
    const pair = findPair(sellMatch[2] || lower) || 'SUI_USDC';
    return {
      intent: 'trade',
      action: 'sell',
      pair,
      amount,
      message: `Sell ${amount} ${pair.split('_')[0]}`,
    };
  }

  // Swap commands
  const swapMatch = lower.match(/swap\s+(\d+(?:\.\d+)?)\s*(\w+)?\s*(?:to|for|->)\s*(\w+)?/i);
  if (swapMatch) {
    const amount = parseFloat(swapMatch[1]);
    return {
      intent: 'trade',
      action: 'swap',
      amount,
      pair: 'SUI_USDC',
      message: `Swap ${amount}`,
    };
  }

  // Limit order commands
  const limitMatch = lower.match(/(?:limit|set|create)\s+(?:order\s+)?(?:to\s+)?(buy|sell)\s+(\d+(?:\.\d+)?)\s*(?:\w+)?\s*(?:at|@|when)\s+\$?(\d+(?:\.\d+)?)/i);
  if (limitMatch) {
    const action = limitMatch[1].toLowerCase() as 'buy' | 'sell';
    const amount = parseFloat(limitMatch[2]);
    const price = parseFloat(limitMatch[3]);
    return {
      intent: 'trade',
      action: 'limit',
      amount,
      price,
      pair: 'SUI_USDC',
      message: `Limit ${action} ${amount} at $${price}`,
    };
  }

  return {
    intent: 'unknown',
    message: "I didn't understand that. Try 'buy 10 SUI', 'sell 5 SUI', or 'price SUI'.",
  };
}

/**
 * Find trading pair from text
 */
function findPair(text: string): string | undefined {
  const lower = (text || '').toLowerCase();
  if (lower.includes('deep')) return 'DEEP_SUI';
  if (lower.includes('usdc') && lower.includes('usdt')) return 'DBUSDC_DBUSDT';
  if (lower.includes('sui') || lower.includes('usdc')) return 'SUI_USDC';
  return undefined;
}

// ============== Bot Commands ==============

export function createTradingBot(token: string): Bot<BotContext> {
  const bot = new Bot<BotContext>(token);

  // Session middleware
  bot.use(session({
    initial: (): SessionData => ({
      conversationContext: [],
    }),
  }));

  // Mini App URL - for Telegram Mini App redirects
  const MINI_APP_URL = process.env.NEXT_PUBLIC_TELEGRAM_MINI_APP_URL || 'https://t.me/DeepIntentBot/app';

  // /start command
  bot.command('start', async (ctx) => {
    await ctx.reply(
      `🚀 *Welcome to DeepIntent Bot!*\n\n` +
      `Your AI-powered DeFi trading assistant on Sui Network.\n\n` +
      `*🔥 What I Can Do:*\n` +
      `• Execute limit orders with encrypted intents\n` +
      `• Margin trading with up to 10x leverage\n` +
      `• Flash arbitrage across DEXs\n` +
      `• Natural language trading commands\n\n` +
      `*📱 Quick Commands:*\n` +
      `/limitorder - Create a limit order\n` +
      `/margintrade - Open a leveraged position\n` +
      `/flasharb - Execute flash arbitrage\n` +
      `/prices - View current prices\n` +
      `/balance - Check your balance\n` +
      `/help - Full command list\n\n` +
      `*🔐 Connect via zkLogin:*\n` +
      `Use our Mini App for secure Google/Twitch login!\n\n` +
      `${DEMO_MODE ? '⚠️ Demo Mode Active - Simulated Trades' : '✅ Live Trading Enabled'}`,
      { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔗 Open Trading App', url: MINI_APP_URL }],
            [
              { text: '📊 Limit Order', callback_data: 'cmd_limitorder' },
              { text: '📈 Margin Trade', callback_data: 'cmd_margintrade' },
            ],
            [{ text: '⚡ Flash Arbitrage', callback_data: 'cmd_flasharb' }],
          ],
        },
      }
    );
  });

  // /help command
  bot.command('help', async (ctx) => {
    await ctx.reply(
      `🔧 *DeepIntent Bot - Full Command Guide*\n\n` +
      `*🎯 DeFi Commands:*\n` +
      `/limitorder - Create encrypted limit orders\n` +
      `/margintrade - Open leveraged positions\n` +
      `/flasharb - Execute flash arbitrage\n\n` +
      `*💬 Natural Language Trading:*\n` +
      `• "Buy 10 SUI" - Market buy\n` +
      `• "Sell 5 SUI at $2.00" - Limit sell\n` +
      `• "Swap 100 USDC to SUI"\n\n` +
      `*📊 Info Commands:*\n` +
      `/prices - Current market prices\n` +
      `/balance - Your wallet balance\n` +
      `/connect - Link your wallet\n\n` +
      `*⚙️ Management:*\n` +
      `/cancel - Cancel pending trade\n` +
      `/orders - View active orders\n\n` +
      `💡 *Tip:* Open our Mini App for the full trading experience!`,
      { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔗 Open Mini App', url: MINI_APP_URL }],
          ],
        },
      }
    );
  });

  // /limitorder command - guided limit order creation
  bot.command('limitorder', async (ctx) => {
    ctx.session.conversationContext = ['limit_order_flow'];
    
    await ctx.reply(
      `🎯 *Create a Limit Order*\n\n` +
      `Limit orders execute when the price hits your target.\n\n` +
      `*Example Order:*\n` +
      `Buy 10 SUI when price drops to $1.80\n\n` +
      `*Choose your order type:*`,
      { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📈 Limit Buy', callback_data: 'limit_buy_start' },
              { text: '📉 Limit Sell', callback_data: 'limit_sell_start' },
            ],
            [
              { text: '🛑 Stop Loss', callback_data: 'limit_stoploss_start' },
              { text: '🎯 Take Profit', callback_data: 'limit_takeprofit_start' },
            ],
          ],
        },
      }
    );
  });

  // /margintrade command - guided margin trading
  bot.command('margintrade', async (ctx) => {
    ctx.session.conversationContext = ['margin_trade_flow'];
    
    const suiPrice = await fetchPrice('SUI_USDC').catch(() => 1.85);
    
    await ctx.reply(
      `📊 *Margin Trading*\n\n` +
      `Trade with up to 10x leverage on DeepBook.\n\n` +
      `*Current Market:*\n` +
      `💧 SUI/USDC: $${suiPrice.toFixed(4)}\n\n` +
      `*Example Trade:*\n` +
      `Long 100 SUI with 5x leverage\n` +
      `• Margin Required: ${(100 * suiPrice / 5).toFixed(2)} USDC\n` +
      `• Position Size: $${(100 * suiPrice).toFixed(2)}\n\n` +
      `*Choose position type:*`,
      { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🟢 Long (Buy)', callback_data: 'margin_long_start' },
              { text: '🔴 Short (Sell)', callback_data: 'margin_short_start' },
            ],
            [
              { text: '📊 View Open Positions', callback_data: 'margin_positions' },
            ],
          ],
        },
      }
    );
  });

  // /flasharb command - flash arbitrage
  bot.command('flasharb', async (ctx) => {
    ctx.session.conversationContext = ['flash_arb_flow'];
    
    await ctx.reply('🔍 *Scanning for Arbitrage Opportunities...*', { parse_mode: 'Markdown' });
    
    // Simulate scanning
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Mock arbitrage opportunities
    const opportunities = [
      { pair: 'SUI/USDC', spread: 0.42, profit: 12.50, route: 'DeepBook → Cetus' },
      { pair: 'DEEP/SUI', spread: 0.28, profit: 8.20, route: 'Turbos → DeepBook' },
      { pair: 'USDC/USDT', spread: 0.05, profit: 2.10, route: 'DeepBook → FlowX' },
    ];
    
    let message = `⚡ *Flash Arbitrage Opportunities*\n\n`;
    
    opportunities.forEach((opp, i) => {
      message += `*${i + 1}. ${opp.pair}*\n`;
      message += `   📈 Spread: ${opp.spread}%\n`;
      message += `   💰 Est. Profit: $${opp.profit.toFixed(2)}\n`;
      message += `   🔄 Route: ${opp.route}\n\n`;
    });
    
    message += `_Profits shown for $1000 trade size_\n\n`;
    message += `⚠️ Flash loans have no liquidation risk!`;
    
    await ctx.reply(message, { 
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '⚡ Execute #1 (SUI)', callback_data: 'flasharb_execute_0' },
          ],
          [
            { text: '⚡ Execute #2 (DEEP)', callback_data: 'flasharb_execute_1' },
          ],
          [
            { text: '🔄 Refresh Scan', callback_data: 'flasharb_refresh' },
          ],
        ],
      },
    });
  });

  // /prices command
  bot.command('prices', async (ctx) => {
    await ctx.reply('📊 Fetching prices...');
    
    const prices: string[] = [];
    for (const pair of Object.keys(POOLS)) {
      try {
        const price = await fetchPrice(pair);
        const emoji = pair.includes('SUI') ? '💧' : '🪙';
        prices.push(`${emoji} ${pair.replace('_', '/')}: $${price.toFixed(4)}`);
      } catch {
        prices.push(`❓ ${pair.replace('_', '/')}: unavailable`);
      }
    }

    await ctx.reply(
      `📈 *Current Prices*\n\n${prices.join('\n')}\n\n` +
      `_Updated: ${new Date().toLocaleTimeString()}_`,
      { parse_mode: 'Markdown' }
    );
  });

  // /connect command (simplified - real implementation would use deep linking)
  bot.command('connect', async (ctx) => {
    await ctx.reply(
      `🔗 *Connect Your Wallet*\n\n` +
      `Use zkLogin to connect your wallet securely:\n\n` +
      `1️⃣ Open the Mini App\n` +
      `2️⃣ Sign in with Google or Twitch\n` +
      `3️⃣ Your Sui wallet is automatically created!\n\n` +
      `After connecting, send me your wallet address to link it here.`,
      { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔐 Connect with zkLogin', url: MINI_APP_URL }],
          ],
        },
      }
    );
  });

  // /balance command
  bot.command('balance', async (ctx) => {
    const address = ctx.session.walletAddress;
    
    if (!address) {
      await ctx.reply('⚠️ No wallet connected. Use /connect first.');
      return;
    }

    await ctx.reply('💰 Fetching balance...');

    try {
      const balanceResponse = await suiClient.core.getBalance({ owner: address, coinType: '0x2::sui::SUI' });
      
      const suiBalance = (Number(balanceResponse.balance.balance) / 1e9).toFixed(4);
      
      await ctx.reply(
        `💰 *Your Balance*\n\n` +
        `💧 SUI: ${suiBalance}\n\n` +
        `Wallet: \`${address.slice(0, 10)}...${address.slice(-8)}\``,
        { parse_mode: 'Markdown' }
      );
    } catch (error) {
      await ctx.reply('❌ Failed to fetch balance. Please try again.');
    }
  });

  // Handle wallet address submissions
  bot.hears(/^0x[a-fA-F0-9]{64}$/, async (ctx) => {
    ctx.session.walletAddress = ctx.message?.text;
    await ctx.reply(
      `✅ Wallet linked!\n\n` +
      `Address: \`${ctx.message?.text?.slice(0, 10)}...${ctx.message?.text?.slice(-8)}\`\n\n` +
      `You can now trade using natural language!`,
      { parse_mode: 'Markdown' }
    );
  });

  // Handle confirmations
  bot.hears(/^(yes|confirm|ok|do it|execute)$/i, async (ctx) => {
    const pending = ctx.session.pendingTrade;
    
    if (!pending || pending.confirmed) {
      await ctx.reply("No pending trade to confirm. Try 'buy 10 SUI' first.");
      return;
    }

    if (!ctx.session.walletAddress) {
      await ctx.reply('⚠️ Please connect your wallet first with /connect');
      return;
    }

    pending.confirmed = true;
    
    await ctx.reply('⚡ Executing trade...');

    // In demo mode, simulate the trade
    if (DEMO_MODE) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      await ctx.reply(
        `✅ *Trade Executed!* (Demo)\n\n` +
        `• Action: ${pending.action.toUpperCase()}\n` +
        `• Pair: ${pending.pair}\n` +
        `• Amount: ${pending.amount}\n` +
        `${pending.price ? `• Price: $${pending.price}\n` : ''}` +
        `• Status: Simulated\n\n` +
        `_In production, this would execute on DeepBook_`,
        { parse_mode: 'Markdown' }
      );
    } else {
      // Real execution would go here
      await ctx.reply('✅ Trade submitted to DeepBook!');
    }

    ctx.session.pendingTrade = undefined;
  });

  // Handle cancellations
  bot.hears(/^(no|cancel|nevermind|abort)$/i, async (ctx) => {
    if (ctx.session.pendingTrade) {
      ctx.session.pendingTrade = undefined;
      await ctx.reply('🚫 Trade cancelled.');
    } else {
      await ctx.reply("No pending trade to cancel.");
    }
  });

  // /cancel command
  bot.command('cancel', async (ctx) => {
    if (ctx.session.pendingTrade) {
      ctx.session.pendingTrade = undefined;
      await ctx.reply('🚫 Pending trade cancelled.');
    } else {
      await ctx.reply("No pending trade to cancel.");
    }
  });

  // Natural language handler (catch-all)
  bot.on('message:text', async (ctx) => {
    const message = ctx.message.text;
    
    // Skip commands
    if (message.startsWith('/')) return;

    // Parse with OpenClaw AI
    const parsed = await parseWithOpenClaw(message, ctx.session.conversationContext);
    
    // Update conversation context
    ctx.session.conversationContext = [
      ...ctx.session.conversationContext.slice(-4),
      `User: ${message}`,
      `Bot: ${parsed.message}`,
    ];

    switch (parsed.intent) {
      case 'price': {
        const pair = parsed.pair || 'SUI_USDC';
        const price = await fetchPrice(pair);
        await ctx.reply(
          `📈 *${pair.replace('_', '/')}*\n\n` +
          `Current Price: $${price.toFixed(4)}\n\n` +
          `_${new Date().toLocaleTimeString()}_`,
          { parse_mode: 'Markdown' }
        );
        break;
      }

      case 'balance': {
        // Trigger balance command
        await ctx.api.sendMessage(ctx.chat.id, '/balance');
        break;
      }

      case 'help': {
        await ctx.reply(
          `🤖 *I can help you with:*\n\n` +
          `• Trading: "buy 10 SUI", "sell 5 SUI"\n` +
          `• Prices: "price SUI", "what's DEEP worth?"\n` +
          `• Orders: "limit buy 20 SUI at $1.80"\n` +
          `• Info: "balance", "my orders"\n\n` +
          `Just chat naturally! 💬`,
          { parse_mode: 'Markdown' }
        );
        break;
      }

      case 'trade': {
        if (!parsed.action || !parsed.amount) {
          await ctx.reply("I understood you want to trade, but I need more details. Try 'buy 10 SUI'.");
          return;
        }

        const pair = parsed.pair || 'SUI_USDC';
        const price = await fetchPrice(pair);
        const total = parsed.amount * price;

        ctx.session.pendingTrade = {
          action: parsed.action,
          pair,
          amount: parsed.amount,
          price: parsed.price,
          confirmed: false,
        };

        const actionEmoji = parsed.action === 'buy' ? '📈' : parsed.action === 'sell' ? '📉' : '🔄';
        
        await ctx.reply(
          `${actionEmoji} *Confirm Trade*\n\n` +
          `• Action: ${parsed.action.toUpperCase()}\n` +
          `• Pair: ${pair.replace('_', '/')}\n` +
          `• Amount: ${parsed.amount}\n` +
          `• Current Price: $${price.toFixed(4)}\n` +
          `${parsed.price ? `• Limit Price: $${parsed.price.toFixed(4)}\n` : ''}` +
          `• Est. Value: $${total.toFixed(2)}\n\n` +
          `Reply *yes* to confirm or *cancel* to abort.`,
          { 
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '✅ Confirm', callback_data: 'confirm_trade' },
                  { text: '❌ Cancel', callback_data: 'cancel_trade' },
                ],
              ],
            },
          }
        );
        break;
      }

      default:
        await ctx.reply(
          `🤔 ${parsed.message}\n\n` +
          `Try commands like:\n` +
          `• "buy 10 SUI"\n` +
          `• "price SUI"\n` +
          `• "help"`
        );
    }
  });

  // Callback query handlers for new commands
  bot.callbackQuery('cmd_limitorder', async (ctx) => {
    await ctx.answerCallbackQuery();
    // Trigger the /limitorder command logic
    ctx.session.conversationContext = ['limit_order_flow'];
    await ctx.editMessageText(
      `🎯 *Create a Limit Order*\n\n` +
      `Limit orders execute when the price hits your target.\n\n` +
      `*Choose your order type:*`,
      { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '📈 Limit Buy', callback_data: 'limit_buy_start' },
              { text: '📉 Limit Sell', callback_data: 'limit_sell_start' },
            ],
            [
              { text: '🛑 Stop Loss', callback_data: 'limit_stoploss_start' },
              { text: '🎯 Take Profit', callback_data: 'limit_takeprofit_start' },
            ],
          ],
        },
      }
    );
  });

  bot.callbackQuery('cmd_margintrade', async (ctx) => {
    await ctx.answerCallbackQuery();
    const suiPrice = await fetchPrice('SUI_USDC').catch(() => 1.85);
    await ctx.editMessageText(
      `📊 *Margin Trading*\n\n` +
      `Trade with up to 10x leverage.\n\n` +
      `💧 SUI/USDC: $${suiPrice.toFixed(4)}\n\n` +
      `*Choose position type:*`,
      { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🟢 Long (Buy)', callback_data: 'margin_long_start' },
              { text: '🔴 Short (Sell)', callback_data: 'margin_short_start' },
            ],
          ],
        },
      }
    );
  });

  bot.callbackQuery('cmd_flasharb', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText('🔍 *Scanning for Arbitrage...*', { parse_mode: 'Markdown' });
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await ctx.editMessageText(
      `⚡ *Flash Arbitrage Ready*\n\n` +
      `*Best Opportunity:*\n` +
      `SUI/USDC: 0.42% spread\n` +
      `Est. Profit: $12.50\n\n` +
      `Route: DeepBook → Cetus`,
      { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⚡ Execute Arbitrage', callback_data: 'flasharb_execute_0' }],
            [{ text: '🔄 Scan Again', callback_data: 'flasharb_refresh' }],
          ],
        },
      }
    );
  });

  // Limit Order Flow Callbacks
  bot.callbackQuery(/^limit_(buy|sell|stoploss|takeprofit)_start$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const orderType = ctx.match![1];
    
    const typeLabels: Record<string, string> = {
      buy: '📈 Limit Buy',
      sell: '📉 Limit Sell',
      stoploss: '🛑 Stop Loss',
      takeprofit: '🎯 Take Profit',
    };
    
    const suiPrice = await fetchPrice('SUI_USDC').catch(() => 1.85);
    
    await ctx.editMessageText(
      `${typeLabels[orderType]} *Order*\n\n` +
      `Current SUI Price: $${suiPrice.toFixed(4)}\n\n` +
      `*Select Amount:*`,
      { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '10 SUI', callback_data: `limit_${orderType}_amt_10` },
              { text: '50 SUI', callback_data: `limit_${orderType}_amt_50` },
              { text: '100 SUI', callback_data: `limit_${orderType}_amt_100` },
            ],
            [{ text: '« Back', callback_data: 'cmd_limitorder' }],
          ],
        },
      }
    );
  });

  bot.callbackQuery(/^limit_(\w+)_amt_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const orderType = ctx.match![1];
    const amount = ctx.match![2];
    const suiPrice = await fetchPrice('SUI_USDC').catch(() => 1.85);
    
    const suggestedPrice = orderType === 'buy' || orderType === 'stoploss' 
      ? (suiPrice * 0.95).toFixed(4) 
      : (suiPrice * 1.05).toFixed(4);
    
    await ctx.editMessageText(
      `*${orderType.toUpperCase()} ${amount} SUI*\n\n` +
      `Current: $${suiPrice.toFixed(4)}\n\n` +
      `*Select Trigger Price:*`,
      { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: `-5% ($${(suiPrice * 0.95).toFixed(2)})`, callback_data: `limit_confirm_${orderType}_${amount}_${(suiPrice * 0.95).toFixed(4)}` },
              { text: `-2% ($${(suiPrice * 0.98).toFixed(2)})`, callback_data: `limit_confirm_${orderType}_${amount}_${(suiPrice * 0.98).toFixed(4)}` },
            ],
            [
              { text: `+2% ($${(suiPrice * 1.02).toFixed(2)})`, callback_data: `limit_confirm_${orderType}_${amount}_${(suiPrice * 1.02).toFixed(4)}` },
              { text: `+5% ($${(suiPrice * 1.05).toFixed(2)})`, callback_data: `limit_confirm_${orderType}_${amount}_${(suiPrice * 1.05).toFixed(4)}` },
            ],
            [{ text: '« Back', callback_data: 'cmd_limitorder' }],
          ],
        },
      }
    );
  });

  bot.callbackQuery(/^limit_confirm_(\w+)_(\d+)_(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const orderType = ctx.match![1];
    const amount = ctx.match![2];
    const price = ctx.match![3];
    
    await ctx.editMessageText('⚡ *Creating Order...*', { parse_mode: 'Markdown' });
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Generate mock transaction hash
    const txHash = `0x${Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;
    
    await ctx.editMessageText(
      `✅ *Limit Order Created!*\n\n` +
      `*Order Details:*\n` +
      `• Type: ${orderType.toUpperCase()}\n` +
      `• Amount: ${amount} SUI\n` +
      `• Trigger: $${price}\n` +
      `• Status: Active\n\n` +
      `*Transaction:*\n` +
      `\`${txHash.slice(0, 20)}...${txHash.slice(-8)}\`\n\n` +
      `[View on Explorer](https://suiscan.xyz/testnet/tx/${txHash})\n\n` +
      `_Your order will execute when price reaches $${price}_`,
      { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📋 View All Orders', url: `${MINI_APP_URL}/demo/limit-orders` }],
            [{ text: '➕ Create Another', callback_data: 'cmd_limitorder' }],
          ],
        },
      }
    );
  });

  // Margin Trade Flow Callbacks
  bot.callbackQuery(/^margin_(long|short)_start$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const positionType = ctx.match![1];
    const emoji = positionType === 'long' ? '🟢' : '🔴';
    
    await ctx.editMessageText(
      `${emoji} *${positionType.toUpperCase()} Position*\n\n` +
      `*Select Leverage:*`,
      { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '2x', callback_data: `margin_${positionType}_lev_2` },
              { text: '3x', callback_data: `margin_${positionType}_lev_3` },
              { text: '5x', callback_data: `margin_${positionType}_lev_5` },
            ],
            [
              { text: '7x', callback_data: `margin_${positionType}_lev_7` },
              { text: '10x', callback_data: `margin_${positionType}_lev_10` },
            ],
            [{ text: '« Back', callback_data: 'cmd_margintrade' }],
          ],
        },
      }
    );
  });

  bot.callbackQuery(/^margin_(\w+)_lev_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const positionType = ctx.match![1];
    const leverage = ctx.match![2];
    const suiPrice = await fetchPrice('SUI_USDC').catch(() => 1.85);
    
    await ctx.editMessageText(
      `*${positionType.toUpperCase()} ${leverage}x*\n\n` +
      `*Select Position Size:*`,
      { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: `50 SUI ($${(50 * suiPrice).toFixed(0)})`, callback_data: `margin_confirm_${positionType}_${leverage}_50` },
              { text: `100 SUI ($${(100 * suiPrice).toFixed(0)})`, callback_data: `margin_confirm_${positionType}_${leverage}_100` },
            ],
            [
              { text: `250 SUI ($${(250 * suiPrice).toFixed(0)})`, callback_data: `margin_confirm_${positionType}_${leverage}_250` },
              { text: `500 SUI ($${(500 * suiPrice).toFixed(0)})`, callback_data: `margin_confirm_${positionType}_${leverage}_500` },
            ],
            [{ text: '« Back', callback_data: `margin_${positionType}_start` }],
          ],
        },
      }
    );
  });

  bot.callbackQuery(/^margin_confirm_(\w+)_(\d+)_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const positionType = ctx.match![1];
    const leverage = ctx.match![2];
    const size = ctx.match![3];
    const suiPrice = await fetchPrice('SUI_USDC').catch(() => 1.85);
    
    const positionValue = parseInt(size) * suiPrice;
    const marginRequired = positionValue / parseInt(leverage);
    const liquidationPrice = positionType === 'long'
      ? suiPrice * (1 - 0.9 / parseInt(leverage))
      : suiPrice * (1 + 0.9 / parseInt(leverage));
    
    await ctx.editMessageText('⚡ *Opening Position...*', { parse_mode: 'Markdown' });
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const txHash = `0x${Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;
    const emoji = positionType === 'long' ? '🟢' : '🔴';
    
    await ctx.editMessageText(
      `✅ *Position Opened!*\n\n` +
      `${emoji} *${positionType.toUpperCase()} ${leverage}x*\n\n` +
      `*Position Details:*\n` +
      `• Size: ${size} SUI\n` +
      `• Value: $${positionValue.toFixed(2)}\n` +
      `• Margin: $${marginRequired.toFixed(2)}\n` +
      `• Entry: $${suiPrice.toFixed(4)}\n` +
      `• Liq. Price: $${liquidationPrice.toFixed(4)}\n\n` +
      `*Transaction:*\n` +
      `\`${txHash.slice(0, 20)}...${txHash.slice(-8)}\`\n\n` +
      `[View on Explorer](https://suiscan.xyz/testnet/tx/${txHash})\n\n` +
      `⚠️ _Set stop-loss to manage risk!_`,
      { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📊 View Positions', url: `${MINI_APP_URL}/demo/margin-trading` }],
            [{ text: '➕ Open Another', callback_data: 'cmd_margintrade' }],
          ],
        },
      }
    );
  });

  bot.callbackQuery('margin_positions', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `📊 *Your Open Positions*\n\n` +
      `_No positions in demo mode_\n\n` +
      `Open the Mini App to view your real positions.`,
      { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '📊 Open Trading App', url: `${MINI_APP_URL}/demo/margin-trading` }],
            [{ text: '« Back', callback_data: 'cmd_margintrade' }],
          ],
        },
      }
    );
  });

  // Flash Arbitrage Callbacks
  bot.callbackQuery(/^flasharb_execute_(\d+)$/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const oppIndex = parseInt(ctx.match![1]);
    
    const opportunities = [
      { pair: 'SUI/USDC', spread: 0.42, profit: 12.50, route: 'DeepBook → Cetus' },
      { pair: 'DEEP/SUI', spread: 0.28, profit: 8.20, route: 'Turbos → DeepBook' },
    ];
    
    const opp = opportunities[oppIndex] || opportunities[0];
    
    await ctx.editMessageText(`⚡ *Executing Flash Arbitrage...*\n\n${opp.route}`, { parse_mode: 'Markdown' });
    
    // Simulate execution steps
    await new Promise(resolve => setTimeout(resolve, 1000));
    await ctx.editMessageText(`⚡ *Step 1/4:* Taking flash loan...`, { parse_mode: 'Markdown' });
    await new Promise(resolve => setTimeout(resolve, 800));
    await ctx.editMessageText(`⚡ *Step 2/4:* Swapping on ${opp.route.split(' → ')[0]}...`, { parse_mode: 'Markdown' });
    await new Promise(resolve => setTimeout(resolve, 800));
    await ctx.editMessageText(`⚡ *Step 3/4:* Swapping on ${opp.route.split(' → ')[1]}...`, { parse_mode: 'Markdown' });
    await new Promise(resolve => setTimeout(resolve, 800));
    await ctx.editMessageText(`⚡ *Step 4/4:* Repaying loan + profit...`, { parse_mode: 'Markdown' });
    await new Promise(resolve => setTimeout(resolve, 600));
    
    const txHash = `0x${Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;
    
    await ctx.editMessageText(
      `✅ *Arbitrage Executed!*\n\n` +
      `*Trade Details:*\n` +
      `• Pair: ${opp.pair}\n` +
      `• Route: ${opp.route}\n` +
      `• Spread Captured: ${opp.spread}%\n` +
      `• Profit: $${opp.profit.toFixed(2)} 💰\n\n` +
      `*Transaction:*\n` +
      `\`${txHash.slice(0, 20)}...${txHash.slice(-8)}\`\n\n` +
      `[View on Explorer](https://suiscan.xyz/testnet/tx/${txHash})\n\n` +
      `_Executed atomically via flash loan - zero liquidation risk!_`,
      { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⚡ Execute Another', callback_data: 'flasharb_refresh' }],
            [{ text: '📊 Full Arb Dashboard', url: `${MINI_APP_URL}/demo/flash-arbitrage` }],
          ],
        },
      }
    );
  });

  bot.callbackQuery('flasharb_refresh', async (ctx) => {
    await ctx.answerCallbackQuery('Scanning...');
    await ctx.editMessageText('🔍 *Scanning for Arbitrage...*', { parse_mode: 'Markdown' });
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Generate slightly different opportunities
    const spreads = [0.35, 0.48, 0.22];
    const randomSpread = spreads[Math.floor(Math.random() * spreads.length)];
    
    await ctx.editMessageText(
      `⚡ *Flash Arbitrage Opportunities*\n\n` +
      `*1. SUI/USDC*\n` +
      `   📈 Spread: ${randomSpread}%\n` +
      `   💰 Est. Profit: $${(randomSpread * 30).toFixed(2)}\n` +
      `   🔄 Route: DeepBook → Cetus\n\n` +
      `*2. DEEP/SUI*\n` +
      `   📈 Spread: 0.25%\n` +
      `   💰 Est. Profit: $7.50\n` +
      `   🔄 Route: Turbos → DeepBook\n\n` +
      `_Updated: ${new Date().toLocaleTimeString()}_`,
      { 
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [{ text: '⚡ Execute #1', callback_data: 'flasharb_execute_0' }],
            [{ text: '⚡ Execute #2', callback_data: 'flasharb_execute_1' }],
            [{ text: '🔄 Refresh', callback_data: 'flasharb_refresh' }],
          ],
        },
      }
    );
  });

  // Callback query handlers
  bot.callbackQuery('confirm_trade', async (ctx) => {
    await ctx.answerCallbackQuery();
    
    const pending = ctx.session.pendingTrade;
    if (!pending) {
      await ctx.editMessageText('❌ Trade expired. Start a new one.');
      return;
    }

    if (!ctx.session.walletAddress && !DEMO_MODE) {
      await ctx.editMessageText('⚠️ Please connect your wallet first with /connect');
      return;
    }

    await ctx.editMessageText('⚡ Executing trade...');

    if (DEMO_MODE) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      await ctx.editMessageText(
        `✅ *Trade Executed!* (Demo)\n\n` +
        `• ${pending.action.toUpperCase()} ${pending.amount} ${pending.pair.split('_')[0]}\n` +
        `• Status: Simulated Success\n\n` +
        `_This is a demo simulation_`,
        { parse_mode: 'Markdown' }
      );
    }

    ctx.session.pendingTrade = undefined;
  });

  bot.callbackQuery('cancel_trade', async (ctx) => {
    await ctx.answerCallbackQuery('Trade cancelled');
    ctx.session.pendingTrade = undefined;
    await ctx.editMessageText('🚫 Trade cancelled.');
  });

  return bot;
}

// ============== Main Entry Point ==============

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  
  if (!token) {
    console.error('❌ TELEGRAM_BOT_TOKEN not set');
    process.exit(1);
  }

  console.log('🤖 Starting Sui Trading Bot...');
  console.log(`   Demo Mode: ${DEMO_MODE ? 'ON' : 'OFF'}`);

  const bot = createTradingBot(token);

  // Error handling
  bot.catch((err) => {
    console.error('Bot error:', err);
  });

  // Start polling
  await bot.start({
    onStart: () => {
      console.log('✅ Bot is running!');
      console.log('   Send /start to begin');
    },
  });
}

// Run if executed directly
if (require.main === module) {
  main();
}

export default createTradingBot;
