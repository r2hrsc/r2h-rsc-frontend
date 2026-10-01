import {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useCallback,
  type CSSProperties,
} from "react";
import { WorldKey, WORLDS } from "../../lib/worlds";

interface GameControlsProps {
  onFullscreen: () => void;
  onRotate: () => void;
  onKeyboard: () => void;
  onScripts: () => void;
  onPanels: () => void;
  onSwitchWorld?: (next: WorldKey) => void; // world picker (hidden if not provided)
  currentWorld?: WorldKey; // marks the active world (not clickable)
  onInvite?: () => void; // opens the Invite friends sheet (hidden if not provided)
  onAccount?: () => void; // opens Account details (game username/password)
  panelsOpen: boolean;
  isFullscreen: boolean;
  isLandscape: boolean;
  hasKeyboard: boolean; // false on desktop → item hidden
  canRotate: boolean; // mobile-like device (touch + narrow) → Landscape item hidden on desktop

  edgeInset?: boolean; // game fills the screen width → pull the hub fully on-screen
}

/**
 * GameControls — single FAB on the lower-right of the game frame (75% down,
 * moved from mid-right so it never covers RSC inventory slots).
 * Tap → a compact vertical menu slides out to the LEFT of the FAB, growing
 * UPWARD, with all game controls. Tap an action, the FAB, or outside to close.
 *
 * v404: the former "Enter PVP Arena" toggle is now "Switch World" → a second
 * level listing World 1 (Main), free worlds 3/4, members worlds 5/6/7 and the
 * PVP Arena (Beta). The active world is marked and disabled.
 *
 * Chat is NOT here: it lives in the letterbox dock (desktop) / floating
 * bubble. Logout is intentionally NOT here: instant logout mid-combat
 * leaves the player defenseless — removal requested by user.
 */
export function GameControls({
  onFullscreen,
  onRotate,
  onKeyboard,
  onScripts,
  onPanels,
  onSwitchWorld,
  onInvite,
  onAccount,
  panelsOpen,
  isFullscreen,
  isLandscape,
  hasKeyboard,
  canRotate,
  currentWorld,
  edgeInset,
}: GameControlsProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const [worldMenu, setWorldMenu] = useState(false); // v404: second level — world list
  // v404: world-picker styles are injected at RUNTIME (idempotent <style> tag) so the
  // emitted CSS file hash NEVER moves — the live deploy pattern depends on that
  // (live index-DpAqE8Zi.css is hand-managed; NEVER overwrite it).
  useEffect(() => {
    const ID = "r2h-world-picker-css";
    if (document.getElementById(ID)) return;
    const st = document.createElement("style");
    st.id = ID;
    st.textContent = `
.gc-worlds { display: flex; flex-direction: column; gap: 2px; padding: 4px 0; margin-bottom: 4px; border-bottom: 1px solid #262626; }
.gc-worlds .gc-menu-item { padding-left: 10px; }
.gc-free-pill { flex-shrink: 0; font-size: 8.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; padding: 1.5px 6px; border-radius: 99px; background: #08301c; color: #14F195; border: 1px solid rgba(20, 241, 149, 0.35); }
.gc-active-dot { width: 6px; height: 6px; border-radius: 50%; background: #14F195; flex-shrink: 0; }
`;
    document.head.appendChild(st);
  }, []);

  // Close when tapping outside the hub + menu
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
      setWorldMenu(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // v-fit (9/29): keep the whole menu on screen. It used to be centred on the
  // hub (which sits at 75% of the frame), so on phones — where the frame is
  // short and clips its overflow — the bottom items were cut off. On open we
  // measure and place it position:fixed, clamped inside the visible screen.
  // (Skipped in CSS-rotated mode, where the old layout still applies.)
  const menuRef = useRef<HTMLDivElement>(null);
  // Very short screens (small phones in landscape): slightly tighter rows so
  // every item fits without scrolling.
  const compact = open && window.innerHeight < 420;
  const [menuPos, setMenuPos] = useState<CSSProperties | undefined>(undefined);
  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(undefined);
      return;
    }
    const hub = rootRef.current?.querySelector(".gc-hub") as HTMLElement | null;
    const menu = menuRef.current;
    if (!hub || !menu || rootRef.current?.closest(".game-frame.rotated"))
      return;
    const h = hub.getBoundingClientRect();
    const vh = window.innerHeight,
      vw = window.innerWidth,
      pad = 8;
    const mh = menu.offsetHeight;
    const top = Math.max(
      pad,
      Math.min(h.top + h.height / 2 - mh / 2, vh - mh - pad),
    );
    setMenuPos({
      position: "fixed",
      top,
      right: Math.max(pad, vw - h.left + 8),
      left: "auto",
      transform: "none",
      animation: "none",
      maxHeight: vh - pad * 2,
      overflowY: "auto",
      ...(vh < 420 ? { gap: 3, padding: 4 } : null),
    });
  }, [open, isFullscreen, isLandscape, panelsOpen]);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("resize", close);
    return () => window.removeEventListener("resize", close);
  }, [open]);

  const act = useCallback((fn: () => void) => {
    fn();
    setOpen(false);
    setWorldMenu(false);
  }, []);

  const items: Array<{
    key: string;
    label: string;
    icon: React.ReactNode;
    fn: () => void;
    active?: boolean;
    beta?: boolean;
  }> = [
    ...(onSwitchWorld
      ? [
          {
            key: "world",
            label: "Switch World",
            icon: <WorldIcon />,
            fn: () => setWorldMenu((v) => !v),
          },
        ]
      : []),
    {
      key: "panels",
      label: panelsOpen ? "Hide Panels" : "Show Panels",
      icon: <PanelsIcon />,
      fn: onPanels,
      active: panelsOpen,
    },
    {
      key: "fs",
      label: isFullscreen ? "Exit Fullscreen" : "Fullscreen",
      icon: <FSIcon exit={isFullscreen} />,
      fn: onFullscreen,
    },
    ...(canRotate
      ? [
          {
            key: "rot",
            label: isLandscape ? "Exit Landscape" : "Landscape",
            icon: <RotateIcon />,
            fn: onRotate,
            active: isLandscape,
          },
        ]
      : []),
    ...(hasKeyboard
      ? [
          {
            key: "kb",
            label: "Keyboard",
            icon: <KeyboardIcon />,
            fn: onKeyboard,
          },
        ]
      : []),
    { key: "scripts", label: "Scripts", icon: <BoltIcon />, fn: onScripts },
    ...(onInvite
      ? [
          {
            key: "invite",
            label: "Invite friends",
            icon: <GiftIcon />,
            fn: onInvite,
          },
        ]
      : []),
    ...(onAccount
      ? [
          {
            key: "account",
            label: "Account details",
            icon: <KeyIcon />,
            fn: onAccount,
          },
        ]
      : []),
  ];

  return (
    <div
      className="gc-root"
      ref={rootRef}
      style={edgeInset ? { right: 30 } : undefined}
    >
      {/* Slide-out menu — vertical list to the LEFT of the FAB */}
      {open && (
        <div className="gc-menu" role="menu" ref={menuRef} style={menuPos}>
          {/* v404 second level: world list replaces the item list while open */}
          {worldMenu && onSwitchWorld && (
            <div className="gc-worlds" role="menu">
              {WORLDS.map((w) => {
                const active = w.key === currentWorld;
                return (
                  <button
                    key={String(w.key)}
                    className={`gc-menu-item${active ? " gc-active" : ""}`}
                    style={
                      compact
                        ? { minHeight: 30, paddingTop: 4, paddingBottom: 4 }
                        : undefined
                    }
                    onClick={() => {
                      if (!active) act(() => onSwitchWorld(w.key));
                    }}
                    role="menuitem"
                    aria-label={w.label}
                    disabled={active}
                  >
                    <span className="gc-menu-text">{w.label}</span>
                    {w.isArena ? (
                      <span className="gc-beta-pill">Beta</span>
                    ) : !w.members && w.key !== 1 ? (
                      <span className="gc-free-pill">F2P Version</span>
                    ) : null}
                    {active && (
                      <span
                        className="gc-active-dot"
                        aria-label="current world"
                      />
                    )}
                  </button>
                );
              })}
              <button
                className="gc-menu-item"
                onClick={() => setWorldMenu(false)}
                role="menuitem"
              >
                <span className="gc-menu-text" style={{ color: "#888" }}>
                  ‹ Back
                </span>
              </button>
            </div>
          )}
          {!worldMenu &&
            items.map((it) => (
              <button
                key={it.key}
                className={`gc-menu-item${it.active ? " gc-active" : ""}`}
                style={
                  compact
                    ? { minHeight: 30, paddingTop: 4, paddingBottom: 4 }
                    : undefined
                }
                onClick={() => {
                  // v404.1 BUGFIX (founder RCA): submenu-toggle items must NOT go through
                  // act() — act() closes the menu AND resets worldMenu, so the toggle item
                  // opened and closed the world list in the same click (list unreachable).
                  if (it.key === "world") {
                    it.fn();
                    return;
                  }
                  act(it.fn);
                }}
                role="menuitem"
                aria-label={it.label}
              >
                <span className="gc-menu-icon">{it.icon}</span>
                <span className="gc-menu-text">{it.label}</span>
                {it.beta && <span className="gc-beta-pill">Beta</span>}
              </button>
            ))}
        </div>
      )}

      {/* Hub FAB — lower-right of the game frame (75% down) */}
      <button
        className="gc-hub"
        onClick={() => {
          const n = !open;
          setOpen(n);
          if (!n) setWorldMenu(false);
        }}
        aria-label={open ? "Close menu" : "Open game controls"}
        aria-expanded={open}
        title="Game controls"
      >
        {open ? <XIcon /> : <MenuIcon />}
      </button>
    </div>
  );
}

/* ── Icons (inline SVG, stroke style matches existing buttons) ── */
const S = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function WorldIcon() {
  // globe — world picker
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
    >
      <circle cx="8" cy="8" r="6.2" />
      <path d="M1.8 8h12.4M8 1.8c-2.2 2.4-2.2 10 0 12.4M8 1.8c2.2 2.4 2.2 10 0 12.4" />
    </svg>
  );
}

function PanelsIcon() {
  return (
    <svg viewBox="0 0 24 24" {...S}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M14 4v16" />
    </svg>
  );
}
function FSIcon({ exit }: { exit: boolean }) {
  return (
    <svg viewBox="0 0 24 24" {...S}>
      <path
        d={
          exit
            ? "M8 3v3a2 2 0 0 1-2 2H3M16 3v3a2 2 0 0 0 2 2h3M8 21v-3a2 2 0 0 0-2-2H3M16 21v-3a2 2 0 0 1 2-2h3"
            : "M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"
        }
      />
    </svg>
  );
}
function RotateIcon() {
  return (
    <svg viewBox="0 0 24 24" {...S}>
      <rect x="4" y="7" width="16" height="10" rx="1.5" />
      <path d="M8.5 12h7" />
      <path d="M12.5 9.5 15 12l-2.5 2.5" />
    </svg>
  );
}
function KeyboardIcon() {
  return (
    <svg viewBox="0 0 24 24" {...S}>
      <rect x="2" y="6" width="20" height="14" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M10 14h.01M15 14h3M8 18h8" />
    </svg>
  );
}
function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M13 2 3 14h7l-1 8 11-13h-7l1-7z" />
    </svg>
  );
}
function KeyIcon() {
  return (
    <svg viewBox="0 0 24 24" {...S}>
      <circle cx="7.5" cy="15.5" r="4.5" />
      <path d="m10.7 12.3 9.8-9.8" />
      <path d="m16 7 3 3" />
      <path d="m19 4 2 2" />
    </svg>
  );
}
function GiftIcon() {
  return (
    <svg viewBox="0 0 24 24" {...S}>
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13" />
      <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
      <path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" />
    </svg>
  );
}
function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" {...S}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />
    </svg>
  );
}
function XIcon() {
  return (
    <svg viewBox="0 0 24 24" {...S}>
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  );
}
