import { useCallback, useEffect, useState } from 'react';

/**
 * Mobile landscape rotation for the game.
 *
 * Two rungs, tried in order when the user taps the rotate button:
 *   1. NATIVE: requestFullscreen + screen.orientation.lock('landscape').
 *      Works in many Android in-app browsers (MetaMask, Trust). iOS wallet
 *      browsers don't support it.
 *   2. CSS: rotate(90deg) the game frame. Works everywhere — the browser
 *      inverse-maps pointer events into the transformed element, so the game
 *      inside the iframe still receives correctly translated landscape coords
 *      (its own C2 handler needs no patch).
 *
 * Viewport tracking: many wallet in-app browsers rotate WITHOUT firing a
 * resize event, which used to leave the game portrait-sized on a landscape
 * screen (frame cut off, half the screen unused). `viewport` is refreshed on
 * resize + orientationchange + screen.orientation change AND polled every
 * 400ms while a rotation mode is active, so the fit math always sees the
 * real current dimensions.
 */
export function useLandscapeRotation() {
  const [rotated, setRotated] = useState(false); // CSS rotation active
  const [nativeLandscape, setNativeLandscape] = useState(false); // fullscreen + orientation lock
  const [viewport, setViewport] = useState(() => ({
    w: typeof window !== 'undefined' ? window.innerWidth : 512,
    h: typeof window !== 'undefined' ? window.innerHeight : 345,
  }));

  const refreshViewport = useCallback(() => {
    const w = window.innerWidth, h = window.innerHeight;
    setViewport(prev => (prev.w === w && prev.h === h) ? prev : { w, h });
  }, []);

  // Always-on listeners (cheap) — covers browsers that DO fire events
  useEffect(() => {
    window.addEventListener('resize', refreshViewport);
    window.addEventListener('orientationchange', refreshViewport);
    const so = (screen as any).orientation;
    so?.addEventListener?.('change', refreshViewport);
    return () => {
      window.removeEventListener('resize', refreshViewport);
      window.removeEventListener('orientationchange', refreshViewport);
      so?.removeEventListener?.('change', refreshViewport);
    };
  }, [refreshViewport]);

  // Poll while a rotation mode is active — wallet browsers that lock
  // orientation without firing resize would otherwise stay stale forever.
  useEffect(() => {
    if (!rotated && !nativeLandscape) return;
    refreshViewport();
    const iv = setInterval(refreshViewport, 400);
    return () => clearInterval(iv);
  }, [rotated, nativeLandscape, refreshViewport]);

  /** Try native rotation; resolve true if it worked. */
  const tryNativeRotation = useCallback(async (el: HTMLElement | null): Promise<boolean> => {
    if (!el) return false;
    try {
      // Enter fullscreen on the game frame (harmless if already fullscreen)
      const alreadyFs = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
      if (!alreadyFs) {
        const req = (el as any).requestFullscreen || (el as any).webkitRequestFullscreen;
        if (req) await req.call(el);
      }
      const so = screen.orientation as any;
      if (so?.lock) {
        await so.lock('landscape');
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  const enter = useCallback(async (el: HTMLElement | null) => {
    // Rung 1: native fullscreen + orientation lock (Android wallet browsers)
    if (await tryNativeRotation(el)) {
      setNativeLandscape(true);
      refreshViewport();
      return;
    }
    // Rung 2: CSS rotation (iOS wallet browsers + anything without lock)
    setRotated(true);
    refreshViewport();
  }, [tryNativeRotation, refreshViewport]);

  const exit = useCallback(() => {
    setRotated(false);
    setNativeLandscape(false);
    const so = screen.orientation as any;
    try { so?.unlock?.(); } catch { /* not locked */ }
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else if ((document as any).webkitFullscreenElement) {
      (document as any).webkitExitFullscreen?.();
    }
  }, []);

  const toggle = useCallback((el: HTMLElement | null) => {
    if (rotated || nativeLandscape) exit();
    else void enter(el);
  }, [rotated, nativeLandscape, enter, exit]);

  // Native mode auto-exits when the user leaves fullscreen (back gesture etc.)
  useEffect(() => {
    const onChange = () => {
      const fs = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
      if (!fs && nativeLandscape) {
        setNativeLandscape(false);
        const so = screen.orientation as any;
        try { so?.unlock?.(); } catch { /* not locked */ }
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('webkitfullscreenchange', onChange);
    };
  }, [nativeLandscape]);

  return { rotated, nativeLandscape, viewport, toggle };
}
