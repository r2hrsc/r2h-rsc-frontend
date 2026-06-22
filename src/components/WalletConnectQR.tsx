import { useState, useEffect, useRef, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { PublicKey } from '@solana/web3.js';
import { UniversalProvider } from '@walletconnect/universal-provider';

const PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '';

// Both current and deprecated Solana mainnet chain IDs
const SOLANA_MAINNET = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const SOLANA_MAINNET_DEPRECATED = 'solana:4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZ';
const SOLANA_METHODS = ['solana_signMessage', 'solana_signTransaction'];

interface QRResult {
  publicKey: PublicKey;
  topic: string;
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

      // Listen for the pairing URI
      provider.on('display_uri', async (data: string) => {
        if (cancelledRef.current) return;
        console.log('[WC] display_uri:', data.substring(0, 50) + '…');
        setUri(data);
        setStatus('Scan with Phantom or Backpack');
      });

      console.log('[WC] Calling provider.connect()…');
      const sessionResult = await provider.connect({
        optionalNamespaces: {
          solana: {
            methods: SOLANA_METHODS,
            chains: [SOLANA_MAINNET, SOLANA_MAINNET_DEPRECATED],
            events: [],
          },
        },
      });

      const session = sessionResult;
      if (!session) {
        throw new Error('WalletConnect session was not established.');
      }

      if (cancelledRef.current) return;
      console.log('[WC] Session established:', session.topic);

      const accounts = session.namespaces.solana?.accounts || [];
      console.log('[WC] Accounts:', accounts);

      if (accounts.length === 0) {
        throw new Error('No Solana account in session.');
      }

      const address = accounts[0].split(':')[2];
      const chainId = accounts[0].split(':').slice(0, 2).join(':');
      console.log('[WC] Connected address:', address);
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

      onConnect({ publicKey, topic: session.topic, signMessage });
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
      providerRef.current?.disconnect?.().catch(() => {});
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

  return (
    <div style={qrStyles.overlay}>
      <div style={qrStyles.card}>
        <div style={qrStyles.header}>
          <h3 style={qrStyles.title}>Scan to Connect</h3>
          <button style={qrStyles.close} onClick={onClose}>✕</button>
        </div>

        <div style={qrStyles.qrBox}>
          {uri ? (
            <QRCodeSVG
              value={uri}
              size={240}
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
          <button style={qrStyles.copyBtn} onClick={handleCopyLink}>
            {copied ? '✓ Copied!' : 'Copy Connection Link'}
          </button>
        )}

        <div style={qrStyles.steps}>
          <p style={qrStyles.stepTitle}>How to connect</p>
          <p style={qrStyles.step}>
            <strong>1.</strong> Open <strong>Phantom</strong> on your phone
          </p>
          <p style={qrStyles.step}>
            <strong>2.</strong> Tap the <strong>scan icon</strong> (top right corner)
          </p>
          <p style={qrStyles.step}>
            <strong>3.</strong> Point your phone at this QR code
          </p>
        </div>

        <div style={qrStyles.warning}>
          <p style={qrStyles.warningText}>
            ⚠️ Your phone's camera app will NOT work.
          </p>
          <p style={qrStyles.warningText}>
            You MUST use Phantom's built-in scanner.
          </p>
        </div>

        <p style={qrStyles.status}>{status}</p>
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
    padding: '24px 24px 20px', width: 340, maxWidth: '90vw',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    width: '100%', marginBottom: 12,
  },
  title: { color: '#fff', fontSize: 18, fontWeight: 700, margin: 0 },
  close: {
    background: 'none', border: 'none', color: '#888', fontSize: 22,
    cursor: 'pointer', padding: '0 4px',
  },
  qrBox: {
    background: '#000', borderRadius: 12, padding: 14,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: '1px solid #222',
  },
  loading: {
    width: 240, height: 240, display: 'flex', flexDirection: 'column' as const,
    alignItems: 'center', justifyContent: 'center', gap: 12,
    color: '#555', fontSize: 13,
  },
  spinner: {
    width: 24, height: 24, border: '3px solid #333',
    borderTop: '3px solid #888', borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  copyBtn: {
    marginTop: 10, padding: '6px 14px', borderRadius: 6,
    border: '1px solid #444', background: 'transparent',
    color: '#aaa', fontSize: 12, cursor: 'pointer',
  },
  steps: {
    marginTop: 14, padding: '12px 14px', borderRadius: 8,
    background: '#111', border: '1px solid #222',
    width: '100%', boxSizing: 'border-box' as const,
  },
  stepTitle: {
    color: '#fff', fontSize: 13, fontWeight: 700,
    margin: '0 0 8px',
  },
  step: {
    color: '#aaa', fontSize: 12, margin: '0 0 4px', lineHeight: 1.5,
  },
  warning: {
    marginTop: 10, padding: '8px 12px', borderRadius: 6,
    background: '#1a0a00', border: '1px solid #331',
    width: '100%', boxSizing: 'border-box' as const,
  },
  warningText: {
    color: '#f80', fontSize: 11, margin: '2px 0', textAlign: 'center' as const,
    fontWeight: 600,
  },
  status: {
    color: '#555', fontSize: 11, marginTop: 8, marginBottom: 0,
  },
};
