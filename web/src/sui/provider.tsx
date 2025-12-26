import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  SuiClientProvider,
  WalletProvider,
  createNetworkConfig,
} from '@mysten/dapp-kit';
import { getFullnodeUrl } from '@mysten/sui/client';
import type { ReactNode } from 'react';

// Create query client for react-query
const queryClient = new QueryClient();

// Network configuration
const { networkConfig } = createNetworkConfig({
  devnet: { url: getFullnodeUrl('devnet') },
  testnet: { url: getFullnodeUrl('testnet') },
  localnet: { url: 'http://127.0.0.1:9000' },
});

interface SuiProviderProps {
  children: ReactNode;
}

export function SuiProvider({ children }: SuiProviderProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork="localnet">
        <WalletProvider autoConnect>
          {children}
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
