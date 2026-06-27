import { useMemo, useState, useCallback, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { PrivyProvider } from './lib/privy/PrivyProvider';
import GameContainer from './components/GameClient/GameContainer';
import AuthOverlay from './components/AuthOverlay';
import UsernamePicker from './components/UsernamePicker';
import './index.css';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.r2hrsc.xyz';
const WS_URL  = import.meta.env.VITE_WS_URL  || 'wss://game.r2hrsc.xyz';

type AppState = 'auth' | 'username' | 'loading' | 'playing';

function AppContent() {
  const { ready, authenticated, user } = usePrivy();

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

  // Auto-advance to game when authenticated via Privy
  useEffect(() => {
    if (ready && authenticated && appState === 'auth' && user) {
      console.log('[App] Privy authenticated, advancing to game');
      const externalId = user.wallet?.address || user.email?.address || user.id;
      setAuthProvider('privy');
      setAuthExternalId(externalId);
      setRscCredentials({ username: externalId, password: user.id });
      setAppState('loading');
    }
  }, [ready, authenticated, user, appState]);

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
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0a',
      }}
    >
      {showGame && (
        <GameContainer
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
    </div>
  );
}

export default function App() {
  return (
    <PrivyProvider>
      <AppContent />
    </PrivyProvider>
  );
}
