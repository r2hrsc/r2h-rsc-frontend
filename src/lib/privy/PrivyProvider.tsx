import { PrivyProvider as PrivyProviderBase } from '@privy-io/react-auth';

const PRIVY_APP_ID = import.meta.env.VITE_PRIVY_APP_ID;
const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

// Detect mobile devices for logging
const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|Android/i.test(navigator.userAgent);
const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);

export function PrivyProvider({ children }: { children: React.ReactNode }) {
  console.log('[PrivyProvider] Initializing with appId:', PRIVY_APP_ID ? PRIVY_APP_ID.substring(0, 8) + '...' : 'MISSING');
  console.log('[PrivyProvider] WalletConnect projectId:', WALLETCONNECT_PROJECT_ID ? 'set' : 'MISSING');
  console.log('[PrivyProvider] Mobile device detected:', isMobile, '| iOS:', isIOS);

  if (!PRIVY_APP_ID || PRIVY_APP_ID === 'your-privy-app-id') {
    console.error('[PrivyProvider] VITE_PRIVY_APP_ID is not set! Add it to .env');
    return (
      <div style={{
        color: '#f44',
        background: '#000',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'monospace',
      }}>
        <div style={{ textAlign: 'center', maxWidth: 480, padding: 24 }}>
          <h2 style={{ color: '#fff', marginBottom: 12 }}>Configuration Error</h2>
          <p style={{ color: '#888', fontSize: 14, lineHeight: 1.6 }}>
            <code style={{ color: '#f44', background: '#1a0000', padding: '2px 6px', borderRadius: 4 }}>
              VITE_PRIVY_APP_ID
            </code>{' '}
            is not set.
          </p>
          <p style={{ color: '#666', fontSize: 12 }}>
            Get your app ID from{' '}
            <a href="https://dashboard.privy.io" target="_blank" rel="noreferrer" style={{ color: '#14F195' }}>
              dashboard.privy.io
            </a>{' '}
            and add it to your <code style={{ color: '#888' }}>.env</code> file.
          </p>
        </div>
      </div>
    );
  }

  return (
    <PrivyProviderBase
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ['email', 'google', 'wallet'],
        appearance: {
          theme: 'dark',
          accentColor: '#14F195',
          // Configure wallet list for better mobile UX
          walletList: [
            'metamask',
            'phantom',
            'coinbase_wallet',
            'rainbow',
            'wallet_connect',
          ],
          // Support both Ethereum and Solana wallets
          walletChainType: 'ethereum-and-solana',
        },
        // Enable WalletConnect for mobile wallet deep linking
        externalWallets: {
          walletConnect: {
            enabled: true,
          },
        },
        // Enable embedded wallet as fallback for users without external wallets
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
        },
        // WalletConnect Cloud project ID for mobile deep links
        walletConnectCloudProjectId: WALLETCONNECT_PROJECT_ID,
      }}
    >
      {children}
    </PrivyProviderBase>
  );
}
