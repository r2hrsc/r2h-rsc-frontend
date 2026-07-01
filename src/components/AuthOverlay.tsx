import { useState, useCallback } from 'react';
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import { useWalletConnect } from '../hooks/useWalletConnect';

interface AuthOverlayProps {
  apiUrl: string;
  onAuthComplete: (provider: string, externalId: string) => void;
  onExistingUser: (provider: string, externalId: string, rscUsername: string, rscPassword: string) => void;
}

export default function AuthOverlay({ apiUrl, onAuthComplete, onExistingUser }: AuthOverlayProps) {
  const [error, setError] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const { state: wcState, connect: wcConnect, disconnect: wcDisconnect } = useWalletConnect();

  // Google login via @react-oauth/google → backend /auth/google
  const handleGoogleSuccess = async (resp: CredentialResponse) => {
    if (!resp.credential) {
      setError('Google did not return a credential.');
      return;
    }
    setSigningIn(true);
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
      console.error('[Auth] Google auth error:', err);
      setError(err.message);
      setSigningIn(false);
    }
  };

  // Wallet connection via standalone WalletConnect (bypasses Privy)
  const handleWalletConnect = async () => {
    setError('');
    console.log('[Auth] WalletConnect started');
    try {
      const address = await wcConnect();
      if (address) {
        console.log('[Auth] Wallet connected:', address);
        setSigningIn(true);
        // Send wallet address to backend for auth
        const res = await fetch(`${apiUrl}/auth/wallet`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.ok) {
          if (data.existing && data.rscUsername && data.rscPassword) {
            onExistingUser('wallet', address, data.rscUsername, data.rscPassword);
          } else {
            onAuthComplete('wallet', address);
          }
        } else {
          // Backend might not have /auth/wallet yet — proceed with address as ID
          onAuthComplete('wallet', address);
        }
      }
    } catch (err: any) {
      console.error('[Auth] WalletConnect error:', err);
      setError(err.message || 'Wallet connection failed');
      wcDisconnect();
    }
  };

  const closeWalletModal = () => {
    wcDisconnect();
  };

  // Full-screen signing in state
  if (signingIn) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 1039,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.9)', gap: 16,
      }}>
        <div style={{
          width: 32, height: 32, border: '3px solid #333', borderTop: '3px solid #14F195',
          borderRadius: '50%', animation: 'spin 0.8s linear infinite',
        }} />
        <p style={{ color: '#888', fontSize: 14, fontFamily: 'monospace', margin: 0 }}>Signing in...</p>
      </div>
    );
  }

  return (
    <>
      <div style={styles.overlay}>
        <div style={styles.card}>
          <h1 style={styles.title}>R2H RSC</h1>
          <p style={styles.subtitle}>Sign in to play</p>

          {error && <p style={styles.error}>{error}</p>}

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

          {/* Wallet via standalone WalletConnect */}
          <button style={styles.btnConnect} onClick={handleWalletConnect}>
            Connect Wallet
          </button>
        </div>
      </div>

      {/* WalletConnect QR Modal */}
      {wcState.show && (
        <div style={modalStyles.backdrop} onClick={(e) => { if (e.target === e.currentTarget) closeWalletModal(); }}>
          <div style={modalStyles.modal}>
            <button style={modalStyles.closeBtn} onClick={closeWalletModal}>✕</button>

            <h2 style={modalStyles.title}>Connect Wallet</h2>
            <p style={modalStyles.subtitle}>Scan with MetaMask, Phantom, Trust Wallet or any WC-compatible wallet</p>

            {wcState.error && (
              <div style={modalStyles.errorBox}>
                <p style={{ margin: 0, fontSize: 13 }}>{wcState.error}</p>
              </div>
            )}

            {wcState.qrDataUrl ? (
              <div style={modalStyles.qrContainer}>
                <img src={wcState.qrDataUrl} alt="WalletConnect QR Code" style={modalStyles.qrImg} />
                <p style={modalStyles.hint}>
                  Open your wallet app and scan this code
                </p>
              </div>
            ) : wcState.connecting ? (
              <div style={modalStyles.loading}>
                <div style={{
                  width: 40, height: 40, border: '3px solid #333', borderTop: '3px solid #14F195',
                  borderRadius: '50%', animation: 'spin 0.8s linear infinite',
                }} />
                <p style={{ color: '#888', fontSize: 13, marginTop: 12 }}>Generating QR code...</p>
              </div>
            ) : null}

            {/* Wallet deep links for mobile */}
            <div style={modalStyles.walletLinks}>
              <a href={`https://metamask.app.link/wc?uri=${encodeURIComponent(wcState.uri)}`} target="_blank" rel="noreferrer" style={modalStyles.walletLink}>
                MetaMask
              </a>
              <a href={`https://phantom.app/ul/browse/${encodeURIComponent(wcState.uri)}`} target="_blank" rel="noreferrer" style={modalStyles.walletLink}>
                Phantom
              </a>
              <a href={`https://link.trustwallet.com/walletconnect?uri=${encodeURIComponent(wcState.uri)}`} target="_blank" rel="noreferrer" style={modalStyles.walletLink}>
                Trust Wallet
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 1039,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'transparent',
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
  divider: {
    display: 'flex', alignItems: 'center', width: '100%', gap: 10, margin: '4px 0',
  },
  dividerLine: { flex: 1, height: 1, background: '#333' },
  dividerText: { color: '#555', fontSize: 12, textTransform: 'uppercase' as const },
  btnConnect: {
    width: '100%', padding: '12px 0', borderRadius: 8, border: 'none',
    background: '#ab9ff2', color: '#fff', fontSize: 15, fontWeight: 600,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    minHeight: 44,
    touchAction: 'manipulation',
  },
};

const modalStyles: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed', inset: 0, zIndex: 2099,
    background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  modal: {
    background: '#161618', borderRadius: 16, padding: 32,
    width: 360, maxWidth: '90vw',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
    border: '1px solid #2a2a2a',
    position: 'relative',
  },
  closeBtn: {
    position: 'absolute', top: 12, right: 12,
    background: 'none', border: 'none', color: '#555',
    fontSize: 20, cursor: 'pointer', padding: 4,
  },
  title: { color: '#fff', fontSize: 20, fontWeight: 700, margin: 0 },
  subtitle: { color: '#777', fontSize: 12, textAlign: 'center' as const, margin: '0 0 4px' },
  qrContainer: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
  },
  qrImg: {
    width: 240, height: 240, borderRadius: 8,
    background: '#fff', padding: 8,
  },
  hint: { color: '#888', fontSize: 12, textAlign: 'center' as const },
  loading: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    height: 200,
  },
  errorBox: {
    background: '#1a0d0d', border: '1px solid #3a1515', borderRadius: 8,
    padding: '8px 12px', width: '100%',
  },
  walletLinks: {
    display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' as const,
    justifyContent: 'center',
  },
  walletLink: {
    color: '#14F195', fontSize: 12, textDecoration: 'none',
    padding: '4px 10px', border: '1px solid #1f3a2a', borderRadius: 6,
    background: '#0d1f14',
  },
};
