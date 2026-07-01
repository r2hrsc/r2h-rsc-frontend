import { useEffect, useState, useRef } from 'react';
import {
  getAdForSlot,
  getFillerForSlot,
  recordImpression,
  recordClick,
  type AdSlotType,
  type Ad,
  type FillerAd,
} from '../../lib/adManager';
import { AdSenseAd, isAdSenseEnabled } from './AdSenseAd';

interface AdSlotProps {
  slot: AdSlotType;
}

export function AdSlot({ slot }: AdSlotProps) {
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

  // Priority: paid ad (localStorage) > AdSense > filler text
  if (ad) {
    return <PaidAd ad={ad} slot={slot} />;
  }
  if (isAdSenseEnabled()) {
    const layout = slot === 'LEFT_SIDEBAR' || slot === 'RIGHT_SIDEBAR' ? 'vertical' : 'horizontal';
    return <AdSenseAd layout={layout} />;
  }
  return <FillerAdDisplay slot={slot} />;
}

function PaidAd({ ad, slot }: { ad: Ad; slot: AdSlotType }) {
  const recordedRef = useRef(false);

  // Record impression once on mount
  useEffect(() => {
    if (recordedRef.current) return;
    recordedRef.current = true;
    recordImpression(ad.id);
  }, [ad.id]);

  const handleClick = () => {
    recordClick(ad.id);
  };

  // Side columns are vertical; top/bottom are horizontal
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

function FillerAdDisplay({ slot }: { slot: AdSlotType }) {
  const filler = getFillerForSlot(slot);
  if (!filler) return null;

  const isSide = slot === 'LEFT_SIDEBAR' || slot === 'RIGHT_SIDEBAR';

  return (
    <a
      href={filler.linkUrl}
      target={filler.linkUrl.startsWith('/') ? '_self' : '_blank'}
      rel="noopener noreferrer"
      style={{
        display: 'flex',
        flexDirection: isSide ? 'column' : 'row',
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        gap: isSide ? 6 : 16,
        textDecoration: 'none',
        background: filler.bgGradient,
        padding: 8,
        boxSizing: 'border-box',
        transition: 'opacity 0.2s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
    >
      <span style={{
        fontSize: isSide ? 15 : 18,
        fontWeight: 700,
        color: filler.color,
        writingMode: isSide ? 'vertical-rl' : undefined,
        letterSpacing: isSide ? 2 : 0,
      }}>
        {filler.title}
      </span>
      {filler.subtitle && (
        <span style={{
          fontSize: isSide ? 11 : 14,
          color: '#888',
          writingMode: isSide ? 'vertical-rl' : undefined,
          letterSpacing: isSide ? 1.5 : 0,
        }}>
          {filler.subtitle}
        </span>
      )}
    </a>
  );
}
