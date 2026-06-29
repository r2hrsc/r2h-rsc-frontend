import { useState, useCallback, useEffect, useRef, useMemo, Component, type ReactNode, type ErrorInfo } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { PrivyProvider } from './lib/privy/PrivyProvider';
import GameContainer from './components/GameClient/GameContainer';
import AuthOverlay from './components/AuthOverlay';
import UsernamePicker from './components/UsernamePicker';
import { useGameScale } from './hooks/useGameScale';
import './index.css';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.r2hrsc.xyz';
const WS_URL  = import.meta.env.VITE_WS_URL  || 'wss://game.r2hrsc.xyz';

// Ad frame dimensions — forms a connected "arcade cabinet" border around the game
const AD_SIDE_WIDTH = 160;
const AD_SIDE_GAP = 20;
const AD_TOP_HEIGHT = 90;
const AD_BOTTOM_HEIGHT = 90;
const AD_RESERVE_H = AD_SIDE_WIDTH * 2 + AD_SIDE_GAP * 2; // 360px total horizontal ad space
const AD_RESERVE_V = AD_TOP_HEIGHT + AD_BOTTOM_HEIGHT;     // 180px total vertical ad space

type AppState = 'auth' | 'username' | 'loading' | 'playing';

// ── Loading Overlay ──
function LoadingOverlay({ text }: { text: string }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2038,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)',
      gap: 16,
    }}>
      <div style={{
        width: 32, height: 32, border: '3px solid #333', borderTop: '3px solid #14F195',
        borderRadius: '50%', animation: 'spin 0.8s linear infinite',
      }} />
      <p style={{ color: '#888', fontSize: 14, fontFamily: 'monospace', margin: 0 }}>{text}</p>
    </div>
  );
}

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

  const logoutRef = useRef(logout);
  useEffect(() => {
    logoutRef.current = logout;
  }, [logout]);

  const [appState, setAppState] = useState<AppState>('auth');
  const [authProvider, setAuthProvider] = useState('');
  const [authExternalId, setAuthExternalId] = useState('');
  const [rscCredentials, setRscCredentials] = useState<{ username: string; password: string } | null>(null);
  const [loadingText, setLoadingText] = useState('Loading game...');

  // Listen for RSC_DISCONNECT from the game iframe
  // Use ref for logout + empty deps to prevent the effect from re-running on every render
  // (usePrivy returns unstable function references which previously caused excessive re-renders)
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'RSC_DISCONNECT') {
        console.log('[App] Game disconnected — returning to auth screen');
        setAppState('auth');
        setRscCredentials(null);
        setAuthProvider('');
        setAuthExternalId('');
        logoutRef.current?.();
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

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
    setLoadingText('Connecting to game...');
    setAppState('loading');
  }, []);

  const handleUsernameComplete = useCallback((rscUsername: string, rscPassword: string) => {
    console.log('[App] Username selected:', rscUsername);
    setRscCredentials({ username: rscUsername, password: rscPassword });
    setLoadingText('Entering world...');
    setAppState('loading');
  }, []);

  const handleLoginComplete = useCallback(() => {
    console.log('[App] Login complete — now playing');
    setAppState('playing');
  }, []);

  // Hooks MUST be called unconditionally before any early return (rules of hooks).
  // useGameScale + useMemo were previously after the if(!ready) return, causing a
  // hook-count mismatch when Privy transitioned ready=false→true → re-render loop (#310).
  const gameScale = useGameScale();
  const visualWidth = useMemo(() => Math.round(512 * gameScale), [gameScale]);
  const visualGameHeight = useMemo(() => Math.round(345 * gameScale), [gameScale]);

  // Show minimal loading while Privy initializes
  if (!ready) {
    return (
      <div style={{
        height: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#0a0a0a', position: 'fixed', inset: 0, overflow: 'hidden',
      }}>
        <LoadingOverlay text="Initializing..." />
      </div>
    );
  }

  const showGame = appState === 'loading' || appState === 'playing';
  const showLoadingOverlay = appState === 'loading';
  const isAuthScreen = appState === 'auth' || appState === 'username';

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
      {/* Connected ad frame — top/left/game/right/bottom form a unified "arcade cabinet" bezel.
          All zones share the same dark gradient + subtle green inner glow facing the game.
          Outer corners are rounded so the whole assembly reads as one piece. */}
      <div style={{
        position: 'relative',
        width: visualWidth + AD_RESERVE_H,
        height: visualGameHeight + AD_RESERVE_V,
      }}>
        {/* ── Top ad bar — spans full width, rounded top corners ── */}
        <div className="ad-zone" style={{
          position: 'absolute',
          top: 0, left: 0,
          width: '100%',
          height: AD_TOP_HEIGHT,
          background: 'linear-gradient(180deg, #0d0d0d 0%, #131313 100%)',
          borderTop: '1px solid #1a1a1a',
          borderLeft: '1px solid #1a1a1a',
          borderRight: '1px solid #1a1a1a',
          borderRadius: '10px 10px 0 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 20,
        }}>
          <span className="ad-label">Advertisement</span>
        </div>

        {/* ── Left ad column — sits between top and bottom bars ── */}
        <div className="ad-zone" style={{
          position: 'absolute',
          left: 0,
          top: AD_TOP_HEIGHT,
          width: AD_SIDE_WIDTH,
          height: visualGameHeight,
          background: 'linear-gradient(90deg, #0d0d0d 0%, #131313 100%)',
          borderLeft: '1px solid #1a1a1a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 20,
        }}>
          <span className="ad-label" style={{ writingMode: 'vertical-rl' }}>Advertisement</span>
        </div>

        {/* ── Game frame — centered between all four ad zones ── */}
        <div style={{
          position: 'absolute',
          left: AD_SIDE_WIDTH + AD_SIDE_GAP,
          top: AD_TOP_HEIGHT,
          width: visualWidth,
          height: visualGameHeight,
          boxShadow: '0 0 0 1px rgba(20, 241, 149, 0.18), 0 0 24px rgba(20, 241, 149, 0.06)',
          zIndex: 1,
        }}>
          <GameContainer
            wsUrl={WS_URL}
            rscUsername={rscCredentials?.username}
            rscPassword={rscCredentials?.password}
            onLoginComplete={handleLoginComplete}
            showRscBackground={isAuthScreen}
            scale={gameScale}
          />
        </div>

        {/* ── Right ad column — mirrors the left ── */}
        <div className="ad-zone" style={{
          position: 'absolute',
          right: 0,
          top: AD_TOP_HEIGHT,
          width: AD_SIDE_WIDTH,
          height: visualGameHeight,
          background: 'linear-gradient(270deg, #0d0d0d 0%, #131313 100%)',
          borderRight: '1px solid #1a1a1a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 20,
        }}>
          <span className="ad-label" style={{ writingMode: 'vertical-rl' }}>Advertisement</span>
        </div>

        {/* ── Bottom ad bar — spans full width, rounded bottom corners ── */}
        <div className="ad-zone" style={{
          position: 'absolute',
          bottom: 0, left: 0,
          width: '100%',
          height: AD_BOTTOM_HEIGHT,
          background: 'linear-gradient(0deg, #0d0d0d 0%, #131313 100%)',
          borderBottom: '1px solid #1a1a1a',
          borderLeft: '1px solid #1a1a1a',
          borderRight: '1px solid #1a1a1a',
          borderRadius: '0 0 10px 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 20,
        }}>
          <span className="ad-label">Advertisement</span>
        </div>
      </div>

      {/* Loading overlay on top of game while it connects */}
      {showLoadingOverlay && <LoadingOverlay text={loadingText} />}

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
