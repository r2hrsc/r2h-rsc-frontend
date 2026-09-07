import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';

/**
 * BurnSlot — PLAY-TO-BURN section of the top frame bar (data-slot="burn").
 *
 * Live view of the play-to-burn pipeline (GET {API}/v1/burn/stats, 10s poll).
 *
 * IDLE:   three-layer flame with glow halo · gradient count-up total ·
 *         neon "+N today" chip · SIM badge in dry-run · degen hover card.
 *
 * LIVE BURN (the bang): a full-width banner portals into the game frame —
 *   "+10 R2H BURNED" in glowing gold→orange gradient, player + feat subline,
 *   glitch entrance, scanlines, ember storm — while the ENTIRE game frame
 *   pulses with a burning edge glow and the counter slams up.
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
  title: string;
  label: string;
}

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
  const seen = useRef<Set<string> | null>( null ); // null until first load (no toast storm)
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

/** Eased count-up tween. */
function useCountUp(target: number, duration = 1100): number {
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

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

const EMBER_COLORS = ['#ffd166', '#ff9f1c', '#ff6b35', '#ff4500', '#ffb36b'];

/** Deterministic-per-index ember particle style. */
function emberStyle(i: number): React.CSSProperties {
  const r1 = ((i * 2654435761) % 997) / 997;
  const r2 = ((i * 40503) % 991) / 991;
  const size = 2 + r2 * 4;
  return {
    left: `${(r1 * 100).toFixed(1)}%`,
    width: size,
    height: size,
    background: EMBER_COLORS[i % EMBER_COLORS.length],
    ['--drift' as string]: `${(r2 * 44 - 22).toFixed(0)}px`,
    ['--sway' as string]: `${(r1 * 30 - 15).toFixed(0)}px`,
    animationDelay: `${(r1 * 0.5).toFixed(2)}s`,
    animationDuration: `${(1.0 + r2 * 1.1).toFixed(2)}s`,
    filter: `blur(${(r2 * 0.8).toFixed(1)}px)`,
  };
}

export function BurnSlot() {
  const [flash, setFlash] = useState<FlashEvent | null>(null);
  const flashKey = useRef(0);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLElement | null>(null);
  const [frameEl, setFrameEl] = useState<HTMLElement | null>(null);
  const [slam, setSlam] = useState(0);

  // Locate the game-frame ancestor once (banner portals into it).
  useEffect(() => {
    if (rootRef.current) {
      setFrameEl(rootRef.current.closest('.game-frame') as HTMLElement | null);
    }
  }, []);

  // Frame burning-edge: toggle a class on the game frame for the flash duration.
  useEffect(() => {
    if (!frameEl || !flash) return;
    frameEl.classList.add('burn-frame-glow');
    const t = setTimeout(() => frameEl.classList.remove('burn-frame-glow'), 3400);
    return () => { frameEl.classList.remove('burn-frame-glow'); clearTimeout(t); };
  }, [frameEl, flash]);

  const onNew = useCallback((entries: BurnEntry[]) => {
    const amount = entries.reduce((s, e) => s + e.tokens, 0);
    const last = entries[entries.length - 1];
    flashKey.current += 1;
    setFlash({
      key: flashKey.current,
      amount,
      title: `+${fmt(amount)} R2H BURNED`,
      label: describe(last) || 'a player burned',
    });
    setSlam(slam + 1);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setFlash(null), 3600);
  }, [slam]);

  const stats = useBurnStats(onNew);
  const total = useCountUp(stats ? Math.round(stats.totalBurned) : 0);
  const today = stats ? Math.round(stats.burnedToday) : 0;

  return (
    <section ref={rootRef} data-slot="burn" className={`fb-section fb-burn${flash ? ' fb-burn-flash' : ''}`}>
      {/* Flame — three layers, glow halo */}
      <span className="fb-flame" aria-hidden>
        <span className="fb-flame-halo" />
        <svg viewBox="0 0 24 24" width="15" height="15">
          <path className="fb-flame-outer" d="M12 2c1 4-4 5.5-4 10a4 4 0 0 0 8 0c0-2-1-3-1-3s3 1 3 4a7 7 0 1 1-14 0C4 8 10 6.5 12 2z" />
          <path className="fb-flame-mid" d="M12 6c.8 3.2-3 4.2-3 7.6a3 3 0 0 0 6 0c0-1.6-.9-2.4-.9-2.4s2.2.8 2.2 3.2a5.2 5.2 0 1 1-10.4 0C5.9 9.7 10.4 8.6 12 6z" />
          <path className="fb-flame-inner" d="M12 11c.4 1.6-1.6 2-1.6 3.9a1.6 1.6 0 0 0 3.2 0c0-1.1-.6-1.6-.6-1.6s1.4.5 1.4 2a2.6 2.6 0 1 1-5.2 0c0-3 2.6-3.4 2.8-4.3z" />
        </svg>
      </span>

      <span className="fb-label">BURNED</span>
      <span key={slam} className="fb-value fb-burn-total">{fmt(total)} R2H</span>
      {today > 0 && <span className="fb-burn-today">+{fmt(today)} today</span>}
      {stats?.dryRun && <span className="fb-burn-sim" title="Dry-run mode: burns are simulated">SIM</span>}

      {/* Hover card — degen panel */}
      {stats && stats.recent.length > 0 && (
        <div className="fb-burn-card">
          <div className="fb-burn-card-title">RECENT BURNS</div>
          {stats.recent.slice(0, 5).map((e, i) => (
            <div key={`${e.username}-${e.ts}-${i}`} className="fb-burn-card-row">
              <span className="fb-burn-card-feat">{describe(e) || e.username}</span>
              <span className="fb-burn-card-amt">
                {e.status === 'burned' ? `🔥 ${fmt(e.tokens)}` : e.status === 'dry_run' ? `∼${fmt(e.tokens)}` : '·'}
              </span>
            </div>
          ))}
          {stats.walletBalance != null && (
            <div className="fb-burn-card-balance">
              <span>burn tank</span>
              <span>{fmt(stats.walletBalance)} R2H</span>
            </div>
          )}
        </div>
      )}

      {/* THE BANG — banner portals into the game frame, centered over the game */}
      {flash && frameEl && createPortal(
        <div key={flash.key} className="burn-banner" role="status">
          <div className="burn-banner-scan" aria-hidden />
          <div className="burn-banner-title">{flash.title}</div>
          <div className="burn-banner-sub">{flash.label}</div>
          <div className="burn-banner-embers" aria-hidden>
            {Array.from({ length: 26 }, (_, i) => (
              <span key={i} className="burn-ember" style={emberStyle(i)} />
            ))}
          </div>
        </div>,
        frameEl
      )}
    </section>
  );
}
