import { createAppKit } from '@reown/appkit/react';
import { EthersAdapter } from '@reown/appkit-adapter-ethers';
import { mainnet, polygon, base } from 'viem/chains';

const PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '';

let initialized = false;

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
    features: {
      analytics: false,
      email: false,
      socials: [],
    },
  });
}
