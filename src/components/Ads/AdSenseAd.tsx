import { useEffect, useRef, useState } from 'react';

// AdSense publisher ID from env var (ca-pub-XXXXXXXXXXXXXXXX)
// Set VITE_ADSENSE_CLIENT_ID in .env or CF Pages env vars
const ADSENSE_CLIENT_ID = import.meta.env.VITE_ADSENSE_CLIENT_ID || '';
const ADSENSE_SCRIPT_LOADED = 'r2h-adsense-loaded';

// Load the AdSense script once globally
function loadAdSenseScript() {
  if (!ADSENSE_CLIENT_ID) return;
  if (document.getElementById(ADSENSE_SCRIPT_LOADED)) return;

  const script = document.createElement('script');
  script.id = ADSENSE_SCRIPT_LOADED;
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`;
  document.head.appendChild(script);
}

export function isAdSenseEnabled(): boolean {
  return !!ADSENSE_CLIENT_ID;
}

interface AdSenseAdProps {
  // Optional specific ad slot ID from AdSense dashboard.
  // If not provided, uses auto-sizing responsive format.
  slot?: string;
  // Layout type for sizing hints
  layout?: 'horizontal' | 'vertical' | 'square' | 'auto';
}

export function AdSenseAd({ slot, layout = 'auto' }: AdSenseAdProps) {
  const insRef = useRef<HTMLModElement>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadAdSenseScript();
    // Small delay to ensure script is processed
    const timer = setTimeout(() => {
      try {
        ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
        setLoaded(true);
      } catch (e) {
        // AdSense not ready yet — will retry on next render
        console.log('[AdSense] Push deferred:', e);
      }
    }, 100);

    return () => clearTimeout(timer);
  }, []);

  if (!ADSENSE_CLIENT_ID) {
    return null;
  }

  return (
    <ins
      ref={insRef}
      className="adsbygoogle"
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
      }}
      data-ad-client={ADSENSE_CLIENT_ID}
      data-ad-slot={slot || ''}
      data-ad-format={layout}
      data-full-width-responsive="true"
    />
  );
}
