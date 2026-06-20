import { useEffect, useCallback } from 'react'
import { useAppContext } from '../context/AppContext'
import { runEngine } from '../engine'

/**
 * Wires the tax engine to AppContext.
 * Re-runs whenever parsed data or overrides change.
 * Dispatches SET_SCHEDULES, SET_TAX, SET_WARNINGS back into context.
 */
export function useEngine() {
  const { state, dispatch } = useAppContext()
  const { parsed, overrides, aiCallLog, parseStatus } = state

  const recompute = useCallback(() => {
    const { broker, form16, mfStatement } = parsed

    // Need at least one document parsed to run
    if (!broker && !form16 && !mfStatement) return

    const tdsDeducted   = form16?.tdsDeducted   ?? 0
    const advanceTaxPaid = overrides['TAX.advanceTaxPaid'] ?? 0

    const { schedules, tax, warnings } = runEngine(
      broker,
      form16,
      mfStatement,
      overrides,
      tdsDeducted,
      advanceTaxPaid,
      { parsed, parseStatus, aiCallLog }
    )

    dispatch({ type: 'SET_SCHEDULES', schedules })
    dispatch({ type: 'SET_TAX', tax })
    dispatch({ type: 'SET_WARNINGS', warnings })
  }, [parsed, overrides, aiCallLog, parseStatus, dispatch])

  // Recompute on any dependency change
  useEffect(() => {
    recompute()
  }, [recompute])

  return { recompute }
}
