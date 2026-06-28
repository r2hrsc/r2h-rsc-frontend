import { useState, useEffect, useCallback, useRef } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';

const SIDECAR_URL = import.meta.env.VITE_SIDECAR_URL || 'http://localhost:3000';
const TOKEN_KEY='r2h_session_token';

interface SidecarAuthState {
  login: () => Promise<void>;
  logout: () => void;
  sessionToken: string | null;
  isAuthenticating: boolean;
  authError: string | null;
}

export function useSidecarAuth(): SidecarAuthState {
  const { authenticated, user, logout: privyLogout } = usePrivy();
  const { wallets } = useWallets();
  const [sessionToken, setSessionToken] = useState<string | null>(() => {
    return localStorage.getItem(TOKEN_KEY);
  });
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const login = useCallback(async () => {
    if (!authenticated || !user) {
      setAuthError('Not authenticated with Privy');
      return;
    }

    setIsAuthenticating(true);
    setAuthError(null);

    try {
      const solWallet = (wallets as any[]).find((w) => (w.chainType ?? w.type) === 'solana');
      const walletAddress = solWallet?.address || user.wallet?.address || user.id;

      const response = await fetch(`${SIDECAR_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'privy',
          userId: user.id,
          walletAddress,
          email: user.email?.address,
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
  }, [authenticated, user, wallets]);

  const logout = useCallback(() => {
    setSessionToken(null);
    setAuthError(null);
    localStorage.removeItem(TOKEN_KEY);
    console.log('[useSidecarAuth] Logged out');

    fetch(`${SIDECAR_URL}/api/auth/logout`, { method: 'POST' }).catch(() => {});
    privyLogout();
  }, [privyLogout]);

  // Keep latest versions of login/logout in refs so the effect below doesn't re-run on every render
  // when the callbacks change identity (due to unstable user/wallets from Privy)
  const loginRef = useRef(login);
  const logoutRef = useRef(logout);
  useEffect(() => { loginRef.current = login; }, [login]);
  useEffect(() => { logoutRef.current = logout; }, [logout]);

  // Auto-login when Privy authenticates, auto-logout when disconnects
  // Note: do not include login/logout in deps to avoid re-running on every render
  useEffect(() => {
    if (authenticated && user && !sessionToken && !isAuthenticating) {
      console.log('[useSidecarAuth] Privy authenticated, triggering auto-login');
      loginRef.current?.();
    } else if (!authenticated && sessionToken) {
      console.log('[useSidecarAuth] Privy disconnected, triggering logout');
      logoutRef.current?.();
    }
  }, [authenticated, user, sessionToken, isAuthenticating]);

  return { login, logout, sessionToken, isAuthenticating, authError };
}
