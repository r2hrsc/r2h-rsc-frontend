interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
}

const SIZES = { sm: 14, md: 20, lg: 28 };

export default function LoadingSpinner({ size = 'sm' }: LoadingSpinnerProps) {
  const px = SIZES[size];

  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      style={{ animation: 'spin 1s linear infinite' }}
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="#14F195"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="50 20"
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </svg>
  );
}
