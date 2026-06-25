import { useMemo, useState, useCallback, useEffect } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import { getWalletConnectWallets } from './config/appkit';
import GameCanvas from './components/GameCanvas';
import AuthOverlay from './components/AuthOverlay';
import UsernamePicker from './components/UsernamePicker';
import WalletConnectQRModal from './components/WalletConnectQRModal';
import '@solana/wallet-adapter-react-ui/styles.css';
import './index.css';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.r2hrsc.xyz';
const WS_URL  = import.meta.env.VITE_WS_URL  || 'wss://game.r2hrsc.xyz';

type AppState = 'auth' | 'username' | 'loading' | 'playing';

export default function App() {
  const endpoint = useMemo(() => clusterApiUrl('mainnet-beta'), []);
  const wallets  = useMemo(() => getWalletConnectWallets(), []);

  const [appState, setAppState] = useState<AppState>('auth');
  const [authProvider, setAuthProvider] = useState('');
  const [authExternalId, setAuthExternalId] = useState('');
  const [rscCredentials, setRscCredentials] = useState<{ username: string; password: string } | null>(null);

  // Listen for RSC_DISCONNECT from the game iframe
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'RSC_DISCONNECT') {
        console.log('[App] Game disconnected — returning to auth screen');
        setAppState('auth');
        setRscCredentials(null);
        setAuthProvider('');
        setAuthExternalId('');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const handleAuthComplete = useCallback((provider: string, externalId: string) => {
    setAuthProvider(provider);
    setAuthExternalId(externalId);
    setAppState('username');
  }, []);

  const handleExistingUser = useCallback((provider: string, externalId: string, rscUsername: string, rscPassword: string) => {
    setAuthProvider(provider);
    setAuthExternalId(externalId);
    setRscCredentials({ username: rscUsername, password: rscPassword });
    setAppState('loading');
  }, []);

  const handleUsernameComplete = useCallback((rscUsername: string, rscPassword: string) => {
    setRscCredentials({ username: rscUsername, password: rscPassword });
    setAppState('loading');
  }, []);

  const handleLoginComplete = useCallback(() => {
    setAppState('playing');
  }, []);

  const showGame = appState === 'loading' || appState === 'playing';

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <WalletConnectQRModal />
          {showGame && (
            <GameCanvas
              wsUrl={WS_URL}
              rscUsername={rscCredentials?.username}
              rscPassword={rscCredentials?.password}
              hidden={appState === 'loading'}
              onLoginComplete={handleLoginComplete}
            />
          )}

          {appState === 'auth' && (
            <AuthOverlay apiUrl={API_URL} onAuthComplete={handleAuthComplete} onExistingUser={handleExistingUser} />
          )}

          {appState === 'username' && (
            <UsernamePicker
              apiUrl={API_URL}
              provider={authProvider}
              externalId={authExternalId}
              onComplete={handleUsernameComplete}
            />
          )}
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
