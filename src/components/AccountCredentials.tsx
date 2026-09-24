import { useState } from 'react';

/**
 * AccountCredentials — shows the player's REAL in-game username + password
 * (created automatically by Gmail/wallet sign-in) so they can also log in
 * through the classic "Existing user" login screen, the PC client, or any
 * other RSC client. Password is deterministic: identical every sign-in.
 *
 * Purely additive display component — no changes to the auth flow.
 */
export default function AccountCredentials({ username, password }: { username: string; password: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<'user' | 'pass' | null>(null);

  const copy = async (what: 'user' | 'pass') => {
    const text = what === 'user' ? username : password;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(what);
    setTimeout(() => setCopied(null), 1200);
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} style={styles.trigger} title="Show your game account credentials">
        🔑 Game Login
      </button>
    );
  }

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.title}>🔑 Game Account</span>
        <button onClick={() => setOpen(false)} style={styles.close} aria-label="Close">×</button>
      </div>
      <p style={styles.hint}>
        Sign in anywhere with these — the classic login screen (“Existing user”), the PC client, or any RSC launcher.
        Your password never changes.
      </p>
      <div style={styles.row}>
        <div style={styles.field}>
          <span style={styles.label}>USERNAME</span>
          <code style={styles.value}>{username}</code>
        </div>
        <button onClick={() => copy('user')} style={styles.copyBtn}>
          {copied === 'user' ? '✓' : 'Copy'}
        </button>
      </div>
      <div style={styles.row}>
        <div style={styles.field}>
          <span style={styles.label}>PASSWORD</span>
          <code style={styles.value}>{password}</code>
        </div>
        <button onClick={() => copy('pass')} style={styles.copyBtn}>
          {copied === 'pass' ? '✓' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  trigger: {
    background: 'transparent',
    border: '1px solid #8a7bff',
    color: '#8a7bff',
    padding: '8px 14px',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    minHeight: 44,
    touchAction: 'manipulation',
    whiteSpace: 'nowrap',
  },
  panel: {
    position: 'absolute',
    top: 54,
    right: 12,
    width: 300,
    background: '#0d0d0d',
    border: '1px solid #2a2a2a',
    borderRadius: 10,
    padding: 14,
    zIndex: 200,
    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  title: { color: '#e5e5e5', fontSize: 14, fontWeight: 700 },
  close: {
    background: 'none', border: 'none', color: '#888', fontSize: 20, cursor: 'pointer', lineHeight: 1, padding: '0 4px',
  },
  hint: { color: '#888', fontSize: 11, margin: '0 0 10px', lineHeight: 1.5 },
  row: {
    display: 'flex', alignItems: 'flex-end', gap: 8, marginBottom: 10,
  },
  field: { flex: 1, minWidth: 0 },
  label: { display: 'block', color: '#666', fontSize: 9, letterSpacing: 1, marginBottom: 3 },
  value: {
    display: 'block', color: '#14F195', fontSize: 14, fontFamily: 'monospace',
    background: '#141414', border: '1px solid #222', borderRadius: 4, padding: '6px 8px',
    overflowWrap: 'anywhere',
  },
  copyBtn: {
    background: '#141414', border: '1px solid #2a2a2a', color: '#e5e5e5',
    padding: '7px 10px', borderRadius: 4, fontSize: 11, cursor: 'pointer', minHeight: 32,
  },
};
