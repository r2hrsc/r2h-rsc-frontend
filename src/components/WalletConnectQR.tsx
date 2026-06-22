import { useState, useEffect, useRef, useCallback } from 'react';
import { PublicKey } from '@solana/web3.js';
import { UniversalProvider } from '@walletconnect/universal-provider';
import { createAppKit } from '@reown/appkit/core';
import { solana, solanaDevnet } from '@reown/appkit/networks';

const PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '';

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
  const [status, setStatus] = useState('Initializing…');
  const providerRef = useRef<Awaited<ReturnType<typeof UniversalProvider.init>> | null>(null);
  const modalRef = useRef<ReturnType<typeof createAppKit> | null>(null);

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

      // Create the AppKit modal — this is what the official adapter uses.
      // It handles QR code generation, universal links, wallet detection,
      // and deep linking automatically. This is the battle-tested approach.
      const modal = createAppKit({
        projectId: PROJECT_ID,
        universalProvider: provider,
        networks: [solana, solanaDevnet],
        manualWCControl: true,
        featuredWallets: [],
      });
      modalRef.current = modal;

      // Open the modal — it shows the QR code with the correct
      // universal link format that Android/iOS cameras recognize
      console.log('[WC] Opening AppKit modal…');
      modal.open();
      setStatus('Scan the QR code with your phone camera');

      // Now call connect — this triggers the WalletConnect session proposal.
      // The modal displays the QR code automatically via the relay.
      console.log('[WC] Calling provider.connect()…');
      const sessionResult = await provider.connect({
        optionalNamespaces: {
          solana: {
            methods: ['solana_signMessage', 'solana_signTransaction'],
            chains: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', 'solana:4sGjMW1sUnHzSxGspuhpqLDx6wiyjNtZ'],
            events: [],
          },
        },
      });

      const session = sessionResult!;
      if (!session) {
        throw new Error('WalletConnect session was not established.');
      }

      console.log('[WC] Session established:', session.topic);
      modal.close();

      // Extract Solana account from session
      const accounts = session.namespaces.solana?.accounts || [];
      console.log('[WC] Accounts:', accounts);

      if (accounts.length === 0) {
        throw new Error('No Solana account in the WalletConnect session.');
      }

      const address = accounts[0].split(':')[2];
      const chainId = accounts[0].split(':').slice(0, 2).join(':');
      console.log('[WC] Connected address:', address);
      const publicKey = new PublicKey(address);

      // signMessage function using the UniversalProvider
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
      console.error('[WC] Error:', err);
      modalRef.current?.close();
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
      modalRef.current?.close();
      providerRef.current?.disconnect?.().catch(() => {});
    };
  }, [init]);

  return (
    <div style={qrStyles.overlay}>
      <div style={qrStyles.card}>
        <div style={qrStyles.header}>
          <h3 style={qrStyles.title}>Scan to Connect</h3>
          <button style={qrStyles.close} onClick={onClose}>✕</button>
        </div>

        <p style={qrStyles.instructions}>
          {status}
        </p>

        <div style={qrStyles.infoBox}>
          <p style={qrStyles.infoTitle}>How to connect</p>
          <p style={qrStyles.infoStep}>
            <strong>1.</strong> A QR code is showing in the popup window
          </p>
          <p style={qrStyles.infoStep}>
            <strong>2.</strong> Open your phone camera and scan it
          </p>
          <p style={qrStyles.infoStep}>
            <strong>3.</strong> Your wallet app will open — approve the connection
          </p>
          <p style={qrStyles.infoStep}>
            Or: Open <strong>Phantom</strong> → <strong>Scan QR</strong>
          </p>
        </div>

        <p style={qrStyles.hint}>
          Close this panel if the WalletConnect popup is already open
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
  instructions: {
    color: '#aaa', fontSize: 14, textAlign: 'center' as const,
    marginTop: 0, marginBottom: 16,
  },
  infoBox: {
    background: '#111', borderRadius: 8, padding: '14px 18px',
    width: '100%', boxSizing: 'border-box' as const,
    border: '1px solid #222',
  },
  infoTitle: {
    color: '#fff', fontSize: 13, fontWeight: 700,
    margin: '0 0 8px',
  },
  infoStep: {
    color: '#aaa', fontSize: 12, margin: '0 0 4px', lineHeight: 1.5,
  },
  hint: {
    color: '#555', fontSize: 11, textAlign: 'center' as const,
    marginTop: 12, marginBottom: 0,
  },
};
