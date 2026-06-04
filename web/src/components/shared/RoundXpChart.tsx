const ROUND_LABELS = ['R1', 'R2', 'R3', 'R32', 'R16', 'QF', 'SF', 'F']
const W = 240
const H = 64
const BAR_W = 22
const GAP = 8
const LABEL_H = 14

interface Props {
  data: { round: number; xp: number }[]
}

export default function RoundXpChart({ data }: Props) {
  const maxXp = Math.max(...data.map((d) => d.xp), 1)
  const barAreaH = H - LABEL_H

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: '80px' }}>
      {data.map((d, i) => {
        const barH = Math.max(2, (d.xp / maxXp) * (barAreaH - 16))
        const x = i * (BAR_W + GAP) + GAP / 2
        const y = barAreaH - barH - 14
        const isKnockout = d.round > 3
        const opacity = isKnockout ? 0.5 + ((d.round - 4) / 4) * 0.5 : 0.65

        return (
          <g key={d.round}>
            <rect
              x={x}
              y={y + 14}
              width={BAR_W}
              height={barH}
              rx="2"
              fill={isKnockout ? '#DC2430' : '#C8A84C'}
              fillOpacity={opacity}
            />
            <text
              x={x + BAR_W / 2}
              y={y + 11}
              textAnchor="middle"
              fontSize="7"
              fill="#94B3CA"
            >
              {d.xp.toFixed(1)}
            </text>
            <text
              x={x + BAR_W / 2}
              y={H - 2}
              textAnchor="middle"
              fontSize="7"
              fill="#6B8EA8"
            >
              {ROUND_LABELS[i] ?? `R${d.round}`}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
