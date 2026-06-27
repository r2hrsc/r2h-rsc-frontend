import GameCanvas from './GameCanvas';

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
  return (
    <div
      style={{
        position: 'relative',
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
        overflow: 'hidden',
        visibility: hidden ? 'hidden' : 'visible',
      }}
    >
      <GameCanvas
        wsUrl={wsUrl}
        rscUsername={rscUsername}
        rscPassword={rscPassword}
        sessionToken={sessionToken}
        onLoginComplete={onLoginComplete}
      />
    </div>
  );
}
