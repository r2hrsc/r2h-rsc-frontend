import { useState, useEffect, useRef, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { UniversalProvider } from '@walletconnect/universal-provider';
import { PublicKey } from '@solana/web3.js';

const PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '';

// Both current and deprecated Solana mainnet chain IDs
const SOLANA_MAINNET = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const SOLANA_MAINNET_DEPRECATED = 'solana:4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZ';
const SOLANA_METHODS = ['solana_signMessage', 'solana_signTransaction'];

interface QRResult {
  publicKey: PublicKey;
  signMessage: (msg: Uint8Array) => Promise<Uint8Array>;
}

export default function WalletConnectQR({
  onConnect,
  onError,
  onClose,
}: {
  onConnect: (result: QRResult) => void;
  onError: (err: string) => void;
  onClose: () => void;
}) {
  const [uri, setUri] = useState('');
  const [status, setStatus] = useState('Initializing…');
  const [copied, setCopied] = useState(false);
  const providerRef = useRef<Awaited<ReturnType<typeof UniversalProvider.init>> | null>(null);
  const cancelledRef = useRef(false);

  const init = useCallback(async () => {
    try {
      console.log('[WC] Initializing UniversalProvider…');
      const provider = await UniversalProvider.init({
        projectId: PROJECT_ID,
        metadata: {
          name: 'R2H RSC',
          description: 'Play to Earn',
          url: 'https://r2hrsc.xyz',
          icons: ['https://r2hrsc.xyz/icons/phantom.svg'],
        },
      });
      providerRef.current = provider;
      console.log('[WC] UniversalProvider initialized');

      // Listen for the pairing URI — this is what the QR code should encode
      provider.on('display_uri', async (data: string) => {
        if (cancelledRef.current) return;
        console.log('[WC] display_uri:', data.substring(0, 50) + '…');
        setUri(data);
        setStatus('Scan with your phone camera or Phantom app');
      });

      // Also listen on the pairing layer
      provider.client.core.pairing.events.on('display_uri', (data: any) => {
        if (cancelledRef.current) return;
        const uriStr = typeof data === 'string' ? data : data?.uri || '';
        if (uriStr && uriStr.startsWith('wc:') && !uri) {
          console.log('[WC] pairing display_uri:', uriStr.substring(0, 50) + '…');
          setUri(uriStr);
          setStatus('Scan with your phone camera or Phantom app');
        }
      });

      console.log('[WC] Calling provider.connect()…');
      const session = await provider.connect({
        optionalNamespaces: {
          solana: {
            methods: SOLANA_METHODS,
            chains: [SOLANA_MAINNET, SOLANA_MAINNET_DEPRECATED],
            events: [],
          },
        },
      });

      if (cancelledRef.current) return;
      console.log('[WC] Session established! Topic:', session.topic);

      // Extract Solana account
      const accounts = session.namespaces.solana?.accounts || [];
      console.log('[WC] Accounts:', accounts);

      if (accounts.length === 0) {
        throw new Error('No Solana account in session.');
      }

      const address = accounts[0].split(':')[2];
      const chainId = accounts[0].split(':').slice(0, 2).join(':');
      console.log('[WC] Connected address:', address, 'chain:', chainId);
      const publicKey = new PublicKey(address);

      const signMessage = async (msg: Uint8Array): Promise<Uint8Array> => {
        console.log('[WC] Signing message, length:', msg.length);
        const result = await provider.client.request({
          topic: session.topic,
          chainId,
          request: {
            method: 'solana_signMessage',
            params: {
              message: Buffer.from(msg).toString('base64'),
              pubkey: address,
            },
          },
        });
        console.log('[WC] Sign result:', result);
        const sig = (result as any).signature;
        return Uint8Array.from(atob(sig), (c) => c.charCodeAt(0));
      };

      onConnect({ publicKey, signMessage });
    } catch (err: any) {
      if (cancelledRef.current) return;
      console.error('[WC] Error:', err);
      if (err?.message?.includes('expired') || err?.message?.includes('Proposal expired')) {
        onError('QR code expired. Please try again.');
      } else if (err?.message?.includes('rejected')) {
        onError('Connection rejected on your phone.');
      } else {
        onError(err?.message || 'WalletConnect failed');
      }
    }
  }, [onConnect, onError]);

  useEffect(() => {
    init();
    return () => {
      cancelledRef.current = true;
      providerRef.current?.disconnect().catch(() => {});
    };
  }, [init]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(uri);
      setCopied(true);
      console.log('[WC] Copied raw wc: URI');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('[WC] Failed to copy:', err);
    }
  };

  // QR encodes the raw wc: URI — this is what WalletConnect recommends.
  // Phantom/Backpack built-in scanners recognize wc: natively.
  // The phone's default camera will NOT scan this correctly.
  // Users must open Phantom → Scan QR.
  const qrPayload = uri || '';

  // Universal link fallback — opens Phantom but may not trigger WC dialog.
  // Works better on iOS than Android.
  const phantomDeepLink = uri
    ? `https://phantom.app/ul/v1/connect?uri=${encodeURIComponent(uri)}`
    : '';

  return (
    <div style={qrStyles.overlay}>
      <div style={qrStyles.card}>
        <div style={qrStyles.header}>
          <h3 style={qrStyles.title}>Scan to Connect</h3>
          <button style={qrStyles.close} onClick={onClose}>✕</button>
        </div>

        <div style={qrStyles.qrBox}>
          {qrPayload ? (
            <QRCodeSVG
              value={qrPayload}
              size={260}
              bgColor="#000"
              fgColor="#fff"
              level="M"
              style={{ borderRadius: 8 }}
            />
          ) : (
            <div style={qrStyles.loading}>
              <div style={qrStyles.spinner} />
              Connecting to relay…
            </div>
          )}
        </div>

        {uri && (
          <>
            <button style={qrStyles.copyBtn} onClick={handleCopyLink}>
              {copied ? '✓ Copied!' : 'Copy Connection Link'}
            </button>
            <a href={phantomDeepLink} style={qrStyles.deepLink}>
              Open in Phantom (Mobile)
            </a>
          </>
        )}

        <p style={qrStyles.instructions}>
          {status}
        </p>

        <div style={qrStyles.infoBox}>
          <p style={qrStyles.infoTitle}>
            📱 How to connect
          </p>
          <p style={qrStyles.infoSteps}>
            <strong>1.</strong> Open <strong>Phantom</strong> on your phone
          </p>
          <p style={qrStyles.infoSteps}>
            <strong>2.</strong> Tap the <strong>Menu</strong> icon (bottom right)
          </p>
          <p style={qrStyles.infoSteps}>
            <strong>3.</strong> Tap <strong>Scan QR</strong> and point at this code
          </p>
          <p style={{ ...qrStyles.infoSteps, color: '#888', fontSize: 11, marginTop: 8 }}>
            ⚠️ Do NOT use your phone's camera app — it won't work
          </p>
        </div>
      </div>
    </div>
  );
}

const qrStyles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed', inset: 0, zIndex: 99999,
    background: 'rgba(0,0,0,0.92)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  card: {
    background: '#0a0a0a', border: '1px solid #333', borderRadius: 16,
    padding: '28px 28px 24px', width: 360, maxWidth: '90vw',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    width: '100%', marginBottom: 16,
  },
  title: { color: '#fff', fontSize: 18, fontWeight: 700, margin: 0 },
  close: {
    background: 'none', border: 'none', color: '#888', fontSize: 22,
    cursor: 'pointer', padding: '0 4px',
  },
  qrBox: {
    background: '#000', borderRadius: 12, padding: 16,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: '1px solid #222', minHeight: 292,
  },
  loading: {
    width: 260, height: 260, display: 'flex', flexDirection: 'column' as const,
    alignItems: 'center', justifyContent: 'center', gap: 12,
    color: '#555', fontSize: 13,
  },
  spinner: {
    width: 24, height: 24, border: '3px solid #333',
    borderTop: '3px solid #888', borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  copyBtn: {
    marginTop: 12, padding: '8px 16px', borderRadius: 6,
    border: '1px solid #444', background: 'transparent',
    color: '#aaa', fontSize: 12, cursor: 'pointer',
  },
  deepLink: {
    marginTop: 6, padding: '10px 20px', borderRadius: 8,
    border: 'none', background: '#ab9ff2',
    color: '#fff', fontSize: 14, fontWeight: 600,
    textDecoration: 'none', textAlign: 'center' as const,
    display: 'block', width: '100%', boxSizing: 'border-box' as const,
  },
  instructions: {
    color: '#aaa', fontSize: 14, textAlign: 'center' as const,
    marginTop: 12, marginBottom: 0,
  },
  infoBox: {
    marginTop: 16, padding: '12px 16px', borderRadius: 8,
    background: '#111', border: '1px solid #222',
    width: '100%', boxSizing: 'border-box' as const,
  },
  infoTitle: {
    color: '#fff', fontSize: 13, fontWeight: 700,
    margin: '0 0 6px', textAlign: 'center' as const,
  },
  infoSteps: {
    color: '#aaa', fontSize: 12, margin: '4px 0',
    textAlign: 'center' as const, lineHeight: 1.5,
  },
};
