import { useState, useCallback, useEffect, Component, type ReactNode, type ErrorInfo } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { PrivyProvider } from './lib/privy/PrivyProvider';
import GameContainer from './components/GameClient/GameContainer';
import AuthOverlay from './components/AuthOverlay';
import UsernamePicker from './components/UsernamePicker';
import './index.css';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.r2hrsc.xyz';
const WS_URL  = import.meta.env.VITE_WS_URL  || 'wss://game.r2hrsc.xyz';

type AppState = 'auth' | 'username' | 'loading' | 'playing';

// ── Error Boundary ──
interface ErrorBoundaryState { hasError: boolean; error: Error | null; }

class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error);
    console.error('[ErrorBoundary] Component stack:', info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          color: '#f44', background: '#000', height: '100vh',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'monospace', padding: 24,
        }}>
          <div style={{ textAlign: 'center', maxWidth: 520 }}>
            <h2 style={{ color: '#fff', marginBottom: 12 }}>App Crashed</h2>
            <p style={{ color: '#f44', fontSize: 13, wordBreak: 'break-word' }}>
              {this.state.error?.message}
            </p>
            <p style={{ color: '#666', fontSize: 12, marginTop: 12 }}>
              Check the browser console (F12) for details.
            </p>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
              style={{
                marginTop: 16, padding: '8px 24px', borderRadius: 8, border: 'none',
                background: '#14F195', color: '#0a0a0a', fontSize: 14, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppContent() {
  const { ready, authenticated, user, logout } = usePrivy();

  const [appState, setAppState] = useState<AppState>('auth');
  const [authProvider, setAuthProvider] = useState('');
  const [authExternalId, setAuthExternalId] = useState('');
  const [rscCredentials, setRscCredentials] = useState<{ username: string; password: string } | null>(null);

  // ── Auth state logging ──
  useEffect(() => {
    console.log('[App] Privy state → ready:', ready, '| authenticated:', authenticated, '| user:', user?.id ?? 'null');
  }, [ready, authenticated, user]);

  useEffect(() => {
    console.log('[App] AppState →', appState, '| credentials:', rscCredentials ? 'set' : 'none');
  }, [appState, rscCredentials]);

  // Listen for RSC_DISCONNECT from the game iframe
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'RSC_DISCONNECT') {
        console.log('[App] Game disconnected — returning to auth screen');
        setAppState('auth');
        setRscCredentials(null);
        setAuthProvider('');
        setAuthExternalId('');
        logout();
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [logout]);

  const handleAuthComplete = useCallback((provider: string, externalId: string) => {
    console.log('[App] Auth complete (new user):', provider, externalId);
    setAuthProvider(provider);
    setAuthExternalId(externalId);
    setAppState('username');
  }, []);

  const handleExistingUser = useCallback((provider: string, externalId: string, rscUsername: string, rscPassword: string) => {
    console.log('[App] Existing user:', provider, externalId);
    setAuthProvider(provider);
    setAuthExternalId(externalId);
    setRscCredentials({ username: rscUsername, password: rscPassword });
    setAppState('loading');
  }, []);

  const handleUsernameComplete = useCallback((rscUsername: string, rscPassword: string) => {
    console.log('[App] Username selected:', rscUsername);
    setRscCredentials({ username: rscUsername, password: rscPassword });
    setAppState('loading');
  }, []);

  const handleLoginComplete = useCallback(() => {
    console.log('[App] Login complete — now playing');
    setAppState('playing');
  }, []);

  // Show loading while Privy initializes
  if (!ready) {
    console.log('[App] Privy not ready yet, showing loading...');
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0a0a0a', color: '#888', fontFamily: 'monospace',
      }}>
        <p>Initializing...</p>
      </div>
    );
  }

  const showGame = appState === 'loading' || appState === 'playing';

  console.log('[App] Rendering → showGame:', showGame, '| appState:', appState, '| authenticated:', authenticated);

  return (
    <div
      style={{
        height: '100vh',
        width: '100vw',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0a',
        overflow: 'hidden',
        position: 'fixed',
        inset: 0,
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
    <ErrorBoundary>
      <PrivyProvider>
        <AppContent />
      </PrivyProvider>
    </ErrorBoundary>
  );
}
