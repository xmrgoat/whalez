'use client';

import { useState, useEffect } from 'react';
import { 
  setupAgentWallet, 
  getStoredAgentCredentials, 
  storeAgentCredentials,
  clearAgentCredentials,
  type AgentCredentials 
} from '@/lib/hyperliquid-agent';

interface AgentAuthorizationProps {
  walletAddress: string;
  onAuthorized: (credentials: AgentCredentials) => void;
  onRevoked: () => void;
}

export function AgentAuthorization({ walletAddress, onAuthorized, onRevoked }: AgentAuthorizationProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentStatus, setAgentStatus] = useState<{
    hasAgent: boolean;
    agentAddress?: string;
    agentName?: string;
  } | null>(null);

  // Check agent status on mount and when wallet changes
  useEffect(() => {
    checkAgentStatus();
  }, [walletAddress]);

  const checkAgentStatus = async () => {
    // First check local storage
    const stored = getStoredAgentCredentials(walletAddress);
    if (stored) {
      // Re-register with backend (in case backend was restarted)
      try {
        await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/trading/register-agent`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              masterAddress: stored.masterAddress,
              agentAddress: stored.agentAddress,
              agentPrivateKey: stored.agentPrivateKey,
              agentName: stored.agentName,
            }),
          }
        );
        console.log('Agent re-registered with backend');
      } catch (err) {
        console.error('Failed to re-register agent:', err);
      }
      
      setAgentStatus({
        hasAgent: true,
        agentAddress: stored.agentAddress,
        agentName: stored.agentName,
      });
      onAuthorized(stored);
      return;
    }

    // Then check backend
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/trading/agent-status?wallet=${walletAddress}`
      );
      const data = await res.json();
      setAgentStatus(data);
    } catch (err) {
      console.error('Failed to check agent status:', err);
    }
  };

  const handleAuthorize = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const result = await setupAgentWallet(walletAddress, 'WhalezBot');

      if (result.success && result.credentials) {
        // Store locally
        storeAgentCredentials(result.credentials);

        // Register with backend
        await fetch(
          `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/trading/register-agent`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              masterAddress: result.credentials.masterAddress,
              agentAddress: result.credentials.agentAddress,
              agentPrivateKey: result.credentials.agentPrivateKey,
              agentName: result.credentials.agentName,
            }),
          }
        );

        setAgentStatus({
          hasAgent: true,
          agentAddress: result.credentials.agentAddress,
          agentName: result.credentials.agentName,
        });

        onAuthorized(result.credentials);
      } else {
        setError(result.error || 'Failed to authorize agent');
      }
    } catch (err: any) {
      setError(err.message || 'Authorization failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRevoke = async () => {
    setIsLoading(true);
    try {
      // Clear local storage
      clearAgentCredentials(walletAddress);

      // Revoke on backend
      await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/trading/revoke-agent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet: walletAddress }),
        }
      );

      setAgentStatus({ hasAgent: false });
      onRevoked();
    } catch (err) {
      console.error('Failed to revoke agent:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (agentStatus?.hasAgent) {
    return (
      <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm font-medium text-green-400">Trading Authorized</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Agent: {agentStatus.agentAddress?.slice(0, 6)}...{agentStatus.agentAddress?.slice(-4)}
            </p>
          </div>
          <button
            onClick={handleRevoke}
            disabled={isLoading}
            className="px-3 py-1.5 text-xs font-medium rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 disabled:opacity-50"
          >
            {isLoading ? 'Revoking...' : 'Revoke'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
      <div className="mb-3">
        <h3 className="text-sm font-medium text-yellow-400">Authorization Required</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Authorize WhalezBot to trade on your behalf. This creates a secure agent wallet that can only place trades - it cannot withdraw your funds.
        </p>
      </div>

      {error && (
        <div className="mb-3 p-2 rounded bg-red-500/10 border border-red-500/30">
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      <button
        onClick={handleAuthorize}
        disabled={isLoading}
        className="w-full px-4 py-2 text-sm font-medium rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {isLoading ? (
          <span className="flex items-center justify-center gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Authorizing...
          </span>
        ) : (
          'Authorize Trading'
        )}
      </button>

      <p className="text-xs text-muted-foreground mt-2 text-center">
        You will be asked to sign a message with MetaMask
      </p>
    </div>
  );
}

export default AgentAuthorization;
