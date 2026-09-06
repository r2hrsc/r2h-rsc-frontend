import { useState, useEffect, useRef } from 'react';
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import { modal as walletModal, useAppKitAccount, useAppKitProvider, useDisconnect } from '@reown/appkit/react';
import type { Eip1193Provider } from 'ethers';

interface AuthOverlayProps {
  apiUrl: string;
  onAuthComplete: (provider: string, externalId: string, registrationToken: string) => void;
  onExistingUser: (provider: string, externalId: string, rscUsername: string, rscPassword: string) => void;
}

export default function AuthOverlay({ apiUrl, onAuthComplete, onExistingUser }: AuthOverlayProps) {
  const [error, setError] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [statusText, setStatusText] = useState('Signing in...');
  const [showDirect, setShowDirect] = useState(false);
  const [rscUser, setRscUser] = useState('');
  const [rscPass, setRscPass] = useState('');

  // initWalletKit() is now called in AppContent — during the loading screen,
  // before ad zones render, to prevent the w3m-modal initialization flash.

  // Track wallet connection state via Reown hooks
  const { address, isConnected } = useAppKitAccount();
  const { walletProvider } = useAppKitProvider('eip155');
  const { disconnect } = useDisconnect();

  // Guard against double-firing when both isConnected and address update,
  // and against re-triggering the signature prompt for an already-handled address.
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    if (isConnected && address) {
      if (handledRef.current === address) return;
      handledRef.current = address;
      console.log('[Auth] Wallet connected:', address);
      handleWalletAuth(address);
    }
    // If fully disconnected, allow a fresh attempt next connect
    if (!isConnected) {
      handledRef.current = null;
    }
  }, [isConnected, address]);

  /** On any wallet-auth failure: re-arm so the user can simply tap Connect again. */
  const rearmWallet = (msg: string) => {
    setError(msg);
    setSigningIn(false);
    handledRef.current = null;
    try { disconnect(); } catch { /* already disconnected */ }
  };

  // Wallet login: nonce → personal_sign → server verifies signature.
  // EVM personal_sign covers MetaMask, Phantom (EVM) and Trust — injected on
  // desktop, deep-linked on mobile via the Reown modal.
  const handleWalletAuth = async (walletAddress: string) => {
    setSigningIn(true);
    setStatusText('Requesting signature...');
    try {
      // 1. Get single-use nonce from backend (bound to this address)
      const nonceRes = await fetch(`${apiUrl}/auth/wallet/nonce`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress }),
      });
      const nonceData = await nonceRes.json();
      if (!nonceRes.ok || !nonceData.ok) throw new Error(nonceData.error || 'Could not get login nonce');
      const nonce = nonceData.nonce as string;

      // 2. Ask the wallet to sign the login message (EIP-191 personal_sign)
      if (!walletProvider) throw new Error('Wallet provider not available — reconnect your wallet');
      const { BrowserProvider } = await import('ethers');
      const provider = new BrowserProvider(walletProvider as Eip1193Provider);
      const signer = await provider.getSigner();
      const message = [
        'R2H RSC wallet login',
        `Address: ${walletAddress.toLowerCase()}`,
        `Nonce: ${nonce}`,
        '',
        'Signing proves you own this wallet. This request will not trigger a blockchain transaction.',
      ].join('\n');
      setStatusText('Confirm the signature in your wallet...');
      const signature = await signer.signMessage(message);

      // 3. Verify on backend → existing user logs in, new user gets a registration token
      const res = await fetch(`${apiUrl}/auth/wallet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress, signature, nonce }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Wallet login failed');
      if (data.existing) {
        onExistingUser('wallet', walletAddress.toLowerCase(), data.rscUsername, data.rscPassword);
      } else {
        onAuthComplete('wallet', walletAddress.toLowerCase(), data.registrationToken);
      }
    } catch (err: any) {
      console.error('[Auth] Wallet auth error:', err);
      const rejected = err?.code === 4001 || err?.code === 'ACTION_REJECTED' || /reject|denied|cancel/i.test(err?.info?.error?.message || err?.shortMessage || err?.message || '');
      rearmWallet(rejected
        ? 'Signature request was cancelled — tap Connect Wallet to try again.'
        : (err?.shortMessage || err?.message || 'Wallet login failed'));
    }
  };

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
        onAuthComplete(data.provider || 'google', data.externalId, data.registrationToken);
      }
    } catch (err: any) {
      console.error('[Auth] Google auth error:', err);
      setError(err.message);
      setSigningIn(false);
    }
  };

  const handleConnectWallet = () => {
    setError('');
    console.log('[Auth] Opening Reown wallet modal');
    walletModal?.open();
  };

  const handleDirectLogin = () => {
    if (!rscUser.trim() || !rscPass.trim()) {
      setError('Enter your RSC username and password.');
      return;
    }
    setError('');
    console.log('[Auth] Direct RSC login:', rscUser);
    // Pass credentials directly — App.tsx will load the game iframe with these creds
    onExistingUser('direct', rscUser.trim(), rscUser.trim(), rscPass.trim());
  };

  // Full-screen signing in state
  if (signingIn) {
    return (
      <div style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1039,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.9)', gap: 16,
      }}>
        <div style={{
          width: 32, height: 32, border: '3px solid #333', borderTop: '3px solid #14F195',
          borderRadius: '50%', animation: 'spin 0.8s linear infinite',
        }} />
        <p style={{ color: '#888', fontSize: 14, fontFamily: 'monospace', margin: 0 }}>{statusText}</p>
      </div>
    );
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <h1 style={styles.title}>R2H RSC</h1>
        <p style={styles.subtitle}>Sign in to play</p>

        {error && <p style={styles.error}>{error}</p>}

        {/* Google — Primary method */}
        <div style={styles.primarySection}>
          <div style={styles.recommendedLabel}>Recommended</div>
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
          <p style={styles.primaryHint}>Fastest way to sign in</p>
        </div>

        <div style={styles.divider}>
          <span style={styles.dividerLine} />
          <span style={styles.dividerText}>or</span>
          <span style={styles.dividerLine} />
        </div>

        {/* Wallet — Secondary / Advanced */}
        <button style={styles.btnSecondary} onClick={handleConnectWallet}>
          Connect Wallet
        </button>
        <p style={styles.secondaryHint}>
          MetaMask · Phantom · Trust — mobile &amp; desktop
        </p>

        {/* Direct RSC Login — for testing / users without Google */}
        <button
          style={{ ...styles.btnSecondary, marginTop: 8, fontSize: 12, color: '#666' }}
          onClick={() => setShowDirect(!showDirect)}
        >
          {showDirect ? '▲ Hide' : '▼ Direct RSC Login'}
        </button>
        {showDirect && (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <input
              style={styles.directInput}
              type="text"
              placeholder="RSC username"
              value={rscUser}
              onChange={e => setRscUser(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleDirectLogin()}
            />
            <input
              style={styles.directInput}
              type="password"
              placeholder="Password"
              value={rscPass}
              onChange={e => setRscPass(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleDirectLogin()}
            />
            <button
              style={styles.btnDirect}
              onClick={handleDirectLogin}
            >
              Play
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    // RESTORED 9/6 (July-13 fix): fixed + full viewport, NOT absolute-in-frame.
    // On mobile the game frame is ~200px wide — the 340px card (and the Gmail
    // button) were clipped/scroll-blocked inside it on Chrome/Firefox.
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    zIndex: 1039,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(0,0,0,0.75)',
    pointerEvents: 'auto', // Block all clicks on RSC client when auth is shown
  },
  card: {
    background: '#111', borderRadius: 16, padding: '40px 32px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
    width: 340, maxWidth: '90vw',
    border: '1px solid #222',
    pointerEvents: 'auto', // Re-enable interaction on the card itself
  },
  title:    { color: '#fff', fontSize: 28, fontWeight: 700, margin: 0 },
  subtitle: { color: '#888', fontSize: 14, margin: '0 0 8px' },
  error:    { color: '#f44', fontSize: 13, textAlign: 'center' as const },

  // Google primary section
  primarySection: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 6,
  },
  recommendedLabel: {
    fontSize: 11,
    color: '#14F195',
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    fontWeight: 600,
  },
  primaryHint: {
    fontSize: 11,
    color: '#555',
    margin: 0,
  },

  // Divider
  divider: {
    display: 'flex', alignItems: 'center', width: '100%', gap: 10, margin: '4px 0',
  },
  dividerLine: { flex: 1, height: 1, background: '#333' },
  dividerText: { color: '#555', fontSize: 12, textTransform: 'uppercase' as const },

  // Wallet secondary button
  btnSecondary: {
    width: '100%',
    padding: '10px 0',
    borderRadius: 8,
    border: '1px solid #333',
    background: 'transparent',
    color: '#888',
    fontSize: 14,
    fontWeight: 500,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    touchAction: 'manipulation',
  },
  secondaryHint: {
    fontSize: 10,
    color: '#444',
    textAlign: 'center' as const,
    margin: '2px 0 0',
    maxWidth: 260,
    lineHeight: 1.4,
  },

  // Direct RSC login inputs
  directInput: {
    width: '100%',
    padding: '10px 12px',
    borderRadius: 8,
    border: '1px solid #333',
    background: '#1a1a1a',
    color: '#fff',
    fontSize: 14,
    fontFamily: 'monospace',
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  btnDirect: {
    width: '100%',
    padding: '10px 0',
    borderRadius: 8,
    border: 'none',
    background: '#14F195',
    color: '#000',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
};
