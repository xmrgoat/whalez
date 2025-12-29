"""
Test script for Hyperliquid trading using official Python SDK
Run with: python scripts/test_hl_trade.py
"""

import os
from dotenv import load_dotenv

# Load .env file
load_dotenv()

from hyperliquid.info import Info
from hyperliquid.exchange import Exchange
from hyperliquid.utils import constants
from eth_account import Account

def main():
    private_key = os.getenv("HL_PRIVATE_KEY")
    account_address = os.getenv("HL_ACCOUNT_ADDRESS")
    
    # Also check the main wallet address (where funds are)
    main_wallet = "0x0d27fff95A80B55f47E06700c46C0b79dEd7A32d"
    
    if not private_key:
        print("❌ HL_PRIVATE_KEY not set")
        return
    
    print(f"🔑 Private key: {private_key[:10]}...")
    print(f"📍 API Wallet: {account_address}")
    print(f"📍 Main Wallet: {main_wallet}")
    
    try:
        # Initialize
        info = Info(constants.MAINNET_API_URL, skip_ws=True)
        
        # Get account info for API wallet
        print("\n📊 API Wallet account info...")
        api_state = info.user_state(account_address)
        print(f"API Wallet Value: ${api_state.get('marginSummary', {}).get('accountValue', 'N/A')}")
        
        # Get account info for main wallet
        print("\n📊 Main Wallet account info...")
        main_state = info.user_state(main_wallet)
        print(f"Main Wallet Value: ${main_state.get('marginSummary', {}).get('accountValue', 'N/A')}")
        
        # Get BTC price
        print("\n💰 Getting BTC price...")
        all_mids = info.all_mids()
        btc_price = float(all_mids.get("BTC", 0))
        print(f"BTC Price: ${btc_price:,.2f}")
        
        # Check API wallet funds
        api_value = float(api_state.get('marginSummary', {}).get('accountValue', '0'))
        if api_value > 0:
            print(f"\n✅ API wallet has ${api_value:.2f} - Ready to trade!")
            
            # Place test order
            print("\n🧪 Placing test BUY order (0.001 BTC)...")
            
            # Create wallet object from private key
            wallet = Account.from_key(private_key)
            exchange = Exchange(wallet, constants.MAINNET_API_URL, account_address=account_address)
            
            # Place a limit order 1% below market (won't fill immediately)
            # BTC tick size is 1.0, so round to whole number
            limit_price = round(btc_price * 0.99)
            
            result = exchange.order(
                "BTC",  # coin
                True,   # is_buy
                0.001,  # sz
                limit_price,  # limit_px
                {"limit": {"tif": "Gtc"}}  # order_type
            )
            
            print(f"Order result: {result}")
            
            if result.get("status") == "ok":
                print("✅ Order placed successfully!")
                
                # Cancel the order
                statuses = result.get("response", {}).get("data", {}).get("statuses", [])
                if statuses and statuses[0].get("resting"):
                    oid = statuses[0]["resting"]["oid"]
                    print(f"\n🔄 Cancelling order {oid}...")
                    cancel_result = exchange.cancel("BTC", oid)
                    print(f"Cancel result: {cancel_result}")
            else:
                print(f"❌ Order failed: {result}")
        else:
            print(f"\n❌ API wallet has $0 - need to transfer funds")
            
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
