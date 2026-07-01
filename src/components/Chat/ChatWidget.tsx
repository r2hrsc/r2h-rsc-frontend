import { useState, useRef, useEffect, useCallback } from 'react';
import { useChatSocket } from './useChatSocket';

/**
 * ChatWidget — floating community chat for R2H RSC.
 * Renders a button bottom-right; expands to a panel.
 * Only connects when the user is authenticated (has an RSC username).
 *
 * Props:
 *   username — RSC username (null = not authenticated, button hidden)
 */
interface ChatWidgetProps {
  username: string | null;
}

export function ChatWidget({ username }: ChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { messages, onlineUsers, connected, error, sendMessage } = useChatSocket(
    open ? username : null, // Only connect when panel is opened
  );

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    if (open && connected) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open, connected]);

  // Don't render if not authenticated
  if (!username) return null;

  const handleSend = () => {
    const content = input.trim();
    if (!content) return;
    sendMessage(content);
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  // ── Collapsed: floating button ──
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed',
          bottom: 16,
          right: 16,
          zIndex: 5000,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 18px',
          borderRadius: 24,
          background: '#111',
          border: '1px solid #1a1a1a',
          color: '#14F195',
          fontSize: 13,
          fontFamily: 'monospace',
          fontWeight: 600,
          cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          transition: 'all 0.15s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = '#14F195';
          e.currentTarget.style.boxShadow = '0 4px 20px rgba(20,241,149,0.15)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = '#1a1a1a';
          e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.5)';
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
        <span>Chat</span>
        {onlineUsers.length > 0 && (
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 18,
            height: 18,
            borderRadius: 9,
            background: '#14F195',
            color: '#0a0a0a',
            fontSize: 10,
            fontWeight: 700,
            padding: '0 5px',
          }}>
            {onlineUsers.length}
          </span>
        )}
      </button>
    );
  }

  // ── Expanded: chat panel ──
  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      right: 0,
      zIndex: 5000,
      width: '100%',
      height: '100%',
      maxWidth: 380,
      maxHeight: 520,
      display: 'flex',
      flexDirection: 'column',
      background: '#0a0a0a',
      border: '1px solid #1a1a1a',
      borderRadius: 0,
      boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      fontFamily: 'monospace',
      // Desktop sizing
      '@media (min-width: 769px)': {
        bottom: 16,
        right: 16,
        borderRadius: 12,
      },
    } as React.CSSProperties}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: '1px solid #1a1a1a',
        background: '#0f0f0f',
        borderRadius: '12px 12px 0 0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#14F195" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
          <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Community Chat</span>
          {connected && onlineUsers.length > 0 && (
            <span style={{ fontSize: 11, color: '#555' }}>
              {onlineUsers.length} online
            </span>
          )}
        </div>
        <button
          onClick={() => setOpen(false)}
          style={{
            background: 'none',
            border: 'none',
            color: '#555',
            cursor: 'pointer',
            padding: 4,
            display: 'flex',
            alignItems: 'center',
          }}
          aria-label="Close chat"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '8px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}>
        {!connected && (
          <div style={{ textAlign: 'center', color: '#444', fontSize: 12, marginTop: 20 }}>
            {error ? error : 'Connecting...'}
          </div>
        )}
        {connected && messages.length === 0 && (
          <div style={{ textAlign: 'center', color: '#444', fontSize: 12, marginTop: 20 }}>
            No messages yet. Say hello!
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} style={{
            opacity: msg.shadowed ? 0.4 : 1,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span style={{
                fontSize: 12,
                fontWeight: 600,
                color: msg.username === username ? '#14F195' : '#7c9eff',
              }}>
                {msg.username}
              </span>
              <span style={{ fontSize: 9, color: '#333' }}>
                {formatTime(msg.createdAt)}
              </span>
            </div>
            <p style={{
              margin: '1px 0 0',
              fontSize: 13,
              lineHeight: 1.4,
              color: msg.shadowed ? '#555' : '#ccc',
              wordBreak: 'break-word',
            }}>
              {msg.content}
            </p>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Error bar */}
      {error && (
        <div style={{
          padding: '4px 12px',
          fontSize: 11,
          color: '#f44',
          background: 'rgba(255,0,0,0.05)',
          borderTop: '1px solid rgba(255,0,0,0.1)',
        }}>
          {error}
        </div>
      )}

      {/* Input */}
      <div style={{
        padding: '8px 12px',
        borderTop: '1px solid #1a1a1a',
        background: '#0f0f0f',
        borderRadius: '0 0 12px 12px',
        display: 'flex',
        gap: 8,
      }}>
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          maxLength={500}
          placeholder={connected ? 'Type a message...' : 'Connecting...'}
          disabled={!connected}
          style={{
            flex: 1,
            background: '#0a0a0a',
            border: '1px solid #1a1a1a',
            borderRadius: 6,
            padding: '8px 12px',
            color: '#ccc',
            fontSize: 13,
            fontFamily: 'monospace',
            outline: 'none',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = '#14F195'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = '#1a1a1a'; }}
        />
        <button
          onClick={handleSend}
          disabled={!connected || !input.trim()}
          style={{
            background: connected && input.trim() ? '#14F195' : '#1a1a1a',
            color: connected && input.trim() ? '#0a0a0a' : '#333',
            border: 'none',
            borderRadius: 6,
            padding: '0 14px',
            fontSize: 13,
            fontWeight: 700,
            cursor: connected && input.trim() ? 'pointer' : 'default',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  );
}
