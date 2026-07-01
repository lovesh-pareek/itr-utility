import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppContext } from '../context/AppContext'
import { useSessionPersistence, getStorageSize, formatSavedAt } from '../hooks/useSessionPersistence'
import { getAvailableAYs, getDefaultAY, getRules } from '../engine/taxRules'
import { WarningBanner } from '../components/shared'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function S08Settings() {
  const navigate = useNavigate()
  const { state, dispatch } = useAppContext()
  const { clearSession } = useSessionPersistence()
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [showRules, setShowRules] = useState(false)

  const storageBytes = getStorageSize()
  const availableAYs = getAvailableAYs()
  const defaultAY = getDefaultAY()
  const selectedAY = state.selectedAY ?? defaultAY

  function handleAYChange(ay: string) {
    dispatch({ type: 'SET_SELECTED_AY', ay })
  }

  // Load current rules for display
  let currentRules: ReturnType<typeof getRules> | null = null
  try {
    currentRules = getRules(selectedAY, 'new')
  } catch {
    currentRules = null
  }

  const isNonStandardAY = selectedAY !== defaultAY

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
            <span className="text-ink-800">{currentRules?.deadlines.original ?? '31 July 2026'}</span>
          </div>
        </div>
        <button
          onClick={() => setShowClearConfirm(true)}
          className="btn-danger"
        >
          Clear session data
        </button>
      </div>

      {/* Tax Rules / AY Selector */}
      <div className="card mb-4">
        <h2 className="font-display font-semibold text-ink-700 text-sm mb-3 uppercase tracking-wider">
          Tax Rules
        </h2>

        <div className="flex items-center gap-3 mb-3">
          <label className="text-sm text-ink-600 shrink-0">Assessment Year</label>
          <select
            value={selectedAY}
            onChange={e => handleAYChange(e.target.value)}
            className="input-field flex-1"
          >
            {availableAYs.map(ay => (
              <option key={ay} value={ay}>
                AY {ay}{ay === defaultAY ? ' (current)' : ''}
              </option>
            ))}
          </select>
        </div>

        {isNonStandardAY && (
          <div className="mb-3">
            <WarningBanner
              severity="warn"
              message={`Non-standard AY selected (AY ${selectedAY}). Results may not apply to your filing.`}
            />
          </div>
        )}

        {currentRules && (
          <div>
            <button
              onClick={() => setShowRules(!showRules)}
              className="text-sm text-sky-600 hover:text-sky-800 underline"
            >
              {showRules ? 'Hide current rules ↑' : 'View current rules →'}
            </button>

            {showRules && (
              <div className="mt-3 bg-ink-50 rounded-lg border border-ink-100 p-4">
                <p className="text-xs font-mono font-semibold text-ink-600 mb-2">
                  AY {selectedAY} — New Regime slab rates
                </p>
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="text-ink-400">
                      <th className="text-left pb-1">From</th>
                      <th className="text-left pb-1">To</th>
                      <th className="text-right pb-1">Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentRules.slabs.map((slab, i) => (
                      <tr key={i} className="border-t border-ink-100">
                        <td className="py-0.5 text-ink-700">
                          ₹{(slab.from / 100000).toFixed(0)}L
                        </td>
                        <td className="py-0.5 text-ink-700">
                          {slab.to === null ? 'Above' : `₹${(slab.to / 100000).toFixed(0)}L`}
                        </td>
                        <td className="py-0.5 text-right text-ink-700">
                          {slab.rate === 0 ? 'Nil' : `${(slab.rate * 100).toFixed(0)}%`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="mt-3 pt-3 border-t border-ink-100 grid grid-cols-2 gap-2 text-xs">
                  <div className="text-ink-500">STCG (Sec 111A)</div>
                  <div className="text-ink-700 text-right font-mono">{(currentRules.specialRates.stcg_111A * 100).toFixed(0)}%</div>
                  <div className="text-ink-500">LTCG (Sec 112A)</div>
                  <div className="text-ink-700 text-right font-mono">{(currentRules.specialRates.ltcg_112A * 100).toFixed(1)}%</div>
                  <div className="text-ink-500">LTCG exemption</div>
                  <div className="text-ink-700 text-right font-mono">₹{(currentRules.specialRates.ltcg_112A_exemption / 100000).toFixed(2).replace('.00', '')}L</div>
                  <div className="text-ink-500">Health & Ed cess</div>
                  <div className="text-ink-700 text-right font-mono">{(currentRules.cess * 100).toFixed(0)}%</div>
                  <div className="text-ink-500">Filing deadline</div>
                  <div className="text-ink-700 text-right font-mono">{currentRules.deadlines.original}</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ITR Form Override */}
      <div className="card mb-4">
        <h2 className="font-display font-semibold text-ink-700 text-sm mb-3 uppercase tracking-wider">
          ITR Form
        </h2>
        <div className="flex items-center justify-between text-sm mb-3">
          <span className="text-ink-500">Auto-detected</span>
          <span className="font-mono font-medium text-ink-800">{state.detectedITRForm ?? '—'}</span>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm text-ink-600 shrink-0">Filing as</label>
          <select
            value={state.selectedITRForm}
            onChange={e => dispatch({ type: 'SET_SELECTED_ITR_FORM', form: e.target.value as any })}
            className="input-field flex-1"
          >
            {(['ITR1', 'ITR2', 'ITR3', 'ITR4'] as const).map(f => (
              <option key={f} value={f}>{f}{f === state.detectedITRForm ? ' (auto-detected)' : ''}</option>
            ))}
          </select>
        </div>
        {state.detectedITRForm && state.selectedITRForm !== state.detectedITRForm && (
          <div className="mt-3">
            <WarningBanner
              severity="warn"
              message={`You have overridden the auto-detected form (${state.detectedITRForm}). Make sure ${state.selectedITRForm} is correct for your income profile before filing.`}
            />
          </div>
        )}
        <p className="text-xs text-ink-400 mt-2">Advanced — use with care. Most filers should use the auto-detected form.</p>
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
          <p>ITR Filing Utility <span className="font-mono text-ink-400">v2.0</span></p>
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
