import { useState, useEffect } from 'react';
import { ZoomPanel } from './ZoomPanel';

/**
 * VerticalFill — the letterbox sections ABOVE and BELOW the game frame.
 *
 * DESIGN SYSTEM (ui-ux-pro-max: Retro-Futurism / burn HUD):
 *   Orbitron display + JetBrains Mono data · CRT scanlines · neon glow ·
 *   chamfered HUD panels · fire-orange gradient accents on deep navy.
 *
 * ZOOM: ALL content is wrapped in ZoomPanel — the columns' mechanism
 * (layout at z× CSS size, transform scale(1/z), z = devicePixelRatio) —
 * so every text element in these sections renders at constant physical
 * size under browser zoom, exactly like the left/right columns.
 *
 * Top:    LIVE BURN FEED — HUD stat blocks + scrolling fire ticker.
 * Bottom: EARN BURNS angular chips + TOP BURNERS leaderboard.
 */

const API_URL = import.meta.env.VITE_API_URL || 'https://api.r2hrsc.xyz';

const SKILL_NAMES = [
  'Attack', 'Defense', 'Strength', 'Hits', 'Ranged', 'Prayer', 'Magic',
  'Cooking', 'Woodcut', 'Fletching', 'Fishing', 'Firemaking', 'Crafting',
  'Smithing', 'Mining', 'Herblaw', 'Agility', 'Thieving',
];

interface BurnEntry {
  username: string;
  skill: number | null;
  level: number | null;
  event_type?: string;
  quest_name?: string | null;
  opponent?: string | null;
  tokens: number;
  status: string;
  ts: string;
}

interface BurnStats {
  totalBurned: number;
  burnedToday: number;
  walletBalance: number | null;
  recent: BurnEntry[];
}

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

function featLabel(e: BurnEntry): string {
  switch (e.event_type) {
    case 'questcomplete': return `QUEST COMPLETE${e.quest_name ? ` · ${e.quest_name}` : ''}`;
    case 'playerkill': return `WILDY PK vs ${e.opponent ?? '?'}`;
    case 'duelfinish': return `DUEL WIN vs ${e.opponent ?? '?'}`;
    case 'levelup':
      if (e.level != null && e.skill != null)
        return `${(SKILL_NAMES[e.skill] ?? 'SKILL').toUpperCase()} ${e.level}`;
      return 'LEVEL-UP';
    default: return 'BURNED';
  }
}

function useBurnStatsLite(): BurnStats | null {
  const [stats, setStats] = useState<BurnStats | null>(null);
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`${API_URL}/v1/burn/stats`);
        if (res.ok && alive) setStats(await res.json());
      } catch { /* keep last */ }
    };
    load();
    const t = setInterval(load, 10_000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  return stats;
}

/** TOP — LIVE BURN FEED: HUD stat blocks + fire ticker. */
export function VerticalFillTop() {
  const stats = useBurnStatsLite();
  return (
    <div className="vfill vf-top vf2">
      <ZoomPanel anchor="inset" style={{ justifyContent: 'flex-end' }}>
        <div className="vf2-head">
          <span className="vf2-logo">
            <span className="vf2-logo-flame" aria-hidden>
              <svg viewBox="0 0 24 24" width="12" height="12">
                <path fill="#ff4500" d="M12 2c1 4-4 5.5-4 10a4 4 0 0 0 8 0c0-2-1-3-1-3s3 1 3 4a7 7 0 1 1-14 0C4 8 10 6.5 12 2z" />
                <path fill="#ffd166" d="M12 9c.5 2-2 2.6-2 5a2 2 0 0 0 4 0c0-1.4-.8-2-.8-2s1.8.6 1.8 2.6a3.2 3.2 0 1 1-6.4 0C8.6 11.6 11 10.7 12 9z" />
              </svg>
            </span>
            LIVE BURN FEED
          </span>
          <div className="vf2-stats">
            <span className="vf2-stat"><em>TOTAL</em><b>{fmt(stats?.totalBurned ?? 0)}</b></span>
            <span className="vf2-stat"><em>TODAY</em><b>{fmt(stats?.burnedToday ?? 0)}</b></span>
            {stats?.walletBalance != null && (
              <span className="vf2-stat"><em>BURN TANK</em><b>{fmt(stats.walletBalance)}</b></span>
            )}
          </div>
        </div>
      </ZoomPanel>
    </div>
  );
}

/** BOTTOM — EARN BURNS chips + TOP BURNERS leaderboard. */
export function VerticalFillBottom() {
  const stats = useBurnStatsLite();

  const tally = new Map<string, number>();
  for (const e of (stats?.recent ?? [])) {
    if (e.status === 'burned') tally.set(e.username, (tally.get(e.username) ?? 0) + e.tokens);
  }
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const RANK_COLORS = ['#ffd166', '#c9d1d9', '#cd7f32', '#8a8f98', '#8a8f98'];

  return (
    <div className="vfill vf-bottom vf2">
      <ZoomPanel center anchor="inset">
        <div className="vf2-scan" aria-hidden />
        <div className="vf2-btm">
          <div className="vf2-rules">
            <span className="vf2-rules-title">EARN BURNS</span>
            <span className="vf2-chip">LEVEL-UP<b>+10</b></span>
            <span className="vf2-chip">QUEST<b>+50</b></span>
            <span className="vf2-chip">WILDY PK<b>+25</b></span>
            <span className="vf2-chip">DUEL WIN<b>+10</b></span>
          </div>
          {top.length > 0 && (
            <div className="vf2-board">
              <span className="vf2-rules-title">TOP BURNERS</span>
              {top.map(([name, amt], i) => (
                <span key={name} className="vf2-board-row">
                  <em style={{ color: RANK_COLORS[i] }}>{String(i + 1).padStart(2, '0')}</em>
                  <strong>{name}</strong>
                  <b>{fmt(amt)}</b>
                </span>
              ))}
            </div>
          )}
        </div>
      </ZoomPanel>
    </div>
  );
}
