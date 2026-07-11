import { useRef, useEffect, useCallback } from 'react';
import { useSidecarAuth } from '../../hooks/useSidecarAuth';
import { useGameWebSocket } from '../../hooks/useGameWebSocket';
import { parsePacket, createMovePacket } from '../../lib/rscPacketParser';
import { RSCRenderer } from './RSCRenderer';

const GRID_SIZE = 32;
const CACHE_CDN = import.meta.env.VITE_CACHE_CDN_URL || 'https://game.r2hrsc.xyz/rsc-client/';
const IFRAME_ORIGIN = 'https://game.r2hrsc.xyz';

// Server RSA keys
const RSA_EXPONENT = '65537';
const RSA_MODULUS = '9115015542438186018327044408313987277889783174239809826491015549573028356381739563861028029945657804756198333660503635469704152602063914154601665525357981';
// Cache-bust version: increment when the rsc-client/index.html is updated.
// This forces mobile browsers to fetch the new iframe content instead of serving a cached copy.
const CLIENT_VERSION = 'v17';
const GAME_URL = `${CACHE_CDN}?v=${CLIENT_VERSION}#members,127.0.0.1,43594,${RSA_EXPONENT},${RSA_MODULUS},1`;

interface GameCanvasProps {
  wsUrl?: string;
  rscUsername?: string;
  rscPassword?: string;
  onLoginComplete?: () => void;
  showRscBackground?: boolean;
}

export default function GameCanvas({ wsUrl, rscUsername, rscPassword, onLoginComplete, showRscBackground }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const rendererRef = useRef<RSCRenderer | null>(null);
  const credsSentRef = useRef(false);
  const loginFallbackFired = useRef(false);

  // Determine auth mode
  const hasGameCredentials = !!(rscUsername && rscPassword);
  const useRealClient = hasGameCredentials || showRscBackground;

  // ALL hooks must be called unconditionally before ANY early return.
  const sidecar = useSidecarAuth();
  const ws = useGameWebSocket(sidecar.sessionToken);
  const { sessionToken } = sidecar;
  const { isConnected, connectionError, sendMessage, lastMessage } = ws;

  // ── Iframe mode (Google auth: loads real RSC client from CDN) ──

  // Listen for rsc-login-complete AND rsc-login-error from the iframe
  useEffect(() => {
    if (!hasGameCredentials || !onLoginComplete) return;

    const handler = (event: MessageEvent) => {
      if (event.origin !== IFRAME_ORIGIN && event.origin !== window.location.origin) return;

      if (event.data?.type === 'rsc-login-complete') {
        console.log('[GameCanvas] Received rsc-login-complete from iframe');
        loginFallbackFired.current = true; // cancel fallback
        onLoginComplete();
      }

      if (event.data?.type === 'rsc-login-error') {
        console.log('[GameCanvas] Received rsc-login-error from iframe:', event.data.detail);
        // On mobile, synthetic keyboard events may fail. Proceed anyway —
        // the user can see the game screen and log in manually.
        loginFallbackFired.current = true;
        onLoginComplete();
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [hasGameCredentials, onLoginComplete]);

  // Send credentials to iframe + fallback timeout for mobile
  // Uses refs for timers so they survive effect cleanups/re-runs.
  // The previous version cleared the fallback on every re-render, causing
  // permanent hangs on mobile when prop changes reset the cleanup.
  const sendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!hasGameCredentials || !rscUsername || !rscPassword) return;
    if (credsSentRef.current) return;

    // Guard: only proceed if iframe is available
    const trySend = () => {
      const iframe = iframeRef.current;
      if (!iframe?.contentWindow) {
        console.log('[GameCanvas] Waiting for iframe contentWindow...');
        return false;
      }
      iframe.contentWindow.postMessage(
        { type: 'RSC_LOGIN', username: rscUsername, password: rscPassword },
        IFRAME_ORIGIN
      );
      console.log('[GameCanvas] Sent RSC_LOGIN to iframe');
      return true;
    };

    // Try immediately, then retry every 1s until the iframe accepts
    if (!trySend()) {
      sendIntervalRef.current = setInterval(() => {
        if (trySend()) {
          // Keep sending — the iframe may not have its listener ready yet
        }
      }, 1000);
    } else {
      // Even on success, keep retrying for 10s in case iframe wasn't ready
      sendIntervalRef.current = setInterval(trySend, 1000);
    }

    // Stop retrying after 15s
    const stopRetry = setTimeout(() => {
      if (sendIntervalRef.current) {
        clearInterval(sendIntervalRef.current);
        sendIntervalRef.current = null;
      }
      credsSentRef.current = true;
    }, 15000);

    // Fallback: if the iframe doesn't respond after 25 seconds, proceed anyway.
    // Use a ref so this timer survives effect cleanups.
    if (!fallbackTimerRef.current && !loginFallbackFired.current) {
      fallbackTimerRef.current = setTimeout(() => {
        if (!loginFallbackFired.current && onLoginComplete) {
          console.log('[GameCanvas] Login fallback triggered after 25s — proceeding anyway');
          loginFallbackFired.current = true;
          onLoginComplete();
        }
      }, 25000);
    }

    return () => {
      clearTimeout(stopRetry);
      // Do NOT clear fallbackTimerRef here — it must survive re-renders
      // Only clear the retry interval if it's still running
      if (credsSentRef.current && sendIntervalRef.current) {
        clearInterval(sendIntervalRef.current);
        sendIntervalRef.current = null;
      }
    };
  }, [hasGameCredentials, rscUsername, rscPassword, onLoginComplete]);

  // ── Canvas mode (Wallet auth: mock renderer with WebSocket) ──

  useEffect(() => {
    if (hasGameCredentials) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    rendererRef.current = new RSCRenderer(ctx);
    rendererRef.current.render();

    console.log('[GameCanvas] RSCRenderer initialized');
  }, [hasGameCredentials]);

  useEffect(() => {
    if (!lastMessage || !rendererRef.current) return;

    try {
      const packet = parsePacket(lastMessage);
      console.log('[GameCanvas] Parsed packet:', packet.type, packet.payload);
      rendererRef.current.handlePacket(packet);
      rendererRef.current.render();
    } catch (err) {
      console.error('[GameCanvas] Failed to parse packet:', err);
    }
  }, [lastMessage]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isConnected || !rendererRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const pixelX = (e.clientX - rect.left) * scaleX;
    const pixelY = (e.clientY - rect.top) * scaleY;

    const gridX = Math.floor(pixelX / GRID_SIZE);
    const gridY = Math.floor(pixelY / GRID_SIZE);
    const clampedX = Math.max(0, Math.min(15, gridX));
    const clampedY = Math.max(0, Math.min(9, gridY));

    console.log(`[GameCanvas] Click at pixel (${pixelX.toFixed(0)}, ${pixelY.toFixed(0)}) -> grid (${clampedX}, ${clampedY})`);

    const packet = createMovePacket(clampedX, clampedY);
    sendMessage(packet);
  }, [isConnected, sendMessage]);

  useEffect(() => {
    if (hasGameCredentials) return;
    if (isConnected) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const renderer = rendererRef.current;
    if (renderer) {
      renderer.clear();
    } else {
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, 512, 345);
    }

    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, 512, 345);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '14px sans-serif';

    if (connectionError) {
      ctx.fillStyle = '#ff4444';
      ctx.fillText(`Connection failed: ${connectionError}`, 256, 167);
    } else if (sessionToken) {
      ctx.fillStyle = '#e5e5e5';
      ctx.fillText('Connecting to game server...', 256, 167);
    } else {
      ctx.fillStyle = '#e5e5e5';
      ctx.fillText('Waiting for authentication...', 256, 167);
    }

    if (sessionToken) console.log('[GameCanvas] Session:', sessionToken.substring(0, 10) + '...');
    if (wsUrl) console.log('[GameCanvas] wsUrl:', wsUrl);
  }, [sessionToken, isConnected, connectionError, wsUrl, hasGameCredentials]);

  // ── Render ──

  if (useRealClient) {
    return (
      <iframe
        ref={iframeRef}
        src={GAME_URL}
        scrolling="no"
        style={{
          width: 512,
          height: 345,
          border: 'none',
          display: 'block',
          overflow: 'hidden',
          imageRendering: 'pixelated' as any,
        }}
        title="R2H RSC Game"
        allow="autoplay; gamepad"
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      width={512}
      height={345}
      onClick={handleCanvasClick}
      style={{ cursor: isConnected ? 'crosshair' : 'default', display: 'block', imageRendering: 'pixelated' as any }}
    />
  );
}
