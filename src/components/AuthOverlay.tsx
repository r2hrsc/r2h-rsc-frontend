import { useState } from 'react';
import { GoogleLogin, CredentialResponse } from '@react-oauth/google';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
interface AuthOverlayProps {
  apiUrl: string;
  onSuccess: (rscUsername: string, rscPassword: string) => void;
}

export default function AuthOverlay({ apiUrl, onSuccess }: AuthOverlayProps) {
  const [status, setStatus] = useState('');
  const [error, setError]   = useState('');

  const { publicKey, signMessage, connected, disconnect } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();

  // ── Google (ID token flow) ──────────────────────────────────────
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
      onSuccess(data.rscUsername, data.rscPassword);
    } catch (err: any) {
      setError(err.message);
      setStatus('');
    }
  };

  // ── Solana wallet ───────────────────────────────────────────────
  const handleWalletAuth = async () => {
    if (!connected || !publicKey || !signMessage) {
      setWalletModalVisible(true);
      return;
    }
    setStatus('Requesting nonce…');
    setError('');
    try {
      const walletAddr = publicKey.toBase58();

      // 1. Get nonce + server-constructed message
      const nonceRes = await fetch(`${apiUrl}/auth/wallet/nonce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: walletAddr }),
      });
      const nonceData = await nonceRes.json();
      if (!nonceData.ok || !nonceData.message) throw new Error(nonceData.error || 'Server did not return a nonce.');

      // 2. Sign the EXACT message from the server
      const messageBytes = new TextEncoder().encode(nonceData.message);
      const signature = await signMessage(messageBytes);

      // 3. Send walletAddress + message + signature
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
      onSuccess(data.rscUsername, data.rscPassword);
    } catch (err: any) {
      setError(err.message);
      setStatus('');
    }
  };

  const handleDisconnect = () => {
    disconnect();
    setError('');
    setStatus('');
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <h1 style={styles.title}>R2H RSC</h1>
        <p style={styles.subtitle}>Sign in to play</p>

        {error && <p style={styles.error}>{error}</p>}
        {status && <p style={styles.status}>{status}</p>}

        {/* Google — renders the official Google button */}
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

        {/* Solana wallet */}
        {connected && publicKey ? (
          <div style={{ width: '100%' }}>
            <p style={styles.walletAddr}>
              {publicKey.toBase58().slice(0, 4)}…{publicKey.toBase58().slice(-4)}
            </p>
            <button style={styles.btn} onClick={handleWalletAuth}>
              Sign in with Wallet
            </button>
            <button style={styles.btnSecondary} onClick={handleDisconnect}>
              Disconnect
            </button>
          </div>
        ) : (
          <button style={styles.btnPhantom} onClick={() => setWalletModalVisible(true)}>
            <img
              src="/icons/phantom.svg"
              alt=""
              width={20}
              height={20}
              style={{ marginRight: 10 }}
            />
            Connect Phantom / Solflare
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
  dividerLine: {
    flex: 1, height: 1, background: '#333',
  },
  dividerText: {
    color: '#555', fontSize: 12, textTransform: 'uppercase' as const,
  },
  btn: {
    width: '100%', padding: '12px 0', borderRadius: 8, border: 'none',
    background: '#fff', color: '#000', fontSize: 15, fontWeight: 600,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  btnPhantom: {
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
