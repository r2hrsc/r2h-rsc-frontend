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
import { useLandscapeRotation } from './hooks/useLandscapeRotation';
import MobileKeyboard from './components/GameClient/MobileKeyboard';
import { GameControls } from './components/GameClient/GameControls';
import { TopFrameBar, BottomFrameBar } from './components/GameClient/FrameBar';
import type { MobileKeyboardHandle } from './components/GameClient/MobileKeyboard';
import { ActivitySidebar, MobileActivityBar, useItemNames, useLetterbox, computeDefaultPanelOpen } from './components/GameClient/ActivitySidebar';
import { LetterboxDock } from './components/GameClient/LetterboxDock';
import { VerticalFillTop, VerticalFillBottom } from './components/GameClient/VerticalFill';
import { LeftColumn } from './components/GameClient/LeftColumn';
import { initWalletKit } from './lib/walletKit';
import { useDisconnect as useAppKitDisconnect } from '@reown/appkit/react';
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
  const { disconnect: disconnectWallet } = useAppKitDisconnect();

  const logoutRef = useRef(logout);
  useEffect(() => {
    logoutRef.current = logout;
  }, [logout]);

  const disconnectWalletRef = useRef(disconnectWallet);
  useEffect(() => {
    disconnectWalletRef.current = disconnectWallet;
  }, [disconnectWallet]);

  // Initialize Reown AppKit EARLY — during the loading screen (before ad zones render).
  // This ensures the w3m-modal element is created and settled to opacity:0 while the
  // dark loading screen is visible, preventing any initialization flash over the ad zones.
  useEffect(() => {
    initWalletKit();
  }, []);

  const [appState, setAppState] = useState<AppState>('auth');
  const [authProvider, setAuthProvider] = useState('');
  const [authExternalId, setAuthExternalId] = useState('');
  const [registrationToken, setRegistrationToken] = useState('');
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
        setRegistrationToken('');
        logoutRef.current?.();
        disconnectWalletRef.current?.(); // drop the Reown session so the wallet prompt re-arms
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [reconnectAttempt]);

  const handleAuthComplete = useCallback((provider: string, externalId: string, regToken?: string) => {
    console.log('[App] Auth complete (new user):', provider, externalId);
    setAuthProvider(provider);
    setAuthExternalId(externalId);
    setRegistrationToken(regToken ?? '');
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

  // ── Phase 1 letterbox panel (9/6): fills black bars flanking the game ──
  // v386: TOGGLE for near-4:3 viewports (natural letterbox < 150px) + mobile bar.
  const itemNames = useItemNames();
  const [panelOpen, setPanelOpen] = useState(computeDefaultPanelOpen);
  const { sideWidth, naturalSideWidth, effectiveScaleFactor } = useLetterbox(panelOpen);
  // Game shrinks slightly ONLY when the user toggled the panel open on a viewport
  // with no natural letterbox. Otherwise effectiveScaleFactor === 1 (no change).
  const effectiveScale = gameScale * effectiveScaleFactor;
  const visualWidth = useMemo(() => Math.round(512 * effectiveScale), [effectiveScale]);
  const visualGameHeight = useMemo(() => Math.round(345 * effectiveScale), [effectiveScale]);

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
  const mobileKeyboardRef = useRef<MobileKeyboardHandle>(null);
  const [scriptPanelOpen, setScriptPanelOpen] = useState(false);
  // Touch detection — keyboard overlay item only shown on touch devices
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  useEffect(() => {
    setIsTouchDevice(
      window.matchMedia('(pointer: coarse)').matches ||
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0
    );
  }, []);
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

  // ── Mobile landscape rotation (wallet in-app browsers are portrait-locked) ──
  const { rotated, nativeLandscape, viewport, toggle: toggleRotate } = useLandscapeRotation();
  const isLandscapeMode = rotated || nativeLandscape;
  // Conditional ad reserves — on mobile, no side columns, only top/bottom bars
  const reserveH = isMobile ? 0 : AD_RESERVE_H;
  const reserveV = isMobile ? 0 : AD_RESERVE_V;
  const gameLeft = isMobile ? 0 : AD_SIDE_WIDTH + AD_SIDE_GAP;
  const gameTop = isMobile ? 0 : AD_TOP_HEIGHT;

  const showLetterboxUI = !isFullscreen && appState === 'playing';

  // While CSS-rotated: the frame keeps 512×345 proportions and is rotated 90°.
  // Fit math uses the tracked viewport (wallet browsers often don't fire resize
  // on orientation lock — hook polls) with swapped axes: viewport HEIGHT bounds
  // the game's 512 width, viewport WIDTH bounds the game's 345 height.
  const rotationScale = rotated
    ? Math.min(viewport.h / 512, viewport.w / 345) * 0.98
    : gameScale;
  const displayScale = rotated ? rotationScale : effectiveScale;
  const displayWidth = Math.round(512 * displayScale);
  const displayHeight = Math.round(345 * displayScale);

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
        ['--game-display-h' as string]: `${displayHeight}px`,
        ['--game-display-w' as string]: `${displayWidth}px`,
      }}
    >
      {/* Vertical letterbox fill — dense strips above/below the game (desktop) */}
      {showLetterboxUI && !isMobile && <VerticalFillTop />}
      {/* ── Game frame — centered in the viewport (ad bezel removed 9/6) ── */}
        <div
          ref={gameFrameRef}
          className={`game-frame${rotated ? ' rotated' : ''}`}
          style={{
            width: displayWidth,
            height: displayHeight,
            boxShadow: '0 0 0 1px #1a1a1a',
            zIndex: 1,
          }}
        >
          {/* Data bars above/below the game frame (wallet + burn up top,
              world metrics below) — same style as the outside columns */}
          <TopFrameBar />
          <GameContainer
            key={`game-${reconnectAttempt}`}   /* v358: remount on auto-reconnect → fresh RSC_LOGIN */
            wsUrl={WS_URL}
            rscUsername={rscCredentials?.username}
            rscPassword={rscCredentials?.password}
            onLoginComplete={handleLoginComplete}
            showRscBackground={isAuthScreen}
            scale={displayScale}
            iframeRef={gameIframeRef}
          />
          {/* Game controls hub — single FAB, middle-right of the game frame.
              Slide-out menu with ALL controls (Panels, Fullscreen, Landscape,
              Keyboard, Scripts, Chat, Logout). */}
          <GameControls
            onFullscreen={toggleFullscreen}
            onRotate={() => toggleRotate(gameFrameRef.current)}
            onKeyboard={() => mobileKeyboardRef.current?.open()}
            onScripts={() => setScriptPanelOpen(true)}
            onPanels={() => setPanelOpen(o => !o)}
            panelsOpen={panelOpen}
            isFullscreen={isFullscreen}
            isLandscape={isLandscapeMode}
            hasKeyboard={isTouchDevice}
            canRotate={isTouchDevice && isMobile}
          />
          {/* v386 panel toggle retired — panels now open from the controls hub */}
          {/* RESTORED: mobile keyboard overlay — bridges typed chars into TeaVM via __r2hTypeChar */}
          <MobileKeyboard ref={mobileKeyboardRef} iframeRef={gameIframeRef} />
          <BottomFrameBar />
          {/* Left letterbox: GUIDE + XP CALC (wiki links back, welcome text) */}
          {showLetterboxUI && !isMobile && panelOpen && (
            <LeftColumn sideWidth={sideWidth} />
          )}
          {/* Phase 2: tabbed dock (ACTIVITY | CHAT | TOP) replaces the single
              activity column on desktop; mobile keeps the bottom bar. Floating
              chat bubble retired on desktop (docked chat replaces it). */}
          {showLetterboxUI && !isMobile && panelOpen && (
            <LetterboxDock
              sideWidth={sideWidth}
              itemNames={itemNames}
              username={rscCredentials?.username ?? null}
            />
          )}
          {showLetterboxUI && !isMobile && !panelOpen && <ActivitySidebar sideWidth={0} itemNames={itemNames} />}
          {/* WorldStatusStrip retired — its metrics live in BottomFrameBar now */}
          {showLetterboxUI && isMobile && <MobileActivityBar itemNames={itemNames} />}
          {/* Script panel — all 123 APOS scripts, opened from the controls hub */}
          <ScriptPanel
            open={scriptPanelOpen}
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

      {showLetterboxUI && !isMobile && <VerticalFillBottom />}

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
          registrationToken={registrationToken}
          onComplete={handleUsernameComplete}
        />
      )}

      {/* Community Chat — floating widget only where the letterbox dock can't
          dock it (mobile portrait, or desktop with panel toggled off).
          Desktop + panel open → chat lives in the dock instead. */}
      {(!isMobile ? !panelOpen || appState !== 'playing' : true) && (
        <ChatWidget username={rscCredentials?.username ?? null} />
      )}
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
