import { useState, useEffect, useRef, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import SignClient from '@walletconnect/sign-client';
import { PublicKey } from '@solana/web3.js';

const PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '';
const SOLANA_MAINNET = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';

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
  const clientRef = useRef<InstanceType<typeof SignClient> | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const init = useCallback(async () => {
    try {
      const client = await SignClient.init({
        projectId: PROJECT_ID,
        metadata: {
          name: 'R2H RSC',
          description: 'Play to Earn',
          url: 'https://r2hrsc.xyz',
          icons: ['https://r2hrsc.xyz/icons/phantom.svg'],
        },
      });
      clientRef.current = client;

      const { uri: proposalUri, approval } = await client.connect({
        requiredNamespaces: {
          solana: {
            methods: ['solana_signMessage', 'solana_signTransaction'],
            chains: [SOLANA_MAINNET],
            events: [],
          },
        },
      });

      if (proposalUri) {
        setUri(proposalUri);
        setStatus('Scan with Phantom or Backpack on your phone');
      }

      // Cleanup function for timeout/cancel
      const cleanup = () => {
        client.removeAllListeners();
      };
      cleanupRef.current = cleanup;

      // Wait for the user to scan and approve
      const session = await approval();

      // Extract the Solana account from the session
      const accounts = session.namespaces.solana?.accounts || [];
      if (accounts.length === 0) {
        throw new Error('No Solana account in the WalletConnect session.');
      }

      // Format: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:<address>"
      const address = accounts[0].split(':')[2];
      const publicKey = new PublicKey(address);

      // Create a signMessage function that uses the WalletConnect session
      const signMessage = async (msg: Uint8Array): Promise<Uint8Array> => {
        const result = await client.request({
          topic: session.topic,
          chainId: SOLANA_MAINNET,
          request: {
            method: 'solana_signMessage',
            params: {
              message: Buffer.from(msg).toString('base64'),
              pubkey: address,
            },
          },
        });
        // Result is { signature: string } — base64 encoded
        const sig = (result as any).signature;
        return Uint8Array.from(atob(sig), (c) => c.charCodeAt(0));
      };

      onConnect({ publicKey, topic: session.topic, signMessage });
    } catch (err: any) {
      if (err?.message?.includes('expired') || err?.message?.includes('rejected')) {
        onError('QR code expired. Please try again.');
      } else {
        onError(err?.message || 'WalletConnect failed');
      }
    }
  }, [onConnect, onError]);

  useEffect(() => {
    init();
    return () => {
      cleanupRef.current?.();
      clientRef.current?.removeAllListeners();
    };
  }, [init]);

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
              size={260}
              bgColor="#000"
              fgColor="#fff"
              level="M"
              style={{ borderRadius: 8 }}
            />
          ) : (
            <div style={qrStyles.loading}>Loading…</div>
          )}
        </div>

        <p style={qrStyles.instructions}>
          {status}
        </p>
        <p style={qrStyles.hint}>
          Open Phantom or Backpack → Settings → Scan QR
        </p>
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
    padding: '28px 28px 24px', width: 340, maxWidth: '90vw',
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
    border: '1px solid #222',
  },
  loading: {
    width: 260, height: 260, display: 'flex',
    alignItems: 'center', justifyContent: 'center',
    color: '#555', fontSize: 14,
  },
  instructions: {
    color: '#aaa', fontSize: 14, textAlign: 'center' as const,
    marginTop: 16, marginBottom: 0,
  },
  hint: {
    color: '#555', fontSize: 12, textAlign: 'center' as const,
    marginTop: 6, marginBottom: 0,
  },
};
