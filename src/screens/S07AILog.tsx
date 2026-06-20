import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppContext, useAppDispatch } from '../context/AppContext'
import { useAILog } from '../hooks/useSessionPersistence'
import { ThumbsUpIcon, ThumbsDownIcon } from '../components/shared'
import { AIPayloadModal } from '../components/parsing'

export default function S07AILog() {
  const navigate = useNavigate()
  const { state } = useAppContext()
  const { setAILogUseful } = useAppDispatch()
  const { exportLog } = useAILog()

  const log = state.aiCallLog
  const [modalEntry, setModalEntry] = useState<typeof log[0] | null>(null)

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/settings')} className="btn-ghost text-sm">
          ← Settings
        </button>
        <h1 className="text-2xl font-bold text-ink-900">AI Call Log</h1>
      </div>

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-ink-500">
          Total AI calls this session:{' '}
          <span className="font-mono font-medium text-ink-800">{log.length}</span>
        </p>
        {log.length > 0 && (
          <button onClick={exportLog} className="btn-secondary text-sm">
            Export log as JSON
          </button>
        )}
      </div>

      {log.length === 0 ? (
        <div className="card text-center py-10">
          <p className="text-ink-500 font-medium mb-1">No AI calls were made this session.</p>
          <p className="text-sm text-ink-400">All parsing was handled locally. 🎉</p>
        </div>
      ) : (
        <div className="space-y-4">
          {log.map((entry, i) => (
            <div key={entry.callId} className="card">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="text-xs font-mono text-ink-400">Call #{i + 1}</span>
                  <span className="mx-2 text-ink-200">·</span>
                  <span className="text-xs text-ink-400">
                    {new Date(entry.timestamp).toLocaleString('en-IN')}
                  </span>
                </div>
                <span className="text-xs font-mono bg-sky-50 border border-sky-200 text-sky-700 px-2 py-0.5 rounded-full">
                  {entry.callType}
                </span>
              </div>

              <div className="space-y-2 text-sm mb-3">
                <div>
                  <p className="field-label mb-0.5">Trigger reason</p>
                  <p className="text-ink-700">{entry.triggerReason}</p>
                </div>
                <div>
                  <p className="field-label mb-0.5">What was sent</p>
                  <p className="text-ink-600">{entry.payloadSummary}</p>
                  <details className="mt-2">
                    <summary className="text-xs text-sky-600 hover:text-sky-800 cursor-pointer underline">
                      View anonymised payload →
                    </summary>
                    <pre className="mt-2 text-xs bg-ink-50 border border-ink-200 rounded-lg p-3 overflow-x-auto font-mono text-ink-600 whitespace-pre-wrap">
{JSON.stringify({ type: entry.callType, summary: entry.payloadSummary, note: "No financial values or PII were included" }, null, 2)}
                    </pre>
                  </details>
                </div>
                <div>
                  <p className="field-label mb-0.5">AI result</p>
                  <p className="text-ink-600">{entry.responseSummary}</p>
                </div>
                {entry.ruleGap && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="field-label text-amber-600 mb-0.5">Rule gap (developer action)</p>
                    <p className="text-amber-800 text-xs font-mono">{entry.ruleGap}</p>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 pt-3 border-t border-[var(--color-border)]">
                <span className="text-xs text-ink-400">Was this helpful?</span>
                <button
                  onClick={() => setAILogUseful(entry.callId, true)}
                  className={`p-1.5 rounded transition-colors ${
                    entry.wasUseful === true
                      ? 'bg-emerald-100 text-emerald-600'
                      : 'text-ink-400 hover:text-emerald-600 hover:bg-emerald-50'
                  }`}
                >
                  <ThumbsUpIcon />
                </button>
                <button
                  onClick={() => setAILogUseful(entry.callId, false)}
                  className={`p-1.5 rounded transition-colors ${
                    entry.wasUseful === false
                      ? 'bg-rose-100 text-rose-600'
                      : 'text-ink-400 hover:text-rose-600 hover:bg-rose-50'
                  }`}
                >
                  <ThumbsDownIcon />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {modalEntry && (
        <AIPayloadModal entry={modalEntry} onClose={() => setModalEntry(null)} />
      )}
    </div>
  )
}
