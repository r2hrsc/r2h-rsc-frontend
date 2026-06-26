import MultiChainButton from '../WalletConnect/MultiChainButton';

interface TopNavProps {
  isAuthenticating?: boolean;
  authError?: string | null;
}

export default function TopNav({ isAuthenticating, authError }: TopNavProps) {
  return (
    <nav
      className="top-nav"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 60,
        background: '#0a0a0a',
        borderBottom: '1px solid #1a1a1a',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        zIndex: 20,
      }}
    >
      <span
        className="top-nav-brand"
        style={{
          color: '#e5e5e5',
          fontWeight: 700,
          fontSize: 18,
          letterSpacing: 2,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        R2H
        {isAuthenticating && (
          <span style={{ color: '#14F195', fontSize: 11, fontWeight: 400 }}>Signing in...</span>
        )}
        {authError && (
          <span style={{ color: '#ff4444', fontSize: 11, fontWeight: 400 }}>Auth error</span>
        )}
      </span>

      <MultiChainButton />
    </nav>
  );
}
