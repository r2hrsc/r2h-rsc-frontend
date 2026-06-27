import { useMemo, useState, useCallback, useEffect } from 'react';
import { ConnectionProvider, WalletProvider, useWallet } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { clusterApiUrl } from '@solana/web3.js';
import { getWalletConnectWallets } from './config/appkit';
import { useSidecarAuth } from './hooks/useSidecarAuth';
import TopNav from './components/Layout/TopNav';
import GameContainer from './components/GameClient/GameContainer';
import AuthOverlay from './components/AuthOverlay';
import UsernamePicker from './components/UsernamePicker';
import WalletConnectQRModal from './components/WalletConnectQRModal';
import '@solana/wallet-adapter-react-ui/styles.css';
import './index.css';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.r2hrsc.xyz';
const WS_URL  = import.meta.env.VITE_WS_URL  || 'wss://game.r2hrsc.xyz';

type AppState = 'auth' | 'username' | 'loading' | 'playing';

function AppContent() {
  const { connected } = useWallet();
  const { sessionToken, isAuthenticating, authError } = useSidecarAuth();

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

  // Auto-advance to game when sidecar session is ready
  useEffect(() => {
    if (sessionToken && appState === 'auth') {
      console.log('[App] Sidecar session ready, advancing to game');
      setAppState('loading');
    }
  }, [sessionToken, appState]);

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
    <>
      <TopNav isAuthenticating={isAuthenticating} authError={authError} />
      <WalletConnectQRModal />

      <div style={mainLayout}>
        {/* Auth states */}
        {appState === 'auth' && !connected && (
          <AuthOverlay apiUrl={API_URL} onAuthComplete={handleAuthComplete} onExistingUser={handleExistingUser} />
        )}

        {appState === 'auth' && connected && isAuthenticating && (
          <div style={{ color: '#14F195', fontSize: 14, fontFamily: 'sans-serif' }}>Signing in with wallet...</div>
        )}

        {appState === 'auth' && connected && authError && (
          <div style={{ color: '#ff4444', fontSize: 14, fontFamily: 'sans-serif', textAlign: 'center' }}>
            <p>Authentication failed</p>
            <p style={{ fontSize: 12, color: '#888' }}>{authError}</p>
          </div>
        )}

        {appState === 'username' && (
          <UsernamePicker apiUrl={API_URL} provider={authProvider} externalId={authExternalId} onComplete={handleUsernameComplete} />
        )}

        {/* Game */}
        {showGame && (
          <GameContainer
            wsUrl={WS_URL}
            rscUsername={rscCredentials?.username}
            rscPassword={rscCredentials?.password}
            sessionToken={sessionToken}
            hidden={appState === 'loading'}
            onLoginComplete={handleLoginComplete}
          />
        )}
      </div>
    </>
  );
}

export default function App() {
  const endpoint = useMemo(() => clusterApiUrl('mainnet-beta'), []);
  const wallets  = useMemo(() => getWalletConnectWallets(), []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <AppContent />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

// Styles
const mainLayout: React.CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  paddingTop: 60,
  background: '#0a0a0a',
};
