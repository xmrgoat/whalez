/**
 * Test script for Hyperliquid trading
 * Run with: npx tsx --env-file=.env scripts/test-hl-trade.ts
 */

import { Hyperliquid } from 'hyperliquid';

async function main() {
  const privateKey = process.env.HL_PRIVATE_KEY;
  const testnet = process.env.HL_NETWORK === 'testnet';

  if (!privateKey) {
    console.error('❌ HL_PRIVATE_KEY not set');
    process.exit(1);
  }

  console.log('🔑 Private key:', privateKey.substring(0, 10) + '...');
  console.log('🌐 Network:', testnet ? 'testnet' : 'mainnet');

  try {
    // Initialize SDK
    console.log('\n📡 Initializing Hyperliquid SDK...');
    const sdk = new Hyperliquid({
      privateKey,
      testnet,
    });

    // Connect
    await sdk.connect();
    console.log('✅ Connected to Hyperliquid');

    // Get account info
    console.log('\n📊 Getting account info...');
    const info = await sdk.info.perpetuals.getClearinghouseState(
      process.env.HL_ACCOUNT_ADDRESS || ''
    );
    console.log('Account Value:', info.marginSummary?.accountValue);
    console.log('Withdrawable:', info.withdrawable);

    // Get current BTC price
    console.log('\n💰 Getting BTC price...');
    const mids = await sdk.info.perpetuals.getAllMids();
    const btcPrice = parseFloat(mids['BTC'] || '0');
    console.log('BTC Price:', btcPrice);

    // Test order (very small size)
    console.log('\n🧪 Placing test BUY order (0.001 BTC)...');
    
    const orderResult = await sdk.exchange.placeOrder({
      coin: 'BTC',
      is_buy: true,
      sz: 0.001,
      limit_px: btcPrice * 0.99, // Limit order 1% below market (won't fill immediately)
      order_type: { limit: { tif: 'Gtc' } },
      reduce_only: false,
    });

    console.log('Order result:', JSON.stringify(orderResult, null, 2));

    if (orderResult.status === 'ok') {
      console.log('✅ Order placed successfully!');
      
      // Cancel the order immediately
      const statuses = orderResult.response?.data?.statuses;
      if (statuses && statuses[0]?.resting?.oid) {
        const oid = statuses[0].resting.oid;
        console.log(`\n🔄 Cancelling order ${oid}...`);
        
        const cancelResult = await sdk.exchange.cancelOrder({
          coin: 'BTC',
          o: oid,
        });
        console.log('Cancel result:', JSON.stringify(cancelResult, null, 2));
      }
    } else {
      console.log('❌ Order failed:', orderResult);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

main();
