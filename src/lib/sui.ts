import { SuiGrpcClient } from "@mysten/sui/grpc";

const SUI_RPC_URL = process.env.NEXT_PUBLIC_SUI_RPC_URL || "https://fullnode.testnet.sui.io";

/**
 * Sui client singleton
 */
let suiClientInstance: SuiGrpcClient | null = null;

export function getSuiClient(): SuiGrpcClient {
  if (!suiClientInstance) {
    suiClientInstance = new SuiGrpcClient({ 
      baseUrl: SUI_RPC_URL,
      network: "testnet",
    });
  }
  return suiClientInstance;
}

/**
 * Get SUI balance for an address
 */
export async function getBalance(address: string): Promise<bigint> {
  const client = getSuiClient();
  const balanceResponse = await client.core.getBalance({ 
    owner: address,
    coinType: "0x2::sui::SUI",
  });
  return BigInt(balanceResponse.balance.balance);
}

/**
 * Get current epoch
 */
export async function getCurrentEpoch(): Promise<number> {
  const client = getSuiClient();
  const systemState = await client.core.getCurrentSystemState();
  return Number(systemState.systemState.epoch);
}

/**
 * Format address for display (truncate middle)
 */
export function formatAddress(address: string, chars = 6): string {
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

/**
 * Format SUI amount (from MIST to SUI)
 */
export function formatSui(mist: bigint | string | number): string {
  const mistBigInt = BigInt(mist);
  const sui = Number(mistBigInt) / 1_000_000_000;
  if (sui === 0) return "0";
  if (sui < 0.0001) return "<0.0001";
  return sui.toLocaleString(undefined, { 
    minimumFractionDigits: 0,
    maximumFractionDigits: 4 
  });
}

/**
 * Parse SUI to MIST
 */
export function parseSuiToMist(sui: number | string): bigint {
  return BigInt(Math.floor(Number(sui) * 1_000_000_000));
}

/**
 * Network configuration
 */
export const NETWORK_CONFIG = {
  testnet: {
    rpcUrl: "https://fullnode.testnet.sui.io",
    explorerUrl: "https://suiscan.xyz/testnet",
    faucetUrl: "https://faucet.testnet.sui.io",
  },
  mainnet: {
    rpcUrl: "https://fullnode.mainnet.sui.io",
    explorerUrl: "https://suiscan.xyz/mainnet",
    faucetUrl: null,
  },
  devnet: {
    rpcUrl: "https://fullnode.devnet.sui.io",
    explorerUrl: "https://suiscan.xyz/devnet",
    faucetUrl: "https://faucet.devnet.sui.io",
  },
};

export type NetworkType = keyof typeof NETWORK_CONFIG;

/**
 * Get explorer URL for a transaction or address
 */
export function getExplorerUrl(
  type: "tx" | "address" | "object",
  id: string,
  network: NetworkType = "testnet"
): string {
  const baseUrl = NETWORK_CONFIG[network].explorerUrl;
  switch (type) {
    case "tx":
      return `${baseUrl}/tx/${id}`;
    case "address":
      return `${baseUrl}/account/${id}`;
    case "object":
      return `${baseUrl}/object/${id}`;
    default:
      return baseUrl;
  }
}
