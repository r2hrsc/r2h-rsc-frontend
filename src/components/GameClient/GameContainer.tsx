import GameCanvas from './GameCanvas';

const GAME_WIDTH = 512;
const GAME_HEIGHT = 345;

interface GameContainerProps {
  wsUrl?: string;
  rscUsername?: string;
  rscPassword?: string;
  onLoginComplete?: () => void;
  showRscBackground?: boolean;
  /** 'arena' = PVP Arena realm; default = main world */
  realm?: 'main' | 'arena';
  scale?: number;
  /** Forwarded to GameCanvas — App-level overlays (MobileKeyboard) share this iframe ref */
  iframeRef?: React.RefObject<HTMLIFrameElement>;
}

export default function GameContainer({ wsUrl, rscUsername, rscPassword, onLoginComplete, showRscBackground, realm, scale: passedScale = 1, iframeRef }: GameContainerProps) {
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
          realm={realm}
          onLoginComplete={onLoginComplete}
          showRscBackground={showRscBackground}
          iframeRef={iframeRef}
        />
      </div>
    </div>
  );
}
