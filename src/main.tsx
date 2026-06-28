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
import App from './App';
import './index.css';
import './styles/mobile.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
