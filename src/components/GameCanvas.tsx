import { useEffect, useRef } from 'react';

const CACHE_CDN = import.meta.env.VITE_CACHE_CDN_URL || 'https://game.r2hrsc.xyz/rsc-client/';
const IFRAME_ORIGIN = 'https://game.r2hrsc.xyz';

// Server RSA keys — must match the OpenRSC server's RSA config
// Hash format: #members,address,port,rsaExponent,rsaModulus,disableOpcodeEncryption
const RSA_EXPONENT = '65537';
const RSA_MODULUS = '9115015542438186018327044408313987277889783174239809826491015549573028356381739563861028029945657804756198333660503635469704152602063914154601665525357981';
const GAME_URL = `${CACHE_CDN}#members,127.0.0.1,43594,${RSA_EXPONENT},${RSA_MODULUS},1`;

interface GameCanvasProps {
  wsUrl: string;
  rscUsername?: string;
  rscPassword?: string;
  hidden?: boolean;
  onLoginComplete?: () => void;
}

export default function GameCanvas({ wsUrl, rscUsername, rscPassword, hidden, onLoginComplete }: GameCanvasProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Listen for rsc-login-complete OR rsc-login-error from the iframe
  useEffect(() => {
    if (!onLoginComplete) return;

    const handler = (event: MessageEvent) => {
      if (event.origin !== IFRAME_ORIGIN && event.origin !== window.location.origin) return;
      if (event.data?.type === 'rsc-login-complete') {
        console.log('[GameCanvas] Received rsc-login-complete');
        onLoginComplete();
      } else if (event.data?.type === 'rsc-login-error') {
        // Login failed in the iframe — surface error to user instead of hanging forever
        console.error('[GameCanvas] Received rsc-login-error:', event.data?.detail || 'unknown');
        window.alert('Login failed: ' + (event.data?.detail || 'Game server did not respond. Please try again.'));
        // Reload to let user retry
        window.location.reload();
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onLoginComplete]);

  // Send credentials to iframe — with retry + 45s overall timeout
  useEffect(() => {
    if (!rscUsername || !rscPassword || !iframeRef.current?.contentWindow) return;

    const sendCreds = () => {
      iframeRef.current?.contentWindow?.postMessage(
        {
          type: 'RSC_LOGIN',
          username: rscUsername,
          password: rscPassword,
        },
        IFRAME_ORIGIN
      );
    };

    // Send immediately, then retry every 2s for 30s (iframe may still be loading, especially on mobile)
    sendCreds();
    const interval = setInterval(sendCreds, 2000);
    const stopRetry = setTimeout(() => clearInterval(interval), 30000);

    // Overall login timeout: if no rsc-login-complete or rsc-login-error in 45s, show error
    const loginTimeout = setTimeout(() => {
      console.error('[GameCanvas] Login timed out after 45s — no response from game server');
      window.alert('Login timed out. The game server may be busy or your connection is slow. Please try again.');
      window.location.reload();
    }, 45000);

    return () => {
      clearInterval(interval);
      clearTimeout(stopRetry);
      clearTimeout(loginTimeout);
    };
  }, [rscUsername, rscPassword]);

  return (
    <iframe
      ref={iframeRef}
      src={GAME_URL}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        border: 'none',
        visibility: hidden ? 'hidden' : 'visible',
        pointerEvents: hidden ? 'none' : 'auto',
      }}
      title="R2H RSC Game"
      allow="autoplay; gamepad"
    />
  );
}
