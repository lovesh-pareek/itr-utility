import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppContext } from '../context/AppContext'
import { loadPersistedSession, getDaysToDeadline, formatSavedAt } from '../hooks/useSessionPersistence'
import type { PersistedSession } from '../types'
import { ArrowRightIcon, CheckIcon } from '../components/shared'

export default function S01Landing() {
  const navigate = useNavigate()
  const { dispatch } = useAppContext()
  const [savedSession, setSavedSession] = useState<PersistedSession | null>(null)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const daysLeft = getDaysToDeadline()

  useEffect(() => {
    const session = loadPersistedSession()
    setSavedSession(session)
  }, [])

  function handleResume() {
    if (!savedSession) return
    dispatch({ type: 'RESTORE_SESSION', state: savedSession })
    // Navigate to last saved step
    const stepRoutes: Record<string, string> = {
      upload: '/upload',
      parsing: '/upload',
      review: '/review',
      summary: '/summary',
      export: '/export',
    }
    navigate(stepRoutes[savedSession.step] ?? '/upload')
  }

  function handleStartFresh() {
    if (savedSession) {
      setShowClearConfirm(true)
    } else {
      navigate('/upload')
    }
  }

  function confirmStartFresh() {
    localStorage.removeItem('itr_utility_fy2526_session')
    localStorage.removeItem('itr_utility_ai_log')
    dispatch({ type: 'CLEAR_SESSION' })
    setSavedSession(null)
    setShowClearConfirm(false)
    navigate('/upload')
  }

  const fileChecks = savedSession
    ? [
        { label: 'Broker P&L', done: !!savedSession.uploadedFilesMeta.brokerPL, required: true },
        { label: 'Form 16', done: !!savedSession.uploadedFilesMeta.form16, required: true },
        { label: 'MF Statement', done: !!savedSession.uploadedFilesMeta.mfStatement, required: false },
      ]
    : []

  return (
    <div className="max-w-xl mx-auto">
      {/* Deadline badge */}
      {daysLeft !== null && (
        <div className="mb-5 inline-flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium px-3 py-1.5 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
          {daysLeft} days until filing deadline — 31 July 2026
        </div>
      )}

      {/* Heading */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-ink-900 mb-2">
          ITR-3 Filing Utility
        </h1>
        <p className="text-ink-500">
          Prepare your ITR-3 data for FY 2025-26 (AY 2026-27).
          All processing happens in your browser — nothing is uploaded to any server.
        </p>
      </div>

      {/* Session resume card */}
      {savedSession ? (
        <div className="card mb-5">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-8 h-8 rounded-lg bg-ink-100 flex items-center justify-center shrink-0">
              <span className="text-sm">📄</span>
            </div>
            <div>
              <p className="font-medium text-ink-900">Session found</p>
              <p className="text-sm text-ink-400">
                Saved {formatSavedAt(savedSession.savedAt)}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-5">
            {fileChecks.map(({ label, done, required }) => (
              <span
                key={label}
                className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${
                  done
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                    : required
                    ? 'bg-ink-50 border-ink-200 text-ink-400'
                    : 'bg-ink-50 border-ink-100 text-ink-300'
                }`}
              >
                {done ? <CheckIcon className="text-emerald-500" /> : null}
                {label}
                {!done && !required && ' (optional)'}
                {!done && required && ' (missing)'}
              </span>
            ))}
          </div>

          <div className="flex gap-3">
            <button onClick={handleResume} className="btn-primary">
              Resume session
              <ArrowRightIcon />
            </button>
            <button onClick={handleStartFresh} className="btn-secondary">
              Start fresh
            </button>
          </div>
        </div>
      ) : (
        <div className="mb-6">
          <button onClick={handleStartFresh} className="btn-primary text-base px-6 py-3">
            Get started
            <ArrowRightIcon />
          </button>
        </div>
      )}

      {/* What you'll need */}
      <div className="card">
        <h2 className="font-display font-semibold text-ink-700 text-sm mb-3">
          What you'll need
        </h2>
        <div className="space-y-3">
          {[
            {
              icon: '📊',
              label: 'Broker Tax P&L',
              desc: 'Zerodha, Groww, or Upstox — Excel (.xlsx)',
              hint: 'Console → Reports → Tax P&L → FY 2025-26',
            },
            {
              icon: '📋',
              label: 'Form 16',
              desc: 'From your employer — text-based PDF only',
              hint: 'Must cover AY 2026-27 — not a scanned PDF',
            },
            {
              icon: '📈',
              label: 'MF Capital Gains Statement',
              desc: 'CAMS or KFintech — JSON preferred · Optional',
              hint: 'Only needed if you redeemed MF units in FY 2025-26',
            },
          ].map(item => (
            <div key={item.label} className="flex gap-3">
              <span className="text-lg shrink-0">{item.icon}</span>
              <div>
                <p className="text-sm font-medium text-ink-800">{item.label}</p>
                <p className="text-xs text-ink-500">{item.desc}</p>
                <p className="text-xs text-ink-400 font-mono mt-0.5">{item.hint}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
          <p className="text-xs text-ink-400">
            ⚡ No server involved — your documents are parsed locally in Chrome/Firefox/Safari.
            Nothing is transmitted anywhere.
          </p>
        </div>
      </div>

      {/* Confirmation dialog */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-ink-900/40 flex items-center justify-center z-50 p-4">
          <div className="card max-w-sm w-full">
            <h3 className="font-display font-semibold text-ink-900 mb-2">
              Clear saved session?
            </h3>
            <p className="text-sm text-ink-500 mb-4">
              This will delete all saved data including parsed values, manual edits, and the AI call log.
              This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={confirmStartFresh} className="btn-danger">
                Yes, start fresh
              </button>
              <button
                onClick={() => setShowClearConfirm(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
