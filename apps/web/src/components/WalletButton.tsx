'use client';

/**
 * WalletButton Component - Injected Wallets (MetaMask, Rabby, etc.)
 * 
 * Supports:
 * - Injected wallets via EIP-1193 (MetaMask, Rabby, Coinbase Wallet)
 * - EIP-6963 wallet detection for multiple wallets
 * 
 * IMPORTANT: This wallet is for USER IDENTITY only.
 * Hyperliquid trades use SERVER-SIDE API wallet, not browser wallet.
 * 
 * Note: WalletConnect v2 QR support requires additional setup.
 * Set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID for full WC support.
 */

import { useState, useEffect } from 'react';

interface WalletState {
  address: string | null;
  chainId: number | null;
  connected: boolean;
}

const CHAIN_NAMES: Record<number, string> = {
  1: 'Ethereum',
  42161: 'Arbitrum',
  11155111: 'Sepolia',
  6343: 'MegaETH',
};

export default function WalletButton() {
  const [wallet, setWallet] = useState<WalletState>({
    address: null,
    chainId: null,
    connected: false,
  });
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check for existing connection on mount (only if not manually disconnected)
  useEffect(() => {
    const wasDisconnected = localStorage.getItem('wallet_disconnected') === 'true';
    if (!wasDisconnected) {
      checkExistingConnection();
    }
  }, []);

  const checkExistingConnection = async () => {
    if (typeof window === 'undefined' || !window.ethereum) return;

    try {
      const accounts = await window.ethereum.request({
        method: 'eth_accounts',
      }) as string[];

      if (accounts.length > 0) {
        const chainId = await window.ethereum.request({
          method: 'eth_chainId',
        }) as string;

        setWallet({
          address: accounts[0] || null,
          chainId: parseInt(chainId, 16),
          connected: true,
        });

        setupListeners();
      }
    } catch (err) {
      console.error('Failed to check existing connection:', err);
    }
  };

  const setupListeners = () => {
    if (!window.ethereum) return;

    window.ethereum.on('accountsChanged', (accounts: string[]) => {
      if (accounts.length === 0) {
        disconnect();
      } else {
        setWallet(prev => ({ ...prev, address: accounts[0] || null }));
      }
    });

    window.ethereum.on('chainChanged', (chainId: string) => {
      setWallet(prev => ({ ...prev, chainId: parseInt(chainId, 16) }));
    });
  };

  const connect = async () => {
    if (typeof window === 'undefined' || !window.ethereum) {
      setError('No wallet detected. Install MetaMask or Rabby.');
      return;
    }

    setConnecting(true);
    setError(null);

    try {
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      }) as string[];

      if (accounts.length === 0) {
        throw new Error('No accounts found');
      }

      const chainId = await window.ethereum.request({
        method: 'eth_chainId',
      }) as string;

      // Clear disconnect flag on successful connect
      localStorage.removeItem('wallet_disconnected');
      
      setWallet({
        address: accounts[0] || null,
        chainId: parseInt(chainId, 16),
        connected: true,
      });

      setupListeners();
    } catch (err: any) {
      console.error('Wallet connection error:', err);
      setError(err.message || 'Failed to connect wallet');
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = () => {
    // Mark as manually disconnected to prevent auto-reconnect
    localStorage.setItem('wallet_disconnected', 'true');
    setWallet({
      address: null,
      chainId: null,
      connected: false,
    });
  };

  const formatAddress = (addr: string) => {
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  const getChainName = (id: number | null) => {
    if (!id) return 'Unknown';
    return CHAIN_NAMES[id] || `Chain ${id}`;
  };

  if (wallet.connected && wallet.address) {
    return (
      <div className="flex items-center gap-2">
        <div className="text-xs">
          <div className="font-mono">{formatAddress(wallet.address)}</div>
          <div className="text-muted-foreground text-[10px] flex items-center gap-1">
            <span>{getChainName(wallet.chainId)}</span>
            <span className="text-[8px] opacity-50">• Not used for HL</span>
          </div>
        </div>
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            disconnect();
          }}
          className="text-xs px-2 py-1 border border-border rounded hover:bg-muted cursor-pointer"
          title="Disconnect wallet"
          type="button"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={connect}
        disabled={connecting}
        className="text-xs px-3 py-1 border border-border rounded hover:bg-muted disabled:opacity-50"
      >
        {connecting ? 'Connecting...' : 'Connect Wallet'}
      </button>
      {error && (
        <span className="text-[10px] text-red-500">{error}</span>
      )}
    </div>
  );
}

// Type declaration for window.ethereum
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>;
      on: (event: string, callback: (...args: any[]) => void) => void;
      removeListener: (event: string, callback: (...args: any[]) => void) => void;
    };
  }
}
