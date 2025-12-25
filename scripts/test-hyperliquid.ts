/**
 * Test script for Hyperliquid testnet connection
 * Run with: npx tsx scripts/test-hyperliquid.ts
 */

import 'dotenv/config';

const HL_HTTP_URL = process.env['HL_HTTP_URL'] || 'https://api.hyperliquid-testnet.xyz';
const HL_ACCOUNT_ADDRESS = process.env['HL_ACCOUNT_ADDRESS'] || '';

interface TestResult {
  name: string;
  success: boolean;
  data?: unknown;
  error?: string;
  latency?: number;
}

async function testEndpoint(name: string, fn: () => Promise<unknown>): Promise<TestResult> {
  const start = Date.now();
  try {
    const data = await fn();
    return { name, success: true, data, latency: Date.now() - start };
  } catch (error) {
    return { name, success: false, error: (error as Error).message, latency: Date.now() - start };
  }
}

async function apiRequest(endpoint: string, body: unknown): Promise<unknown> {
  const response = await fetch(`${HL_HTTP_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  return response.json();
}

async function runTests() {
  console.log('\n🔍 Hyperliquid Testnet Connection Test');
  console.log('='.repeat(50));
  console.log(`URL: ${HL_HTTP_URL}`);
  console.log(`Account: ${HL_ACCOUNT_ADDRESS || '(not configured)'}`);
  console.log('='.repeat(50));

  const results: TestResult[] = [];

  // Test 1: Get meta info (available assets)
  results.push(await testEndpoint('Meta Info (Assets)', async () => {
    const data = await apiRequest('/info', { type: 'meta' }) as { universe: unknown[] };
    return { assetCount: data.universe?.length || 0 };
  }));

  // Test 2: Get BTC-PERP ticker
  results.push(await testEndpoint('BTC Ticker', async () => {
    const data = await apiRequest('/info', { type: 'allMids' }) as Record<string, string>;
    return { BTC: data['BTC'], ETH: data['ETH'] };
  }));

  // Test 3: Get candles
  results.push(await testEndpoint('BTC Candles (1h)', async () => {
    const data = await apiRequest('/info', {
      type: 'candleSnapshot',
      req: {
        coin: 'BTC',
        interval: '1h',
        startTime: Date.now() - 24 * 60 * 60 * 1000,
        endTime: Date.now(),
      },
    }) as unknown[];
    return { candleCount: data.length };
  }));

  // Test 4: Get funding rate
  results.push(await testEndpoint('Funding Rates', async () => {
    const data = await apiRequest('/info', { type: 'metaAndAssetCtxs' }) as [unknown, unknown[]];
    const btcCtx = data[1]?.[0] as { funding?: string } | undefined;
    return { btcFunding: btcCtx?.funding || 'N/A' };
  }));

  // Test 5: Account info (if address configured)
  if (HL_ACCOUNT_ADDRESS) {
    results.push(await testEndpoint('Account Info', async () => {
      const data = await apiRequest('/info', {
        type: 'clearinghouseState',
        user: HL_ACCOUNT_ADDRESS,
      }) as { marginSummary?: { accountValue?: string } };
      return { 
        equity: data.marginSummary?.accountValue || '0',
      };
    }));
  }

  // Print results
  console.log('\n📊 Test Results:');
  console.log('-'.repeat(50));
  
  let passed = 0;
  let failed = 0;

  for (const result of results) {
    const status = result.success ? '✅' : '❌';
    const latency = result.latency ? `(${result.latency}ms)` : '';
    console.log(`${status} ${result.name} ${latency}`);
    
    if (result.success && result.data) {
      console.log(`   └─ ${JSON.stringify(result.data)}`);
      passed++;
    } else if (result.error) {
      console.log(`   └─ Error: ${result.error}`);
      failed++;
    }
  }

  console.log('-'.repeat(50));
  console.log(`\n📈 Summary: ${passed} passed, ${failed} failed`);
  
  if (failed === 0) {
    console.log('✅ All tests passed! Hyperliquid testnet connection is working.\n');
  } else {
    console.log('⚠️ Some tests failed. Check your configuration.\n');
  }

  // Config verification
  console.log('📋 Configuration Check:');
  console.log(`   HL_NETWORK: ${process.env['HL_NETWORK'] || 'not set'}`);
  console.log(`   HL_HTTP_URL: ${process.env['HL_HTTP_URL'] || 'not set (using default)'}`);
  console.log(`   HL_WS_URL: ${process.env['HL_WS_URL'] || 'not set'}`);
  console.log(`   HL_ACCOUNT_ADDRESS: ${HL_ACCOUNT_ADDRESS ? '✓ configured' : '✗ not set'}`);
  console.log(`   HL_PRIVATE_KEY: ${process.env['HL_PRIVATE_KEY'] ? '✓ configured' : '✗ not set (required for trading)'}`);
  console.log(`   LIVE_TRADING_ENABLED: ${process.env['LIVE_TRADING_ENABLED'] || 'false'}`);
  console.log('');
}

runTests().catch(console.error);
