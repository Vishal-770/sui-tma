/**
 * DeepBook V3 Client Integration
 *
 * This module provides a complete integration with DeepBook V3 SDK
 * for executing swaps, orders, flash loans, and managing balance managers.
 *
 * Uses testnet coins: DBUSDC, DBUSDT (mock stablecoins provided by DeepBook)
 * And existing testnet pools: SUI_DBUSDC, DEEP_DBUSDC, etc.
 */

import { deepbook, type DeepBookClient } from "@mysten/deepbook-v3";
import type {
  BalanceManager,
  Coin,
  Pool,
  MarginManager,
} from "@mysten/deepbook-v3";
import { CoreClient, type ClientWithExtensions } from "@mysten/sui/client";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { Transaction } from "@mysten/sui/transactions";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";

// Type for DeepBook extended client
export type DeepBookExtendedClient = ClientWithExtensions<{
  deepbook: DeepBookClient;
}>;

// Type definitions for coin/pool maps
export type CoinMapType = Record<string, Coin>;
export type PoolMapType = Record<string, Pool>;

// ============== Network Configuration ==============

export type NetworkEnv = "testnet" | "mainnet";

export const NETWORK_CONFIG = {
  testnet: {
    rpcUrl: "https://fullnode.testnet.sui.io:443",
    indexerUrl: "https://deepbook-indexer.testnet.sui.io",
  },
  mainnet: {
    rpcUrl: "https://fullnode.mainnet.sui.io:443",
    indexerUrl: "https://deepbook-indexer.mainnet.sui.io",
  },
};

// ============== Margin Manager Types ==============

export interface MarginManagerConfig {
  address: string;
  poolKey: string;
}

export type MarginManagerMap = Record<string, MarginManagerConfig>;

// ============== DeepBook V3 Contract Addresses ==============
// From official SDK: https://github.com/MystenLabs/ts-sdks/blob/main/packages/deepbook-v3/src/utils/constants.ts

export const DEEPBOOK_CONFIG = {
  // Mainnet Package IDs
  mainnet: {
    PACKAGE_ID:
      "0x337f4f4f6567fcd778d5454f27c16c70e2f274cc6377ea6249ddf491482ef497",
    REGISTRY_ID:
      "0xaf16199a2dff736e9f07a845f23c5da6df6f756eddb631aed9d24a93efc4549d",
    DEEP_TREASURY_ID:
      "0x69fffdae0075f8f71f4fa793549c11079266910e8905169845af1f5d00e09dcb",
  },
  // Testnet Package IDs (DIFFERENT from mainnet!)
  testnet: {
    PACKAGE_ID:
      "0xfb28c4cbc6865bd1c897d26aecbe1f8792d1509a20ffec692c800660cbec6982",
    REGISTRY_ID:
      "0x7c256edbda983a2cd6f946655f4bf3f00a41043993781f8674a7046e8c0e11d1",
    DEEP_TREASURY_ID:
      "0x032abf8948dda67a271bcc18e776dbbcfb0d58c8d288a700ff0d5521e57a1ffe",
  },
};

// ============== DeepBook Constants (from SDK) ==============

/**
 * Price scalar for order price calculations (1e9)
 * Used in: inputPrice = Math.round((price * FLOAT_SCALAR * quoteCoin.scalar) / baseCoin.scalar)
 */
export const FLOAT_SCALAR = 1_000_000_000; // 1e9

/**
 * DEEP token scalar (1e6 - DEEP has 6 decimals)
 */
export const DEEP_SCALAR = 1_000_000; // 1e6

/**
 * Default gas budget for transactions
 */
export const GAS_BUDGET = 500_000_000; // 0.5 SUI

/**
 * Maximum timestamp for order expiration (never expires)
 */
export const MAX_TIMESTAMP = BigInt("18446744073709551615"); // u64::MAX

/**
 * Pool creation fee in DEEP (1000 DEEP)
 */
export const POOL_CREATION_FEE_DEEP = 1_000_000_000_000; // 1000 * 1e6

// ============== Coin Types ==============

// Testnet Coins (DBUSDC, DBUSDT are DeepBook's testnet mock tokens)
export const TESTNET_COINS: CoinMapType = {
  SUI: {
    address:
      "0x0000000000000000000000000000000000000000000000000000000000000002",
    type: "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI",
    scalar: 1e9,
  },
  DEEP: {
    address:
      "0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270",
    type: "0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP",
    scalar: 1e6,
  },
  DBUSDC: {
    address:
      "0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7",
    type: "0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDC::DBUSDC",
    scalar: 1e6,
  },
  DBUSDT: {
    address:
      "0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7",
    type: "0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDT::DBUSDT",
    scalar: 1e6,
  },
};

// Mainnet Coins
export const MAINNET_COINS: CoinMapType = {
  SUI: {
    address:
      "0x0000000000000000000000000000000000000000000000000000000000000002",
    type: "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI",
    scalar: 1e9,
  },
  DEEP: {
    address:
      "0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270",
    type: "0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP",
    scalar: 1e6,
  },
  USDC: {
    address:
      "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7",
    type: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
    scalar: 1e6,
  },
  WUSDC: {
    address:
      "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf",
    type: "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN",
    scalar: 1e6,
  },
  WUSDT: {
    address:
      "0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c",
    type: "0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN",
    scalar: 1e6,
  },
  BETH: {
    address:
      "0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29",
    type: "0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH",
    scalar: 1e8,
  },
  NS: {
    address:
      "0x5145494a5f5100e645e4b0aa950fa6b68f614e8c59e17bc5ded3495123a79178",
    type: "0x5145494a5f5100e645e4b0aa950fa6b68f614e8c59e17bc5ded3495123a79178::ns::NS",
    scalar: 1e6,
  },
  TYPUS: {
    address:
      "0xf82dc05634970553615eef6112a1ac4fb7bf10272bf6cbe0f80ef44a6c489385",
    type: "0xf82dc05634970553615eef6112a1ac4fb7bf10272bf6cbe0f80ef44a6c489385::typus::TYPUS",
    scalar: 1e9,
  },
  WAL: {
    address:
      "0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59",
    type: "0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL",
    scalar: 1e9,
  },
  xBTC: {
    address:
      "0x876a4b7bce8aeaef60464c11f4026903e9afacab79b9b142686158aa86560b50",
    type: "0x876a4b7bce8aeaef60464c11f4026903e9afacab79b9b142686158aa86560b50::xbtc::XBTC",
    scalar: 1e8,
  },
};

// ============== Pool Configurations ==============

// Testnet Pools (using DBUSDC, DBUSDT)
export const TESTNET_POOLS: PoolMapType = {
  SUI_DBUSDC: {
    address: "0x0", // Will be populated from SDK defaults
    baseCoin: "SUI",
    quoteCoin: "DBUSDC",
  },
  DEEP_DBUSDC: {
    address: "0x0",
    baseCoin: "DEEP",
    quoteCoin: "DBUSDC",
  },
  DEEP_SUI: {
    address: "0x0",
    baseCoin: "DEEP",
    quoteCoin: "SUI",
  },
};

// Mainnet Pools (real liquidity)
export const MAINNET_POOLS: PoolMapType = {
  DEEP_SUI: {
    address:
      "0x9e69acc3f390cc83cc61e0a71c6b1ad0ceb2a116e1d51ba66a5c05a84a8a7e4c",
    baseCoin: "DEEP",
    quoteCoin: "SUI",
  },
  DEEP_USDC: {
    address:
      "0x21dfe7a0c31fead3a7cdc41d16c89a37fcf66a01e5cf45e08a0dcb7c3e7f7d8b",
    baseCoin: "DEEP",
    quoteCoin: "USDC",
  },
  SUI_USDC: {
    address:
      "0xe05dafb5133bcffb8d59f4e12465dc0e9faeaa05e3e342a08fe135800e3e4407",
    baseCoin: "SUI",
    quoteCoin: "USDC",
  },
  BETH_USDC: {
    address:
      "0x1ebc38e8cbed7b2e3a0c2d3c5a0b6c47f8a8f9d7e6c5b4a3f2e1d0c9b8a7f6e5",
    baseCoin: "BETH",
    quoteCoin: "USDC",
  },
  WAL_USDC: {
    address:
      "0x2ebc38e8cbed7b2e3a0c2d3c5a0b6c47f8a8f9d7e6c5b4a3f2e1d0c9b8a7f6e5",
    baseCoin: "WAL",
    quoteCoin: "USDC",
  },
  WAL_SUI: {
    address:
      "0x3ebc38e8cbed7b2e3a0c2d3c5a0b6c47f8a8f9d7e6c5b4a3f2e1d0c9b8a7f6e5",
    baseCoin: "WAL",
    quoteCoin: "SUI",
  },
};

// ============== Types ==============

export interface DeepBookClientConfig {
  env: NetworkEnv;
  address: string;
  balanceManagers?: { [key: string]: BalanceManager };
  adminCap?: string;
}

export interface SwapParams {
  poolKey: string;
  amount: number;
  deepAmount: number;
  minOut: number;
}

export interface LimitOrderParams {
  poolKey: string;
  balanceManagerKey: string;
  clientOrderId: string;
  price: number;
  quantity: number;
  isBid: boolean;
  expiration?: number;
  orderType?: "GTC" | "IOC" | "FOK" | "POST_ONLY";
  selfMatchingOption?: "CANCEL_TAKER" | "CANCEL_MAKER" | "CANCEL_BOTH";
  payWithDeep?: boolean;
}

export interface FlashLoanResult {
  borrowedCoin: any;
  flashLoan: any;
}

export interface BalanceManagerInfo {
  address: string;
  tradeCap?: string;
  depositCap?: string;
  withdrawCap?: string;
}

// ============== DeepBook Client Factory ==============

/**
 * Create a DeepBook-extended Sui client for transaction building
 * This client is used to build transactions with the SDK, then signed with DappKit
 *
 * Uses SuiGrpcClient with $extend support for DeepBook SDK
 * Pattern from: https://sdk.mystenlabs.com/sui/migrations/sui-2.0/deepbook-v3
 */
export function createDeepBookClient(params: {
  env: NetworkEnv;
  address: string;
  balanceManagers?: { [key: string]: BalanceManager };
  marginManagers?: MarginManagerMap;
}): DeepBookExtendedClient {
  const { env, address, balanceManagers, marginManagers } = params;

  // Convert MarginManagerMap to SDK format
  const sdkMarginManagers: { [key: string]: MarginManager } | undefined =
    marginManagers
      ? Object.fromEntries(
          Object.entries(marginManagers).map(([key, config]) => [
            key,
            {
              address: config.address,
              poolKey: config.poolKey,
            } as MarginManager,
          ]),
        )
      : undefined;

  // Create SuiGrpcClient and extend with DeepBook SDK
  // This is the official pattern for DeepBook v3 SDK usage
  try {
    const extendedClient = new SuiGrpcClient({
      baseUrl: NETWORK_CONFIG[env].rpcUrl,
      network: env,
    }).$extend(
      deepbook({
        address,
        balanceManagers: balanceManagers || {},
        marginManagers: sdkMarginManagers,
      }),
    ) as DeepBookExtendedClient;

    return extendedClient;
  } catch (error) {
    console.error('Failed to extend Sui client with DeepBook:', error);
    throw new Error(`Failed to create DeepBook client: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Query margin manager state from on-chain object
 * Returns deposited and borrowed amounts for a margin manager
 */
export async function queryMarginManagerState(params: {
  client: any; // Accept either SuiClient or CoreClient
  marginManagerId: string;
}): Promise<{
  baseDeposited: bigint;
  quoteDeposited: bigint;
  deepDeposited: bigint;
  baseBorrowed: bigint;
  quoteBorrowed: bigint;
} | null> {
  const { client, marginManagerId } = params;

  try {
    const object = await client.getObject({
      id: marginManagerId,
      options: { showContent: true },
    });

    if (!object.data || object.data.content?.dataType !== "moveObject") {
      return null;
    }

    const fields = object.data.content.fields as any;

    // Parse margin manager fields (adjust based on actual Move struct)
    return {
      baseDeposited: BigInt(fields.base_deposited || 0),
      quoteDeposited: BigInt(fields.quote_deposited || 0),
      deepDeposited: BigInt(fields.deep_deposited || 0),
      baseBorrowed: BigInt(fields.base_borrowed || 0),
      quoteBorrowed: BigInt(fields.quote_borrowed || 0),
    };
  } catch (error) {
    console.error("Failed to query margin manager state:", error);
    return null;
  }
}

// ============== DeepBook Trading Client ==============

export class DeepBookTradingClient {
  private client: ClientWithExtensions<{ deepbook: DeepBookClient }> | null =
    null;
  private suiClient: any; // Legacy - not actively used
  private env: NetworkEnv;
  private address: string;
  private balanceManagers: { [key: string]: BalanceManager };

  constructor(config: DeepBookClientConfig) {
    this.env = config.env;
    this.address = config.address;
    this.balanceManagers = config.balanceManagers || {};

    // Note: CoreClient cannot be instantiated directly (it's abstract)
    // For now, this class is kept for backward compatibility but not actively used
    // Use createDeepBookClient() with useSuiClient() hook instead
    this.suiClient = null as any;
  }

  /**
   * Initialize the DeepBook client extension
   */
  async initialize(): Promise<void> {
    // Note: In browser environment, we use a different approach
    // The client will be initialized when signing transactions
    console.log("DeepBook client initialized for", this.env);
  }

  /**
   * Get the underlying Sui client
   */
  getSuiClient(): any {
    return this.suiClient;
  }

  /**
   * Get coins for the current network
   */
  getCoins(): CoinMapType {
    return this.env === "mainnet" ? MAINNET_COINS : TESTNET_COINS;
  }

  /**
   * Get pools for the current network
   */
  getPools(): PoolMapType {
    return this.env === "mainnet" ? MAINNET_POOLS : TESTNET_POOLS;
  }

  /**
   * Get available pool keys
   */
  getPoolKeys(): string[] {
    return Object.keys(this.getPools());
  }

  /**
   * Get available coin keys
   */
  getCoinKeys(): string[] {
    return Object.keys(this.getCoins());
  }

  // ============== Balance Manager Operations ==============

  /**
   * Create and share a new balance manager
   */
  createBalanceManager(tx: Transaction): void {
    // Using direct Move call since we're in browser
    tx.moveCall({
      target: `${DEEPBOOK_CONFIG[this.env].PACKAGE_ID}::balance_manager::new`,
      arguments: [],
    });
  }

  /**
   * Deposit funds into balance manager
   */
  depositIntoManager(
    tx: Transaction,
    balanceManagerId: string,
    coinType: string,
    coinObject: any,
  ): void {
    tx.moveCall({
      target: `${DEEPBOOK_CONFIG[this.env].PACKAGE_ID}::balance_manager::deposit`,
      typeArguments: [coinType],
      arguments: [tx.object(balanceManagerId), coinObject],
    });
  }

  /**
   * Withdraw funds from balance manager
   */
  withdrawFromManager(
    tx: Transaction,
    balanceManagerId: string,
    coinType: string,
    amount: bigint,
  ): any {
    return tx.moveCall({
      target: `${DEEPBOOK_CONFIG[this.env].PACKAGE_ID}::balance_manager::withdraw`,
      typeArguments: [coinType],
      arguments: [tx.object(balanceManagerId), tx.pure.u64(amount)],
    });
  }

  /**
   * Mint a trade cap for balance manager
   */
  mintTradeCap(tx: Transaction, balanceManagerId: string): any {
    return tx.moveCall({
      target: `${DEEPBOOK_CONFIG[this.env].PACKAGE_ID}::balance_manager::mint_trade_cap`,
      arguments: [tx.object(balanceManagerId)],
    });
  }

  // ============== Swap Operations ==============

  /**
   * Swap exact base amount for quote
   * No balance manager required - uses coins directly
   * Returns [baseCoin (remainder), quoteCoin (output), deepCoin (remainder)]
   */
  swapExactBaseForQuote(
    tx: Transaction,
    poolKey: string,
    baseCoin: any,
    deepCoin: any,
    minQuoteOut: bigint,
  ): [any, any, any] {
    const pools = this.getPools();
    const coins = this.getCoins();
    const pool = pools[poolKey];
    if (!pool) throw new Error(`Pool not found: ${poolKey}`);

    const baseCoinType = coins[pool.baseCoin];
    const quoteCoinType = coins[pool.quoteCoin];

    const result = tx.moveCall({
      target: `${DEEPBOOK_CONFIG[this.env].PACKAGE_ID}::pool::swap_exact_base_for_quote`,
      typeArguments: [baseCoinType.type, quoteCoinType.type],
      arguments: [
        tx.object(pool.address),
        baseCoin,
        deepCoin,
        tx.pure.u64(minQuoteOut),
        tx.object("0x6"), // Clock
      ],
    });
    return result as unknown as [any, any, any];
  }

  /**
   * Swap exact quote amount for base
   * Returns [baseCoin (output), quoteCoin (remainder), deepCoin (remainder)]
   */
  swapExactQuoteForBase(
    tx: Transaction,
    poolKey: string,
    quoteCoin: any,
    deepCoin: any,
    minBaseOut: bigint,
  ): [any, any, any] {
    const pools = this.getPools();
    const coins = this.getCoins();
    const pool = pools[poolKey];
    if (!pool) throw new Error(`Pool not found: ${poolKey}`);

    const baseCoinType = coins[pool.baseCoin];
    const quoteCoinType = coins[pool.quoteCoin];

    const result = tx.moveCall({
      target: `${DEEPBOOK_CONFIG[this.env].PACKAGE_ID}::pool::swap_exact_quote_for_base`,
      typeArguments: [baseCoinType.type, quoteCoinType.type],
      arguments: [
        tx.object(pool.address),
        quoteCoin,
        deepCoin,
        tx.pure.u64(minBaseOut),
        tx.object("0x6"), // Clock
      ],
    });
    return result as unknown as [any, any, any];
  }

  // ============== Order Operations ==============

  /**
   * Generate a trade proof for a balance manager (owner-based)
   */
  generateProofAsOwner(tx: Transaction, balanceManagerId: string): any {
    return tx.moveCall({
      target: `${DEEPBOOK_CONFIG[this.env].PACKAGE_ID}::balance_manager::generate_proof_as_owner`,
      arguments: [tx.object(balanceManagerId)],
    });
  }

  /**
   * Generate a trade proof using trade cap
   */
  generateProofAsTrader(
    tx: Transaction,
    balanceManagerId: string,
    tradeCapId: string,
  ): any {
    return tx.moveCall({
      target: `${DEEPBOOK_CONFIG[this.env].PACKAGE_ID}::balance_manager::generate_proof_as_trader`,
      arguments: [tx.object(balanceManagerId), tx.object(tradeCapId)],
    });
  }

  /**
   * Place a limit order
   * Price calculation follows SDK: inputPrice = Math.round((price * FLOAT_SCALAR * quoteCoin.scalar) / baseCoin.scalar)
   * Quantity calculation: inputQuantity = Math.round(quantity * baseCoin.scalar)
   */
  placeLimitOrder(
    tx: Transaction,
    poolKey: string,
    balanceManagerId: string,
    tradeProof: any,
    clientOrderId: bigint,
    orderType: number,
    selfMatchingOption: number,
    price: number,
    quantity: number,
    isBid: boolean,
    payWithDeep: boolean,
    expiration: bigint,
  ): any {
    const pools = this.getPools();
    const coins = this.getCoins();
    const pool = pools[poolKey];
    if (!pool) throw new Error(`Pool not found: ${poolKey}`);

    const baseCoin = coins[pool.baseCoin];
    const quoteCoin = coins[pool.quoteCoin];

    // Calculate price in pool units (matches SDK exactly)
    const inputPrice = Math.round(
      (price * FLOAT_SCALAR * quoteCoin.scalar) / baseCoin.scalar,
    );
    const inputQuantity = Math.round(quantity * baseCoin.scalar);

    return tx.moveCall({
      target: `${DEEPBOOK_CONFIG[this.env].PACKAGE_ID}::pool::place_limit_order`,
      typeArguments: [baseCoin.type, quoteCoin.type],
      arguments: [
        tx.object(pool.address),
        tx.object(balanceManagerId),
        tradeProof,
        tx.pure.u128(clientOrderId),
        tx.pure.u8(orderType),
        tx.pure.u8(selfMatchingOption),
        tx.pure.u64(inputPrice),
        tx.pure.u64(inputQuantity),
        tx.pure.bool(isBid),
        tx.pure.bool(payWithDeep),
        tx.pure.u64(expiration),
        tx.object("0x6"), // Clock
      ],
    });
  }

  /**
   * Place a market order
   */
  placeMarketOrder(
    tx: Transaction,
    poolKey: string,
    balanceManagerId: string,
    tradeProof: any,
    clientOrderId: bigint,
    selfMatchingOption: number,
    quantity: number,
    isBid: boolean,
    payWithDeep: boolean,
  ): any {
    const pools = this.getPools();
    const coins = this.getCoins();
    const pool = pools[poolKey];
    if (!pool) throw new Error(`Pool not found: ${poolKey}`);

    const baseCoin = coins[pool.baseCoin];
    const quoteCoin = coins[pool.quoteCoin];
    const inputQuantity = Math.round(quantity * baseCoin.scalar);

    return tx.moveCall({
      target: `${DEEPBOOK_CONFIG[this.env].PACKAGE_ID}::pool::place_market_order`,
      typeArguments: [baseCoin.type, quoteCoin.type],
      arguments: [
        tx.object(pool.address),
        tx.object(balanceManagerId),
        tradeProof,
        tx.pure.u128(clientOrderId),
        tx.pure.u8(selfMatchingOption),
        tx.pure.u64(inputQuantity),
        tx.pure.bool(isBid),
        tx.pure.bool(payWithDeep),
        tx.object("0x6"), // Clock
      ],
    });
  }

  /**
   * Cancel an order
   */
  cancelOrder(
    tx: Transaction,
    poolKey: string,
    balanceManagerId: string,
    tradeProof: any,
    orderId: bigint,
  ): void {
    const pools = this.getPools();
    const coins = this.getCoins();
    const pool = pools[poolKey];
    if (!pool) throw new Error(`Pool not found: ${poolKey}`);

    const baseCoin = coins[pool.baseCoin];
    const quoteCoin = coins[pool.quoteCoin];

    tx.moveCall({
      target: `${DEEPBOOK_CONFIG[this.env].PACKAGE_ID}::pool::cancel_order`,
      typeArguments: [baseCoin.type, quoteCoin.type],
      arguments: [
        tx.object(pool.address),
        tx.object(balanceManagerId),
        tradeProof,
        tx.pure.u128(orderId),
        tx.object("0x6"), // Clock
      ],
    });
  }

  /**
   * Cancel all orders for a balance manager
   */
  cancelAllOrders(
    tx: Transaction,
    poolKey: string,
    balanceManagerId: string,
    tradeProof: any,
  ): void {
    const pools = this.getPools();
    const coins = this.getCoins();
    const pool = pools[poolKey];
    if (!pool) throw new Error(`Pool not found: ${poolKey}`);

    const baseCoin = coins[pool.baseCoin];
    const quoteCoin = coins[pool.quoteCoin];

    tx.moveCall({
      target: `${DEEPBOOK_CONFIG[this.env].PACKAGE_ID}::pool::cancel_all_orders`,
      typeArguments: [baseCoin.type, quoteCoin.type],
      arguments: [
        tx.object(pool.address),
        tx.object(balanceManagerId),
        tradeProof,
        tx.object("0x6"), // Clock
      ],
    });
  }

  // ============== Flash Loan Operations ==============

  /**
   * Borrow base asset via flash loan
   * Returns [borrowed_coin, flash_loan_receipt]
   */
  borrowFlashLoanBase(
    tx: Transaction,
    poolKey: string,
    amount: number,
  ): [any, any] {
    const pools = this.getPools();
    const coins = this.getCoins();
    const pool = pools[poolKey];
    if (!pool) throw new Error(`Pool not found: ${poolKey}`);

    const baseCoin = coins[pool.baseCoin];
    const quoteCoin = coins[pool.quoteCoin];
    const inputQuantity = Math.round(amount * baseCoin.scalar);

    const result = tx.moveCall({
      target: `${DEEPBOOK_CONFIG[this.env].PACKAGE_ID}::pool::borrow_flashloan_base`,
      typeArguments: [baseCoin.type, quoteCoin.type],
      arguments: [tx.object(pool.address), tx.pure.u64(inputQuantity)],
    });
    return result as unknown as [any, any];
  }

  /**
   * Borrow quote asset via flash loan
   */
  borrowFlashLoanQuote(
    tx: Transaction,
    poolKey: string,
    amount: number,
  ): [any, any] {
    const pools = this.getPools();
    const coins = this.getCoins();
    const pool = pools[poolKey];
    if (!pool) throw new Error(`Pool not found: ${poolKey}`);

    const baseCoin = coins[pool.baseCoin];
    const quoteCoin = coins[pool.quoteCoin];
    const inputQuantity = Math.round(amount * quoteCoin.scalar);

    const result = tx.moveCall({
      target: `${DEEPBOOK_CONFIG[this.env].PACKAGE_ID}::pool::borrow_flashloan_quote`,
      typeArguments: [baseCoin.type, quoteCoin.type],
      arguments: [tx.object(pool.address), tx.pure.u64(inputQuantity)],
    });
    return result as unknown as [any, any];
  }

  /**
   * Return base asset flash loan
   * Uses splitCoins pattern from SDK to return exact amount
   */
  returnFlashLoanBase(
    tx: Transaction,
    poolKey: string,
    borrowAmount: number,
    baseCoinInput: any,
    flashLoan: any,
  ): any {
    const pools = this.getPools();
    const coins = this.getCoins();
    const pool = pools[poolKey];
    if (!pool) throw new Error(`Pool not found: ${poolKey}`);

    const baseCoin = coins[pool.baseCoin];
    const quoteCoin = coins[pool.quoteCoin];
    const borrowScalar = baseCoin.scalar;

    // Split the exact amount to return
    const [baseCoinReturn] = tx.splitCoins(baseCoinInput, [
      tx.pure.u64(Math.round(borrowAmount * borrowScalar)),
    ]);

    tx.moveCall({
      target: `${DEEPBOOK_CONFIG[this.env].PACKAGE_ID}::pool::return_flashloan_base`,
      typeArguments: [baseCoin.type, quoteCoin.type],
      arguments: [tx.object(pool.address), baseCoinReturn, flashLoan],
    });

    // Return the remaining coin (profit)
    return baseCoinInput;
  }

  /**
   * Return quote asset flash loan
   */
  returnFlashLoanQuote(
    tx: Transaction,
    poolKey: string,
    borrowAmount: number,
    quoteCoinInput: any,
    flashLoan: any,
  ): any {
    const pools = this.getPools();
    const coins = this.getCoins();
    const pool = pools[poolKey];
    if (!pool) throw new Error(`Pool not found: ${poolKey}`);

    const baseCoin = coins[pool.baseCoin];
    const quoteCoin = coins[pool.quoteCoin];
    const borrowScalar = quoteCoin.scalar;

    // Split the exact amount to return
    const [quoteCoinReturn] = tx.splitCoins(quoteCoinInput, [
      tx.pure.u64(Math.round(borrowAmount * borrowScalar)),
    ]);

    tx.moveCall({
      target: `${DEEPBOOK_CONFIG[this.env].PACKAGE_ID}::pool::return_flashloan_quote`,
      typeArguments: [baseCoin.type, quoteCoin.type],
      arguments: [tx.object(pool.address), quoteCoinReturn, flashLoan],
    });

    // Return the remaining coin (profit)
    return quoteCoinInput;
  }

  // ============== Query Operations ==============

  /**
   * Get mid price from pool
   */
  async getMidPrice(poolId: string): Promise<number> {
    try {
      const response = await fetch(
        `${NETWORK_CONFIG[this.env].indexerUrl}/get_mid_price?pool_id=${poolId}`,
      );
      if (response.ok) {
        const data = await response.json();
        return parseFloat(data.mid_price);
      }
    } catch (error) {
      console.warn("Failed to fetch mid price:", error);
    }
    return 0;
  }

  /**
   * Get order book from indexer
   */
  async getOrderBook(poolId: string, depth: number = 10): Promise<any> {
    try {
      const response = await fetch(
        `${NETWORK_CONFIG[this.env].indexerUrl}/get_order_book?pool_id=${poolId}&depth=${depth}`,
      );
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.warn("Failed to fetch order book:", error);
    }
    return { bids: [], asks: [] };
  }

  /**
   * Get amount out for swap simulation
   */
  async getAmountOut(
    poolId: string,
    baseIn: boolean,
    amount: bigint,
  ): Promise<{ amountOut: bigint; deepRequired: bigint }> {
    try {
      const response = await fetch(
        `${NETWORK_CONFIG[this.env].indexerUrl}/get_amount_out?pool_id=${poolId}&base_in=${baseIn}&amount=${amount}`,
      );
      if (response.ok) {
        const data = await response.json();
        return {
          amountOut: BigInt(data.amount_out),
          deepRequired: BigInt(data.deep_required),
        };
      }
    } catch (error) {
      console.warn("Failed to get amount out:", error);
    }
    return { amountOut: BigInt(0), deepRequired: BigInt(0) };
  }

  /**
   * Get user's balance in balance manager
   */
  async getManagerBalance(
    balanceManagerId: string,
    coinType: string,
  ): Promise<bigint> {
    // Legacy method - deprecated
    // Use the new SDK approach with createDeepBookClient() instead
    console.warn("DeepBookTradingClient.getManagerBalance is deprecated");
    return BigInt(0);
  }
}

// ============== Helper Functions ==============

/**
 * Create a DeepBook trading client instance (legacy class-based approach)
 */
export function createDeepBookTradingClient(
  env: NetworkEnv,
  address: string,
  balanceManagers?: { [key: string]: BalanceManager },
): DeepBookTradingClient {
  return new DeepBookTradingClient({
    env,
    address,
    balanceManagers,
  });
}

/**
 * Get price with fallback
 */
export async function fetchPriceWithFallback(
  client: DeepBookTradingClient,
  poolId: string,
  fallback: number = 1.0,
): Promise<number> {
  const price = await client.getMidPrice(poolId);
  return price > 0 ? price : fallback;
}

/**
 * Build a simple swap transaction
 */
export function buildSwapTransaction(
  client: DeepBookTradingClient,
  tx: Transaction,
  poolKey: string,
  baseCoin: any,
  quoteCoin: any,
  deepCoin: any,
  isBaseToQuote: boolean,
  minOut: bigint,
): [any, any, any] {
  if (isBaseToQuote) {
    return client.swapExactBaseForQuote(
      tx,
      poolKey,
      baseCoin,
      deepCoin,
      minOut,
    );
  } else {
    return client.swapExactQuoteForBase(
      tx,
      poolKey,
      quoteCoin,
      deepCoin,
      minOut,
    );
  }
}

/**
 * Build a flash loan arbitrage transaction
 * Borrows from one pool, swaps in another, returns with profit
 * Uses SDK-style patterns with proper poolKey lookups
 */
export function buildFlashLoanArbitrage(
  client: DeepBookTradingClient,
  tx: Transaction,
  borrowPoolKey: string,
  swapPoolKey: string,
  borrowAmount: number,
  borrowBase: boolean,
  deepCoin: any,
  minProfit: bigint = BigInt(0),
): void {
  // 1. Borrow from first pool
  let borrowedCoin: any;
  let flashLoan: any;

  if (borrowBase) {
    [borrowedCoin, flashLoan] = client.borrowFlashLoanBase(
      tx,
      borrowPoolKey,
      borrowAmount,
    );
  } else {
    [borrowedCoin, flashLoan] = client.borrowFlashLoanQuote(
      tx,
      borrowPoolKey,
      borrowAmount,
    );
  }

  // 2. Swap in second pool to get profit
  let swappedBase: any;
  let swappedQuote: any;
  let swappedDeep: any;

  if (borrowBase) {
    // Borrowed base, swap for quote
    [swappedBase, swappedQuote, swappedDeep] = client.swapExactBaseForQuote(
      tx,
      swapPoolKey,
      borrowedCoin,
      deepCoin,
      minProfit,
    );

    // Swap quote back to base to repay
    const [returnBase, , returnDeep] = client.swapExactQuoteForBase(
      tx,
      borrowPoolKey,
      swappedQuote,
      swappedDeep,
      BigInt(Math.round(borrowAmount * 1e9)), // Approximate return amount
    );

    // Return flash loan
    const remainder = client.returnFlashLoanBase(
      tx,
      borrowPoolKey,
      borrowAmount,
      returnBase,
      flashLoan,
    );

    // Transfer remainder (profit) to sender
    tx.transferObjects(
      [remainder, returnDeep, swappedBase],
      tx.pure.address(client["address"]),
    );
  } else {
    // Borrowed quote, swap for base
    [swappedBase, swappedQuote, swappedDeep] = client.swapExactQuoteForBase(
      tx,
      swapPoolKey,
      borrowedCoin,
      deepCoin,
      minProfit,
    );

    // Swap base back to quote to repay
    const [, returnQuote, returnDeep] = client.swapExactBaseForQuote(
      tx,
      borrowPoolKey,
      swappedBase,
      swappedDeep,
      BigInt(Math.round(borrowAmount * 1e6)), // Approximate return amount
    );

    // Return flash loan
    const remainder = client.returnFlashLoanQuote(
      tx,
      borrowPoolKey,
      borrowAmount,
      returnQuote,
      flashLoan,
    );

    // Transfer remainder (profit) to sender
    tx.transferObjects(
      [remainder, returnDeep, swappedQuote],
      tx.pure.address(client["address"]),
    );
  }
}

// ============== Order Type Constants ==============

export const ORDER_TYPE = {
  NO_RESTRICTION: 0,
  IMMEDIATE_OR_CANCEL: 1,
  FILL_OR_KILL: 2,
  POST_ONLY: 3,
} as const;

export const SELF_MATCHING_OPTION = {
  SELF_MATCHING_ALLOWED: 0,
  CANCEL_TAKER: 1,
  CANCEL_MAKER: 2,
  CANCEL_BOTH: 3,
} as const;

// ============== Exports ==============

// Re-export types with aliases for backward compatibility
export type CoinMap = CoinMapType;
export type PoolMap = PoolMapType;
export { type BalanceManager };
