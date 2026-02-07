/**
 * POST /api/telegram/link
 *
 * Links a NEAR account to a Telegram chatId.
 * Called by the web link-wallet page after the user connects their NEAR wallet.
 *
 * Body: { chatId: string, sig: string, nearAccountId: string }
 *
 * The `sig` is an HMAC of `chatId` using the bot token as secret.
 * This prevents anyone from linking wallets to arbitrary chatIds.
 *
 * After linking, sends a Telegram message to the user confirming the connection.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  nearAccounts,
  verifyLinkSignature,
} from '@/lib/telegram-store';

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

async function sendTelegramMessage(chatId: string, text: string) {
  if (!TELEGRAM_TOKEN) return;
  try {
    await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'Markdown',
      }),
    });
  } catch (err) {
    console.error('[Telegram Link] Failed to send confirm message:', err);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { chatId, sig, nearAccountId } = await req.json();

    if (!chatId || !sig || !nearAccountId) {
      return NextResponse.json(
        { ok: false, error: 'Missing required fields: chatId, sig, nearAccountId' },
        { status: 400 },
      );
    }

    // Verify the HMAC signature
    try {
      if (!verifyLinkSignature(String(chatId), String(sig))) {
        return NextResponse.json(
          { ok: false, error: 'Invalid or expired link. Use /connect in the bot to get a new one.' },
          { status: 403 },
        );
      }
    } catch {
      return NextResponse.json(
        { ok: false, error: 'Invalid signature format' },
        { status: 403 },
      );
    }

    // Store the link
    nearAccounts.set(String(chatId), String(nearAccountId));

    // Notify the user in Telegram
    await sendTelegramMessage(
      String(chatId),
      `✅ *NEAR Wallet Connected!*\n\n` +
        `Account: \`${nearAccountId}\`\n\n` +
        `Your swaps will now use this account. No private keys were shared.\n\n` +
        `Try: "swap 0.01 NEAR for SUI"\n` +
        `Use /disconnect to unlink.`,
    );

    return NextResponse.json({ ok: true, accountId: nearAccountId });
  } catch (error) {
    console.error('[Telegram Link] Error:', error);
    return NextResponse.json(
      { ok: false, error: 'Server error' },
      { status: 500 },
    );
  }
}
