/**
 * S07 AIS Validation — shown only if AIS uploaded.
 * Use AIS value → writes to overrides. Keep my value → dismisses.
 */

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { StepProgress, ArrowRightIcon } from '../components/shared'
import { fmtINR } from '../components/review'
import { useAppContext } from '../context/AppContext'
import { crossValidateWithAIS } from '../parsers/aisParser'

export function S07AISValidation() {
  const navigate = useNavigate()
  const { state, dispatch } = useAppContext()
  const { parsed, schedules, aisMismatches, aisMismatchResolutions } = state

  useEffect(() => {
    if (!parsed.aisData || !schedules) return
    const parsedVals = {
      grossSalary: schedules.S?.grossSalary ?? 0,
      tdsDeducted: parsed.form16?.tdsDeducted ?? 0,
      dividendIncome: schedules.OS?.dividendIncome ?? 0,
      fdInterest: state.overrides['OS.fdInterest'] ?? 0,
      rdInterest: state.overrides['OS.rdInterest'] ?? 0,
      savingsInterest: state.overrides['OS.savingsInterest'] ?? 0,
    }
    const mismatches = crossValidateWithAIS(parsedVals, parsed.aisData)
    dispatch({ type: 'SET_AIS_MISMATCHES', mismatches })
  }, [parsed.aisData, schedules])

  function handleContinue() { navigate('/review/bank-accounts') }

  if (!parsed.aisData) {
    return (
      <div><StepProgress />
        <div className="card text-center py-10">
          <p className="text-sm text-ink-500 mb-2">No AIS uploaded.</p>
          <p className="text-xs text-ink-400 mb-4">Download from IT Portal → AIS → Download JSON for cross-validation.</p>
          <button onClick={handleContinue} className="btn-primary">Continue to Bank Accounts <ArrowRightIcon /></button>
        </div>
      </div>
    )
  }

  const matching = aisMismatches.length === 0
  const counts = { info: 0, warn: 0, error: 0 }
  aisMismatches.forEach(m => counts[m.severity]++)

  return (
    <div>
      <StepProgress />
      <div className="mb-4">
        <h1 className="text-xl font-bold text-ink-900">AIS Validation</h1>
        <p className="text-sm text-ink-400 mt-1">Annual Information Statement — AY 2026-27</p>
      </div>

      {/* Summary card */}
      <div className={`card mb-4 ${matching ? 'border-emerald-300 bg-emerald-50' : 'border-amber-200'}`}>
        {matching ? (
          <p className="text-sm font-medium text-emerald-800">✓ All values match your AIS exactly</p>
        ) : (
          <div className="flex gap-4 text-sm">
            {counts.error > 0 && <span className="text-rose-600 font-medium">✗ {counts.error} significant mismatch{counts.error > 1 ? 'es' : ''}</span>}
            {counts.warn  > 0 && <span className="text-amber-600 font-medium">⚠ {counts.warn} difference{counts.warn > 1 ? 's' : ''}</span>}
            {counts.info  > 0 && <span className="text-blue-600 font-medium">ⓘ {counts.info} minor difference{counts.info > 1 ? 's' : ''}</span>}
          </div>
        )}
      </div>

      {/* Mismatch rows */}
      <div className="space-y-3 mb-4">
        {aisMismatches.map(m => {
          const resolved = aisMismatchResolutions[m.field]
          const borderCol = m.severity === 'error' ? 'border-rose-300' : m.severity === 'warn' ? 'border-amber-300' : 'border-blue-200'
          const icon = m.severity === 'error' ? '✗' : m.severity === 'warn' ? '⚠' : 'ⓘ'
          return (
            <div key={m.field} className={`card border-l-4 ${borderCol}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-ink-900">{icon} {m.fieldLabel}</p>
                  <div className="mt-1 text-xs text-ink-600 space-y-0.5">
                    <p>Your value: <span className="font-mono font-medium">{fmtINR(m.parsedValue)}</span></p>
                    <p>AIS value: <span className="font-mono font-medium">{fmtINR(m.aisValue)}</span>
                      <span className="text-ink-400 ml-1">(delta: {fmtINR(m.delta)}, {(m.deltaPct * 100).toFixed(1)}%)</span>
                    </p>
                  </div>
                  <p className="text-xs text-ink-400 mt-1">{m.description}</p>
                </div>
              </div>
              {!resolved ? (
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={() => dispatch({ type: 'SET_AIS_MISMATCH_RESOLUTION', field: m.field, resolution: 'use_ais' })}
                    className="btn-primary text-xs py-1 px-3"
                  >Use AIS value</button>
                  <button
                    onClick={() => dispatch({ type: 'SET_AIS_MISMATCH_RESOLUTION', field: m.field, resolution: 'keep_parsed' })}
                    className="btn-secondary text-xs py-1 px-3"
                  >Keep my value</button>
                </div>
              ) : (
                <p className="mt-2 text-xs text-emerald-700 font-medium">
                  {resolved === 'use_ais' ? '✓ Using AIS value' : '✓ Keeping your value'}
                </p>
              )}
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/review/regime')} className="btn-secondary">← Back to Regime</button>
        <button onClick={handleContinue} className="btn-primary">Continue to Bank Accounts <ArrowRightIcon /></button>
      </div>
    </div>
  )
}
