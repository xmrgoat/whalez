'use client';

/**
 * WalletContext
 * 
 * Global context for wallet connection state and bot selection.
 * Used to protect routes and manage user session.
 */

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

interface WalletState {
  address: string | null;
  isConnected: boolean;
  isConnecting: boolean;
  chainId: number | null;
}

interface BotState {
  id: string | null;
  name: string | null;
  symbol: string | null;
  status: 'STOPPED' | 'RUNNING' | 'PAUSED' | null;
}

interface WalletContextType {
  wallet: WalletState;
  bot: BotState;
  connect: () => Promise<boolean>;
  disconnect: () => void;
  selectBot: (bot: BotState) => void;
  clearBot: () => void;
}

const WalletContext = createContext<WalletContextType | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<WalletState>({
    address: null,
    isConnected: false,
    isConnecting: false,
    chainId: null,
  });

  const [bot, setBot] = useState<BotState>({
    id: null,
    name: null,
    symbol: null,
    status: null,
  });

  // Check for existing connection on mount
  useEffect(() => {
    const checkConnection = async () => {
      if (typeof window === 'undefined' || !window.ethereum) return;

      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts && accounts.length > 0) {
          const chainId = await window.ethereum.request({ method: 'eth_chainId' });
          setWallet({
            address: accounts[0],
            isConnected: true,
            isConnecting: false,
            chainId: parseInt(chainId, 16),
          });
        }
      } catch (error) {
        console.error('Failed to check wallet connection:', error);
      }
    };

    checkConnection();

    // Load saved bot from localStorage
    const savedBot = localStorage.getItem('whalez_selected_bot');
    if (savedBot) {
      try {
        setBot(JSON.parse(savedBot));
      } catch {}
    }
  }, []);

  // Listen for account/chain changes
  useEffect(() => {
    if (typeof window === 'undefined' || !window.ethereum) return;

    const handleAccountsChanged = (accounts: string[]) => {
      if (accounts.length === 0) {
        setWallet(prev => ({ ...prev, address: null, isConnected: false }));
      } else {
        setWallet(prev => ({ ...prev, address: accounts[0], isConnected: true }));
      }
    };

    const handleChainChanged = (chainId: string) => {
      setWallet(prev => ({ ...prev, chainId: parseInt(chainId, 16) }));
    };

    window.ethereum.on('accountsChanged', handleAccountsChanged);
    window.ethereum.on('chainChanged', handleChainChanged);

    return () => {
      window.ethereum?.removeListener('accountsChanged', handleAccountsChanged);
      window.ethereum?.removeListener('chainChanged', handleChainChanged);
    };
  }, []);

  const connect = useCallback(async (): Promise<boolean> => {
    if (typeof window === 'undefined' || !window.ethereum) {
      alert('Please install MetaMask or another Web3 wallet');
      return false;
    }

    setWallet(prev => ({ ...prev, isConnecting: true }));

    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const chainId = await window.ethereum.request({ method: 'eth_chainId' });

      if (accounts && accounts.length > 0) {
        setWallet({
          address: accounts[0],
          isConnected: true,
          isConnecting: false,
          chainId: parseInt(chainId, 16),
        });
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to connect wallet:', error);
      setWallet(prev => ({ ...prev, isConnecting: false }));
      return false;
    }
  }, []);

  const disconnect = useCallback(() => {
    setWallet({
      address: null,
      isConnected: false,
      isConnecting: false,
      chainId: null,
    });
    setBot({ id: null, name: null, symbol: null, status: null });
    localStorage.removeItem('whalez_selected_bot');
  }, []);

  const selectBot = useCallback((newBot: BotState) => {
    setBot(newBot);
    localStorage.setItem('whalez_selected_bot', JSON.stringify(newBot));
  }, []);

  const clearBot = useCallback(() => {
    setBot({ id: null, name: null, symbol: null, status: null });
    localStorage.removeItem('whalez_selected_bot');
  }, []);

  return (
    <WalletContext.Provider value={{ wallet, bot, connect, disconnect, selectBot, clearBot }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}

// Type declaration handled in global.d.ts or WalletButton.tsx
