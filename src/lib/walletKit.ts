import { createAppKit } from '@reown/appkit/react';
import { EthersAdapter } from '@reown/appkit-adapter-ethers';
import { SolanaAdapter } from '@reown/appkit-adapter-solana';
import { solana } from '@reown/appkit/networks';
import { mainnet, polygon, base } from 'viem/chains';
import { SITE_ORIGIN, SITE_NAME, SITE_LOGO } from './siteConfig';

const PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '';

let initialized = false;

/** The live AppKit instance, or null before initWalletKit() runs.
 *  Exported so the configured chain namespaces can be asserted at runtime
 *  rather than inferred from this file — see the Solana note below. */
export let appKit: ReturnType<typeof createAppKit> | null = null;

// Official WalletConnect explorer IDs (verified against explorer-api.walletconnect.com)
const FEATURED_WALLET_IDS = [
  'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96', // MetaMask
  'a797aa35c0fadbfc1a53e7f675162ed5226968b44a19ee3d24385c64d1d3c393', // Phantom
  '4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0', // Trust Wallet
];

export function initWalletKit() {
  if (initialized || !PROJECT_ID) return;
  initialized = true;

  // SOLANA IS NOT OPTIONAL HERE. $RUNE is an SPL token, so a player can only
  // be paid to a Solana address. With the Ethers adapter alone, AppKit asked
  // every wallet for its ETHEREUM address — including Phantom, which is
  // featured below. That is why all 106 wallet identities on the box are 0x…
  // and why nobody could be paid. Adding the Solana adapter lets Phantom and
  // Solflare connect as the Solana wallets they are, and the sidecar stores
  // that proven address as both the login identity and the payout destination.
  appKit = createAppKit({
    adapters: [new EthersAdapter(), new SolanaAdapter()],
    networks: [mainnet, polygon, base, solana],
    projectId: PROJECT_ID,
    metadata: {
      name: SITE_NAME,
      description: 'Classic RSC client',
      url: typeof window !== 'undefined' ? window.location.origin : SITE_ORIGIN,
      icons: [SITE_LOGO],
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

  // Assert the Solana namespace actually registered. A silently EVM-only
  // AppKit is precisely the failure that left 106 accounts unpayable, and it
  // is invisible from the modal UI — the wallet list looks identical either
  // way, only the namespace a wallet binds to differs.
  try {
    const namespaces = [...new Set((appKit.getCaipNetworks() ?? []).map((n: any) => n.chainNamespace))];
    if (!namespaces.includes('solana')) {
      console.error('[walletKit] Solana namespace NOT registered — $RUNE payouts will not work. Namespaces:', namespaces);
    } else {
      console.info('[walletKit] chain namespaces registered:', namespaces.join(', '));
    }
  } catch (err) {
    console.warn('[walletKit] could not verify chain namespaces', err);
  }
}
