import { useState, useEffect } from 'react';

const GAME_WIDTH = 512;
const GAME_HEIGHT = 345;
const PADDING_BUFFER = 0.95;
const MIN_SCALE = 0.6;
const MAX_SCALE = 2;

export function useGameScale(): number {
  const [scale, setScale] = useState(() => calculateScale());

  useEffect(() => {
    const handleResize = () => {
      setScale(calculateScale());
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return scale;
}

function calculateScale(): number {
  // Reserve space for side ad columns on desktop so the game doesn't overflow them after scaling.
  // Ads are hidden via CSS on mobile (<768px) so use full width there.
  const isMobile = window.innerWidth < 768;
  const sideReserve = isMobile ? 0 : 360; // 160 left + 160 right + 20px gap on each side of game
  const availableWidth = Math.max(300, window.innerWidth - sideReserve);

  const scaleX = availableWidth / GAME_WIDTH;
  const scaleY = window.innerHeight / GAME_HEIGHT;
  const scale = Math.max(MIN_SCALE, Math.min(scaleX, scaleY) * PADDING_BUFFER);

  return Math.min(scale, MAX_SCALE);
}
