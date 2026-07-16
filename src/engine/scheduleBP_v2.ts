import type { BrokerData, ScheduleBP, ScheduleBP_v2, PresumptiveEntry, FnOEntry } from '../types'
import { computeScheduleBP } from './scheduleBP_CFL'

/**
 * Compute Schedule BP v2 — All business/profession income types.
 *
 * Income types:
 *  - Speculative (intraday): from broker data — same as v1.0
 *  - Presumptive 44AD: grossReceipts × 8% (non-digital) or 6% (digital)
 *  - Presumptive 44ADA: grossReceipts × 50%
 *  - F&O: turnover + taxable income (user-entered, CA referral shown)
 *  - Non-speculative: revenue − expenses (manual entry)
 *
 * Loss set-off rules:
 *  - Speculative loss: ring-fenced, only against speculative income
 *  - Non-speculative loss: can offset any non-salary head
 */
export function computeScheduleBP_v2(
  brokerData: BrokerData | null,
  presumptiveEntries: PresumptiveEntry[],
  fno: FnOEntry | null,
  nonSpeculativeIncome: number,
  nonSpeculativeLoss: number,
  overrides: Record<string, number>
): ScheduleBP_v2 {
  // Speculative (intraday) — from v1.0 base
  const baseBP: ScheduleBP = computeScheduleBP(brokerData, overrides)

  // Compute presumptive entries with auto rates
  const resolvedPresumptive: PresumptiveEntry[] = presumptiveEntries.map((entry, idx) => {
    const prefix = `BP_v2.presumptive.${idx}`
    const grossReceipts = overrides[`${prefix}.grossReceipts`] ?? entry.grossReceipts
    const isDigital = entry.isDigital

    let presumptiveRate: number
    if (entry.type === 'presumptive_44AD') {
      presumptiveRate = isDigital ? 0.06 : 0.08
    } else {
      // 44ADA
      presumptiveRate = 0.50
    }

    const presumptiveIncome = Math.round(grossReceipts * presumptiveRate)

    return {
      ...entry,
      grossReceipts,
      presumptiveRate,
      presumptiveIncome,
    }
  })

  // F&O — user-entered, not computed
  const resolvedFnO: FnOEntry | null = fno
    ? {
        turnover: overrides['BP_v2.fno.turnover'] ?? overrides['BP.fnoTurnover'] ?? fno.turnover,
        taxableIncome: overrides['BP_v2.fno.taxableIncome'] ?? overrides['BP.fnoIncome'] ?? fno.taxableIncome,
        notComputed: fno.notComputed && !('BP_v2.fno.taxableIncome' in overrides) && !('BP.fnoIncome' in overrides),
      }
    : // If no fno entry exists but user provided an override, create an entry
      ('BP.fnoIncome' in overrides || 'BP_v2.fno.taxableIncome' in overrides)
        ? {
            turnover: overrides['BP_v2.fno.turnover'] ?? overrides['BP.fnoTurnover'] ?? 0,
            taxableIncome: overrides['BP_v2.fno.taxableIncome'] ?? overrides['BP.fnoIncome'] ?? 0,
            notComputed: false,
          }
        : null

  const resolvedNonSpecIncome = overrides['BP_v2.nonSpeculativeIncome'] ?? nonSpeculativeIncome
  const resolvedNonSpecLoss = overrides['BP_v2.nonSpeculativeLoss'] ?? nonSpeculativeLoss

  return {
    ...baseBP,
    presumptiveEntries: resolvedPresumptive,
    fno: resolvedFnO,
    nonSpeculativeIncome: resolvedNonSpecIncome,
    nonSpeculativeLoss: resolvedNonSpecLoss,
  }
}

/**
 * Get total presumptive income across all entries.
 */
export function getTotalPresumptiveIncome(entries: PresumptiveEntry[]): number {
  return entries.reduce((sum, e) => sum + e.presumptiveIncome, 0)
}

/**
 * Get net non-speculative income (income - loss).
 */
export function getNetNonSpeculativeIncome(bp: ScheduleBP_v2): number {
  return bp.nonSpeculativeIncome - bp.nonSpeculativeLoss
}

/**
 * Check if the F&O turnover crosses the tax audit threshold.
 * Threshold: ₹10Cr for FY 2025-26 (presumptive); ₹1Cr for regular
 */
export function checkFnOAuditThreshold(fno: FnOEntry | null): boolean {
  if (!fno) return false
  return fno.turnover > 10_000_000  // ₹1 Cr threshold for F&O
}
