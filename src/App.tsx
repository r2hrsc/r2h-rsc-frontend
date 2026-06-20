import { useMemo, useState, useCallback } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom';
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare';
import { clusterApiUrl } from '@solana/web3.js';
import GameCanvas from './components/GameCanvas';
import AuthOverlay from './components/AuthOverlay';
import { useAutoLogin } from './hooks/useAutoLogin';

import '@solana/wallet-adapter-react-ui/styles.css';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.r2hrsc.xyz';
const WS_URL  = import.meta.env.VITE_WS_URL  || 'wss://game.r2hrsc.xyz';

export default function App() {
  const endpoint = useMemo(() => clusterApiUrl('mainnet-beta'), []);
  const wallets  = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], []);

  const [overlayVisible, setOverlayVisible] = useState(true);
  const [rscCredentials, setRscCredentials] = useState<{ username: string; password: string } | null>(null);

  const handleAuthSuccess = useCallback((username: string, password: string) => {
    setRscCredentials({ username, password });
    setOverlayVisible(false);
  }, []);

  useAutoLogin(rscCredentials);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <GameCanvas wsUrl={WS_URL} />
          {overlayVisible && (
            <AuthOverlay apiUrl={API_URL} onSuccess={handleAuthSuccess} />
          )}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
