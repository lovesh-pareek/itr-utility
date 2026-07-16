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
 * Implements business loss set-off rules:
 *   - Speculative loss: ring-fenced (only against speculative profit)
 *   - Non-speculative business loss (incl. F&O): can offset OS, STCG, LTCG, HP (not salary)
 *
 * slabIncome          = salary (net taxable) + speculative profit + presumptive
 *                       + non-speculative profit + OS at slab (after set-off)
 *                       + debt MF gains + HP income (regime-dependent)
 * stcg                = net STCG after business loss set-off and intra-CG set-off
 * ltcg                = taxable LTCG after business loss set-off and exemption
 * netLTCGForSurcharge = LTCG for total income surcharge calculation
 */
function extractIncomeComponents(s: Schedules_v2): {
  slabIncome: number
  stcg: number
  ltcg: number
  netLTCGForSurcharge: number
} {
  // Salary net taxable
  const salaryNet = s.S.totalNetTaxable ?? 0

  // Speculative (intraday): ring-fenced — loss cannot offset other heads
  const speculativeProfit = Math.max(0, s.BP?.netSpeculativePnL ?? 0)

  // Presumptive business income
  const presumptiveIncome = ((s.BP as any)?.presumptiveEntries ?? [])
    .reduce((sum: number, e: any) => sum + (e.presumptiveIncome ?? 0), 0)

  // F&O income/loss is non-speculative business income.
  // Combine with other non-speculative income/loss.
  const fnoIncome = s.BP?.fno?.taxableIncome ?? 0
  const nonSpecIncomeRaw = (s.BP?.nonSpeculativeIncome ?? 0) - (s.BP?.nonSpeculativeLoss ?? 0)
  const netNonSpec = nonSpecIncomeRaw + fnoIncome
  const nonSpecProfit = Math.max(0, netNonSpec)
  const nonSpecLoss = Math.max(0, -netNonSpec)

  // Other sources — slab rate portion (may be reduced by business loss set-off)
  let otherSlabRate = s.OS?.totalAtSlabRate ?? 0

  // Capital gains — net after intra-CG set-off
  let cgStcg = s.CG?.totalSTCG ?? 0
  let cgLtcg = s.CG?.totalLTCG ?? 0

  // Non-speculative business loss set-off: OS → STCG → LTCG (not salary)
  let remainingLoss = nonSpecLoss
  if (remainingLoss > 0) {
    const absorbedOS = Math.min(remainingLoss, otherSlabRate)
    otherSlabRate -= absorbedOS
    remainingLoss -= absorbedOS

    const absorbedSTCG = Math.min(remainingLoss, cgStcg)
    cgStcg -= absorbedSTCG
    remainingLoss -= absorbedSTCG

    const absorbedLTCG = Math.min(remainingLoss, cgLtcg)
    cgLtcg -= absorbedLTCG
    remainingLoss -= absorbedLTCG
  }

  // Debt MF gains at slab rate
  const debtMFGains = (s.CG as any)?.debtMFGains ?? 0

  // House property — set-off already computed in scheduleHP
  const hpIncome = s.HP?.totalIncomeFromHP ?? 0
  const hpSetOff = s.HP?.lossSetOffAgainstSalary ?? 0
  // Net HP contribution (positive income or loss already set off via lossSetOffAgainstSalary)
  const netHP = hpIncome + hpSetOff  // lossSetOffAgainstSalary is negative when loss

  const slabIncome = Math.max(0,
    salaryNet +
    speculativeProfit +
    presumptiveIncome +
    nonSpecProfit +
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
