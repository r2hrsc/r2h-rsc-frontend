/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_WS_URL: string;
  readonly VITE_CACHE_CDN_URL: string;
  readonly VITE_GOOGLE_CLIENT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Fix React 18.3+ type incompatibility with @solana/wallet-adapter
// The wallet adapter was built against React 18.0 types.
// React 18.3 added Promise<ReactNode> to ReactNode which breaks JSX component types.
import type { ReactNode } from 'react';
declare module 'react' {
  interface ReactNodeMap {
    __brand: never;
  }
}
