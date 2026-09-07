import { useState, useEffect } from 'react';
import { useAppKitAccount } from '@reown/appkit/react';
import { BurnSlot } from './BurnSlot';
import { ZoomPanel, useZoomFactor } from './ZoomPanel';

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
 * Zoom-constant bar geometry — the letterbox columns' fix (ZoomPanel),
 * applied to the frame bars. Browser zoom-out (z<1) shrinks the game frame
 * physically; the bars' CSS-px chrome would shrink with it and miniaturize
 * the text. We keep the bar at constant PHYSICAL size:
 *   - bar box height & offset scaled by 1/z (CSS px), so post-zoom it
 *     renders exactly as at 100%
 *   - content wrapped in ZoomPanel (layout at z×, scale 1/z) — the exact
 *     mechanism the left/right columns use for their text.
 * Desktop only: on touch/mobile devices devicePixelRatio is pixel density,
 * not browser zoom, so compensation is gated off (same as the columns).
 */
function useBarZoom(): { z: number; style: Record<string, string> } {
  const z = useZoomFactor();
  const [desktop, setDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia('(pointer: fine)');
    const update = () => setDesktop(mq.matches && window.innerWidth >= 768);
    update();
    mq.addEventListener?.('change', update);
    window.addEventListener('resize', update);
    return () => {
      mq.removeEventListener?.('change', update);
      window.removeEventListener('resize', update);
    };
  }, []);
  if (!desktop || z === 1) return { z: 1, style: {} };
  return { z, style: {
    height: `${40 / z}px`,
    top: `${-46 / z}px`,
  } };
}

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
  const { z, style } = useBarZoom();

  return (
    <div className="frame-bar frame-bar-top" style={style}>
      <ZoomPanel key={z === 1 ? 'n' : 'z'} direction="row" center anchor="inset" factor={z}>
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
      </ZoomPanel>
    </div>
  );
}

/** Bar below the game frame — world metrics (players / world / clock). */
export function BottomFrameBar() {
  const stats = useWorldStats();
  const clock = useServerClock(stats?.serverTime);
  const { z, style } = useBarZoom();
  const bottomStyle = z === 1 ? {} : { height: style.height, bottom: style.top };

  return (
    <div className="frame-bar frame-bar-bottom" style={bottomStyle}>
      <ZoomPanel key={z === 1 ? 'n' : 'z'} direction="row" center anchor="inset" factor={z}>
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
      </ZoomPanel>
    </div>
  );
}
