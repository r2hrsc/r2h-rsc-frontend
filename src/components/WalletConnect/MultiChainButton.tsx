import { usePrivy } from '@privy-io/react-auth';

// Detect mobile devices
const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|Android/i.test(navigator.userAgent);

export default function MultiChainButton() {
  const { ready, authenticated, user, login, logout } = usePrivy();

  if (!ready) {
    return (
      <button disabled style={styles.btn}>
        Loading...
      </button>
    );
  }

  if (!authenticated) {
    return (
      <button 
        onClick={() => {
          console.log('📱 MOBILE CONNECTION INITIATED');
          console.log('Expected flow: Button click → Privy modal → Deep link options → Wallet app → Return to browser → Auth complete');
          console.log('Mobile detected:', isMobile);
          console.log('User agent:', navigator.userAgent);
          login();
        }} 
        style={styles.btn}
      >
        {isMobile ? 'Connect Mobile Wallet' : 'Connect Wallet'}
      </button>
    );
  }

  const displayAddress = user?.wallet?.address
    ? `${user.wallet.address.slice(0, 6)}...${user.wallet.address.slice(-4)}`
    : user?.email?.address || 'Connected';

  return (
    <button onClick={logout} style={styles.btnConnected}>
      {displayAddress}
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  btn: {
    background: 'transparent',
    border: '1px solid #14F195',
    color: '#14F195',
    padding: '8px 14px',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    minHeight: 44,
    touchAction: 'manipulation',
  },
  btnConnected: {
    background: 'rgba(20, 241, 149, 0.1)',
    border: '1px solid #14F195',
    color: '#14F195',
    padding: '8px 14px',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    minHeight: 44,
    touchAction: 'manipulation',
  },
};
