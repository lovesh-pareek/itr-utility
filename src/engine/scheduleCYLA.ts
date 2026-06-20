import type { ScheduleBP, ScheduleCG, ScheduleS, ScheduleOS, ScheduleCYLA } from '../types'

/**
 * Compute Schedule CYLA — Current Year Loss Adjustment.
 *
 * Rules (ITR-3, New Regime):
 *   1. Intraday (speculative) loss → ONLY against intraday (speculative) profit.
 *      Cannot be set off against salary, capital gains, or other sources.
 *   2. STCL → against STCG first, then against LTCG.
 *      (Intra-CG set-off already done in computeScheduleCG; CYLA handles any residual
 *       that crosses into other heads — for STCL/LTCL that's not applicable cross-head,
 *       so this mainly records what's remaining after intra-CG set-off.)
 *   3. LTCL → ONLY against LTCG. Cannot offset anything else.
 *   4. Salary income cannot be reduced by any capital or intraday losses.
 *
 * NOTE: Debt MF gains are slab-rate income — they add to slab-taxable income
 * alongside salary. No special treatment in CYLA.
 */
export function computeScheduleCYLA(
  scheduleS: ScheduleS,
  scheduleBP: ScheduleBP,
  scheduleCG: ScheduleCG,
  scheduleOS: ScheduleOS
): ScheduleCYLA {
  // ── Intraday (speculative) set-off ────────────────────────────────────────
  // Loss can only offset speculative profit — and there is no speculative profit
  // from other sources, so unabsorbed intraday loss carries forward (handled in CFL).
  const intradayPnL = scheduleBP.netSpeculativePnL
  let intradayProfitAbsorbed = 0
  let remainingIntradayLoss = 0

  if (intradayPnL >= 0) {
    // Profit — no set-off needed
    intradayProfitAbsorbed = 0
    remainingIntradayLoss = 0
  } else {
    // Loss — nothing to set off against (salary/CG/OS are ring-fenced)
    intradayProfitAbsorbed = 0
    remainingIntradayLoss = Math.abs(intradayPnL)
  }

  // ── Capital gains set-off ─────────────────────────────────────────────────
  // Intra-CG set-off was already done in computeScheduleCG.
  // Any remaining STCL or LTCL that could not be absorbed within CG
  // cannot cross into salary or other sources — carry forward in CFL.
  //
  // scheduleCG.netSTCG and netLTCG are post-intra-CG-set-off values.
  // We record remaining losses for CFL.

  // The intra-CG set-off may have left residual losses — compute them:
  const intracgSTCLUsed = Math.min(scheduleCG.stcl, scheduleCG.grossSTCG)
  const residualSTCLAfterSTCG = Math.max(0, scheduleCG.stcl - scheduleCG.grossSTCG)
  const intracgSTCLAgainstLTCG = Math.min(residualSTCLAfterSTCG, scheduleCG.grossLTCG)
  const remainingSTCL = Math.max(0, residualSTCLAfterSTCG - intracgSTCLAgainstLTCG)

  const ltclUsed = Math.min(
    scheduleCG.ltcl,
    Math.max(0, scheduleCG.grossLTCG - residualSTCLAfterSTCG)
  )
  const remainingLTCL = Math.max(0, scheduleCG.ltcl - ltclUsed)

  const stcgAbsorbed = intracgSTCLUsed + intracgSTCLAgainstLTCG
  const ltcgAbsorbed = ltclUsed

  // ── Net income per head after CYLA ────────────────────────────────────────
  // Salary is never reduced by losses from other heads
  const netSalaryIncome = scheduleS.netTaxableSalary

  // Intraday: if profit, it's slab income; if loss, it's zero (loss carried forward)
  const netIntradayIncome = Math.max(0, intradayPnL)

  // CG: use the intra-CG-adjusted values from scheduleCG
  const netSTCG = scheduleCG.netSTCG
  const netLTCG = scheduleCG.netLTCG

  // Other sources: not reduced by CG/intraday losses
  const netOtherSources = scheduleOS.total

  return {
    setOffs: {
      intradayProfitAbsorbed,
      stcgAbsorbed,
      ltcgAbsorbed,
      remainingIntradayLoss,
      remainingSTCL,
      remainingLTCL,
    },
    netSalaryIncome,
    netIntradayIncome,
    netSTCG,
    netLTCG,
    netOtherSources,
  }
}
