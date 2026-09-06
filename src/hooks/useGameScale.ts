import { useState, useEffect, useMemo } from 'react';

const GAME_WIDTH = 512;
const GAME_HEIGHT = 345;
const PADDING_BUFFER = 0.95;
const MIN_SCALE = 0.4;  // restored July value — very small phone screens
const MAX_SCALE = 6;    // must be ≥4: game fills large monitors in fullscreen (was 2 = the "fullscreen caps at 1024px" bug)

export function useGameScale(): number {
  // Viewport tick — bumped on resize + fullscreenchange so scale recomputes
  // in the SAME render as the state change (no one-render stale window).
  const [viewportTick, setViewportTick] = useState(0);
  // Track native fullscreen so ad reserves are dropped while fullscreened.
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
  // Ad bezel REMOVED 9/6 — no reserves on any screen; game scales to the full
  // viewport (min of ratios, never distort; MAX_SCALE caps on huge monitors).
  const isMobile = window.innerWidth < 768;
  const sideReserve = 0;
  const verticalReserve = 0;
  const availableWidth = Math.max(300, window.innerWidth - sideReserve);
  const availableHeight = Math.max(200, window.innerHeight - verticalReserve);

  // min() of the two ratios — never distort, letterbox the remainder
  const scaleX = availableWidth / GAME_WIDTH;
  const scaleY = availableHeight / GAME_HEIGHT;
  const scale = Math.max(MIN_SCALE, Math.min(scaleX, scaleY) * PADDING_BUFFER);

  return Math.min(scale, MAX_SCALE);
}
