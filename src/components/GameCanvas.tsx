import { useEffect, useRef } from 'react';

const CACHE_CDN = import.meta.env.VITE_CACHE_CDN_URL || 'https://cache.r2hrsc.xyz';

interface GameCanvasProps {
  wsUrl: string;
}

export default function GameCanvas({ wsUrl }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // If the mudclient script is already loaded (hot reload), skip
    if ((window as any).__rscClientLoaded) return;

    const script = document.createElement('script');
    script.src = `${CACHE_CDN}/client/mudclient.js`;
    script.async = true;

    script.onload = () => {
      (window as any).__rscClientLoaded = true;

      // The compiled mudclient looks for these globals before booting
      (window as any).RSC_CONFIG = {
        cacheUrl: CACHE_CDN,
        wsUrl: wsUrl,
        canvasId: 'game-canvas',
      };

      // If the client exposes an explicit init function, call it
      if (typeof (window as any).startMudClient === 'function') {
        (window as any).startMudClient();
      }
      // Otherwise the script's IIFE auto-bootstraps on load
    };

    script.onerror = () => {
      console.error('[R2H] Failed to load mudclient from', script.src);
    };

    document.body.appendChild(script);

    return () => {
      // Don't remove the script on unmount — the client is stateful
      // Only cleanup on full page unload
    };
  }, [wsUrl]);

  return (
    <canvas
      ref={canvasRef}
      id="game-canvas"
      width={765}
      height={503}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        imageRendering: 'pixelated',
        cursor: 'default',
      }}
    />
  );
}
