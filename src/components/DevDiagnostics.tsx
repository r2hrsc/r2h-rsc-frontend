import { useState } from 'react';

interface CheckResult {
  label: string;
  pass: boolean;
  detail: string;
}

const API_URL = import.meta.env.VITE_API_URL || 'https://api.r2hrsc.xyz';

export default function DevDiagnostics({ onClose }: { onClose: () => void }) {
  const [results, setResults] = useState<CheckResult[]>([]);
  const [running, setRunning] = useState(false);

  const runChecks = async () => {
    setRunning(true);
    const out: CheckResult[] = [];

    // ── CHECK 1: API Health & CORS ────────────────────────────────
    try {
      const res = await fetch(`${API_URL}/health`, { method: 'GET' });
      const body = await res.text();
      if (res.ok) {
        out.push({ label: 'API Health', pass: true, detail: `HTTP ${res.status} — ${body}` });
      } else {
        out.push({ label: 'API Health', pass: false, detail: `HTTP ${res.status} — ${body}` });
      }
    } catch (err: any) {
      out.push({ label: 'API Health', pass: false, detail: `${err.name}: ${err.message}` });
    }

    // ── CHECK 2: Polyfills ────────────────────────────────────────
    const w = window as any;
    const hasBuffer = typeof w.Buffer !== 'undefined';
    const hasGlobal = typeof w.global !== 'undefined';
    if (hasBuffer && hasGlobal) {
      out.push({ label: 'Polyfills', pass: true, detail: 'PASS: Buffer and global are defined. Wallet code will work.' });
    } else {
      const missing: string[] = [];
      if (!hasBuffer) missing.push('Buffer');
      if (!hasGlobal) missing.push('global');
      out.push({ label: 'Polyfills', pass: false, detail: `FAIL: Missing ${missing.join(', ')}. Wallet adapters will crash.` });
    }

    // ── CHECK 3: Env Vars ─────────────────────────────────────────
    const googleId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
    const wcId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '';

    if (googleId) {
      out.push({ label: 'Google Client ID', pass: true, detail: `OK: ${googleId.slice(0, 5)}…${googleId.slice(-4)}` });
    } else {
      out.push({ label: 'Google Client ID', pass: false, detail: 'FAIL: VITE_GOOGLE_CLIENT_ID is missing or empty.' });
    }

    if (wcId) {
      out.push({ label: 'WalletConnect ID', pass: true, detail: `OK: ${wcId.slice(0, 5)}…${wcId.slice(-4)}` });
    } else {
      out.push({ label: 'WalletConnect ID', pass: false, detail: 'FAIL: VITE_WALLETCONNECT_PROJECT_ID is missing or empty.' });
    }

    // ── CHECK 4: Wallet Adapter ───────────────────────────────────
    const hasPhantom = !!w.phantom?.solana;
    const hasSolflare = !!w.solflare;
    out.push({
      label: 'Browser Wallets',
      pass: hasPhantom || hasSolflare,
      detail: hasPhantom || hasSolflare
        ? `Detected: ${[hasPhantom && 'Phantom', hasSolflare && 'Solflare'].filter(Boolean).join(', ')}`
        : 'No browser wallet extensions detected (Phantom / Solflare).',
    });

    setResults(out);
    setRunning(false);
  };

  const passCount = results.filter((r) => r.pass).length;
  const totalCount = results.length;

  return (
    <div style={s.overlay}>
      <div style={s.panel}>
        <div style={s.header}>
          <h2 style={s.title}>Diagnostics</h2>
          <button style={s.closeBtn} onClick={onClose}>✕</button>
        </div>

        {results.length === 0 ? (
          <div style={s.center}>
            <button style={s.runBtn} onClick={runChecks} disabled={running}>
              {running ? 'Running…' : 'Run Diagnostics'}
            </button>
          </div>
        ) : (
          <>
            <div style={{ ...s.summary, color: passCount === totalCount ? '#4f4' : '#f44' }}>
              {passCount}/{totalCount} checks passed
            </div>
            <div style={s.scrollArea}>
              {results.map((r, i) => (
                <div key={i} style={s.row}>
                  <span style={{ ...s.badge, background: r.pass ? '#0a4' : '#a00' }}>
                    {r.pass ? 'PASS' : 'FAIL'}
                  </span>
                  <div style={s.rowContent}>
                    <div style={s.label}>{r.label}</div>
                    <pre style={s.detail}>{r.detail}</pre>
                  </div>
                </div>
              ))}
            </div>
            <div style={s.footer}>
              <button style={s.runBtn} onClick={runChecks} disabled={running}>
                {running ? 'Running…' : 'Re-run'}
              </button>
              <button style={s.copyBtn} onClick={() => {
                const text = results.map(r => `[${r.pass ? 'PASS' : 'FAIL'}] ${r.label}: ${r.detail}`).join('\n');
                navigator.clipboard.writeText(text);
              }}>
                Copy All
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 99999,
    background: 'rgba(0,0,0,0.92)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 16,
  },
  panel: {
    background: '#0a0a0a', border: '1px solid #333', borderRadius: 12,
    width: 520, maxWidth: '95vw', maxHeight: '90vh',
    display: 'flex', flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '16px 20px', borderBottom: '1px solid #222',
  },
  title: { color: '#fff', fontSize: 20, fontWeight: 700, margin: 0 },
  closeBtn: {
    background: 'none', border: 'none', color: '#888', fontSize: 22,
    cursor: 'pointer', padding: '0 4px',
  },
  center: {
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    padding: '60px 20px',
  },
  summary: {
    padding: '12px 20px', fontSize: 16, fontWeight: 700,
    borderBottom: '1px solid #222',
  },
  scrollArea: {
    flex: 1, overflow: 'auto', padding: '8px 0',
  },
  row: {
    display: 'flex', alignItems: 'flex-start', gap: 12,
    padding: '12px 20px', borderBottom: '1px solid #181818',
  },
  badge: {
    color: '#fff', fontSize: 11, fontWeight: 700, borderRadius: 4,
    padding: '3px 8px', flexShrink: 0, marginTop: 2,
    fontFamily: 'monospace',
  },
  rowContent: { flex: 1, minWidth: 0 },
  label: { color: '#ccc', fontSize: 14, fontWeight: 600, marginBottom: 4 },
  detail: {
    color: '#aaa', fontSize: 13, fontFamily: 'monospace',
    margin: 0, whiteSpace: 'pre-wrap' as const, wordBreak: 'break-all' as const,
    lineHeight: 1.5,
  },
  footer: {
    display: 'flex', gap: 10, padding: '12px 20px', borderTop: '1px solid #222',
  },
  runBtn: {
    flex: 1, padding: '12px 0', borderRadius: 8, border: 'none',
    background: '#fff', color: '#000', fontSize: 15, fontWeight: 700,
    cursor: 'pointer',
  },
  copyBtn: {
    flex: 1, padding: '12px 0', borderRadius: 8,
    border: '1px solid #444', background: 'transparent', color: '#aaa',
    fontSize: 15, fontWeight: 600, cursor: 'pointer',
  },
};
