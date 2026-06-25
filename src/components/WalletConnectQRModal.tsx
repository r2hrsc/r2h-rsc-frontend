import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { WALLETCONNECT_QR_EVENT } from '../config/WalletConnectQRAdapter';

export default function WalletConnectQRModal() {
  const [uri, setUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail.uri) {
        setUri(detail.uri);
        setError(null);
      } else {
        setUri(null);
        if (detail.error) setError(detail.error);
      }
    };
    window.addEventListener(WALLETCONNECT_QR_EVENT, handler);
    return () => window.removeEventListener(WALLETCONNECT_QR_EVENT, handler);
  }, []);

  if (!uri && !error) return null;

  return (
    <div style={S.overlay} onClick={() => { setUri(null); setError(null); }}>
      <div style={S.card} onClick={(e) => e.stopPropagation()}>
        <button
          style={S.close}
          onClick={() => { setUri(null); setError(null); }}
        >
          ✕
        </button>

        <h2 style={S.title}>
          {error ? 'Connection Error' : 'Scan with Mobile Wallet'}
        </h2>

        {error ? (
          <p style={S.error}>{error}</p>
        ) : (
          <>
            <div style={S.qrWrap}>
              <QRCodeSVG
                value={uri!}
                size={260}
                bgColor="#000"
                fgColor="#fff"
                level="M"
              />
            </div>
            <p style={S.hint}>
              Open Phantom or Solflare on your phone → Settings → Scan QR
            </p>
          </>
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
    padding: '32px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    border: '1px solid #333',
    position: 'relative',
    maxWidth: '90vw',
  },
  close: {
    position: 'absolute',
    top: 12,
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
    margin: '0 0 8px',
    textAlign: 'center',
  },
  qrWrap: {
    background: '#fff',
    padding: 16,
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    color: '#888',
    fontSize: 13,
    textAlign: 'center',
    margin: 0,
    maxWidth: 280,
  },
  error: {
    color: '#f44',
    fontSize: 14,
    textAlign: 'center',
    margin: 0,
  },
};
