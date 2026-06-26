import { useRef, useEffect, useCallback } from 'react';
import { useGameWebSocket } from '../../hooks/useGameWebSocket';
import { parsePacket, createMovePacket } from '../../lib/rscPacketParser';
import { RSCRenderer } from './RSCRenderer';
import LoadingSpinner from '../UI/LoadingSpinner';

const GRID_SIZE = 32;

interface GameCanvasProps {
  wsUrl?: string;
  rscUsername?: string;
  rscPassword?: string;
  sessionToken?: string | null;
  onLoginComplete?: () => void;
  onConnectionChange?: (connected: boolean) => void;
}

export default function GameCanvas({ wsUrl, rscUsername, rscPassword, sessionToken, onLoginComplete, onConnectionChange }: GameCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<RSCRenderer | null>(null);
  const { isConnected, connectionError, sendMessage, lastMessage } = useGameWebSocket(sessionToken);

  // Initialize renderer when canvas is ready
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    rendererRef.current = new RSCRenderer(ctx);
    rendererRef.current.render();

    console.log('[GameCanvas] RSCRenderer initialized');
  }, []);

  // Notify parent of connection state changes
  useEffect(() => {
    onConnectionChange?.(isConnected);
  }, [isConnected, onConnectionChange]);

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

    // Convert to grid coordinates
    const gridX = Math.floor(pixelX / GRID_SIZE);
    const gridY = Math.floor(pixelY / GRID_SIZE);

    // Clamp to valid range
    const clampedX = Math.max(0, Math.min(15, gridX));
    const clampedY = Math.max(0, Math.min(9, gridY));

    console.log(`[GameCanvas] Click at pixel (${pixelX.toFixed(0)}, ${pixelY.toFixed(0)}) -> grid (${clampedX}, ${clampedY})`);

    // Send move packet
    const packet = createMovePacket(clampedX, clampedY);
    sendMessage(packet);
  }, [isConnected, sendMessage]);

  // Draw connection status overlay when not connected
  useEffect(() => {
    if (isConnected) return; // Renderer handles the canvas when connected

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const renderer = rendererRef.current;
    if (renderer) {
      renderer.clear();
    } else {
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, 512, 334);
    }

    // Border
    ctx.strokeStyle = '#333333';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, 512, 334);

    // Status text
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

    // Debug logging
    if (sessionToken) console.log('[GameCanvas] Session:', sessionToken.substring(0, 10) + '...');
    if (wsUrl) console.log('[GameCanvas] wsUrl:', wsUrl);
  }, [sessionToken, isConnected, connectionError, wsUrl]);

  return (
    <>
      <canvas
        ref={canvasRef}
        width={512}
        height={334}
        onClick={handleCanvasClick}
        style={{ cursor: isConnected ? 'crosshair' : 'default' }}
      />
      {/* Loading spinner overlay when connecting */}
      {sessionToken && !isConnected && !connectionError && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, 30px)',
            pointerEvents: 'none',
          }}
        >
          <LoadingSpinner size="md" />
        </div>
      )}
    </>
  );
}
