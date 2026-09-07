import { useState, useEffect, type CSSProperties, type ReactNode } from 'react';

// ── Zoom-constant panel wrapper ───────────────────────────────────────────
// Browser zoom-out shrinks everything physically. The game frame keeps its
// CSS size (v391) so it shrinks on screen and the letterbox columns widen —
// but the columns' CONTENT would also miniaturize (12px text → 6px physical
// at 50% zoom). This wrapper lays the content out at z× CSS size and applies
// transform: scale(1/z) — EXACT geometry (no rounding, unlike CSS `zoom`
// which snaps to 5% steps) — so panels read at constant PHYSICAL size while
// filling all the space zooming out frees.
//
// z = devicePixelRatio / dpr-at-load — same normalization as useGameScale.

// Reference for panel-content compensation: browser zoom 100%.
// v398 FIX: this was dpr-at-page-load — loading the page while zoomed out
// (e.g. after testing zoom, then hard-refresh) anchored "100%" at 67% and
// rendered panel text ~2/3 size at true 100%. Panels are desktop-only
// (mobile is gated out), and desktop players run browser-100% with dpr 1,
// so the constant 1 is the correct reference. z = devicePixelRatio directly:
// 100% zoom → z=1 → text renders at plain CSS px (the full 13px+ ramp).
const PANEL_REF_DPR = 1;

export function useZoomFactor(): number {
  const [z, setZ] = useState((window.devicePixelRatio || 1) / PANEL_REF_DPR);
  useEffect(() => {
    const on = () => setZ((window.devicePixelRatio || 1) / PANEL_REF_DPR);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return z;
}

/**
 * Content at constant physical size, filling the positioned parent box.
 * The parent (letterbox column) is sized in CSS px and grows as the game
 * shrinks; the inner content is laid out at z× then scaled by 1/z, so at
 * 50% browser zoom the column is 2× wide in CSS px and the content renders
 * exactly as it did at 100%.
 */
export function ZoomPanel({ className, style, children,
  direction = 'column', center = false, anchor = 'flow', factor }: {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  /** flex direction of the compensated content box (columns: column). */
  direction?: 'row' | 'column';
  /** center content inside the box (bars are centered strips). */
  center?: boolean;
  /** 'flow' = columns' original fill-the-parent behavior; 'inset' = absolute
   *  inset-0 anchoring for containers whose own flex centering would shift
   *  the oversized layout box (the frame bars). */
  anchor?: 'flow' | 'inset';
  /** externally gated zoom factor (e.g. desktop-only). Defaults to own hook. */
  factor?: number;
}) {
  const ownZ = useZoomFactor();
  const z = factor ?? ownZ;
  return (
    <div
      className={className}
      style={{
        ...(style || {}),
        ...(anchor === 'inset' ? { position: 'absolute' as const, inset: 0 } : null),
        width: `${100 * z}%`,
        height: `${100 * z}%`,
        transform: `scale(${1 / z})`,
        transformOrigin: 'top left',
        display: 'flex',
        flexDirection: direction,
        ...(center ? { justifyContent: 'center', alignItems: 'center' } : null),
      }}
    >
      {children}
    </div>
  );
}
