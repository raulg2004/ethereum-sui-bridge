import { useState, useEffect } from 'react';
import { BrowserProvider, Contract, parseEther, formatEther } from 'ethers';
import { ConnectButton, useCurrentAccount, useSuiClient, useSignAndExecuteTransactionBlock } from '@mysten/dapp-kit';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import './App.css';

// ethereum contract ABI
const IBT_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function mint(address to, uint256 amount) external",
  "function burn(address from, uint256 amount) external",
  "function owner() view returns (address)"
];

// replace these with your deployed contract addresses
const ETHEREUM_CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const SUI_PACKAGE_ID = "0x64817713cd106a63f032f612b51bd9d7c859315ec1fdffacc924630df0616a54";
const SUI_TREASURY_CAP_ID = "0x88bed88157d3bd4c75b2af5e4e37bd96ff93bfe2f49e72ccfa88175c32bf4cbd";

function App() {
  // ethereum state
  const [ethereumAccount, setEthereumAccount] = useState(null);
  const [ethereumBalance, setEthereumBalance] = useState('0');
  const [ethereumContract, setEthereumContract] = useState(null);
  const [availableAccounts, setAvailableAccounts] = useState([]);
  const [showAccountSelector, setShowAccountSelector] = useState(false);
  
  // connect sui wallet (via @mysten/dapp-kit hooks and ConnectButton component)
  // sui state
  const suiAccount = useCurrentAccount();
  const [suiBalance, setSuiBalance] = useState('0');
  const suiClient = useSuiClient();
  const { mutate: signAndExecuteTransaction } = useSignAndExecuteTransactionBlock();
  
  // bridge state
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState('eth-to-sui');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  // connect ethereum wallet
  const connectEthereum = async (forceSelection = false) => {
    try {
      if (!window.ethereum) {
        alert('Please install MetaMask to use this application');
        return;
      }

      const provider = new BrowserProvider(window.ethereum);
      
      // if forcing selection (from Switch Account button), request permissions to show account selector
      if (forceSelection) {
        await provider.send("wallet_requestPermissions", [
          { eth_accounts: {} }
        ]);
      }
      
      const accounts = await provider.send("eth_requestAccounts", []);
      
      if (accounts.length > 1 || forceSelection) {
        // show account selector if multiple accounts or forced
        setAvailableAccounts(accounts);
        setShowAccountSelector(true);
      } else {
        // automatically connect if only one account
        await selectEthereumAccount(accounts[0]);
      }
    } catch (error) {
      console.error('Error connecting Ethereum wallet:', error);
      setMessage({ type: 'error', text: `Failed to connect Ethereum wallet: ${error.message}` });
    }
  };

  // select specific ethereum account
  const selectEthereumAccount = async (account) => {
    try {
      const provider = new BrowserProvider(window.ethereum);
      const signer = await provider.getSigner(account);
      const contract = new Contract(ETHEREUM_CONTRACT_ADDRESS, IBT_ABI, signer);
      
      setEthereumAccount(account);
      setEthereumContract(contract);
      
      // get balance
      const balance = await contract.balanceOf(account);
      setEthereumBalance(formatEther(balance));
      
      setShowAccountSelector(false);
      setMessage({ type: 'success', text: 'Ethereum wallet connected successfully!' });
    } catch (error) {
      console.error('Error selecting Ethereum account:', error);
      setMessage({ type: 'error', text: `Failed to select account: ${error.message}` });
    }
  };

  // load sui balance
  useEffect(() => {
    const loadSuiBalance = async () => {
      if (suiAccount) {
        try {
          // get all coins owned by the account
          const coins = await suiClient.getCoins({
            owner: suiAccount.address,
            coinType: `${SUI_PACKAGE_ID}::ibt::IBT`,
          });
          
          // calculate total balance
          let totalBalance = 0n;
          for (const coin of coins.data) {
            totalBalance += BigInt(coin.balance);
          }
          
          // convert from smallest unit (9 decimals for Sui)
          const balanceInTokens = Number(totalBalance) / 1e9;
          setSuiBalance(balanceInTokens.toString());
          
          setMessage({ type: 'success', text: 'Sui wallet connected successfully!' });
        } catch (error) {
          console.error('Error loading Sui balance:', error);
          setSuiBalance('0');
        }
      }
    };
    
    loadSuiBalance();
  }, [suiAccount, suiClient]);

  // handle bridge transaction
  const handleBridge = async (e) => {
    e.preventDefault();
    
    if (!amount || parseFloat(amount) <= 0) {
      setMessage({ type: 'error', text: 'Please enter a valid amount' });
      return;
    }

    if (!ethereumAccount || !suiAccount) {
      setMessage({ type: 'error', text: 'Please connect both wallets first' });
      return;
    }

    setLoading(true);
    setMessage({ type: 'info', text: 'Starting bridge transaction...' });

    try {
      if (direction === 'eth-to-sui') {
        await bridgeEthToSui();
      } else {
        await bridgeSuiToEth();
      }
    } catch (error) {
      console.error('Bridge error:', error);
      setMessage({ type: 'error', text: `Bridge failed: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  // bridge from ethereum to sui
  const bridgeEthToSui = async () => {
    const amountInWei = parseEther(amount);
    
    // step 1: burn tokens on ethereum
    setMessage({ type: 'info', text: 'Step 1/2: Burning tokens on Ethereum...' });
    const burnTx = await ethereumContract.burn(ethereumAccount, amountInWei);
    await burnTx.wait();
    
    setMessage({ type: 'info', text: 'Step 2/2: Minting tokens on Sui...' });
    
    // step 2: mint tokens on sui
    await new Promise((resolve, reject) => {
      const tx = new TransactionBlock();
      
      // Convert from ETH 18 decimals to Sui 9 decimals
      // Divide by 10^9 to convert 18 decimals to 9 decimals
      const suiAmount = (amountInWei / BigInt(1e9)).toString();
      
      tx.moveCall({
        target: `${SUI_PACKAGE_ID}::ibt::mint`,
        arguments: [
          tx.object(SUI_TREASURY_CAP_ID),
          tx.pure.u64(suiAmount),
          tx.pure.address(suiAccount.address),
        ],
      });

      signAndExecuteTransaction(
        {
          transactionBlock: tx,
        },
        {
          onSuccess: async (result) => {
            console.log('Sui mint successful:', result);
            
            // refresh both balances
            const ethBalance = await ethereumContract.balanceOf(ethereumAccount);
            setEthereumBalance(formatEther(ethBalance));
            
            // refresh sui balance
            const coins = await suiClient.getCoins({
              owner: suiAccount.address,
              coinType: `${SUI_PACKAGE_ID}::ibt::IBT`,
            });
            let totalBalance = 0n;
            for (const coin of coins.data) {
              totalBalance += BigInt(coin.balance);
            }
            setSuiBalance((Number(totalBalance) / 1e9).toString());
            
            setMessage({ type: 'success', text: `Successfully bridged ${amount} IBT from Ethereum to Sui!` });
            setAmount('');
            resolve();
          },
          onError: (error) => {
            console.error('Sui mint failed:', error);
            setMessage({ type: 'error', text: `Failed to mint on Sui: ${error.message}` });
            reject(error);
          },
        }
      );
    });
  };

  // bridge from sui to ethereum
  const bridgeSuiToEth = async () => {
    const amountInWei = parseEther(amount);
    
    // Convert from ETH 18 decimals to Sui 9 decimals for burning
    const suiAmount = (amountInWei / BigInt(1e9)).toString();
    
    // step 1: burn tokens on sui
    setMessage({ type: 'info', text: 'Step 1/2: Burning tokens on Sui...' });
    
    // first, get the user's coins
    const coins = await suiClient.getCoins({
      owner: suiAccount.address,
      coinType: `${SUI_PACKAGE_ID}::ibt::IBT`,
    });
    
    if (coins.data.length === 0) {
      throw new Error('No IBT coins found on Sui');
    }
    
    await new Promise((resolve, reject) => {
      const tx = new TransactionBlock();
      
      // merge all coins if there are multiple
      const [firstCoin, ...otherCoins] = coins.data;
      if (otherCoins.length > 0) {
        tx.mergeCoins(
          tx.object(firstCoin.coinObjectId),
          otherCoins.map(coin => tx.object(coin.coinObjectId))
        );
      }
      
      // split the exact amount to burn (in Sui 9 decimals)
      const coinToBurn = tx.splitCoins(tx.object(firstCoin.coinObjectId), [
        tx.pure.u64(suiAmount)
      ]);
      
      // burn the split coin
      tx.moveCall({
        target: `${SUI_PACKAGE_ID}::ibt::burn`,
        arguments: [
          tx.object(SUI_TREASURY_CAP_ID),
          coinToBurn,
        ],
      });

      signAndExecuteTransaction(
        {
          transactionBlock: tx,
        },
        {
          onSuccess: async (result) => {
            console.log('Sui burn successful:', result);
            resolve();
          },
          onError: (error) => {
            console.error('Sui burn failed:', error);
            setMessage({ type: 'error', text: `Failed to burn on Sui: ${error.message}` });
            reject(error);
          },
        }
      );
    });
    
    // step 2: mint tokens on ethereum
    setMessage({ type: 'info', text: 'Step 2/2: Minting tokens on Ethereum...' });
    const mintTx = await ethereumContract.mint(ethereumAccount, amountInWei);
    await mintTx.wait();
    
    // refresh both balances
    const ethBalance = await ethereumContract.balanceOf(ethereumAccount);
    setEthereumBalance(formatEther(ethBalance));
    
    // refresh sui balance
    const updatedCoins = await suiClient.getCoins({
      owner: suiAccount.address,
      coinType: `${SUI_PACKAGE_ID}::ibt::IBT`,
    });
    let totalBalance = 0n;
    for (const coin of updatedCoins.data) {
      totalBalance += BigInt(coin.balance);
    }
    setSuiBalance((Number(totalBalance) / 1e9).toString());
    
    setMessage({ type: 'success', text: `Successfully bridged ${amount} IBT from Sui to Ethereum!` });
    setAmount('');
  };

  return (
    <div className="app">
      <div className="header">
        <h1>Blockchain Bridge</h1>
        <p>Transfer IBT tokens between Ethereum and Sui</p>
      </div>

      <div className="bridge-container">
        <div className="wallet-section">
          <div className="wallet-card">
            <h3>Ethereum Wallet</h3>
            {ethereumAccount ? (
              <>
                <div className="wallet-status connected">Connected</div>
                <div className="wallet-address">
                  {ethereumAccount.slice(0, 6)}...{ethereumAccount.slice(-4)}
                </div>
                <div className="balance">Balance: {parseFloat(ethereumBalance).toFixed(4)} IBT</div>
                <button onClick={() => connectEthereum(true)} style={{marginTop: '10px', fontSize: '12px'}}>
                  Switch Account
                </button>
              </>
            ) : showAccountSelector ? (
              <>
                <div className="wallet-status">Select Account</div>
                <div style={{marginTop: '10px'}}>
                  {availableAccounts.map((account, index) => (
                    <button 
                      key={account}
                      onClick={() => selectEthereumAccount(account)}
                      style={{display: 'block', width: '100%', marginBottom: '8px', padding: '10px'}}
                    >
                      Account {index + 1}: {account.slice(0, 6)}...{account.slice(-4)}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="wallet-status disconnected">Not Connected</div>
                <button onClick={connectEthereum}>Connect MetaMask</button>
              </>
            )}
          </div>

          <div className="wallet-card">
            <h3>Sui Wallet</h3>
            {suiAccount ? (
              <>
                <div className="wallet-status connected">Connected</div>
                <div className="wallet-address">
                  {suiAccount.address.slice(0, 6)}...{suiAccount.address.slice(-4)}
                </div>
                <div className="balance">Balance: {parseFloat(suiBalance).toFixed(4)} IBT</div>
              </>
            ) : (
              <>
                <div className="wallet-status disconnected">Not Connected</div>
                <ConnectButton />
              </>
            )}
          </div>
        </div>

        {ethereumAccount && suiAccount && (
          <form className="bridge-form" onSubmit={handleBridge}>
            <h2>Bridge Tokens</h2>
            
            <div className="bridge-direction">
              <span className="direction-label">
                {direction === 'eth-to-sui' ? 'Ethereum' : 'Sui'}
              </span>
              <span className="arrow">→</span>
              <span className="direction-label">
                {direction === 'eth-to-sui' ? 'Sui' : 'Ethereum'}
              </span>
            </div>

            <div className="form-group">
              <label>Direction</label>
              <select 
                value={direction} 
                onChange={(e) => setDirection(e.target.value)}
                disabled={loading}
              >
                <option value="eth-to-sui">Ethereum to Sui</option>
                <option value="sui-to-eth">Sui to Ethereum</option>
              </select>
            </div>

            <div className="form-group">
              <label>Amount (IBT)</label>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount"
                disabled={loading}
              />
            </div>

            <button 
              type="submit" 
              className="submit-button" 
              disabled={loading}
            >
              {loading ? 'Processing...' : 'Bridge Tokens'}
            </button>

            {message.text && (
              <div className={`${message.type}-message`}>
                {message.text}
              </div>
            )}
          </form>
        )}

        {(!ethereumAccount || !suiAccount) && (
          <div className="info-box">
            <p>Please connect both Ethereum and Sui wallets to use the bridge.</p>
            <p>Make sure you have MetaMask installed for Ethereum and Sui Wallet for Sui.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
