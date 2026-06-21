import { useEffect, useRef } from 'react';

const CACHE_CDN = import.meta.env.VITE_CACHE_CDN_URL || 'https://game.r2hrsc.xyz/rsc-client';

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
          type: 'R2H_AUTH',
          username: rscUsername,
          password: rscPassword,
        },
        '*'
      );
    };

    sendCreds();
    const interval = setInterval(sendCreds, 1000);
    const timeout = setTimeout(() => clearInterval(interval), 10000);

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
