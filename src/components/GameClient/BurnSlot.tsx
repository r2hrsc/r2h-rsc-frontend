import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * BurnSlot — PLAY-TO-BURN section of the top frame bar (data-slot="burn").
 *
 * Live view of the play-to-burn pipeline (GET {API}/v1/burn/stats, 10s poll).
 * The bar chip only (user 9/8: the scoreboard/ribbon overlays and the
 * frame fire-glow were removed — new burns register in the top bar feed):
 * three-layer flame with halo, gradient count-up total, neon today chip.
 * The counter slams on each new burn.
 */

const API_URL = import.meta.env.VITE_API_URL || 'https://api.r2hrsc.xyz';

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

/** Poll burn stats; detect NEW burned entries between polls. */
function useBurnStats(onNew: (entries: BurnEntry[]) => void): BurnStats | null {
  const [stats, setStats] = useState<BurnStats | null>(null);
  const seen = useRef<Set<string> | null>(null); // null until first load
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

export function BurnSlot() {
  const [, setSlam] = useState(0);
  const slamRef = useRef(0);

  const onNew = useCallback(() => {
    slamRef.current += 1;
    setSlam(slamRef.current); // re-key the counter → slam animation
  }, []);

  const stats = useBurnStats(onNew);
  const total = useCountUp(stats ? Math.round(stats.totalBurned) : 0);
  const today = stats ? Math.round(stats.burnedToday) : 0;

  return (
    <section data-slot="burn" className="fb-section fb-burn">
      {/* Flame — three layers, glow halo */}
      <span className="fb-flame" aria-hidden>
        <span className="fb-flame-halo" />
        <svg viewBox="0 0 24 24" width="16" height="16">
          <path className="fb-flame-outer" d="M12 2c1 4-4 5.5-4 10a4 4 0 0 0 8 0c0-2-1-3-1-3s3 1 3 4a7 7 0 1 1-14 0C4 8 10 6.5 12 2z" />
          <path className="fb-flame-mid" d="M12 6c.8 3.2-3 4.2-3 7.6a3 3 0 0 0 6 0c0-1.6-.9-2.4-.9-2.4s2.2.8 2.2 3.2a5.2 5.2 0 1 1-10.4 0C5.9 9.7 10.4 8.6 12 6z" />
          <path className="fb-flame-inner" d="M12 11c.4 1.6-1.6 2-1.6 3.9a1.6 1.6 0 0 0 3.2 0c0-1.1-.6-1.6-.6-1.6s1.4.5 1.4 2a2.6 2.6 0 1 1-5.2 0c0-3 2.6-3.4 2.8-4.3z" />
        </svg>
      </span>

      <span className="fb-label">BURNED</span>
      <span key={slamRef.current} className="fb-value fb-burn-total">{fmt(total)} R2H</span>
      {today > 0 && <span className="fb-burn-today">+{fmt(today)} today</span>}
      {stats?.dryRun && <span className="fb-burn-sim" title="Dry-run mode: burns are simulated">SIM</span>}
    </section>
  );
}
