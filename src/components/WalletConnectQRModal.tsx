import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { WALLETCONNECT_QR_EVENT } from '../config/WalletConnectQRAdapter';

function toUniversalLink(rawWcUri: string): string {
  return `https://walletconnect.com/wc?uri=${encodeURIComponent(rawWcUri)}`;
}

export default function WalletConnectQRModal() {
  const [rawUri, setRawUri] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail.uri) {
        setRawUri(detail.uri);
        setError(null);
        setCopied(false);
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
    setCopied(false);
  };

  const copyLink = async () => {
    if (!rawUri) return;
    try {
      await navigator.clipboard.writeText(rawUri);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: select text
      const ta = document.createElement('textarea');
      ta.value = rawUri;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!rawUri && !error) return null;

  const qrValue = rawUri ? toUniversalLink(rawUri) : '';

  return (
    <div style={S.overlay} onClick={close}>
      <div style={S.card} onClick={(e) => e.stopPropagation()}>
        <button style={S.close} onClick={close}>
          ✕
        </button>

        <h2 style={S.title}>
          {error ? 'Connection Error' : 'Connect Your Wallet'}
        </h2>

        {error ? (
          <p style={S.error}>{error}</p>
        ) : (
          <>
            <div style={S.qrWrap}>
              <QRCodeSVG
                value={qrValue}
                size={260}
                bgColor="#000"
                fgColor="#fff"
                level="M"
              />
            </div>

            <div style={S.steps}>
              <p style={S.step}>
                <span style={S.stepNum}>1</span>
                Open your phone's <b>default camera app</b>
              </p>
              <p style={S.step}>
                <span style={S.stepNum}>2</span>
                Point at this QR code
              </p>
              <p style={S.step}>
                <span style={S.stepNum}>3</span>
                Tap the link → choose your wallet (Phantom, Solflare, MetaMask…)
              </p>
              <p style={S.step}>
                <span style={S.stepNum}>4</span>
                Approve the connection
              </p>
            </div>

            <button style={S.copyBtn} onClick={copyLink}>
              {copied ? '✓ Copied!' : '📋 Copy Connection Link'}
            </button>

            <p style={S.hint}>
              Works with <b>any</b> WalletConnect-compatible wallet
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
    padding: '28px 32px 24px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    border: '1px solid #333',
    position: 'relative',
    maxWidth: '90vw',
    width: 340,
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
  qrWrap: {
    background: '#fff',
    padding: 12,
    borderRadius: 12,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  steps: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    width: '100%',
    padding: '0 4px',
  },
  step: {
    color: '#ccc',
    fontSize: 13,
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    lineHeight: 1.4,
  },
  stepNum: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 20,
    height: 20,
    borderRadius: '50%',
    background: '#ab9ff2',
    color: '#000',
    fontSize: 11,
    fontWeight: 700,
    flexShrink: 0,
  },
  copyBtn: {
    width: '100%',
    padding: '10px 0',
    borderRadius: 8,
    border: '1px solid #444',
    background: 'transparent',
    color: '#aaa',
    fontSize: 13,
    cursor: 'pointer',
    marginTop: 4,
  },
  hint: {
    color: '#666',
    fontSize: 12,
    textAlign: 'center',
    margin: 0,
  },
  error: {
    color: '#f44',
    fontSize: 14,
    textAlign: 'center',
    margin: 0,
  },
};
