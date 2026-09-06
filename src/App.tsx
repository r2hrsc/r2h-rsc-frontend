import { useState, useCallback, useEffect, useRef, useMemo, Component, type ReactNode, type ErrorInfo } from 'react';
import { Routes, Route, BrowserRouter } from 'react-router-dom';
import { usePrivy } from '@privy-io/react-auth';
import { PrivyProvider } from './lib/privy/PrivyProvider';
import GameContainer from './components/GameClient/GameContainer';
import AuthOverlay from './components/AuthOverlay';
import UsernamePicker from './components/UsernamePicker';
import { AdSlot } from './components/Ads/AdSlot';
import { ChatWidget } from './components/Chat/ChatWidget';
import ScriptPanel from './components/ScriptPanel/ScriptPanel';
import { MediaKit } from './pages/MediaKit';
import { AdManagerPage } from './components/Admin/AdManager';
import { PrivacyPolicy, TermsOfService, About } from './pages/LegalPages';
import { useGameScale } from './hooks/useGameScale';
import MobileKeyboard from './components/GameClient/MobileKeyboard';
import { initWalletKit } from './lib/walletKit';
import './index.css';
import './layout.css';

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
  // v358 AUTO-RECONNECT: a mid-session WS close (e.g. server reaper kick,
  // network blip) no longer dumps the player at the Google auth screen —
  // if RSC credentials are still in memory, drop to 'loading' and re-login
  // through the same GameContainer path (it remounts and redoes WS login
  // when rscUsername/rscPassword props change). One automatic attempt; if
  // the reconnect login itself fails (RSC_DISCONNECT again while loading
  // with no bot running), fall to 'auth' as before.
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const rscCredentialsRef = useRef(rscCredentials);
  useEffect(() => { rscCredentialsRef.current = rscCredentials; }, [rscCredentials]);
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'RSC_DISCONNECT') {
        const creds = rscCredentialsRef.current;
        if (creds && reconnectAttempt < 1) {
          console.log('[App] WS closed mid-session — auto-reconnecting (' + creds.username + ')');
          setReconnectAttempt(a => a + 1);
          setAppState('loading');
          setLoadingText('Reconnecting...');
          // NOTE: Privy session intentionally kept — no logout() here.
          // gameSessionKey++ (below) remounts GameCanvas: its credsSentRef
          // one-shot guard means a fresh mount is REQUIRED for RSC_LOGIN
          // to be sent again — flipping appState alone would hang loading.
          return;
        }
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
  }, [reconnectAttempt]);

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
    setReconnectAttempt(0);   // v358: next disconnect gets a fresh auto-retry
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

  // ── RESTORED: fullscreen button + mobile keyboard ──
  // Shared iframe ref — MobileKeyboard types into the game through it.
  const gameIframeRef = useRef<HTMLIFrameElement>(null);
  // Native Fullscreen API (NOT a CSS fake): request on the game-frame element.
  const gameFrameRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!(document.fullscreenElement || (document as any).webkitFullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, []);
  const toggleFullscreen = useCallback(() => {
    const el = gameFrameRef.current;
    if (!el) return;
    if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
      const req = (el as any).requestFullscreen || (el as any).webkitRequestFullscreen;
      if (req) req.call(el);
    } else {
      const exit = document.exitFullscreen || (document as any).webkitExitFullscreen;
      if (exit) exit.call(document);
    }
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
      {/* ── Game frame — centered in the viewport (ad bezel removed 9/6) ── */}
        <div
          ref={gameFrameRef}
          className="game-frame"
          style={{
            width: visualWidth,
            height: visualGameHeight,
            boxShadow: '0 0 0 1px #1a1a1a',
            zIndex: 1,
          }}
        >
          <GameContainer
            key={`game-${reconnectAttempt}`}   /* v358: remount on auto-reconnect → fresh RSC_LOGIN */
            wsUrl={WS_URL}
            rscUsername={rscCredentials?.username}
            rscPassword={rscCredentials?.password}
            onLoginComplete={handleLoginComplete}
            showRscBackground={isAuthScreen}
            scale={gameScale}
            iframeRef={gameIframeRef}
          />
          {/* RESTORED: fullscreen toggle — real browser Fullscreen API on the game frame */}
          <button
            className="fs-toggle"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          >
            {isFullscreen ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3v3a2 2 0 0 1-2 2H3M16 3v3a2 2 0 0 0 2 2h3M8 21v-3a2 2 0 0 0-2-2H3M16 21v-3a2 2 0 0 1 2-2h3" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
              </svg>
            )}
          </button>
          {/* RESTORED: mobile keyboard overlay — bridges typed chars into TeaVM via __r2hTypeChar */}
          <MobileKeyboard iframeRef={gameIframeRef} />
          {/* Script panel — all 123 APOS scripts, visible when logged in */}
          <ScriptPanel
            open={appState === 'playing'}
            onStartScript={(script) => {
              console.log('[ScriptPanel] Starting:', script.id, 'config:', script.config);
              const iframe = document.querySelector('iframe[title*="Game"]') as HTMLIFrameElement;
              if (iframe?.contentWindow) {
                const cfg = script.config || {};
                const modeMap: Record<string, number> = { 'Controlled': 0, 'Aggressive': 1, 'Accurate': 2, 'Defensive': 3 };
                // Parse NPC IDs: comma-separated string → number array. Empty = auto-detect.
                let npcIds: number[] = [];
                if (cfg.npcIds && cfg.npcIds.trim()) {
                  npcIds = cfg.npcIds.split(',').map((s: string) => parseInt(s.trim())).filter((n: number) => !isNaN(n) && n > 0);
                }
                // Parse loot IDs: comma-separated string. '-1' or empty = no loot filtering (loot nothing extra).
                let lootIds: number[] = [];
                if (cfg.lootIds && cfg.lootIds !== '-1' && cfg.lootIds.trim()) {
                  lootIds = cfg.lootIds.split(',').map((s: string) => parseInt(s.trim())).filter((n: number) => !isNaN(n) && n > 0);
                }
                const engineConfig = {
                  ...cfg,               // v206: pass ALL script config through (mining camp/bank/rocks/power-mine)
                  npcIds: npcIds,
                  buryBones: cfg.buryBones ?? false,
                  prioritizeBones: cfg.buryBones ?? false,
                  eatAtHp: parseInt(cfg.eatAtHp) || 50,
                  maxWander: parseInt(cfg.wander) || 20,
                  fightMode: typeof cfg.fightMode === 'string' ? (modeMap[cfg.fightMode] ?? -1) : (cfg.fightMode ?? -1),
                  targetLevel: parseInt(cfg.targetLevel) || -1,
                  lootIds: lootIds,
                  openDoors: cfg.openDoors ?? false,
                  useMagic: cfg.useMagic ?? false,
                  combatSpell: cfg.combatSpell ?? '',
                  useRanging: cfg.useRanging ?? false,
                  arrowType: cfg.arrowType ?? '',
                  switchId: parseInt(cfg.switchId) || 0,
                };
                iframe.contentWindow.postMessage({
                  type: 'R2H_BOT_START',
                  scriptId: script.id,
                  scriptName: script.name,
                  config: engineConfig,
                }, '*');
              }
            }}
            onStopScript={() => {
              console.log('[ScriptPanel] Stopping');
              const iframe = document.querySelector('iframe[title*="Game"]') as HTMLIFrameElement;
              if (iframe?.contentWindow) {
                iframe.contentWindow.postMessage({ type: 'R2H_BOT_STOP' }, '*');
              }
            }}
          />
        </div>
        {/* AD BEZEL REMOVED 9/6: right/bottom ad bars + wrapper deleted (user: no longer needed) */}

      {/* Loading overlay on top of game while it connects */}
      {showLoadingOverlay && <LoadingOverlay text={loadingText} />}

      {/* RESTORED (9/6, July-13 fix): AuthOverlay OUTSIDE the game frame at top level —
          position:fixed full-viewport (card 340px no longer clipped by the small game
          frame on mobile; Gmail button reachable in Chrome/Firefox mobile). */}
      {isAuthScreen && (
        <AuthOverlay
          apiUrl={API_URL}
          onAuthComplete={handleAuthComplete}
          onExistingUser={handleExistingUser}
        />
      )}

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
