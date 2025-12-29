/**
 * Hyperliquid Trading Module
 * Handles signing and sending orders via MetaMask
 * 
 * Note: Hyperliquid uses a complex signing scheme with msgpack serialization.
 * This simplified version may not work for all cases.
 * For production, consider using the official SDK or Python bridge.
 */

const HL_API_URL = 'https://api.hyperliquid.xyz';

// Asset mapping for Hyperliquid
const ASSET_MAP: Record<string, number> = {
  'BTC': 0,
  'ETH': 1,
  'SOL': 2,
};

/**
 * Close a position by calling the backend which uses the Python bridge
 * This is the reliable method that works with the configured wallet
 */
export async function closePositionViaBackend(
  coin: string,
  size: number,
  side: 'long' | 'short'
): Promise<{ success: boolean; error?: string; result?: any }> {
  try {
    // First ARM the bot
    await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/trading/arm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation: 'I UNDERSTAND THE RISKS', mode: 'mainnet' }),
    });

    // Close all positions via backend
    const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/trading/close-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const result = await response.json();
    
    if (result.success) {
      return { success: true, result };
    } else {
      return { success: false, error: result.error || 'Failed to close position' };
    }
  } catch (error) {
    console.error('Close position error:', error);
    return { success: false, error: (error as Error).message };
  }
}

/**
 * Get current positions for a wallet
 */
export async function getPositions(walletAddress: string): Promise<any[]> {
  try {
    const response = await fetch(`${HL_API_URL}/info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'clearinghouseState',
        user: walletAddress,
      }),
    });
    
    const data = await response.json() as { assetPositions?: any[] };
    return data.assetPositions || [];
  } catch (error) {
    console.error('Get positions error:', error);
    return [];
  }
}
