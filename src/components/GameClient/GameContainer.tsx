import { useState } from 'react';
import { useGameScale } from '../../hooks/useGameScale';
import GameCanvas from './GameCanvas';
import GameOverlay from './GameOverlay';

const GAME_WIDTH = 512;
const GAME_HEIGHT = 334;

interface GameContainerProps {
  wsUrl?: string;
  rscUsername?: string;
  rscPassword?: string;
  sessionToken?: string | null;
  hidden?: boolean;
  onLoginComplete?: () => void;
}

export default function GameContainer({ wsUrl, rscUsername, rscPassword, sessionToken, hidden, onLoginComplete }: GameContainerProps) {
  const scale = useGameScale();
  const [isConnected, setIsConnected] = useState(false);

  // Connection status dot color
  const dotColor = sessionToken ? (isConnected ? '#14F195' : '#ff4444') : '#888';

  return (
    <div
      style={{
        position: 'relative',
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
        overflow: 'hidden',
        transform: `scale(${scale})`,
        transformOrigin: 'center center',
        visibility: hidden ? 'hidden' : 'visible',
        flexShrink: 0,
      }}
    >
      {/* Connection status debug indicator */}
      <div
        style={{
          position: 'absolute',
          top: 6,
          left: 6,
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: dotColor,
          zIndex: 5,
          pointerEvents: 'none',
          boxShadow: `0 0 4px ${dotColor}`,
        }}
      />

      {/* Game canvas — the RSC mudclient renders here */}
      <GameCanvas
        wsUrl={wsUrl}
        rscUsername={rscUsername}
        rscPassword={rscPassword}
        sessionToken={sessionToken}
        onLoginComplete={onLoginComplete}
        onConnectionChange={setIsConnected}
      />

      {/* Game overlay — betting UI, absolute positioned within container */}
      <GameOverlay />
    </div>
  );
}
