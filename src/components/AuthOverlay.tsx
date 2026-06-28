import { useState } from 'react';
import { useLogin } from '@privy-io/react-auth';
import MobileWalletSelector from './MobileWalletSelector';

// Detect mobile devices
const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|Android/i.test(navigator.userAgent);
const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);

interface AuthOverlayProps {
  apiUrl: string;
  onAuthComplete: (provider: string, externalId: string) => void;
  onExistingUser: (provider: string, externalId: string, rscUsername: string, rscPassword: string) => void;
}

export default function AuthOverlay({ apiUrl, onAuthComplete, onExistingUser }: AuthOverlayProps) {
  const [showWalletSelector, setShowWalletSelector] = useState(false);
  
  const { login } = useLogin({
    onComplete: ({ user, isNewUser }) => {
      const externalId = user.wallet?.address || user.email?.address || user.id;
      console.log('[Auth] Privy login complete:', externalId, isNewUser ? '(new)' : '(existing)');
      console.log('[Auth] Full user object:', user);
      if (isNewUser) {
        onAuthComplete('privy', externalId);
      } else {
        onExistingUser('privy', externalId, externalId, user.id);
      }
    },
    onError: (error) => {
      console.error('[Auth] Privy login error:', error);
      setShowWalletSelector(false);
    },
  });

  console.log('[AuthOverlay] Rendering login UI, mobile:', isMobile);

  const handleMobileWalletSelect = (walletType: 'metamask' | 'phantom' | 'coinbase' | 'embedded') => {
    console.log(`[AuthOverlay] Mobile wallet selected: ${walletType}`);
    
    // For embedded wallet, use Privy's login which will create one automatically
    // For external wallets, Privy's modal will handle the deep linking
    setShowWalletSelector(false);
    login();
  };

  // On mobile, show wallet selector first
  if (showWalletSelector) {
    return (
      <MobileWalletSelector
        onSelect={handleMobileWalletSelect}
        onCancel={() => setShowWalletSelector(false)}
      />
    );
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <h1 style={styles.title}>R2H RSC</h1>
        <p style={styles.subtitle}>Sign in to play</p>

        <button style={styles.btnConnect} onClick={() => {
          console.log('🔍 MOBILE WALLET FLOW:');
          console.log('1. User agent detected as mobile:', navigator.userAgent);
          console.log('2. Privy modal will open with WalletConnect deep links');
          console.log('3. User should see: "Open in Phantom", "Open in MetaMask", etc.');
          console.log('4. Clicking should open wallet app via deep link');
          console.log('5. After approval, wallet app should redirect back to browser');
          console.log('6. Privy will complete authentication automatically');
          console.log('WalletConnect Project ID:', import.meta.env.VITE_WALLETCONNECT_PROJECT_ID);
          console.log('Privy App ID:', import.meta.env.VITE_PRIVY_APP_ID);
          console.log('Mobile detected:', isMobile);
          
          if (isMobile) {
            setShowWalletSelector(true);
          } else {
            login();
          }
        }}>
          {isMobile ? 'Connect Mobile Wallet' : 'Connect Wallet'}
        </button>
        
        {isMobile && (
          <p style={styles.mobileHint}>
            Opens your wallet app directly
          </p>
        )}
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
  btnConnect: {
    width: '100%', padding: '12px 0', borderRadius: 8, border: 'none',
    background: '#14F195', color: '#0a0a0a', fontSize: 15, fontWeight: 600,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    minHeight: 44,
    touchAction: 'manipulation',
  },
  mobileHint: {
    color: '#666', fontSize: 11, margin: 0, textAlign: 'center',
  },
};
