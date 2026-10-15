import { useState } from 'react';
import LinkPayoutWallet from './LinkPayoutWallet';

/**
 * AccountCredentials — shows the player's REAL in-game username + password
 * (created automatically by Gmail/wallet sign-in) so they can also log in
 * through the classic "Existing user" login screen, the PC client, or any
 * other RSC client. Password is deterministic: identical every sign-in.
 *
 * Purely additive display component — no changes to the auth flow.
 */
export default function AccountCredentials({ username, password, onClose }: { username: string; password: string; onClose: () => void }) {
  // v-acct (9/30): no on-screen trigger any more — opened from the gear menu
  // ("Account details"), closed with × (the owner found the tag in the way).
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

  return (
    <div style={styles.panel}>
      <div style={styles.header}>
        <span style={styles.title}>🔑 Game Account</span>
        <button onClick={onClose} style={styles.close} aria-label="Close">×</button>
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
      {/* $RUNE payouts need a SOLANA address. Accounts created before Solana
          support have an EVM (0x) identity, which cannot receive an SPL token,
          so those players' kills sit unpaid. This links a Solana wallet to the
          account they are already signed into — signing in with Solana instead
          would create a SECOND account and strand what they already earned. */}
      <div style={styles.payout}>
        <LinkPayoutWallet username={username} />
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  // v-fit (9/29): OUT of the layout flow. As a normal in-flow button it pushed
  // the game down 44px inside .game-frame — bottom of the game cut off on
  // phones (frame overflow:hidden) and ~28px below the screen on desktop.
  // Now a compact overlay in the frame's top-left corner.
  trigger: {
    position: 'absolute',
    top: 6,
    left: 6,
    zIndex: 20,
    background: 'rgba(10, 10, 10, 0.78)',
    border: '1px solid #8a7bff',
    color: '#8a7bff',
    padding: '4px 10px',
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    minHeight: 32,
    touchAction: 'manipulation',
    whiteSpace: 'nowrap',
  },
  // Fixed + centred so it is never clipped by the (overflow:hidden) phone frame.
  panel: {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: 300,
    maxWidth: 'calc(100vw - 24px)',
    boxSizing: 'border-box',
    background: '#0d0d0d',
    border: '1px solid #2a2a2a',
    borderRadius: 10,
    padding: 14,
    zIndex: 10000,
    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  title: { color: '#e5e5e5', fontSize: 14, fontWeight: 700 },
  payout: { marginTop: 14, paddingTop: 12, borderTop: '1px solid #222' },
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
