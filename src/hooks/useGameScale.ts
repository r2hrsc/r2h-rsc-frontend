import { useState, useEffect, useMemo } from 'react';

const GAME_WIDTH = 512;
const GAME_HEIGHT = 345;
const PADDING_BUFFER = 0.95;
const MIN_SCALE = 0.4;  // restored July value — very small phone screens
const MAX_SCALE = 6;    // must be ≥4: game fills large monitors in fullscreen (was 2 = the "fullscreen caps at 1024px" bug)

// Browser-zoom support (v391): dpr at page load is the user's reference zoom.
// Zooming out raises innerWidth (CSS px) while lowering devicePixelRatio —
// normalizing by dpr/loadDpr recovers the TRUE viewport, so the game keeps a
// constant CSS-px size and browser zoom shrinks/grows it naturally instead of
// the scale recomputing to refill the window.
// v398: reference = browser zoom 100% (dpr 1), NOT dpr-at-load — see ZoomPanel.
// Loading while zoomed out must not re-anchor the game size.
const REF_DPR = 1;

export function useGameScale(): number {
  // Viewport tick — bumped on resize + fullscreenchange so scale recomputes
  // in the SAME render as the state change (no one-render stale window).
  const [viewportTick, setViewportTick] = useState(0);
  // Track native fullscreen so reserves are dropped while fullscreened.
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const recalc = () => setViewportTick(t => t + 1);

    // Mobile browsers change innerWidth/innerHeight when the address bar
    // shows/hides. Delay the initial scale calculation so the viewport settles.
    const raf = requestAnimationFrame(recalc);
    // Second pass after 200ms for slow address bar animations
    const settle = setTimeout(recalc, 200);

    const handleResize = () => recalc();

    // Fullscreen transitions: update state AND tick together (batched → one render)
    const onFsChange = () => {
      setIsFullscreen(!!(document.fullscreenElement || (document as any).webkitFullscreenElement));
      recalc();
    };

    window.addEventListener('resize', handleResize);
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(settle);
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
    };
  }, []);

  // Derive synchronously in-render: the scale used by THIS render always
  // matches the current fullscreen state (storing it in state via an effect
  // leaves a one-render window where the container grew but transform is old).
  return useMemo(() => calculateScale(isFullscreen), [isFullscreen, viewportTick]);
}

function calculateScale(isFullscreen: boolean): number {
  // Ad bezel REMOVED 9/6 — no reserves on any screen; game scales to the viewport.
  // Fullscreen element owns the whole screen — same fit math, no reserves either.

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Zoom-normalized viewport: what innerWidth/innerHeight would be at the
  // user's reference (load-time) zoom. Browser zoom-out inflates CSS px and
  // deflates dpr proportionally — dpr/loadDpr cancels the fullscreen.
  const dpr = window.devicePixelRatio || 1;
  const zoomFactor = dpr / REF_DPR; // <1 zoomed out, >1 zoomed in
  const normW = vw * zoomFactor;
  const normH = vh * zoomFactor;

  // Natural size: fill the normalized viewport (constant CSS px across zooms)
  // Fullscreen: drop the 5% padding — the user asked for FULL full screen.
  const buffer = isFullscreen ? 1.0 : PADDING_BUFFER;
  const sNorm = Math.min(normW / GAME_WIDTH, normH / GAME_HEIGHT) * buffer;

  // Hard fit: never overflow the ACTUAL CSS viewport (zoom-in cap — the game
  // is already filling it there, so this keeps it at fill instead of clipping)
  const sFit = Math.min(vw / GAME_WIDTH, vh / GAME_HEIGHT);

  const scale = Math.max(MIN_SCALE, Math.min(sNorm, sFit));

  return Math.min(scale, MAX_SCALE);
}
