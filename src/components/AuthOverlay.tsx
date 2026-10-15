import { useState, useEffect, useRef } from 'react';
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
import { modal as walletModal, useAppKitAccount, useAppKitProvider, useDisconnect } from '@reown/appkit/react';
import type { Eip1193Provider } from 'ethers';

/** Minimal shape of the Solana wallet provider AppKit hands back. */
interface SolanaSigner { signMessage(message: Uint8Array): Promise<Uint8Array>; }

const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
/** Encode a signature as base58, the form Solana tooling expects.
 *  The sidecar accepts base58 or base64; base58 keeps parity with every other
 *  Solana client the player might compare against. */
function b58encode(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let out = '';
  while (n > 0n) { out = B58_ALPHABET[Number(n % 58n)] + out; n /= 58n; }
  for (const b of bytes) { if (b === 0) out = '1' + out; else break; }
  return out || '1';
}
import { Landing } from './landing/Landing';
import { saveAccessToken, clearAccessToken } from '../lib/referral';

interface AuthOverlayProps {
  apiUrl: string;
  onAuthComplete: (provider: string, externalId: string, registrationToken: string) => void;
  onExistingUser: (provider: string, externalId: string, rscUsername: string, rscPassword: string) => void;
  /** v404.2: optional pre-auth world picker, rendered inside the landing hero */
  worldPicker?: React.ReactNode;
}

export default function AuthOverlay({ apiUrl, onAuthComplete, onExistingUser, worldPicker }: AuthOverlayProps) {
  const [error, setError] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [statusText, setStatusText] = useState('Signing in...');

  // initWalletKit() is now called in AppContent — during the loading screen,
  // before ad zones render, to prevent the w3m-modal initialization flash.

  // Track wallet connection state via Reown hooks, per chain namespace.
  // Two adapters are registered (see lib/walletKit.ts), so the namespace must
  // be explicit — an unqualified useAppKitAccount() returns whichever chain is
  // "active", which is not something login should depend on.
  const evmAccount = useAppKitAccount({ namespace: 'eip155' });
  const solAccount = useAppKitAccount({ namespace: 'solana' });
  const { walletProvider } = useAppKitProvider<Eip1193Provider>('eip155');
  const { walletProvider: solWalletProvider } = useAppKitProvider<SolanaSigner>('solana');
  const { disconnect } = useDisconnect();

  // EVM wins when both are somehow connected. An existing player's account is
  // keyed to their 0x identity, and silently signing them into a different
  // (Solana) account would look like their characters vanished. New players
  // connecting Phantom as a Solana wallet land on the Solana path.
  const chain: 'evm' | 'solana' | null =
    evmAccount.isConnected && evmAccount.address ? 'evm'
    : solAccount.isConnected && solAccount.address ? 'solana'
    : null;
  const address = chain === 'evm' ? evmAccount.address : chain === 'solana' ? solAccount.address : undefined;
  const isConnected = chain !== null;

  // WAIT FOR THE SIGNER, NOT JUST THE ACCOUNT.
  //
  // useAppKitAccount populates before useAppKitProvider does. This effect used
  // to fire on the account alone, and handleWalletAuth throws immediately when
  // walletProvider is missing — which calls rearmWallet() and DISCONNECTS the
  // wallet. Symptom, reported by the founder: the first connect "doesn't take"
  // and a hard refresh fixes it, because on reload the wallet is already
  // connected and both hooks are populated by the time React runs.
  //
  // The race pre-existed, but registering the Solana adapter made AppKit's init
  // heavier and widened the window enough to lose it most times. Gating on the
  // matching provider — and listing it in the deps so this re-runs the moment it
  // arrives — closes it without changing anything else.
  const providerReady =
    chain === 'evm' ? !!walletProvider
    : chain === 'solana' ? !!solWalletProvider
    : false;

  // Guard against double-firing when both isConnected and address update,
  // and against re-triggering the signature prompt for an already-handled address.
  const handledRef = useRef<string | null>(null);

  useEffect(() => {
    if (isConnected && address && providerReady) {
      if (handledRef.current === address) return;
      handledRef.current = address;
      console.log(`[Auth] Wallet connected (${chain}):`, address);
      handleWalletAuth(address, chain!);
    }
    // If fully disconnected, allow a fresh attempt next connect
    if (!isConnected) {
      handledRef.current = null;
    }
  }, [isConnected, address, chain, providerReady]);

  /** On any wallet-auth failure: re-arm so the user can simply tap Connect again. */
  const rearmWallet = (msg: string) => {
    setError(msg);
    setSigningIn(false);
    handledRef.current = null;
    try { disconnect(); } catch { /* already disconnected */ }
  };

  // Wallet login: nonce → sign → server verifies signature.
  //
  // EVM uses EIP-191 personal_sign (MetaMask, Trust, Phantom-as-EVM, and every
  // WalletConnect EVM wallet). Solana uses an ed25519 detached signature.
  // The sidecar picks the scheme from the address format and stores the
  // identity as provider 'wallet' or 'solana' respectively.
  //
  // Why Solana matters: $RUNE is an SPL token, so a proven Solana identity is
  // ALSO the payout destination. A player who signs in with Phantom on Solana
  // is paid for wilderness kills with no extra setup.
  const handleWalletAuth = async (walletAddress: string, walletChain: 'evm' | 'solana') => {
    setSigningIn(true);
    setStatusText('Requesting signature...');
    clearAccessToken();
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

      // 2. Sign the login message. The EVM branch rebuilds the string locally,
      //    exactly as it always has — do NOT rebrand it, it must match the
      //    sidecar's buildWalletLoginMessage byte for byte. The Solana branch
      //    signs the server-supplied `message` instead, so there is no second
      //    copy of the format to drift out of sync.
      let signature: string;
      if (walletChain === 'evm') {
        if (!walletProvider) throw new Error('Wallet provider not available — reconnect your wallet');
        const { BrowserProvider } = await import('ethers');
        const provider = new BrowserProvider(walletProvider as Eip1193Provider);
        const signer = await provider.getSigner();
        const message = [
          'R2H RSC wallet login', // must match sidecar buildWalletLoginMessage — do NOT rebrand
          `Address: ${walletAddress.toLowerCase()}`,
          `Nonce: ${nonce}`,
          '',
          'Signing proves you own this wallet. This request will not trigger a blockchain transaction.',
        ].join('\n');
        setStatusText('Confirm the signature in your wallet...');
        signature = await signer.signMessage(message);
      } else {
        if (!solWalletProvider) throw new Error('Wallet provider not available — reconnect your wallet');
        const message = nonceData.message as string;
        if (!message) throw new Error('Server did not return a message to sign');
        setStatusText('Confirm the signature in your wallet...');
        const sigBytes = await solWalletProvider.signMessage(new TextEncoder().encode(message));
        signature = b58encode(sigBytes);
      }

      // 3. Verify on backend → existing user logs in, new user gets a registration token
      const res = await fetch(`${apiUrl}/auth/wallet`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress, signature, nonce }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Wallet login failed');
      saveAccessToken(data.accessToken);
      // Use the identity the SERVER settled on. Solana base58 is case-sensitive
      // and must not be lowercased the way EVM hex is; echoing the server's
      // values keeps both chains correct without a second case rule here.
      const provider: string = data.provider ?? 'wallet';
      const externalId: string = data.externalId ?? walletAddress;
      if (data.existing) {
        onExistingUser(provider, externalId, data.rscUsername, data.rscPassword);
      } else {
        onAuthComplete(provider, externalId, data.registrationToken);
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
    clearAccessToken();
    try {
      const res = await fetch(`${apiUrl}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: resp.credential }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Google auth failed');
      saveAccessToken(data.accessToken);
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
    <Landing
      error={error}
      onConnectWallet={handleConnectWallet}
      worldPicker={worldPicker}
      googleButton={
        <GoogleLogin
          onSuccess={handleGoogleSuccess}
          onError={() => setError('Google login failed.')}
          theme="outline"
          size="large"
          width="300"
          text="signin_with"
        />
      }
    />
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
};
