import { useEffect, useMemo } from 'react';
import { WorldKey, WORLDS, worldDef } from '../lib/worlds';

interface PreAuthWorldPickerProps {
  world: WorldKey;
  onSelect: (next: WorldKey) => void;
  /** Called when the visitor picks the PVP Arena pre-auth (App shows the arena confirm). */
  onRequestArena: () => void;
}

/**
 * PreAuthWorldPicker — v404.2: world selection BEFORE sign-in (founder request).
 * A compact strip that renders under the auth overlay's sign-in cluster. Selecting
 * a world here persists it (localStorage) and the game mounts on it after auth.
 * Default path unchanged: no stored choice = World 1, zero interaction.
 *
 * Styles are RUNTIME-INJECTED (idempotent <style id="r2h-preauth-world-css">) so the
 * emitted CSS file hash NEVER moves — the live deploy pattern depends on that
 * (live index-DpAqE8Zi.css is hand-managed; NEVER overwrite it).
 */
export default function PreAuthWorldPicker({ world, onSelect, onRequestArena }: PreAuthWorldPickerProps) {
  // idempotent runtime styles
  useEffect(() => {
    const ID = 'r2h-preauth-world-css';
    if (document.getElementById(ID)) return;
    const st = document.createElement('style');
    st.id = ID;
    st.textContent = `
.r2h-pw-root { display: flex; flex-direction: column; align-items: center; gap: 8px; margin: 12px auto 0; width: 400px; max-width: 94vw; font-family: inherit; }
.r2h-pw-label { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: #777; }
.r2h-pw-row { display: flex; flex-wrap: wrap; gap: 7px; justify-content: center; }
.r2h-pw-btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 14px; min-height: 38px; font-size: 13px; font-weight: 600; color: #bbb; background: #141414; border: 1px solid #2a2a2a; border-radius: 9px; cursor: pointer; }
.r2h-pw-btn:hover { border-color: #3d3d3d; color: #e5e5e5; }
.r2h-pw-btn.sel { color: #14F195; border-color: rgba(20, 241, 149, 0.55); background: #0a2417; }
.r2h-pw-pill { font-size: 9px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; padding: 2px 6px; border-radius: 99px; background: #08301c; color: #14F195; border: 1px solid rgba(20, 241, 149, 0.35); }
.r2h-pw-hint { font-size: 12px; color: #888; }
`;
    document.head.appendChild(st);
  }, []);

  const hint = useMemo(() => {
    const d = worldDef(world);
    return d.isArena ? 'Arena selected: you will spawn in the PVP Arena.' : `You'll start on ${d.label.replace(' · ', ' ')}.`;
  }, [world]);

  return (
    <div className="r2h-pw-root" role="radiogroup" aria-label="Choose a world before signing in">
      <span className="r2h-pw-label">Choose your world</span>
      <div className="r2h-pw-row">
        {WORLDS.map(w => (
          <button
            key={String(w.key)}
            className={`r2h-pw-btn${w.key === world ? ' sel' : ''}`}
            role="radio"
            aria-checked={w.key === world}
            title={w.isArena ? 'PVP Arena — a separate realm' : `${w.display} is server world ${w.key}`}
            onClick={() => (w.isArena ? onRequestArena() : onSelect(w.key))}
          >
            {w.display}
            {!w.isArena && !w.members && <span className="r2h-pw-pill">F2P Version</span>}
            {w.isArena && <span className="r2h-pw-pill" style={{ background: '#3a2a08', color: '#FFB224', borderColor: 'rgba(255,178,36,0.35)' }}>Beta</span>}
          </button>
        ))}
      </div>
      <span className="r2h-pw-hint">{hint}</span>
    </div>
  );
}
