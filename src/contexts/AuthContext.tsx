'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import {
  ZkLoginSession,
  getZkLoginSession,
  storeZkLoginSession,
  clearZkLoginSession,
  isAuthenticated as checkAuth,
  getBalance,
  formatSuiBalance,
  isSessionEpochValid,
} from '@/lib/zklogin';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  session: ZkLoginSession | null;
  balance: string;
  login: (session: ZkLoginSession) => void;
  logout: () => void;
  refreshBalance: () => Promise<void>;
  checkEpochValidity: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<ZkLoginSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [balance, setBalance] = useState('0');

  // Initialize auth state
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (checkAuth()) {
          const storedSession = getZkLoginSession();
          if (storedSession) {
            // Check if epoch is still valid
            const epochValid = await isSessionEpochValid(storedSession);
            if (epochValid) {
              setSession(storedSession);
              // Fetch balance
              try {
                const bal = await getBalance(storedSession.zkLoginAddress);
                setBalance(formatSuiBalance(bal));
              } catch (e) {
                console.error('Failed to fetch balance:', e);
              }
            } else {
              // Epoch expired, clear session
              clearZkLoginSession();
            }
          }
        }
      } catch (error) {
        console.error('Auth initialization error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();
  }, []);

  const login = useCallback((newSession: ZkLoginSession) => {
    storeZkLoginSession(newSession);
    setSession(newSession);
    // Fetch initial balance
    getBalance(newSession.zkLoginAddress)
      .then((bal) => setBalance(formatSuiBalance(bal)))
      .catch(console.error);
  }, []);

  const logout = useCallback(() => {
    clearZkLoginSession();
    setSession(null);
    setBalance('0');
  }, []);

  const refreshBalance = useCallback(async () => {
    if (session?.zkLoginAddress) {
      try {
        const bal = await getBalance(session.zkLoginAddress);
        setBalance(formatSuiBalance(bal));
      } catch (error) {
        console.error('Failed to refresh balance:', error);
      }
    }
  }, [session]);

  const checkEpochValidity = useCallback(async (): Promise<boolean> => {
    if (!session) return false;
    try {
      const isValid = await isSessionEpochValid(session);
      if (!isValid) {
        logout();
      }
      return isValid;
    } catch {
      return false;
    }
  }, [session, logout]);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: !!session,
        isLoading,
        session,
        balance,
        login,
        logout,
        refreshBalance,
        checkEpochValidity,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
