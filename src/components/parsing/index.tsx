import { useState } from 'react'
import type { ParseState, AICallEntry } from '../../types'
import { CheckIcon, ErrorIcon, InfoIcon } from '../shared'
import { Spinner } from '../upload'

// ─── ParseProgressCard ────────────────────────────────────────────────────────

interface Milestone {
  label: string
  done: boolean
}

interface ParseProgressCardProps {
  title: string
  status: ParseState
  milestones: Milestone[]
  errorMsg?: string
  onRetry?: () => void
}

export function ParseProgressCard({
  title,
  status,
  milestones,
  errorMsg,
  onRetry,
}: ParseProgressCardProps) {
  const doneMilestones = milestones.filter(m => m.done).length
  const progress = milestones.length === 0
    ? (status === 'done' ? 100 : 0)
    : Math.round((doneMilestones / milestones.length) * 100)

  const isActive = status === 'parsing' || status === 'needs-ai'
  const isDone = status === 'done'
  const isError = status === 'error'
  const isIdle = status === 'idle'

  return (
    <div className={`card transition-all ${isError ? 'border-rose-200' : isDone ? 'border-emerald-200 fade-in' : ''}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {isDone ? (
            <CheckIcon className="text-emerald-500" />
          ) : isError ? (
            <ErrorIcon className="text-rose-500" />
          ) : status === 'needs-ai' ? (
            <Spinner /> 
          ) : isActive ? (
            <div className="w-4 h-4 rounded-full border-2 border-ink-400 border-t-transparent animate-spin" />
          ) : (
            <div className="w-4 h-4 rounded-full border-2 border-ink-200" />
          )}
          <p className="font-medium text-ink-900">{title}</p>
        </div>
        <span className={`text-xs font-mono ${
          isDone ? 'text-emerald-600' :
          isError ? 'text-rose-600' :
          isActive ? 'text-ink-500' : 'text-ink-300'
        }`}>
          {isDone ? 'Complete' : isError ? 'Error' : status === 'needs-ai' ? '⚡ AI assist…' : isActive ? 'Parsing locally…' : isIdle ? 'Waiting' : status}
        </span>
      </div>

      {/* Progress bar */}
      {!isIdle && !isError && (
        <div className="h-1.5 bg-ink-100 rounded-full overflow-hidden mb-3">
          <div
            className={`h-full rounded-full transition-all duration-500 ${isDone ? 'bg-emerald-400' : 'bg-ink-400'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Milestones */}
      {milestones.length > 0 && (isActive || isDone) && (
        <div className="flex flex-wrap gap-2">
          {milestones.map((m, i) => (
            <span
              key={i}
              className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${
                m.done
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-ink-50 border-ink-200 text-ink-400'
              }`}
            >
              {m.done && <span className="check-pop inline-flex"><CheckIcon className="text-emerald-500" /></span>}
              {m.label}
            </span>
          ))}
        </div>
      )}

      {/* Error */}
      {isError && errorMsg && (
        <div className="mt-2">
          <p className="text-sm text-rose-600 mb-2">{errorMsg}</p>
          {onRetry && (
            <button onClick={onRetry} className="btn-secondary text-sm">
              Fix and retry
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ─── AICallBannerParsing ──────────────────────────────────────────────────────

interface AICallBannerParsingProps {
  entries: AICallEntry[]
}

export function AICallBannerParsing({ entries }: AICallBannerParsingProps) {
  const [modalEntry, setModalEntry] = useState<AICallEntry | null>(null)

  if (entries.length === 0) return null

  const latest = entries[entries.length - 1]

  return (
    <>
      <div className="banner-info">
        <InfoIcon className="text-sky-500 shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">AI assist used ({entries.length} call{entries.length > 1 ? 's' : ''})</p>
          <p className="mt-0.5 text-sm">
            Only document structure was sent — no amounts, names, or personal data.{' '}
            <button
              onClick={() => setModalEntry(latest)}
              className="underline hover:no-underline font-medium"
            >
              View what was sent →
            </button>
          </p>
        </div>
      </div>

      {modalEntry && (
        <AIPayloadModal entry={modalEntry} onClose={() => setModalEntry(null)} />
      )}
    </>
  )
}

// ─── AIPayloadModal ───────────────────────────────────────────────────────────

interface AIPayloadModalProps {
  entry: AICallEntry
  onClose: () => void
}

export function AIPayloadModal({ entry, onClose }: AIPayloadModalProps) {
  return (
    <div className="fixed inset-0 bg-ink-900/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl border border-[var(--color-border)] max-w-lg w-full shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
          <h3 className="font-display font-semibold text-ink-900">
            AI Payload — {entry.callType}
          </h3>
          <button onClick={onClose} className="btn-ghost p-1">✕</button>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <p className="field-label mb-1">What was sent</p>
            <p className="text-sm text-ink-600">{entry.payloadSummary}</p>
          </div>

          <div>
            <p className="field-label mb-1">Trigger reason</p>
            <p className="text-sm text-ink-600">{entry.triggerReason}</p>
          </div>

          <div className="bg-ink-50 rounded-lg p-3 border border-ink-100">
            <p className="field-label mb-2 text-ink-400">What was NOT sent</p>
            <ul className="text-xs text-ink-500 space-y-1">
              <li>✗ No salary amounts or TDS figures</li>
              <li>✗ No trade values, prices, or P&L numbers</li>
              <li>✗ No PAN, TAN, or Aadhaar</li>
              <li>✗ No employer name or employee name</li>
              <li>✗ No document contents — only structural labels</li>
            </ul>
          </div>
        </div>

        <div className="p-4 border-t border-[var(--color-border)]">
          <button onClick={onClose} className="btn-secondary w-full">Close</button>
        </div>
      </div>
    </div>
  )
}
