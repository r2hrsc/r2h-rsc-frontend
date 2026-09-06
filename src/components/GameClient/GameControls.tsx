import { useState, useRef, useEffect, useCallback } from 'react';

interface GameControlsProps {
  onFullscreen: () => void;
  onRotate: () => void;
  onKeyboard: () => void;
  onScripts: () => void;
  onChat: () => void;
  onLogout: () => void;
  isFullscreen: boolean;
  isLandscape: boolean;
  hasKeyboard: boolean; // false on desktop → item hidden
}

/**
 * GameControls — single FAB on the middle-right edge of the game frame.
 * Tap → radial fan of action buttons; tap again (or outside) to collapse.
 */
export function GameControls({
  onFullscreen, onRotate, onKeyboard, onScripts, onChat, onLogout,
  isFullscreen, isLandscape, hasKeyboard,
}: GameControlsProps) {
  const [open, setOpen] = useState(false);
  const hubRef = useRef<HTMLButtonElement>(null);

  // Close when tapping outside
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement;
      if (hubRef.current?.contains(t)) return;
      if (t.closest('.gc-item')) return;
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
      key: 'fs', label: isFullscreen ? 'Exit Full' : 'Fullscreen',
      icon: <FSIcon exit={isFullscreen} />,
      fn: onFullscreen,
    },
    {
      key: 'rot', label: isLandscape ? 'Upright' : 'Landscape',
      icon: <RotateIcon active={isLandscape} />,
      fn: onRotate,
    },
    ...(hasKeyboard ? [{
      key: 'kb', label: 'Keyboard',
      icon: <KeyboardIcon />,
      fn: onKeyboard,
    }] : []),
    { key: 'scripts', label: 'Scripts', icon: <BoltIcon />, fn: onScripts },
    { key: 'chat', label: 'Chat', icon: <ChatIcon />, fn: onChat },
    { key: 'logout', label: 'Logout', icon: <LogoutIcon />, fn: onLogout },
  ];

  return (
    <div className="gc-root">
      {/* Fan items — semicircle bulging INTO the game frame (hub sits on the
          right edge): first item directly above the hub, last directly below. */}
      {open && items.map((it, i) => {
        const n = items.length;
        // θ from -70° (above) to +70° (below); x negated → arc bulges left.
        // ±70° (not ±90°) keeps the first/last buttons fully inside the frame.
        const theta = (-70 + (140 / (n - 1)) * i) * Math.PI / 180;
        const r = 84; // px from hub center
        const x = -Math.cos(theta) * r;
        const y = Math.sin(theta) * r;
        return (
          <button
            key={it.key}
            className={`gc-item${it.active ? ' gc-active' : ''}`}
            style={{
              transform: `translate(${x}px, ${y}px)`,
              transitionDelay: `${(n - 1 - i) * 22}ms`,
            }}
            onClick={() => act(it.fn)}
            aria-label={it.label}
            title={it.label}
          >
            {it.icon}
            <span className="gc-label">{it.label}</span>
          </button>
        );
      })}

      {/* Hub FAB — middle-right edge of the game frame */}
      <button
        ref={hubRef}
        className="gc-hub"
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Close menu' : 'Open game controls'}
        aria-expanded={open}
        title="Game controls"
      >
        <span className={`gc-hub-icon${open ? ' open' : ''}`}>
          {open ? <XIcon /> : <MenuIcon />}
        </span>
      </button>
    </div>
  );
}

/* ── Icons (inline SVG, stroke style matches .fs-toggle) ── */
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

function FSIcon({ exit }: { exit: boolean }) {
  return <svg viewBox="0 0 24 24" {...S}><path d={exit
    ? 'M8 3v3a2 2 0 0 1-2 2H3M16 3v3a2 2 0 0 0 2 2h3M8 21v-3a2 2 0 0 0-2-2H3M16 21v-3a2 2 0 0 1 2-2h3'
    : 'M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3'} /></svg>;
}
function RotateIcon({ active }: { active: boolean }) {
  return <svg viewBox="0 0 24 24" {...S}><rect x="4" y="7" width="16" height="10" rx="1.5" /><path d="M8.5 12h7" /><path d="M12.5 9.5 15 12l-2.5 2.5" /></svg>;
}
function KeyboardIcon() {
  return <svg viewBox="0 0 24 24" {...S}><rect x="2" y="6" width="20" height="14" rx="2" /><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M10 14h.01M14 14h.01M18 14h.01M8 18h8" /></svg>;
}
function BoltIcon() {
  return <svg viewBox="0 0 24 24" {...S}><path d="M13 2 3 14h7l-1 8 11-13h-7l1-7z" /></svg>;
}
function ChatIcon() {
  return <svg viewBox="0 0 24 24" {...S}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
}
function LogoutIcon() {
  return <svg viewBox="0 0 24 24" {...S}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5" /><path d="M21 12H9" /></svg>;
}
function MenuIcon() {
  return <svg viewBox="0 0 24 24" {...S}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" /></svg>;
}
function XIcon() {
  return <svg viewBox="0 0 24 24" {...S}><path d="M18 6L6 18M6 6l12 12" /></svg>;
}
