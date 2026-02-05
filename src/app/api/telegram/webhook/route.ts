/**
 * Telegram Webhook API Route
 * 
 * This handles incoming Telegram updates via webhook.
 * For production, configure webhook URL in Telegram BotFather.
 */

import { NextRequest, NextResponse } from 'next/server';

// Check if we have a token configured
const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BOT_ENABLED = Boolean(TELEGRAM_TOKEN);
// Mini App URL - for Telegram Mini App redirects
const MINI_APP_URL = process.env.NEXT_PUBLIC_TELEGRAM_MINI_APP_URL || 'https://t.me/DeepIntentBot/app';

// Mock price data
const MOCK_PRICES: Record<string, number> = {
  SUI: 1.85,
  DEEP: 0.12,
  USDC: 1.0,
};

// Helper to generate mock transaction hash
function generateTxHash(): string {
  return `0x${Array(64).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;
}

// Helper to parse trading commands
function parseTradeCommand(text: string): { action: string; amount: number; pair: string } | null {
  const lower = text.toLowerCase();
  
  const buyMatch = lower.match(/buy\s+(\d+(?:\.\d+)?)\s*(\w+)?/);
  if (buyMatch) {
    return {
      action: 'buy',
      amount: parseFloat(buyMatch[1]),
      pair: buyMatch[2]?.toUpperCase() || 'SUI',
    };
  }
  
  const sellMatch = lower.match(/sell\s+(\d+(?:\.\d+)?)\s*(\w+)?/);
  if (sellMatch) {
    return {
      action: 'sell',
      amount: parseFloat(sellMatch[1]),
      pair: sellMatch[2]?.toUpperCase() || 'SUI',
    };
  }
  
  return null;
}

// Send message via Telegram API
async function sendMessage(chatId: number, text: string, options: Record<string, unknown> = {}) {
  if (!TELEGRAM_TOKEN) return;
  
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      ...options,
    }),
  });
}

// Edit message via Telegram API
async function editMessage(chatId: number, messageId: number, text: string, options: Record<string, unknown> = {}) {
  if (!TELEGRAM_TOKEN) return;
  
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/editMessageText`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      parse_mode: 'Markdown',
      ...options,
    }),
  });
}

// Answer callback query
async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  if (!TELEGRAM_TOKEN) return;
  
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text,
    }),
  });
}

// Handle incoming update
async function handleUpdate(update: Record<string, unknown>) {
  const message = update.message as Record<string, unknown> | undefined;
  const callbackQuery = update.callback_query as Record<string, unknown> | undefined;
  
  // Handle callback queries (button presses)
  if (callbackQuery) {
    const callbackMessage = callbackQuery.message as Record<string, unknown> | undefined;
    const chat = callbackMessage?.chat as Record<string, unknown> | undefined;
    const chatId = chat?.id as number;
    const messageId = callbackMessage?.message_id as number;
    const data = callbackQuery.data as string;
    const queryId = callbackQuery.id as string;
    
    await answerCallbackQuery(queryId);
    
    // Handle different callback actions
    if (data?.startsWith('confirm_')) {
      const [, action, amount, pair] = data.split('_');
      const txHash = generateTxHash();
      await editMessage(chatId, messageId, 
        `✅ *Trade Executed!*\n\n` +
        `• ${action?.toUpperCase()} ${amount} ${pair}\n` +
        `• Status: Success\n\n` +
        `*Transaction:*\n\`${txHash.slice(0, 20)}...${txHash.slice(-8)}\`\n\n` +
        `[View on Explorer](https://suiscan.xyz/testnet/tx/${txHash})`
      );
    } else if (data === 'cancel') {
      await editMessage(chatId, messageId, '🚫 Trade cancelled.');
    } else if (data === 'cmd_limitorder') {
      await editMessage(chatId, messageId,
        `🎯 *Create a Limit Order*\n\n` +
        `*Choose your order type:*`,
        {
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
    } else if (data === 'cmd_margintrade') {
      await editMessage(chatId, messageId,
        `📊 *Margin Trading*\n\n` +
        `Trade with up to 10x leverage.\n\n` +
        `💧 SUI/USDC: $${MOCK_PRICES.SUI.toFixed(4)}\n\n` +
        `*Choose position type:*`,
        {
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
    } else if (data === 'cmd_flasharb') {
      await editMessage(chatId, messageId, '🔍 *Scanning for Arbitrage...*');
      await new Promise(resolve => setTimeout(resolve, 1000));
      await editMessage(chatId, messageId,
        `⚡ *Flash Arbitrage Opportunities*\n\n` +
        `*1. SUI/USDC*\n` +
        `   📈 Spread: 0.42%\n` +
        `   💰 Est. Profit: $12.50\n` +
        `   🔄 Route: DeepBook → Cetus\n\n` +
        `*2. DEEP/SUI*\n` +
        `   📈 Spread: 0.28%\n` +
        `   💰 Est. Profit: $8.20\n` +
        `   🔄 Route: Turbos → DeepBook`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '⚡ Execute #1', callback_data: 'flasharb_execute_0' }],
              [{ text: '⚡ Execute #2', callback_data: 'flasharb_execute_1' }],
              [{ text: '🔄 Refresh', callback_data: 'flasharb_refresh' }],
            ],
          },
        }
      );
    } else if (data?.match(/^limit_(buy|sell|stoploss|takeprofit)_start$/)) {
      const orderType = data.split('_')[1];
      await editMessage(chatId, messageId,
        `*${orderType.toUpperCase()} Order*\n\n` +
        `Current SUI Price: $${MOCK_PRICES.SUI.toFixed(4)}\n\n` +
        `*Select Amount:*`,
        {
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
    } else if (data?.match(/^limit_(\w+)_amt_(\d+)$/)) {
      const parts = data.split('_');
      const orderType = parts[1];
      const amount = parts[3];
      const price = MOCK_PRICES.SUI;
      await editMessage(chatId, messageId,
        `*${orderType.toUpperCase()} ${amount} SUI*\n\n` +
        `*Select Trigger Price:*`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: `-5% ($${(price * 0.95).toFixed(2)})`, callback_data: `limit_confirm_${orderType}_${amount}_${(price * 0.95).toFixed(4)}` },
                { text: `+5% ($${(price * 1.05).toFixed(2)})`, callback_data: `limit_confirm_${orderType}_${amount}_${(price * 1.05).toFixed(4)}` },
              ],
              [{ text: '« Back', callback_data: 'cmd_limitorder' }],
            ],
          },
        }
      );
    } else if (data?.match(/^limit_confirm_/)) {
      const parts = data.split('_');
      const orderType = parts[2];
      const amount = parts[3];
      const price = parts[4];
      
      await editMessage(chatId, messageId, '⚡ *Creating Order...*');
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      const txHash = generateTxHash();
      await editMessage(chatId, messageId,
        `✅ *Limit Order Created!*\n\n` +
        `• Type: ${orderType.toUpperCase()}\n` +
        `• Amount: ${amount} SUI\n` +
        `• Trigger: $${price}\n` +
        `• Status: Active\n\n` +
        `*Transaction:*\n\`${txHash.slice(0, 20)}...${txHash.slice(-8)}\`\n\n` +
        `[View on Explorer](https://suiscan.xyz/testnet/tx/${txHash})`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📋 View Orders', url: `${MINI_APP_URL}/demo/limit-orders` }],
              [{ text: '➕ Create Another', callback_data: 'cmd_limitorder' }],
            ],
          },
        }
      );
    } else if (data?.match(/^margin_(long|short)_start$/)) {
      const posType = data.split('_')[1];
      const emoji = posType === 'long' ? '🟢' : '🔴';
      await editMessage(chatId, messageId,
        `${emoji} *${posType.toUpperCase()} Position*\n\n` +
        `*Select Leverage:*`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '2x', callback_data: `margin_${posType}_lev_2` },
                { text: '5x', callback_data: `margin_${posType}_lev_5` },
                { text: '10x', callback_data: `margin_${posType}_lev_10` },
              ],
              [{ text: '« Back', callback_data: 'cmd_margintrade' }],
            ],
          },
        }
      );
    } else if (data?.match(/^margin_(\w+)_lev_(\d+)$/)) {
      const parts = data.split('_');
      const posType = parts[1];
      const leverage = parts[3];
      const price = MOCK_PRICES.SUI;
      await editMessage(chatId, messageId,
        `*${posType.toUpperCase()} ${leverage}x*\n\n` +
        `*Select Position Size:*`,
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: `50 SUI ($${(50 * price).toFixed(0)})`, callback_data: `margin_confirm_${posType}_${leverage}_50` },
                { text: `100 SUI ($${(100 * price).toFixed(0)})`, callback_data: `margin_confirm_${posType}_${leverage}_100` },
              ],
              [{ text: '« Back', callback_data: `margin_${posType}_start` }],
            ],
          },
        }
      );
    } else if (data?.match(/^margin_confirm_/)) {
      const parts = data.split('_');
      const posType = parts[2];
      const leverage = parseInt(parts[3]);
      const size = parseInt(parts[4]);
      const price = MOCK_PRICES.SUI;
      
      const positionValue = size * price;
      const marginRequired = positionValue / leverage;
      const liquidationPrice = posType === 'long'
        ? price * (1 - 0.9 / leverage)
        : price * (1 + 0.9 / leverage);
      
      await editMessage(chatId, messageId, '⚡ *Opening Position...*');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const txHash = generateTxHash();
      const emoji = posType === 'long' ? '🟢' : '🔴';
      
      await editMessage(chatId, messageId,
        `✅ *Position Opened!*\n\n` +
        `${emoji} *${posType.toUpperCase()} ${leverage}x*\n\n` +
        `• Size: ${size} SUI\n` +
        `• Value: $${positionValue.toFixed(2)}\n` +
        `• Margin: $${marginRequired.toFixed(2)}\n` +
        `• Entry: $${price.toFixed(4)}\n` +
        `• Liq. Price: $${liquidationPrice.toFixed(4)}\n\n` +
        `*Transaction:*\n\`${txHash.slice(0, 20)}...${txHash.slice(-8)}\`\n\n` +
        `[View on Explorer](https://suiscan.xyz/testnet/tx/${txHash})`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📊 View Positions', url: `${MINI_APP_URL}/demo/margin-trading` }],
              [{ text: '➕ Open Another', callback_data: 'cmd_margintrade' }],
            ],
          },
        }
      );
    } else if (data?.startsWith('flasharb_execute_')) {
      const oppIndex = parseInt(data.split('_')[2]);
      const opportunities = [
        { pair: 'SUI/USDC', spread: 0.42, profit: 12.50, route: 'DeepBook → Cetus' },
        { pair: 'DEEP/SUI', spread: 0.28, profit: 8.20, route: 'Turbos → DeepBook' },
      ];
      const opp = opportunities[oppIndex] || opportunities[0];
      
      await editMessage(chatId, messageId, `⚡ *Executing Flash Arbitrage...*\n\n${opp.route}`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      await editMessage(chatId, messageId, `⚡ *Step 1/4:* Taking flash loan...`);
      await new Promise(resolve => setTimeout(resolve, 800));
      await editMessage(chatId, messageId, `⚡ *Step 2/4:* Swapping on ${opp.route.split(' → ')[0]}...`);
      await new Promise(resolve => setTimeout(resolve, 800));
      await editMessage(chatId, messageId, `⚡ *Step 3/4:* Swapping on ${opp.route.split(' → ')[1]}...`);
      await new Promise(resolve => setTimeout(resolve, 800));
      await editMessage(chatId, messageId, `⚡ *Step 4/4:* Repaying loan + profit...`);
      await new Promise(resolve => setTimeout(resolve, 600));
      
      const txHash = generateTxHash();
      await editMessage(chatId, messageId,
        `✅ *Arbitrage Executed!*\n\n` +
        `• Pair: ${opp.pair}\n` +
        `• Route: ${opp.route}\n` +
        `• Spread: ${opp.spread}%\n` +
        `• Profit: $${opp.profit.toFixed(2)} 💰\n\n` +
        `*Transaction:*\n\`${txHash.slice(0, 20)}...${txHash.slice(-8)}\`\n\n` +
        `[View on Explorer](https://suiscan.xyz/testnet/tx/${txHash})`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '⚡ Execute Another', callback_data: 'flasharb_refresh' }],
              [{ text: '📊 Arb Dashboard', url: `${MINI_APP_URL}/demo/flash-arbitrage` }],
            ],
          },
        }
      );
    } else if (data === 'flasharb_refresh') {
      await editMessage(chatId, messageId, '🔍 *Scanning for Arbitrage...*');
      await new Promise(resolve => setTimeout(resolve, 1000));
      const spreads = [0.35, 0.48, 0.22, 0.55];
      const randomSpread = spreads[Math.floor(Math.random() * spreads.length)];
      await editMessage(chatId, messageId,
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
          reply_markup: {
            inline_keyboard: [
              [{ text: '⚡ Execute #1', callback_data: 'flasharb_execute_0' }],
              [{ text: '⚡ Execute #2', callback_data: 'flasharb_execute_1' }],
              [{ text: '🔄 Refresh', callback_data: 'flasharb_refresh' }],
            ],
          },
        }
      );
    }
    return;
  }
  
  if (!message?.text) return;
  
  const messageChat = message.chat as Record<string, unknown>;
  const chatId = messageChat.id as number;
  const text = message.text as string;
  
  // Handle commands
  if (text === '/start' || text === '/help') {
    await sendMessage(chatId,
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
      `/connect - Link your wallet\n\n` +
      `*🔐 Connect via zkLogin:*\n` +
      `Use our Mini App for secure Google/Twitch login!`,
      {
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
    return;
  }
  
  if (text === '/limitorder') {
    await sendMessage(chatId,
      `🎯 *Create a Limit Order*\n\n` +
      `Limit orders execute when the price hits your target.\n\n` +
      `*Choose your order type:*`,
      {
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
    return;
  }
  
  if (text === '/margintrade') {
    await sendMessage(chatId,
      `📊 *Margin Trading*\n\n` +
      `Trade with up to 10x leverage on DeepBook.\n\n` +
      `*Current Market:*\n` +
      `💧 SUI/USDC: $${MOCK_PRICES.SUI.toFixed(4)}\n\n` +
      `*Choose position type:*`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '🟢 Long (Buy)', callback_data: 'margin_long_start' },
              { text: '🔴 Short (Sell)', callback_data: 'margin_short_start' },
            ],
            [
              { text: '📊 View Open Positions', url: `${MINI_APP_URL}/demo/margin-trading` },
            ],
          ],
        },
      }
    );
    return;
  }
  
  if (text === '/flasharb') {
    await sendMessage(chatId, '🔍 *Scanning for Arbitrage Opportunities...*');
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    await sendMessage(chatId,
      `⚡ *Flash Arbitrage Opportunities*\n\n` +
      `*1. SUI/USDC*\n` +
      `   📈 Spread: 0.42%\n` +
      `   💰 Est. Profit: $12.50\n` +
      `   🔄 Route: DeepBook → Cetus\n\n` +
      `*2. DEEP/SUI*\n` +
      `   📈 Spread: 0.28%\n` +
      `   💰 Est. Profit: $8.20\n` +
      `   🔄 Route: Turbos → DeepBook\n\n` +
      `*3. USDC/USDT*\n` +
      `   📈 Spread: 0.05%\n` +
      `   💰 Est. Profit: $2.10\n` +
      `   🔄 Route: DeepBook → FlowX\n\n` +
      `_Profits shown for $1000 trade size_\n\n` +
      `⚠️ Flash loans have no liquidation risk!`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '⚡ Execute #1 (SUI)', callback_data: 'flasharb_execute_0' }],
            [{ text: '⚡ Execute #2 (DEEP)', callback_data: 'flasharb_execute_1' }],
            [{ text: '🔄 Refresh Scan', callback_data: 'flasharb_refresh' }],
          ],
        },
      }
    );
    return;
  }
  
  if (text === '/prices') {
    const priceList = Object.entries(MOCK_PRICES)
      .map(([coin, price]) => `• ${coin}: $${price.toFixed(4)}`)
      .join('\n');
    
    await sendMessage(chatId, `📊 *Current Prices*\n\n${priceList}\n\n_Updated: ${new Date().toLocaleTimeString()}_`);
    return;
  }
  
  if (text === '/connect') {
    await sendMessage(chatId,
      `🔗 *Connect Your Wallet*\n\n` +
      `Use zkLogin to connect securely:\n\n` +
      `1️⃣ Open the Mini App\n` +
      `2️⃣ Sign in with Google or Twitch\n` +
      `3️⃣ Your Sui wallet is automatically created!\n\n` +
      `After connecting, send me your wallet address to link it here.`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔐 Connect with zkLogin', url: MINI_APP_URL }],
          ],
        },
      }
    );
    return;
  }
  
  if (text === '/balance') {
    await sendMessage(chatId,
      `💰 *Your Balance* (Demo)\n\n` +
      `• 💧 SUI: 100.0000\n` +
      `• 🟢 USDC: 250.00\n` +
      `• 🔵 DEEP: 500.00\n\n` +
      `_Total: ~$435.00_\n\n` +
      `Connect your wallet to see real balances!`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🔗 Connect Wallet', url: MINI_APP_URL }],
          ],
        },
      }
    );
    return;
  }
  
  // Check for price queries
  if (text.toLowerCase().includes('price')) {
    const coinMatch = text.match(/price\s+(\w+)/i);
    const coin = coinMatch?.[1]?.toUpperCase() || 'SUI';
    const price = MOCK_PRICES[coin] || MOCK_PRICES.SUI;
    
    await sendMessage(chatId,
      `💰 *${coin} Price*\n\n` +
      `Current: $${price.toFixed(4)}\n` +
      `24h Change: ${(Math.random() * 10 - 5).toFixed(2)}%\n\n` +
      `_Updated: ${new Date().toLocaleTimeString()}_`
    );
    return;
  }
  
  // Check for trade commands
  const trade = parseTradeCommand(text);
  if (trade) {
    const price = MOCK_PRICES[trade.pair] || MOCK_PRICES.SUI;
    const total = trade.amount * price;
    
    await sendMessage(chatId,
      `📋 *Confirm Trade*\n\n` +
      `• Action: ${trade.action.toUpperCase()}\n` +
      `• Amount: ${trade.amount} ${trade.pair}\n` +
      `• Price: $${price.toFixed(4)}\n` +
      `• Total: $${total.toFixed(2)}\n\n` +
      `Tap confirm to execute:`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Confirm', callback_data: `confirm_${trade.action}_${trade.amount}_${trade.pair}` },
              { text: '❌ Cancel', callback_data: 'cancel' },
            ],
          ],
        },
      }
    );
    return;
  }
  
  // Default response
  await sendMessage(chatId,
    `🤔 I can help you with:\n\n` +
    `*DeFi Commands:*\n` +
    `/limitorder - Create limit orders\n` +
    `/margintrade - Leveraged trading\n` +
    `/flasharb - Flash arbitrage\n\n` +
    `*Trading:*\n` +
    `• "buy 10 SUI"\n` +
    `• "sell 5 SUI"\n` +
    `• "price SUI"\n\n` +
    `Try /start for the full menu!`
  );
}

export async function POST(req: NextRequest) {
  if (!BOT_ENABLED) {
    return NextResponse.json({ error: 'Bot not configured' }, { status: 503 });
  }
  
  try {
    const update = await req.json();
    await handleUpdate(update);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: 'Webhook error' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    bot: 'DeepIntent Bot',
    version: '2.0.0',
    enabled: BOT_ENABLED,
    mode: process.env.NEXT_PUBLIC_DEMO_MODE === 'true' ? 'demo' : 'live',
    features: ['limit-orders', 'margin-trading', 'flash-arbitrage', 'natural-language'],
  });
}
