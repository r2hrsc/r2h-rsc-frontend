import { useState, useRef, useEffect, useCallback } from 'react';

interface GameControlsProps {
  onFullscreen: () => void;
  onRotate: () => void;
  onKeyboard: () => void;
  onScripts: () => void;
  onPanels: () => void;
  panelsOpen: boolean;
  isFullscreen: boolean;
  isLandscape: boolean;
  hasKeyboard: boolean; // false on desktop → item hidden
}

/**
 * GameControls — single FAB on the middle-right edge of the game frame.
 * Tap → a compact vertical menu slides out to the LEFT of the FAB with all
 * game controls. Tap an action, the FAB, or outside to close.
 *
 * Chat is NOT here: it lives in the letterbox dock (desktop) / floating
 * bubble. Logout is intentionally NOT here: instant logout mid-combat
 * leaves the player defenseless — removal requested by user.
 */
export function GameControls({
  onFullscreen, onRotate, onKeyboard, onScripts, onPanels,
  panelsOpen, isFullscreen, isLandscape, hasKeyboard,
}: GameControlsProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close when tapping outside the hub + menu
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const act = useCallback((fn: () => void) => {
    fn();
    setOpen(false);
  }, []);

  const items: Array<{ key: string; label: string; icon: React.ReactNode; fn: () => void; active?: boolean }> = [
    {
      key: 'panels', label: panelsOpen ? 'Hide Panels' : 'Show Panels',
      icon: <PanelsIcon />,
      fn: onPanels,
      active: panelsOpen,
    },
    {
      key: 'fs', label: isFullscreen ? 'Exit Fullscreen' : 'Fullscreen',
      icon: <FSIcon exit={isFullscreen} />,
      fn: onFullscreen,
    },
    {
      key: 'rot', label: isLandscape ? 'Exit Landscape' : 'Landscape',
      icon: <RotateIcon />,
      fn: onRotate,
      active: isLandscape,
    },
    ...(hasKeyboard ? [{
      key: 'kb', label: 'Keyboard',
      icon: <KeyboardIcon />,
      fn: onKeyboard,
    }] : []),
    { key: 'scripts', label: 'Scripts', icon: <BoltIcon />, fn: onScripts },
  ];

  return (
    <div className="gc-root" ref={rootRef}>
      {/* Slide-out menu — vertical list to the LEFT of the FAB */}
      {open && (
        <div className="gc-menu" role="menu">
          {items.map(it => (
            <button
              key={it.key}
              className={`gc-menu-item${it.active ? ' gc-active' : ''}`}
              onClick={() => act(it.fn)}
              role="menuitem"
              aria-label={it.label}
            >
              <span className="gc-menu-icon">{it.icon}</span>
              <span className="gc-menu-text">{it.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Hub FAB — middle-right edge of the game frame */}
      <button
        className="gc-hub"
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close menu' : 'Open game controls'}
        aria-expanded={open}
        title="Game controls"
      >
        {open ? <XIcon /> : <MenuIcon />}
      </button>
    </div>
  );
}

/* ── Icons (inline SVG, stroke style matches existing buttons) ── */
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

function PanelsIcon() {
  return <svg viewBox="0 0 24 24" {...S}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M14 4v16" /></svg>;
}
function FSIcon({ exit }: { exit: boolean }) {
  return <svg viewBox="0 0 24 24" {...S}><path d={exit
    ? 'M8 3v3a2 2 0 0 1-2 2H3M16 3v3a2 2 0 0 0 2 2h3M8 21v-3a2 2 0 0 0-2-2H3M16 21v-3a2 2 0 0 1 2-2h3'
    : 'M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3'} /></svg>;
}
function RotateIcon() {
  return <svg viewBox="0 0 24 24" {...S}><rect x="4" y="7" width="16" height="10" rx="1.5" /><path d="M8.5 12h7" /><path d="M12.5 9.5 15 12l-2.5 2.5" /></svg>;
}
function KeyboardIcon() {
  return <svg viewBox="0 0 24 24" {...S}><rect x="2" y="6" width="20" height="14" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M10 14h.01M15 14h3M8 18h8" /></svg>;
}
function BoltIcon() {
  return <svg viewBox="0 0 24 24" {...S}><path d="M13 2 3 14h7l-1 8 11-13h-7l1-7z" /></svg>;
}
function MenuIcon() {
  return <svg viewBox="0 0 24 24" {...S}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" /></svg>;
}
function XIcon() {
  return <svg viewBox="0 0 24 24" {...S}><path d="M18 6L6 18M6 6l12 12" /></svg>;
}
