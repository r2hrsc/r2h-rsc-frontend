import { useState, useEffect, useRef, useCallback } from 'react';

const SIDECAR_WS_URL = import.meta.env.VITE_SIDECAR_WS_URL || 'ws://localhost:3000';

interface GameWebSocketState {
  isConnected: boolean;
  connectionError: string | null;
  sendMessage: (data: ArrayBuffer) => void;
  lastMessage: ArrayBuffer | null;
}

export function useGameWebSocket(sessionToken: string | null | undefined): GameWebSocketState {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [lastMessage, setLastMessage] = useState<ArrayBuffer | null>(null);

  const sendMessage = useCallback((data: ArrayBuffer) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
      console.log('[useGameWebSocket] Sent packet:', data.byteLength, 'bytes');
    } else {
      console.warn('[useGameWebSocket] Cannot send — WebSocket not open');
    }
  }, []);

  useEffect(() => {
    if (!sessionToken) {
      setIsConnected(false);
      setConnectionError(null);
      setLastMessage(null);
      return;
    }

    console.log('[useGameWebSocket] Connecting to game server...');
    setConnectionError(null);

    const ws = new WebSocket(`${SIDECAR_WS_URL}/game?token=${sessionToken}`);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[useGameWebSocket] Game WebSocket connected');
      setIsConnected(true);
      setConnectionError(null);
    };

    ws.onmessage = (event: MessageEvent) => {
      if (event.data instanceof ArrayBuffer) {
        console.log('[useGameWebSocket] Received game packet:', event.data.byteLength, 'bytes');
        setLastMessage(event.data);
      } else {
        console.log('[useGameWebSocket] Received message:', event.data);
      }
    };

    ws.onerror = (event) => {
      console.error('[useGameWebSocket] WebSocket error:', event);
      setConnectionError('Connection failed');
    };

    ws.onclose = (event) => {
      console.log('[useGameWebSocket] Game WebSocket closed:', event.code, event.reason);
      setIsConnected(false);
      if (!event.wasClean) {
        setConnectionError('Connection lost');
      }
    };

    return () => {
      console.log('[useGameWebSocket] Cleaning up WebSocket');
      ws.close();
      wsRef.current = null;
      setIsConnected(false);
      setLastMessage(null);
    };
  }, [sessionToken]);

  return { isConnected, connectionError, sendMessage, lastMessage };
}
