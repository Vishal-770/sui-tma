/**
 * DeepBook V3 Integration
 * 
 * Complete rewrite based on official @mysten/deepbook-v3 SDK
 * https://github.com/MystenLabs/ts-sdks/tree/main/packages/deepbook-v3
 * 
 * Supports both mainnet and testnet with proper coin/pool configurations
 */

import { Transaction, coinWithBalance } from '@mysten/sui/transactions';
import type { TransactionObjectArgument } from '@mysten/sui/transactions';

// ============== Types ==============

export type NetworkEnv = 'testnet' | 'mainnet';

export interface Coin {
  address: string;
  type: string;
  scalar: number;
}

export interface Pool {
  address: string;
  baseCoin: string;
  quoteCoin: string;
}

export type CoinMap = Record<string, Coin>;
export type PoolMap = Record<string, Pool>;

// ============== Package IDs (from official SDK) ==============

export const testnetPackageIds = {
  DEEPBOOK_PACKAGE_ID: '0x22be4cade64bf2d02412c7e8d0e8beea2f78828b948118d46735315409371a3c',
  REGISTRY_ID: '0x7c256edbda983a2cd6f946655f4bf3f00a41043993781f8674a7046e8c0e11d1',
  DEEP_TREASURY_ID: '0x032abf8948dda67a271bcc18e776dbbcfb0d58c8d288a700ff0d5521e57a1ffe',
};

export const mainnetPackageIds = {
  DEEPBOOK_PACKAGE_ID: '0x337f4f4f6567fcd778d5454f27c16c70e2f274cc6377ea6249ddf491482ef497',
  REGISTRY_ID: '0xaf16199a2dff736e9f07a845f23c5da6df6f756eddb631aed9d24a93efc4549d',
  DEEP_TREASURY_ID: '0x69fffdae0075f8f71f4fa793549c11079266910e8905169845af1f5d00e09dcb',
};

// ============== Constants ==============

export const FLOAT_SCALAR = 1_000_000_000; // 1e9 - for price calculations
export const DEEP_SCALAR = 1_000_000; // 1e6 - DEEP has 6 decimals
export const GAS_BUDGET = 250_000_000; // 0.25 SUI
export const MAX_TIMESTAMP = BigInt('1844674407370955161'); // Max u64 for order expiration

// ============== Testnet Coins (from official SDK) ==============

export const testnetCoins: CoinMap = {
  DEEP: {
    address: '0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8',
    type: '0x36dbef866a1d62bf7328989a10fb2f07d769f4ee587c0de4a0a256e57e0a58a8::deep::DEEP',
    scalar: 1000000,
  },
  SUI: {
    address: '0x0000000000000000000000000000000000000000000000000000000000000002',
    type: '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
    scalar: 1000000000,
  },
  DBUSDC: {
    address: '0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7',
    type: '0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDC::DBUSDC',
    scalar: 1000000,
  },
  DBUSDT: {
    address: '0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7',
    type: '0xf7152c05930480cd740d7311b5b8b45c6f488e3a53a11c3f74a6fac36a52e0d7::DBUSDT::DBUSDT',
    scalar: 1000000,
  },
  DBTC: {
    address: '0x6502dae813dbe5e42643c119a6450a518481f03063febc7e20238e43b6ea9e86',
    type: '0x6502dae813dbe5e42643c119a6450a518481f03063febc7e20238e43b6ea9e86::dbtc::DBTC',
    scalar: 100000000,
  },
  WAL: {
    address: '0x9ef7676a9f81937a52ae4b2af8d511a28a0b080477c0c2db40b0ab8882240d76',
    type: '0x9ef7676a9f81937a52ae4b2af8d511a28a0b080477c0c2db40b0ab8882240d76::wal::WAL',
    scalar: 1000000000,
  },
};

// ============== Mainnet Coins (from official SDK) ==============

export const mainnetCoins: CoinMap = {
  DEEP: {
    address: '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270',
    type: '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP',
    scalar: 1000000,
  },
  SUI: {
    address: '0x0000000000000000000000000000000000000000000000000000000000000002',
    type: '0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI',
    scalar: 1000000000,
  },
  USDC: {
    address: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7',
    type: '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC',
    scalar: 1000000,
  },
  WUSDC: {
    address: '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf',
    type: '0x5d4b302506645c37ff133b98c4b50a5ae14841659738d6d733d59d0d217a93bf::coin::COIN',
    scalar: 1000000,
  },
  WUSDT: {
    address: '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c',
    type: '0xc060006111016b8a020ad5b33834984a437aaa7d3c74c18e09a95d48aceab08c::coin::COIN',
    scalar: 1000000,
  },
  BETH: {
    address: '0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29',
    type: '0xd0e89b2af5e4910726fbcd8b8dd37bb79b29e5f83f7491bca830e94f7f226d29::eth::ETH',
    scalar: 100000000,
  },
  NS: {
    address: '0x5145494a5f5100e645e4b0aa950fa6b68f614e8c59e17bc5ded3495123a79178',
    type: '0x5145494a5f5100e645e4b0aa950fa6b68f614e8c59e17bc5ded3495123a79178::ns::NS',
    scalar: 1000000,
  },
  WAL: {
    address: '0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59',
    type: '0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL',
    scalar: 1000000000,
  },
  TYPUS: {
    address: '0xf82dc05634970553615eef6112a1ac4fb7bf10272bf6cbe0f80ef44a6c489385',
    type: '0xf82dc05634970553615eef6112a1ac4fb7bf10272bf6cbe0f80ef44a6c489385::typus::TYPUS',
    scalar: 1000000000,
  },
};

// ============== Testnet Pools (from official SDK) ==============

export const testnetPools: PoolMap = {
  DEEP_SUI: {
    address: '0x48c95963e9eac37a316b7ae04a0deb761bcdcc2b67912374d6036e7f0e9bae9f',
    baseCoin: 'DEEP',
    quoteCoin: 'SUI',
  },
  SUI_DBUSDC: {
    address: '0x1c19362ca52b8ffd7a33cee805a67d40f31e6ba303753fd3a4cfdfacea7163a5',
    baseCoin: 'SUI',
    quoteCoin: 'DBUSDC',
  },
  DEEP_DBUSDC: {
    address: '0xe86b991f8632217505fd859445f9803967ac84a9d4a1219065bf191fcb74b622',
    baseCoin: 'DEEP',
    quoteCoin: 'DBUSDC',
  },
  DBUSDT_DBUSDC: {
    address: '0x83970bb02e3636efdff8c141ab06af5e3c9a22e2f74d7f02a9c3430d0d10c1ca',
    baseCoin: 'DBUSDT',
    quoteCoin: 'DBUSDC',
  },
  WAL_DBUSDC: {
    address: '0xeb524b6aea0ec4b494878582e0b78924208339d360b62aec4a8ecd4031520dbb',
    baseCoin: 'WAL',
    quoteCoin: 'DBUSDC',
  },
  WAL_SUI: {
    address: '0x8c1c1b186c4fddab1ebd53e0895a36c1d1b3b9a77cd34e607bef49a38af0150a',
    baseCoin: 'WAL',
    quoteCoin: 'SUI',
  },
  DBTC_DBUSDC: {
    address: '0x0dce0aa771074eb83d1f4a29d48be8248d4d2190976a5241f66b43ec18fa34de',
    baseCoin: 'DBTC',
    quoteCoin: 'DBUSDC',
  },
};

// ============== Mainnet Pools (from official SDK) ==============

export const mainnetPools: PoolMap = {
  DEEP_SUI: {
    address: '0xb663828d6217467c8a1838a03793da896cbe745b150ebd57d82f814ca579fc22',
    baseCoin: 'DEEP',
    quoteCoin: 'SUI',
  },
  SUI_USDC: {
    address: '0xe05dafb5133bcffb8d59f4e12465dc0e9faeaa05e3e342a08fe135800e3e4407',
    baseCoin: 'SUI',
    quoteCoin: 'USDC',
  },
  DEEP_USDC: {
    address: '0xf948981b806057580f91622417534f491da5f61aeaf33d0ed8e69fd5691c95ce',
    baseCoin: 'DEEP',
    quoteCoin: 'USDC',
  },
  WUSDT_USDC: {
    address: '0x4e2ca3988246e1d50b9bf209abb9c1cbfec65bd95afdacc620a36c67bdb8452f',
    baseCoin: 'WUSDT',
    quoteCoin: 'USDC',
  },
  WUSDC_USDC: {
    address: '0xa0b9ebefb38c963fd115f52d71fa64501b79d1adcb5270563f92ce0442376545',
    baseCoin: 'WUSDC',
    quoteCoin: 'USDC',
  },
  BETH_USDC: {
    address: '0x1109352b9112717bd2a7c3eb9a416fff1ba6951760f5bdd5424cf5e4e5b3e65c',
    baseCoin: 'BETH',
    quoteCoin: 'USDC',
  },
  NS_USDC: {
    address: '0x0c0fdd4008740d81a8a7d4281322aee71a1b62c449eb5b142656753d89ebc060',
    baseCoin: 'NS',
    quoteCoin: 'USDC',
  },
  NS_SUI: {
    address: '0x27c4fdb3b846aa3ae4a65ef5127a309aa3c1f466671471a806d8912a18b253e8',
    baseCoin: 'NS',
    quoteCoin: 'SUI',
  },
  WAL_USDC: {
    address: '0x56a1c985c1f1123181d6b881714793689321ba24301b3585eec427436eb1c76d',
    baseCoin: 'WAL',
    quoteCoin: 'USDC',
  },
  WAL_SUI: {
    address: '0x81f5339934c83ea19dd6bcc75c52e83509629a5f71d3257428c2ce47cc94d08b',
    baseCoin: 'WAL',
    quoteCoin: 'SUI',
  },
  TYPUS_SUI: {
    address: '0xe8e56f377ab5a261449b92ac42c8ddaacd5671e9fec2179d7933dd1a91200eec',
    baseCoin: 'TYPUS',
    quoteCoin: 'SUI',
  },
};

// ============== Config Helper ==============

export interface DeepBookConfig {
  network: NetworkEnv;
  packageId: string;
  registryId: string;
  deepTreasuryId: string;
  coins: CoinMap;
  pools: PoolMap;
}

export function getConfig(network: NetworkEnv): DeepBookConfig {
  if (network === 'mainnet') {
    return {
      network,
      packageId: mainnetPackageIds.DEEPBOOK_PACKAGE_ID,
      registryId: mainnetPackageIds.REGISTRY_ID,
      deepTreasuryId: mainnetPackageIds.DEEP_TREASURY_ID,
      coins: mainnetCoins,
      pools: mainnetPools,
    };
  }
  return {
    network,
    packageId: testnetPackageIds.DEEPBOOK_PACKAGE_ID,
    registryId: testnetPackageIds.REGISTRY_ID,
    deepTreasuryId: testnetPackageIds.DEEP_TREASURY_ID,
    coins: testnetCoins,
    pools: testnetPools,
  };
}

// ============== Swap Parameters ==============

export interface SwapExactParams {
  tx: Transaction;
  config: DeepBookConfig;
  poolKey: string;
  inputCoin: TransactionObjectArgument;
  deepCoin?: TransactionObjectArgument;
  minOutput: bigint;
  senderAddress: string;
}

// ============== Swap Functions ==============

/**
 * Swap exact base coin for quote coin
 * 
 * @example
 * // Swap 1 SUI for DBUSDC on testnet
 * const config = getConfig('testnet');
 * const tx = new Transaction();
 * const [baseOut, quoteOut, deepOut] = swapExactBaseForQuote({
 *   tx,
 *   config,
 *   poolKey: 'SUI_DBUSDC',
 *   inputCoin: tx.splitCoins(tx.gas, [tx.pure.u64(1_000_000_000n)]),
 *   minOutput: 0n,
 *   senderAddress: '0x...',
 * });
 */
export function swapExactBaseForQuote(params: SwapExactParams): readonly [TransactionObjectArgument, TransactionObjectArgument, TransactionObjectArgument] {
  const { tx, config, poolKey, inputCoin, deepCoin, minOutput, senderAddress } = params;
  
  const pool = config.pools[poolKey];
  if (!pool) {
    throw new Error(`Pool not found: ${poolKey}`);
  }
  
  const baseCoin = config.coins[pool.baseCoin];
  const quoteCoin = config.coins[pool.quoteCoin];
  const deepCoinType = config.coins['DEEP'].type;
  
  if (!baseCoin || !quoteCoin) {
    throw new Error(`Coin types not found for pool ${poolKey}`);
  }

  // Create DEEP coin for fees (use 0 if not provided - some pools allow fee-free swaps or use alternative fee mechanisms)
  const deepInput = deepCoin ?? coinWithBalance({ type: deepCoinType, balance: 0 });

  const [baseOut, quoteOut, deepOut] = tx.moveCall({
    target: `${config.packageId}::pool::swap_exact_base_for_quote`,
    arguments: [
      tx.object(pool.address),
      inputCoin,
      deepInput,
      tx.pure.u64(minOutput),
      tx.object('0x6'), // Clock object
    ],
    typeArguments: [baseCoin.type, quoteCoin.type],
  });

  return [baseOut, quoteOut, deepOut] as const;
}

/**
 * Swap exact quote coin for base coin
 */
export function swapExactQuoteForBase(params: SwapExactParams): readonly [TransactionObjectArgument, TransactionObjectArgument, TransactionObjectArgument] {
  const { tx, config, poolKey, inputCoin, deepCoin, minOutput, senderAddress } = params;
  
  const pool = config.pools[poolKey];
  if (!pool) {
    throw new Error(`Pool not found: ${poolKey}`);
  }
  
  const baseCoin = config.coins[pool.baseCoin];
  const quoteCoin = config.coins[pool.quoteCoin];
  const deepCoinType = config.coins['DEEP'].type;
  
  if (!baseCoin || !quoteCoin) {
    throw new Error(`Coin types not found for pool ${poolKey}`);
  }

  // Create DEEP coin for fees
  const deepInput = deepCoin ?? coinWithBalance({ type: deepCoinType, balance: 0 });

  const [baseOut, quoteOut, deepOut] = tx.moveCall({
    target: `${config.packageId}::pool::swap_exact_quote_for_base`,
    arguments: [
      tx.object(pool.address),
      inputCoin,
      deepInput,
      tx.pure.u64(minOutput),
      tx.object('0x6'), // Clock object
    ],
    typeArguments: [baseCoin.type, quoteCoin.type],
  });

  return [baseOut, quoteOut, deepOut] as const;
}

// ============== Flash Loan Functions ==============

export interface FlashLoanBorrowParams {
  tx: Transaction;
  config: DeepBookConfig;
  poolKey: string;
  borrowAmount: bigint;
}

export interface FlashLoanReturnParams {
  tx: Transaction;
  config: DeepBookConfig;
  poolKey: string;
  coin: TransactionObjectArgument;
  flashLoan: TransactionObjectArgument;
}

/**
 * Borrow base asset via flash loan
 * Returns [borrowedCoin, flashLoanReceipt]
 * The flashLoanReceipt MUST be returned in the same transaction
 */
export function borrowFlashLoanBase(params: FlashLoanBorrowParams): readonly [TransactionObjectArgument, TransactionObjectArgument] {
  const { tx, config, poolKey, borrowAmount } = params;
  
  const pool = config.pools[poolKey];
  if (!pool) {
    throw new Error(`Pool not found: ${poolKey}`);
  }
  
  const baseCoin = config.coins[pool.baseCoin];
  const quoteCoin = config.coins[pool.quoteCoin];
  
  const [borrowedCoin, flashLoan] = tx.moveCall({
    target: `${config.packageId}::pool::borrow_flashloan_base`,
    arguments: [
      tx.object(pool.address),
      tx.pure.u64(borrowAmount),
    ],
    typeArguments: [baseCoin.type, quoteCoin.type],
  });

  return [borrowedCoin, flashLoan] as const;
}

/**
 * Borrow quote asset via flash loan
 */
export function borrowFlashLoanQuote(params: FlashLoanBorrowParams): readonly [TransactionObjectArgument, TransactionObjectArgument] {
  const { tx, config, poolKey, borrowAmount } = params;
  
  const pool = config.pools[poolKey];
  if (!pool) {
    throw new Error(`Pool not found: ${poolKey}`);
  }
  
  const baseCoin = config.coins[pool.baseCoin];
  const quoteCoin = config.coins[pool.quoteCoin];
  
  const [borrowedCoin, flashLoan] = tx.moveCall({
    target: `${config.packageId}::pool::borrow_flashloan_quote`,
    arguments: [
      tx.object(pool.address),
      tx.pure.u64(borrowAmount),
    ],
    typeArguments: [baseCoin.type, quoteCoin.type],
  });

  return [borrowedCoin, flashLoan] as const;
}

/**
 * Return base asset after flash loan
 */
export function returnFlashLoanBase(params: FlashLoanReturnParams): void {
  const { tx, config, poolKey, coin, flashLoan } = params;
  
  const pool = config.pools[poolKey];
  if (!pool) {
    throw new Error(`Pool not found: ${poolKey}`);
  }
  
  const baseCoin = config.coins[pool.baseCoin];
  const quoteCoin = config.coins[pool.quoteCoin];
  
  tx.moveCall({
    target: `${config.packageId}::pool::return_flashloan_base`,
    arguments: [
      tx.object(pool.address),
      coin,
      flashLoan,
    ],
    typeArguments: [baseCoin.type, quoteCoin.type],
  });
}

/**
 * Return quote asset after flash loan
 */
export function returnFlashLoanQuote(params: FlashLoanReturnParams): void {
  const { tx, config, poolKey, coin, flashLoan } = params;
  
  const pool = config.pools[poolKey];
  if (!pool) {
    throw new Error(`Pool not found: ${poolKey}`);
  }
  
  const baseCoin = config.coins[pool.baseCoin];
  const quoteCoin = config.coins[pool.quoteCoin];
  
  tx.moveCall({
    target: `${config.packageId}::pool::return_flashloan_quote`,
    arguments: [
      tx.object(pool.address),
      coin,
      flashLoan,
    ],
    typeArguments: [baseCoin.type, quoteCoin.type],
  });
}

// ============== Helper Functions ==============

/**
 * Get pool by coin pair (works in either direction)
 */
export function getPoolByCoins(config: DeepBookConfig, coinA: string, coinB: string): { poolKey: string; pool: Pool; isBaseToQuote: boolean } | null {
  for (const [key, pool] of Object.entries(config.pools)) {
    if (pool.baseCoin === coinA && pool.quoteCoin === coinB) {
      return { poolKey: key, pool, isBaseToQuote: true };
    }
    if (pool.baseCoin === coinB && pool.quoteCoin === coinA) {
      return { poolKey: key, pool, isBaseToQuote: false };
    }
  }
  return null;
}

/**
 * Calculate output amount with slippage
 */
export function calculateMinOutput(expectedOutput: number, slippagePercent: number, decimals: number): bigint {
  const minOutput = expectedOutput * (1 - slippagePercent / 100);
  return BigInt(Math.floor(minOutput * Math.pow(10, decimals)));
}

/**
 * Convert human-readable amount to on-chain units
 */
export function toUnits(amount: number, decimals: number): bigint {
  return BigInt(Math.floor(amount * Math.pow(10, decimals)));
}

/**
 * Convert on-chain units to human-readable amount
 */
export function fromUnits(units: bigint, decimals: number): number {
  return Number(units) / Math.pow(10, decimals);
}

/**
 * Get the explorer URL for a transaction
 */
export function getExplorerUrl(network: NetworkEnv, digest: string): string {
  const base = network === 'mainnet' 
    ? 'https://suiscan.xyz/mainnet' 
    : 'https://suiscan.xyz/testnet';
  return `${base}/tx/${digest}`;
}

/**
 * Get coin decimals from coin info
 */
export function getCoinDecimals(config: DeepBookConfig, coinSymbol: string): number {
  const coin = config.coins[coinSymbol];
  if (!coin) return 9; // Default to SUI decimals
  // scalar is 10^decimals, so decimals = log10(scalar)
  return Math.log10(coin.scalar);
}
// ============== Flash Arbitrage Helper ==============

export interface FlashArbitrageParams {
  tx: Transaction;
  config: DeepBookConfig;
  /** Pool to borrow from (will flash loan base asset) */
  borrowPoolKey: string;
  /** Amount to borrow in human-readable units */
  borrowAmount: number;
  /** Pool to swap borrowed asset in */
  swapPoolKey: string;
  /** Address to receive profit */
  recipient: string;
}

/**
 * Build a flash loan arbitrage transaction
 * 
 * This demonstrates the pattern:
 * 1. Borrow base asset from borrowPool via flash loan
 * 2. Swap on swapPool
 * 3. Swap back to original asset
 * 4. Return borrowed amount to borrowPool
 * 5. Transfer profit to recipient
 * 
 * NOTE: For arbitrage to be profitable, there must be a price discrepancy between pools.
 * On testnet, pools often have low/no liquidity so this is mainly for demonstration.
 */
export function buildFlashArbitrageDemo(params: FlashArbitrageParams): {
  borrowedCoin: TransactionObjectArgument;
  flashLoan: TransactionObjectArgument;
} {
  const { tx, config, borrowPoolKey, borrowAmount, swapPoolKey, recipient } = params;
  
  const borrowPool = config.pools[borrowPoolKey];
  if (!borrowPool) {
    throw new Error(`Borrow pool not found: ${borrowPoolKey}`);
  }
  
  const baseCoin = config.coins[borrowPool.baseCoin];
  const borrowAmountUnits = BigInt(Math.round(borrowAmount * baseCoin.scalar));
  
  // Step 1: Borrow base asset via flash loan
  const [borrowedCoin, flashLoan] = borrowFlashLoanBase({
    tx,
    config,
    poolKey: borrowPoolKey,
    borrowAmount: borrowAmountUnits,
  });
  
  return { borrowedCoin, flashLoan };
}

/**
 * Get list of available pool keys
 */
export function getAvailablePoolKeys(config: DeepBookConfig): string[] {
  return Object.keys(config.pools);
}

/**
 * Get pool info by key
 */
export function getPoolInfo(config: DeepBookConfig, poolKey: string): Pool | null {
  return config.pools[poolKey] || null;
}

/**
 * Check if a coin type is supported
 */
export function isCoinSupported(config: DeepBookConfig, coinSymbol: string): boolean {
  return !!config.coins[coinSymbol];
}