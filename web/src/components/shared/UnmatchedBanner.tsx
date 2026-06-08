import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'

interface Props {
  showTransferLink?: boolean
}

export default function UnmatchedBanner({ showTransferLink }: Props) {
  const navigate = useNavigate()
  const unmatchedNames = useAppStore((s) => s.unmatchedNames)
  const clearUnmatchedNames = useAppStore((s) => s.clearUnmatchedNames)

  if (!unmatchedNames || unmatchedNames.length === 0) return null

  const displayed = unmatchedNames.slice(0, 3)
  const overflow = unmatchedNames.length - displayed.length

  return (
    <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-amber-700/40 bg-amber-900/10 px-3 py-2.5">
      <svg
        width="14" height="14" viewBox="0 0 14 14" fill="none"
        stroke="currentColor" strokeWidth="1.5"
        className="mt-0.5 shrink-0 text-amber-500"
      >
        <path d="M7 1L13 12H1L7 1z" strokeLinejoin="round" />
        <path d="M7 5.5v3M7 10v.5" strokeLinecap="round" />
      </svg>

      <div className="min-w-0 flex-1 text-xs">
        <p className="font-semibold text-amber-400">
          {unmatchedNames.length} player{unmatchedNames.length > 1 ? 's' : ''} weren't recognised from your screenshot
        </p>
        <p className="mt-0.5 text-amber-600/80">
          {displayed.join(', ')}{overflow > 0 ? ` +${overflow} more` : ''} — suggested picks were used for {unmatchedNames.length > 1 ? 'those slots' : 'that slot'}.
          {showTransferLink && (
            <>
              {' '}
              <button
                onClick={() => navigate('/transfers')}
                className="text-amber-400 underline underline-offset-2 hover:text-amber-300"
              >
                Go to Transfers →
              </button>
            </>
          )}
        </p>
      </div>

      <button
        onClick={clearUnmatchedNames}
        aria-label="Dismiss"
        className="ml-1 shrink-0 text-amber-600 hover:text-amber-400"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M1 1l10 10M11 1L1 11" />
        </svg>
      </button>
    </div>
  )
}
