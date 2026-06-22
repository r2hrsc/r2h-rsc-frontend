// ── Solana polyfills (must run before anything else) ────────────
import { Buffer } from 'buffer';
if (typeof window !== 'undefined') {
  (window as any).Buffer = Buffer;
  (window as any).global = window;
  if (typeof (window as any).process === 'undefined') {
    (window as any).process = { env: {}, version: '', nextTick: (fn: () => void) => setTimeout(fn, 0) };
  }
}

import React from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import App from './App';
import './index.css';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '293122558789-cs1p629kksvtulqsv6rpmh7mtctfuup1.apps.googleusercontent.com';

function Root() {
  if (!GOOGLE_CLIENT_ID) {
    return (
      <div style={{ color: '#f44', background: '#000', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace' }}>
        <div style={{ textAlign: 'center' }}>
          <h2>Configuration Error</h2>
          <p style={{ color: '#888' }}>VITE_GOOGLE_CLIENT_ID is not set.</p>
          <p style={{ color: '#666', fontSize: 12 }}>Check Cloudflare Pages → Settings → Environment variables</p>
        </div>
      </div>
    );
  }

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <App />
    </GoogleOAuthProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
