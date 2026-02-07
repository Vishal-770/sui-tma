/**
 * NEAR Transaction Handler
 * 
 * Server-side module for executing NEAR blockchain transactions.
 * Used by the AI agent to perform real swap deposits via the 1-Click API flow:
 * 
 * 1. Get a live quote → receive deposit address
 * 2. Send NEAR/tokens to the deposit address
 * 3. Submit tx hash to 1-Click API
 * 4. Poll for swap completion
 * 
 * Reference: near-intents-examples/1click-example/
 */

import { KeyPairSigner } from '@near-js/signers';
import { KeyPairString } from '@near-js/crypto';
import { JsonRpcProvider, type Provider } from '@near-js/providers';
import { Account } from '@near-js/accounts';
import { NEAR } from '@near-js/tokens';
import { getNearIntentsAPI, type QuoteResponse, type StatusResponse } from './near-intents-api';

// ============== Types ==============

export interface SwapExecutionResult {
  success: boolean;
  depositAddress?: string;
  txHash?: string;
  quote?: QuoteResponse;
  status?: StatusResponse;
  error?: string;
  explorerUrl?: string;
  nearBlocksUrl?: string;
}

export interface SwapConfig {
  originAsset: string;
  destinationAsset: string;
  amount: string;
  recipientAddress: string;  // Address on DESTINATION chain
  refundAddress?: string;    // Address on ORIGIN chain (defaults to NEAR account)
  slippageTolerance?: number;
}

// ============== Account Setup ==============

let cachedAccount: Account | null = null;

/**
 * Get a NEAR account instance from environment variables.
 * Uses @near-js/accounts, @near-js/signers, @near-js/providers.
 */
export function getNearAccount(): Account {
  if (cachedAccount) return cachedAccount;

  const accountId = process.env.SENDER_NEAR_ACCOUNT;
  const privateKey = process.env.SENDER_PRIVATE_KEY;

  if (!accountId || !privateKey) {
    throw new Error(
      'NEAR account not configured. Set SENDER_NEAR_ACCOUNT and SENDER_PRIVATE_KEY in .env.local'
    );
  }

  // Create signer from private key
  const signer = KeyPairSigner.fromSecretKey(privateKey as KeyPairString);

  // Create provider for RPC connection to NEAR mainnet
  const provider = new JsonRpcProvider({
    url: 'https://rpc.mainnet.fastnear.com',
  });

  // Instantiate NEAR account
  cachedAccount = new Account(accountId, provider as Provider, signer);
  return cachedAccount;
}

/**
 * Create a NEAR account instance from custom credentials (per-user import).
 * NOT cached — each call creates a fresh instance.
 */
export function getNearAccountWithCredentials(accountId: string, privateKey: string): Account {
  const signer = KeyPairSigner.fromSecretKey(privateKey as KeyPairString);
  const provider = new JsonRpcProvider({
    url: 'https://rpc.mainnet.fastnear.com',
  });
  return new Account(accountId, provider as Provider, signer);
}

/**
 * Check if NEAR account is configured.
 */
export function isNearAccountConfigured(): boolean {
  return !!(process.env.SENDER_NEAR_ACCOUNT && process.env.SENDER_PRIVATE_KEY);
}

/**
 * Get the configured NEAR account ID.
 */
export function getNearAccountId(): string {
  return process.env.SENDER_NEAR_ACCOUNT || '';
}

// ============== Deposit Execution ==============

/**
 * Send NEAR tokens to a deposit address.
 * This is the core function that transfers NEAR to the 1-Click deposit address.
 */
async function sendNearDeposit(
  depositAddress: string,
  amount: string
): Promise<{ txHash: string }> {
  const account = getNearAccount();

  console.log(`[NEAR] Sending ${amount} yoctoNEAR to ${depositAddress}`);

  const result = await account.transfer({
    token: NEAR,
    amount,
    receiverId: depositAddress,
  });

  const txHash = result.transaction.hash;
  console.log(`[NEAR] Deposit sent! TX: ${txHash}`);

  return { txHash };
}

/**
 * Send NEP-141 fungible tokens (e.g. USDC, USDT) to a deposit address.
 * Uses ft_transfer_call to the token contract.
 */
async function sendTokenDeposit(
  tokenContract: string,
  depositAddress: string,
  amount: string,
): Promise<{ txHash: string }> {
  const account = getNearAccount();

  console.log(
    `[NEAR] Sending ${amount} of ${tokenContract} to ${depositAddress}`
  );

  // ft_transfer_call sends tokens to the receiver with a message
  // Use callFunctionRaw to get FinalExecutionOutcome with transaction hash
  const result = await account.callFunctionRaw({
    contractId: tokenContract,
    methodName: 'ft_transfer_call',
    args: {
      receiver_id: depositAddress,
      amount,
      msg: '',
    },
    gas: BigInt(300_000_000_000_000), // 300 TGas
    deposit: BigInt(1), // 1 yoctoNEAR required for ft_transfer_call
  });

  const txHash = result.transaction.hash;
  console.log(`[NEAR] Token deposit sent! TX: ${txHash}`);

  return { txHash };
}

/**
 * Send a deposit to the 1-Click deposit address based on the origin asset.
 * Handles both native NEAR and NEP-141 tokens.
 */
async function sendDeposit(
  originAsset: string,
  depositAddress: string,
  amount: string,
): Promise<{ txHash: string }> {
  // Check if this is native NEAR (wrap.near)
  const isNativeNear =
    originAsset === 'nep141:wrap.near' ||
    originAsset === 'near' ||
    originAsset.includes('wrap.near');

  if (isNativeNear) {
    return sendNearDeposit(depositAddress, amount);
  }

  // Extract contract address from asset ID (format: "nep141:contract.near")
  const contractMatch = originAsset.match(/^nep141:(.+)$/);
  if (!contractMatch) {
    throw new Error(`Unsupported origin asset format: ${originAsset}`);
  }

  return sendTokenDeposit(contractMatch[1], depositAddress, amount);
}

// ============== Full Swap Execution ==============

/**
 * Execute a complete swap using the 1-Click API flow:
 * 1. Get live quote → deposit address
 * 2. Send deposit to the deposit address
 * 3. Submit tx hash to 1-Click API
 * 4. Return result for status polling
 */
export async function executeSwap(config: SwapConfig): Promise<SwapExecutionResult> {
  const api = getNearIntentsAPI();
  const senderAccount = getNearAccountId();

  if (!senderAccount) {
    return { success: false, error: 'NEAR account not configured' };
  }

  console.log(`[SWAP] Starting swap execution...`);
  console.log(`[SWAP] Origin: ${config.originAsset}`);
  console.log(`[SWAP] Destination: ${config.destinationAsset}`);
  console.log(`[SWAP] Amount: ${config.amount}`);
  console.log(`[SWAP] Recipient: ${config.recipientAddress}`);

  try {
    // Step 1: Get live quote with deposit address
    console.log(`[SWAP] Step 1: Getting live quote...`);
    const refundAddr = config.refundAddress || senderAccount;
    const quote = await api.getLiveQuote({
      originAsset: config.originAsset,
      destinationAsset: config.destinationAsset,
      amount: config.amount,
      refundAddress: refundAddr,
      recipientAddress: config.recipientAddress,
      slippageTolerance: config.slippageTolerance,
    });

    if (quote.error || !quote.quote) {
      return {
        success: false,
        error: `Quote failed: ${quote.error || 'No quote available'}`,
        quote,
      };
    }

    const depositAddress = quote.quote.depositAddress;
    if (!depositAddress) {
      return {
        success: false,
        error: 'No deposit address returned in quote',
        quote,
      };
    }

    console.log(`[SWAP] Got deposit address: ${depositAddress}`);
    console.log(
      `[SWAP] Quote: ${quote.quote.amountInFormatted} → ${quote.quote.amountOutFormatted}`
    );

    // Step 2: Send deposit
    console.log(`[SWAP] Step 2: Sending deposit...`);
    const { txHash } = await sendDeposit(
      config.originAsset,
      depositAddress,
      config.amount,
    );

    console.log(`[SWAP] Deposit sent! TX: ${txHash}`);

    // Step 3: Submit tx hash to 1-Click API (speeds up processing)
    console.log(`[SWAP] Step 3: Submitting tx hash...`);
    try {
      await api.submitDepositTx({ txHash, depositAddress });
      console.log(`[SWAP] TX hash submitted successfully`);
    } catch (submitError) {
      // Non-critical: the swap will still work without this
      console.warn(`[SWAP] Warning: Failed to submit tx hash:`, submitError);
    }

    return {
      success: true,
      depositAddress,
      txHash,
      quote,
      explorerUrl: `https://explorer.near-intents.org/transactions/${depositAddress}`,
      nearBlocksUrl: `https://nearblocks.io/txns/${txHash}`,
    };
  } catch (error) {
    console.error(`[SWAP] Execution failed:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during swap execution',
    };
  }
}

/**
 * Execute a complete swap using user-provided NEAR credentials.
 * Same as executeSwap but uses custom account instead of env vars.
 */
export async function executeSwapWithCredentials(
  config: SwapConfig,
  accountId: string,
  privateKey: string,
): Promise<SwapExecutionResult> {
  const api = getNearIntentsAPI();

  console.log(`[SWAP] Starting swap with custom credentials for ${accountId}`);

  try {
    // Step 1: Get live quote
    const refundAddr = config.refundAddress || accountId;
    const quote = await api.getLiveQuote({
      originAsset: config.originAsset,
      destinationAsset: config.destinationAsset,
      amount: config.amount,
      refundAddress: refundAddr,
      recipientAddress: config.recipientAddress,
      slippageTolerance: config.slippageTolerance,
    });

    if (quote.error || !quote.quote?.depositAddress) {
      return {
        success: false,
        error: `Quote failed: ${quote.error || 'No deposit address'}`,
        quote,
      };
    }

    const depositAddress = quote.quote.depositAddress;
    console.log(`[SWAP] Got deposit address: ${depositAddress}`);

    // Step 2: Send deposit using custom account
    const customAccount = getNearAccountWithCredentials(accountId, privateKey);
    const isNativeNear =
      config.originAsset === 'nep141:wrap.near' ||
      config.originAsset === 'near' ||
      config.originAsset.includes('wrap.near');

    let txHash: string;
    if (isNativeNear) {
      const result = await customAccount.transfer({
        token: NEAR,
        amount: config.amount,
        receiverId: depositAddress,
      });
      txHash = result.transaction.hash;
    } else {
      const contractMatch = config.originAsset.match(/^nep141:(.+)$/);
      if (!contractMatch) {
        throw new Error(`Unsupported asset format: ${config.originAsset}`);
      }
      const result = await customAccount.callFunctionRaw({
        contractId: contractMatch[1],
        methodName: 'ft_transfer_call',
        args: { receiver_id: depositAddress, amount: config.amount, msg: '' },
        gas: BigInt(300_000_000_000_000),
        deposit: BigInt(1),
      });
      txHash = result.transaction.hash;
    }

    console.log(`[SWAP] Custom account deposit sent! TX: ${txHash}`);

    // Step 3: Submit tx hash
    try {
      await api.submitDepositTx({ txHash, depositAddress });
    } catch {
      console.warn('[SWAP] Warning: Failed to submit tx hash');
    }

    return {
      success: true,
      depositAddress,
      txHash,
      quote,
      explorerUrl: `https://explorer.near-intents.org/transactions/${depositAddress}`,
      nearBlocksUrl: `https://nearblocks.io/txns/${txHash}`,
    };
  } catch (error) {
    console.error('[SWAP] Custom credentials execution failed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Poll the status of a swap until completion or failure.
 * Returns intermediate statuses via callback.
 */
export async function pollSwapStatus(
  depositAddress: string,
  onStatus?: (status: StatusResponse) => void,
  maxRetries = 60,
  intervalMs = 5000,
): Promise<StatusResponse> {
  const api = getNearIntentsAPI();

  for (let i = 0; i < maxRetries; i++) {
    try {
      const status = await api.getStatus(depositAddress);

      if (onStatus) {
        onStatus(status);
      }

      if (status.status === 'SUCCESS' || status.status === 'REFUNDED' || status.status === 'FAILED') {
        return status;
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    } catch (error) {
      console.warn(`[SWAP] Status check ${i + 1} failed:`, error);
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  // Return last known status or timeout
  return {
    status: 'PROCESSING',
    depositAddress,
    error: 'Status polling timed out',
  };
}
