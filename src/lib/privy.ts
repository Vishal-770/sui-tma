/**
 * Privy Server-Side Module
 *
 * Handles:
 * - Creating Privy users linked to Telegram accounts
 * - Creating NEAR ed25519 wallets (implicit accounts)
 * - Server-side transaction signing via Privy rawSign
 * - Broadcasting signed NEAR transactions
 *
 * Uses the Bot-First approach: users interact via Telegram,
 * the server creates wallets and signs on their behalf.
 */

import { PrivyClient } from '@privy-io/node';
import {
  JsonRpcProvider,
  baseDecode,
  baseEncode,
  PublicKey,
  actions,
  createTransaction,
  SignedTransaction,
  Signature,
} from 'near-api-js';
import { createHash } from 'crypto';
import { getNearIntentsAPI } from './near-intents-api';

// ============== Config ==============

const PRIVY_APP_ID = process.env.PRIVY_APP_ID || '';
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET || '';
const PRIVY_AUTH_ID = process.env.PRIVY_AUTHORIZATION_ID || '';
const PRIVY_AUTH_SECRET = process.env.PRIVY_AUTHORIZATION_SECRET || '';
const NEAR_RPC_URL = 'https://rpc.mainnet.fastnear.com';

// ============== Privy Client ==============

let privyClient: PrivyClient | null = null;

function getPrivy(): PrivyClient {
  if (!privyClient) {
    if (!PRIVY_APP_ID || !PRIVY_APP_SECRET) {
      throw new Error(
        'PRIVY_APP_ID and PRIVY_APP_SECRET must be set in .env.local',
      );
    }
    privyClient = new PrivyClient({
      appId: PRIVY_APP_ID,
      appSecret: PRIVY_APP_SECRET,
    });
  }
  return privyClient;
}

// ============== Types ==============

export interface PrivyWalletInfo {
  privyUserId: string;
  walletId: string;
  nearAddress: string;   // NEAR implicit address (hex public key)
  publicKeyHex: string;  // Same as nearAddress for implicit accounts
}

export interface PrivyDepositResult {
  success: boolean;
  txHash?: string;
  depositAddress?: string;
  error?: string;
  explorerUrl?: string;
  nearBlocksUrl?: string;
}

// ============== User & Wallet Management ==============

/**
 * Create a Privy user linked to a Telegram user ID,
 * and create a NEAR wallet with our authorization key as additional signer.
 */
export async function createPrivyUserAndWallet(
  telegramUserId: number,
): Promise<PrivyWalletInfo> {
  const privy = getPrivy();

  // First check if user already exists
  try {
    const existing = await privy.users().getByTelegramUserID({
      telegram_user_id: String(telegramUserId),
    });

    // User exists — check if they have a NEAR wallet
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nearWallet = existing.linked_accounts.find(
      (a: any) => a.type === 'wallet' && a.chain_type === 'near' && 'id' in a,
    );

    if (nearWallet && 'id' in nearWallet && 'address' in nearWallet) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const addr = (nearWallet as any).address as string;
      return {
        privyUserId: existing.id,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        walletId: (nearWallet as any).id,
        nearAddress: addr,
        publicKeyHex: addr,
      };
    }

    // User exists but no NEAR wallet — create one
    const wallet = await privy.wallets().create({
      chain_type: 'near',
      owner: { user_id: existing.id },
      additional_signers: [
        { signer_id: PRIVY_AUTH_ID, override_policy_ids: [] },
      ],
    });

    return {
      privyUserId: existing.id,
      walletId: wallet.id,
      nearAddress: wallet.address,
      publicKeyHex: wallet.address,
    };
  } catch (err: unknown) {
    // User likely doesn't exist — check error message
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('not found') && !msg.includes('404') && !msg.includes('No user')) {
      // Re-throw unexpected errors
      console.warn('[Privy] Unexpected error checking user:', msg);
    }
    console.log(
      `[Privy] Creating new user for Telegram ID ${telegramUserId}`,
    );
  }

  // Create user with Telegram linked account
  const user = await privy.users().create({
    linked_accounts: [
      { type: 'telegram', telegram_user_id: String(telegramUserId) },
    ],
  });

  // Create NEAR wallet with authorization key as additional signer
  const wallet = await privy.wallets().create({
    chain_type: 'near',
    owner: { user_id: user.id },
    additional_signers: [
      { signer_id: PRIVY_AUTH_ID, override_policy_ids: [] },
    ],
  });

  console.log(
    `[Privy] Created user ${user.id} with NEAR wallet ${wallet.id} (${wallet.address})`,
  );

  return {
    privyUserId: user.id,
    walletId: wallet.id,
    nearAddress: wallet.address,
    publicKeyHex: wallet.address,
  };
}

/**
 * Get an existing Privy user's NEAR wallet info by Telegram user ID.
 */
export async function getPrivyWalletByTelegramId(
  telegramUserId: number,
): Promise<PrivyWalletInfo | null> {
  try {
    const privy = getPrivy();
    const user = await privy.users().getByTelegramUserID({
      telegram_user_id: String(telegramUserId),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nearWallet = user.linked_accounts.find(
      (a: any) => a.type === 'wallet' && a.chain_type === 'near' && 'id' in a,
    );

    if (!nearWallet || !('id' in nearWallet) || !('address' in nearWallet)) {
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const addr = (nearWallet as any).address as string;
    return {
      privyUserId: user.id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      walletId: (nearWallet as any).id,
      nearAddress: addr,
      publicKeyHex: addr,
    };
  } catch {
    return null;
  }
}

// ============== NEAR Transaction Signing ==============

/**
 * Build, sign, and broadcast a NEAR transaction using Privy rawSign.
 *
 * For native NEAR: sends NEAR to depositAddress
 * For NEP-141 tokens: calls ft_transfer_call on the token contract
 */
export async function signAndBroadcastNearDeposit(
  walletId: string,
  nearAddress: string,
  originAsset: string,
  depositAddress: string,
  amount: string,
): Promise<PrivyDepositResult> {
  const privy = getPrivy();
  const provider = new JsonRpcProvider({ url: NEAR_RPC_URL });

  try {
    // Determine if native NEAR or NEP-141 token
    const isNativeNear =
      originAsset === 'nep141:wrap.near' ||
      originAsset === 'near' ||
      originAsset.includes('wrap.near');

    // Get the public key from the implicit address (hex → base58 → ed25519:...)
    const pubKeyBytes = Buffer.from(nearAddress, 'hex');
    const base58PubKey = baseEncode(pubKeyBytes);
    const publicKey = PublicKey.fromString(`ed25519:${base58PubKey}`);

    // Get recent block hash
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blockResult = (await provider.sendJsonRpc('block', {
      finality: 'final',
    })) as any;
    const blockHash = baseDecode(blockResult.header.hash);

    // Get access key for nonce
    let nonce: number;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const accessKeyInfo = (await provider.sendJsonRpc('query', {
        request_type: 'view_access_key',
        finality: 'final',
        account_id: nearAddress,
        public_key: `ed25519:${base58PubKey}`,
      })) as any;
      nonce = accessKeyInfo.nonce + 1;
    } catch {
      console.warn(
        '[Privy] Could not fetch access key, account may not be initialized yet.',
      );
      return {
        success: false,
        error:
          'NEAR account not yet initialized. Please send some NEAR to your Privy wallet address first to activate it.',
      };
    }

    // Build transaction actions & receiver
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let txActions: any[];
    let receiverId: string;

    if (isNativeNear) {
      // Native NEAR transfer — amount is already in yoctoNEAR
      txActions = [actions.transfer(BigInt(amount))];
      receiverId = depositAddress;
    } else {
      // NEP-141 ft_transfer_call
      const contractMatch = originAsset.match(/^nep141:(.+)$/);
      if (!contractMatch) {
        return {
          success: false,
          error: `Unsupported origin asset format: ${originAsset}`,
        };
      }
      receiverId = contractMatch[1]; // Token contract address
      txActions = [
        actions.functionCall(
          'ft_transfer_call',
          { receiver_id: depositAddress, amount, msg: '' },
          BigInt(300_000_000_000_000), // 300 TGas
          BigInt(1), // 1 yoctoNEAR deposit
        ),
      ];
    }

    // Create the transaction
    const tx = createTransaction(
      nearAddress,
      publicKey,
      receiverId,
      nonce,
      txActions,
      blockHash,
    );

    // Serialize and hash the transaction
    const serializedTx = tx.encode();
    const txHashBytes = createHash('sha256').update(Buffer.from(serializedTx)).digest();
    const txHashHex = `0x${txHashBytes.toString('hex')}` as `0x${string}`;

    console.log(`[Privy] Signing NEAR tx with hash: ${txHashHex}`);

    // Sign via Privy rawSign with authorization context
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const signResult = (await privy.wallets().rawSign(walletId, {
      params: { hash: txHashHex },
      authorization_context: {
        authorization_private_keys: [PRIVY_AUTH_SECRET],
      },
    })) as any;

    const signatureHex =
      signResult?.signature || signResult?.data?.signature;
    if (!signatureHex) {
      return { success: false, error: 'Privy rawSign returned no signature' };
    }

    // Construct the SignedTransaction
    const cleanSig = signatureHex.startsWith('0x')
      ? signatureHex.slice(2)
      : signatureHex;
    const sigBytes = Uint8Array.from(Buffer.from(cleanSig, 'hex'));

    const signedTx = new SignedTransaction({
      transaction: tx,
      signature: new Signature({
        keyType: publicKey.keyType,
        data: sigBytes,
      }),
    });

    // Broadcast the signed transaction
    const signedSerializedTx = signedTx.encode();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const broadcastResult = (await provider.sendJsonRpc(
      'broadcast_tx_commit',
      [Buffer.from(signedSerializedTx).toString('base64')],
    )) as any;

    const finalTxHash =
      broadcastResult?.transaction?.hash ||
      broadcastResult?.transaction_outcome?.id ||
      txHashHex;

    console.log(`[Privy] NEAR tx broadcast success: ${finalTxHash}`);

    return {
      success: true,
      txHash: finalTxHash,
      depositAddress,
      explorerUrl: `https://explorer.near-intents.org/transactions/${depositAddress}`,
      nearBlocksUrl: `https://nearblocks.io/txns/${finalTxHash}`,
    };
  } catch (error) {
    console.error('[Privy] NEAR signing/broadcast failed:', error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Unknown error during Privy signing',
    };
  }
}

/**
 * Execute a full swap deposit using Privy wallet:
 * 1. Get live quote → deposit address
 * 2. Sign & broadcast NEAR deposit via Privy
 * 3. Submit tx hash to 1-Click API
 */
export async function executePrivySwapDeposit(
  walletId: string,
  nearAddress: string,
  originAsset: string,
  destinationAsset: string,
  amount: string,
  recipientAddress: string,
  refundAddress?: string,
): Promise<PrivyDepositResult> {
  const api = getNearIntentsAPI();

  console.log(`[Privy] Starting swap deposit for ${nearAddress}`);

  try {
    // Step 1: Get live quote
    const quote = await api.getLiveQuote({
      originAsset,
      destinationAsset,
      amount,
      refundAddress: refundAddress || nearAddress,
      recipientAddress,
    });

    if (quote.error || !quote.quote?.depositAddress) {
      return {
        success: false,
        error: `Quote failed: ${quote.error || 'No deposit address'}`,
      };
    }

    const depositAddress = quote.quote.depositAddress;
    console.log(`[Privy] Got deposit address: ${depositAddress}`);

    // Step 2: Sign & broadcast deposit
    const depositResult = await signAndBroadcastNearDeposit(
      walletId,
      nearAddress,
      originAsset,
      depositAddress,
      amount,
    );

    if (!depositResult.success) {
      return depositResult;
    }

    // Step 3: Submit tx hash to 1-Click API
    if (depositResult.txHash) {
      try {
        await api.submitDepositTx({
          txHash: depositResult.txHash,
          depositAddress,
        });
        console.log(`[Privy] TX hash submitted to 1-Click API`);
      } catch {
        console.warn(
          '[Privy] Warning: Failed to submit tx hash to 1-Click API',
        );
      }
    }

    return {
      ...depositResult,
      depositAddress,
    };
  } catch (error) {
    console.error('[Privy] Swap deposit failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check if Privy is configured (env vars present).
 */
export function isPrivyConfigured(): boolean {
  return !!(PRIVY_APP_ID && PRIVY_APP_SECRET && PRIVY_AUTH_ID && PRIVY_AUTH_SECRET);
}

// ============== Balance Checking ==============

export interface NearBalanceInfo {
  nearBalance: string;       // NEAR in human-readable format (e.g. "1.5")
  nearBalanceYocto: string;  // NEAR in yoctoNEAR
  availableNear: string;     // Available (minus storage staking)
  storageUsed: string;       // Storage used in bytes
  isInitialized: boolean;
}

/**
 * Get the NEAR balance for an account using RPC.
 */
export async function getNearBalance(accountId: string): Promise<NearBalanceInfo> {
  const provider = new JsonRpcProvider({ url: NEAR_RPC_URL });

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const account = (await provider.sendJsonRpc('query', {
      request_type: 'view_account',
      finality: 'final',
      account_id: accountId,
    })) as any;

    const totalYocto = BigInt(account.amount);
    const storageYocto = BigInt(account.storage_usage) * BigInt('10000000000000000000'); // ~0.00001 NEAR per byte
    const availableYocto = totalYocto > storageYocto ? totalYocto - storageYocto : BigInt(0);

    // Convert yoctoNEAR to NEAR (24 decimals)
    const formatNear = (yocto: bigint): string => {
      const str = yocto.toString().padStart(25, '0');
      const whole = str.slice(0, str.length - 24) || '0';
      const decimal = str.slice(str.length - 24, str.length - 18); // 6 decimal places
      return `${whole}.${decimal}`.replace(/\.?0+$/, '') || '0';
    };

    return {
      nearBalance: formatNear(totalYocto),
      nearBalanceYocto: totalYocto.toString(),
      availableNear: formatNear(availableYocto),
      storageUsed: account.storage_usage.toString(),
      isInitialized: true,
    };
  } catch {
    return {
      nearBalance: '0',
      nearBalanceYocto: '0',
      availableNear: '0',
      storageUsed: '0',
      isInitialized: false,
    };
  }
}
