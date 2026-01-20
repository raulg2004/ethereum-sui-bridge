#!/bin/bash

echo "Sui IBT Token Deployment & Setup"
echo ""

# switch to devnet
echo "Switching to devnet..."
sui client switch --env devnet > /dev/null 2>&1
echo "Using devnet"
echo ""

# use browser wallet address
ACTIVE_ADDRESS="0x1476da5ccef9917f4ecd4a7494522154f82bb231fab974e81a20fad8e5938b0e"
echo "Using browser wallet address: $ACTIVE_ADDRESS"
echo ""

# switch CLI to use this address
echo "Switching CLI active address..."
sui client switch --address $ACTIVE_ADDRESS > /dev/null 2>&1
echo ""

# request tokens from faucet
echo "Requesting tokens from devnet faucet..."
sui client faucet > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "Received tokens from faucet"
    sleep 3  # wait for transaction to process
else
    echo "Warning: Failed to get tokens from faucet, continuing anyway..."
fi
echo ""

# remove old publication file if exists
if [ -f "Pub.devnet.toml" ]; then
    echo "Removing old publication file..."
    rm Pub.devnet.toml
fi

# deploy the contract
echo "Deploying IBT token contract to devnet..."
DEPLOY_OUTPUT=$(sui client test-publish --gas-budget 100000000 --build-env devnet 2>&1)

echo "$DEPLOY_OUTPUT"
echo ""

# extract package ID from Published Objects section
PACKAGE_ID=$(echo "$DEPLOY_OUTPUT" | grep "│  │ PackageID:" | awk '{print $4}')

# extract TreasuryCap ID from Created Objects with TreasuryCap type  
TREASURY_CAP_ID=$(echo "$DEPLOY_OUTPUT" | grep -A 20 "Created Objects:" | grep -B 5 "TreasuryCap<" | grep "│  │ ObjectID:" | head -1 | awk '{print $4}')

if [ -z "$PACKAGE_ID" ] || [ -z "$TREASURY_CAP_ID" ]; then
    echo "Failed to extract contract IDs. Deployment may have failed."
    echo "Debug: PACKAGE_ID='$PACKAGE_ID' TREASURY_CAP_ID='$TREASURY_CAP_ID'"
    exit 1
fi

echo "Contract deployed!"
echo "   Package ID: $PACKAGE_ID"
echo "   TreasuryCap ID: $TREASURY_CAP_ID"
echo ""

# note: we already got the active address earlier, no need to get it again

# mint initial tokens (1000 IBT with 9 decimals)
echo "Minting 1000 IBT tokens..."
sui client call \
  --package $PACKAGE_ID \
  --module ibt \
  --function mint \
  --args $TREASURY_CAP_ID 1000000000000 $ACTIVE_ADDRESS \
  --gas-budget 10000000 > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo "Minted 1000 IBT tokens"
else
    echo "Failed to mint tokens (you may need to do this manually)"
fi
echo ""

# update App.jsx with the new contract addresses
APP_JSX="../bridge-app/src/App.jsx"
if [ -f "$APP_JSX" ]; then
    echo "Updating App.jsx with new Sui addresses..."
    
    # use sed to replace the sui package ID and treasury cap
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS - match both hex addresses and │ character
        sed -i '' "s/const SUI_PACKAGE_ID = \"[^\"]*\";/const SUI_PACKAGE_ID = \"$PACKAGE_ID\";/" "$APP_JSX"
        sed -i '' "s/const SUI_TREASURY_CAP_ID = \"[^\"]*\";/const SUI_TREASURY_CAP_ID = \"$TREASURY_CAP_ID\";/" "$APP_JSX"
    else
        # linux - match both hex addresses and │ character
        sed -i "s/const SUI_PACKAGE_ID = \"[^\"]*\";/const SUI_PACKAGE_ID = \"$PACKAGE_ID\";/" "$APP_JSX"
        sed -i "s/const SUI_TREASURY_CAP_ID = \"[^\"]*\";/const SUI_TREASURY_CAP_ID = \"$TREASURY_CAP_ID\";/" "$APP_JSX"
    fi
    
    echo "Updated App.jsx"
else
    echo "App.jsx not found at $APP_JSX"
    echo "   Please manually update:"
    echo "   SUI_PACKAGE_ID to: $PACKAGE_ID"
    echo "   SUI_TREASURY_CAP_ID to: $TREASURY_CAP_ID"
fi

echo ""
echo "Sui Setup Complete!"
echo ""
echo "Summary:"
echo "   Package ID: $PACKAGE_ID"
echo "   TreasuryCap ID: $TREASURY_CAP_ID"
echo "   Balance: 1000 IBT"
echo ""
echo "Next: Start the web app with: cd ../bridge-app && npm run dev"
echo ""
