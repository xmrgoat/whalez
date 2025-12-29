#!/usr/bin/env python3
"""
Hyperliquid Bridge Script
Called from Node.js to execute trades using the official Python SDK.

Usage:
  python hl_bridge.py order BTC buy 0.001 [price]
  python hl_bridge.py cancel BTC <oid>
  python hl_bridge.py positions
  python hl_bridge.py balance
  
With agent wallet (for user wallets):
  python hl_bridge.py --agent-key=<key> --master=<addr> order BTC buy 0.001
  python hl_bridge.py --agent-key=<key> --master=<addr> close_all
"""

import sys
import os
import json
from dotenv import load_dotenv

# Load .env file
load_dotenv()

from hyperliquid.info import Info
from hyperliquid.exchange import Exchange
from hyperliquid.utils import constants
from eth_account import Account

# Global variables for agent wallet override
AGENT_PRIVATE_KEY = None
MASTER_ADDRESS = None

def parse_agent_args():
    """Parse --agent-key and --master arguments"""
    global AGENT_PRIVATE_KEY, MASTER_ADDRESS
    
    new_argv = []
    for arg in sys.argv:
        if arg.startswith("--agent-key="):
            AGENT_PRIVATE_KEY = arg.split("=", 1)[1]
        elif arg.startswith("--master="):
            MASTER_ADDRESS = arg.split("=", 1)[1]
        else:
            new_argv.append(arg)
    
    sys.argv = new_argv

def get_exchange():
    """Get exchange instance - uses agent wallet if provided, otherwise env vars"""
    global AGENT_PRIVATE_KEY, MASTER_ADDRESS
    
    # Use agent wallet if provided
    if AGENT_PRIVATE_KEY and MASTER_ADDRESS:
        wallet = Account.from_key(AGENT_PRIVATE_KEY)
        exchange = Exchange(wallet, constants.MAINNET_API_URL, account_address=MASTER_ADDRESS)
        return exchange, None
    
    # Fallback to env vars
    private_key = os.getenv("HL_PRIVATE_KEY")
    account_address = os.getenv("HL_ACCOUNT_ADDRESS")
    
    if not private_key:
        return None, "HL_PRIVATE_KEY not set"
    
    wallet = Account.from_key(private_key)
    exchange = Exchange(wallet, constants.MAINNET_API_URL, account_address=account_address)
    return exchange, None

def get_account_address():
    """Get the account address to use for balance/position queries"""
    global MASTER_ADDRESS
    # Always use MASTER_ADDRESS if provided (user's connected wallet)
    if MASTER_ADDRESS:
        return MASTER_ADDRESS
    # Fallback to env var
    return os.getenv("HL_ACCOUNT_ADDRESS")

def get_info():
    return Info(constants.MAINNET_API_URL, skip_ws=True)

def cmd_balance():
    info = get_info()
    account_address = get_account_address()
    state = info.user_state(account_address)
    
    result = {
        "success": True,
        "accountValue": state.get("marginSummary", {}).get("accountValue", "0"),
        "withdrawable": state.get("withdrawable", "0"),
    }
    print(json.dumps(result))

def cmd_positions():
    info = get_info()
    account_address = get_account_address()
    state = info.user_state(account_address)
    
    positions = []
    for pos in state.get("assetPositions", []):
        p = pos.get("position", {})
        if float(p.get("szi", "0")) != 0:
            positions.append({
                "symbol": p.get("coin", ""),
                "size": float(p.get("szi", "0")),
                "entryPx": float(p.get("entryPx", "0")),
                "unrealizedPnl": float(p.get("unrealizedPnl", "0")),
                "leverage": p.get("leverage", {}).get("value", 1),
            })
    
    result = {"success": True, "positions": positions}
    print(json.dumps(result))

def cmd_order(coin, side, size, price=None):
    exchange, error = get_exchange()
    if error:
        print(json.dumps({"success": False, "error": error}))
        return
    
    info = get_info()
    is_buy = side.lower() == "buy"
    size = float(size)
    
    # Size decimals per asset (from Hyperliquid docs)
    SZ_DECIMALS = {
        'BTC': 4, 'ETH': 3, 'SOL': 2, 'XRP': 0, 'BNB': 2, 'DOGE': 0,
        'ADA': 0, 'AVAX': 2, 'DOT': 1, 'LINK': 1, 'LTC': 2, 'BCH': 2,
        'MATIC': 0, 'ARB': 0, 'OP': 0, 'SUI': 0, 'APT': 1, 'ATOM': 1,
        'UNI': 1, 'NEAR': 0, 'FIL': 1, 'AAVE': 2, 'INJ': 1, 'TIA': 1,
        'SEI': 0, 'FTM': 0, 'MKR': 3, 'TON': 1, 'TRX': 0, 'ETC': 1,
        'HYPE': 1, 'MEGA': 0, 'PEPE': 0, 'WIF': 0, 'BONK': 0, 'TAO': 2,
    }
    sz_decimals = SZ_DECIMALS.get(coin, 2)
    size = round(size, sz_decimals)
    if sz_decimals == 0:
        size = int(size)
    
    # Get current price if not provided
    if price is None or price == "market":
        all_mids = info.all_mids()
        current_price = float(all_mids.get(coin, 0))
        # For market orders, use IOC with a price slightly worse than market
        if is_buy:
            price = round(current_price * 1.001)  # 0.1% above for buy
        else:
            price = round(current_price * 0.999)  # 0.1% below for sell
        order_type = {"limit": {"tif": "Ioc"}}  # Immediate or cancel
    elif price == "limit_open":
        # Place a limit order that will stay open (for testing)
        all_mids = info.all_mids()
        current_price = float(all_mids.get(coin, 0))
        if is_buy:
            price = round(current_price * 0.95)  # 5% below for buy limit
        else:
            price = round(current_price * 1.05)  # 5% above for sell limit
        order_type = {"limit": {"tif": "Gtc"}}  # Good till cancel
    else:
        # Keep price precision based on value
        price_float = float(price)
        if price_float < 1:
            price = round(price_float, 5)  # 5 decimals for very cheap assets
        elif price_float < 10:
            price = round(price_float, 4)  # 4 decimals
        elif price_float < 100:
            price = round(price_float, 3)  # 3 decimals
        elif price_float < 1000:
            price = round(price_float, 2)  # 2 decimals
        else:
            price = round(price_float, 1)  # 1 decimal for expensive assets
        order_type = {"limit": {"tif": "Gtc"}}
    
    try:
        result = exchange.order(coin, is_buy, size, price, order_type)
        
        if result.get("status") == "ok":
            statuses = result.get("response", {}).get("data", {}).get("statuses", [])
            if statuses:
                status = statuses[0]
                if status.get("error"):
                    print(json.dumps({"success": False, "error": status["error"]}))
                elif status.get("filled"):
                    print(json.dumps({
                        "success": True,
                        "filled": True,
                        "oid": status["filled"].get("oid"),
                        "avgPx": status["filled"].get("avgPx"),
                        "totalSz": status["filled"].get("totalSz"),
                    }))
                elif status.get("resting"):
                    print(json.dumps({
                        "success": True,
                        "filled": False,
                        "oid": status["resting"].get("oid"),
                    }))
                else:
                    print(json.dumps({"success": True, "status": status}))
            else:
                print(json.dumps({"success": True, "result": result}))
        else:
            print(json.dumps({"success": False, "error": str(result)}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))

def cmd_cancel(coin, oid):
    exchange, error = get_exchange()
    if error:
        print(json.dumps({"success": False, "error": error}))
        return
    
    try:
        result = exchange.cancel(coin, int(oid))
        if result.get("status") == "ok":
            print(json.dumps({"success": True}))
        else:
            print(json.dumps({"success": False, "error": str(result)}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))

def cmd_close_all():
    exchange, error = get_exchange()
    if error:
        print(json.dumps({"success": False, "error": error}))
        return
    
    info = get_info()
    account_address = get_account_address()
    state = info.user_state(account_address)
    
    closed = []
    for pos in state.get("assetPositions", []):
        p = pos.get("position", {})
        size = float(p.get("szi", "0"))
        if size != 0:
            coin = p.get("coin", "")
            is_buy = size < 0  # Close by doing opposite
            abs_size = abs(size)
            
            all_mids = info.all_mids()
            current_price = float(all_mids.get(coin, 0))
            if is_buy:
                price = round(current_price * 1.001)
            else:
                price = round(current_price * 0.999)
            
            try:
                result = exchange.order(coin, is_buy, abs_size, price, {"limit": {"tif": "Ioc"}})
                closed.append({"coin": coin, "size": abs_size, "result": result.get("status")})
            except Exception as e:
                closed.append({"coin": coin, "size": abs_size, "error": str(e)})
    
    print(json.dumps({"success": True, "closed": closed}))

def cmd_trigger(coin, side, size, trigger_type, trigger_price):
    """Place a trigger order (stop loss or take profit)
    
    Args:
        coin: The coin symbol (e.g., 'BTC')
        side: 'buy' or 'sell' (opposite of position side)
        size: Position size to close
        trigger_type: 'sl' for stop loss, 'tp' for take profit
        trigger_price: Price at which to trigger the order
    """
    exchange, error = get_exchange()
    if error:
        print(json.dumps({"success": False, "error": error}))
        return
    
    info = get_info()
    is_buy = side.lower() == "buy"
    size = float(size)
    trigger_price = float(trigger_price)
    
    # Size decimals per asset
    SZ_DECIMALS = {
        'BTC': 4, 'ETH': 3, 'SOL': 2, 'XRP': 0, 'BNB': 2, 'DOGE': 0,
        'ADA': 0, 'AVAX': 2, 'DOT': 1, 'LINK': 1, 'LTC': 2, 'BCH': 2,
        'MATIC': 0, 'ARB': 0, 'OP': 0, 'SUI': 0, 'APT': 1, 'ATOM': 1,
        'UNI': 1, 'NEAR': 0, 'FIL': 1, 'AAVE': 2, 'INJ': 1, 'TIA': 1,
        'SEI': 0, 'FTM': 0, 'MKR': 3, 'TON': 1, 'TRX': 0, 'ETC': 1,
        'HYPE': 1, 'MEGA': 0, 'PEPE': 0, 'WIF': 0, 'BONK': 0, 'TAO': 2,
    }
    sz_decimals = SZ_DECIMALS.get(coin, 2)
    size = round(size, sz_decimals)
    if sz_decimals == 0:
        size = int(size)
    
    # Round trigger price appropriately
    if trigger_price < 1:
        trigger_price = round(trigger_price, 5)
    elif trigger_price < 10:
        trigger_price = round(trigger_price, 4)
    elif trigger_price < 100:
        trigger_price = round(trigger_price, 3)
    elif trigger_price < 1000:
        trigger_price = round(trigger_price, 2)
    else:
        trigger_price = round(trigger_price, 1)
    
    try:
        # Determine trigger condition based on order type and side
        # For SL: trigger when price goes against us
        # For TP: trigger when price goes in our favor
        if trigger_type.lower() == 'sl':
            # Stop Loss: for a LONG position (we sell to close), trigger when price drops below trigger_price
            # For a SHORT position (we buy to close), trigger when price rises above trigger_price
            is_trigger_above = is_buy  # If we're buying to close (SHORT), trigger above
            tpsl = "sl"
        else:  # tp
            # Take Profit: for a LONG position (we sell to close), trigger when price rises above trigger_price
            # For a SHORT position (we buy to close), trigger when price drops below trigger_price
            is_trigger_above = not is_buy  # If we're selling to close (LONG), trigger above
            tpsl = "tp"
        
        # Use the order method with trigger order type
        # Hyperliquid trigger order format
        order_type = {
            "trigger": {
                "triggerPx": trigger_price,
                "isMarket": True,  # Execute as market order when triggered
                "tpsl": tpsl
            }
        }
        
        result = exchange.order(coin, is_buy, size, trigger_price, order_type, reduce_only=True)
        
        if result.get("status") == "ok":
            statuses = result.get("response", {}).get("data", {}).get("statuses", [])
            if statuses:
                status = statuses[0]
                if status.get("error"):
                    print(json.dumps({"success": False, "error": status["error"]}))
                elif status.get("resting"):
                    print(json.dumps({
                        "success": True,
                        "oid": status["resting"].get("oid"),
                        "triggerType": trigger_type,
                        "triggerPrice": trigger_price,
                    }))
                else:
                    print(json.dumps({"success": True, "status": status}))
            else:
                print(json.dumps({"success": True, "result": result}))
        else:
            print(json.dumps({"success": False, "error": str(result)}))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))

def cmd_open_orders():
    """Get all open orders for the account"""
    info = get_info()
    account_address = get_account_address()
    
    try:
        open_orders = info.open_orders(account_address)
        
        orders = []
        for order in open_orders:
            orders.append({
                "oid": order.get("oid"),
                "coin": order.get("coin", ""),
                "side": "buy" if order.get("side", "").lower() == "b" else "sell",
                "size": float(order.get("sz", "0")),
                "price": float(order.get("limitPx", "0")),
                "orderType": order.get("orderType", ""),
                "reduceOnly": order.get("reduceOnly", False),
                "triggerPx": order.get("triggerPx"),
                "tpsl": order.get("tpsl"),
            })
        
        result = {"success": True, "orders": orders, "count": len(orders)}
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))

def cmd_cancel_all_orders(coin=None):
    """Cancel all open orders, optionally filtered by coin"""
    exchange, error = get_exchange()
    if error:
        print(json.dumps({"success": False, "error": error}))
        return
    
    info = get_info()
    account_address = get_account_address()
    
    try:
        open_orders = info.open_orders(account_address)
        
        cancelled = []
        errors = []
        
        for order in open_orders:
            order_coin = order.get("coin", "")
            oid = order.get("oid")
            
            # Filter by coin if specified
            if coin and order_coin.upper() != coin.upper():
                continue
            
            if oid:
                try:
                    result = exchange.cancel(order_coin, int(oid))
                    if result.get("status") == "ok":
                        cancelled.append({"coin": order_coin, "oid": oid})
                    else:
                        errors.append({"coin": order_coin, "oid": oid, "error": str(result)})
                except Exception as e:
                    errors.append({"coin": order_coin, "oid": oid, "error": str(e)})
        
        result = {
            "success": True,
            "cancelled": cancelled,
            "cancelledCount": len(cancelled),
            "errors": errors,
            "errorCount": len(errors)
        }
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))

def cmd_orderbook(coin, depth=10):
    """Get L2 order book for a coin"""
    info = get_info()
    try:
        l2 = info.l2_snapshot(coin)
        
        bids = []
        asks = []
        
        # Parse bids (buy orders)
        for level in l2.get("levels", [[],[]])[0][:depth]:
            bids.append({
                "price": float(level.get("px", 0)),
                "size": float(level.get("sz", 0)),
                "numOrders": int(level.get("n", 0)),
            })
        
        # Parse asks (sell orders)
        for level in l2.get("levels", [[],[]])[1][:depth]:
            asks.append({
                "price": float(level.get("px", 0)),
                "size": float(level.get("sz", 0)),
                "numOrders": int(level.get("n", 0)),
            })
        
        # Calculate bid/ask walls (large orders)
        bid_wall = max(bids, key=lambda x: x["size"]) if bids else None
        ask_wall = max(asks, key=lambda x: x["size"]) if asks else None
        
        # Calculate spread
        best_bid = bids[0]["price"] if bids else 0
        best_ask = asks[0]["price"] if asks else 0
        spread = ((best_ask - best_bid) / best_bid * 100) if best_bid > 0 else 0
        
        # Calculate imbalance (positive = more buy pressure)
        total_bid_size = sum(b["size"] for b in bids)
        total_ask_size = sum(a["size"] for a in asks)
        imbalance = ((total_bid_size - total_ask_size) / (total_bid_size + total_ask_size) * 100) if (total_bid_size + total_ask_size) > 0 else 0
        
        result = {
            "success": True,
            "coin": coin,
            "bids": bids,
            "asks": asks,
            "bestBid": best_bid,
            "bestAsk": best_ask,
            "spread": round(spread, 4),
            "spreadPct": round(spread, 4),
            "imbalance": round(imbalance, 2),
            "bidWall": bid_wall,
            "askWall": ask_wall,
            "totalBidSize": round(total_bid_size, 4),
            "totalAskSize": round(total_ask_size, 4),
        }
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"success": False, "error": str(e)}))

def main():
    # Parse agent wallet arguments first
    parse_agent_args()
    
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "No command provided"}))
        return
    
    cmd = sys.argv[1].lower()
    
    if cmd == "balance":
        cmd_balance()
    elif cmd == "positions":
        cmd_positions()
    elif cmd == "orderbook":
        if len(sys.argv) < 3:
            print(json.dumps({"success": False, "error": "Usage: orderbook <coin> [depth]"}))
            return
        coin = sys.argv[2].upper()
        depth = int(sys.argv[3]) if len(sys.argv) > 3 else 10
        cmd_orderbook(coin, depth)
    elif cmd == "order":
        if len(sys.argv) < 5:
            print(json.dumps({"success": False, "error": "Usage: order <coin> <buy|sell> <size> [limit] [price]"}))
            return
        coin = sys.argv[2].upper()
        side = sys.argv[3]
        size = sys.argv[4]
        # Handle both formats: "order COIN buy 0.1 123.45" and "order COIN buy 0.1 limit 123.45"
        if len(sys.argv) > 5:
            if sys.argv[5] == "limit":
                price = sys.argv[6] if len(sys.argv) > 6 else None
            else:
                price = sys.argv[5]
        else:
            price = None
        cmd_order(coin, side, size, price)
    elif cmd == "cancel":
        if len(sys.argv) < 4:
            print(json.dumps({"success": False, "error": "Usage: cancel <coin> <oid>"}))
            return
        coin = sys.argv[2].upper()
        oid = sys.argv[3]
        cmd_cancel(coin, oid)
    elif cmd == "trigger":
        if len(sys.argv) < 7:
            print(json.dumps({"success": False, "error": "Usage: trigger <coin> <buy|sell> <size> <sl|tp> <trigger_price>"}))
            return
        coin = sys.argv[2].upper()
        side = sys.argv[3]
        size = sys.argv[4]
        trigger_type = sys.argv[5]  # 'sl' or 'tp'
        trigger_price = sys.argv[6]
        cmd_trigger(coin, side, size, trigger_type, trigger_price)
    elif cmd == "close_all":
        cmd_close_all()
    elif cmd == "open_orders":
        cmd_open_orders()
    elif cmd == "cancel_all":
        # Cancel all orders, optionally for a specific coin
        coin = sys.argv[2].upper() if len(sys.argv) > 2 else None
        cmd_cancel_all_orders(coin)
    else:
        print(json.dumps({"success": False, "error": f"Unknown command: {cmd}"}))

if __name__ == "__main__":
    main()
