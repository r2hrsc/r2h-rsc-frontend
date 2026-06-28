import { useState } from 'react';

// Detect mobile devices
const isMobile = typeof navigator !== 'undefined' && /iPhone|iPad|Android/i.test(navigator.userAgent);
const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);

interface MobileWalletSelectorProps {
  onSelect: (walletType: 'metamask' | 'phantom' | 'coinbase' | 'embedded') => void;
  onCancel: () => void;
}

const wallets = [
  {
    id: 'metamask' as const,
    name: 'MetaMask',
    icon: '🦊',
    color: '#F6851B',
    description: 'Most popular Ethereum wallet',
  },
  {
    id: 'phantom' as const,
    name: 'Phantom',
    icon: '👻',
    color: '#AB9FF2',
    description: 'Popular Solana & Ethereum wallet',
  },
  {
    id: 'coinbase' as const,
    name: 'Coinbase Wallet',
    icon: '🔵',
    color: '#0052FF',
    description: 'Coinbase exchange wallet',
  },
  {
    id: 'embedded' as const,
    name: 'Continue without wallet',
    icon: '🔑',
    color: '#14F195',
    description: 'Create a wallet automatically (no app needed)',
  },
];

export default function MobileWalletSelector({ onSelect, onCancel }: MobileWalletSelectorProps) {
  const [selected, setSelected] = useState<string | null>(null);

  console.log('[MobileWalletSelector] Rendering wallet options, mobile:', isMobile, '| iOS:', isIOS);

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        <h2 style={styles.title}>Choose your wallet</h2>
        <p style={styles.subtitle}>
          {isIOS ? 'Tap a wallet to open it directly' : 'Select a wallet to connect'}
        </p>

        <div style={styles.walletList}>
          {wallets.map((wallet) => (
            <button
              key={wallet.id}
              style={{
                ...styles.walletBtn,
                borderColor: selected === wallet.id ? wallet.color : '#333',
                background: selected === wallet.id ? `${wallet.color}15` : '#1a1a1a',
              }}
              onClick={() => {
                console.log(`[MobileWalletSelector] Selected: ${wallet.name}`);
                setSelected(wallet.id);
                onSelect(wallet.id);
              }}
            >
              <span style={styles.walletIcon}>{wallet.icon}</span>
              <div style={styles.walletInfo}>
                <span style={styles.walletName}>{wallet.name}</span>
                <span style={styles.walletDesc}>{wallet.description}</span>
              </div>
              <span style={styles.arrow}>→</span>
            </button>
          ))}
        </div>

        <button style={styles.cancelBtn} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 1040,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(0,0,0,0.9)',
    backdropFilter: 'blur(8px)',
  },
  card: {
    background: '#111', borderRadius: 16, padding: '24px 20px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
    width: 360, maxWidth: '95vw', maxHeight: '90vh',
    border: '1px solid #222',
  },
  title: { color: '#fff', fontSize: 22, fontWeight: 700, margin: 0 },
  subtitle: { color: '#888', fontSize: 13, margin: '0 0 8px', textAlign: 'center' },
  walletList: {
    display: 'flex', flexDirection: 'column', gap: 10,
    width: '100%',
  },
  walletBtn: {
    display: 'flex', alignItems: 'center', gap: 12,
    width: '100%', padding: '14px 16px', borderRadius: 12,
    border: '1px solid #333', background: '#1a1a1a',
    cursor: 'pointer', transition: 'all 0.15s ease',
    minHeight: 60,
  },
  walletIcon: { fontSize: 28, flexShrink: 0 },
  walletInfo: {
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
    flex: 1, minWidth: 0,
  },
  walletName: { color: '#fff', fontSize: 15, fontWeight: 600 },
  walletDesc: { color: '#666', fontSize: 11, marginTop: 2 },
  arrow: { color: '#666', fontSize: 18, flexShrink: 0 },
  cancelBtn: {
    width: '100%', padding: '12px', borderRadius: 8,
    border: '1px solid #333', background: 'transparent',
    color: '#888', fontSize: 14, cursor: 'pointer',
    marginTop: 8,
  },
};
