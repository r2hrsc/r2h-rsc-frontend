import { useState, useEffect } from 'react';

const GAME_WIDTH = 512;
const GAME_HEIGHT = 345;
const PADDING_BUFFER = 0.95;
const MIN_SCALE = 0.6;
const MAX_SCALE = 2;

export function useGameScale(): number {
  const [scale, setScale] = useState(() => calculateScale());

  useEffect(() => {
    // Mobile browsers change innerWidth/innerHeight when the address bar
    // shows/hides. Delay the initial scale calculation so the viewport settles.
    const raf = requestAnimationFrame(() => {
      setScale(calculateScale());
    });
    // Second pass after 200ms for slow address bar animations
    const settle = setTimeout(() => setScale(calculateScale()), 200);

    const handleResize = () => {
      setScale(calculateScale());
    };

    window.addEventListener('resize', handleResize);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(settle);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  return scale;
}

function calculateScale(): number {
  // Reserve space for ad frame around the game so the whole assembly fits the viewport.
  // Side ads (360px horizontal) + top/bottom bars (320px vertical) are hidden on mobile (<768px).
  const isMobile = window.innerWidth < 768;
  const sideReserve = isMobile ? 0 : 500;
  const verticalReserve = isMobile ? 0 : 400;
  const availableWidth = Math.max(300, window.innerWidth - sideReserve);
  const availableHeight = Math.max(200, window.innerHeight - verticalReserve);

  const scaleX = availableWidth / GAME_WIDTH;
  const scaleY = availableHeight / GAME_HEIGHT;
  const scale = Math.max(MIN_SCALE, Math.min(scaleX, scaleY) * PADDING_BUFFER);

  return Math.min(scale, MAX_SCALE);
}
