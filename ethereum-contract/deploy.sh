#!/bin/bash

# deployment script for ethereum IBT token contract
echo "Ethereum IBT Token Deployment & Setup"
echo ""

# check if anvil is running
if ! nc -z localhost 8545 2>/dev/null; then
    echo "Error: Anvil is not running on localhost:8545"
    echo "Please start Anvil in another terminal with: anvil"
    exit 1
fi

echo "Anvil is running"
echo ""

# default anvil private key and address (first account)
PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
DEFAULT_ADDRESS="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"

echo "Using default Anvil account: $DEFAULT_ADDRESS"
echo ""

# deploy the contract
echo "Deploying IBTToken contract..."
DEPLOY_OUTPUT=$(forge create --rpc-url http://localhost:8545 \
  --private-key $PRIVATE_KEY \
  --broadcast \
  IBTToken.sol:IBTToken 2>&1)

echo "$DEPLOY_OUTPUT"
echo ""

# extract the deployed contract address
CONTRACT_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep "Deployed to:" | awk '{print $3}')

if [ -z "$CONTRACT_ADDRESS" ]; then
    echo "Failed to extract contract address. Deployment may have failed."
    exit 1
fi

echo "Contract deployed at: $CONTRACT_ADDRESS"
echo ""

# mint initial tokens
echo "Minting 1000 IBT tokens..."
cast send $CONTRACT_ADDRESS \
  "mint(address,uint256)" \
  $DEFAULT_ADDRESS \
  1000000000000000000000 \
  --rpc-url http://localhost:8545 \
  --private-key $PRIVATE_KEY > /dev/null 2>&1

echo "Minted 1000 IBT tokens"
echo ""

# update App.jsx with the new contract address
APP_JSX="../bridge-app/src/App.jsx"
if [ -f "$APP_JSX" ]; then
    echo "Updating App.jsx with new contract address..."
    
    # use sed to replace the ethereum contract address
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s/const ETHEREUM_CONTRACT_ADDRESS = \"0x[a-fA-F0-9]*\";/const ETHEREUM_CONTRACT_ADDRESS = \"$CONTRACT_ADDRESS\";/" "$APP_JSX"
    else
        # linux
        sed -i "s/const ETHEREUM_CONTRACT_ADDRESS = \"0x[a-fA-F0-9]*\";/const ETHEREUM_CONTRACT_ADDRESS = \"$CONTRACT_ADDRESS\";/" "$APP_JSX"
    fi
    
    echo "Updated App.jsx"
else
    echo "App.jsx not found at $APP_JSX"
    echo "   Please manually update ETHEREUM_CONTRACT_ADDRESS to: $CONTRACT_ADDRESS"
fi

echo ""
echo "Ethereum Setup Complete!"
echo ""
echo "Summary:"
echo "   Contract Address: $CONTRACT_ADDRESS"
echo "   Balance: 1000 IBT"
echo ""
echo "Next: Deploy Sui contract and start the web app"
echo ""