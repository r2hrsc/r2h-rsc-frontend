import {
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  Component,
  type ReactNode,
  type ErrorInfo,
} from "react";
import { Routes, Route, BrowserRouter } from "react-router-dom";
import { usePrivy } from "@privy-io/react-auth";
import { PrivyProvider } from "./lib/privy/PrivyProvider";
import GameContainer from "./components/GameClient/GameContainer";
import { WorldKey, worldDef } from "./lib/worlds";
import PreAuthWorldPicker from "./components/PreAuthWorldPicker";
import AuthOverlay from "./components/AuthOverlay";
import UsernamePicker from "./components/UsernamePicker";
import { AdSlot } from "./components/Ads/AdSlot";
import { ChatWidget } from "./components/Chat/ChatWidget";
import ScriptPanel from "./components/ScriptPanel/ScriptPanel";
import { MediaKit } from "./pages/MediaKit";
import { AdManagerPage } from "./components/Admin/AdManager";
import { PrivacyPolicy, TermsOfService, About } from "./pages/LegalPages";
import { useGameScale } from "./hooks/useGameScale";
import { useLandscapeRotation } from "./hooks/useLandscapeRotation";
import MobileKeyboard from "./components/GameClient/MobileKeyboard";
import { GameControls } from "./components/GameClient/GameControls";
import { TopFrameBar, BottomFrameBar } from "./components/GameClient/FrameBar";
import AccountCredentials from "./components/AccountCredentials";
import type { MobileKeyboardHandle } from "./components/GameClient/MobileKeyboard";
import {
  ActivitySidebar,
  MobileActivityBar,
  useItemNames,
  useLetterbox,
  computeDefaultPanelOpen,
} from "./components/GameClient/ActivitySidebar";
import { LetterboxDock } from "./components/GameClient/LetterboxDock";
import { VerticalFillTop } from "./components/GameClient/VerticalFill";
import { LeftColumn } from "./components/GameClient/LeftColumn";
import { InviteSheet } from "./components/referral/InviteSheet";
import { InviteFab } from "./components/referral/InviteFab";
import { initWalletKit } from "./lib/walletKit";
import { useDisconnect as useAppKitDisconnect } from "@reown/appkit/react";
import "./index.css";
import "./layout.css";

const API_URL = import.meta.env.VITE_API_URL || "https://api.r2hrsc.xyz";
const WS_URL = import.meta.env.VITE_WS_URL || "wss://game.r2hrsc.xyz";

// Ad frame dimensions — forms a connected "arcade cabinet" border around the game
const AD_SIDE_WIDTH = 250;
const AD_SIDE_GAP = 0;
const AD_TOP_HEIGHT = 200;
const AD_BOTTOM_HEIGHT = 200;
const AD_RESERVE_H = AD_SIDE_WIDTH * 2 + AD_SIDE_GAP * 2; // 500px total horizontal ad space
const AD_RESERVE_V = AD_TOP_HEIGHT + AD_BOTTOM_HEIGHT; // 400px total vertical ad space

type AppState = "auth" | "username" | "loading" | "playing";

// ── Loading Overlay ──
// pointerEvents: 'none' so the overlay doesn't block touch/click events
// from reaching the game iframe's hidden TeaVM inputs underneath.
// The overlay is purely visual (spinner + text), events pass through to the game.
function LoadingOverlay({ text }: { text: string }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2038,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(0,0,0,0.8)",
        backdropFilter: "blur(4px)",
        gap: 16,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          border: "3px solid #333",
          borderTop: "3px solid #14F195",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <p
        style={{
          color: "#888",
          fontSize: 14,
          fontFamily: "monospace",
          margin: 0,
        }}
      >
        {text}
      </p>
    </div>
  );
}

// ── Error Boundary ──
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error);
    console.error("[ErrorBoundary] Component stack:", info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            color: "#f44",
            background: "#000",
            height: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "monospace",
            padding: 24,
          }}
        >
          <div style={{ textAlign: "center", maxWidth: 520 }}>
            <h2 style={{ color: "#fff", marginBottom: 12 }}>App Crashed</h2>
            <p style={{ color: "#f44", fontSize: 13, wordBreak: "break-word" }}>
              {this.state.error?.message}
            </p>
            <p style={{ color: "#666", fontSize: 12, marginTop: 12 }}>
              Check the browser console (F12) for details.
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null });
                window.location.reload();
              }}
              style={{
                marginTop: 16,
                padding: "8px 24px",
                borderRadius: 8,
                border: "none",
                background: "#14F195",
                color: "#0a0a0a",
                fontSize: 14,
                fontWeight: 600,
                cursor: "pointer",
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

  // Capture ?ref= from URL before auth overlay shows (fresh < 7 days; newest click wins)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    // ::refcode prints lowercase codes, but veteran names can be mixed case (e.g. ?ref=Shafic)
    const refCode = params.get("ref")?.trim().toLowerCase();
    if (refCode && /^[a-z0-9]{1,12}$/.test(refCode)) {
      localStorage.setItem(
        "r2h_ref",
        JSON.stringify({ code: refCode, ts: Date.now() }),
      );
    }
  }, []);

  const [appState, setAppState] = useState<AppState>("auth");
  const [authProvider, setAuthProvider] = useState("");
  const [authExternalId, setAuthExternalId] = useState("");
  const [registrationToken, setRegistrationToken] = useState("");
  const [rscCredentials, setRscCredentials] = useState<{
    username: string;
    password: string;
  } | null>(null);
  const [loadingText, setLoadingText] = useState("Loading game...");

  // Listen for RSC_DISCONNECT from the game iframe
  // v358 AUTO-RECONNECT: a mid-session WS close (e.g. server reaper kick,
  // network blip) no longer dumps the player at the Google auth screen —
  // if RSC credentials are still in memory, drop to 'loading' and re-login
  // through the same GameContainer path (it remounts and redoes WS login
  // when rscUsername/rscPassword props change). One automatic attempt; if
  // the reconnect login itself fails (RSC_DISCONNECT again while loading
  // with no bot running), fall to 'auth' as before.
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  // Monotonic remount key, deliberately SEPARATE from reconnectAttempt.
  // They used to be the same value: the GameContainer key was
  // `game-${reconnectAttempt}-...`, so a successful reconnect reset the counter
  // 1 -> 0, which changed the key a SECOND time and remounted again. Every
  // reconnect therefore logged in twice and showed "Reconnecting..." twice.
  // This only ever increments, so one disconnect = exactly one remount.
  const [gameSessionKey, setGameSessionKey] = useState(0);
  // Automatic retries before falling back to the auth screen. Was effectively 1.
  // The server drops any client silent for client_activity_timeout, and a
  // browser tab that loses focus is throttled hard (rAF halts, timers fall to
  // ~1/min), so transient drops are normal and worth retrying more than once.
  const RECONNECT_MAX_ATTEMPTS = 3;
  // ── PVP Arena realm (Phase A): 'main' (default) | 'arena' ──
  // Same login works in both realms (account-server mirrors credentials into
  // both DBs). Switching remounts GameCanvas pointed at the other server.
  // v404.2: world choice is pre-auth (founder request). Restore last numbered-world
  // choice; 'arena' is never persisted (explicit action each time); unknown -> World 1.
  const [world, setWorld] = useState<WorldKey>(() => {
    try {
      const v = localStorage.getItem("r2h_world");
      const n = v === null ? NaN : Number(v);
      return [1, 3, 4, 5, 6, 7].includes(n) ? (n as WorldKey) : 1;
    } catch {
      return 1;
    }
  });
  const [worldSession, setWorldSession] = useState(0); // remount key on world switch
  // One-time arena confirm dialog (beta onboarding): shown on first switch
  // click only; localStorage remembers dismissal per browser.
  const [arenaConfirmOpen, setArenaConfirmOpen] = useState(false);
  const pendingWorldSwitchRef = useRef<(() => void) | null>(null);
  // Guard: RSC_DISCONNECT is IGNORED for a window after a realm switch — the
  // old iframe's WS closing on unmount must not trigger the v358 auto-reconnect
  // (it remounted the fresh arena iframe mid-boot → "Entering PVP Arena..." hang).
  const worldSwitchAtRef = useRef(0);
  const rscCredentialsRef = useRef(rscCredentials);
  useEffect(() => {
    rscCredentialsRef.current = rscCredentials;
  }, [rscCredentials]);
  // Same pattern for appState, so the visibilitychange listener below can
  // register once and still read the current value without re-subscribing.
  const appStateRef = useRef(appState);
  useEffect(() => {
    appStateRef.current = appState;
  }, [appState]);
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "RSC_DISCONNECT") {
        // Realm-switch window: the OLD iframe's WS death is expected, not an
        // error — skip auto-reconnect/auth-reset entirely.
        if (Date.now() - worldSwitchAtRef.current < 20000) {
          console.log("[App] RSC_DISCONNECT during realm switch — ignored");
          return;
        }
        const creds = rscCredentialsRef.current;
        if (creds && reconnectAttempt < RECONNECT_MAX_ATTEMPTS) {
          console.log(
            "[App] WS closed mid-session — auto-reconnecting (" +
              creds.username +
              ", attempt " +
              (reconnectAttempt + 1) +
              "/" +
              RECONNECT_MAX_ATTEMPTS +
              ")",
          );
          setReconnectAttempt((a) => a + 1);
          setGameSessionKey((k) => k + 1);
          setAppState("loading");
          setLoadingText("Reconnecting...");
          // NOTE: Privy session intentionally kept — no logout() here.
          // gameSessionKey++ (below) remounts GameCanvas: its credsSentRef
          // one-shot guard means a fresh mount is REQUIRED for RSC_LOGIN
          // to be sent again — flipping appState alone would hang loading.
          return;
        }
        console.log("[App] Game disconnected — returning to auth screen");
        setAppState("auth");
        setRscCredentials(null);
        setAuthProvider("");
        setAuthExternalId("");
        setRegistrationToken("");
        logoutRef.current?.();
        disconnectWalletRef.current?.(); // drop the Reown session so the wallet prompt re-arms
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [reconnectAttempt]);

  // Tab-away recovery. The server drops any client silent for
  // client_activity_timeout, and a backgrounded browser tab is throttled hard —
  // rAF stops entirely and timers fall to roughly one call a minute — so the
  // game client goes quiet within seconds of losing focus. Come back from a
  // long tab-away and the session is very likely already gone, but the iframe
  // can take a while to notice: the game just sits there looking frozen until
  // its socket finally errors.
  //
  // Rather than wait for that, remount as soon as we return from a hide long
  // enough to have been dropped.
  useEffect(() => {
    const TAB_AWAY_RECONNECT_MS = 110000; // just under the server's 120s
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
        return;
      }
      if (!hiddenAt) return;
      const away = Date.now() - hiddenAt;
      hiddenAt = 0;
      if (away < TAB_AWAY_RECONNECT_MS) return;
      if (!rscCredentialsRef.current) return;
      if (appStateRef.current !== "playing") return;
      // Do not fight a realm switch that is already in flight.
      if (Date.now() - worldSwitchAtRef.current < 20000) return;
      console.log(
        "[App] back after " +
          Math.round(away / 1000) +
          "s hidden — likely already dropped, remounting",
      );
      setReconnectAttempt(0); // a tab-away is not a failing retry
      setGameSessionKey((k) => k + 1);
      setAppState("loading");
      setLoadingText("Reconnecting...");
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // v-fit (9/29): the sign-in popup / on-screen keyboard can leave the document
  // scrolled on phones, which shows the (fixed, centred) game off-centre.
  useEffect(() => {
    if (appState !== "loading" && appState !== "playing") return;
    const reset = () => {
      if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
    };
    reset();
    const t = setTimeout(reset, 400);
    window.addEventListener("orientationchange", reset);
    return () => {
      clearTimeout(t);
      window.removeEventListener("orientationchange", reset);
    };
  }, [appState]);

  const handleAuthComplete = useCallback(
    (provider: string, externalId: string, regToken?: string) => {
      console.log("[App] Auth complete (new user):", provider, externalId);
      setAuthProvider(provider);
      setAuthExternalId(externalId);
      setRegistrationToken(regToken ?? "");
      setAppState("username");
    },
    [],
  );

  const handleExistingUser = useCallback(
    (
      provider: string,
      externalId: string,
      rscUsername: string,
      rscPassword: string,
    ) => {
      console.log("[App] Existing user:", provider, externalId);
      setAuthProvider(provider);
      setAuthExternalId(externalId);
      setRscCredentials({ username: rscUsername, password: rscPassword });
      setLoadingText("Connecting to game...");
      setAppState("loading");
    },
    [],
  );

  const handleUsernameComplete = useCallback(
    (rscUsername: string, rscPassword: string) => {
      console.log("[App] Username selected:", rscUsername);
      setRscCredentials({ username: rscUsername, password: rscPassword });
      setLoadingText("Entering world...");
      setAppState("loading");
    },
    [],
  );

  const handleLoginComplete = useCallback(() => {
    console.log("[App] Login complete — now playing");
    setAppState("playing");
    setReconnectAttempt(0); // v358: next disconnect gets a fresh auto-retry
  }, []);

  // Hooks MUST be called unconditionally before any early return (rules of hooks).
  // useGameScale + useMemo were previously after the if(!ready) return, causing a
  // hook-count mismatch when Privy transitioned ready=false→true → re-render loop (#310).
  const gameScale = useGameScale();

  // v403.3 FIX: these useCallback hooks MUST sit before the Privy `if (!ready)`
  // early-return below — hooks after a conditional return caused React #310
  // ("Rendered more hooks than previous render") on the ready=false→true flip.
  const performWorldSwitch = useCallback(() => {
    if (pendingWorldSwitchRef.current) {
      pendingWorldSwitchRef.current();
      pendingWorldSwitchRef.current = null;
    }
    setArenaConfirmOpen(false);
  }, []);

  const doWorldSwitch = useCallback(
    (next: WorldKey) => {
      console.log("[App] Switching world:", world, "->", next);
      worldSwitchAtRef.current = Date.now(); // arm the disconnect guard
      setWorld(next);
      try {
        if (next !== "arena") localStorage.setItem("r2h_world", String(next));
      } catch {}
      setWorldSession((s) => s + 1);
      // Cross-world lock (server truth, [CLAUDE] 2026-09-30 16:10): a live claim is
      // refused, never stolen — but our old iframe's logout runs save-then-release,
      // and the new login retries (10x500ms) until that release lands. Tell the player.
      setLoadingText(
        rscCredentialsRef.current
          ? `${worldDef(next).loading} (up to ~10s while your last session saves and releases)`
          : worldDef(next).loading,
      );
      setAppState("loading");
    },
    [world],
  );

  const requestWorldSwitch = useCallback(
    (next: WorldKey) => {
      if (
        next === "arena" &&
        world !== "arena" &&
        !localStorage.getItem("r2h_arena_confirm_seen")
      ) {
        // first-ever entry to the arena: confirm dialog (onboarding)
        pendingWorldSwitchRef.current = () => doWorldSwitch(next);
        setArenaConfirmOpen(true);
        return;
      }
      // subsequent switches (or any non-arena target): straight through
      doWorldSwitch(next);
    },
    [world, doWorldSwitch],
  );

  // v404.2: PRE-AUTH selection (no credentials yet): just set + persist; the game
  // mounts on this world after sign-in. Arena pre-auth routes through the same
  // first-entry confirm dialog; confirming performs a real switch (harmless pre-
  // auth — no session to guard; appState stays 'auth' until credentials exist).
  const preAuthSelectWorld = useCallback((next: WorldKey) => {
    console.log("[App] Pre-auth world selected:", next);
    setWorld(next);
    try {
      localStorage.setItem("r2h_world", String(next));
    } catch {}
  }, []);
  const preAuthRequestArena = useCallback(() => {
    if (!localStorage.getItem("r2h_arena_confirm_seen")) {
      pendingWorldSwitchRef.current = () =>
        preAuthSelectWorld("arena" as WorldKey);
      setArenaConfirmOpen(true);
      return;
    }
    preAuthSelectWorld("arena");
  }, [preAuthSelectWorld]);

  // ── Phase 1 letterbox panel (9/6): fills black bars flanking the game ──
  // v386: TOGGLE for near-4:3 viewports (natural letterbox < 150px) + mobile bar.
  const itemNames = useItemNames();
  const [panelOpen, setPanelOpen] = useState(computeDefaultPanelOpen);
  const { sideWidth, naturalSideWidth, effectiveScaleFactor } =
    useLetterbox(panelOpen);
  // Game shrinks slightly ONLY when the user toggled the panel open on a viewport
  // with no natural letterbox. Otherwise effectiveScaleFactor === 1 (no change).
  const effectiveScale = gameScale * effectiveScaleFactor;
  const visualWidth = useMemo(
    () => Math.round(512 * effectiveScale),
    [effectiveScale],
  );
  const visualGameHeight = useMemo(
    () => Math.round(345 * effectiveScale),
    [effectiveScale],
  );

  // Mobile detection — side ad columns hidden on narrow screens (see index.css .ad-zone-side)
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 768,
  );
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // ── RESTORED: fullscreen button + mobile keyboard ──
  // Shared iframe ref — MobileKeyboard types into the game through it.
  const gameIframeRef = useRef<HTMLIFrameElement>(null);
  // Native Fullscreen API (NOT a CSS fake): request on the game-frame element.
  const gameFrameRef = useRef<HTMLDivElement>(null);
  const mobileKeyboardRef = useRef<MobileKeyboardHandle>(null);
  const [scriptPanelOpen, setScriptPanelOpen] = useState(false);
  // Invite friends sheet (opened from the controls hub; outside the game frame)
  const [inviteOpen, setInviteOpen] = useState(false);
  const closeInvite = useCallback(() => setInviteOpen(false), []);
  // Account details (game username/password) — opened from the gear menu only
  const [accountOpen, setAccountOpen] = useState(false);
  const closeAccount = useCallback(() => setAccountOpen(false), []);
  // Touch detection — keyboard overlay item only shown on touch devices
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  useEffect(() => {
    setIsTouchDevice(
      window.matchMedia("(pointer: coarse)").matches ||
        "ontouchstart" in window ||
        navigator.maxTouchPoints > 0,
    );
  }, []);
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(
        !!(
          document.fullscreenElement ||
          (document as any).webkitFullscreenElement
        ),
      );
    };
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);
    return () => {
      document.removeEventListener("fullscreenchange", onFsChange);
      document.removeEventListener("webkitfullscreenchange", onFsChange);
    };
  }, []);
  const toggleFullscreen = useCallback(() => {
    const el = gameFrameRef.current;
    if (!el) return;
    if (
      !document.fullscreenElement &&
      !(document as any).webkitFullscreenElement
    ) {
      const req =
        (el as any).requestFullscreen || (el as any).webkitRequestFullscreen;
      if (req) req.call(el);
    } else {
      const exit =
        document.exitFullscreen || (document as any).webkitExitFullscreen;
      if (exit) exit.call(document);
    }
  }, []);

  // ── Mobile landscape rotation (wallet in-app browsers are portrait-locked) ──
  const {
    rotated,
    nativeLandscape,
    viewport,
    toggle: toggleRotate,
  } = useLandscapeRotation();
  const isLandscapeMode = rotated || nativeLandscape;
  // Conditional ad reserves — on mobile, no side columns, only top/bottom bars
  const reserveH = isMobile ? 0 : AD_RESERVE_H;
  const reserveV = isMobile ? 0 : AD_RESERVE_V;
  const gameLeft = isMobile ? 0 : AD_SIDE_WIDTH + AD_SIDE_GAP;
  const gameTop = isMobile ? 0 : AD_TOP_HEIGHT;

  const showLetterboxUI = !isFullscreen && appState === "playing";

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
      <div
        style={{
          height: "100vh",
          width: "100vw",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0a0a0a",
          position: "fixed",
          inset: 0,
          overflow: "hidden",
        }}
      >
        <LoadingOverlay text="Initializing..." />
      </div>
    );
  }

  const showGame = appState === "loading" || appState === "playing";
  const showLoadingOverlay = appState === "loading";
  const isAuthScreen = appState === "auth" || appState === "username";

  return (
    <div
      style={{
        // v-fit (9/29): sized by top/right/bottom/left 0 = the VISIBLE viewport.
        // 100vh on Android Chrome / iOS Safari = the height with the URL bar
        // hidden, so the centred game sat lower than the visible middle.
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0a0a",
        // Phones/tablets: clip anything poking past the screen edge so the page
        // can never be panned sideways (desktop unchanged).
        overflow: isMobile || isTouchDevice ? "hidden" : "visible",
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
        ["--game-display-h" as string]: `${displayHeight}px`,
        ["--game-display-w" as string]: `${displayWidth}px`,
      }}
    >
      {/* Vertical letterbox fill — dense strips above/below the game (desktop) */}
      {showLetterboxUI && !isMobile && <VerticalFillTop />}
      {/* ── Game frame — centered in the viewport (ad bezel removed 9/6) ── */}
      <div
        ref={gameFrameRef}
        className={`game-frame${rotated ? " rotated" : ""}`}
        style={{
          width: displayWidth,
          height: displayHeight,
          boxShadow: "0 0 0 1px #1a1a1a",
          zIndex: 1,
        }}
      >
        {/* Data bars above/below the game frame (wallet + burn up top,
              world metrics below) — same style as the outside columns */}
        <TopFrameBar />
        {/* Game account credentials — lets Gmail/wallet users see + copy their
              real in-game username/password (works with the classic login screen
              and external clients). Rendered only when signed in. */}
        {rscCredentials && !isAuthScreen && accountOpen && (
          <AccountCredentials
            username={rscCredentials.username}
            password={rscCredentials.password}
            onClose={closeAccount}
          />
        )}
        <GameContainer
          key={`game-${gameSessionKey}-${worldSession}`} /* remount on reconnect AND realm switch → fresh RSC_LOGIN to the right server. Uses the MONOTONIC key, not reconnectAttempt: resetting that counter on success used to change this key a second time and remount again. */
          wsUrl={WS_URL}
          rscUsername={rscCredentials?.username}
          rscPassword={rscCredentials?.password}
          onLoginComplete={handleLoginComplete}
          showRscBackground={isAuthScreen}
          world={world}
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
          onPanels={() => setPanelOpen((o) => !o)}
          onSwitchWorld={rscCredentials ? requestWorldSwitch : undefined}
          onInvite={
            rscCredentials
              ? () => {
                  // the sheet lives outside the game frame → leave native fullscreen first
                  if (
                    document.fullscreenElement ||
                    (document as any).webkitFullscreenElement
                  )
                    toggleFullscreen();
                  setInviteOpen(true);
                }
              : undefined
          }
          onAccount={rscCredentials ? () => setAccountOpen(true) : undefined}
          currentWorld={world}
          panelsOpen={panelOpen}
          isFullscreen={isFullscreen}
          isLandscape={isLandscapeMode}
          hasKeyboard={isTouchDevice}
          canRotate={isTouchDevice && isMobile}
          edgeInset={!rotated && displayWidth >= viewport.w - 24}
        />
        {/* v386 panel toggle retired — panels now open from the controls hub */}
        {/* RESTORED: mobile keyboard overlay — bridges typed chars into TeaVM via __r2hTypeChar */}
        <MobileKeyboard ref={mobileKeyboardRef} iframeRef={gameIframeRef} />
        <BottomFrameBar />
        {/* Left letterbox: GUIDE + XP CALC (wiki links back, welcome text) */}
        {showLetterboxUI && !isMobile && panelOpen && (
          <LeftColumn
            sideWidth={sideWidth}
            username={rscCredentials?.username ?? null}
          />
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
        {showLetterboxUI && !isMobile && !panelOpen && (
          <ActivitySidebar sideWidth={0} itemNames={itemNames} />
        )}
        {/* WorldStatusStrip retired — its metrics live in BottomFrameBar now */}
        {showLetterboxUI && isMobile && (
          <MobileActivityBar itemNames={itemNames} />
        )}
        {/* Script panel — all 123 APOS scripts, opened from the controls hub */}
        <ScriptPanel
          open={scriptPanelOpen}
          onStartScript={(script) => {
            console.log(
              "[ScriptPanel] Starting:",
              script.id,
              "config:",
              script.config,
            );
            const iframe = document.querySelector(
              'iframe[title*="Game"]',
            ) as HTMLIFrameElement;
            if (iframe?.contentWindow) {
              const cfg = script.config || {};
              const modeMap: Record<string, number> = {
                Controlled: 0,
                Aggressive: 1,
                Accurate: 2,
                Defensive: 3,
              };
              // Parse NPC IDs: comma-separated string → number array. Empty = auto-detect.
              let npcIds: number[] = [];
              if (cfg.npcIds && cfg.npcIds.trim()) {
                npcIds = cfg.npcIds
                  .split(",")
                  .map((s: string) => parseInt(s.trim()))
                  .filter((n: number) => !isNaN(n) && n > 0);
              }
              // Parse loot IDs: comma-separated string. '-1' or empty = no loot filtering (loot nothing extra).
              let lootIds: number[] = [];
              if (cfg.lootIds && cfg.lootIds !== "-1" && cfg.lootIds.trim()) {
                lootIds = cfg.lootIds
                  .split(",")
                  .map((s: string) => parseInt(s.trim()))
                  .filter((n: number) => !isNaN(n) && n > 0);
              }
              const engineConfig = {
                ...cfg, // v206: pass ALL script config through (mining camp/bank/rocks/power-mine)
                npcIds: npcIds,
                buryBones: cfg.buryBones ?? false,
                prioritizeBones: cfg.buryBones ?? false,
                eatAtHp: parseInt(cfg.eatAtHp) || 50,
                maxWander: parseInt(cfg.wander) || 20,
                fightMode:
                  typeof cfg.fightMode === "string"
                    ? (modeMap[cfg.fightMode] ?? -1)
                    : (cfg.fightMode ?? -1),
                targetLevel: parseInt(cfg.targetLevel) || -1,
                lootIds: lootIds,
                openDoors: cfg.openDoors ?? false,
                useMagic: cfg.useMagic ?? false,
                combatSpell: cfg.combatSpell ?? "",
                useRanging: cfg.useRanging ?? false,
                arrowType: cfg.arrowType ?? "",
                switchId: parseInt(cfg.switchId) || 0,
              };
              iframe.contentWindow.postMessage(
                {
                  type: "R2H_BOT_START",
                  scriptId: script.id,
                  scriptName: script.name,
                  config: engineConfig,
                },
                "*",
              );
            }
          }}
          onStopScript={() => {
            console.log("[ScriptPanel] Stopping");
            const iframe = document.querySelector(
              'iframe[title*="Game"]',
            ) as HTMLIFrameElement;
            if (iframe?.contentWindow) {
              iframe.contentWindow.postMessage({ type: "R2H_BOT_STOP" }, "*");
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
      {appState === "auth" && (
        <AuthOverlay
          apiUrl={API_URL}
          onAuthComplete={handleAuthComplete}
          onExistingUser={handleExistingUser}
          worldPicker={
            <PreAuthWorldPicker
              world={world}
              onSelect={preAuthSelectWorld}
              onRequestArena={preAuthRequestArena}
            />
          }
        />
      )}

      {appState === "username" && (
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
      {(!isMobile ? !panelOpen || appState !== "playing" : true) && (
        <ChatWidget username={rscCredentials?.username ?? null} />
      )}

      {/* Phones (portrait, playing): Invite pill bottom-left, outside the game frame */}
      {showLetterboxUI &&
        isMobile &&
        !isLandscapeMode &&
        viewport.h > viewport.w &&
        rscCredentials &&
        !inviteOpen && <InviteFab onClick={() => setInviteOpen(true)} />}

      {/* Invite friends sheet — referral link + milestones (read-only) */}
      {inviteOpen && rscCredentials && !isAuthScreen && (
        <InviteSheet username={rscCredentials.username} onClose={closeInvite} />
      )}

      {/* PVP Arena first-entry confirm (beta onboarding). One-time per browser
          (localStorage r2h_arena_confirm_seen); matches the app's dark style. */}
      {arenaConfirmOpen && (
        <div
          onClick={() => setArenaConfirmOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 10001,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 340,
              maxWidth: "90vw",
              background: "#101010",
              border: "1px solid #2a2a2a",
              borderRadius: 10,
              padding: 18,
              boxShadow: "0 20px 60px rgba(0,0,0,0.8)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 8,
              }}
            >
              <span style={{ fontSize: 14, color: "#fff", fontWeight: 700 }}>
                Enter PVP Arena
              </span>
              <span
                className="gc-beta-pill"
                style={{ display: "inline-block" }}
              >
                Beta
              </span>
            </div>
            <p style={{ fontSize: 12, color: "#999", marginBottom: 6 }}>
              A separate PvP-only realm. Your main character is untouched.
            </p>
            <ul style={{ margin: "8px 0 14px 16px", padding: 0 }}>
              <li style={{ fontSize: 12, color: "#aaa", marginBottom: 3 }}>
                Same login — fresh fighter,{" "}
                <b style={{ color: "#14F195" }}>nothing carries over</b>
              </li>
              <li style={{ fontSize: 12, color: "#aaa", marginBottom: 3 }}>
                Pick your levels, fight in the Wilderness
              </li>
              <li style={{ fontSize: 12, color: "#aaa" }}>
                Work in progress —{" "}
                <span style={{ color: "#FFB224" }}>
                  item spawns &amp; polish still coming
                </span>
              </li>
            </ul>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => setArenaConfirmOpen(false)}
                style={{
                  flex: 1,
                  padding: "9px 0",
                  borderRadius: 7,
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: "pointer",
                  background: "#1a1a1a",
                  color: "#aaa",
                  border: "1px solid #333",
                }}
              >
                Not yet
              </button>
              <button
                onClick={() => {
                  localStorage.setItem("r2h_arena_confirm_seen", "1");
                  performWorldSwitch();
                }}
                style={{
                  flex: 1,
                  padding: "9px 0",
                  borderRadius: 7,
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: "pointer",
                  background: "#14F195",
                  color: "#06251a",
                  border: "1px solid transparent",
                }}
              >
                Enter the Arena
              </button>
            </div>
          </div>
        </div>
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
