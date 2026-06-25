import { WalletConnectQRAdapter } from './WalletConnectQRAdapter';

const PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '';

export function getWalletConnectWallets() {
  if (!PROJECT_ID) {
    console.error('[APPKIT] Missing VITE_WALLETCONNECT_PROJECT_ID');
    return [];
  }

  const adapter = new WalletConnectQRAdapter({
    projectId: PROJECT_ID,
    metadata: {
      name: 'R2H RSC',
      description: 'Play RuneScape Classic to earn Solana',
      url: 'https://r2hrsc.xyz',
      icons: ['https://r2hrsc.xyz/favicon.ico'],
    },
  });

  console.log('[APPKIT] WalletConnect QR adapter ready, project:', PROJECT_ID.slice(0, 8) + '…');
  return [adapter];
}
