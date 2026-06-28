import { useState } from 'react';
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import { useLogin } from '@privy-io/react-auth';

interface AuthOverlayProps {
  apiUrl: string;
  onAuthComplete: (provider: string, externalId: string) => void;
  onExistingUser: (provider: string, externalId: string, rscUsername: string, rscPassword: string) => void;
}

export default function AuthOverlay({ apiUrl, onAuthComplete, onExistingUser }: AuthOverlayProps) {
  const [error, setError] = useState('');
  const [signingIn, setSigningIn] = useState(false);

  // Privy for wallet connections
  const { login } = useLogin({
    onComplete: ({ user, isNewUser }) => {
      const externalId = user.wallet?.address || user.email?.address || user.id;
      console.log('[Auth] Privy login complete:', externalId);
      setSigningIn(true);
      // Backend expects 'google' or 'wallet' — Privy wallet logins are 'wallet'
      if (isNewUser) {
        onAuthComplete('wallet', externalId);
      } else {
        onExistingUser('wallet', externalId, externalId, user.id);
      }
    },
    onError: (err) => {
      console.error('[Auth] Privy login error:', err);
      setError('Wallet connection failed.');
      setSigningIn(false);
    },
  });

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

        {/* Wallet via Privy */}
        <button style={styles.btnConnect} onClick={() => {
          console.log('[Auth] Connect Wallet clicked');
          setError('');
          login();
        }}>
          Connect Wallet
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 1039,
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
