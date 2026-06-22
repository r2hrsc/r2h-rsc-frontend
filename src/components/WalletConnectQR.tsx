import { useState, useEffect, useRef, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import SignClient from '@walletconnect/sign-client';
import { PublicKey } from '@solana/web3.js';

const PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '';

// Solana chain IDs — include both current and deprecated for maximum wallet compat
const SOLANA_MAINNET = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
const SOLANA_MAINNET_DEPRECATED = 'solana:4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZ';

const SOLANA_METHODS = [
  'solana_signMessage',
  'solana_signTransaction',
  'solana_signAndSendTransaction',
];

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
  const clientRef = useRef<InstanceType<typeof SignClient> | null>(null);

  const init = useCallback(async () => {
    let client: InstanceType<typeof SignClient>;
    try {
      console.log('[WC] Initializing SignClient…');
      client = await SignClient.init({
        projectId: PROJECT_ID,
        metadata: {
          name: 'R2H RSC',
          description: 'Play to Earn',
          url: 'https://r2hrsc.xyz',
          icons: ['https://r2hrsc.xyz/icons/phantom.svg'],
        },
      });
      clientRef.current = client;
      console.log('[WC] SignClient initialized, core relayer:', client.core.relayer.connected);
    } catch (initErr: any) {
      console.error('[WC] Init failed:', initErr);
      onError(`WalletConnect init failed: ${initErr?.message}`);
      return;
    }

    // ── Event listeners for debugging ───────────────────────────
    client.on('session_proposal', (event) => {
      console.log('[WC] session_proposal:', JSON.stringify(event, null, 2));
    });

    client.on('session_connect', (event) => {
      console.log('[WC] session_connect:', JSON.stringify(event, null, 2));
    });

    client.on('session_update', (event) => {
      console.log('[WC] session_update:', JSON.stringify(event, null, 2));
    });

    client.on('session_delete', (event) => {
      console.log('[WC] session_delete:', JSON.stringify(event, null, 2));
    });

    client.on('session_expire', (event) => {
      console.warn('[WC] session_expire:', event);
    });

    // ── Display URI event (some SDKs emit this) ─────────────────
    client.core.pairing.events.on('display_uri', (data: any) => {
      console.log('[WC] pairing display_uri:', data);
    });

    try {
      console.log('[WC] Calling client.connect()…');
      console.log('[WC] Namespaces:', JSON.stringify({
        solana: {
          methods: SOLANA_METHODS,
          chains: [SOLANA_MAINNET, SOLANA_MAINNET_DEPRECATED],
          events: [],
        },
      }, null, 2));

      const { uri: proposalUri, approval } = await client.connect({
        // Use optionalNamespaces so wallets that only support
        // the deprecated chain ID can still connect
        optionalNamespaces: {
          solana: {
            methods: SOLANA_METHODS,
            chains: [SOLANA_MAINNET, SOLANA_MAINNET_DEPRECATED],
            events: [],
          },
        },
      });

      console.log('[WC] connect() returned, uri:', proposalUri);

      if (proposalUri) {
      console.log('[WC] URI length:', proposalUri.length);
      console.log('[WC] URI prefix:', proposalUri.substring(0, 30) + '…');
      setUri(proposalUri);
      const universalLink = `https://walletconnect.org/wc?uri=${encodeURIComponent(proposalUri)}`;
      console.log('[WC] Universal link:', universalLink.substring(0, 60) + '…');
      setStatus('Scan with your phone camera or Phantom app');
      } else {
        console.error('[WC] No URI returned from connect()');
        onError('WalletConnect did not return a pairing URI.');
        return;
      }

      // Wait for the user to scan and approve (or reject / timeout)
      console.log('[WC] Waiting for approval…');
      const session = await approval();
      console.log('[WC] Session approved! Topic:', session.topic);
      console.log('[WC] Session namespaces:', JSON.stringify(session.namespaces, null, 2));

      // Extract the Solana account from the session
      const accounts = session.namespaces.solana?.accounts || [];
      console.log('[WC] Accounts:', accounts);

      if (accounts.length === 0) {
        throw new Error('No Solana account in the WalletConnect session.');
      }

      // Format: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:<address>"
      const address = accounts[0].split(':')[2];
      console.log('[WC] Connected address:', address);
      const publicKey = new PublicKey(address);

      // Create a signMessage function that uses the WalletConnect session
      const signMessage = async (msg: Uint8Array): Promise<Uint8Array> => {
        console.log('[WC] Signing message, length:', msg.length);
        const result = await client.request({
          topic: session.topic,
          chainId: accounts[0].split(':').slice(0, 2).join(':'),
          request: {
            method: 'solana_signMessage',
            params: {
              message: Buffer.from(msg).toString('base64'),
              pubkey: address,
            },
          },
        });
        console.log('[WC] Sign result:', result);
        // Result is { signature: string } — base64 encoded
        const sig = (result as any).signature;
        return Uint8Array.from(atob(sig), (c) => c.charCodeAt(0));
      };

      onConnect({ publicKey, topic: session.topic, signMessage });
    } catch (err: any) {
      console.error('[WC] Error during connect/approval:', err);
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
      clientRef.current?.removeAllListeners('session_proposal');
      clientRef.current?.removeAllListeners('session_connect');
      clientRef.current?.removeAllListeners('session_update');
      clientRef.current?.removeAllListeners('session_delete');
      clientRef.current?.removeAllListeners('session_expire');
    };
  }, [init]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(uri);
      setCopied(true);
      console.log('[WC] Copied RAW wc: URI to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('[WC] Failed to copy:', err);
    }
  };

  // The QR code encodes the universal link so Android camera opens the wallet app
  // The copy button copies the raw wc: URI for debugging
  const qrPayload = uri
    ? `https://walletconnect.org/wc?uri=${encodeURIComponent(uri)}`
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
          <button style={qrStyles.copyBtn} onClick={handleCopyLink}>
            {copied ? '✓ Copied!' : 'Copy Connection Link'}
          </button>
        )}

        <p style={qrStyles.instructions}>
          {status}
        </p>

        <div style={qrStyles.warningBox}>
          <p style={qrStyles.warningTitle}>
            📱 How to scan
          </p>
          <p style={qrStyles.warningSteps}>
            <strong>iPhone:</strong> Open your camera app and scan the QR code
          </p>
          <p style={qrStyles.warningSteps}>
            <strong>Android:</strong> Open your camera app and scan — it will open Phantom or Backpack automatically
          </p>
          <p style={qrStyles.warningSteps}>
            Or open <strong>Phantom</strong> → <strong>Menu</strong> → <strong>Scan QR</strong>
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
    transition: 'all 0.2s',
  },
  instructions: {
    color: '#aaa', fontSize: 14, textAlign: 'center' as const,
    marginTop: 12, marginBottom: 0,
  },
  warningBox: {
    marginTop: 16, padding: '12px 16px', borderRadius: 8,
    background: '#1a1a00', border: '1px solid #333',
    width: '100%', boxSizing: 'border-box' as const,
  },
  warningTitle: {
    color: '#ffcc00', fontSize: 13, fontWeight: 700,
    margin: '0 0 6px', textAlign: 'center' as const,
  },
  warningText: {
    color: '#aaa', fontSize: 12, margin: '0 0 8px',
    textAlign: 'center' as const,
  },
  warningSteps: {
    color: '#fff', fontSize: 12, margin: 0,
    textAlign: 'center' as const, lineHeight: 1.5,
  },
};
