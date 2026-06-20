import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppContext } from '../context/AppContext'
import { useSessionPersistence, getStorageSize, formatSavedAt } from '../hooks/useSessionPersistence'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function S08Settings() {
  const navigate = useNavigate()
  const { state } = useAppContext()
  const { clearSession } = useSessionPersistence()
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  const storageBytes = getStorageSize()

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink-900 mb-6">Settings</h1>

      {/* Session */}
      <div className="card mb-4">
        <h2 className="font-display font-semibold text-ink-700 text-sm mb-3 uppercase tracking-wider">
          Session
        </h2>
        <div className="space-y-2 text-sm mb-4">
          <div className="flex justify-between">
            <span className="text-ink-500">Last saved</span>
            <span className="text-ink-800 font-medium">
              {state.savedAt ? formatSavedAt(state.savedAt) : 'Not saved yet'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-500">Storage used</span>
            <span className="text-ink-800 font-mono">{formatBytes(storageBytes)} (localStorage)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-500">Auto-clear after</span>
            <span className="text-ink-800">31 July 2026</span>
          </div>
        </div>
        <button
          onClick={() => setShowClearConfirm(true)}
          className="btn-danger"
        >
          Clear session data
        </button>
      </div>

      {/* AI usage */}
      <div className="card mb-4">
        <h2 className="font-display font-semibold text-ink-700 text-sm mb-3 uppercase tracking-wider">
          AI Usage
        </h2>
        <div className="flex justify-between items-center text-sm mb-3">
          <span className="text-ink-500">AI calls this session</span>
          <span className="font-mono font-medium text-ink-800">{state.aiCallLog.length}</span>
        </div>
        <button
          onClick={() => navigate('/settings/ai-log')}
          className="btn-secondary text-sm"
        >
          View AI call log →
        </button>
      </div>

      {/* About */}
      <div className="card">
        <h2 className="font-display font-semibold text-ink-700 text-sm mb-3 uppercase tracking-wider">
          About
        </h2>
        <div className="space-y-1.5 text-sm text-ink-600">
          <p>ITR Filing Utility <span className="font-mono text-ink-400">v1.0</span></p>
          <p>For FY 2025-26 (AY 2026-27)</p>
          <p>All processing is client-side.</p>
          <p>No financial data is stored on any server.</p>
          <p className="text-ink-400 text-xs mt-3 font-mono">
            Session ID: {state.sessionId.slice(0, 8)}…
          </p>
        </div>
      </div>

      {/* Confirm dialog */}
      {showClearConfirm && (
        <div className="fixed inset-0 bg-ink-900/40 flex items-center justify-center z-50 p-4">
          <div className="card max-w-sm w-full">
            <h3 className="font-display font-semibold text-ink-900 mb-2">
              Clear all session data?
            </h3>
            <p className="text-sm text-ink-500 mb-4">
              This will permanently delete all parsed data, manual edits, and the AI call log from this browser.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  clearSession()
                  setShowClearConfirm(false)
                  navigate('/')
                }}
                className="btn-danger"
              >
                Clear everything
              </button>
              <button onClick={() => setShowClearConfirm(false)} className="btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
