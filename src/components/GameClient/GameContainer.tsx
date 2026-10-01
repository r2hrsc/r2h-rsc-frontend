import GameCanvas from './GameCanvas';
import { WorldKey } from '../../lib/worlds';

const GAME_WIDTH = 512;
const GAME_HEIGHT = 345;

interface GameContainerProps {
  wsUrl?: string;
  rscUsername?: string;
  rscPassword?: string;
  onLoginComplete?: () => void;
  showRscBackground?: boolean;
  /** World to load: 1 (default) | 3 | 4 | 5 | 6 | 7 | 'arena' */
  world?: WorldKey;
  scale?: number;
  /** Forwarded to GameCanvas — App-level overlays (MobileKeyboard) share this iframe ref */
  iframeRef?: React.RefObject<HTMLIFrameElement>;
}

export default function GameContainer({ wsUrl, rscUsername, rscPassword, onLoginComplete, showRscBackground, world, scale: passedScale = 1, iframeRef }: GameContainerProps) {
  // Scale is passed from parent (single useGameScale call in App to avoid duplicate state + listeners)
  const scale = passedScale;

  const visualWidth = GAME_WIDTH * scale;
  const visualHeight = GAME_HEIGHT * scale;

  return (
    <div
      style={{
        position: 'relative',
        width: visualWidth,
        height: visualHeight,
        overflow: 'hidden',
        zIndex: 1,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: GAME_WIDTH,
          height: GAME_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
          imageRendering: 'pixelated' as any,
        }}
      >
        <GameCanvas
          wsUrl={wsUrl}
          rscUsername={rscUsername}
          rscPassword={rscPassword}
          world={world}
          onLoginComplete={onLoginComplete}
          showRscBackground={showRscBackground}
          iframeRef={iframeRef}
        />
      </div>
    </div>
  );
}
