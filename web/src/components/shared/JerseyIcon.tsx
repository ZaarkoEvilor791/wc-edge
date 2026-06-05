import type { KitPattern } from '../../data/teamColors'

interface Props {
  primary: string
  secondary: string
  pattern: KitPattern
  size?: number
  eliminated?: boolean
}

// Jersey silhouette viewBox 0 0 40 44
// Body + sleeves: M13,3 Q20,10 27,3 L34,3 L40,9 L40,20 L33,20 L33,42 L7,42 L7,20 L0,20 L0,9 L6,3 Z
const JERSEY = 'M13,3 Q20,10 27,3 L34,3 L40,9 L40,20 L33,20 L33,42 L7,42 L7,20 L0,20 L0,9 L6,3 Z'
const COLLAR  = 'M13,3 Q20,10 27,3'

// Vertical stripe pattern IDs must be unique per pattern type
const STRIPE_ID = 'jersey-stripes'
const HOOPS_ID  = 'jersey-hoops'
const GRAD_ID   = 'jersey-grad'

export default function JerseyIcon({ primary, secondary, pattern, size = 36, eliminated = false }: Props) {
  const style: React.CSSProperties = eliminated
    ? { opacity: 0.35, filter: 'grayscale(1)', display: 'block' }
    : { display: 'block' }

  return (
    <svg
      width={size}
      height={Math.round(size * 44 / 40)}
      viewBox="0 0 40 44"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={style}
      aria-hidden="true"
    >
      <defs>
        {/* Subtle top highlight for depth */}
        <linearGradient id={GRAD_ID} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="0.18" />
          <stop offset="60%" stopColor="white" stopOpacity="0" />
        </linearGradient>

        {/* Vertical stripes (Argentina, Paraguay) */}
        {pattern === 'stripes' && (
          <pattern id={STRIPE_ID} x="0" y="0" width="6" height="44" patternUnits="userSpaceOnUse">
            <rect width="3" height="44" fill={secondary} fillOpacity="0.35" />
          </pattern>
        )}

        {/* Horizontal hoops (Croatia) */}
        {pattern === 'hoops' && (
          <pattern id={HOOPS_ID} x="0" y="0" width="40" height="8" patternUnits="userSpaceOnUse">
            <rect width="40" height="4" fill={secondary} fillOpacity="0.3" />
          </pattern>
        )}
      </defs>

      {/* Jersey body */}
      <path d={JERSEY} fill={primary} />

      {/* Pattern overlay */}
      {pattern === 'stripes' && (
        <path d={JERSEY} fill={`url(#${STRIPE_ID})`} />
      )}
      {pattern === 'hoops' && (
        <path d={JERSEY} fill={`url(#${HOOPS_ID})`} />
      )}

      {/* Depth gradient overlay */}
      <path d={JERSEY} fill={`url(#${GRAD_ID})`} />

      {/* V-neck collar in secondary color */}
      <path d={COLLAR} stroke={secondary} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}
