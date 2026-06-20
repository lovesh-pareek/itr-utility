import type { BrokerData, ScheduleBP, ScheduleCYLA, ScheduleCFL } from '../types'

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
 * Rules:
 *   - Unabsorbed speculative (intraday) loss: carry forward up to 4 AYs
 *   - Unabsorbed short-term capital loss: carry forward up to 8 AYs
 *   - Unabsorbed long-term capital loss: carry forward up to 8 AYs
 *
 * Carry forward is ONLY valid if ITR is filed before 31 July 2026.
 */
export function computeScheduleCFL(cylaOutput: ScheduleCYLA): ScheduleCFL {
  return {
    intradayLossCarryForward: cylaOutput.setOffs.remainingIntradayLoss,
    stclCarryForward:         cylaOutput.setOffs.remainingSTCL,
    ltclCarryForward:         cylaOutput.setOffs.remainingLTCL,
    targetAY:                 '2027-28',
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
