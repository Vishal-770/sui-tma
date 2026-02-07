/**
 * DeepBook V3 Integration Library
 *
 * This module provides integration with DeepBook V3 CLOB on Sui
 * for executing trades, flash loans, and market orders.
 *
 * Uses real DeepBook SDK for production and testnet mock tokens (DBUSDC, DBUSDT)
 * for demonstration purposes.
 */

import { Transaction } from "@mysten/sui/transactions";
import {
  DeepBookTradingClient,
  createDeepBookTradingClient,
  TESTNET_COINS,
  MAINNET_COINS,
  TESTNET_POOLS,
  MAINNET_POOLS,
  DEEPBOOK_CONFIG,
  NETWORK_CONFIG,
  ORDER_TYPE,
  SELF_MATCHING_OPTION,
  FLOAT_SCALAR,
  DEEP_SCALAR,
  GAS_BUDGET,
  MAX_TIMESTAMP,
  type NetworkEnv,
} from "./deepbook-client";

// Re-export for convenience
export {
  DeepBookTradingClient,
  createDeepBookTradingClient,
  ORDER_TYPE,
  SELF_MATCHING_OPTION,
  FLOAT_SCALAR,
  DEEP_SCALAR,
  GAS_BUDGET,
  MAX_TIMESTAMP,
};

// ============== Package IDs (for intent registry) ==============

export const PACKAGE_IDS = {
  intentRegistry:
    "0xe29fd9c9698d416c6f4327fe83e06dad7116302f6efabef96b94d9ab86442656",
  sealPolicy:
    "0xdacdece21b4b19fe7b5631a9594056fc01132a11d5dc75498a4f4c4a641b9c37",
  intentRegistryObject:
    "0x4a7e401d3cf98cb1e22b6443c5acff556ffc1e78dd5319dca8bdfc73edbc053c",
};

// ============== DeepBook V3 Contract Addresses ==============

export const DEEPBOOK_TESTNET = DEEPBOOK_CONFIG.testnet;
export const DEEPBOOK_MAINNET = DEEPBOOK_CONFIG.mainnet;

// ============== Current Environment ==============

export const CURRENT_ENV: NetworkEnv =
  (process.env.NEXT_PUBLIC_SUI_NETWORK as NetworkEnv) || "testnet";

// ============== Coin Types ==============

// Testnet DEEP token address
const TESTNET_DEEP =
  "0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP";
// Mainnet DEEP token address
const MAINNET_DEEP =
  "0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP";

export const COIN_TYPES = {
  // Core coins (both networks)
  SUI: "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI",
  // Use correct DEEP address based on network
  DEEP: CURRENT_ENV === "mainnet" ? MAINNET_DEEP : TESTNET_DEEP,

  // Mainnet stablecoins
  USDC: "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC",
  WUSDC:
    "0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN",
  WUSDT:
    "0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN",

  // Testnet mock tokens (provided by DeepBook SDK)
  DBUSDC:
    "0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDC::DBUSDC",
  DBUSDT:
    "0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDT::DBUSDT",

  // Mainnet tokens
  BETH: "0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH",
  NS: "0x5145494a5f5100e645e4b0aa950fa6b68f614e8c59e17bc5ded3495123a79178::ns::NS",
  TYPUS:
    "0xf82dc05634970553615eef6112a1ac4fb7bf10272bf6cbe0f80ef44a6c489385::typus::TYPUS",
  WAL: "0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL",
  xBTC: "0x876a4b7bce8aeaef60464c11f4026903e9afacab79b9b142686158aa86560b50::xbtc::XBTC",
};

// ============== Decimals ==============

export const COIN_DECIMALS: Record<string, number> = {
  SUI: 9,
  DEEP: 6,
  USDC: 6,
  WUSDC: 6,
  WUSDT: 6,
  DBUSDC: 6,
  DBUSDT: 6,
  BETH: 8,
  NS: 6,
  TYPUS: 9,
  WAL: 9,
  xBTC: 8,
};

// ============== Pool Information ==============

// Mainnet pools with real liquidity
export const MAINNET_POOL_INFO = {
  DEEP_SUI: {
    poolId:
      "0x9e69acc3f390cc83cc61e0a71c6b1ad0ceb2a116e1d51ba66a5c05a84a8a7e4c",
    baseCoin: COIN_TYPES.DEEP,
    quoteCoin: COIN_TYPES.SUI,
    baseDecimals: 6,
    quoteDecimals: 9,
    tickSize: 1000000, // 0.001 in quote decimals
    lotSize: 100000, // 0.1 in base decimals
    minSize: 1000000, // 1 DEEP minimum
  },
  SUI_USDC: {
    poolId:
      "0xe05dafb5133bcffb8d59f4e12465dc0e9faeaa05e3e342a08fe135800e3e4407",
    baseCoin: COIN_TYPES.SUI,
    quoteCoin: COIN_TYPES.USDC,
    baseDecimals: 9,
    quoteDecimals: 6,
    tickSize: 1000, // 0.001 USDC
    lotSize: 1000000, // 0.001 SUI
    minSize: 100000000, // 0.1 SUI minimum
  },
  DEEP_USDC: {
    poolId:
      "0x21dfe7a0c31fead3a7cdc41d16c89a37fcf66a01e5cf45e08a0dcb7c3e7f7d8b",
    baseCoin: COIN_TYPES.DEEP,
    quoteCoin: COIN_TYPES.USDC,
    baseDecimals: 6,
    quoteDecimals: 6,
    tickSize: 100, // 0.0001 USDC
    lotSize: 100000, // 0.1 DEEP
    minSize: 1000000, // 1 DEEP minimum
  },
  WAL_USDC: {
    poolId:
      "0x2ebc38e8cbed7b2e3a0c2d3c5a0b6c47f8a8f9d7e6c5b4a3f2e1d0c9b8a7f6e5",
    baseCoin: COIN_TYPES.WAL,
    quoteCoin: COIN_TYPES.USDC,
    baseDecimals: 9,
    quoteDecimals: 6,
    tickSize: 1000,
    lotSize: 1000000000, // 1 WAL
    minSize: 10000000000, // 10 WAL minimum
  },
};

// Testnet pools (using real DeepBook testnet pools from SDK)
export const TESTNET_POOL_INFO = {
  SUI_DBUSDC: {
    poolId:
      "0x1c19362ca52b8ffd7a33cee805a67d40f31e6ba303753fd3a4cfdfacea7163a5",
    baseCoin: COIN_TYPES.SUI,
    quoteCoin: COIN_TYPES.DBUSDC,
    baseDecimals: 9,
    quoteDecimals: 6,
    tickSize: 1000,
    lotSize: 1000000,
    minSize: 10000000,
  },
  DEEP_DBUSDC: {
    poolId:
      "0xe86b991f8632217505fd859445f9803967ac84a9d4a1219065bf191fcb74b622",
    baseCoin: COIN_TYPES.DEEP,
    quoteCoin: COIN_TYPES.DBUSDC,
    baseDecimals: 6,
    quoteDecimals: 6,
    tickSize: 100,
    lotSize: 100000,
    minSize: 1000000,
  },
  DEEP_SUI: {
    poolId:
      "0x48c95963e9eac37a316b7ae04a0deb761bcdcc2b67912374d6036e7f0e9bae9f",
    baseCoin: COIN_TYPES.DEEP,
    quoteCoin: COIN_TYPES.SUI,
    baseDecimals: 6,
    quoteDecimals: 9,
    tickSize: 1000000,
    lotSize: 100000,
    minSize: 1000000,
  },
};

// Unified pool access
export const POOLS =
  CURRENT_ENV === "mainnet" ? MAINNET_POOL_INFO : TESTNET_POOL_INFO;

// ============== Types ==============

export interface PoolInfo {
  poolId: string;
  baseCoin: string;
  quoteCoin: string;
  baseDecimals: number;
  quoteDecimals: number;
  tickSize: number;
  lotSize: number;
  minSize: number;
}

export interface OrderParams {
  poolId: string;
  side: "buy" | "sell";
  price: number;
  quantity: number;
  orderType: "limit" | "market" | "ioc" | "fok" | "post_only";
  clientOrderId?: string;
}

export interface SwapParams {
  poolKey: string;
  inputCoin: string;
  outputCoin: string;
  amount: bigint;
  minOutput: bigint;
  deepAmount?: bigint;
}

export interface FlashLoanParams {
  poolKey: string;
  borrowBase: boolean;
  amount: bigint;
}

export interface BalanceManagerConfig {
  address: string;
  tradeCap?: string;
  depositCap?: string;
  withdrawCap?: string;
}

// ============== Demo/Simulation Mode ==============

export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

// Real-time price sources (used as fallback)
const PRICE_SOURCES = {
  coingecko: "https://api.coingecko.com/api/v3/simple/price",
  deepbookTestnet: "https://deepbook-indexer.testnet.sui.io",
  deepbookMainnet: "https://deepbook-indexer.mainnet.sui.io",
};

// Mock prices for offline/demo mode
export const MOCK_PRICES: Record<string, number> = {
  SUI_USDC: 1.85,
  SUI_DBUSDC: 1.85,
  DEEP_SUI: 0.12,
  DEEP_USDC: 0.22,
  DEEP_DBUSDC: 0.22,
  WAL_USDC: 0.15,
  WAL_SUI: 0.08,
  xBTC_USDC: 67500,
};

// Mock order book for simulation
export const MOCK_ORDERBOOK = {
  SUI_USDC: {
    bids: [
      { price: 1.84, quantity: 1000, total: 1840 },
      { price: 1.83, quantity: 2500, total: 4575 },
      { price: 1.82, quantity: 5000, total: 9100 },
      { price: 1.81, quantity: 7500, total: 13575 },
      { price: 1.8, quantity: 10000, total: 18000 },
    ],
    asks: [
      { price: 1.86, quantity: 800, total: 1488 },
      { price: 1.87, quantity: 1500, total: 2805 },
      { price: 1.88, quantity: 3000, total: 5640 },
      { price: 1.89, quantity: 4500, total: 8505 },
      { price: 1.9, quantity: 6000, total: 11400 },
    ],
    spread: 0.02,
    midPrice: 1.85,
  },
  SUI_DBUSDC: {
    bids: [
      { price: 1.84, quantity: 1000, total: 1840 },
      { price: 1.83, quantity: 2500, total: 4575 },
      { price: 1.82, quantity: 5000, total: 9100 },
    ],
    asks: [
      { price: 1.86, quantity: 800, total: 1488 },
      { price: 1.87, quantity: 1500, total: 2805 },
      { price: 1.88, quantity: 3000, total: 5640 },
    ],
    spread: 0.02,
    midPrice: 1.85,
  },
  DEEP_SUI: {
    bids: [
      { price: 0.118, quantity: 5000, total: 590 },
      { price: 0.117, quantity: 10000, total: 1170 },
      { price: 0.116, quantity: 15000, total: 1740 },
    ],
    asks: [
      { price: 0.122, quantity: 4000, total: 488 },
      { price: 0.123, quantity: 8000, total: 984 },
      { price: 0.124, quantity: 12000, total: 1488 },
    ],
    spread: 0.004,
    midPrice: 0.12,
  },
};

// ============== Global Client Instance ==============

let globalClient: DeepBookTradingClient | null = null;

/**
 * Get or create a DeepBook client instance
 */
export function getDeepBookClient(address: string): DeepBookTradingClient {
  if (!globalClient || globalClient["address"] !== address) {
    globalClient = createDeepBookTradingClient(CURRENT_ENV, address);
  }
  return globalClient;
}

// ============== Price Fetching ==============

/**
 * Fetch current price from DeepBook indexer or fallback sources
 */
export async function fetchPrice(pair: string): Promise<number> {
  // First try DeepBook indexer
  const indexerUrl =
    CURRENT_ENV === "mainnet"
      ? PRICE_SOURCES.deepbookMainnet
      : PRICE_SOURCES.deepbookTestnet;

  const poolInfo = POOLS[pair as keyof typeof POOLS];

  if (poolInfo && poolInfo.poolId !== "0x0") {
    try {
      const response = await fetch(
        `${indexerUrl}/get_mid_price?pool_id=${poolInfo.poolId}`,
        { signal: AbortSignal.timeout(3000) },
      );

      if (response.ok) {
        const data = await response.json();
        const price = parseFloat(data.mid_price);
        if (price > 0) return price;
      }
    } catch (error) {
      console.warn("DeepBook indexer unavailable for", pair);
    }
  }

  // Fallback to CoinGecko for SUI price
  if (pair.includes("SUI")) {
    try {
      const response = await fetch(
        `${PRICE_SOURCES.coingecko}?ids=sui&vs_currencies=usd`,
        { signal: AbortSignal.timeout(3000) },
      );
      const data = await response.json();
      if (data.sui?.usd) {
        return data.sui.usd;
      }
    } catch (error) {
      console.warn("CoinGecko unavailable");
    }
  }

  // Use mock price as last resort
  if (DEMO_MODE || !poolInfo) {
    const basePrice = MOCK_PRICES[pair] || 1.0;
    // Add slight variation for realism
    const variation = (Math.random() - 0.5) * 0.02;
    return basePrice * (1 + variation);
  }

  return MOCK_PRICES[pair] || 1.0;
}

/**
 * Fetch multiple prices at once
 */
export async function fetchPrices(
  pairs: string[],
): Promise<Record<string, number>> {
  const prices: Record<string, number> = {};

  await Promise.all(
    pairs.map(async (pair) => {
      prices[pair] = await fetchPrice(pair);
    }),
  );

  return prices;
}

/**
 * Fetch order book from DeepBook indexer
 */
export async function fetchOrderBook(pair: string, depth: number = 10) {
  const indexerUrl =
    CURRENT_ENV === "mainnet"
      ? PRICE_SOURCES.deepbookMainnet
      : PRICE_SOURCES.deepbookTestnet;

  const poolInfo = POOLS[pair as keyof typeof POOLS];

  if (poolInfo && poolInfo.poolId !== "0x0") {
    try {
      const response = await fetch(
        `${indexerUrl}/get_order_book?pool_id=${poolInfo.poolId}&depth=${depth}`,
        { signal: AbortSignal.timeout(3000) },
      );

      if (response.ok) {
        const data = await response.json();
        return {
          bids: data.bids || [],
          asks: data.asks || [],
          spread: data.spread || 0,
          midPrice: data.mid_price || 0,
        };
      }
    } catch (error) {
      console.warn("Failed to fetch order book:", error);
    }
  }

  // Return mock data as fallback
  return (
    MOCK_ORDERBOOK[pair as keyof typeof MOCK_ORDERBOOK] ||
    MOCK_ORDERBOOK.SUI_USDC
  );
}

// ============== PTB Builders ==============

/**
 * Build a market swap transaction using DeepBook
 */
export function buildSwapTx(
  params: SwapParams,
  senderAddress: string,
  tx: Transaction = new Transaction(),
): Transaction {
  const poolInfo = POOLS[params.poolKey as keyof typeof POOLS];
  if (!poolInfo) throw new Error(`Pool not found: ${params.poolKey}`);

  const client = getDeepBookClient(senderAddress);
  const deepBookConfig =
    CURRENT_ENV === "mainnet" ? DEEPBOOK_MAINNET : DEEPBOOK_TESTNET;

  // Determine if we're swapping base for quote or quote for base
  const isBaseToQuote = params.inputCoin === poolInfo.baseCoin;
  const functionName = isBaseToQuote
    ? "swap_exact_base_for_quote"
    : "swap_exact_quote_for_base";

  // For real swaps, we need to provide the coins
  // This builds the transaction structure - caller needs to provide coin objects
  tx.moveCall({
    target: `${deepBookConfig.PACKAGE_ID}::pool::${functionName}`,
    arguments: [
      tx.object(poolInfo.poolId),
      // Input coin - caller should replace with actual coin object
      tx.pure.u64(params.amount),
      // DEEP coin for fees
      tx.pure.u64(params.deepAmount || BigInt(0)),
      // Minimum output
      tx.pure.u64(params.minOutput),
      // Clock
      tx.object("0x6"),
    ],
  });

  return tx;
}

/**
 * Build a complete swap transaction with coin selection
 */
export async function buildCompleteSwapTx(
  params: SwapParams,
  senderAddress: string,
  inputCoinObjects: string[],
  deepCoinObjects: string[],
  tx: Transaction = new Transaction(),
): Promise<Transaction> {
  const poolInfo = POOLS[params.poolKey as keyof typeof POOLS];
  if (!poolInfo) throw new Error(`Pool not found: ${params.poolKey}`);

  const deepBookConfig =
    CURRENT_ENV === "mainnet" ? DEEPBOOK_MAINNET : DEEPBOOK_TESTNET;
  const isBaseToQuote = params.inputCoin === poolInfo.baseCoin;

  // Merge input coins if multiple
  let inputCoin;
  if (inputCoinObjects.length === 1) {
    inputCoin = tx.object(inputCoinObjects[0]);
  } else if (inputCoinObjects.length > 1) {
    tx.mergeCoins(
      tx.object(inputCoinObjects[0]),
      inputCoinObjects.slice(1).map((id) => tx.object(id)),
    );
    inputCoin = tx.object(inputCoinObjects[0]);
  } else {
    throw new Error("No input coins provided");
  }

  // Split exact amount needed
  const [splitCoin] = tx.splitCoins(inputCoin, [tx.pure.u64(params.amount)]);

  // Handle DEEP coins for fees (if needed)
  let deepCoin;
  if (deepCoinObjects.length > 0) {
    if (deepCoinObjects.length === 1) {
      deepCoin = tx.object(deepCoinObjects[0]);
    } else {
      tx.mergeCoins(
        tx.object(deepCoinObjects[0]),
        deepCoinObjects.slice(1).map((id) => tx.object(id)),
      );
      deepCoin = tx.object(deepCoinObjects[0]);
    }
    const [splitDeep] = tx.splitCoins(deepCoin, [
      tx.pure.u64(params.deepAmount || BigInt(1000000)),
    ]);
    deepCoin = splitDeep;
  } else {
    // Create zero coin if no DEEP available
    const [zeroCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(0)]);
    deepCoin = zeroCoin;
  }

  const functionName = isBaseToQuote
    ? "swap_exact_base_for_quote"
    : "swap_exact_quote_for_base";

  const [baseOut, quoteOut, deepOut] = tx.moveCall({
    target: `${deepBookConfig.PACKAGE_ID}::pool::${functionName}`,
    arguments: [
      tx.object(poolInfo.poolId),
      splitCoin,
      deepCoin,
      tx.pure.u64(params.minOutput),
      tx.object("0x6"),
    ],
  });

  // Transfer outputs back to sender
  tx.transferObjects(
    [baseOut, quoteOut, deepOut],
    tx.pure.address(senderAddress),
  );

  return tx;
}

/**
 * Build a flash loan borrow transaction
 */
export function buildFlashLoanBorrowTx(
  params: FlashLoanParams,
  tx: Transaction = new Transaction(),
): { tx: Transaction; coinResult: any; receiptResult: any } {
  const poolInfo = POOLS[params.poolKey as keyof typeof POOLS];
  if (!poolInfo) throw new Error(`Pool not found: ${params.poolKey}`);

  const deepBookConfig =
    CURRENT_ENV === "mainnet" ? DEEPBOOK_MAINNET : DEEPBOOK_TESTNET;
  const functionName = params.borrowBase
    ? "borrow_flashloan_base"
    : "borrow_flashloan_quote";

  const [coinResult, receiptResult] = tx.moveCall({
    target: `${deepBookConfig.PACKAGE_ID}::pool::${functionName}`,
    arguments: [tx.object(poolInfo.poolId), tx.pure.u64(params.amount)],
  });

  return { tx, coinResult, receiptResult };
}

/**
 * Build a flash loan repay transaction
 */
export function buildFlashLoanRepayTx(
  poolKey: string,
  coin: any,
  receipt: any,
  borrowBase: boolean,
  tx: Transaction,
): Transaction {
  const poolInfo = POOLS[poolKey as keyof typeof POOLS];
  if (!poolInfo) throw new Error(`Pool not found: ${poolKey}`);

  const deepBookConfig =
    CURRENT_ENV === "mainnet" ? DEEPBOOK_MAINNET : DEEPBOOK_TESTNET;
  const functionName = borrowBase
    ? "return_flashloan_base"
    : "return_flashloan_quote";

  tx.moveCall({
    target: `${deepBookConfig.PACKAGE_ID}::pool::${functionName}`,
    arguments: [tx.object(poolInfo.poolId), coin, receipt],
  });

  return tx;
}

/**
 * Build a limit order transaction
 */
export function buildLimitOrderTx(
  params: OrderParams,
  balanceManagerId: string,
  tradeProofId: string,
  tx: Transaction = new Transaction(),
): Transaction {
  const poolInfo = Object.entries(POOLS).find(
    ([_, p]) => p.poolId === params.poolId,
  )?.[1];
  if (!poolInfo) throw new Error("Pool not found");

  const deepBookConfig =
    CURRENT_ENV === "mainnet" ? DEEPBOOK_MAINNET : DEEPBOOK_TESTNET;

  // Convert price to tick units
  const priceInTicks = Math.floor(
    (params.price * Math.pow(10, poolInfo.quoteDecimals)) / poolInfo.tickSize,
  );

  // Convert quantity to lot units
  const quantityInLots = Math.floor(
    (params.quantity * Math.pow(10, poolInfo.baseDecimals)) / poolInfo.lotSize,
  );

  const isBid = params.side === "buy";

  // Map order type
  const orderTypeMap: Record<string, number> = {
    limit: ORDER_TYPE.NO_RESTRICTION,
    ioc: ORDER_TYPE.IMMEDIATE_OR_CANCEL,
    fok: ORDER_TYPE.FILL_OR_KILL,
    post_only: ORDER_TYPE.POST_ONLY,
    market: ORDER_TYPE.IMMEDIATE_OR_CANCEL,
  };
  const orderType = orderTypeMap[params.orderType] || ORDER_TYPE.NO_RESTRICTION;

  tx.moveCall({
    target: `${deepBookConfig.PACKAGE_ID}::pool::place_limit_order`,
    arguments: [
      tx.object(params.poolId),
      tx.object(balanceManagerId),
      tx.object(tradeProofId),
      tx.pure.u128(BigInt(params.clientOrderId || Date.now().toString())),
      tx.pure.u8(orderType),
      tx.pure.u8(SELF_MATCHING_OPTION.CANCEL_TAKER),
      tx.pure.u64(priceInTicks),
      tx.pure.u64(quantityInLots),
      tx.pure.bool(isBid),
      tx.pure.bool(true), // pay with deep
      tx.pure.u64(Date.now() + 3600000), // expire in 1 hour
      tx.object("0x6"), // Clock
    ],
  });

  return tx;
}

/**
 * Build a market order transaction
 */
export function buildMarketOrderTx(
  poolKey: string,
  balanceManagerId: string,
  tradeProofId: string,
  side: "buy" | "sell",
  quantity: number,
  clientOrderId?: string,
  tx: Transaction = new Transaction(),
): Transaction {
  const poolInfo = POOLS[poolKey as keyof typeof POOLS];
  if (!poolInfo) throw new Error(`Pool not found: ${poolKey}`);

  const deepBookConfig =
    CURRENT_ENV === "mainnet" ? DEEPBOOK_MAINNET : DEEPBOOK_TESTNET;

  // Convert quantity to base units
  const quantityInUnits = BigInt(
    Math.floor(quantity * Math.pow(10, poolInfo.baseDecimals)),
  );

  tx.moveCall({
    target: `${deepBookConfig.PACKAGE_ID}::pool::place_market_order`,
    arguments: [
      tx.object(poolInfo.poolId),
      tx.object(balanceManagerId),
      tx.object(tradeProofId),
      tx.pure.u128(BigInt(clientOrderId || Date.now().toString())),
      tx.pure.u8(SELF_MATCHING_OPTION.CANCEL_TAKER),
      tx.pure.u64(quantityInUnits),
      tx.pure.bool(side === "buy"),
      tx.pure.bool(true), // pay with deep
      tx.object("0x6"), // Clock
    ],
  });

  return tx;
}

/**
 * Build a cancel order transaction
 */
export function buildCancelOrderTx(
  poolKey: string,
  balanceManagerId: string,
  tradeProofId: string,
  orderId: bigint,
  tx: Transaction = new Transaction(),
): Transaction {
  const poolInfo = POOLS[poolKey as keyof typeof POOLS];
  if (!poolInfo) throw new Error(`Pool not found: ${poolKey}`);

  const deepBookConfig =
    CURRENT_ENV === "mainnet" ? DEEPBOOK_MAINNET : DEEPBOOK_TESTNET;

  tx.moveCall({
    target: `${deepBookConfig.PACKAGE_ID}::pool::cancel_order`,
    arguments: [
      tx.object(poolInfo.poolId),
      tx.object(balanceManagerId),
      tx.object(tradeProofId),
      tx.pure.u128(orderId),
      tx.object("0x6"), // Clock
    ],
  });

  return tx;
}

// ============== Balance Manager Operations ==============

/**
 * BalanceManagerContract class for managing BalanceManager operations.
 */
export class BalanceManagerContract {
  #config: any;

  /**
   * @param {any} config Configuration for BalanceManagerContract
   */
  constructor(config: any) {
    this.#config = config;
  }

  /**
   * @description Create and share a new BalanceManager
   * @returns A function that takes a Transaction object
   */
  createAndShareBalanceManager = () => (tx: Transaction) => {
    const manager = tx.moveCall({
      target: `${this.#config.PACKAGE_ID}::balance_manager::new`,
    });

    tx.moveCall({
      target: "0x2::transfer::public_share_object",
      arguments: [manager],
      typeArguments: [
        `${this.#config.PACKAGE_ID}::balance_manager::BalanceManager`,
      ],
    });
  };

  /**
   * @description Create a new BalanceManager, manually set the owner. Returns the manager.
   * @returns A function that takes a Transaction object
   */
  createBalanceManagerWithOwner =
    (ownerAddress: string) => (tx: Transaction) => {
      return tx.moveCall({
        target: `${this.#config.PACKAGE_ID}::balance_manager::new_with_custom_owner`,
        arguments: [tx.pure.address(ownerAddress)],
      });
    };

  /**
   * @description Share the BalanceManager
   * @param {any} manager The BalanceManager to share
   * @returns A function that takes a Transaction object
   */
  shareBalanceManager = (manager: any) => (tx: Transaction) => {
    tx.moveCall({
      target: "0x2::transfer::public_share_object",
      arguments: [manager],
      typeArguments: [
        `${this.#config.PACKAGE_ID}::balance_manager::BalanceManager`,
      ],
    });
  };

  /**
   * @description Deposit funds into the BalanceManager using a pre-split coin object
   * @param {string} managerId The ID of the BalanceManager
   * @param {string} coinType The coin type to deposit
   * @param {any} coinObject The pre-split coin object to deposit
   * @returns A function that takes a Transaction object
   */
  depositIntoManager =
    (managerId: string, coinType: string, coinObject: any) =>
    (tx: Transaction) => {
      tx.moveCall({
        target: `${this.#config.PACKAGE_ID}::balance_manager::deposit`,
        arguments: [tx.object(managerId), coinObject],
        typeArguments: [coinType],
      });
    };

  /**
   * @description Withdraw funds from the BalanceManager
   * @param {string} managerId The ID of the BalanceManager
   * @param {string} coinType The coin type to withdraw
   * @param {number} amountToWithdraw The amount to withdraw
   * @param {string} recipient The recipient of the withdrawn funds
   * @returns A function that takes a Transaction object
   */
  withdrawFromManager =
    (
      managerId: string,
      coinType: string,
      amountToWithdraw: number,
      recipient: string,
    ) =>
    (tx: Transaction) => {
      const withdrawInput = Math.round(
        amountToWithdraw * this.#config.getCoinScalar(coinType),
      );
      const coinObject = tx.moveCall({
        target: `${this.#config.PACKAGE_ID}::balance_manager::withdraw`,
        arguments: [tx.object(managerId), tx.pure.u64(withdrawInput)],
        typeArguments: [coinType],
      });

      tx.transferObjects([coinObject], recipient);
    };

  /**
   * @description Withdraw all funds from the BalanceManager
   * @param {string} managerId The ID of the BalanceManager
   * @param {string} coinType The coin type to withdraw
   * @param {string} recipient The recipient of the withdrawn funds
   * @returns A function that takes a Transaction object
   */
  withdrawAllFromManager =
    (managerId: string, coinType: string, recipient: string) =>
    (tx: Transaction) => {
      const withdrawalCoin = tx.moveCall({
        target: `${this.#config.PACKAGE_ID}::balance_manager::withdraw_all`,
        arguments: [tx.object(managerId)],
        typeArguments: [coinType],
      });

      tx.transferObjects([withdrawalCoin], recipient);
    };

  /**
   * @description Check the balance of the BalanceManager
   * @param {string} managerId The ID of the BalanceManager
   * @param {string} coinType The coin type to check the balance of
   * @returns A function that takes a Transaction object
   */
  checkManagerBalance =
    (managerId: string, coinType: string) => (tx: Transaction) => {
      tx.moveCall({
        target: `${this.#config.PACKAGE_ID}::balance_manager::balance`,
        arguments: [tx.object(managerId)],
        typeArguments: [coinType],
      });
    };

  /**
   * @description Generate a trade proof for the BalanceManager. Calls the appropriate function based on whether tradeCap is set.
   * @param {string} managerId The ID of the BalanceManager
   * @returns A function that takes a Transaction object
   */
  generateProof = (managerId: string) => (tx: Transaction) => {
    return tx.moveCall({
      target: `${this.#config.PACKAGE_ID}::balance_manager::generate_proof_as_owner`,
      arguments: [tx.object(managerId)],
    });
  };

  /**
   * @description Generate a trade proof as the owner
   * @param {string} managerId The ID of the BalanceManager
   * @returns A function that takes a Transaction object
   */
  generateProofAsOwner = (managerId: string) => (tx: Transaction) => {
    return tx.moveCall({
      target: `${this.#config.PACKAGE_ID}::balance_manager::generate_proof_as_owner`,
      arguments: [tx.object(managerId)],
    });
  };

  /**
   * @description Generate a trade proof as a trader
   * @param {string} managerId The ID of the BalanceManager
   * @param {string} tradeCapId The ID of the tradeCap
   * @returns A function that takes a Transaction object
   */
  generateProofAsTrader =
    (managerId: string, tradeCapId: string) => (tx: Transaction) => {
      return tx.moveCall({
        target: `${this.#config.PACKAGE_ID}::balance_manager::generate_proof_as_trader`,
        arguments: [tx.object(managerId), tx.object(tradeCapId)],
      });
    };

  /**
   * @description Mint a TradeCap
   * @param {string} managerId The ID of the BalanceManager
   * @returns A function that takes a Transaction object
   */
  mintTradeCap = (managerId: string) => (tx: Transaction) => {
    return tx.moveCall({
      target: `${this.#config.PACKAGE_ID}::balance_manager::mint_trade_cap`,
      arguments: [tx.object(managerId)],
    });
  };

  /**
   * @description Check the owner of the BalanceManager
   * @param {string} managerId The ID of the BalanceManager
   * @returns A function that takes a Transaction object
   */
  checkOwner = (managerId: string) => (tx: Transaction) => {
    return tx.moveCall({
      target: `${this.#config.PACKAGE_ID}::balance_manager::owner`,
      arguments: [tx.object(managerId)],
    });
  };

  /**
   * @description Get the ID of the BalanceManager
   * @param {string} managerId The ID of the BalanceManager
   * @returns A function that takes a Transaction object
   */
  getId = (managerId: string) => (tx: Transaction) => {
    return tx.moveCall({
      target: `${this.#config.PACKAGE_ID}::balance_manager::id`,
      arguments: [tx.object(managerId)],
    });
  };

  /**
   * @description Get the referral ID from the balance manager for a specific pool
   * @param {string} managerId The ID of the BalanceManager
   * @param {string} poolId ID of the pool to get the referral for
   * @returns A function that takes a Transaction object
   */
  getBalanceManagerReferralId =
    (managerId: string, poolId: string) => (tx: Transaction) => {
      return tx.moveCall({
        target: `${this.#config.PACKAGE_ID}::balance_manager::get_balance_manager_referral_id`,
        arguments: [tx.object(managerId), tx.pure.id(poolId)],
      });
    };

  /**
   * @description Revoke a TradeCap. This also revokes the associated DepositCap and WithdrawCap.
   * @param {string} managerId The ID of the BalanceManager
   * @param {string} tradeCapId The ID of the TradeCap to revoke
   * @returns A function that takes a Transaction object
   */
  revokeTradeCap =
    (managerId: string, tradeCapId: string) => (tx: Transaction) => {
      tx.moveCall({
        target: `${this.#config.PACKAGE_ID}::balance_manager::revoke_trade_cap`,
        arguments: [tx.object(managerId), tx.pure.id(tradeCapId)],
      });
    };
}

/**
 * Create a BalanceManagerContract instance
 */
export function createBalanceManagerContract(config?: any) {
  const deepBookConfig =
    config || (CURRENT_ENV === "mainnet" ? DEEPBOOK_MAINNET : DEEPBOOK_TESTNET);
  return new BalanceManagerContract(deepBookConfig);
}

/**
 * Build a create balance manager transaction
 */
export function buildCreateBalanceManagerTx(
  senderAddress: string,
  tx: Transaction = new Transaction(),
): Transaction {
  const deepBookConfig =
    CURRENT_ENV === "mainnet" ? DEEPBOOK_MAINNET : DEEPBOOK_TESTNET;

  const [balanceManager] = tx.moveCall({
    target: `${deepBookConfig.PACKAGE_ID}::balance_manager::new`,
    arguments: [],
  });

  // Transfer the created balance manager to the sender
  tx.transferObjects([balanceManager], senderAddress);

  return tx;
}

/**
 * Build a mint trade cap transaction
 */
export function buildMintTradeCapTx(
  balanceManagerId: string,
  senderAddress: string,
  tx: Transaction = new Transaction(),
): Transaction {
  const deepBookConfig =
    CURRENT_ENV === "mainnet" ? DEEPBOOK_MAINNET : DEEPBOOK_TESTNET;

  const [tradeCap] = tx.moveCall({
    target: `${deepBookConfig.PACKAGE_ID}::balance_manager::mint_trade_cap`,
    arguments: [tx.object(balanceManagerId)],
  });

  // Transfer the created trade cap to the sender
  tx.transferObjects([tradeCap], senderAddress);

  return tx;
}

/**
 * Build a mint and assign trade cap transaction (mints cap and transfers to trader)
 */
export function buildMintAndAssignTradeCapTx(
  balanceManagerId: string,
  traderAddress: string,
  tx: Transaction = new Transaction(),
): Transaction {
  const deepBookConfig =
    CURRENT_ENV === "mainnet" ? DEEPBOOK_MAINNET : DEEPBOOK_TESTNET;

  const [tradeCap] = tx.moveCall({
    target: `${deepBookConfig.PACKAGE_ID}::balance_manager::mint_trade_cap`,
    arguments: [tx.object(balanceManagerId)],
  });

  // Transfer the created trade cap to the trader
  tx.transferObjects([tradeCap], traderAddress);

  return tx;
}

/**
 * Build a deposit to balance manager transaction
 */
export function buildDepositToManagerTx(
  balanceManagerId: string,
  coinType: string,
  coinObject: any,
  tx: Transaction = new Transaction(),
): Transaction {
  const deepBookConfig =
    CURRENT_ENV === "mainnet" ? DEEPBOOK_MAINNET : DEEPBOOK_TESTNET;

  tx.moveCall({
    target: `${deepBookConfig.PACKAGE_ID}::balance_manager::deposit`,
    typeArguments: [coinType],
    arguments: [tx.object(balanceManagerId), coinObject],
  });

  return tx;
}

/**
 * Build a withdraw from balance manager transaction
 */
export function buildWithdrawFromManagerTx(
  balanceManagerId: string,
  coinType: string,
  amount: bigint,
  senderAddress: string,
  tx: Transaction = new Transaction(),
): Transaction {
  const deepBookConfig =
    CURRENT_ENV === "mainnet" ? DEEPBOOK_MAINNET : DEEPBOOK_TESTNET;

  const [withdrawnCoin] = tx.moveCall({
    target: `${deepBookConfig.PACKAGE_ID}::balance_manager::withdraw`,
    typeArguments: [coinType],
    arguments: [tx.object(balanceManagerId), tx.pure.u64(amount)],
  });

  tx.transferObjects([withdrawnCoin], tx.pure.address(senderAddress));

  return tx;
}

// ============== Flash Arbitrage ==============

/**
 * Build a flash arbitrage transaction
 * 1. Borrow asset A from pool 1
 * 2. Swap A -> B in pool 2
 * 3. Swap B -> A in pool 3 (or back in pool 1)
 * 4. Repay flash loan
 * 5. Keep profit
 */
export function buildFlashArbitrageTx(
  borrowPoolKey: string,
  swapPoolKey1: string,
  swapPoolKey2: string,
  borrowAmount: bigint,
  minProfit: bigint,
  senderAddress: string,
  deepCoin: any,
  tx: Transaction = new Transaction(),
): Transaction {
  const borrowPool = POOLS[borrowPoolKey as keyof typeof POOLS];
  const swapPool1 = POOLS[swapPoolKey1 as keyof typeof POOLS];
  const swapPool2 = POOLS[swapPoolKey2 as keyof typeof POOLS];

  if (!borrowPool || !swapPool1 || !swapPool2) {
    throw new Error("One or more pools not found");
  }

  const deepBookConfig =
    CURRENT_ENV === "mainnet" ? DEEPBOOK_MAINNET : DEEPBOOK_TESTNET;

  // Get coin types for typeArguments
  const borrowBaseCoinType =
    COIN_TYPES[borrowPool.baseCoin as keyof typeof COIN_TYPES];
  const borrowQuoteCoinType =
    COIN_TYPES[borrowPool.quoteCoin as keyof typeof COIN_TYPES];
  const swap1BaseCoinType =
    COIN_TYPES[swapPool1.baseCoin as keyof typeof COIN_TYPES];
  const swap1QuoteCoinType =
    COIN_TYPES[swapPool1.quoteCoin as keyof typeof COIN_TYPES];
  const swap2BaseCoinType =
    COIN_TYPES[swapPool2.baseCoin as keyof typeof COIN_TYPES];
  const swap2QuoteCoinType =
    COIN_TYPES[swapPool2.quoteCoin as keyof typeof COIN_TYPES];

  // Step 1: Borrow base asset via flash loan
  const [borrowedCoin, flashLoan] = tx.moveCall({
    target: `${deepBookConfig.PACKAGE_ID}::pool::borrow_flashloan_base`,
    typeArguments: [borrowBaseCoinType, borrowQuoteCoinType],
    arguments: [tx.object(borrowPool.poolId), tx.pure.u64(borrowAmount)],
  });

  // Step 2: Swap borrowed asset in first swap pool
  const [swapOut1Base, swapOut1Quote, swapOut1Deep] = tx.moveCall({
    target: `${deepBookConfig.PACKAGE_ID}::pool::swap_exact_base_for_quote`,
    typeArguments: [swap1BaseCoinType, swap1QuoteCoinType],
    arguments: [
      tx.object(swapPool1.poolId),
      borrowedCoin,
      deepCoin,
      tx.pure.u64(0), // min out (we'll check profit at the end)
      tx.object("0x6"),
    ],
  });

  // Step 3: Swap back in second pool
  const [swapOut2Base, swapOut2Quote, swapOut2Deep] = tx.moveCall({
    target: `${deepBookConfig.PACKAGE_ID}::pool::swap_exact_quote_for_base`,
    typeArguments: [swap2BaseCoinType, swap2QuoteCoinType],
    arguments: [
      tx.object(swapPool2.poolId),
      swapOut1Quote,
      swapOut1Deep,
      tx.pure.u64(borrowAmount + minProfit), // need at least borrowed + profit
      tx.object("0x6"),
    ],
  });

  // Step 4: Repay flash loan
  tx.moveCall({
    target: `${deepBookConfig.PACKAGE_ID}::pool::return_flashloan_base`,
    typeArguments: [borrowBaseCoinType, borrowQuoteCoinType],
    arguments: [tx.object(borrowPool.poolId), swapOut2Base, flashLoan],
  });

  // Step 5: Transfer profit to sender (remaining coins after repayment)
  tx.transferObjects(
    [swapOut2Quote, swapOut2Deep, swapOut1Base],
    tx.pure.address(senderAddress),
  );

  return tx;
}

// ============== Utility Functions ==============

/**
 * Calculate slippage-adjusted minimum output
 */
export function calculateMinOutput(
  amount: bigint,
  price: number,
  slippageBps: number,
  decimalsIn: number,
  decimalsOut: number,
): bigint {
  const expectedOutput =
    (Number(amount) / Math.pow(10, decimalsIn)) *
    price *
    Math.pow(10, decimalsOut);
  const minOutput = expectedOutput * (1 - slippageBps / 10000);
  return BigInt(Math.floor(minOutput));
}

/**
 * Format amount with decimals
 */
export function formatAmount(amount: bigint, decimals: number): string {
  const divisor = Math.pow(10, decimals);
  return (Number(amount) / divisor).toFixed(decimals > 4 ? 4 : decimals);
}

/**
 * Parse amount string to bigint
 */
export function parseAmount(amount: string, decimals: number): bigint {
  const multiplier = Math.pow(10, decimals);
  return BigInt(Math.floor(parseFloat(amount) * multiplier));
}

/**
 * Get pool info by key
 */
export function getPoolInfo(poolKey: string): PoolInfo | null {
  return POOLS[poolKey as keyof typeof POOLS] || null;
}

/**
 * Get all available pool keys
 */
export function getAvailablePools(): string[] {
  return Object.keys(POOLS);
}

/**
 * Get coin decimals
 */
export function getCoinDecimals(coinSymbol: string): number {
  return COIN_DECIMALS[coinSymbol] || 9;
}

/**
 * Calculate arbitrage opportunity
 */
export async function findArbitrageOpportunity(poolKeys: string[]): Promise<{
  exists: boolean;
  pools: string[];
  estimatedProfit: number;
  path: string[];
} | null> {
  if (poolKeys.length < 2) return null;

  const prices: Record<string, number> = {};

  for (const key of poolKeys) {
    prices[key] = await fetchPrice(key);
  }

  // Simple triangular arbitrage check
  // For real arbitrage, you'd need more sophisticated routing
  const pool1 = poolKeys[0];
  const pool2 = poolKeys[1];

  const price1 = prices[pool1];
  const price2 = prices[pool2];

  // Check if there's a price discrepancy
  const priceDiff = Math.abs(price1 - price2) / Math.min(price1, price2);

  if (priceDiff > 0.005) {
    // 0.5% opportunity
    return {
      exists: true,
      pools: [pool1, pool2],
      estimatedProfit: priceDiff * 100,
      path: [pool1.split("_")[0], pool1.split("_")[1], pool2.split("_")[0]],
    };
  }

  return null;
}

// ============== Demo Transaction Builders ==============

/**
 * Build a demo swap transaction that simulates the workflow
 * but uses minimal amounts for testnet
 */
export function buildDemoSwapTx(
  pair: string,
  side: "buy" | "sell",
  amount: number,
  tx: Transaction = new Transaction(),
): { tx: Transaction; description: string } {
  const pool = POOLS[pair as keyof typeof POOLS];
  if (!pool) throw new Error(`Unknown pair: ${pair}`);

  // Use very small amounts for demo (0.01 SUI worth)
  const demoAmount = BigInt(
    Math.floor(amount * Math.pow(10, pool.baseDecimals)),
  );

  const description = `Demo ${side} ${amount} ${pair.split("_")[0]} at market price`;

  // For demo mode, we just emit an event rather than executing real swap
  if (DEMO_MODE) {
    // Split a tiny amount from gas and transfer back to create a valid transaction
    // CRITICAL: Must transfer the result to avoid UnusedValueWithoutDrop error
    const [demoCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(1)]);
    tx.transferObjects([demoCoin], tx.gas);
  }

  return { tx, description };
}

/**
 * Build a demo flash arbitrage transaction
 */
export function buildDemoFlashArbitrageTx(
  borrowPool: string,
  swapPool1: string,
  swapPool2: string,
  borrowAmount: number,
  senderAddress: string,
  tx: Transaction = new Transaction(),
): { tx: Transaction; description: string } {
  const description = `Demo flash arbitrage: Borrow ${borrowAmount} from ${borrowPool}, swap through ${swapPool1} → ${swapPool2}`;

  if (DEMO_MODE) {
    // Create a minimal valid transaction for demo
    // CRITICAL: Must transfer the result to avoid UnusedValueWithoutDrop error
    const [demoCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(1)]);
    tx.transferObjects([demoCoin], tx.pure.address(senderAddress));
  }

  return { tx, description };
}

/**
 * Simulate a trade and return estimated results
 */
export async function simulateTrade(
  poolKey: string,
  side: "buy" | "sell",
  amount: number,
): Promise<{
  inputAmount: number;
  outputAmount: number;
  priceImpact: number;
  fee: number;
  minimumReceived: number;
}> {
  const price = await fetchPrice(poolKey);
  const pool = POOLS[poolKey as keyof typeof POOLS];

  if (!pool) {
    throw new Error(`Pool not found: ${poolKey}`);
  }

  const isBuy = side === "buy";
  const outputAmount = isBuy ? amount / price : amount * price;

  // Estimate price impact based on typical liquidity
  const priceImpact = Math.min(amount * 0.001, 5); // Max 5% impact

  // DeepBook fee is typically 0.1%
  const fee = outputAmount * 0.001;

  // Calculate minimum received with 1% slippage
  const minimumReceived = outputAmount * 0.99 - fee;

  return {
    inputAmount: amount,
    outputAmount,
    priceImpact,
    fee,
    minimumReceived,
  };
}

// ============== Export Default ==============

export default {
  // Config
  DEEPBOOK_TESTNET,
  DEEPBOOK_MAINNET,
  COIN_TYPES,
  COIN_DECIMALS,
  POOLS,
  CURRENT_ENV,
  DEMO_MODE,

  // Client
  createDeepBookTradingClient,
  getDeepBookClient,

  // Price fetching
  fetchPrice,
  fetchPrices,
  fetchOrderBook,

  // PTB Builders
  buildSwapTx,
  buildCompleteSwapTx,
  buildFlashLoanBorrowTx,
  buildFlashLoanRepayTx,
  buildLimitOrderTx,
  buildMarketOrderTx,
  buildCancelOrderTx,
  buildFlashArbitrageTx,

  // Balance Manager
  BalanceManagerContract,
  createBalanceManagerContract,
  buildCreateBalanceManagerTx,
  buildMintTradeCapTx,
  buildMintAndAssignTradeCapTx,
  buildDepositToManagerTx,
  buildWithdrawFromManagerTx,

  // Demo
  buildDemoSwapTx,
  buildDemoFlashArbitrageTx,
  simulateTrade,

  // Utilities
  calculateMinOutput,
  formatAmount,
  parseAmount,
  getPoolInfo,
  getAvailablePools,
  getCoinDecimals,
  findArbitrageOpportunity,

  // Constants
  ORDER_TYPE,
  SELF_MATCHING_OPTION,
};
