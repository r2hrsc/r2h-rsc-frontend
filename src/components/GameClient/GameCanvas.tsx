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
const GAME_URL = `${CACHE_CDN}#members,127.0.0.1,43594,${RSA_EXPONENT},${RSA_MODULUS},1`;

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

  // Determine auth mode
  const hasGameCredentials = !!(rscUsername && rscPassword);
  const useRealClient = hasGameCredentials || showRscBackground; // keep the real RSC client login screen in the background on purpose

  // Pure background mode for auth screen (show RSC login UI without side effects)
  // Skip useSidecarAuth + useGameWebSocket entirely here to prevent re-render loops
  // and unnecessary WS/sidecar activity while showing the classic client as homepage background.
  if (useRealClient && !hasGameCredentials) {
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

  // Only reach here for:
  // - Wallet auth (canvas + WS + sidecar)
  // - Or when we have real RSC credentials (iframe + send creds listener)
  const { sessionToken } = useSidecarAuth();
  const { isConnected, connectionError, sendMessage, lastMessage } = useGameWebSocket(sessionToken);

  // ── Iframe mode (Gmail auth: loads real RSC client from CDN) ──

  // Listen for rsc-login-complete from the iframe
  useEffect(() => {
    if (!hasGameCredentials || !onLoginComplete) return;

    const handler = (event: MessageEvent) => {
      if (event.origin !== IFRAME_ORIGIN && event.origin !== window.location.origin) return;
      if (event.data?.type === 'rsc-login-complete') {
        console.log('[GameCanvas] Received rsc-login-complete from iframe');
        onLoginComplete();
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [hasGameCredentials, onLoginComplete]);

  // Send credentials to iframe
  useEffect(() => {
    if (!hasGameCredentials || !rscUsername || !rscPassword || !iframeRef.current?.contentWindow) return;
    if (credsSentRef.current) return;

    const sendCreds = () => {
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'RSC_LOGIN', username: rscUsername, password: rscPassword },
        IFRAME_ORIGIN
      );
      console.log('[GameCanvas] Sent credentials to iframe');
    };

    sendCreds();
    const interval = setInterval(sendCreds, 1000);
    const timeout = setTimeout(() => {
      clearInterval(interval);
      credsSentRef.current = true;
    }, 15000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [hasGameCredentials, rscUsername, rscPassword]);

  // ── Canvas mode (Wallet auth: mock renderer with WebSocket) ──

  // Initialize renderer when canvas is ready
  useEffect(() => {
    if (hasGameCredentials) return; // Skip if using iframe mode

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    rendererRef.current = new RSCRenderer(ctx);
    rendererRef.current.render();

    console.log('[GameCanvas] RSCRenderer initialized');
  }, [hasGameCredentials]);

  // Handle incoming WebSocket packets
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

  // Handle canvas click — send move packet
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

  // Draw connection status on canvas (wallet auth mode only)
  useEffect(() => {
    if (hasGameCredentials) return; // Skip if using iframe mode
    if (isConnected) return; // Renderer handles when connected

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

  // Iframe mode: Gmail auth with game credentials or background RSC client for homepage
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

  // Canvas mode: Wallet auth with WebSocket
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
