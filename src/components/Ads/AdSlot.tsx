import { useEffect, useState, useRef } from 'react';
import {
  getAdForSlot,
  recordImpression,
  recordClick,
  type AdSlotType,
  type Ad,
} from '../../lib/adManager';
import { AdSenseAd, isAdSenseEnabled } from './AdSenseAd';
import { CommunityHub } from './CommunityHub';

interface AdSlotProps {
  slot: AdSlotType;
  zone: 'top' | 'left' | 'right' | 'bottom';
}

export function AdSlot({ slot, zone }: AdSlotProps) {
  const ad = getAdForSlot(slot);
  // Force re-render when localStorage changes (e.g. admin uploads new ad)
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    const handler = () => forceUpdate(n => n + 1);
    window.addEventListener('storage', handler);
    window.addEventListener('r2h-ads-updated', handler);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener('r2h-ads-updated', handler);
    };
  }, []);

  // Priority: paid ad (localStorage) > AdSense > community hub content
  if (ad) {
    return <PaidAd ad={ad} slot={slot} />;
  }
  if (isAdSenseEnabled()) {
    const layout = slot === 'LEFT_SIDEBAR' || slot === 'RIGHT_SIDEBAR' ? 'vertical' : 'horizontal';
    return <AdSenseAd layout={layout} />;
  }
  return <CommunityHub zone={zone} />;
}

function PaidAd({ ad, slot }: { ad: Ad; slot: AdSlotType }) {
  const recordedRef = useRef(false);

  useEffect(() => {
    if (recordedRef.current) return;
    recordedRef.current = true;
    recordImpression(ad.id);
  }, [ad.id]);

  const handleClick = () => {
    recordClick(ad.id);
  };

  const isSide = slot === 'LEFT_SIDEBAR' || slot === 'RIGHT_SIDEBAR';

  return (
    <a
      href={ad.linkUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={handleClick}
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        textDecoration: 'none',
      }}
    >
      <img
        src={ad.imageUrl}
        alt={ad.advertiser}
        style={{
          maxWidth: '100%',
          maxHeight: '100%',
          width: isSide ? 'auto' : 'auto',
          height: isSide ? '100%' : 'auto',
          objectFit: 'contain',
          borderRadius: 4,
        }}
      />
    </a>
  );
}
