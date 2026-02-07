'use client';

/**
 * NearWalletContext
 *
 * Wraps @hot-labs/near-connect (NEAR Connect) to give every page access
 * to the connected NEAR wallet.  The wallet can:
 *   – sign and send NEAR transactions (native transfers & ft_transfer_call)
 *   – sign arbitrary messages
 *
 * Usage:
 *   const { accountId, connect, disconnect, signAndSendTransaction, ... } = useNearWallet();
 */

import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useEffect,
  type PropsWithChildren,
} from 'react';

/* ------------------------------------------------------------------ */
/*  Types – manually declared so builds don't break if lib ships no   */
/*  declaration files in the future.                                  */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NearWallet = any; // NearWalletBase from @hot-labs/near-connect
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NearConnectorInstance = any; // NearConnector class instance

interface NearWalletContextValue {
  /** Connected NEAR account id (e.g. "alice.near"), or null */
  accountId: string | null;
  /** Whether the wallet is currently connected */
  isConnected: boolean;
  /** Whether the connector is still initializing (loading manifest, auto-reconnect) */
  isLoading: boolean;
  /** Open the NEAR wallet selector popup */
  connect: () => Promise<void>;
  /** Disconnect the current wallet */
  disconnect: () => Promise<void>;
  /**
   * Sign and send a single NEAR transaction via the connected wallet.
   * Returns the FinalExecutionOutcome (includes `transaction.hash`).
   */
  signAndSendTransaction: (params: {
    receiverId: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    actions: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) => Promise<any>;
  /** The raw wallet instance (for advanced use) */
  wallet: NearWallet | null;
}

const NearWalletContext = createContext<NearWalletContextValue>({
  accountId: null,
  isConnected: false,
  isLoading: true,
  connect: async () => {},
  disconnect: async () => {},
  signAndSendTransaction: async () => { throw new Error('No NEAR wallet connected'); },
  wallet: null,
});

export const useNearWallet = () => useContext(NearWalletContext);

/* ------------------------------------------------------------------ */
/*  Provider                                                          */
/* ------------------------------------------------------------------ */

export function NearWalletProvider({ children }: PropsWithChildren) {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [wallet, setWallet] = useState<NearWallet | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const connectorRef = useRef<NearConnectorInstance | null>(null);
  const initRef = useRef(false);

  /* ---- initialise NearConnector once (client-side only) ---- */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (initRef.current) return;
    initRef.current = true;

    (async () => {
      try {
        // Dynamic import so Next.js never tries to SSR this
        const { NearConnector } = await import('@hot-labs/near-connect');

        const connector = new NearConnector({
          network: 'mainnet',
          // We only need wallets that can sign & send transactions
          features: { signAndSendTransaction: true },
          // Remove HOT branding footer
          footerBranding: null,
        });

        connectorRef.current = connector;

        // Listen for wallet events
        connector.on('wallet:signIn', async (event: { accounts: { accountId: string }[] }) => {
          try {
            const w = await connector.wallet();
            const accts = event.accounts;
            if (accts?.length) {
              setAccountId(accts[0].accountId);
              setWallet(w);
            }
          } catch {
            // ignore
          }
        });

        connector.on('wallet:signOut', () => {
          setAccountId(null);
          setWallet(null);
        });

        // Try to restore previous session (autoConnect is true by default)
        try {
          const w = await connector.wallet();
          const accounts = await w.getAccounts();
          if (accounts?.length) {
            setAccountId(accounts[0].accountId);
            setWallet(w);
          }
        } catch {
          // Not previously connected – that's fine
        }
      } catch (err) {
        console.error('[NearWallet] Failed to initialise NearConnector:', err);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  /* ---- connect ---- */
  const connect = useCallback(async () => {
    const connector = connectorRef.current;
    if (!connector) {
      console.error('[NearWallet] Connector not initialised yet');
      return;
    }
    try {
      await connector.connect();
      // The signIn event handler above will set accountId + wallet
    } catch (err) {
      console.error('[NearWallet] Connect failed:', err);
    }
  }, []);

  /* ---- disconnect ---- */
  const disconnect = useCallback(async () => {
    const connector = connectorRef.current;
    if (!connector) return;
    try {
      await connector.disconnect();
    } catch (err) {
      console.error('[NearWallet] Disconnect failed:', err);
    }
    setAccountId(null);
    setWallet(null);
  }, []);

  /* ---- signAndSendTransaction ---- */
  const signAndSendTransaction = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (params: { receiverId: string; actions: any[] }) => {
      if (!wallet) throw new Error('No NEAR wallet connected');
      return wallet.signAndSendTransaction(params);
    },
    [wallet],
  );

  return (
    <NearWalletContext.Provider
      value={{
        accountId,
        isConnected: !!accountId,
        isLoading,
        connect,
        disconnect,
        signAndSendTransaction,
        wallet,
      }}
    >
      {children}
    </NearWalletContext.Provider>
  );
}
