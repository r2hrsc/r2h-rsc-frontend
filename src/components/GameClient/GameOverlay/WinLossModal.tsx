interface WinLossModalProps {
  result: { won: boolean; amount: number; betType: string; txSignature: string } | null;
  onClose: () => void;
}

export default function WinLossModal({ result, onClose }: WinLossModalProps) {
  if (!result) return null;

  const { won, amount, betType, txSignature } = result;
  const color = won ? '#14F195' : '#ff4444';
  const title = won ? 'YOU WON' : 'YOU LOST';
  const sign = won ? '+' : '-';
  const message = won ? 'Transaction confirmed. Tokens credited.' : 'Transaction confirmed. Tokens burned.';
  const truncatedTx = `${txSignature.slice(0, 8)}...${txSignature.slice(-8)}`;

  return (
    <div
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        background: 'rgba(10, 10, 10, 0.95)',
        border: `1px solid ${color}`,
        borderRadius: 8,
        padding: '20px 24px',
        pointerEvents: 'auto',
        zIndex: 30,
        textAlign: 'center',
        minWidth: 240,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {/* Title */}
      <span style={{ color, fontSize: 20, fontWeight: 700, letterSpacing: 1 }}>{title}</span>

      {/* Amount */}
      <span style={{ color, fontSize: 28, fontWeight: 700 }}>
        {sign}{amount.toFixed(2)} $R2H
      </span>

      {/* Bet type */}
      <span style={{ color: '#888', fontSize: 11, textTransform: 'uppercase' }}>
        {betType} bet
      </span>

      {/* Message */}
      <span style={{ color: '#e5e5e5', fontSize: 12 }}>{message}</span>

      {/* Tx link */}
      <a
        href={`https://solscan.io/tx/${txSignature}`}
        target="_blank"
        rel="noopener noreferrer"
        style={{ color: '#888', fontSize: 11, textDecoration: 'underline' }}
      >
        {truncatedTx} — View on Explorer
      </a>

      {/* Close button */}
      <button
        onClick={onClose}
        style={{
          background: 'transparent',
          border: `1px solid ${color}`,
          color,
          padding: '8px 0',
          borderRadius: 4,
          fontSize: 12,
          fontWeight: 600,
          cursor: 'pointer',
          marginTop: 4,
        }}
      >
        CLOSE
      </button>
    </div>
  );
}
