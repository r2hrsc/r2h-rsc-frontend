import { createAppKit } from '@reown/appkit-solana/react';
import { solana, solanaDevnet } from '@reown/appkit-adapter-solana';

const PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '';

console.log('[AppKit] Initializing…', { projectId: PROJECT_ID ? PROJECT_ID.slice(0, 6) + '…' : 'MISSING' });
console.log('[AppKit] Networks: solana mainnet + devnet');
console.log('[AppKit] Default network: solana');

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

console.log('[AppKit] ✅ createAppKit() completed');
