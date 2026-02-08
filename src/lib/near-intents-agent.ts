/**
 * NEAR Intents AI Agent
 * 
 * TypeScript implementation of an AI agent that parses natural language
 * into NEAR Intents operations. Focused on the SUI ecosystem.
 * 
 * Capabilities:
 * - Parse natural language swap/trade intents
 * - Fetch and display available tokens
 * - Generate swap quotes
 * - Track swap status
 * - Provide helpful guidance
 */

import {
  getNearIntentsAPI,
  type TokenInfo,
  type QuoteResponse,
  type StatusResponse,
} from './near-intents-api';
import {
  executeSwap,
  isNearAccountConfigured,
  getNearAccountId,
  type SwapExecutionResult,
} from './near-transactions';

// ============== Types ==============

export type MessageType =
  | 'text'
  | 'tokens'
  | 'quote'
  | 'live_quote'
  | 'execution'
  | 'deposit_needed'
  | 'status'
  | 'error'
  | 'help'
  | 'chains';

/**
 * Options for processMessage.
 * Allows passing wallet info for dynamic per-user accounts.
 */
export interface ProcessMessageOptions {
  /** Connected SUI/EVM wallet address (for receiving tokens) */
  userAddress?: string;
  /** User's NEAR account ID (from wallet input, wallet selector, import, or Privy) */
  nearAccountId?: string;
  /** User's NEAR private key (from account import — Telegram or website power-user) */
  nearPrivateKey?: string;
  /**
   * Execution mode for NEAR-origin swaps:
   * - 'auto'        → Server executes deposit automatically (env vars or imported keys)
   * - 'privy-auto'  → Privy embedded wallet signs & broadcasts server-side
   * - 'client-sign' → Return deposit info, client will sign with connected wallet
   * - 'manual'      → Return deposit info & instructions for manual send
   * If not set, inferred from available credentials.
   */
  executionMode?: 'auto' | 'privy-auto' | 'client-sign' | 'manual';
  /** Privy wallet ID (for privy-auto execution mode) */
  privyWalletId?: string;
  /** Privy NEAR address / implicit account ID (for privy-auto execution mode) */
  privyNearAddress?: string;
}

export interface AgentMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  type: MessageType;
  data?: Record<string, unknown>;
  timestamp: number;
}

export interface ParsedIntent {
  action:
    | 'swap'
    | 'quote'
    | 'tokens'
    | 'chains'
    | 'status'
    | 'help'
    | 'balance'
    | 'fund'
    | 'confirm'
    | 'unknown';
  tokenIn?: string;
  tokenOut?: string;
  amountIn?: string;
  amountOut?: string;
  chainIn?: string;
  chainOut?: string;
  depositAddress?: string;
  raw: string;
}

export interface AgentResponse {
  message: string;
  type: MessageType;
  data?: Record<string, unknown>;
  suggestedActions?: string[];
}

// ============== Token Cache ==============

let tokenCache: TokenInfo[] | null = null;
let tokenCacheTime = 0;
const TOKEN_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function getCachedTokens(): Promise<TokenInfo[]> {
  const now = Date.now();
  if (tokenCache && now - tokenCacheTime < TOKEN_CACHE_TTL) {
    return tokenCache;
  }
  const api = getNearIntentsAPI();
  tokenCache = await api.getTokens();
  tokenCacheTime = now;
  return tokenCache;
}

// ============== Intent Parser ==============

// Common token aliases
const TOKEN_ALIASES: Record<string, string> = {
  'bitcoin': 'BTC',
  'btc': 'BTC',
  'ethereum': 'ETH',
  'ether': 'ETH',
  'eth': 'ETH',
  'sui': 'SUI',
  'usdc': 'USDC',
  'usdt': 'USDT',
  'tether': 'USDT',
  'near': 'NEAR',
  'solana': 'SOL',
  'sol': 'SOL',
  'arbitrum': 'ARB',
  'arb': 'ARB',
  'bnb': 'BNB',
  'binance': 'BNB',
  'polygon': 'POL',
  'matic': 'POL',
  'avalanche': 'AVAX',
  'avax': 'AVAX',
  'deep': 'DEEP',
  'doge': 'DOGE',
  'dogecoin': 'DOGE',
  'xrp': 'XRP',
  'ripple': 'XRP',
  'ada': 'ADA',
  'cardano': 'ADA',
  'ton': 'TON',
  'wbtc': 'WBTC',
  'weth': 'WETH',
  'dai': 'DAI',
};

// Chain aliases
const CHAIN_ALIASES: Record<string, string> = {
  'sui': 'sui',
  'near': 'near',
  'ethereum': 'eth',
  'eth': 'eth',
  'arbitrum': 'arbitrum',
  'arb': 'arbitrum',
  'base': 'base',
  'polygon': 'polygon',
  'matic': 'polygon',
  'optimism': 'optimism',
  'op': 'optimism',
  'avalanche': 'avalanche',
  'avax': 'avalanche',
  'bnb': 'bnb',
  'bsc': 'bnb',
  'binance': 'bnb',
  'solana': 'solana',
  'sol': 'solana',
  'bitcoin': 'bitcoin',
  'btc': 'bitcoin',
  'ton': 'ton',
  'tron': 'tron',
  'trx': 'tron',
};

function resolveTokenSymbol(input: string): string {
  const lower = input.toLowerCase().trim();
  return TOKEN_ALIASES[lower] || input.toUpperCase();
}

function resolveChain(input: string): string | undefined {
  const lower = input.toLowerCase().trim();
  return CHAIN_ALIASES[lower];
}

/**
 * Parse a natural language message into a structured intent.
 */
export function parseIntent(message: string): ParsedIntent {
  const raw = message.trim();
  const lower = raw.toLowerCase();

  // Help commands
  if (
    /^(help|what can you do|commands|how|guide|tutorial|getting started)/i.test(lower)
  ) {
    return { action: 'help', raw };
  }

  // Confirmation
  if (/^(yes|confirm|execute|go ahead|do it|proceed|ok|okay|sure|yep|yea|yeah)/i.test(lower)) {
    return { action: 'confirm', raw };
  }

  // Status check
  const statusMatch = lower.match(
    /(?:check|get|show|what(?:'s| is))\s+(?:the\s+)?status\s+(?:of\s+)?(.+)/i
  );
  if (statusMatch || /^status\s/i.test(lower) || lower === 'status') {
    const depositAddress = statusMatch?.[1]?.trim();
    return { action: 'status', depositAddress, raw };
  }

  // Token listing
  if (
    /(?:list|show|get|what|which|available|supported)\s+(?:are\s+)?(?:the\s+)?(?:available\s+)?tokens/i.test(lower) ||
    /tokens?\s+(?:on|for|available)/i.test(lower) ||
    lower === 'tokens'
  ) {
    // Check for chain-specific token listing
    let chain: string | undefined;
    for (const [alias, chainName] of Object.entries(CHAIN_ALIASES)) {
      if (lower.includes(alias)) {
        chain = chainName;
        break;
      }
    }
    return { action: 'tokens', chainIn: chain, raw };
  }

  // Chain listing
  if (
    /(?:list|show|get|what|which|available|supported)\s+(?:are\s+)?(?:the\s+)?(?:available\s+)?(?:chains|networks|blockchains)/i.test(lower) ||
    lower === 'chains' ||
    lower === 'networks'
  ) {
    return { action: 'chains', raw };
  }

  // Balance check
  if (/(?:my\s+)?balance/i.test(lower) || /how much (?:do i|i) have/i.test(lower)) {
    return { action: 'balance', raw };
  }

  // Fund wallet
  if (/^(?:fund|deposit|add funds|fund wallet|top up)/i.test(lower)) {
    return { action: 'fund', raw };
  }

  // Swap / Quote intent parsing
  // Patterns:
  // "swap 100 USDC for SUI"
  // "exchange 0.5 ETH to USDC"
  // "convert 1000 USDC into SUI on sui"
  // "trade 50 NEAR for USDC"
  // "buy SUI with 100 USDC"
  // "sell 0.1 ETH for USDC"
  // "get quote for 100 USDC to SUI"
  // "how much SUI can I get for 100 USDC"
  // "I want to swap 100 USDC for SUI"
  // "swap $100 of USDC for SUI"

  let tokenIn: string | undefined;
  let tokenOut: string | undefined;
  let amountIn: string | undefined;
  let chainIn: string | undefined;
  let chainOut: string | undefined;
  let isQuoteOnly = false;

  // Check if it's a quote request
  if (/(?:get|show|give)\s+(?:me\s+)?(?:a\s+)?quote/i.test(lower) ||
      /how much/i.test(lower) ||
      /what (?:would|will|can|do) i get/i.test(lower) ||
      /price (?:of|for)/i.test(lower) ||
      /estimate/i.test(lower)) {
    isQuoteOnly = true;
  }

  // Pattern: "swap/exchange/convert/trade AMOUNT TOKEN_IN for/to/into TOKEN_OUT"
  const swapPattern =
    /(?:swap|exchange|convert|trade|send|transfer|i want to swap|i(?:'d| would) like to swap)\s+\$?([\d,.]+)\s*(?:of\s+)?(\w+)\s+(?:for|to|into|->|→)\s+(\w+)/i;
  const swapMatch = raw.match(swapPattern);

  if (swapMatch) {
    amountIn = swapMatch[1].replace(/,/g, '');
    tokenIn = resolveTokenSymbol(swapMatch[2]);
    tokenOut = resolveTokenSymbol(swapMatch[3]);
  }

  // Pattern: "buy TOKEN_OUT with AMOUNT TOKEN_IN"
  if (!swapMatch) {
    const buyPattern =
      /(?:buy|purchase|get)\s+(\w+)\s+(?:with|using|from)\s+\$?([\d,.]+)\s*(?:of\s+)?(\w+)/i;
    const buyMatch = raw.match(buyPattern);
    if (buyMatch) {
      tokenOut = resolveTokenSymbol(buyMatch[1]);
      amountIn = buyMatch[2].replace(/,/g, '');
      tokenIn = resolveTokenSymbol(buyMatch[3]);
    }
  }

  // Pattern: "sell AMOUNT TOKEN_IN for TOKEN_OUT"
  if (!swapMatch && !tokenIn) {
    const sellPattern =
      /(?:sell)\s+\$?([\d,.]+)\s*(?:of\s+)?(\w+)\s+(?:for|to|into)\s+(\w+)/i;
    const sellMatch = raw.match(sellPattern);
    if (sellMatch) {
      amountIn = sellMatch[1].replace(/,/g, '');
      tokenIn = resolveTokenSymbol(sellMatch[2]);
      tokenOut = resolveTokenSymbol(sellMatch[3]);
    }
  }

  // Pattern: "how much TOKEN_OUT for/from AMOUNT TOKEN_IN"
  if (!tokenIn) {
    const howMuchPattern =
      /how much\s+(\w+)\s+(?:can i get |would i get |will i get |do i get )?(?:for|from|with)\s+\$?([\d,.]+)\s*(?:of\s+)?(\w+)/i;
    const howMuchMatch = raw.match(howMuchPattern);
    if (howMuchMatch) {
      tokenOut = resolveTokenSymbol(howMuchMatch[1]);
      amountIn = howMuchMatch[2].replace(/,/g, '');
      tokenIn = resolveTokenSymbol(howMuchMatch[3]);
      isQuoteOnly = true;
    }
  }

  // Pattern: "quote AMOUNT TOKEN_IN to TOKEN_OUT"
  if (!tokenIn) {
    const quotePattern =
      /(?:quote|estimate|price)\s+(?:for\s+)?\$?([\d,.]+)\s*(?:of\s+)?(\w+)\s+(?:to|for|->|→)\s+(\w+)/i;
    const quoteMatch = raw.match(quotePattern);
    if (quoteMatch) {
      amountIn = quoteMatch[1].replace(/,/g, '');
      tokenIn = resolveTokenSymbol(quoteMatch[2]);
      tokenOut = resolveTokenSymbol(quoteMatch[3]);
      isQuoteOnly = true;
    }
  }

  // Pattern: "AMOUNT TOKEN_IN to TOKEN_OUT" (simple shorthand)
  if (!tokenIn) {
    const simplePattern = /^(\d+[\d,.]*)\s+(\w+)\s+(?:to|->|→|for)\s+(\w+)$/i;
    const simpleMatch = raw.match(simplePattern);
    if (simpleMatch) {
      amountIn = simpleMatch[1].replace(/,/g, '');
      tokenIn = resolveTokenSymbol(simpleMatch[2]);
      tokenOut = resolveTokenSymbol(simpleMatch[3]);
    }
  }

  // Extract chain info from the message
  const onChainPattern = /\bon\s+(\w+)(?:\s+chain|\s+network)?/i;
  const fromChainPattern = /\bfrom\s+(\w+)\s+(?:chain|network|to)/i;
  const toChainPattern = /\bto\s+(\w+)\s+(?:chain|network)/i;

  const onChainMatch = raw.match(onChainPattern);
  const fromChainMatch = raw.match(fromChainPattern);
  const toChainMatch = raw.match(toChainPattern);

  if (fromChainMatch) {
    chainIn = resolveChain(fromChainMatch[1]);
  }
  if (toChainMatch) {
    chainOut = resolveChain(toChainMatch[1]);
  }
  if (onChainMatch && !chainOut) {
    // "on sui" typically means the destination
    chainOut = resolveChain(onChainMatch[1]);
  }

  // If we parsed a swap intent
  if (tokenIn && tokenOut && amountIn) {
    return {
      action: isQuoteOnly ? 'quote' : 'swap',
      tokenIn,
      tokenOut,
      amountIn,
      chainIn,
      chainOut,
      raw,
    };
  }

  // If partial parse - treat as natural conversation or unknown
  if (tokenIn || tokenOut) {
    return {
      action: 'quote',
      tokenIn,
      tokenOut,
      amountIn,
      chainIn,
      chainOut,
      raw,
    };
  }

  return { action: 'unknown', raw };
}

// ============== Agent Core ==============

export class NearIntentsAgent {
  private api = getNearIntentsAPI();
  private pendingQuote: {
    originAsset: string;
    destinationAsset: string;
    amount: string;
    refundAddress: string;
    recipientAddress: string;
    tokenInSymbol: string;
    tokenOutSymbol: string;
    amountIn: string;
    originChain: string;
    destChain: string;
  } | null = null;
  private lastExecutionResult: SwapExecutionResult | null = null;

  /**
   * Process a user message and return an agent response.
   *
   * @param message   Natural language input.
   * @param options   Wallet context — or a plain string (legacy: treated as userAddress).
   */
  async processMessage(
    message: string,
    options?: ProcessMessageOptions | string
  ): Promise<AgentResponse> {
    // Backward compatibility: if options is a string, treat as userAddress
    const opts: ProcessMessageOptions =
      typeof options === 'string' ? { userAddress: options } : options ?? {};

    const intent = parseIntent(message);

    // Special handler: "deposit_sent <txHash> <depositAddress>"
    const depositSentMatch = message.match(
      /deposit_sent\s+([A-Za-z0-9]+)\s+([A-Za-z0-9._-]+)/i
    );
    if (depositSentMatch) {
      return this.handleDepositSent(depositSentMatch[1], depositSentMatch[2]);
    }

    switch (intent.action) {
      case 'help':
        return this.handleHelp(opts);

      case 'tokens':
        return this.handleTokens(intent.chainIn);

      case 'chains':
        return this.handleChains();

      case 'swap':
        return this.handleSwapQuote(intent, opts, false);

      case 'quote':
        return this.handleSwapQuote(intent, opts, true);

      case 'confirm':
        return this.handleConfirm(opts);

      case 'status':
        return this.handleStatus(intent.depositAddress);

      case 'balance':
        return this.handleBalance(opts);

      case 'fund':
        return this.handleFund(opts);

      case 'unknown':
      default:
        return this.handleUnknown(message);
    }
  }

  private handleHelp(opts: ProcessMessageOptions = {}): AgentResponse {
    const nearConfigured = isNearAccountConfigured();
    const nearAccount = getNearAccountId();
    const userNear = opts.nearAccountId;

    let setupInfo = '';
    if (userNear) {
      setupInfo = `🔑 **Your NEAR Account:** \`${userNear}\`\n`;
    } else if (nearConfigured) {
      setupInfo = `🔑 **Server NEAR Account:** \`${nearAccount}\` (auto-execution enabled)\n`;
    }

    return {
      message: `👋 **Welcome to the NEAR Intents Agent!**

I can help you perform cross-chain swaps using NEAR Intents, with a focus on the SUI ecosystem.

${setupInfo}

**Here's what I can do:**

🔄 **Swap tokens** — "Swap 0.1 NEAR for SUI"
💰 **Get quotes** — "How much SUI can I get for 50 USDC?"
📋 **List tokens** — "Show available tokens on SUI"
🌐 **List chains** — "What chains are supported?"
📊 **Check status** — "Check status of <deposit_address>"
💼 **Balance** — "Balance"

**Example commands:**
• \`swap 0.1 NEAR for SUI\` — executes automatically from ${userNear ? 'your' : 'configured'} NEAR account
• \`buy SUI with 50 USDC\`
• \`quote 1000 USDT to ETH\`
• \`tokens on sui\`
• \`chains\`

${userNear
  ? '🚀 **Your NEAR wallet is connected!** Swaps from NEAR will use your account.'
  : nearConfigured
  ? '🚀 **Auto-execution is ON!** Swaps from NEAR will be executed automatically when you confirm.'
  : '💡 **Tip:** Enter your NEAR account ID to enable swaps from NEAR, or just get quotes and deposit manually.'}

I support cross-chain swaps across 15+ blockchains including SUI, NEAR, Ethereum, Arbitrum, Solana, Bitcoin, and more!`,
      type: 'help',
      suggestedActions: [
        'Show tokens on SUI',
        'Swap 0.01 NEAR for SUI',
        'What chains are supported?',
        'Balance',
      ],
    };
  }

  private async handleTokens(chain?: string): Promise<AgentResponse> {
    try {
      let tokens: TokenInfo[];

      if (chain) {
        tokens = await this.api.getTokensByChain(chain);
      } else {
        // Default to SUI tokens
        tokens = await this.api.getTokensByChain('sui');
        if (tokens.length === 0) {
          // Fallback: get all tokens
          tokens = await getCachedTokens();
        }
      }

      if (tokens.length === 0) {
        return {
          message: chain
            ? `No tokens found on the **${chain}** chain. Try "chains" to see all supported chains.`
            : 'No tokens found. The API might be temporarily unavailable.',
          type: 'text',
          suggestedActions: ['Show all chains', 'Show tokens on NEAR'],
        };
      }

      // Group by chain
      const byChain: Record<string, TokenInfo[]> = {};
      for (const token of tokens) {
        if (!byChain[token.blockchain]) {
          byChain[token.blockchain] = [];
        }
        byChain[token.blockchain].push(token);
      }

      const chainName = chain || 'SUI';
      const tokenCount = tokens.length;

      let message = `📋 **Available Tokens on ${chainName.toUpperCase()}** (${tokenCount} tokens)\n\n`;

      for (const [chainKey, chainTokens] of Object.entries(byChain)) {
        const uniqueSymbols = [...new Set(chainTokens.map((t) => t.symbol))].sort();
        message += `**${chainKey.toUpperCase()}:** ${uniqueSymbols.join(', ')}\n`;
      }

      return {
        message,
        type: 'tokens',
        data: { tokens, chain: chainName },
        suggestedActions: [
          'Swap 10 USDC for SUI',
          'Show tokens on NEAR',
          'Show all chains',
        ],
      };
    } catch (error) {
      return {
        message: `Failed to fetch tokens: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error',
      };
    }
  }

  private async handleChains(): Promise<AgentResponse> {
    try {
      const chains = await this.api.getSupportedChains();

      const message = `🌐 **Supported Blockchains** (${chains.length} chains)\n\n${chains.map((c) => `• ${c.charAt(0).toUpperCase() + c.slice(1)}`).join('\n')}\n\nYou can swap tokens between any of these chains using NEAR Intents!`;

      return {
        message,
        type: 'chains',
        data: { chains },
        suggestedActions: [
          'Show tokens on SUI',
          'Show tokens on NEAR',
          'Swap 10 USDC for SUI',
        ],
      };
    } catch (error) {
      return {
        message: `Failed to fetch chains: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error',
      };
    }
  }

  private async handleSwapQuote(
    intent: ParsedIntent,
    opts: ProcessMessageOptions,
    dryRun = true
  ): Promise<AgentResponse> {
    const { tokenIn, tokenOut, amountIn, chainIn, chainOut } = intent;
    const userAddress = opts.userAddress;
    const userNearAccountId = opts.nearAccountId;

    // Validate required fields
    if (!tokenIn || !tokenOut) {
      return {
        message:
          'I need both the input and output tokens to generate a quote. Please specify like: "swap 100 USDC for SUI"',
        type: 'text',
        suggestedActions: [
          'Swap 100 USDC for SUI',
          'Buy SUI with 50 USDT',
          'Help',
        ],
      };
    }

    if (!amountIn) {
      return {
        message: `How much **${tokenIn}** would you like to swap for **${tokenOut}**? Please specify an amount.`,
        type: 'text',
        suggestedActions: [
          `Swap 10 ${tokenIn} for ${tokenOut}`,
          `Swap 100 ${tokenIn} for ${tokenOut}`,
          `Swap 1000 ${tokenIn} for ${tokenOut}`,
        ],
      };
    }

    try {
      // Find matching tokens
      const allTokens = await getCachedTokens();

      // Find origin token (prefer chainIn if specified)
      let originToken = findBestToken(allTokens, tokenIn, chainIn);
      if (!originToken) {
        return {
          message: `Could not find token **${tokenIn}**${chainIn ? ` on ${chainIn}` : ''}. Try "tokens" to see available tokens.`,
          type: 'error',
          suggestedActions: ['Show all tokens', 'Show tokens on SUI'],
        };
      }

      // Find destination token (prefer SUI chain if no chain specified, or chainOut)
      const preferredDestChain = chainOut || (tokenOut === 'SUI' ? 'sui' : undefined);
      let destToken = findBestToken(allTokens, tokenOut, preferredDestChain);
      if (!destToken) {
        return {
          message: `Could not find token **${tokenOut}**${chainOut ? ` on ${chainOut}` : ''}. Try "tokens" to see available tokens.`,
          type: 'error',
          suggestedActions: ['Show all tokens', 'Show tokens on SUI'],
        };
      }

      // Calculate amount in smallest units
      const decimals = originToken.decimals || guessDecimals(tokenIn);
      const amountRaw = toSmallestUnit(amountIn, decimals);

      // ====== Cross-chain address routing ======
      // refundTo: must be valid on the ORIGIN chain (where tokens come from)
      // recipient: must be valid on the DESTINATION chain (where tokens go)
      //
      // userAddress is the connected wallet (e.g. SUI hex address: 0x + 64 hex = 66 chars)
      // userNearAccountId is the user's own NEAR wallet (from input/import/wallet selector)
      // getNearAccountId() is the server-configured NEAR account (e.g. naveen6087.near)
      // EVM addresses are 0x + 40 hex = 42 chars
      const serverNearAccountId = getNearAccountId();
      const nearAccountId = userNearAccountId || serverNearAccountId;
      const originChain = originToken.blockchain.toLowerCase();
      const destChain = destToken.blockchain.toLowerCase();

      const EVM_CHAINS = ['eth', 'arb', 'bsc', 'base', 'op', 'gnosis', 'polygon', 'avalanche'];
      const isOriginNear = originChain === 'near';
      const isOriginSui = originChain === 'sui';
      const isOriginEvm = EVM_CHAINS.includes(originChain);
      const isDestNear = destChain === 'near';
      const isDestSui = destChain === 'sui';
      const isDestEvm = EVM_CHAINS.includes(destChain);
      const isSuiAddress = userAddress?.startsWith('0x') && (userAddress?.length ?? 0) > 42;

      console.log(`[Agent] Token resolution: ${tokenIn} → ${originToken.symbol} on ${originToken.blockchain} (${originToken.assetId})`);
      console.log(`[Agent] Token resolution: ${tokenOut} → ${destToken.symbol} on ${destToken.blockchain} (${destToken.assetId})`);
      console.log(`[Agent] Address context: userAddress=${userAddress?.slice(0, 12)}..., nearAccount=${nearAccountId}, userNearAccount=${userNearAccountId || 'none'}, originChain=${originChain}, destChain=${destChain}`);

      // Determine refund address (ORIGIN chain)
      let refundAddress: string;
      if (isOriginNear) {
        // Origin is NEAR: refund must be a NEAR account (e.g. naveen6087.near)
        refundAddress = nearAccountId || '';
      } else if (isOriginSui && userAddress && isSuiAddress) {
        // Origin is SUI and we have a valid SUI wallet
        refundAddress = userAddress;
      } else if (isOriginEvm) {
        // Origin is EVM: we do NOT have an EVM wallet connected (we only have SUI)
        // A SUI hex address (66 chars) is NOT a valid EVM address (42 chars)
        refundAddress = '';
      } else {
        refundAddress = userAddress || nearAccountId || '';
      }

      // Determine recipient address (DESTINATION chain)
      let recipientAddress: string;
      if (isDestSui && userAddress && isSuiAddress) {
        // Destination is SUI and we have a valid SUI wallet
        recipientAddress = userAddress;
      } else if (isDestNear) {
        // Destination is NEAR: recipient must be a NEAR account
        recipientAddress = nearAccountId || '';
      } else if (isDestEvm) {
        // Destination is EVM: we do NOT have an EVM wallet
        recipientAddress = '';
      } else {
        recipientAddress = userAddress || nearAccountId || '';
      }

      if (!refundAddress) {
        const chainLabel = originToken.blockchain.toUpperCase();
        const hint = isOriginNear
          ? 'Configure SENDER_NEAR_ACCOUNT in .env.local.'
          : isOriginEvm
          ? `You need a ${chainLabel} wallet address. This app currently supports NEAR and SUI origins.`
          : 'Connect your wallet.';
        return {
          message: `⚠️ I need a valid **${chainLabel}** address for the refund. ${hint}`,
          type: 'error',
          suggestedActions: ['Help'],
        };
      }

      if (!recipientAddress) {
        const chainLabel = destToken.blockchain.toUpperCase();
        const hint = isDestSui
          ? 'Connect your SUI wallet.'
          : isDestNear
          ? 'Configure SENDER_NEAR_ACCOUNT.'
          : `You need a ${chainLabel} wallet address. This app currently supports SUI and NEAR destinations.`;
        return {
          message: `⚠️ I need a valid **${chainLabel}** address to receive tokens. ${hint}`,
          type: 'error',
          suggestedActions: ['Help'],
        };
      }

      // Store pending quote info
      this.pendingQuote = {
        originAsset: originToken.assetId,
        destinationAsset: destToken.assetId,
        amount: amountRaw,
        refundAddress,
        recipientAddress,
        tokenInSymbol: tokenIn,
        tokenOutSymbol: tokenOut,
        amountIn: amountIn,
        originChain: originToken.blockchain,
        destChain: destToken.blockchain,
      };

      // Get dry-run quote first
      const quote = await this.api.getDryQuote({
        originAsset: originToken.assetId,
        destinationAsset: destToken.assetId,
        amount: amountRaw,
        refundAddress,
        recipientAddress,
      });

      if (quote.error) {
        return {
          message: `Quote error: ${quote.error}`,
          type: 'error',
          suggestedActions: ['Try a different amount', 'Show tokens'],
        };
      }

      if (!quote.quote) {
        return {
          message: 'No quote available for this swap pair at the moment. Solvers may not be offering this route right now. Try again shortly or try a different pair.',
          type: 'error',
          suggestedActions: ['Show tokens on SUI', 'Try a different pair'],
        };
      }

      const q = quote.quote;
      const amountOutFormatted = q.amountOutFormatted || q.amountOut || 'N/A';
      const amountInUsd = q.amountInUsd ? `$${parseFloat(q.amountInUsd).toFixed(2)}` : '';
      const amountOutUsd = q.amountOutUsd ? `$${parseFloat(q.amountOutUsd).toFixed(2)}` : '';

      const swapCost = q.amountInUsd && q.amountOutUsd
        ? `$${(parseFloat(q.amountInUsd) - parseFloat(q.amountOutUsd)).toFixed(4)}`
        : 'N/A';

      // Determine execution capability
      const canAutoExecute =
        originToken.blockchain === 'near' &&
        (opts.nearPrivateKey ? true : isNearAccountConfigured());
      const canClientSign =
        originToken.blockchain === 'near' &&
        !!userNearAccountId &&
        opts.executionMode === 'client-sign';

      const message = `📊 **Swap Quote**

| | Token | Amount | USD |
|---|---|---|---|
| **From** | ${tokenIn} (${originToken.blockchain}) | ${amountIn} | ${amountInUsd} |
| **To** | ${tokenOut} (${destToken.blockchain}) | ${amountOutFormatted} | ${amountOutUsd} |

**Swap Cost:** ${swapCost}
**Route:** ${originToken.blockchain} → NEAR Intents → ${destToken.blockchain}
**Slippage Tolerance:** 1%

${canAutoExecute
  ? `🚀 I can **auto-execute** this swap from \`${nearAccountId}\`. Say **"confirm"** to proceed!`
  : canClientSign
    ? `🔐 I'll prepare the deposit transaction for you to sign with your NEAR wallet (\`${userNearAccountId}\`). Say **"confirm"** to proceed!`
    : userNearAccountId
      ? `💡 Say **"confirm"** to get the deposit address. Then send your tokens manually from \`${userNearAccountId}\`.`
      : !userAddress
        ? '⚠️ Connect your wallet to execute this swap.'
        : dryRun
          ? '💡 Say **"confirm"** or **"execute"** to proceed with this swap.'
          : ''}`;

      return {
        message,
        type: 'quote',
        data: {
          quote: q,
          tokenIn,
          tokenOut,
          amountIn,
          originChain: originToken.blockchain,
          destChain: destToken.blockchain,
          originAsset: originToken.assetId,
          destAsset: destToken.assetId,
          canAutoExecute,
          canClientSign,
          nearAccountId,
        },
        suggestedActions: ['Confirm swap', 'Get a different quote', 'Cancel'],
      };
    } catch (error) {
      return {
        message: `Failed to get quote: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error',
        suggestedActions: ['Try again', 'Show tokens', 'Help'],
      };
    }
  }

  private async handleConfirm(opts: ProcessMessageOptions): Promise<AgentResponse> {
    if (!this.pendingQuote) {
      return {
        message: 'No pending quote to confirm. Get a quote first by saying something like "swap 100 USDC for SUI".',
        type: 'text',
        suggestedActions: ['Swap 10 USDC for SUI', 'Help'],
      };
    }

    const isNearOrigin = this.pendingQuote.originChain === 'near';
    const hasServerAccount = isNearAccountConfigured();
    const hasImportedKeys = !!opts.nearPrivateKey && !!opts.nearAccountId;
    const isClientSign = opts.executionMode === 'client-sign' && !!opts.nearAccountId;
    const isPrivyAuto = opts.executionMode === 'privy-auto' && !!opts.privyWalletId && !!opts.privyNearAddress;

    // Determine execution path:
    // 1. Imported keys (Telegram or website power-user) → auto-execute with custom credentials
    // 2. Privy embedded wallet (Telegram /connect) → server-side signing via Privy
    // 3. Client-side wallet (website with wallet selector) → return deposit_needed
    // 4. Server NEAR account (env vars) → auto-execute with server credentials
    // 5. None of the above → manual deposit
    if (isNearOrigin && hasImportedKeys) {
      return this.handleAutoExecuteWithCredentials(opts);
    }
    if (isNearOrigin && isPrivyAuto) {
      return this.handlePrivyAutoDeposit(opts);
    }
    if (isNearOrigin && isClientSign) {
      return this.handleClientSideDeposit(opts);
    }
    if (isNearOrigin && hasServerAccount) {
      return this.handleAutoExecute(opts);
    }

    // Fall back to manual deposit (show deposit address + instructions)
    return this.handleManualDeposit(opts);
  }

  /**
   * Auto-execute a swap by sending the deposit from the server-configured NEAR account.
   */
  private async handleAutoExecute(opts: ProcessMessageOptions): Promise<AgentResponse> {
    if (!this.pendingQuote) {
      return { message: 'No pending quote.', type: 'error' };
    }

    const nearAccountId = getNearAccountId();

    try {
      const message = `🚀 **Executing Swap...**

Sending **${this.pendingQuote.amountIn} ${this.pendingQuote.tokenInSymbol}** from \`${nearAccountId}\` → **${this.pendingQuote.tokenOutSymbol}**

Please wait while the transaction is being processed...`;

      // Execute the actual swap
      const result = await executeSwap({
        originAsset: this.pendingQuote.originAsset,
        destinationAsset: this.pendingQuote.destinationAsset,
        amount: this.pendingQuote.amount,
        recipientAddress: this.pendingQuote.recipientAddress,
        refundAddress: nearAccountId,
        slippageTolerance: 100,
      });

      this.lastExecutionResult = result;

      if (!result.success) {
        this.pendingQuote = null;
        return {
          message: `❌ **Swap Failed**\n\n${result.error || 'Unknown error occurred during swap execution.'}\n\nPlease try again with a new quote.`,
          type: 'error',
          suggestedActions: ['Try again', 'Help'],
        };
      }

      const pendingData = { ...this.pendingQuote };
      this.pendingQuote = null;
      const q = result.quote?.quote;

      return {
        message: `✅ **Swap Executed Successfully!**

| | Details |
|---|---|
| **From** | ${pendingData.amountIn} ${pendingData.tokenInSymbol} |
| **To** | ${q?.amountOutFormatted || q?.amountOut || 'Pending...'} ${pendingData.tokenOutSymbol} |
| **NEAR Account** | \`${nearAccountId}\` |
| **Deposit Address** | \`${result.depositAddress}\` |
| **TX Hash** | \`${result.txHash}\` |
| **Status** | 🔄 Processing |

**The swap has been submitted!** Your ${pendingData.tokenOutSymbol} will arrive at the recipient address once processed.

📊 You can track the progress:
• Say **"status ${result.depositAddress}"** to check
• 🔗 [NEAR Intents Explorer](${result.explorerUrl})
• 🔗 [NearBlocks TX](${result.nearBlocksUrl})`,
        type: 'execution',
        data: {
          depositAddress: result.depositAddress,
          txHash: result.txHash,
          quote: q,
          explorerUrl: result.explorerUrl,
          nearBlocksUrl: result.nearBlocksUrl,
          ...pendingData,
        },
        suggestedActions: [
          `Check status of ${result.depositAddress}`,
          'Get another quote',
        ],
      };
    } catch (error) {
      this.pendingQuote = null;
      return {
        message: `❌ **Swap Execution Failed**\n\n${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease try again.`,
        type: 'error',
        suggestedActions: ['Try again', 'Help'],
      };
    }
  }

  /**
   * Auto-execute with user-imported NEAR credentials (Telegram /import or website import).
   */
  private async handleAutoExecuteWithCredentials(opts: ProcessMessageOptions): Promise<AgentResponse> {
    if (!this.pendingQuote || !opts.nearAccountId || !opts.nearPrivateKey) {
      return { message: 'No pending quote or missing credentials.', type: 'error' };
    }

    try {
      const { executeSwapWithCredentials } = await import('./near-transactions');

      const result = await executeSwapWithCredentials(
        {
          originAsset: this.pendingQuote.originAsset,
          destinationAsset: this.pendingQuote.destinationAsset,
          amount: this.pendingQuote.amount,
          recipientAddress: this.pendingQuote.recipientAddress,
          refundAddress: opts.nearAccountId,
          slippageTolerance: 100,
        },
        opts.nearAccountId,
        opts.nearPrivateKey,
      );

      this.lastExecutionResult = result;

      if (!result.success) {
        this.pendingQuote = null;
        return {
          message: `❌ **Swap Failed**\n\n${result.error || 'Unknown error.'}\n\nPlease try again.`,
          type: 'error',
          suggestedActions: ['Try again', 'Help'],
        };
      }

      const pendingData = { ...this.pendingQuote };
      this.pendingQuote = null;
      const q = result.quote?.quote;

      return {
        message: `✅ **Swap Executed Successfully!**

| | Details |
|---|---|
| **From** | ${pendingData.amountIn} ${pendingData.tokenInSymbol} |
| **To** | ${q?.amountOutFormatted || q?.amountOut || 'Pending...'} ${pendingData.tokenOutSymbol} |
| **Your NEAR Account** | \`${opts.nearAccountId}\` |
| **Deposit Address** | \`${result.depositAddress}\` |
| **TX Hash** | \`${result.txHash}\` |

📊 Track progress: say **"status ${result.depositAddress}"**
🔗 [NEAR Intents Explorer](${result.explorerUrl})`,
        type: 'execution',
        data: {
          depositAddress: result.depositAddress,
          txHash: result.txHash,
          quote: q,
          explorerUrl: result.explorerUrl,
          nearBlocksUrl: result.nearBlocksUrl,
          ...pendingData,
        },
        suggestedActions: [
          `Check status of ${result.depositAddress}`,
          'Get another quote',
        ],
      };
    } catch (error) {
      this.pendingQuote = null;
      return {
        message: `❌ **Swap Failed**\n\n${error instanceof Error ? error.message : 'Unknown error'}\n\nCheck that your imported NEAR credentials are correct.`,
        type: 'error',
        suggestedActions: ['Try again', 'Help'],
      };
    }
  }

  /**
   * Auto-execute with Privy embedded wallet (server-side signing).
   * Used when executionMode === 'privy-auto' (Telegram /connect with Privy).
   */
  private async handlePrivyAutoDeposit(opts: ProcessMessageOptions): Promise<AgentResponse> {
    if (!this.pendingQuote || !opts.privyWalletId || !opts.privyNearAddress) {
      return { message: 'No pending quote or missing Privy wallet info.', type: 'error' };
    }

    try {
      const { executePrivySwapDeposit } = await import('./privy');

      const result = await executePrivySwapDeposit(
        opts.privyWalletId,
        opts.privyNearAddress,
        this.pendingQuote.originAsset,
        this.pendingQuote.destinationAsset,
        this.pendingQuote.amount,
        this.pendingQuote.recipientAddress,
        opts.privyNearAddress, // refund to Privy wallet
      );

      this.lastExecutionResult = {
        success: result.success,
        txHash: result.txHash,
        depositAddress: result.depositAddress,
        error: result.error,
        explorerUrl: result.explorerUrl,
        nearBlocksUrl: result.nearBlocksUrl,
      };

      if (!result.success) {
        this.pendingQuote = null;
        return {
          message: `❌ **Swap Failed**\n\n${result.error || 'Unknown error.'}\n\nPlease try again.`,
          type: 'error',
          suggestedActions: ['Try again', 'Help'],
        };
      }

      const pendingData = { ...this.pendingQuote };
      this.pendingQuote = null;

      return {
        message: `✅ **Swap Executed Successfully!**

| | Details |
|---|---|
| **From** | ${pendingData.amountIn} ${pendingData.tokenInSymbol} |
| **To** | (estimated) ${pendingData.tokenOutSymbol} |
| **Privy Wallet** | \`${opts.privyNearAddress}\` |
| **Deposit Address** | \`${result.depositAddress}\` |
| **TX Hash** | \`${result.txHash}\` |

📊 Track progress: say **"status ${result.depositAddress}"**
🔗 [NEAR Intents Explorer](${result.explorerUrl})
🔗 [NearBlocks TX](${result.nearBlocksUrl})`,
        type: 'execution',
        data: {
          depositAddress: result.depositAddress,
          txHash: result.txHash,
          explorerUrl: result.explorerUrl,
          nearBlocksUrl: result.nearBlocksUrl,
          ...pendingData,
        },
        suggestedActions: [
          `Check status of ${result.depositAddress}`,
          'Get another quote',
        ],
      };
    } catch (error) {
      this.pendingQuote = null;
      return {
        message: `❌ **Swap Failed**\n\n${error instanceof Error ? error.message : 'Unknown error'}\n\nPlease try again.`,
        type: 'error',
        suggestedActions: ['Try again', 'Help'],
      };
    }
  }

  /**
   * Return deposit info so the client can sign the deposit with their connected NEAR wallet.
   * Used when executionMode === 'client-sign' (website with wallet selector).
   */
  private async handleClientSideDeposit(opts: ProcessMessageOptions): Promise<AgentResponse> {
    if (!this.pendingQuote) {
      return { message: 'No pending quote.', type: 'error' };
    }

    try {
      // Get a live quote with deposit address
      const quote = await this.api.getLiveQuote({
        originAsset: this.pendingQuote.originAsset,
        destinationAsset: this.pendingQuote.destinationAsset,
        amount: this.pendingQuote.amount,
        refundAddress: opts.nearAccountId || this.pendingQuote.refundAddress,
        recipientAddress: this.pendingQuote.recipientAddress,
      });

      if (quote.error || !quote.quote?.depositAddress) {
        return {
          message: `Failed to prepare deposit: ${quote.error || 'No deposit address returned'}. Please try again.`,
          type: 'error',
          suggestedActions: ['Try again', 'Get a new quote'],
        };
      }

      const q = quote.quote;
      const pendingData = { ...this.pendingQuote };
      this.pendingQuote = null;

      return {
        message: `🔐 **Sign & Send Deposit**

Your NEAR wallet will be prompted to sign a transfer of **${pendingData.amountIn} ${pendingData.tokenInSymbol}** to the deposit address.

| | Details |
|---|---|
| **From** | ${pendingData.amountIn} ${pendingData.tokenInSymbol} |
| **To** | ${q.amountOutFormatted || q.amountOut} ${pendingData.tokenOutSymbol} |
| **Deposit Address** | \`${q.depositAddress}\` |
| **Your NEAR Account** | \`${opts.nearAccountId}\` |

⏳ Please approve the transaction in your wallet...`,
        type: 'deposit_needed',
        data: {
          ...pendingData,
          depositAddress: q.depositAddress,
          amountFormatted: pendingData.amountIn,
          tokenSymbol: pendingData.tokenInSymbol,
          deadline: q.deadline,
          quote: q,
        },
        suggestedActions: [],
      };
    } catch (error) {
      return {
        message: `Failed to prepare deposit: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error',
        suggestedActions: ['Try again'],
      };
    }
  }

  /**
   * Handle a deposit_sent confirmation after client-side signing.
   * The client sends "deposit_sent <txHash> <depositAddress>" after signing.
   */
  private async handleDepositSent(txHash: string, depositAddress: string): Promise<AgentResponse> {
    try {
      // Submit the tx hash to 1-Click API
      const api = getNearIntentsAPI();
      try {
        await api.submitDepositTx({ txHash, depositAddress });
      } catch {
        // Non-critical
        console.warn('[Agent] Failed to submit tx hash to 1-Click API');
      }

      return {
        message: `✅ **Deposit Submitted!**

| | Details |
|---|---|
| **TX Hash** | \`${txHash}\` |
| **Deposit Address** | \`${depositAddress}\` |
| **Status** | 🔄 Processing |

Your swap is being processed! Say **"status ${depositAddress}"** to track progress.

🔗 [NEAR Intents Explorer](https://explorer.near-intents.org/transactions/${depositAddress})
🔗 [NearBlocks TX](https://nearblocks.io/txns/${txHash})`,
        type: 'execution',
        data: { txHash, depositAddress },
        suggestedActions: [
          `Check status of ${depositAddress}`,
          'Get another quote',
        ],
      };
    } catch (error) {
      return {
        message: `Failed to submit deposit: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error',
        suggestedActions: ['Try again'],
      };
    }
  }

  /**
   * Show deposit address for manual deposit (non-NEAR origins or no auto-execution).
   */
  private async handleManualDeposit(opts: ProcessMessageOptions): Promise<AgentResponse> {
    if (!this.pendingQuote) {
      return { message: 'No pending quote.', type: 'error' };
    }

    const userAddress = opts.userAddress;

    if (!userAddress && !opts.nearAccountId) {
      if (!isNearAccountConfigured()) {
        return {
          message: '⚠️ Please connect your wallet or enter your NEAR account ID to execute swaps.',
          type: 'error',
          suggestedActions: ['Help'],
        };
      }
    }

    try {
      const recipientAddr = this.pendingQuote.recipientAddress;

      // Get a live quote with deposit address
      const quote = await this.api.getLiveQuote({
        originAsset: this.pendingQuote.originAsset,
        destinationAsset: this.pendingQuote.destinationAsset,
        amount: this.pendingQuote.amount,
        refundAddress: this.pendingQuote.refundAddress,
        recipientAddress: this.pendingQuote.recipientAddress,
      });

      if (quote.error || !quote.quote) {
        return {
          message: `Failed to generate live quote: ${quote.error || 'No quote available'}. Please try again.`,
          type: 'error',
          suggestedActions: ['Try again', 'Get a new quote'],
        };
      }

      const q = quote.quote;
      const depositAddress = q.depositAddress;

      if (!depositAddress) {
        return {
          message: 'Failed to generate a deposit address. The quote may have expired. Please try again.',
          type: 'error',
          suggestedActions: ['Get a new quote'],
        };
      }

      const message = `✅ **Live Quote Ready!**

| | Details |
|---|---|
| **From** | ${this.pendingQuote.amountIn} ${this.pendingQuote.tokenInSymbol} |
| **To** | ${q.amountOutFormatted || q.amountOut} ${this.pendingQuote.tokenOutSymbol} |
| **Deposit Address** | \`${depositAddress}\` |
| **Deadline** | ${q.deadline ? new Date(q.deadline).toLocaleString() : 'N/A'} |
| **Time Estimate** | ${q.timeEstimate || 'N/A'} |

**Instructions:**
1. Send exactly **${this.pendingQuote.amountIn} ${this.pendingQuote.tokenInSymbol}** to the deposit address above
2. The swap will execute automatically once the deposit is detected
3. Funds will arrive at your address: \`${recipientAddr.slice(0, 8)}...${recipientAddr.slice(-6)}\`

You can check the status anytime by saying: **"status ${depositAddress}"**

🔗 [Track on NEAR Intents Explorer](https://explorer.near-intents.org/transactions/${depositAddress})`;

      // Clear the pending quote
      const pendingData = { ...this.pendingQuote };
      this.pendingQuote = null;

      return {
        message,
        type: 'live_quote',
        data: {
          quote: q,
          depositAddress,
          ...pendingData,
        },
        suggestedActions: [
          `Check status of ${depositAddress}`,
          'Get another quote',
        ],
      };
    } catch (error) {
      return {
        message: `Failed to execute swap: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error',
        suggestedActions: ['Try again', 'Help'],
      };
    }
  }

  private async handleStatus(depositAddress?: string): Promise<AgentResponse> {
    if (!depositAddress) {
      return {
        message:
          'Please provide a deposit address to check the status. Example: "status 0x123..."',
        type: 'text',
        suggestedActions: ['Help'],
      };
    }

    try {
      const status = await this.api.getStatus(depositAddress);

      const statusEmoji: Record<string, string> = {
        PENDING_DEPOSIT: '⏳',
        PROCESSING: '🔄',
        SUCCESS: '✅',
        INCOMPLETE_DEPOSIT: '⚠️',
        REFUNDED: '↩️',
        FAILED: '❌',
      };

      const emoji = statusEmoji[status.status] || '❓';

      const message = `${emoji} **Swap Status: ${status.status}**

| | Details |
|---|---|
| **Status** | ${status.status} |
| **Deposit Address** | \`${depositAddress}\` |
${status.txHash ? `| **Transaction** | \`${status.txHash}\` |` : ''}

${status.status === 'PENDING_DEPOSIT' ? '⏳ Waiting for deposit. Send tokens to the deposit address to proceed.' : ''}
${status.status === 'PROCESSING' ? '🔄 Your swap is being processed. This usually takes 1-5 minutes.' : ''}
${status.status === 'SUCCESS' ? '🎉 Swap completed successfully! Tokens have been delivered.' : ''}
${status.status === 'REFUNDED' ? '↩️ The swap was refunded. Tokens have been returned to your refund address.' : ''}
${status.status === 'FAILED' ? '❌ The swap failed. Please try again with a new quote.' : ''}

🔗 [View on Explorer](https://explorer.near-intents.org/transactions/${depositAddress})`;

      return {
        message,
        type: 'status',
        data: { status, depositAddress },
        suggestedActions:
          status.status === 'PENDING_DEPOSIT' || status.status === 'PROCESSING'
            ? [`Check status of ${depositAddress}`, 'Get a new quote']
            : ['Get a new quote', 'Show tokens', 'Help'],
      };
    } catch (error) {
      return {
        message: `Failed to check status: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error',
        suggestedActions: ['Try again', 'Help'],
      };
    }
  }

  private async handleBalance(opts: ProcessMessageOptions): Promise<AgentResponse> {
    const userNear = opts.nearAccountId;
    const userAddress = opts.userAddress;

    if (!userNear) {
      return {
        message: '⚠️ No NEAR wallet connected. Use /connect to create one or link your existing wallet.',
        type: 'text',
        suggestedActions: ['Connect NEAR', 'Help'],
      };
    }

    try {
      const { getNearBalance } = await import('./privy');
      const balance = await getNearBalance(userNear);

      if (!balance.isInitialized) {
        return {
          message: `💰 **Wallet Balance**\n\n` +
            `**NEAR Account:** \`${userNear}\`\n` +
            `**Status:** ❌ Not initialized\n\n` +
            `Your account hasn't received any NEAR yet. Send NEAR to activate it.\n` +
            `Use /fund to see your deposit address.`,
          type: 'text',
          suggestedActions: ['Fund wallet', 'Help'],
        };
      }

      let message = `💰 **Wallet Balance**\n\n` +
        `**NEAR Account:** \`${userNear}\`\n` +
        `**Total Balance:** ${balance.nearBalance} NEAR\n` +
        `**Available:** ${balance.availableNear} NEAR\n`;

      if (userAddress) {
        message += `\n**Receive Wallet:** \`${userAddress}\`\n`;
      }

      message += `\n💡 Try: "swap 0.5 NEAR for SUI" or any amount you want!`;

      return {
        message,
        type: 'text',
        suggestedActions: [`Swap ${balance.availableNear} NEAR for SUI`, 'Show tokens', 'Fund wallet'],
      };
    } catch (error) {
      return {
        message: `Failed to fetch balance: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error',
        suggestedActions: ['Try again', 'Help'],
      };
    }
  }

  private handleFund(opts: ProcessMessageOptions): AgentResponse {
    const userNear = opts.nearAccountId;

    if (!userNear) {
      return {
        message: '⚠️ No NEAR wallet connected. Use /connect to create one first.',
        type: 'text',
        suggestedActions: ['Connect NEAR', 'Help'],
      };
    }

    return {
      message: `💳 **Fund Your Wallet**\n\n` +
        `Send NEAR to this address:\n\n` +
        `\`${userNear}\`\n\n` +
        `Use the /fund command in the bot for a QR code and direct wallet links!\n\n` +
        `💡 After funding, say "balance" to check your balance, then swap any amount you want!`,
      type: 'text',
      data: { nearAddress: userNear },
      suggestedActions: ['Balance', 'Fund wallet', 'Show tokens'],
    };
  }

  private handleUnknown(message: string): AgentResponse {
    // Try to be helpful with context-aware suggestions
    const lower = message.toLowerCase();

    if (lower.includes('sui') || lower.includes('usdc') || lower.includes('swap')) {
      return {
        message: `I think you want to do a swap! Try being more specific, like:\n\n• "Swap 100 USDC for SUI"\n• "How much SUI for 50 USDC?"\n• "Quote 1000 USDT to ETH"`,
        type: 'text',
        suggestedActions: [
          'Swap 10 USDC for SUI',
          'Show tokens on SUI',
          'Help',
        ],
      };
    }

    return {
      message: `I'm not sure what you'd like to do. I'm an AI agent specialized in cross-chain token swaps using NEAR Intents.\n\nTry saying:\n• **"swap 100 USDC for SUI"** — to get a swap quote\n• **"tokens"** — to see available tokens\n• **"help"** — for a full list of commands`,
      type: 'text',
      suggestedActions: ['Help', 'Show tokens', 'Swap 10 USDC for SUI'],
    };
  }
}

// ============== Helpers ==============

function findBestToken(
  tokens: TokenInfo[],
  symbol: string,
  preferredChain?: string
): TokenInfo | null {
  const upper = symbol.toUpperCase();

  // ====== Token symbol aliases ======
  // Users type natural names but the API uses different symbols.
  // Map common user inputs to their canonical API symbols + preferred chain.
  const ALIASES: Record<string, { symbols: string[]; preferChain?: string }> = {
    'NEAR': { symbols: ['NEAR', 'wNEAR', 'WNEAR'], preferChain: 'near' },
    'WNEAR': { symbols: ['wNEAR', 'WNEAR', 'NEAR'], preferChain: 'near' },
    'BTC': { symbols: ['BTC', 'WBTC', 'wBTC'], preferChain: 'btc' },
    'WBTC': { symbols: ['WBTC', 'wBTC', 'BTC'] },
    'ETH': { symbols: ['ETH', 'WETH'], preferChain: 'eth' },
    'WETH': { symbols: ['WETH', 'ETH'] },
    'SOL': { symbols: ['SOL', 'WSOL'], preferChain: 'sol' },
    'SUI': { symbols: ['SUI'], preferChain: 'sui' },
  };

  const alias = ALIASES[upper];
  const symbolsToSearch = alias ? alias.symbols : [upper];
  const effectiveChain = preferredChain || alias?.preferChain;

  // Collect all tokens matching any of the symbol variants
  const matching = tokens.filter(
    (t) => symbolsToSearch.includes(t.symbol.toUpperCase()) || symbolsToSearch.includes(t.symbol)
  );

  if (matching.length === 0) return null;

  // If preferred chain specified, try that first
  if (effectiveChain) {
    const onChain = matching.find(
      (t) => t.blockchain.toLowerCase() === effectiveChain.toLowerCase()
    );
    if (onChain) return onChain;
  }

  // Fall back to first match (usually the most liquid)
  return matching[0];
}

function guessDecimals(symbol: string): number {
  const upper = symbol.toUpperCase();
  const decimalMap: Record<string, number> = {
    USDC: 6,
    USDT: 6,
    SUI: 9,
    NEAR: 24,
    ETH: 18,
    WETH: 18,
    BTC: 8,
    WBTC: 8,
    SOL: 9,
    ARB: 18,
    BNB: 18,
    AVAX: 18,
    POL: 18,
    DAI: 18,
    DEEP: 6,
  };
  return decimalMap[upper] ?? 18;
}

function toSmallestUnit(amount: string, decimals: number): string {
  const [whole, frac = ''] = amount.split('.');
  const paddedFrac = frac.padEnd(decimals, '0').slice(0, decimals);
  const raw = whole + paddedFrac;
  // Remove leading zeros but keep at least one digit
  return raw.replace(/^0+/, '') || '0';
}
