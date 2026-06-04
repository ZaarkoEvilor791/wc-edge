import clsx from 'clsx'

export function LogoMark({ className }: { className?: string }) {
  return (
    <div className={clsx('flex items-center justify-center', className)}>
      <svg viewBox="0 0 32 32" className="h-7 w-7" fill="none" aria-hidden>
        <path d="M10 4h12v10a6 6 0 0 1-12 0V4z" stroke="#00D8CB" strokeWidth="1.75" strokeLinejoin="round" />
        <path d="M10 7H6a4 4 0 0 0 4 4M22 7h4a4 4 0 0 1-4 4" stroke="#00D8CB" strokeWidth="1.75" strokeLinecap="round" />
        <path d="M16 20v4M12 28h8" stroke="#00D8CB" strokeWidth="1.75" strokeLinecap="round" />
      </svg>
    </div>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <div className={clsx('flex items-center gap-2', className)}>
      <LogoMark />
      <span className="text-sm font-bold tracking-tight text-slate-100">
        wc<span className="text-accent">-edge</span>
      </span>
    </div>
  )
}
