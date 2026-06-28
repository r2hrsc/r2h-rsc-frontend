/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_WS_URL: string;
  readonly VITE_CACHE_CDN_URL: string;
  readonly VITE_GOOGLE_CLIENT_ID: string;
  readonly VITE_PRIVY_APP_ID: string;
  readonly VITE_SOLANA_RPC_URL: string;
  readonly VITE_R2H_TOKEN_MINT: string;
  readonly VITE_SIDECAR_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
