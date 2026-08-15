import { useState, useEffect, useRef, useCallback } from 'react';
import { io, type Socket } from 'socket.io-client';

const CHAT_URL = import.meta.env.VITE_CHAT_URL || 'http://localhost:3101';

export interface ChatMessage {
  id: string;
  username: string;
  content: string;
  createdAt: string;
  shadowed?: boolean;
  isSystem?: boolean;
}

export interface OnlineUser {
  username: string;
  connectedAt: number;
}

/**
 * useChatSocket — Socket.io chat hook for R2H RSC.
 * Connects when `username` is provided (after Google auth completes).
 */
export function useChatSocket(username: string | null | undefined) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const seenIdsRef = useRef(new Set<string>());

  useEffect(() => {
    if (!username) return;
    if (socketRef.current?.connected) return;

    let cancelled = false;

    const socket = io(CHAT_URL, {
      auth: { username },
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 8,
      reconnectionDelay: 2000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      if (!cancelled) {
        setConnected(true);
        setError(null);
      }
    });

    socket.on('disconnect', () => {
      if (!cancelled) setConnected(false);
    });

    socket.on('connect_error', (err: Error) => {
      if (!cancelled) {
        setConnected(false);
        setError(err.message || 'Connection failed');
      }
    });

    // Load history on connect
    socket.on('chat:history', (history: ChatMessage[]) => {
      if (cancelled) return;
      seenIdsRef.current.clear();
      for (const msg of history) {
        seenIdsRef.current.add(msg.id);
      }
      setMessages(history);
    });

    socket.on('message:new', (msg: ChatMessage) => {
      if (cancelled) return;
      if (seenIdsRef.current.has(msg.id)) return;
      seenIdsRef.current.add(msg.id);
      setMessages((prev) => [...prev, msg]);
    });

    socket.on('message:shadowed', (msg: ChatMessage) => {
      if (cancelled) return;
      setMessages((prev) => [...prev, { ...msg, shadowed: true }]);
    });

    socket.on('message:error', (data: { error: string }) => {
      if (!cancelled) setError(data.error);
    });

    socket.on('users:online', (users: OnlineUser[]) => {
      if (!cancelled) setOnlineUsers(users);
    });

    return () => {
      cancelled = true;
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      setConnected(false);
      setMessages([]);
      setOnlineUsers([]);
      seenIdsRef.current.clear();
    };
  }, [username]);

  const sendMessage = useCallback((content: string) => {
    if (!content.trim() || !socketRef.current?.connected) return;
    socketRef.current.emit('message:send', { content: content.trim() });
    setError(null);
  }, []);

  return { messages, onlineUsers, connected, error, sendMessage };
}
