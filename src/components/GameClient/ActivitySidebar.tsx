import { useState, useEffect, useRef, useCallback } from 'react';

// ── Phase 1 letterbox panel ──────────────────────────────────────────────
// Fills the black bars that flank the 512×345 game on wide screens.
// Anchored to the game frame's rect (never overlaps the canvas), hidden in
// fullscreen, hidden when the letterbox is too narrow to be useful.
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
const MIN_COLUMN_WIDTH = 150; // below this the letterbox is too thin — hide

function fmtAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 5) return 'now';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

/** The side column. Absolute-positioned against the game frame (parent has position:relative). */
export function ActivitySidebar({ sideWidth, itemNames }: { sideWidth: number; itemNames: Record<string, string> }) {
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

  if (sideWidth < MIN_COLUMN_WIDTH) return null;

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

function fmtNum(n?: number): string {
  if (n === undefined) return '?';
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

/** Letterbox geometry — recomputed with the game scale. Exported for App. */
export function useLetterbox(): { sideWidth: number } {
  const [sideWidth, setSideWidth] = useState(0);

  const recalc = useCallback(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gameW = Math.min(vw, Math.round(512 * Math.min(vh / 345 * 0.95, 6)));
    const width = Math.max(0, Math.floor((vw - gameW) / 2) - 24);
    setSideWidth(width);
  }, []);

  useEffect(() => {
    recalc();
    window.addEventListener('resize', recalc);
    document.addEventListener('fullscreenchange', recalc);
    return () => {
      window.removeEventListener('resize', recalc);
      document.removeEventListener('fullscreenchange', recalc);
    };
  }, [recalc]);

  return { sideWidth };
}
