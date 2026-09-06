import { useState, useEffect, useRef, useCallback } from 'react';

// ── Phase 1 letterbox panel ──────────────────────────────────────────────
// Fills the black bars that flank the 512×345 game on wide screens.
// Anchored to the game frame's rect (never overlaps the canvas), hidden in
// fullscreen, hidden when the letterbox is too narrow to be useful.
// v386: TOGGLE — on near-4:3 viewports (letterbox < 150px) the user can open
// the panel anyway; App scales the game down to make room. On mobile portrait
// a compact bottom bar replaces the column.
// Data: R2H_ACTIVITY postMessages from the game page's read-only ActivityMonitor
// (XP / level / loot deltas) + /v1/world/stats poll for the status strip.

interface ActivityEvent {
  kind: 'xp' | 'level' | 'loot' | 'lootBatch';
  skill?: number;
  skillName?: string;
  xpGain?: number;
  level?: number;
  itemId?: number;
  count?: number;
  items?: { itemId: number; count: number }[];
}

interface FeedRow {
  id: number;
  ts: number;
  text: string;
  highlight: boolean;
}

interface WorldStats {
  world: string;
  worldNumber: number;
  playersOnline: number;
  maxPlayers: number;
}

const API_URL = import.meta.env.VITE_API_URL || 'https://api.r2hrsc.xyz';
const MAX_ROWS = 40;
const MIN_COLUMN_WIDTH = 150; // natural letterbox below this: panel needs the toggle
const OPEN_COLUMN_WIDTH = 240; // when toggled open on narrow letterboxes, make this much room

function fmtAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return 'now';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

function fmtNum(n?: number): string {
  if (n === undefined) return '?';
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

/** Shared feed collection — used by the column, the toggle, and the mobile bar. */
function useActivityFeed(itemNames: Record<string, string>) {
  const [rows, setRows] = useState<FeedRow[]>([]);
  const rowId = useRef(0);

  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type !== 'R2H_ACTIVITY') return;
      const events: ActivityEvent[] = e.data.events || [];
      const newRows: FeedRow[] = [];
      for (const ev of events) {
        if (ev.kind === 'level') {
          newRows.push({ id: rowId.current++, ts: Date.now(), highlight: true,
            text: `${ev.skillName} level ${ev.level}!` });
        } else if (ev.kind === 'xp') {
          newRows.push({ id: rowId.current++, ts: Date.now(), highlight: false,
            text: `+${fmtNum(ev.xpGain)} ${ev.skillName} XP` });
        } else if (ev.kind === 'lootBatch' && ev.items) {
          const parts = ev.items
            .slice(0, 4)
            .map(it => `${itemNames[String(it.itemId)] || 'item ' + it.itemId}${it.count > 1 ? ' ×' + it.count : ''}`);
          const more = ev.items.length > 4 ? ` +${ev.items.length - 4}` : '';
          newRows.push({ id: rowId.current++, ts: Date.now(), highlight: false,
            text: `Loot: ${parts.join(', ')}${more}` });
        }
      }
      if (newRows.length > 0) {
        setRows(prev => [...newRows, ...prev].slice(0, MAX_ROWS));
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [itemNames]);

  return rows;
}

/** The side column. Absolute-positioned against the game frame (parent has position:relative). */
export function ActivitySidebar({ sideWidth, itemNames }: { sideWidth: number; itemNames: Record<string, string> }) {
  const rows = useActivityFeed(itemNames);
  if (sideWidth < 100) return null;

  return (
    <div
      className="activity-sidebar"
      style={{
        position: 'absolute',
        top: 0,
        right: -sideWidth - 12, // 12px gap from the game edge
        width: sideWidth,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        pointerEvents: 'auto',
      }}
    >
      <div className="asb-header">
        <span className="asb-title">ACTIVITY</span>
        <span className="asb-live-dot" />
      </div>
      <div className="asb-feed">
        {rows.length === 0 && (
          <div className="asb-empty">Play to see your XP drops and loot here.</div>
        )}
        {rows.map(r => (
          <div key={r.id} className={r.highlight ? 'asb-row asb-row-level' : 'asb-row'}>
            <span className="asb-ago">{fmtAgo(r.ts)}</span>
            <span className="asb-text">{r.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Toggle button docked top-right of the game frame — same family as fs-toggle. */
export function PanelToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <button
      className="panel-toggle"
      onClick={onToggle}
      title={open ? 'Hide activity panel' : 'Show activity panel'}
      aria-label={open ? 'Hide activity panel' : 'Show activity panel'}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {open ? (
          <path d="M3 3h18v18H3zM15 3v18" />
        ) : (
          <path d="M3 3h18v18H3zM15 3v18" />
        )}
      </svg>
    </button>
  );
}

/** Mobile portrait: compact bar in the large lower letterbox — last event + status. */
export function MobileActivityBar({ itemNames }: { itemNames: Record<string, string> }) {
  const rows = useActivityFeed(itemNames);
  const [stats, setStats] = useState<WorldStats | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`${API_URL}/v1/world/stats`);
        if (!res.ok) return;
        const data = await res.json();
        if (alive) setStats(data);
      } catch { /* keep last */ }
    };
    load();
    const t = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const last = rows[0];

  return (
    <div className="mobile-activity-bar" style={{ position: 'absolute', left: 0, right: 0, bottom: -46, height: 36 }}>
      <span className="ws-dot" />
      <span className="ws-players">{stats ? `${stats.playersOnline} online` : '…'}</span>
      <span className="ws-sep">·</span>
      <span className={last?.highlight ? 'mab-text mab-level' : 'mab-text'}>
        {last ? `${last.text} · ${fmtAgo(last.ts)}` : 'Your XP drops and loot appear here'}
      </span>
    </div>
  );
}

/** Thin status strip below the game — real players-online from the game DB. */
export function WorldStatusStrip() {
  const [stats, setStats] = useState<WorldStats | null>(null);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`${API_URL}/v1/world/stats`);
        if (!res.ok) return;
        const data = await res.json();
        if (alive) setStats(data);
      } catch { /* offline — keep last */ }
    };
    load();
    const t = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  return (
    <div className="world-strip" style={{ position: 'absolute', left: 0, right: 0, bottom: -34, height: 24 }}>
      <span className="ws-dot" />
      <span className="ws-name">{stats ? stats.world : 'Robinscape'}</span>
      <span className="ws-sep">·</span>
      <span className="ws-players">
        {stats ? `${stats.playersOnline} online` : 'connecting…'}
      </span>
      {stats && stats.playersOnline > 0 && (
        <>
          <span className="ws-sep">·</span>
          <span className="ws-world">world {stats.worldNumber}</span>
        </>
      )}
    </div>
  );
}

/** Loads the item-id→name map once (cached 24h by the CDN/sidecar). */
export function useItemNames(): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    let alive = true;
    fetch(`${API_URL}/v1/world/items`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (alive && d?.items) setNames(d.items); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return names;
}

/**
 * Letterbox geometry. `open` (toggle state) is the single source of truth:
 * - open + natural room  → column at natural width, game unscaled
 * - open + thin letterbox → game scales down just enough for a proper column
 * - closed → no column, game at natural scale
 */
export function useLetterbox(open: boolean): {
  sideWidth: number;
  naturalSideWidth: number;
  forcedScaleDown: boolean;
  effectiveScaleFactor: number;
} {
  const [geom, setGeom] = useState({ sideWidth: 0, naturalSideWidth: 0, forcedScaleDown: false, effectiveScaleFactor: 1 });

  const recalc = useCallback(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const naturalGameW = Math.min(vw, Math.round(512 * Math.min(vh / 345 * 0.95, 6)));
    const natural = Math.max(0, Math.floor((vw - naturalGameW) / 2) - 24);

    if (!open) {
      setGeom({ sideWidth: 0, naturalSideWidth: natural, forcedScaleDown: false, effectiveScaleFactor: 1 });
      return;
    }
    if (natural >= MIN_COLUMN_WIDTH) {
      setGeom({ sideWidth: natural, naturalSideWidth: natural, forcedScaleDown: false, effectiveScaleFactor: 1 });
      return;
    }
    // Open on a narrow letterbox: shrink the game just enough to fit
    // a proper column (never below 60% of the natural size).
    const targetGameW = Math.max(Math.round(512 * 0.6), vw - OPEN_COLUMN_WIDTH - 36);
    const factor = Math.min(1, targetGameW / naturalGameW);
    const gameW = Math.round(naturalGameW * factor);
    setGeom({
      sideWidth: Math.max(0, Math.floor((vw - gameW) / 2) - 24),
      naturalSideWidth: natural,
      forcedScaleDown: true,
      effectiveScaleFactor: factor,
    });
  }, [open]);

  useEffect(() => {
    recalc();
    window.addEventListener('resize', recalc);
    document.addEventListener('fullscreenchange', recalc);
    return () => {
      window.removeEventListener('resize', recalc);
      document.removeEventListener('fullscreenchange', recalc);
    };
  }, [recalc]);

  return geom;
}

/** Default toggle state: open when the viewport has natural side letterbox room. */
export function computeDefaultPanelOpen(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.innerWidth < 768) return false; // mobile portrait → bottom bar instead
  const naturalGameW = Math.min(window.innerWidth, Math.round(512 * Math.min(window.innerHeight / 345 * 0.95, 6)));
  const natural = Math.max(0, Math.floor((window.innerWidth - naturalGameW) / 2) - 24);
  return natural >= MIN_COLUMN_WIDTH;
}
