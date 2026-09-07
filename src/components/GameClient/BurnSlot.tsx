import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * BurnSlot — PLAY-TO-BURN section of the top frame bar (data-slot="burn").
 *
 * Live view of the play-to-burn pipeline (GET {API}/v1/burn/stats, 10s poll).
 * - Idle:    flickering flame + total burned (count-up animated on change)
 *            + "today" subtotal.
 * - Live:    when a new burn lands between polls, the flame bursts, an ember
 *            particle cloud rises, and a toast pops above the bar naming the
 *            player and the feat ("+10 · walletconne3 hit Magic 30").
 * - Hover:   mini-card with the most recent burns (player · feat · amount).
 *
 * RSC skill ids → names (classic 18-skill order, matches server Skill enum).
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
  signature: string | null;
  ts: string;
}

interface BurnStats {
  enabled: boolean;
  dryRun: boolean;
  totalBurned: number;
  burnedToday: number;
  walletBalance: number | null;
  recent: BurnEntry[];
}

interface FlashEvent {
  key: number;
  amount: number;
  label: string;
}

/** Describe a ledger entry in player language. */
function describe(e: BurnEntry): string {
  if (e.status !== 'burned' && e.status !== 'dry_run') return '';
  if (e.username === 'admin') return 'test burn';
  switch (e.event_type) {
    case 'questcomplete':
      return `${e.username} completed a quest${e.quest_name ? ` · ${e.quest_name}` : ''}`;
    case 'playerkill':
      return `${e.username} PK'd ${e.opponent ?? 'a player'} in the wild`;
    case 'duelfinish':
      return `${e.username} won a duel vs ${e.opponent ?? '?'}`;
    case 'levelup':
      if (e.level != null && e.skill != null)
        return `${e.username} hit ${SKILL_NAMES[e.skill] ?? `skill ${e.skill}`} ${e.level}`;
      return `${e.username} leveled up`;
    default:
      return `${e.username} burned`;
  }
}

/** Poll burn stats; detect NEW burned entries between polls. */
function useBurnStats(onNew: (entries: BurnEntry[]) => void): BurnStats | null {
  const [stats, setStats] = useState<BurnStats | null>(null);
  const seen = useRef<Set<string> | null>(null); // null until first load (no toast storm)
  const cb = useRef(onNew);
  cb.current = onNew;

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`${API_URL}/v1/burn/stats`);
        if (!res.ok || !alive) return;
        const data: BurnStats = await res.json();
        if (!alive) return;

        const burned = data.recent.filter(e => e.status === 'burned');
        if (seen.current === null) {
          // First load: remember, don't celebrate history.
          seen.current = new Set(burned.map(e => `${e.username}:${e.ts}`));
        } else {
          const fresh = burned.filter(e => !seen.current!.has(`${e.username}:${e.ts}`));
          fresh.forEach(e => seen.current!.add(`${e.username}:${e.ts}`));
          if (fresh.length) cb.current(fresh);
        }
        setStats(data);
      } catch { /* offline — keep last */ }
    };
    load();
    const t = setInterval(load, 10_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  return stats;
}

/** Count-up animation: eased tween from previous to next value. */
function useCountUp(target: number, duration = 900): number {
  const [display, setDisplay] = useState(target);
  const fromRef = useRef(target);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (target === fromRef.current) return;
    const from = fromRef.current;
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (target - from) * eased);
      if (p < 1) rafRef.current = requestAnimationFrame(step);
      else fromRef.current = target;
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);

  return display;
}

const fmtTokens = (n: number) =>
  n.toLocaleString(undefined, { maximumFractionDigits: 0 });

/** One ember particle's random trajectory (computed once per flash). */
function emberStyle(i: number, total: number): React.CSSProperties {
  const seed = (i * 2654435761) % 1000 / 1000; // deterministic-ish spread
  const x = -14 + seed * 28;                   // px around flame center
  const drift = (i % 2 === 0 ? 1 : -1) * (6 + seed * 14);
  const delay = seed * 0.35;
  const dur = 0.9 + ((i * 7919) % 600) / 1000;
  return {
    left: `${x}px`,
    ['--drift' as string]: `${drift}px`,
    animationDelay: `${delay}s`,
    animationDuration: `${dur}s`,
  };
}

export function BurnSlot() {
  const [flash, setFlash] = useState<FlashEvent | null>(null);
  const flashKey = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onNew = useCallback((entries: BurnEntry[]) => {
    const amount = entries.reduce((s, e) => s + e.tokens, 0);
    const last = entries[entries.length - 1];
    flashKey.current += 1;
    setFlash({ key: flashKey.current, amount, label: describe(last) || 'a player burned' });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setFlash(null), 4200);
  }, []);

  const stats = useBurnStats(onNew);
  const total = useCountUp(stats ? Math.round(stats.totalBurned) : 0);
  const today = stats ? Math.round(stats.burnedToday) : 0;

  return (
    <section data-slot="burn" className={`fb-section fb-burn${flash ? ' fb-burn-flash' : ''}`}>
      {/* Flame — steady flicker; bursts when a burn lands */}
      <span className="fb-flame" aria-hidden>
        <svg viewBox="0 0 24 24" width="13" height="13">
          <path className="fb-flame-outer" d="M12 2c1 4-4 5.5-4 10a4 4 0 0 0 8 0c0-2-1-3-1-3s3 1 3 4a7 7 0 1 1-14 0C4 8 10 6.5 12 2z" />
          <path className="fb-flame-inner" d="M12 9c.5 2-2 2.6-2 5a2 2 0 0 0 4 0c0-1.4-.8-2-.8-2s1.8.6 1.8 2.6a3.2 3.2 0 1 1-6.4 0C8.6 11.6 11 10.7 12 9z" />
        </svg>
        {/* ember burst on live burn */}
        {flash && Array.from({ length: 12 }, (_, i) => (
          <span key={`${flash.key}-${i}`} className="fb-ember" style={emberStyle(i, 12)} />
        ))}
      </span>

      <span className="fb-label">BURNED</span>
      <span className="fb-value fb-burn-total">{fmtTokens(total)} R2H</span>
      {today > 0 && <span className="fb-burn-today">+{fmtTokens(today)} today</span>}
      {stats?.dryRun && <span className="fb-burn-sim" title="Dry-run mode: burns are simulated">SIM</span>}

      {/* Toast — pops above the bar when a burn lands live */}
      {flash && (
        <div key={flash.key} className="fb-burn-toast" role="status">
          <span className="fb-burn-toast-amt">+{fmtTokens(flash.amount)}</span>
          <span className="fb-burn-toast-label">{flash.label}</span>
        </div>
      )}

      {/* Hover card — recent burns */}
      {stats && stats.recent.length > 0 && (
        <div className="fb-burn-card">
          <div className="fb-burn-card-title">RECENT BURNS</div>
          {stats.recent.slice(0, 5).map((e, i) => (
            <div key={`${e.username}-${e.ts}-${i}`} className="fb-burn-card-row">
              <span className="fb-burn-card-feat">{describe(e) || e.username}</span>
              <span className="fb-burn-card-amt">
                {e.status === 'burned' ? `🔥 ${fmtTokens(e.tokens)}` : e.status === 'dry_run' ? `∼${fmtTokens(e.tokens)}` : '·'}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
