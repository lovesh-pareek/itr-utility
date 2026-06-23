import type { BrokerData, ScheduleBP, ScheduleCYLA, ScheduleCFL } from '../types'
import { getRules } from './taxRules'

/**
 * Compute Schedule BP — Intraday speculative business income.
 *
 * Turnover for intraday equity = absolute sum of all trade P&Ls (used for audit threshold check).
 * Net P&L = actual net speculative profit or loss.
 *
 * Note: F&O is NOT computed in v1.0 — flagged as a warning if detected.
 */
export function computeScheduleBP(
  broker: BrokerData | null,
  overrides: Record<string, number>
): ScheduleBP {
  const speculativeTurnover = overrides['BP.speculativeTurnover'] ?? broker?.equityIntraday.turnover ?? 0
  const netSpeculativePnL   = overrides['BP.netSpeculativePnL']   ?? broker?.equityIntraday.netPnL   ?? 0

  // Set-off and carry forward are computed downstream in CYLA / CFL
  return {
    speculativeTurnover,
    netSpeculativePnL,
    setOffThisYear: 0,    // populated after CYLA
    carryForward: 0,      // populated after CFL
  }
}

/**
 * Compute Schedule CFL — Carry Forward Losses from current year.
 *
 * Rules (from config carryForward limits):
 *   - Unabsorbed speculative (intraday) loss: carry forward up to speculativeLoss AYs
 *   - Unabsorbed short-term capital loss: carry forward up to capitalLoss AYs
 *   - Unabsorbed long-term capital loss: carry forward up to capitalLoss AYs
 *
 * Carry forward is ONLY valid if ITR is filed before the original deadline.
 */
export function computeScheduleCFL(
  cylaOutput: ScheduleCYLA,
  ay = '2026-27'
): ScheduleCFL {
  const rules = getRules(ay, 'new')  // carryForward limits are regime-independent
  const deadlines = rules.deadlines

  return {
    intradayLossCarryForward: cylaOutput.setOffs.remainingIntradayLoss,
    stclCarryForward:         cylaOutput.setOffs.remainingSTCL,
    ltclCarryForward:         cylaOutput.setOffs.remainingLTCL,
    targetAY:                 getTargetAY(ay),
    deadlineForCFL:           deadlines.original,
  }
}

/**
 * Re-attach CFL-derived carry forward values back into ScheduleBP.
 * Called after CFL is computed so BP reflects the final set-off and carry forward.
 */
export function finaliseBP(bp: ScheduleBP, cfl: ScheduleCFL): ScheduleBP {
  return {
    ...bp,
    setOffThisYear: 0,   // intraday loss cannot be set off against any other head
    carryForward: cfl.intradayLossCarryForward,
  }
}

/**
 * Get the target AY for carry forward (current AY + 1).
 * e.g. "2026-27" → "2027-28"
 */
function getTargetAY(ay: string): string {
  const match = ay.match(/^(\d{4})-(\d{2,4})$/)
  if (!match) return ay
  const startYear = parseInt(match[1])
  const endShort = parseInt(match[2])
  const endYear = endShort < 100 ? Math.floor(startYear / 100) * 100 + endShort : endShort
  return `${startYear + 1}-${String(endYear + 1).slice(-2)}`
}
