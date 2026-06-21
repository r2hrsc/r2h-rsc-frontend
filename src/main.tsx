import React from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleOAuthProvider } from '@react-oauth/google';
import App from './App';
import './index.css';

// Polyfill global for Solana wallet adapters
if (typeof window !== 'undefined') {
  (window as any).global = window;
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

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
