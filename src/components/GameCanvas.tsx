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

  // Listen for rsc-login-complete from the iframe
  useEffect(() => {
    if (!onLoginComplete) return;

    const handler = (event: MessageEvent) => {
      if (event.origin !== IFRAME_ORIGIN && event.origin !== window.location.origin) return;
      if (event.data?.type === 'rsc-login-complete') {
        console.log('[GameCanvas] Received rsc-login-complete');
        onLoginComplete();
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [onLoginComplete]);

  // Send credentials to iframe
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

    // Send immediately, then retry every 1s for 15s (iframe may still be loading)
    sendCreds();
    const interval = setInterval(sendCreds, 1000);
    const timeout = setTimeout(() => clearInterval(interval), 15000);

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
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
