interface Props {
  position: string
  onClick: () => void
}

export default function EmptySlotCard({ position, onClick }: Props) {
  return (
    <button
      onClick={onClick}
      className="relative flex w-[72px] flex-col items-center justify-center rounded-lg border border-dashed border-slate-600 bg-transparent px-1 py-3 text-center transition-colors hover:border-slate-400 hover:bg-slate-800/40"
      style={{ minHeight: '72px' }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-slate-600">
        <line x1="8" y1="2" x2="8" y2="14" />
        <line x1="2" y1="8" x2="14" y2="8" />
      </svg>
      <span className="mt-1 text-[10px] text-slate-500">{position}</span>
    </button>
  )
}
