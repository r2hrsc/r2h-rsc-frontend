import { useState, useEffect } from 'react';

const GAME_WIDTH = 512;
const GAME_HEIGHT = 334;
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
  const scaleX = window.innerWidth / GAME_WIDTH;
  const scaleY = window.innerHeight / GAME_HEIGHT;
  const scale = Math.max(MIN_SCALE, Math.min(scaleX, scaleY) * PADDING_BUFFER);

  return Math.min(scale, MAX_SCALE);
}
