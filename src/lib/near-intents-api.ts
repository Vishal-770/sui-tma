/**
 * NEAR Intents 1-Click API Wrapper
 *
 * TypeScript wrapper for the NEAR Intents 1-Click REST API.
 * Handles token listing, quote generation, deposit submission, and status checking.
 *
 * Base URL: https://1click.chaindefuser.com
 * Docs: https://docs.near-intents.org/near-intents/integration/distribution-channels/1click-api
 */

const BASE_URL = "https://1click.chaindefuser.com";

// ============== Types ==============

export interface TokenInfo {
  blockchain: string;
  symbol: string;
  assetId: string;
  contractAddress?: string;
  decimals?: number;
  price?: string;
  icon?: string;
}

export type SwapType = "EXACT_INPUT" | "EXACT_OUTPUT";
export type DepositType = "ORIGIN_CHAIN" | "INTENTS";
export type RefundType = "ORIGIN_CHAIN" | "INTENTS";
export type RecipientType = "DESTINATION_CHAIN" | "INTENTS";

export interface QuoteRequest {
  dry: boolean;
  swapType: SwapType;
  slippageTolerance: number;
  originAsset: string;
  depositType: DepositType;
  destinationAsset: string;
  amount: string;
  refundTo: string;
  refundType: RefundType;
  recipient: string;
  recipientType: RecipientType;
  deadline: string;
  referral?: string;
  quoteWaitingTimeMs?: number;
}

export interface QuoteDetails {
  amountIn?: string;
  amountInFormatted?: string;
  amountInUsd?: string;
  amountOut?: string;
  amountOutFormatted?: string;
  amountOutUsd?: string;
  depositAddress?: string;
  timeWhenInactive?: string;
  timeEstimate?: string;
  deadline?: string;
}

export interface QuoteResponse {
  quote?: QuoteDetails;
  error?: string;
}

export type SwapStatus =
  | "PENDING_DEPOSIT"
  | "PROCESSING"
  | "SUCCESS"
  | "INCOMPLETE_DEPOSIT"
  | "REFUNDED"
  | "FAILED";

export interface StatusResponse {
  status: SwapStatus;
  depositAddress?: string;
  originAsset?: string;
  destinationAsset?: string;
  amountIn?: string;
  amountOut?: string;
  txHash?: string;
  error?: string;
}

export interface DepositSubmitRequest {
  txHash: string;
  depositAddress: string;
}

// ============== API Client ==============

class NearIntentsAPI {
  private jwt?: string;

  constructor(jwt?: string) {
    this.jwt = jwt;
  }

  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };
    if (this.jwt) {
      headers["Authorization"] = `Bearer ${this.jwt}`;
    }
    return headers;
  }

  /**
   * Fetch all supported tokens from the 1-Click API.
   * No authentication required.
   */
  async getTokens(): Promise<TokenInfo[]> {
    const response = await fetch(`${BASE_URL}/v0/tokens`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch tokens: ${response.status} ${response.statusText}`,
      );
    }

    return response.json();
  }

  /**
   * Fetch tokens filtered by blockchain.
   */
  async getTokensByChain(chain: string): Promise<TokenInfo[]> {
    const allTokens = await this.getTokens();
    return allTokens.filter(
      (t) => t.blockchain.toLowerCase() === chain.toLowerCase(),
    );
  }

  /**
   * Search tokens by symbol across all chains or a specific chain.
   */
  async searchTokens(symbol: string, chain?: string): Promise<TokenInfo[]> {
    const allTokens = await this.getTokens();
    return allTokens.filter((t) => {
      const symbolMatch = t.symbol.toLowerCase().includes(symbol.toLowerCase());
      const chainMatch = chain
        ? t.blockchain.toLowerCase() === chain.toLowerCase()
        : true;
      return symbolMatch && chainMatch;
    });
  }

  /**
   * Find the best matching token by symbol and optional chain.
   */
  async findToken(symbol: string, chain?: string): Promise<TokenInfo | null> {
    const tokens = await this.searchTokens(symbol, chain);
    if (tokens.length === 0) return null;

    // Prefer exact symbol match
    const exact = tokens.find(
      (t) => t.symbol.toLowerCase() === symbol.toLowerCase(),
    );
    return exact || tokens[0];
  }

  /**
   * Request a swap quote from the 1-Click API.
   */
  async getQuote(request: QuoteRequest): Promise<QuoteResponse> {
    console.log(
      "[1-Click API] Quote request:",
      JSON.stringify(
        {
          dry: request.dry,
          originAsset: request.originAsset,
          destinationAsset: request.destinationAsset,
          amount: request.amount,
          refundTo: request.refundTo,
          recipient: request.recipient,
          depositType: request.depositType,
          refundType: request.refundType,
          recipientType: request.recipientType,
        },
        null,
        2,
      ),
    );

    const response = await fetch(`${BASE_URL}/v0/quote`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[1-Click API] Quote error:", response.status, errorText);
      throw new Error(`Failed to get quote: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * Get a dry-run quote (estimation only, no deposit address generated).
   *
   * IMPORTANT: refundTo must be a valid address on the ORIGIN chain.
   * recipient must be a valid address on the DESTINATION chain.
   */
  async getDryQuote(params: {
    originAsset: string;
    destinationAsset: string;
    amount: string;
    refundAddress: string; // Must be valid on ORIGIN chain
    recipientAddress: string; // Must be valid on DESTINATION chain
  }): Promise<QuoteResponse> {
    return this.getQuote({
      dry: true,
      swapType: "EXACT_INPUT",
      slippageTolerance: 100, // 1%
      originAsset: params.originAsset,
      depositType: "ORIGIN_CHAIN",
      destinationAsset: params.destinationAsset,
      amount: params.amount,
      refundTo: params.refundAddress,
      refundType: "ORIGIN_CHAIN",
      recipient: params.recipientAddress,
      recipientType: "DESTINATION_CHAIN",
      deadline: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
      referral: "abyssprotocol",
      quoteWaitingTimeMs: 5000,
    });
  }

  /**
   * Get a live quote with deposit address for execution.
   *
   * IMPORTANT: refundTo must be a valid address on the ORIGIN chain.
   * recipient must be a valid address on the DESTINATION chain.
   */
  async getLiveQuote(params: {
    originAsset: string;
    destinationAsset: string;
    amount: string;
    refundAddress: string; // Must be valid on ORIGIN chain
    recipientAddress: string; // Must be valid on DESTINATION chain
    slippageTolerance?: number;
  }): Promise<QuoteResponse> {
    return this.getQuote({
      dry: false,
      swapType: "EXACT_INPUT",
      slippageTolerance: params.slippageTolerance ?? 100,
      originAsset: params.originAsset,
      depositType: "ORIGIN_CHAIN",
      destinationAsset: params.destinationAsset,
      amount: params.amount,
      refundTo: params.refundAddress,
      refundType: "ORIGIN_CHAIN",
      recipient: params.recipientAddress,
      recipientType: "DESTINATION_CHAIN",
      deadline: new Date(Date.now() + 3 * 60 * 1000).toISOString(),
      referral: "abyssprotocol",
      quoteWaitingTimeMs: 5000,
    });
  }

  /**
   * Submit a deposit transaction hash to speed up processing.
   */
  async submitDepositTx(request: DepositSubmitRequest): Promise<void> {
    const response = await fetch(`${BASE_URL}/v0/deposit/submit`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to submit deposit tx: ${response.status} - ${errorText}`,
      );
    }
  }

  /**
   * Check the status of a swap using the deposit address.
   */
  async getStatus(depositAddress: string): Promise<StatusResponse> {
    const response = await fetch(
      `${BASE_URL}/v0/status?depositAddress=${encodeURIComponent(depositAddress)}`,
      {
        method: "GET",
        headers: this.getHeaders(),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to get status: ${response.status} - ${errorText}`,
      );
    }

    return response.json();
  }

  /**
   * Get a list of supported blockchains from available tokens.
   */
  async getSupportedChains(): Promise<string[]> {
    const tokens = await this.getTokens();
    const chains = new Set(tokens.map((t) => t.blockchain));
    return Array.from(chains).sort();
  }

  /**
   * Get unique token symbols for a specific chain.
   */
  async getChainTokenSymbols(chain: string): Promise<string[]> {
    const tokens = await this.getTokensByChain(chain);
    const symbols = new Set(tokens.map((t) => t.symbol));
    return Array.from(symbols).sort();
  }
}

// Singleton instance
let apiInstance: NearIntentsAPI | null = null;

export function getNearIntentsAPI(jwt?: string): NearIntentsAPI {
  if (!apiInstance || jwt) {
    apiInstance = new NearIntentsAPI(jwt || process.env.NEAR_INTENTS_JWT);
  }
  return apiInstance;
}

export { NearIntentsAPI };
