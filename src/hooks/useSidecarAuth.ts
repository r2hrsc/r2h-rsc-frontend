import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import bs58 from 'bs58';

const SIDECAR_URL = import.meta.env.VITE_SIDECAR_URL || 'http://localhost:3000';
const TOKEN_KEY = 'r2h_session_token';

interface SidecarAuthState {
  login: () => Promise<void>;
  logout: () => void;
  sessionToken: string | null;
  isAuthenticating: boolean;
  authError: string | null;
}

export function useSidecarAuth(): SidecarAuthState {
  const { publicKey, signMessage, connected } = useWallet();
  const [sessionToken, setSessionToken] = useState<string | null>(() => {
    return localStorage.getItem(TOKEN_KEY);
  });
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const login = useCallback(async () => {
    if (!publicKey || !signMessage) {
      setAuthError('Wallet not connected or signMessage not available');
      return;
    }

    setIsAuthenticating(true);
    setAuthError(null);

    try {
      // Generate challenge
      const challenge = `R2H Login: ${Date.now()}`;
      const encodedMessage = new TextEncoder().encode(challenge);

      // Sign the challenge
      const signature = await signMessage(encodedMessage);
      const base58Signature = bs58.encode(signature);

      // Send to sidecar for verification
      const response = await fetch(`${SIDECAR_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicKey: publicKey.toBase58(),
          signature: base58Signature,
          message: challenge,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Auth failed: ${response.status}`);
      }

      const data = await response.json();
      const token = data.sessionToken;

      if (!token) throw new Error('No session token returned');

      setSessionToken(token);
      localStorage.setItem(TOKEN_KEY, token);
      console.log('[useSidecarAuth] Login successful, session:', token.substring(0, 10) + '...');
    } catch (err: any) {
      console.error('[useSidecarAuth] Login error:', err.message);
      setAuthError(err.message || 'Authentication failed');
      setSessionToken(null);
      localStorage.removeItem(TOKEN_KEY);
    } finally {
      setIsAuthenticating(false);
    }
  }, [publicKey, signMessage]);

  const logout = useCallback(() => {
    setSessionToken(null);
    setAuthError(null);
    localStorage.removeItem(TOKEN_KEY);
    console.log('[useSidecarAuth] Logged out');

    // Fire and forget sidecar logout
    fetch(`${SIDECAR_URL}/api/auth/logout`, { method: 'POST' }).catch(() => {});
  }, []);

  // Auto-login when wallet connects, auto-logout when disconnects
  useEffect(() => {
    if (connected && publicKey && !sessionToken && !isAuthenticating) {
      console.log('[useSidecarAuth] Wallet connected, triggering auto-login');
      login();
    } else if (!connected && sessionToken) {
      console.log('[useSidecarAuth] Wallet disconnected, triggering logout');
      logout();
    }
  }, [connected, publicKey, sessionToken, isAuthenticating, login, logout]);

  return { login, logout, sessionToken, isAuthenticating, authError };
}
