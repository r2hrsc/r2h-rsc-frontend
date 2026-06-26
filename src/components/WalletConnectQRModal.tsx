import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect } from 'react';
import { WALLETCONNECT_QR_EVENT } from '../config/WalletConnectQRAdapter';

type WalletId = 'phantom' | 'solflare' | 'metamask' | 'trust' | 'other';

interface WalletInfo {
  id: WalletId;
  name: string;
  icon: string;
  color: string;
  getDeepLink: (wcUri: string) => string;
}

const WALLETS: WalletInfo[] = [
  {
    id: 'phantom',
    name: 'Phantom',
    icon: '👻',
    color: '#AB9FF2',
    getDeepLink: (uri) => `https://phantom.app/ul/v1/connect?uri=${encodeURIComponent(uri)}`,
  },
  {
    id: 'solflare',
    name: 'Solflare',
    icon: '☀️',
    color: '#FFC107',
    getDeepLink: (uri) => `https://solflare.com/ul/v1/connect?uri=${encodeURIComponent(uri)}`,
  },
  {
    id: 'metamask',
    name: 'MetaMask',
    icon: '🦊',
    color: '#F6851B',
    getDeepLink: (uri) => `https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}`,
  },
  {
    id: 'trust',
    name: 'Trust Wallet',
    icon: '🛡️',
    color: '#3375BB',
    getDeepLink: (uri) => `https://link.trustwallet.com/wc?uri=${encodeURIComponent(uri)}`,
  },
  {
    id: 'other',
    name: 'Other Wallet',
    icon: '🔗',
    color: '#888',
    getDeepLink: (uri) => `https://walletconnect.com/wc?uri=${encodeURIComponent(uri)}`,
  },
];

export default function WalletConnectQRModal() {
  const [rawUri, setRawUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedWallet, setSelectedWallet] = useState<WalletId | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail.uri) {
        setRawUri(detail.uri);
        setError(null);
        setSelectedWallet(null);
      } else {
        setRawUri(null);
        if (detail.error) setError(detail.error);
      }
    };
    window.addEventListener(WALLETCONNECT_QR_EVENT, handler);
    return () => window.removeEventListener(WALLETCONNECT_QR_EVENT, handler);
  }, []);

  const close = () => {
    setRawUri(null);
    setError(null);
    setSelectedWallet(null);
  };

  if (!rawUri && !error) return null;

  const wallet = selectedWallet ? WALLETS.find((w) => w.id === selectedWallet) : null;

  return (
    <div style={S.overlay} onClick={close}>
      <div style={S.card} onClick={(e) => e.stopPropagation()}>
        <button style={S.close} onClick={close}>
          ✕
        </button>

        <h2 style={S.title}>
          {error ? 'Connection Error' : selectedWallet ? `Connect with ${wallet?.name}` : 'Choose Your Wallet'}
        </h2>

        {error ? (
          <p style={S.error}>{error}</p>
        ) : !selectedWallet ? (
          // Step 1: Wallet picker
          <div style={S.picker}>
            {WALLETS.map((w) => (
              <button key={w.id} style={{ ...S.walletBtn, borderColor: w.color }} onClick={() => setSelectedWallet(w.id)}>
                <span style={S.walletIcon}>{w.icon}</span>
                <span style={S.walletName}>{w.name}</span>
              </button>
            ))}
          </div>
        ) : (
          // Step 2: QR + deep link for selected wallet
          <div style={S.qrSection}>
            {/* Raw wc: QR for wallet's built-in scanner */}
            <div style={S.qrWrap}>
              <QRCodeSVG value={rawUri!} size={240} bgColor="#000" fgColor="#fff" level="M" />
            </div>

            <p style={S.scanHint}>
              Scan with <b>{wallet?.name}</b>'s built-in scanner, or{' '}
              <b>tap the button below on your phone</b>
            </p>

            {/* Deep link button — works when tapped on mobile */}
            <a
              href={wallet!.getDeepLink(rawUri!)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...S.deepLinkBtn, background: wallet!.color, color: '#000' }}
            >
              {wallet!.icon} Open in {wallet!.name}
            </a>

            <button style={S.backBtn} onClick={() => setSelectedWallet(null)}>
              ← Choose different wallet
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 10000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0,0,0,0.85)',
    backdropFilter: 'blur(6px)',
  },
  card: {
    background: '#111',
    borderRadius: 16,
    padding: '28px 32px 24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    border: '1px solid #333',
    position: 'relative',
    maxWidth: '90vw',
    width: 380,
  },
  close: {
    position: 'absolute',
    top: 10,
    right: 12,
    background: 'none',
    border: 'none',
    color: '#888',
    fontSize: 20,
    cursor: 'pointer',
    padding: '4px 8px',
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 600,
    margin: '0 0 4px',
    textAlign: 'center',
  },
  picker: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    width: '100%',
  },
  walletBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 16px',
    borderRadius: 10,
    border: '2px solid',
    background: 'rgba(255,255,255,0.04)',
    cursor: 'pointer',
    transition: 'background 0.15s',
    width: '100%',
  },
  walletIcon: {
    fontSize: 24,
    width: 32,
    textAlign: 'center',
  },
  walletName: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 600,
  },
  qrSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 14,
    width: '100%',
  },
  qrWrap: {
    background: '#fff',
    padding: 12,
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanHint: {
    color: '#aaa',
    fontSize: 13,
    textAlign: 'center',
    margin: 0,
    lineHeight: 1.4,
    maxWidth: 280,
  },
  deepLinkBtn: {
    display: 'inline-block',
    padding: '12px 24px',
    borderRadius: 10,
    fontSize: 15,
    fontWeight: 700,
    textDecoration: 'none',
    textAlign: 'center',
    width: '100%',
    boxSizing: 'border-box',
    cursor: 'pointer',
  },
  backBtn: {
    background: 'none',
    border: 'none',
    color: '#666',
    fontSize: 13,
    cursor: 'pointer',
    padding: '4px 8px',
    marginTop: 4,
  },
  error: {
    color: '#f44',
    fontSize: 14,
    textAlign: 'center',
    margin: 0,
  },
};
