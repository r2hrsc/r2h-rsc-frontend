import { useState } from 'react';

const USERNAME_RE = /^[a-z0-9]{1,12}$/;

interface UsernamePickerProps {
  apiUrl: string;
  provider: string;
  externalId: string;
  onComplete: (rscUsername: string, rscPassword: string) => void;
}

export default function UsernamePicker({ apiUrl, provider, externalId, onComplete }: UsernamePickerProps) {
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
    setUsername(val);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!USERNAME_RE.test(username)) {
      setError('Username must be 1-12 lowercase letters or numbers.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${apiUrl}/auth/register-username`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, externalId, username }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Registration failed');
      }
      onComplete(data.rscUsername, data.rscPassword);
    } catch (err: any) {
      console.error('[UsernamePicker] Failed to register username:', err);
      const message = err.message === 'Failed to fetch'
        ? 'Could not reach the server. Please try again later.'
        : (err.message || 'Registration failed');
      setError(message);
      setLoading(false);
    }
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <h1 style={styles.title}>Pick a Username</h1>
        <p style={styles.subtitle}>Choose your in-game name (max 12 chars, a-z 0-9)</p>

        <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            style={styles.input}
            type="text"
            value={username}
            onChange={handleChange}
            placeholder="yourname"
            maxLength={12}
            autoFocus
            disabled={loading}
            autoComplete="off"
            spellCheck={false}
          />
          <div style={styles.charCount}>{username.length}/12</div>

          {error && <p style={styles.error}>{error}</p>}

          <button style={{ ...styles.btn, opacity: loading || !username ? 0.5 : 1 }} type="submit" disabled={loading || !username}>
            {loading ? 'Creating account…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 9999,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(0,0,0,0.85)',
    backdropFilter: 'blur(6px)',
  },
  card: {
    background: '#111', borderRadius: 16, padding: '40px 32px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
    width: 340, maxWidth: '90vw',
    border: '1px solid #222',
  },
  title: { color: '#fff', fontSize: 24, fontWeight: 700, margin: 0 },
  subtitle: { color: '#888', fontSize: 13, margin: '0 0 8px', textAlign: 'center' as const },
  input: {
    width: '100%', padding: '12px 14px', borderRadius: 8,
    border: '1px solid #333', background: '#1a1a1a', color: '#fff',
    fontSize: 16, fontFamily: 'monospace', boxSizing: 'border-box' as const,
    outline: 'none',
  },
  charCount: { color: '#555', fontSize: 11, textAlign: 'right' as const, marginTop: -8 },
  error: { color: '#f44', fontSize: 13, textAlign: 'center' as const, margin: 0 },
  btn: {
    width: '100%', padding: '12px 0', borderRadius: 8, border: 'none',
    background: '#fff', color: '#000', fontSize: 15, fontWeight: 600,
    cursor: 'pointer',
  },
};
