/**
 * Test script for Hyperliquid real-time stream
 * Run with: npx tsx scripts/test-hl-stream.ts
 * 
 * This script:
 * 1. Connects to Hyperliquid API
 * 2. Fetches initial candles
 * 3. Subscribes to real-time updates
 * 4. Prints 10 updates then exits
 */

import 'dotenv/config';

const HL_HTTP_URL = process.env['HL_HTTP_URL'] || 'https://api.hyperliquid.xyz';
const SYMBOL = 'BTC-PERP';
const TIMEFRAME = '1m';

interface OHLC {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

async function apiRequest(endpoint: string, body: unknown): Promise<any> {
  const response = await fetch(`${HL_HTTP_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json();
}

function parseCandle(data: any): OHLC {
  let timestamp = data.t || data.T || Date.now();
  if (timestamp < 1e12) timestamp *= 1000;

  return {
    timestamp,
    open: parseFloat(data.o || data.O || '0'),
    high: parseFloat(data.h || data.H || '0'),
    low: parseFloat(data.l || data.L || '0'),
    close: parseFloat(data.c || data.C || '0'),
    volume: parseFloat(data.v || data.V || '0'),
  };
}

function formatCandle(candle: OHLC): string {
  const date = new Date(candle.timestamp).toISOString();
  return `[${date}] O:${candle.open.toFixed(2)} H:${candle.high.toFixed(2)} L:${candle.low.toFixed(2)} C:${candle.close.toFixed(2)} V:${candle.volume.toFixed(2)}`;
}

async function main() {
  console.log('\n🔍 Hyperliquid Stream Test');
  console.log('='.repeat(60));
  console.log(`Symbol: ${SYMBOL}`);
  console.log(`Timeframe: ${TIMEFRAME}`);
  console.log(`API: ${HL_HTTP_URL}`);
  console.log('='.repeat(60));

  // Step 1: Fetch initial candles
  console.log('\n📊 Fetching initial candles...');
  const now = Date.now();
  const from = now - 60 * 60 * 1000; // Last hour

  try {
    const response = await apiRequest('/info', {
      type: 'candleSnapshot',
      req: {
        coin: 'BTC',
        interval: TIMEFRAME,
        startTime: from,
        endTime: now,
      },
    });

    if (!Array.isArray(response)) {
      console.error('❌ Invalid response format');
      process.exit(1);
    }

    const candles = response.map(parseCandle);
    console.log(`✅ Received ${candles.length} candles`);

    if (candles.length > 0) {
      console.log('\nLast 5 candles:');
      const last5 = candles.slice(-5);
      for (const candle of last5) {
        console.log(`  ${formatCandle(candle)}`);
      }
    }

    // Step 2: Poll for updates (simulating real-time)
    console.log('\n📡 Starting real-time polling (10 updates)...');
    console.log('(Press Ctrl+C to stop)\n');

    let updateCount = 0;
    let lastCandle: OHLC | null = candles[candles.length - 1] || null;

    const pollInterval = setInterval(async () => {
      try {
        const pollResponse = await apiRequest('/info', {
          type: 'candleSnapshot',
          req: {
            coin: 'BTC',
            interval: TIMEFRAME,
            startTime: Date.now() - 5 * 60 * 1000,
            endTime: Date.now(),
          },
        });

        if (Array.isArray(pollResponse) && pollResponse.length > 0) {
          const latestCandle = parseCandle(pollResponse[pollResponse.length - 1]);
          
          // Check if candle changed
          const isNew = !lastCandle || lastCandle.timestamp !== latestCandle.timestamp;
          const isUpdated = lastCandle && (
            lastCandle.close !== latestCandle.close ||
            lastCandle.high !== latestCandle.high ||
            lastCandle.low !== latestCandle.low
          );

          if (isNew || isUpdated) {
            updateCount++;
            const status = isNew ? '🆕 NEW' : '🔄 UPD';
            console.log(`${status} #${updateCount}: ${formatCandle(latestCandle)}`);
            lastCandle = latestCandle;
          }

          if (updateCount >= 10) {
            clearInterval(pollInterval);
            console.log('\n✅ Test complete! Received 10 updates.');
            console.log('\n📋 Summary:');
            console.log(`  - Initial candles: ${candles.length}`);
            console.log(`  - Real-time updates: ${updateCount}`);
            console.log(`  - Last price: $${latestCandle.close.toLocaleString()}`);
            process.exit(0);
          }
        }
      } catch (error) {
        console.error('Poll error:', error);
      }
    }, 1000);

    // Timeout after 2 minutes
    setTimeout(() => {
      clearInterval(pollInterval);
      console.log('\n⏱️ Timeout reached (2 minutes)');
      console.log(`  - Updates received: ${updateCount}`);
      process.exit(0);
    }, 120000);

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
