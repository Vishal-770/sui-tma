/**
 * Shared in-memory store for Telegram bot state.
 *
 * Imported by both the webhook route AND the /api/telegram/link route
 * so they share the same Maps within a single Node.js process.
 *
 * ⚠️  Data is lost on server restart / redeploy.  For production,
 *     replace with Redis, Upstash, or a database.
 */

import crypto from 'crypto';

// ── Agent pool ──────────────────────────────────────
import { NearIntentsAgent } from './near-intents-agent';

export const agents = new Map<string, NearIntentsAgent>();
export const AGENT_POOL_MAX = 500;

export function getOrCreateAgent(chatId: string): NearIntentsAgent {
  let agent = agents.get(chatId);
  if (!agent) {
    agent = new NearIntentsAgent();
    agents.set(chatId, agent);
    if (agents.size > AGENT_POOL_MAX) {
      const oldest = agents.keys().next().value;
      if (oldest) {
        agents.delete(oldest);
        wallets.delete(oldest);
        nearAccounts.delete(oldest);
      }
    }
  }
  return agent;
}

// ── Wallets (SUI/EVM receive address) ───────────────
export const wallets = new Map<string, string>();

// ── NEAR account links (accountId only — NO private keys) ──
// Key: Telegram chatId, Value: NEAR account id
export const nearAccounts = new Map<string, string>();

/**
 * Legacy credentials store — kept ONLY for backward-compat with /import.
 * New /connect flow never stores private keys.
 */
export const nearLegacyCreds = new Map<string, { accountId: string; privateKey: string }>();

// ── Helpers ─────────────────────────────────────────

/** Build ProcessMessage options for a chat */
export function getAgentOpts(chatId: string) {
  const wallet = wallets.get(chatId);
  const accountId = nearAccounts.get(chatId);
  const legacy = nearLegacyCreds.get(chatId);

  // Prefer the wallet-connected accountId; fall back to legacy import
  const nearAccountId = accountId || legacy?.accountId;
  const nearPrivateKey = legacy?.privateKey;

  return {
    userAddress: wallet,
    nearAccountId,
    nearPrivateKey,
    executionMode: (nearPrivateKey ? 'auto' : nearAccountId ? 'client-sign' : 'manual') as
      | 'auto'
      | 'client-sign'
      | 'manual',
  };
}

// ── HMAC link tokens ────────────────────────────────
// Used by the web-link auth flow so users can link their NEAR
// wallet through the website without exposing private keys.

const HMAC_SECRET =
  process.env.TELEGRAM_BOT_TOKEN || 'fallback-hmac-secret-dev';

/** Create an HMAC signature for a chatId (used in link URLs) */
export function createLinkSignature(chatId: string): string {
  return crypto
    .createHmac('sha256', HMAC_SECRET)
    .update(chatId)
    .digest('hex');
}

/** Verify an HMAC signature for a chatId */
export function verifyLinkSignature(chatId: string, sig: string): boolean {
  const expected = createLinkSignature(chatId);
  return crypto.timingSafeEqual(
    Buffer.from(expected, 'hex'),
    Buffer.from(sig, 'hex'),
  );
}
