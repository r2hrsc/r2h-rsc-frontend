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
 * Native is preferred (no letterbox bars, real rotation) and auto-exits when
 * the user leaves fullscreen (including the OS back gesture). CSS mode is
 * toggled manually by tapping the button again.
 */
export function useLandscapeRotation() {
  const [rotated, setRotated] = useState(false); // CSS rotation active
  const [nativeLandscape, setNativeLandscape] = useState(false); // fullscreen + orientation lock

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
      return;
    }
    // Rung 2: CSS rotation (iOS wallet browsers + anything without lock)
    setRotated(true);
  }, [tryNativeRotation]);

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

  return { rotated, nativeLandscape, toggle };
}
