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

const LOAD_DPR = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;

export function useZoomFactor(): number {
  const [z, setZ] = useState((window.devicePixelRatio || 1) / LOAD_DPR);
  useEffect(() => {
    const on = () => setZ((window.devicePixelRatio || 1) / LOAD_DPR);
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
export function ZoomPanel({ className, style, children }: {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const z = useZoomFactor();
  return (
    <div
      className={className}
      style={{
        ...(style || {}),
        width: `${100 * z}%`,
        height: `${100 * z}%`,
        transform: `scale(${1 / z})`,
        transformOrigin: 'top left',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {children}
    </div>
  );
}
