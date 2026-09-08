import { useState, useEffect, type CSSProperties } from 'react';
import { useAppKitAccount } from '@reown/appkit/react';
import { ZoomPanel, useZoomFactor } from './ZoomPanel';

/**
 * VerticalFillTop — the letterbox section ABOVE the game frame.
 *
 * One line, groups adjacent (user 9/7): LIVE BURN FEED · TOTAL/TODAY/
 * BURN TANK flow side by side, centered on the game frame's width. The
 * bottom letterbox (EARN BURNS / TOP BURNERS) was removed 9/7 — world
 * metrics below the game live in BottomFrameBar (FrameBar.tsx).
 *
 * ZOOM: content wrapped in ZoomPanel (layout at z× CSS size, transform
 * scale(1/z), z = devicePixelRatio referenced to 100% browser zoom) so
 * every element renders at constant physical size under browser zoom.
 */

const API_URL = import.meta.env.VITE_API_URL || 'https://api.r2hrsc.xyz';

interface BurnStats {
  totalBurned: number;
  burnedToday: number;
  walletBalance: number | null;
}

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 0 });

/**
 * Letterbox strips must span exactly the GAME FRAME's width — never the
 * viewport, never the letterbox zone. Inside the ZoomPanel stage the scale(1/z)
 * maps layout px → screen px, so a strip laid out at W renders at W/z; the
 * game frame is constant in CSS px across browser zoom. Rendering at the
 * game's exact on-screen width at EVERY zoom therefore requires layout width
 * gameWidth × z (z = devicePixelRatio referenced to 100% browser zoom).
 */
function gameWidthStyle(z: number): CSSProperties {
  return {
    width: `calc(var(--game-display-w, 100%) * ${z})`,
    maxWidth: '10000px',
  };
}

/**
 * Single-line layout with the groups adjacent (centered run). At zoom <100%
 * the frame's burn bar pokes up into the top zone (top: -46/z raw), so the
 * line lifts by max(0, 58/z − 58) raw px to keep a constant 12 physical px
 * clearance from it; above 100% the natural gap only grows (clamped to 0).
 */
function liftStyle(z: number): CSSProperties {
  const pad = Math.max(0, 58 / z - 58);
  return { marginTop: `${pad}px` };
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

/** TOP — LIVE BURN FEED + stats, one adjacent centered line.
 *  Wallet-gated (user 9/8): renders ONLY for wallet-connected users;
 *  the letterbox area stays blank otherwise — same contract as the frame
 *  bar's gate in FrameBar.tsx. Early return sits after all hooks. */
export function VerticalFillTop() {
  const stats = useBurnStatsLite();
  const z = useZoomFactor();
  const { isConnected } = useAppKitAccount();

  if (!isConnected) return null;

  return (
    <div className="vfill vf-top vf2">
      <ZoomPanel anchor="inset" style={{ justifyContent: 'flex-end' }}>
        {/* One line, groups adjacent: LIVE BURN FEED · TOTAL/TODAY/BURN TANK */}
        <div className="vf2-head" style={{ ...gameWidthStyle(z), ...liftStyle(z) }}>
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
