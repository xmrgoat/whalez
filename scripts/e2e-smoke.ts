/**
 * E2E Smoke Test
 * 
 * Verifies the full system is working:
 * 1. API is running and connected to Hyperliquid
 * 2. WebSocket is streaming candles
 * 3. Candles are updating in real-time
 * 4. Database is accessible
 * 
 * Run: pnpm e2e:smoke
 */

import 'dotenv/config';

const API_URL = process.env['API_URL'] || 'http://localhost:3001';
const TIMEOUT_MS = 60000; // 1 minute max
const CHECK_INTERVAL_MS = 5000; // Check every 5 seconds

interface DebugState {
  wsConnected: boolean;
  wsDelayed: boolean;
  wsLatencyMs: number;
  lastCandleTs: number;
  lastCandleAge: number | null;
  lastSignalTs: number;
  candleCount: number;
  dbTradesCount: number;
  dbSignalsCount: number;
  checks: {
    wsConnected: boolean;
    candlesFlowing: boolean;
    dbAccessible: boolean;
  };
}

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  value?: any;
}

const results: TestResult[] = [];

function log(msg: string) {
  console.log(`[E2E] ${new Date().toISOString().slice(11, 19)} ${msg}`);
}

function pass(name: string, message: string, value?: any) {
  results.push({ name, passed: true, message, value });
  log(`✅ ${name}: ${message}`);
}

function fail(name: string, message: string, value?: any) {
  results.push({ name, passed: false, message, value });
  log(`❌ ${name}: ${message}`);
}

async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/health`);
    if (!res.ok) {
      fail('API Health', `HTTP ${res.status}`);
      return false;
    }
    const data = await res.json() as { status: string };
    if (data.status === 'ok') {
      pass('API Health', 'API is running');
      return true;
    }
    fail('API Health', `Unexpected status: ${data.status}`);
    return false;
  } catch (error: any) {
    fail('API Health', `Connection failed: ${error.message}`);
    return false;
  }
}

async function getDebugState(): Promise<DebugState | null> {
  try {
    const res = await fetch(`${API_URL}/debug/state`);
    if (!res.ok) {
      return null;
    }
    return await res.json() as DebugState;
  } catch {
    return null;
  }
}

async function checkMarketCandles(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/market/candles?symbol=BTC-PERP&timeframe=1m&limit=5`);
    if (!res.ok) {
      fail('Market Candles', `HTTP ${res.status}`);
      return false;
    }
    const data = await res.json() as { candles: any[]; count: number };
    if (data.candles && data.candles.length > 0) {
      const lastCandle = data.candles[data.candles.length - 1];
      pass('Market Candles', `Received ${data.count} candles, last close: $${lastCandle.close}`);
      return true;
    }
    fail('Market Candles', 'No candles received');
    return false;
  } catch (error: any) {
    fail('Market Candles', `Error: ${error.message}`);
    return false;
  }
}

async function waitForCondition(
  name: string,
  check: () => Promise<boolean>,
  timeoutMs: number = TIMEOUT_MS
): Promise<boolean> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    if (await check()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, CHECK_INTERVAL_MS));
  }
  
  fail(name, `Timeout after ${timeoutMs / 1000}s`);
  return false;
}

async function runTests() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 WHALEZ E2E SMOKE TEST');
  console.log('='.repeat(60) + '\n');

  log(`API URL: ${API_URL}`);
  log(`Timeout: ${TIMEOUT_MS / 1000}s`);
  console.log('');

  // Test 1: API Health
  log('Testing API health...');
  if (!await checkHealth()) {
    console.log('\n❌ API not running. Start with: pnpm --filter @whalez/api dev\n');
    process.exit(1);
  }

  // Test 2: Market Candles (REST)
  log('Testing market candles endpoint...');
  await checkMarketCandles();

  // Test 3: WebSocket Connection
  log('Checking WebSocket connection to Hyperliquid...');
  const state1 = await getDebugState();
  if (state1) {
    if (state1.wsConnected) {
      pass('WS Connected', 'WebSocket connected to Hyperliquid');
    } else {
      fail('WS Connected', 'WebSocket not connected');
    }
  } else {
    fail('Debug State', 'Could not fetch debug state');
  }

  // Test 4: Candles Flowing (wait for updates)
  log('Waiting for real-time candle updates...');
  const initialState = await getDebugState();
  const initialCandleCount = initialState?.candleCount || 0;

  const candlesFlowing = await waitForCondition(
    'Candles Flowing',
    async () => {
      const state = await getDebugState();
      if (!state) return false;
      
      const newCandles = state.candleCount - initialCandleCount;
      if (newCandles > 0) {
        pass('Candles Flowing', `Received ${newCandles} new candles since start`);
        return true;
      }
      log(`  Waiting... (${state.candleCount} candles total)`);
      return false;
    },
    30000 // 30 second timeout for candle flow
  );

  // Test 5: Database Access
  log('Checking database access...');
  const state2 = await getDebugState();
  if (state2) {
    if (state2.checks.dbAccessible) {
      pass('DB Access', `Database accessible (${state2.dbTradesCount} trades, ${state2.dbSignalsCount} signals)`);
    } else {
      fail('DB Access', 'Database not accessible');
    }
  }

  // Test 6: Last Candle Age
  log('Checking candle freshness...');
  const state3 = await getDebugState();
  if (state3 && state3.lastCandleAge !== null) {
    if (state3.lastCandleAge < 120000) { // Less than 2 minutes old
      pass('Candle Freshness', `Last candle ${Math.round(state3.lastCandleAge / 1000)}s ago`);
    } else {
      fail('Candle Freshness', `Last candle ${Math.round(state3.lastCandleAge / 1000)}s ago (stale)`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;

  console.log('');
  for (const result of results) {
    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} ${result.name}: ${result.message}`);
  }

  console.log('');
  console.log(`Passed: ${passed}/${total}`);
  console.log(`Failed: ${failed}/${total}`);
  console.log('');

  if (failed > 0) {
    console.log('❌ SMOKE TEST FAILED\n');
    process.exit(1);
  } else {
    console.log('✅ SMOKE TEST PASSED\n');
    process.exit(0);
  }
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
