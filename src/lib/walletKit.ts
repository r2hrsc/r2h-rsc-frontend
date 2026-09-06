import { createAppKit } from '@reown/appkit/react';
import { EthersAdapter } from '@reown/appkit-adapter-ethers';
import { mainnet, polygon, base } from 'viem/chains';

const PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '';

let initialized = false;

// Official WalletConnect explorer IDs (verified against explorer-api.walletconnect.com)
const FEATURED_WALLET_IDS = [
  'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96', // MetaMask
  'a797aa35c0fadbfc1a53e7f675162ed5226968b44a19ee3d24385c64d1d3c393', // Phantom
  '4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0', // Trust Wallet
];

export function initWalletKit() {
  if (initialized || !PROJECT_ID) return;
  initialized = true;

  createAppKit({
    adapters: [new EthersAdapter()],
    networks: [mainnet, polygon, base],
    projectId: PROJECT_ID,
    metadata: {
      name: 'R2H RSC',
      description: 'Classic RSC client',
      url: typeof window !== 'undefined' ? window.location.origin : 'https://r2hrsc.xyz',
      icons: ['https://r2hrsc.xyz/logo.png'],
    },
    themeMode: 'dark',
    themeVariables: {
      '--w3m-accent': '#14F195',
    },
    featuredWalletIds: FEATURED_WALLET_IDS,
    features: {
      analytics: false,
      email: false,
      socials: [],
    },
  });
}
