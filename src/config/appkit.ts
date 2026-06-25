import { createAppKit } from '@reown/appkit-solana/react';
import { solana, solanaDevnet } from '@reown/appkit-adapter-solana';

const PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '';

if (!PROJECT_ID) {
  console.warn('[AppKit] VITE_WALLETCONNECT_PROJECT_ID is not set — WalletConnect QR will not work.');
}

// AppKit auto-detects Phantom, Solflare, Backpack via Wallet Standard.
// No explicit wallet adapters needed — avoids @solana/web3.js version conflicts.
export const appKit = createAppKit({
  networks: [solana, solanaDevnet],
  defaultNetwork: solana,
  projectId: PROJECT_ID,
  metadata: {
    name: 'R2H RSC',
    description: 'Play to Earn',
    url: 'https://r2hrsc.xyz',
    icons: ['https://r2hrsc.xyz/icons/phantom.svg'],
  },
  features: {
    analytics: false,
    email: false,
    socials: [],
  },
  themeMode: 'dark',
});
