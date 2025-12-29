/**
 * Hyperliquid Agent Wallet Module
 * 
 * This module handles the Agent Wallet authorization flow:
 * 1. Generate a new agent wallet (keypair)
 * 2. User signs approveAgent with MetaMask
 * 3. Send the approval to Hyperliquid
 * 4. Store the agent credentials for trading
 * 
 * The agent wallet can then trade on behalf of the user without
 * the user sharing their private key.
 */

import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { signUserSignedAction, type AbstractWallet } from '@nktkas/hyperliquid/signing';
import { ApproveAgentTypes } from '@nktkas/hyperliquid/api/exchange';

const HL_API_URL = 'https://api.hyperliquid.xyz';

export interface AgentCredentials {
  agentAddress: string;
  agentPrivateKey: string;
  masterAddress: string;
  agentName: string;
  approvedAt: number;
}

/**
 * Generate a new agent wallet keypair
 */
export function generateAgentWallet(): { address: string; privateKey: string } {
  const privateKey = generatePrivateKey();
  const account = privateKeyToAccount(privateKey);
  return {
    address: account.address,
    privateKey: privateKey,
  };
}

/**
 * Create a wallet adapter for MetaMask that implements AbstractWallet
 */
function createMetaMaskWallet(userAddress: string): AbstractWallet {
  return {
    address: userAddress as `0x${string}`,
    signTypedData: async (params: any) => {
      const signature = await window.ethereum!.request({
        method: 'eth_signTypedData_v4',
        params: [userAddress, JSON.stringify({
          types: params.types,
          primaryType: params.primaryType,
          domain: params.domain,
          message: params.message,
        })],
      });
      return signature as `0x${string}`;
    },
  };
}

/**
 * Request user to approve an agent wallet via MetaMask
 * This allows the agent to trade on behalf of the user
 */
export async function approveAgentWithMetaMask(
  userAddress: string,
  agentAddress: string,
  agentName: string = 'WhalezBot'
): Promise<{ success: boolean; signature?: any; error?: string }> {
  try {
    if (!window.ethereum) {
      return { success: false, error: 'MetaMask not found' };
    }

    const nonce = Date.now();
    const wallet = createMetaMaskWallet(userAddress);

    // Create the action for approveAgent
    const action = {
      type: 'approveAgent' as const,
      hyperliquidChain: 'Mainnet' as const,
      signatureChainId: '0xa4b1' as `0x${string}`, // Arbitrum mainnet
      agentAddress: agentAddress as `0x${string}`,
      agentName: agentName || null,
      nonce: nonce,
    };

    // Sign using the SDK
    const signature = await signUserSignedAction({
      wallet,
      action: action as any,
      types: ApproveAgentTypes,
    });

    // Send the approval to Hyperliquid
    const response = await fetch(`${HL_API_URL}/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        nonce,
        signature,
      }),
    });
    
    console.log('ApproveAgent request:', { action, nonce, signature });

    const responseText = await response.text();
    console.log('ApproveAgent response:', responseText);
    
    let result;
    try {
      result = JSON.parse(responseText);
    } catch {
      return { success: false, error: `Invalid response: ${responseText}` };
    }

    if (result.status === 'ok') {
      return { success: true, signature };
    } else {
      return { success: false, error: result.response || JSON.stringify(result) };
    }
  } catch (error: any) {
    console.error('Approve agent error:', error);
    if (error.code === 4001) {
      return { success: false, error: 'User rejected the signature request' };
    }
    return { success: false, error: error.message };
  }
}

/**
 * Full flow: Generate agent, get approval, return credentials
 */
export async function setupAgentWallet(
  userAddress: string,
  agentName: string = 'WhalezBot'
): Promise<{ success: boolean; credentials?: AgentCredentials; error?: string }> {
  try {
    // Step 1: Generate new agent wallet
    const agentWallet = generateAgentWallet();
    console.log('Generated agent wallet:', agentWallet.address);

    // Step 2: Get user approval via MetaMask
    const approval = await approveAgentWithMetaMask(
      userAddress,
      agentWallet.address,
      agentName
    );

    if (!approval.success) {
      return { success: false, error: approval.error };
    }

    // Step 3: Return credentials
    const credentials: AgentCredentials = {
      agentAddress: agentWallet.address,
      agentPrivateKey: agentWallet.privateKey,
      masterAddress: userAddress,
      agentName: agentName,
      approvedAt: Date.now(),
    };

    return { success: true, credentials };
  } catch (error: any) {
    console.error('Setup agent wallet error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Check if user has an active agent wallet stored
 */
export function getStoredAgentCredentials(userAddress: string): AgentCredentials | null {
  try {
    const stored = localStorage.getItem(`hl_agent_${userAddress.toLowerCase()}`);
    if (stored) {
      return JSON.parse(stored);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Store agent credentials locally
 */
export function storeAgentCredentials(credentials: AgentCredentials): void {
  localStorage.setItem(
    `hl_agent_${credentials.masterAddress.toLowerCase()}`,
    JSON.stringify(credentials)
  );
}

/**
 * Clear stored agent credentials
 */
export function clearAgentCredentials(userAddress: string): void {
  localStorage.removeItem(`hl_agent_${userAddress.toLowerCase()}`);
}
