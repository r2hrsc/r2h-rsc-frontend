import { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'https://api.r2hrsc.xyz';

interface ReferralStats {
  total: number;
  qualified: number;
  creditsAvailable: number;
  packsClaimed: number;
}

interface ReferralMeResponse {
  ok: boolean;
  refCode: string;
  referralUrl: string;
  stats: ReferralStats;
}

export function ReferralCard({ username }: { username: string | null }) {
  const [data, setData] = useState<ReferralMeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!username) {
      setData(null);
      setLoading(false);
      return;
    }

    const token = localStorage.getItem('r2h_access_token');
    if (!token) {
      setData(null);
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API_URL}/v1/referral/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = await res.json();
        if (res.ok && json.ok) {
          setData(json);
        } else {
          setError(json.error || 'Failed to load referral data');
        }
      } catch (err) {
        console.error('[ReferralCard] Fetch failed:', err);
        setError('Failed to load referral data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [username]);

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('[ReferralCard] Copy failed:', err);
    }
  };

  if (!username) {
    return (
      <div style={styles.card}>
        <h3 style={styles.title}>Referral Program</h3>
        <p style={styles.placeholder}>Sign in to see your referral link</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={styles.card}>
        <h3 style={styles.title}>Referral Program</h3>
        <div style={styles.loading}>Loading…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.card}>
        <h3 style={styles.title}>Referral Program</h3>
        <p style={styles.error}>{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={styles.card}>
        <h3 style={styles.title}>Referral Program</h3>
        <p style={styles.placeholder}>Sign in to see your referral link</p>
      </div>
    );
  }

  const { refCode, referralUrl, stats } = data;

  return (
    <div style={styles.card}>
      <h3 style={styles.title}>Referral Program</h3>

      <div style={styles.section}>
        <label style={styles.label}>Your Referral Code</label>
        <div style={styles.codeRow}>
          <span style={styles.code}>{refCode}</span>
        </div>
      </div>

      <div style={styles.section}>
        <label style={styles.label}>Referral Link</label>
        <div style={styles.linkRow}>
          <input
            style={styles.linkInput}
            type="text"
            value={referralUrl}
            readOnly
            onClick={e => (e.target as HTMLInputElement).select()}
          />
          <button
            style={{ ...styles.copyBtn, background: copied ? '#14F195' : '#333' }}
            onClick={() => copyToClipboard(referralUrl)}
            aria-label={copied ? 'Copied!' : 'Copy to clipboard'}
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      </div>

      <div style={styles.section}>
        <label style={styles.label}>Stats</label>
        <div style={styles.statsGrid}>
          <div style={styles.stat}>
            <span style={styles.statValue}>{stats.total}</span>
            <span style={styles.statLabel}>Total Referrals</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statValue}>{stats.qualified}</span>
            <span style={styles.statLabel}>Qualified (≥30 total)</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statValue}>{stats.creditsAvailable}</span>
            <span style={styles.statLabel}>Credits Available</span>
          </div>
          <div style={styles.stat}>
            <span style={styles.statValue}>{stats.packsClaimed}</span>
            <span style={styles.statLabel}>Packs Claimed</span>
          </div>
        </div>
      </div>

      <p style={styles.howItWorks}>
        Share your link. New players who sign up with it get ::noobpack in-game.
        When they claim it and reach total level 30, you earn a credit: spend it on
        ::propack mithril or ::propack adamantite. After 3 qualified referrals,
        ::kingpack unlocks. Check progress in-game with ::refstats.
      </p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    background: '#111',
    borderRadius: 12,
    padding: '20px',
    border: '1px solid #222',
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  title: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 700,
    margin: '0 0 16px',
  },
  placeholder: {
    color: '#666',
    fontSize: 13,
    margin: 0,
    textAlign: 'center' as const,
  },
  loading: {
    color: '#888',
    fontSize: 13,
    textAlign: 'center' as const,
  },
  error: {
    color: '#f44',
    fontSize: 13,
    margin: 0,
    textAlign: 'center' as const,
  },
  section: {
    marginBottom: 16,
  },
  label: {
    display: 'block',
    color: '#888',
    fontSize: 11,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginBottom: 6,
  },
  codeRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  code: {
    background: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: 6,
    padding: '8px 12px',
    fontSize: 16,
    fontFamily: 'monospace',
    color: '#14F195',
    fontWeight: 600,
    flex: 1,
  },
  linkRow: {
    display: 'flex',
    gap: 8,
  },
  linkInput: {
    flex: 1,
    background: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: 6,
    padding: '8px 12px',
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#aaa',
    outline: 'none',
  },
  copyBtn: {
    padding: '8px 16px',
    borderRadius: 6,
    border: 'none',
    background: '#333',
    color: '#fff',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    transition: 'background 0.2s',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: 12,
  },
  stat: {
    background: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: 8,
    padding: '12px',
    textAlign: 'center',
  },
  statValue: {
    display: 'block',
    fontSize: 24,
    fontWeight: 700,
    color: '#14F195',
    lineHeight: 1.2,
  },
  statLabel: {
    display: 'block',
    fontSize: 10,
    color: '#888',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    marginTop: 4,
  },
  howItWorks: {
    color: '#555',
    fontSize: 11,
    lineHeight: 1.5,
    margin: '12px 0 0',
    textAlign: 'center' as const,
  },
};