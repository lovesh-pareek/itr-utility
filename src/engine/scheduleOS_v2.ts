import type { OtherSourcesBreakdown, ScheduleOS_v2 } from '../types'
import { getRules } from './taxRules'

/**
 * Compute Schedule OS v2 — Expanded other sources income.
 *
 * Income types:
 *   At slab rate: savings interest, FD, RD, senior citizen interest,
 *                 dividends, foreign dividends, gifts (above ₹50k from non-relatives),
 *                 family pension (net of std deduction)
 *   At 30% flat:  lottery winnings, casual income
 *
 * Family pension deduction:
 *   = min(pension × familyPensionStdDedPct, familyPensionStdDed)
 *   Only under Old Regime (New Regime doesn't allow this deduction — but income is taxable)
 */
export function computeScheduleOS_v2(
  breakdown: OtherSourcesBreakdown,
  overrides: Record<string, number>,
  ay = '2026-27',
  regime: 'new' | 'old' = 'new'
): ScheduleOS_v2 {
  const rules = getRules(ay, regime)

  // Resolve overrides for each field
  const resolved: OtherSourcesBreakdown = {
    savingsInterest:            overrides['OS_v2.savingsInterest']            ?? breakdown.savingsInterest,
    fdInterest:                 overrides['OS_v2.fdInterest']                 ?? breakdown.fdInterest,
    rdInterest:                 overrides['OS_v2.rdInterest']                 ?? breakdown.rdInterest,
    seniorCitizenInterest:      overrides['OS_v2.seniorCitizenInterest']      ?? breakdown.seniorCitizenInterest,
    dividendIncome:             overrides['OS_v2.dividendIncome']             ?? breakdown.dividendIncome,
    dividendFromForeignCompany: overrides['OS_v2.dividendFromForeignCompany'] ?? breakdown.dividendFromForeignCompany,
    giftReceived:               overrides['OS_v2.giftReceived']               ?? breakdown.giftReceived,
    lotteryWinnings:            overrides['OS_v2.lotteryWinnings']            ?? breakdown.lotteryWinnings,
    casualIncome:               overrides['OS_v2.casualIncome']               ?? breakdown.casualIncome,
    familyPension:              overrides['OS_v2.familyPension']              ?? breakdown.familyPension,
    familyPensionStdDed:        0,  // computed below
  }

  // Family pension standard deduction (applicable under both regimes for income computation)
  // Old Regime: deduction from income; New Regime: still recognized in practice but rule-based
  const fpDedPct = rules.deductionCaps?.familyPensionStdDedPct ?? 0.333
  const fpDedCap = rules.deductionCaps?.familyPensionStdDed ?? 15000
  const familyPensionStdDed = Math.min(
    Math.round(resolved.familyPension * fpDedPct),
    fpDedCap
  )
  resolved.familyPensionStdDed = familyPensionStdDed

  // Gifts: taxable only above ₹50,000 aggregate from non-relatives
  const GIFT_THRESHOLD = 50_000
  const taxableGifts = Math.max(0, resolved.giftReceived - GIFT_THRESHOLD)

  // At slab rate
  const totalAtSlabRate =
    resolved.savingsInterest +
    resolved.fdInterest +
    resolved.rdInterest +
    resolved.seniorCitizenInterest +
    resolved.dividendIncome +
    resolved.dividendFromForeignCompany +
    taxableGifts +
    Math.max(0, resolved.familyPension - familyPensionStdDed)

  // At 30% flat (from config)
  const totalAt30Pct = resolved.lotteryWinnings + resolved.casualIncome

  return {
    breakdown: resolved,
    totalAtSlabRate: Math.max(0, totalAtSlabRate),
    totalAt30Pct: Math.max(0, totalAt30Pct),
    total: Math.max(0, totalAtSlabRate) + Math.max(0, totalAt30Pct),
  }
}

/**
 * Create an empty OtherSourcesBreakdown with all zeros.
 */
export function emptyOtherSourcesBreakdown(): OtherSourcesBreakdown {
  return {
    savingsInterest: 0,
    fdInterest: 0,
    rdInterest: 0,
    seniorCitizenInterest: 0,
    dividendIncome: 0,
    dividendFromForeignCompany: 0,
    giftReceived: 0,
    lotteryWinnings: 0,
    casualIncome: 0,
    familyPension: 0,
    familyPensionStdDed: 0,
  }
}
