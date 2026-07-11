import { useState, useCallback, useEffect, useRef, useMemo, Component, type ReactNode, type ErrorInfo } from 'react';
import { Routes, Route, BrowserRouter } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { PrivyProvider } from './lib/privy/PrivyProvider';
import GameContainer from './components/GameClient/GameContainer';
import AuthOverlay from './components/AuthOverlay';
import UsernamePicker from './components/UsernamePicker';
import { AdSlot } from './components/Ads/AdSlot';
import { ChatWidget } from './components/Chat/ChatWidget';
import { MediaKit } from './pages/MediaKit';
import { AdManagerPage } from './components/Admin/AdManager';
import { PrivacyPolicy, TermsOfService, About } from './pages/LegalPages';
import { useGameScale } from './hooks/useGameScale';
import { initWalletKit } from './lib/walletKit';
import './index.css';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.r2hrsc.xyz';
const WS_URL  = import.meta.env.VITE_WS_URL  || 'wss://game.r2hrsc.xyz';

// Ad frame dimensions — forms a connected "arcade cabinet" border around the game
const AD_SIDE_WIDTH = 250;
const AD_SIDE_GAP = 0;
const AD_TOP_HEIGHT = 200;
const AD_BOTTOM_HEIGHT = 200;
const AD_RESERVE_H = AD_SIDE_WIDTH * 2 + AD_SIDE_GAP * 2; // 500px total horizontal ad space
const AD_RESERVE_V = AD_TOP_HEIGHT + AD_BOTTOM_HEIGHT;     // 400px total vertical ad space

type AppState = 'auth' | 'username' | 'loading' | 'playing';

// ── Loading Overlay ──
// pointerEvents: 'none' so the overlay doesn't block touch/click events
// from reaching the game iframe's hidden TeaVM inputs underneath.
// The overlay is purely visual (spinner + text), events pass through to the game.
function LoadingOverlay({ text }: { text: string }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 2038,
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)',
      gap: 16,
      pointerEvents: 'none',
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
    return this.props.children!;
  }
}

function AppContent() {
  const { ready, authenticated, user, logout } = usePrivy();

  const logoutRef = useRef(logout);
  useEffect(() => {
    logoutRef.current = logout;
  }, [logout]);

  // Initialize Reown AppKit EARLY — during the loading screen (before ad zones render).
  // This ensures the w3m-modal element is created and settled to opacity:0 while the
  // dark loading screen is visible, preventing any initialization flash over the ad zones.
  useEffect(() => {
    initWalletKit();
  }, []);

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

  // Mobile detection — side ad columns hidden on narrow screens (see index.css .ad-zone-side)
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Conditional ad reserves — on mobile, no side columns, only top/bottom bars
  const reserveH = isMobile ? 0 : AD_RESERVE_H;
  const reserveV = isMobile ? 0 : AD_RESERVE_V;
  const gameLeft = isMobile ? 0 : AD_SIDE_WIDTH + AD_SIDE_GAP;
  const gameTop = isMobile ? 0 : AD_TOP_HEIGHT;

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
        overflow: 'visible',
        position: 'fixed',
        inset: 0,
      }}
    >
      {/* Connected ad frame — top/left/game/right/bottom form a unified "arcade cabinet" bezel.
          All zones share the same dark gradient + subtle green inner glow facing the game.
          Outer corners are rounded so the whole assembly reads as one piece. v2 */}
      <div style={{
        position: 'relative',
        minWidth: visualWidth + reserveH, width: visualWidth + reserveH,
        minHeight: visualGameHeight + reserveV, height: visualGameHeight + reserveV,
        zIndex: 30,
        border: '1px solid #1a1a1a',
        borderRadius: 10,
        overflow: 'hidden',
      }}>
        {/* ── Top ad bar — spans full width, rounded top corners ── */}
        <div className="ad-zone" style={{
          position: 'absolute',
          top: 0, left: 0,
          width: '100%',
          height: AD_TOP_HEIGHT,
          background: '#0f0f0f',
          borderTop: '1px solid #1a1a1a',
          borderLeft: '1px solid #1a1a1a',
          borderRight: '1px solid #1a1a1a',
          borderRadius: '10px 10px 0 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
        }}>
          <AdSlot slot="VOTE_GATEWAY" zone="top" />
        </div>

        {/* ── Left ad column — sits between top and bottom bars (hidden on mobile) ── */}
        <div className="ad-zone ad-zone-side" style={{
          position: 'absolute',
          left: 0,
          top: AD_TOP_HEIGHT,
          width: AD_SIDE_WIDTH,
          height: visualGameHeight,
          background: '#0f0f0f',
          borderLeft: '1px solid #1a1a1a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
        }}>
          <AdSlot slot="LEFT_SIDEBAR" zone="left" />
        </div>

        {/* ── Game frame — centered between all four ad zones ── */}
        <div style={{
          position: 'absolute',
          left: gameLeft,
          top: gameTop,
          width: visualWidth,
          height: visualGameHeight,
          boxShadow: '0 0 0 1px #1a1a1a',
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
          {/* Auth overlay constrained exactly to the RSC game frame only */}
          {isAuthScreen && (
            <AuthOverlay
              apiUrl={API_URL}
              onAuthComplete={handleAuthComplete}
              onExistingUser={handleExistingUser}
            />
          )}
        </div>

        {/* ── Right ad column — mirrors the left (hidden on mobile) ── */}
        <div className="ad-zone ad-zone-side" style={{
          position: 'absolute',
          right: 0,
          top: AD_TOP_HEIGHT,
          width: AD_SIDE_WIDTH,
          height: visualGameHeight,
          background: '#0f0f0f',
          borderRight: '1px solid #1a1a1a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
        }}>
          <AdSlot slot="RIGHT_SIDEBAR" zone="right" />
        </div>

        {/* ── Bottom ad bar — spans full width, rounded bottom corners ── */}
        <div className="ad-zone" style={{
          position: 'absolute',
          bottom: 0, left: 0,
          width: '100%',
          height: AD_BOTTOM_HEIGHT,
          background: '#0f0f0f',
          borderBottom: '1px solid #1a1a1a',
          borderLeft: '1px solid #1a1a1a',
          borderRight: '1px solid #1a1a1a',
          borderRadius: '0 0 10px 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
        }}>
          <AdSlot slot="VOTE_GATEWAY" zone="bottom" />
        </div>
      </div>

      {/* Loading overlay on top of game while it connects */}
      {showLoadingOverlay && <LoadingOverlay text={loadingText} />}


      {appState === 'username' && (
        <UsernamePicker
          apiUrl={API_URL}
          provider={authProvider}
          externalId={authExternalId}
          onComplete={handleUsernameComplete}
        />
      )}

      {/* Community Chat — floating widget, only when authenticated */}
      <ChatWidget username={rscCredentials?.username ?? null} />
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <PrivyProvider>
          <Routes>
            <Route path="/" element={<AppContent />} />
            <Route path="/about" element={<About />} />
            <Route path="/privacy-policy" element={<PrivacyPolicy />} />
            <Route path="/terms-of-service" element={<TermsOfService />} />
            <Route path="/media-kit" element={<MediaKit />} />
            <Route path="/admin/ads" element={<AdManagerPage />} />
          </Routes>
        </PrivyProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
