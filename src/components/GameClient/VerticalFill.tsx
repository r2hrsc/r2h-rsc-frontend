import { useState, useEffect } from 'react';

/**
 * VerticalFill — fills the vertical letterbox ABOVE and BELOW the game frame
 * (desktop only). The side columns got full-density treatment; these strips
 * do the same for the top/bottom zones so no letterbox space sits empty.
 *
 * Top strip:    live burn feed marquee (recent burns scrolling) + burn stats.
 * Bottom strip: HOW TO BURN rule chips + TOP BURNERS board (from recent feed).
 *
 * Sizing: heights derive from --game-display-h (set by App on the root) —
 * each strip is exactly half the leftover vertical space, clamped ≥ 0.
 * Hidden: mobile (no vertical letterbox to spare) and native fullscreen.
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
    case 'questcomplete': return `quest${e.quest_name ? ` · ${e.quest_name}` : ''}`;
    case 'playerkill': return `PK kill vs ${e.opponent ?? '?'}`;
    case 'duelfinish': return `duel win vs ${e.opponent ?? '?'}`;
    case 'levelup':
      if (e.level != null && e.skill != null)
        return `${SKILL_NAMES[e.skill] ?? 'skill'} ${e.level}`;
      return 'level-up';
    default: return 'burned';
  }
}

/** Lightweight poll — same endpoint, independent of BurnSlot. */
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

/** TOP STRIP — live burn feed marquee + headline stats. */
export function VerticalFillTop() {
  const stats = useBurnStatsLite();
  const recent = (stats?.recent ?? []).filter(e => e.status === 'burned' || e.status === 'dry_run');

  const items = recent.length
    ? recent.map((e, i) => (
        <span key={`${e.ts}-${i}`} className="vf-feed-item">
          <span className="vf-feed-feat"><strong>{e.username}</strong> · {featLabel(e)}</span>
          <span className={`vf-feed-amt${e.status === 'dry_run' ? ' vf-sim' : ''}`}>
            {e.status === 'dry_run' ? '∼' : '🔥'} +{fmt(e.tokens)}
          </span>
          <span className="vf-feed-sep">◆</span>
        </span>
      ))
    : <span className="vf-feed-item"><span className="vf-feed-feat">awaiting the first burn — level up, complete a quest, win a duel</span><span className="vf-feed-sep">◆</span></span>;

  return (
    <div className="vfill vf-top" aria-hidden={false}>
      <div className="vf-head">
        <span className="vf-title">LIVE BURN FEED</span>
        <span className="vf-stats">
          <span className="vf-stat"><em>TOTAL</em> <b>{fmt(stats?.totalBurned ?? 0)}</b></span>
          <span className="vf-stat"><em>TODAY</em> <b>{fmt(stats?.burnedToday ?? 0)}</b></span>
          {stats?.walletBalance != null && (
            <span className="vf-stat"><em>BURN TANK</em> <b>{fmt(stats.walletBalance)}</b></span>
          )}
        </span>
      </div>
      <div className="vf-marquee">
        <div className="vf-marquee-track">
          {items}
          {items /* duplicated for seamless loop */}
        </div>
      </div>
    </div>
  );
}

/** BOTTOM STRIP — how to earn burns + top burners board. */
export function VerticalFillBottom() {
  const stats = useBurnStatsLite();

  const tally = new Map<string, number>();
  for (const e of (stats?.recent ?? [])) {
    if (e.status === 'burned' || e.status === 'dry_run') {
      tally.set(e.username, (tally.get(e.username) ?? 0) + (e.status === 'burned' ? e.tokens : 0));
    }
  }
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);

  return (
    <div className="vfill vf-bottom">
      <div className="vf-rules">
        <span className="vf-rules-title">EARN BURNS</span>
        <span className="vf-chip">LEVEL-UP <b>+10</b></span>
        <span className="vf-chip">QUEST <b>+50</b></span>
        <span className="vf-chip">WILDY PK <b>+25</b></span>
        <span className="vf-chip">DUEL WIN <b>+10</b></span>
      </div>
      {top.length > 0 && (
        <div className="vf-board">
          <span className="vf-board-title">TOP BURNERS</span>
          {top.map(([name, amt], i) => (
            <span key={name} className="vf-board-row">
              <em>{i + 1}</em> <strong>{name}</strong> <b>{fmt(amt)}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
