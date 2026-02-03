import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import {
  generateNonce,
  generateRandomness,
  getExtendedEphemeralPublicKey,
  jwtToAddress,
  genAddressSeed,
  getZkLoginSignature,
} from "@mysten/sui/zklogin";
import { SuiGrpcClient } from "@mysten/sui/grpc";
import { jwtDecode } from "jwt-decode";
import { Transaction } from "@mysten/sui/transactions";

// Configuration
const SUI_RPC_URL = process.env.NEXT_PUBLIC_SUI_RPC_URL || "https://fullnode.testnet.sui.io";
const PROVER_URL = process.env.NEXT_PUBLIC_PROVER_URL || "https://prover-dev.mystenlabs.com/v1";
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
const REDIRECT_URL = process.env.NEXT_PUBLIC_REDIRECT_URL || "";

export interface JwtPayload {
  iss?: string;
  sub?: string;
  aud?: string[] | string;
  exp?: number;
  nbf?: number;
  iat?: number;
  jti?: string;
}

export interface ZkLoginSetup {
  ephemeralKeyPair: Ed25519Keypair;
  randomness: string;
  nonce: string;
  maxEpoch: number;
  estimatedExpiration: Date;
}

export interface PartialZkLoginSignature {
  proofPoints: {
    a: string[];
    b: string[][];
    c: string[];
  };
  issBase64Details: {
    value: string;
    indexMod4: number;
  };
  headerBase64: string;
}

export interface ZkLoginSession {
  ephemeralPrivateKey: string;
  ephemeralPublicKey: string;
  randomness: string;
  maxEpoch: number;
  jwt: string;
  userSalt: string;
  zkLoginAddress: string;
  zkProof?: PartialZkLoginSignature;
  telegramUserId?: number;
}

/**
 * Get Sui client instance
 */
export function getSuiClient(): SuiGrpcClient {
  return new SuiGrpcClient({ 
    baseUrl: SUI_RPC_URL,
    network: "testnet",
  });
}

/**
 * Initialize zkLogin by generating ephemeral keypair and nonce
 */
export async function setupZkLogin(): Promise<ZkLoginSetup> {
  const suiClient = getSuiClient();

  // Get current epoch information
  const systemState = await suiClient.core.getCurrentSystemState();
  const epoch = systemState.systemState.epoch;

  // Set ephemeral key to be active for 2 epochs (~24 hours on testnet)
  const maxEpoch = Number(epoch) + 2;

  // Generate ephemeral keypair
  const ephemeralKeyPair = new Ed25519Keypair();

  // Generate randomness and nonce
  const randomness = generateRandomness();
  const nonce = generateNonce(
    ephemeralKeyPair.getPublicKey(),
    maxEpoch,
    randomness
  );

  // Calculate estimated expiration time (approximately 24 hours per epoch)
  const estimatedExpiration = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);

  return {
    ephemeralKeyPair,
    randomness,
    nonce,
    maxEpoch,
    estimatedExpiration,
  };
}

/**
 * Build Google OAuth URL for zkLogin
 */
export function getGoogleAuthUrl(nonce: string, redirectUrl?: string): string {
  const clientId = GOOGLE_CLIENT_ID;
  const redirect = redirectUrl || REDIRECT_URL;

  if (!clientId) {
    throw new Error("Google Client ID not configured");
  }

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "id_token",
    redirect_uri: redirect,
    scope: "openid",
    nonce: nonce,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Generate a deterministic salt from the sub claim
 * In production, use a secure backend service with encrypted storage
 */
export function generateUserSalt(sub: string): string {
  // For demo: derive a salt from sub using a simple hash
  // In production, use a proper salt management service with HSM
  let hash = 0;
  for (let i = 0; i < sub.length; i++) {
    const char = sub.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }

  // Convert to a valid salt (must be smaller than 2^128)
  const maxSalt = BigInt(2) ** BigInt(128);
  const salt = BigInt(Math.abs(hash)) % maxSalt;
  return salt.toString();
}

/**
 * Generate salt that combines Telegram user ID with sub for determinism
 */
export function generateTelegramUserSalt(telegramUserId: number, sub: string): string {
  const combined = `tg:${telegramUserId}:${sub}`;
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  const maxSalt = BigInt(2) ** BigInt(128);
  const salt = BigInt(Math.abs(hash)) % maxSalt;
  return salt.toString();
}

/**
 * Get zkLogin address from JWT and salt
 */
export function getZkLoginAddressFromJwt(jwt: string, userSalt: string): string {
  // jwtToAddress(jwt, salt, isTestnet)
  return jwtToAddress(jwt, userSalt, false);
}

/**
 * Decode and validate JWT
 */
export function decodeJwt(jwt: string): JwtPayload {
  try {
    return jwtDecode<JwtPayload>(jwt);
  } catch (error) {
    console.error("Failed to decode JWT:", error);
    throw new Error("Invalid JWT token");
  }
}

/**
 * Check if JWT is expired
 */
export function isJwtExpired(jwt: string): boolean {
  const decoded = decodeJwt(jwt);
  if (!decoded.exp) return true;
  return Date.now() >= decoded.exp * 1000;
}

/**
 * Request ZK proof from prover service
 */
export async function requestZkProof(
  jwt: string,
  ephemeralKeyPair: Ed25519Keypair,
  maxEpoch: number,
  randomness: string,
  userSalt: string
): Promise<PartialZkLoginSignature> {
  const extendedEphemeralPublicKey = getExtendedEphemeralPublicKey(
    ephemeralKeyPair.getPublicKey()
  );

  const payload = {
    jwt,
    extendedEphemeralPublicKey: extendedEphemeralPublicKey.toString(),
    maxEpoch: maxEpoch.toString(),
    jwtRandomness: randomness,
    salt: userSalt,
    keyClaimName: "sub",
  };

  console.log("Requesting ZK proof...");

  try {
    const response = await fetch(PROVER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Prover error:", {
        status: response.status,
        body: errorText,
      });
      throw new Error(`Prover request failed: ${response.status} - ${errorText}`);
    }

    const proof = await response.json();
    console.log("ZK proof received successfully");
    return proof as PartialZkLoginSignature;
  } catch (error) {
    console.error("Failed to get ZK proof:", error);
    throw error;
  }
}

/**
 * Sign and execute a transaction with zkLogin
 */
export async function signAndExecuteZkLoginTransaction(
  txb: Transaction,
  session: ZkLoginSession
) {
  const suiClient = getSuiClient();

  // Reconstruct ephemeral keypair from Bech32-encoded string (suiprivkey1...)
  const ephemeralKeyPair = Ed25519Keypair.fromSecretKey(session.ephemeralPrivateKey);

  // Set transaction sender
  txb.setSender(session.zkLoginAddress);

  // Sign transaction with ephemeral key
  const { bytes, signature: userSignature } = await txb.sign({
    client: suiClient,
    signer: ephemeralKeyPair,
  });

  // Decode JWT to get claims
  const decodedJwt = decodeJwt(session.jwt);

  // Generate address seed
  const addressSeed = genAddressSeed(
    BigInt(session.userSalt),
    "sub",
    decodedJwt.sub!,
    decodedJwt.aud as string
  ).toString();

  if (!session.zkProof) {
    throw new Error("ZK proof not found in session");
  }

  // Create zkLogin signature
  const zkLoginSignature = getZkLoginSignature({
    inputs: {
      ...session.zkProof,
      addressSeed,
    },
    maxEpoch: session.maxEpoch,
    userSignature,
  });

  // Execute transaction - convert base64 string to Uint8Array
  const txBytes = Uint8Array.from(atob(bytes), (c) => c.charCodeAt(0));

  const result = await suiClient.executeTransaction({
    transaction: txBytes,
    signatures: [zkLoginSignature],
  });

  return result;
}

/**
 * Get account balance
 */
export async function getBalance(address: string): Promise<bigint> {
  const suiClient = getSuiClient();
  const balanceResponse = await suiClient.core.getBalance({ 
    owner: address,
    coinType: "0x2::sui::SUI",
  });
  return BigInt(balanceResponse.balance.balance);
}

/**
 * Format SUI balance for display
 */
export function formatSuiBalance(balance: bigint): string {
  const sui = Number(balance) / 1_000_000_000;
  return sui.toFixed(4);
}

// Session Storage Keys
const SESSION_KEY = "zklogin_session";
const SETUP_KEY = "zklogin_setup";

/**
 * Store zkLogin setup data (before OAuth)
 */
export function storeZkLoginSetup(setup: {
  ephemeralPrivateKey: string;
  ephemeralPublicKey: string;
  randomness: string;
  maxEpoch: number;
  nonce: string;
}): void {
  if (typeof window !== "undefined") {
    sessionStorage.setItem(SETUP_KEY, JSON.stringify(setup));
  }
}

/**
 * Get zkLogin setup data
 */
export function getZkLoginSetup(): {
  ephemeralPrivateKey: string;
  ephemeralPublicKey: string;
  randomness: string;
  maxEpoch: number;
  nonce: string;
} | null {
  if (typeof window !== "undefined") {
    const data = sessionStorage.getItem(SETUP_KEY);
    return data ? JSON.parse(data) : null;
  }
  return null;
}

/**
 * Clear zkLogin setup data
 */
export function clearZkLoginSetup(): void {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(SETUP_KEY);
  }
}

/**
 * Store zkLogin session data
 */
export function storeZkLoginSession(session: ZkLoginSession): void {
  if (typeof window !== "undefined") {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }
}

/**
 * Retrieve zkLogin session data
 */
export function getZkLoginSession(): ZkLoginSession | null {
  if (typeof window !== "undefined") {
    const data = sessionStorage.getItem(SESSION_KEY);
    return data ? JSON.parse(data) : null;
  }
  return null;
}

/**
 * Clear zkLogin session
 */
export function clearZkLoginSession(): void {
  if (typeof window !== "undefined") {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SETUP_KEY);
  }
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  const session = getZkLoginSession();
  if (!session) return false;
  
  // Check if JWT is still valid
  if (isJwtExpired(session.jwt)) {
    clearZkLoginSession();
    return false;
  }
  
  return true;
}

/**
 * Get current epoch
 */
export async function getCurrentEpoch(): Promise<number> {
  const suiClient = getSuiClient();
  const systemState = await suiClient.core.getCurrentSystemState();
  return Number(systemState.systemState.epoch);
}

/**
 * Check if session epoch is still valid
 */
export async function isSessionEpochValid(session: ZkLoginSession): Promise<boolean> {
  const currentEpoch = await getCurrentEpoch();
  return currentEpoch <= session.maxEpoch;
}
