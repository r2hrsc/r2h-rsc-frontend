import {
  BaseSignerWalletAdapter,
  WalletName,
  WalletReadyState,
  WalletConnectionError,
  WalletDisconnectedError,
} from '@solana/wallet-adapter-base';
import { PublicKey, Transaction, VersionedTransaction } from '@solana/web3.js';
import type { UniversalProvider } from '@walletconnect/universal-provider';

const SOLANA_MAINNET = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';

export const WALLETCONNECT_QR_EVENT = 'walletconnect:qr-uri';

export class WalletConnectQRAdapter extends BaseSignerWalletAdapter {
  name = 'WalletConnect' as WalletName<'WalletConnect'>;
  url = 'https://walletconnect.com';
  icon =
    'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAiIGhlaWdodD0iMzAiIHZpZXdCb3g9IjAgMCAzMCAzMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNMTIuMjUgMTEuMTM3QzE1LjI1IDguMTI2IDIwLjA5IDguMTI2IDIzLjA5IDExLjEzN0wyMy41OCAxMS42MjhDMjMuNzggMTEuODI5IDIzLjc4IDEyLjE1OSAyMy41OCAxMi4zNkwxOS44NiAxNi4wOThDMTkuNjYgMTYuMjk5IDE5LjMzIDE2LjI5OSAxOS4xMyAxNi4wOThMMTcuOTkgMTQuOTU0QzE3LjE5IDE0LjE1MSAxNi4xNSAxMy43MDkgMTUuMDUgMTMuNzA5QzEzLjk1IDEzLjcwOSAxMi45MSAxNC4xNTEgMTIuMTEgMTQuOTU0TDExLjAxIDE2LjA5OEMxMC44MSAxNi4yOTkgMTAuNDggMTYuMjk5IDEwLjI4IDE2LjA5OEw2LjU2IDEyLjM2QzYuMzYgMTIuMTU5IDYuMzYgMTEuODI5IDYuNTYgMTEuNjI4TDcuMDUgMTEuMTM3QzEwLjA1IDguMTI2IDE0Ljg5IDguMTI2IDE3Ljg5IDExLjEzN0wxNS4wNyAxMy45NjRMMTIuMjUgMTEuMTM3WiIgZmlsbD0iIzNEQ0NGOCIvPjwvc3ZnPg==';

  readonly supportedTransactionVersions = null;

  private _projectId: string;
  private _metadata: { name: string; description: string; url: string; icons: string[] };
  private _provider: UniversalProvider | null = null;
  private _publicKey: PublicKey | null = null;
  private _connecting = false;
  private _readyState = WalletReadyState.Loadable;

  constructor(opts: {
    projectId: string;
    metadata?: { name: string; description: string; url: string; icons: string[] };
  }) {
    super();
    this._projectId = opts.projectId;
    this._metadata = opts.metadata ?? {
      name: 'R2H RSC',
      description: 'Play to earn',
      url: 'https://r2hrsc.xyz',
      icons: ['https://r2hrsc.xyz/favicon.ico'],
    };
  }

  get publicKey() {
    return this._publicKey;
  }

  get connecting() {
    return this._connecting;
  }

  get readyState() {
    return this._readyState;
  }

  async connect(): Promise<void> {
    if (this._connecting || this._publicKey) return;
    this._connecting = true;

    try {
      const { UniversalProvider } = await import('@walletconnect/universal-provider');

      this._provider = await UniversalProvider.init({
        projectId: this._projectId,
        metadata: this._metadata,
      });

      // Emit the QR URI so the UI can display it
      this._provider.on('display_uri', (uri: string) => {
        window.dispatchEvent(
          new CustomEvent(WALLETCONNECT_QR_EVENT, { detail: { uri } })
        );
      });

      const session = await this._provider.connect({
        namespaces: {
          solana: {
            methods: ['solana_signMessage', 'solana_signTransaction'],
            chains: [SOLANA_MAINNET],
            events: [],
          },
        },
      });

      const accounts = session.namespaces.solana?.accounts ?? [];
      if (!accounts.length) throw new WalletConnectionError('No Solana account returned');

      const addr = accounts[0].split(':').pop()!;
      this._publicKey = new PublicKey(addr);

      this._provider.on('session_delete', () => {
        this._publicKey = null;
        this._provider = null;
        this.emit('disconnect');
      });

      this.emit('connect', this._publicKey);
    } catch (err: any) {
      this._connecting = false;
      window.dispatchEvent(
        new CustomEvent(WALLETCONNECT_QR_EVENT, { detail: { uri: null, error: err.message } })
      );
      throw new WalletConnectionError(err.message);
    } finally {
      this._connecting = false;
    }
  }

  async disconnect(): Promise<void> {
    if (this._provider) {
      try {
        await this._provider.disconnect();
      } catch {}
      this._provider = null;
    }
    this._publicKey = null;
    window.dispatchEvent(
      new CustomEvent(WALLETCONNECT_QR_EVENT, { detail: { uri: null } })
    );
    this.emit('disconnect');
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    if (!this._provider || !this._publicKey) throw new WalletDisconnectedError();

    const resp = await this._provider.client.request({
      topic: this._provider.session!.topic,
      chainId: SOLANA_MAINNET,
      request: {
        method: 'solana_signTransaction',
        params: {
          transaction: Buffer.from(tx.serialize()).toString('base64'),
          pubkey: this._publicKey.toBase58(),
        },
      },
    });

    const sigBytes = Buffer.from((resp as any).signature, 'base64');
    if (tx instanceof Transaction) {
      tx.addSignature(this._publicKey, sigBytes);
    }
    return tx;
  }

  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    if (!this._provider || !this._publicKey) throw new WalletDisconnectedError();

    const resp = await this._provider.client.request({
      topic: this._provider.session!.topic,
      chainId: SOLANA_MAINNET,
      request: {
        method: 'solana_signMessage',
        params: {
          message: Buffer.from(message).toString('base64'),
          pubkey: this._publicKey.toBase58(),
        },
      },
    });

    return Uint8Array.from(Buffer.from((resp as any).signature, 'base64'));
  }
}
