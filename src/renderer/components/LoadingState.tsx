interface LoadingStateProps {
  message?: string
  size?: 'small' | 'medium' | 'large'
}

const dimensions = {
  small: { spinner: 18, fontSize: 13, padding: '20px 16px' },
  medium: { spinner: 26, fontSize: 14, padding: '32px 20px' },
  large: { spinner: 34, fontSize: 16, padding: '40px 20px' }
} as const

/**
 * Ruhige, neutrale Ladeanzeige für kurze Übergänge.
 */
export default function LoadingState({
  message = 'Lade…',
  size = 'medium'
}: LoadingStateProps) {
  const dim = dimensions[size]

  return (
    <div
      className="loading-state"
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: dim.padding,
        textAlign: 'center'
      }}
    >
      <svg
        className="loading-spinner"
        width={dim.spinner}
        height={dim.spinner}
        viewBox="0 0 32 32"
        aria-hidden="true"
        style={{ animation: 'spin 0.85s linear infinite' }}
      >
        <circle
          cx="16"
          cy="16"
          r="13"
          fill="none"
          stroke="var(--text-dim)"
          strokeWidth="3"
          opacity="0.18"
        />
        <circle
          cx="16"
          cy="16"
          r="13"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray="24 58"
        />
      </svg>

      <div style={{ color: 'var(--text-dim)', fontSize: dim.fontSize }}>
        {message}
      </div>
    </div>
  )
}
