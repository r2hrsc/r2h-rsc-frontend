import { useEffect, useRef } from 'react';

const CACHE_CDN = import.meta.env.VITE_CACHE_CDN_URL || 'https://game.r2hrsc.xyz/rsc-client';
const IFRAME_ORIGIN = 'https://game.r2hrsc.xyz';

interface GameCanvasProps {
  wsUrl: string;
  rscUsername?: string;
  rscPassword?: string;
}

export default function GameCanvas({ wsUrl, rscUsername, rscPassword }: GameCanvasProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

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
      src={CACHE_CDN}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        border: 'none',
      }}
      title="R2H RSC Game"
      allow="autoplay; gamepad"
    />
  );
}
