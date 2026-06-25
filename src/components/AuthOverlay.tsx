import { useState, useEffect, useRef } from 'react';
import { GoogleLogin, CredentialResponse } from '@react-oauth/google';
import { useAppKit, useAppKitProvider, useAppKitState } from '@reown/appkit/library/react';
import { useAppKitAccount } from '@reown/appkit-core/react';
import { useAppKitConnection } from '@reown/appkit-adapter-solana/react';
import { useDisconnect } from '@reown/appkit-solana/react';
import type { Provider } from '@reown/appkit-adapter-solana';

interface AuthOverlayProps {
  apiUrl: string;
  onAuthComplete: (provider: string, externalId: string) => void;
  onExistingUser: (provider: string, externalId: string, rscUsername: string, rscPassword: string) => void;
}

export default function AuthOverlay({ apiUrl, onAuthComplete, onExistingUser }: AuthOverlayProps) {
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const walletAuthAttempted = useRef(false);

  // AppKit hooks
  const { address, isConnected } = useAppKitAccount();
  const { walletProvider } = useAppKitProvider<Provider>('solana');
  const { disconnect } = useDisconnect();
  const { open } = useAppKit();

  // ── Auto-trigger wallet auth when connected ─────────────────
  useEffect(() => {
    if (!isConnected || !address || !walletProvider) return;
    if (walletAuthAttempted.current) return;
    walletAuthAttempted.current = true;
    doWalletAuth(address, walletProvider);
  }, [isConnected, address, walletProvider]);

  // Reset the guard when disconnected
  useEffect(() => {
    if (!isConnected) {
      walletAuthAttempted.current = false;
    }
  }, [isConnected]);

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
  const doWalletAuth = async (walletAddr: string, provider: Provider) => {
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
      console.log('[Auth] Nonce received:', nonceData.message.substring(0, 60) + '…');

      const messageBytes = new TextEncoder().encode(nonceData.message);
      console.log('[Auth] Signing message with wallet provider…');
      const signature = await provider.signMessage(messageBytes);
      console.log('[Auth] Signature received, length:', signature.length);

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
      console.log('[Auth] Wallet auth success:', data);
      if (data.existing && data.rscUsername && data.rscPassword) {
        onExistingUser(data.provider || 'wallet', data.externalId || walletAddr, data.rscUsername, data.rscPassword);
      } else {
        onAuthComplete(data.provider || 'wallet', data.externalId || walletAddr);
      }
    } catch (err: any) {
      console.error('[Auth] Wallet auth error:', err);
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
        {isConnected && address ? (
          <div style={{ width: '100%' }}>
            <p style={styles.walletAddr}>
              {address.slice(0, 4)}…{address.slice(-4)}
            </p>
            <p style={styles.status}>{status || 'Connected — authenticating…'}</p>
            <button style={styles.btnSecondary} onClick={handleDisconnect}>
              Disconnect
            </button>
          </div>
        ) : (
          <>
            {/* w3m-button: handles Phantom/Solflare extensions, WalletConnect QR, and mobile */}
            {/* @ts-expect-error web component registered by AppKit */}
            <w3m-button size="md" label="Connect Wallet" loadingLabel="Connecting…" />
          </>
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
  btnSecondary: {
    width: '100%', padding: '10px 0', borderRadius: 8,
    border: '1px solid #333', background: 'transparent', color: '#888',
    fontSize: 13, cursor: 'pointer', marginTop: 6,
  },
};
