import { useState, useEffect, useRef } from 'react';
import { GoogleLogin, CredentialResponse } from '@react-oauth/google';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';

interface AuthOverlayProps {
  apiUrl: string;
  onAuthComplete: (provider: string, externalId: string) => void;
  onExistingUser: (provider: string, externalId: string, rscUsername: string, rscPassword: string) => void;
}

export default function AuthOverlay({ apiUrl, onAuthComplete, onExistingUser }: AuthOverlayProps) {
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const walletAuthAttempted = useRef(false);

  const { publicKey, signMessage, connected, disconnect } = useWallet();
  const { setVisible } = useWalletModal();

  // ── Auto-trigger wallet auth when connected ─────────────────
  useEffect(() => {
    if (!connected || !publicKey || !signMessage) return;
    if (walletAuthAttempted.current) return;
    walletAuthAttempted.current = true;
    doWalletAuth(publicKey.toBase58(), signMessage);
  }, [connected, publicKey, signMessage]);

  // Reset the guard when disconnected
  useEffect(() => {
    if (!connected) {
      walletAuthAttempted.current = false;
    }
  }, [connected]);

  // ── Connect wallet button handler ───────────────────────────
  const handleConnectWallet = () => {
    console.log('[Auth] Connect Wallet clicked');
    setError('');
    setVisible(true);
  };

  // ── Google (ID token flow) ──────────────────────────────────
  const handleGoogleSuccess = async (resp: CredentialResponse) => {
    if (!resp.credential) {
      setError('Google did not return a credential.');
      return;
    }
    setStatus('Signing in with Google…');
    setError('');
    try {
      const res = await fetch(`${apiUrl}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: resp.credential }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Google auth failed');
      if (data.existing && data.rscUsername && data.rscPassword) {
        onExistingUser(data.provider || 'google', data.externalId, data.rscUsername, data.rscPassword);
      } else {
        onAuthComplete(data.provider || 'google', data.externalId);
      }
    } catch (err: any) {
      setError(err.message);
      setStatus('');
    }
  };

  // ── Wallet auth (nonce → sign → verify) ─────────────────────
  const doWalletAuth = async (walletAddr: string, sign: (msg: Uint8Array) => Promise<Uint8Array>) => {
    setStatus('Requesting nonce…');
    setError('');
    try {
      console.log('[Auth] Wallet connected:', walletAddr);
      const nonceRes = await fetch(`${apiUrl}/auth/wallet/nonce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: walletAddr }),
      });
      const nonceData = await nonceRes.json();
      if (!nonceData.ok || !nonceData.message) throw new Error(nonceData.error || 'Server did not return a nonce.');
      console.log('[Auth] Nonce received');

      const messageBytes = new TextEncoder().encode(nonceData.message);
      console.log('[Auth] Signing message…');
      const signature = await sign(messageBytes);
      console.log('[Auth] ✅ Signature received, length:', signature.length);

      setStatus('Verifying signature…');
      const authRes = await fetch(`${apiUrl}/auth/wallet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress: walletAddr,
          message: nonceData.message,
          signature: btoa(String.fromCharCode(...signature)),
        }),
      });
      const data = await authRes.json();
      if (!authRes.ok || !data.ok) throw new Error(data.error || 'Wallet auth failed');
      console.log('[Auth] ✅ Wallet auth complete');
      if (data.existing && data.rscUsername && data.rscPassword) {
        onExistingUser(data.provider || 'wallet', data.externalId || walletAddr, data.rscUsername, data.rscPassword);
      } else {
        onAuthComplete(data.provider || 'wallet', data.externalId || walletAddr);
      }
    } catch (err: any) {
      console.error('[Auth] ❌ Wallet auth error:', err);
      setError(err.message);
      setStatus('');
      walletAuthAttempted.current = false;
    }
  };

  const handleDisconnect = () => {
    disconnect();
    setError('');
    setStatus('');
    walletAuthAttempted.current = false;
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <h1 style={styles.title}>R2H RSC</h1>
        <p style={styles.subtitle}>Sign in to play</p>

        {error && <p style={styles.error}>{error}</p>}
        {status && <p style={styles.status}>{status}</p>}

        {/* Google */}
        <div style={{ width: '100%', display: 'flex', justifyContent: 'center' }}>
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={() => setError('Google login failed.')}
            theme="filled_black"
            size="large"
            width="280"
            text="signin_with"
          />
        </div>

        <div style={styles.divider}>
          <span style={styles.dividerLine} />
          <span style={styles.dividerText}>or</span>
          <span style={styles.dividerLine} />
        </div>

        {/* Wallet */}
        {connected && publicKey ? (
          <div style={{ width: '100%' }}>
            <p style={styles.walletAddr}>
              {publicKey.toBase58().slice(0, 4)}…{publicKey.toBase58().slice(-4)}
            </p>
            <p style={styles.status}>{status || 'Connected — authenticating…'}</p>
            <button style={styles.btnSecondary} onClick={handleDisconnect}>
              Disconnect
            </button>
          </div>
        ) : (
          <button style={styles.btnConnect} onClick={handleConnectWallet}>
            Connect Wallet
          </button>
        )}
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
  title:    { color: '#fff', fontSize: 28, fontWeight: 700, margin: 0 },
  subtitle: { color: '#888', fontSize: 14, margin: '0 0 8px' },
  error:    { color: '#f44', fontSize: 13, textAlign: 'center' as const },
  status:   { color: '#4af', fontSize: 13, textAlign: 'center' as const },
  walletAddr: {
    color: '#aaa', fontSize: 12, textAlign: 'center' as const,
    fontFamily: 'monospace', marginBottom: 8,
  },
  divider: {
    display: 'flex', alignItems: 'center', width: '100%', gap: 10, margin: '4px 0',
  },
  dividerLine: { flex: 1, height: 1, background: '#333' },
  dividerText: { color: '#555', fontSize: 12, textTransform: 'uppercase' as const },
  btnConnect: {
    width: '100%', padding: '12px 0', borderRadius: 8, border: 'none',
    background: '#ab9ff2', color: '#fff', fontSize: 15, fontWeight: 600,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  btnSecondary: {
    width: '100%', padding: '10px 0', borderRadius: 8,
    border: '1px solid #333', background: 'transparent', color: '#888',
    fontSize: 13, cursor: 'pointer', marginTop: 6,
  },
};
