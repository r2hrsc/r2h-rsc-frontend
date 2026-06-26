import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import LoadingSpinner from '../UI/LoadingSpinner';

function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export default function MultiChainButton() {
  const { publicKey, connected, connecting } = useWallet();
  const { setVisible } = useWalletModal();
  const [isConnecting, setIsConnecting] = useState(false);

  const handleClick = () => {
    if (!connected && !connecting) {
      setIsConnecting(true);
      setVisible(true);
    }
  };

  // Reset loading when connection completes or fails
  if (connected && isConnecting) {
    setIsConnecting(false);
  }

  const truncateAddress = (addr: string) => `${addr.slice(0, 4)}...${addr.slice(-4)}`;

  const isLoading = connecting || isConnecting;

  if (!connected || !publicKey) {
    const label = isMobileDevice() ? 'Connect Mobile Wallet' : 'Connect Wallet';

    return (
      <button
        onClick={handleClick}
        disabled={isLoading}
        style={{
          background: 'transparent',
          border: '1px solid #14F195',
          color: '#14F195',
          padding: '8px 14px',
          borderRadius: 6,
          fontSize: 13,
          fontWeight: 600,
          cursor: isLoading ? 'wait' : 'pointer',
          minHeight: 44,
          touchAction: 'manipulation',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          opacity: isLoading ? 0.7 : 1,
        }}
      >
        {isLoading && <LoadingSpinner size="sm" />}
        {isLoading ? 'Connecting...' : label}
      </button>
    );
  }

  return (
    <button
      onClick={handleClick}
      style={{
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
      }}
    >
      {truncateAddress(publicKey.toBase58())}
    </button>
  );
}
