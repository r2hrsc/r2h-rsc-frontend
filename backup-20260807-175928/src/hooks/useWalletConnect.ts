import { useState, useCallback, useRef } from 'react';
import QRCode from 'qrcode';

const WC_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || '';

interface WalletConnectState {
  show: boolean;
  uri: string;
  qrDataUrl: string;
  error: string;
  connecting: boolean;
}

interface WalletConnectModalProps {
  onConnect: (address: string) => void;
  onError: (error: string) => void;
}

export function useWalletConnect() {
  const [state, setState] = useState<WalletConnectState>({
    show: false,
    uri: '',
    qrDataUrl: '',
    error: '',
    connecting: false,
  });

  const providerRef = useRef<any>(null);

  const connect = useCallback(async () => {
    if (!WC_PROJECT_ID) {
      setState(s => ({ ...s, error: 'WalletConnect project ID not configured' }));
      return;
    }

    setState(s => ({ ...s, show: true, connecting: true, error: '', uri: '', qrDataUrl: '' }));

    try {
      // Dynamic import to avoid bloating the initial bundle
      const { EthereumProvider } = await import('@walletconnect/ethereum-provider');

      // Destroy any existing provider first to prevent double-init
      if (providerRef.current) {
        try { await providerRef.current.disconnect(); } catch {}
        providerRef.current = null;
      }

      // Use dynamic page URL so metadata matches origin (avoids WC warning)
      const provider = await EthereumProvider.init({
        projectId: WC_PROJECT_ID,
        chains: [1],
        optionalChains: [137, 8453, 42161, 10],
        showQrModal: false, // We show our own QR
        methods: ['eth_accounts', 'eth_requestAccounts', 'personal_sign'],
        events: ['connect', 'disconnect', 'accountsChanged', 'chainChanged'],
        metadata: {
          name: 'R2H RSC',
          description: 'Classic RSC client',
          url: typeof window !== 'undefined' ? window.location.origin : 'https://r2hrsc.xyz',
          icons: ['https://r2hrsc.xyz/logo.png'],
        },
      });

      providerRef.current = provider;

      // Generate QR code from the WC URI
      provider.on('display_uri', async (uri: string) => {
        console.log('[WalletConnect] URI received');
        try {
          const qrDataUrl = await QRCode.toDataURL(uri, {
            width: 280,
            margin: 2,
            color: { dark: '#000000', light: '#ffffff' },
          });
          setState(s => ({ ...s, uri, qrDataUrl }));
        } catch (e) {
          console.error('[WalletConnect] QR generation failed:', e);
        }
      });

      provider.on('connect', (info: any) => {
        console.log('[WalletConnect] Connected:', info);
        const accounts = provider.accounts;
        if (accounts && accounts.length > 0) {
          const address = accounts[0];
          setState(s => ({ ...s, show: false, connecting: false }));
          return address;
        }
      });

      // Actually connect — this triggers the display_uri event
      await provider.connect();
      const accounts = provider.accounts;
      if (accounts && accounts.length > 0) {
        return accounts[0];
      }

      // If we get here without accounts, something went wrong
      throw new Error('No accounts returned');
    } catch (e: any) {
      console.error('[WalletConnect] Error:', e);
      setState(s => ({ ...s, error: e.message || 'Connection failed', connecting: false }));
      throw e;
    }
  }, []);

  const disconnect = useCallback(async () => {
    if (providerRef.current) {
      try { await providerRef.current.disconnect(); } catch {}
      providerRef.current = null;
    }
    setState({
      show: false, uri: '', qrDataUrl: '', error: '', connecting: false,
    });
  }, []);

  return { state, connect, disconnect };
}
