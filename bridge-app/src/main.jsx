import React from 'react';
import ReactDOM from 'react-dom/client';
import { SuiClientProvider, WalletProvider } from '@mysten/dapp-kit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import '@mysten/dapp-kit/dist/index.css';

const queryClient = new QueryClient();

const networks = {
  devnet: { url: 'https://fullnode.devnet.sui.io:443' },
  localnet: { url: 'http://127.0.0.1:9000' },
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networks} defaultNetwork="devnet">
        <WalletProvider>
          <App />
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);