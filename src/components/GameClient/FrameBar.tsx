import { useState, useEffect } from 'react';
import { useAppKitAccount } from '@reown/appkit/react';
import { BurnSlot } from './BurnSlot';

/**
 * FrameBar — horizontal data bars above/below the game frame, same metric
 * style as the outside columns (world-strip family).
 *
 * Top bar:    WALLET section (connected address — reserved for upcoming
 *             wallet features) · PLAY-TO-BURN section (reserved for the
 *             burn mechanism; honest placeholder until it ships).
 * Bottom bar: world metrics (players online · world · world # · clock).
 *
 * Sections render as self-contained <section data-slot="..."> blocks so
 * future features can claim a slot without touching the layout.
 */

interface WorldStats {
  world: string;
  worldNumber: number;
  playersOnline: number;
  maxPlayers: number;
  serverTime?: string;
}

const API_URL = import.meta.env.VITE_API_URL || 'https://api.r2hrsc.xyz';

/** Poll /v1/world/stats every 30s (same cadence as WorldStatusStrip). */
function useWorldStats(): WorldStats | null {
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
  return stats;
}

/**
 * Bar geometry (v424 redesign): the bars scale with the game frame itself —
 * exactly like the game canvas. The frame keeps a constant CSS-px size across
 * browser zoom (v391) and shrinks physically on zoom-out; the bars share that
 * fate by laying out at the frame's width in plain CSS px. No compensation
 * squeeze: the previous mechanism laid the content out at z× in a stage z×
 * wider than the bar — at zoom <100% that forced full-size content into ~z×
 * the width and the sections collided and stacked. Plain scaling can never
 * collide: the layout width never changes with zoom, so the bar always
 * renders as a clean miniature of the 100% view.
 */

function shortAddr(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

function fmtClock(d: Date): string {
  try {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return '';
  }
}

/** Live clock anchored to server time (re-synced every poll), ticked locally. */
function useServerClock(serverTimeIso?: string): string {
  const [offset, setOffset] = useState<number | null>(null); // serverTime - Date.now()
  const [, setTick] = useState(0);

  useEffect(() => {
    if (serverTimeIso) {
      const t = new Date(serverTimeIso).getTime();
      if (!Number.isNaN(t)) setOffset(t - Date.now());
    }
  }, [serverTimeIso]);

  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  if (offset === null) return '';
  return fmtClock(new Date(Date.now() + offset));
}

/** Bar above the game frame — WALLET (left) + PLAY-TO-BURN (right). */
export function TopFrameBar() {
  const { address, isConnected } = useAppKitAccount();

  return (
    <div className="frame-bar frame-bar-top">
      {/* ── WALLET slot — reserved for wallet-connected features ── */}
      <section data-slot="wallet" className="fb-section fb-wallet">
        <span className="ws-dot" style={{ background: isConnected ? '#14F195' : '#555' }} />
        <span className="fb-label">WALLET</span>
        <span className="fb-value">
          {isConnected && address ? shortAddr(address) : 'not connected'}
        </span>
      </section>

      <span className="ws-sep">·</span>

      {/* ── PLAY-TO-BURN slot — live burn feed (see BurnSlot.tsx) ── */}
      <BurnSlot />
    </div>
  );
}

/** Bar below the game frame — world metrics (players / world / clock). */
export function BottomFrameBar() {
  const stats = useWorldStats();
  const clock = useServerClock(stats?.serverTime);
  return (
    <div className="frame-bar frame-bar-bottom">
      <section data-slot="players" className="fb-section">
        <span className="ws-dot" />
        <span className="fb-value">{stats ? `${stats.playersOnline} online` : '…'}</span>
      </section>
      <span className="ws-sep">·</span>
      <section data-slot="world" className="fb-section">
        <span className="fb-value">{stats ? stats.world : 'Robinscape'}</span>
      </section>
      {stats && stats.playersOnline > 0 && (
        <>
          <span className="ws-sep">·</span>
          <section data-slot="worldnum" className="fb-section">
            <span className="fb-value">world {stats.worldNumber}</span>
          </section>
        </>
      )}
      {clock && (
        <>
          <span className="ws-sep">·</span>
          <section data-slot="clock" className="fb-section">
            <span className="fb-value fb-clock">{clock}</span>
          </section>
        </>
      )}
    </div>
  );
}
