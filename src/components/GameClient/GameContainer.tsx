import { useGameScale } from '../../hooks/useGameScale';
import GameCanvas from './GameCanvas';

const GAME_WIDTH = 512;
const GAME_HEIGHT = 345;

interface GameContainerProps {
  wsUrl?: string;
  rscUsername?: string;
  rscPassword?: string;
  onLoginComplete?: () => void;
  showRscBackground?: boolean;
}

export default function GameContainer({ wsUrl, rscUsername, rscPassword, onLoginComplete, showRscBackground }: GameContainerProps) {
  const scale = useGameScale();

  return (
    <div
      style={{
        position: 'relative',
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
        overflow: 'hidden',
        transform: `scale(${scale})`,
        transformOrigin: 'center center',
        imageRendering: 'pixelated' as any,
      }}
    >
      <GameCanvas
        wsUrl={wsUrl}
        rscUsername={rscUsername}
        rscPassword={rscPassword}
        onLoginComplete={onLoginComplete}
        showRscBackground={showRscBackground}
      />
    </div>
  );
}
