/**
 * Regime Comparison Engine
 *
 * computeRegimeComparison(schedules_v2, rawDeductions, taxCredits, filerProfile, ay)
 *   → RegimeComparison { new, old, recommended, saving }
 *
 * computeFilerCategory(dateOfBirth, ay) → FilerCategory
 *   Age as of 1 April of the financial year start.
 *   general: < 60 | senior: 60–79 | super_senior: ≥ 80
 */

import type {
  RegimeComparison,
  FilerProfile,
  Schedules_v2,
  TaxCredits,
} from '../types'
import type { FilerCategory } from './taxRules'
import { computeDeductionsVI_A, type RawDeductions } from './deductionsEngine'
import { computeTax_v2 } from './taxComputation'

// ─── Filer category helper ────────────────────────────────────────────────────

/**
 * Compute filer category from date of birth.
 * Age is calculated as of 1 April of the financial year start
 * (for AY 2026-27 → FY 2025-26 → age as of 1 Apr 2025).
 */
export function computeFilerCategory(
  dateOfBirth: string | null,
  ay = '2026-27'
): FilerCategory {
  if (!dateOfBirth) return 'general'

  // FY start = AY year - 1, April 1
  const ayStartYear = parseInt(ay.split('-')[0], 10) - 1
  const fyStart = new Date(`${ayStartYear}-04-01`)

  const dob = new Date(dateOfBirth)
  if (isNaN(dob.getTime())) return 'general'

  let age = fyStart.getFullYear() - dob.getFullYear()
  const monthDiff = fyStart.getMonth() - dob.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && fyStart.getDate() < dob.getDate())) {
    age--
  }

  if (age >= 80) return 'super_senior'
  if (age >= 60) return 'senior'
  return 'general'
}

// ─── Regime comparison engine ─────────────────────────────────────────────────

/**
 * Run full tax computation for both Old and New regimes independently,
 * then return side-by-side results with a recommendation.
 *
 * @param schedules_v2   All 5 income head schedules
 * @param rawDeductions  Raw user-entered deduction values (pre-cap)
 * @param taxCredits     TDS + advance tax + self-assessment credits
 * @param filerProfile   DOB + filerCategory
 * @param ay             Assessment year
 */
export function computeRegimeComparison(
  schedules_v2: Schedules_v2,
  rawDeductions: RawDeductions,
  taxCredits: TaxCredits,
  filerProfile: FilerProfile,
  ay = '2026-27'
): RegimeComparison {
  const fc = filerProfile.filerCategory

  // ── Extract income components from schedules_v2 ───────────────────────────
  const { slabIncome, stcg, ltcg, netLTCGForSurcharge } = extractIncomeComponents(schedules_v2)

  // ── New Regime computation ─────────────────────────────────────────────────
  const newDeductions = computeDeductionsVI_A(rawDeductions, 'new', fc, ay)
  const newResult = computeTax_v2(
    slabIncome,
    stcg,
    ltcg,
    netLTCGForSurcharge,
    newDeductions,
    taxCredits,
    'new',
    fc,
    ay
  )

  // ── Old Regime computation ─────────────────────────────────────────────────
  const oldDeductions = computeDeductionsVI_A(rawDeductions, 'old', fc, ay)
  const oldResult = computeTax_v2(
    slabIncome,
    stcg,
    ltcg,
    netLTCGForSurcharge,
    oldDeductions,
    taxCredits,
    'old',
    fc,
    ay
  )

  // ── Recommendation ────────────────────────────────────────────────────────
  // Lower net payable wins; on tie → New Regime (simpler)
  const recommended: 'new' | 'old' =
    oldResult.netPayable < newResult.netPayable ? 'old' : 'new'

  const saving = Math.abs(newResult.netPayable - oldResult.netPayable)

  return {
    new: newResult,
    old: oldResult,
    recommended,
    saving,
  }
}

// ─── Income component extractor ───────────────────────────────────────────────

/**
 * Extract the four income components needed by computeTax_v2 from Schedules_v2.
 *
 * slabIncome          = salary (net taxable) + intraday P&L + other sources at slab rate
 *                       + debt MF gains + HP income (regime-dependent set-off already applied)
 * stcg                = net STCG after intra-CG set-off (equity + equity MF + property)
 * ltcg                = taxable LTCG above exemption limit
 * netLTCGForSurcharge = gross LTCG before exemption (for total income calc)
 */
function extractIncomeComponents(s: Schedules_v2): {
  slabIncome: number
  stcg: number
  ltcg: number
  netLTCGForSurcharge: number
} {
  // Salary net taxable
  const salaryNet = s.S.totalNetTaxable ?? 0

  // Intraday (speculative) — may be negative (loss)
  const intradayPL = (s.BP as any)?.speculativeIncome ?? (s.BP as any)?.speculativePL ?? 0

  // Presumptive + non-speculative business income
  const presumptiveIncome = ((s.BP as any)?.presumptiveEntries ?? [])
    .reduce((sum: number, e: any) => sum + (e.presumptiveIncome ?? 0), 0)
  const nonSpecIncome = (s.BP as any)?.nonSpeculativeIncome ?? 0

  // Other sources — slab rate portion
  const otherSlabRate = s.OS?.totalAtSlabRate ?? 0

  // House property — set-off already computed in scheduleHP
  const hpIncome = s.HP?.totalIncomeFromHP ?? 0
  const hpSetOff = s.HP?.lossSetOffAgainstSalary ?? 0
  // Use net HP contribution (positive income or loss already set off)
  const netHP = hpIncome + hpSetOff  // lossSetOffAgainstSalary is negative when loss

  // Capital gains — net after intra-CG CYLA
  const cgStcg = s.CG?.totalSTCG ?? 0
  const cgLtcg = s.CG?.totalLTCG ?? 0

  // Debt MF gains at slab rate
  const debtMFGains = (s.CG as any)?.debtMFGains ?? 0

  const slabIncome = Math.max(0,
    salaryNet +
    intradayPL +
    presumptiveIncome +
    nonSpecIncome +
    otherSlabRate +
    debtMFGains +
    netHP
  )

  return {
    slabIncome,
    stcg: Math.max(0, cgStcg),
    ltcg: Math.max(0, cgLtcg),
    netLTCGForSurcharge: Math.max(0, cgLtcg),
  }
}
