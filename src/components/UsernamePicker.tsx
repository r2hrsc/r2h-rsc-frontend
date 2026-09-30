import { useState, useEffect } from 'react';
import { saveAccessToken } from '../lib/referral';

const USERNAME_RE = /^[a-z0-9]{1,12}$/;
const REFCODE_RE = /^[a-z0-9]{1,12}$/;

interface UsernamePickerProps {
  apiUrl: string;
  provider: string;
  externalId: string;
  registrationToken: string;
  onComplete: (rscUsername: string, rscPassword: string) => void;
}

export default function UsernamePicker({ apiUrl, provider, externalId, registrationToken, onComplete }: UsernamePickerProps) {
  const [username, setUsername] = useState('');
  const [refCode, setRefCode] = useState('');
  const [error, setError] = useState('');
  const [refWarning, setRefWarning] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('r2h_ref');
    if (stored) {
      try {
        const { code, ts } = JSON.parse(stored);
        const ageDays = (Date.now() - ts) / (1000 * 60 * 60 * 24);
        if (ageDays < 7 && REFCODE_RE.test(code)) {
          setRefCode(code);
        }
      } catch {
        // ignore parse errors
      }
    }
  }, []);

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
    setUsername(val);
    setError('');
  };

  const handleRefCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
    setRefCode(val);
    setRefWarning('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!USERNAME_RE.test(username)) {
      setError('Username must be 1-12 lowercase letters or numbers.');
      return;
    }
    if (refCode && !REFCODE_RE.test(refCode)) {
      setRefWarning('Referral code must be 1-12 lowercase letters or numbers.');
      return;
    }
    setLoading(true);
    setError('');
    setRefWarning('');
    try {
      const res = await fetch(`${apiUrl}/auth/register-username`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, externalId, username, registrationToken, refCode: refCode || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (data.error === 'username_taken') {
          setError('That username is already taken. Please choose another.');
          setLoading(false);
          return;
        }
        throw new Error(data.error || 'Registration failed');
      }
      if (data.referralWarning) {
        setRefWarning(data.referralWarning);
      }
      saveAccessToken(data.accessToken);
      localStorage.removeItem('r2h_ref');
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
            onChange={handleUsernameChange}
            placeholder="yourname"
            maxLength={12}
            autoFocus
            disabled={loading}
            autoComplete="off"
            spellCheck={false}
          />
          <div style={styles.charCount}>{username.length}/12</div>

          <input
            style={styles.input}
            type="text"
            value={refCode}
            onChange={handleRefCodeChange}
            placeholder="Referral code (optional)"
            maxLength={12}
            disabled={loading}
            autoComplete="off"
            spellCheck={false}
          />
          <div style={styles.charCount}>{refCode.length}/12</div>

          {error && <p style={styles.error}>{error}</p>}
          {refWarning && <p style={styles.warning}>{refWarning}</p>}

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
    background: '#0F1311', borderRadius: 16, padding: '36px 28px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
    width: 360, maxWidth: '92vw', boxSizing: 'border-box' as const,
    border: '1px solid #2A332E',
    fontFamily: "Manrope, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  title: { color: '#F4F1E8', fontSize: 26, fontWeight: 700, margin: 0, fontFamily: 'Cinzel, Georgia, serif' },
  subtitle: { color: '#A2ABA5', fontSize: 13.5, margin: '0 0 8px', textAlign: 'center' as const },
  input: {
    width: '100%', padding: '12px 14px', borderRadius: 8,
    border: '1px solid #2A332E', background: '#0A0C0B', color: '#ECEFEC',
    fontSize: 16, fontFamily: 'monospace', boxSizing: 'border-box' as const,
    outline: 'none',
  },
  charCount: { color: '#7E8781', fontSize: 11, textAlign: 'right' as const, marginTop: -8 },
  error: { color: '#f44', fontSize: 13, textAlign: 'center' as const, margin: 0 },
  warning: { color: '#ffb224', fontSize: 12, textAlign: 'center' as const, margin: 0 },
  btn: {
    width: '100%', padding: '12px 0', borderRadius: 8, border: 'none',
    background: '#E3B55A', color: '#1A1306', fontSize: 15, fontWeight: 700, fontFamily: 'inherit',
    cursor: 'pointer',
  },
};