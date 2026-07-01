import type { Schedules, TaxComputation, DeductionsVI_A, TaxCredits } from '../types'
import {
  getRules,
  computeSlabTaxFromConfig,
  computeSurchargeFromConfig,
  computeRebateFromConfig,
  type FilerCategory,
  type Regime,
} from './taxRules'
import { computeNetPayable } from './taxCreditsEngine'

// ─── Full tax computation ─────────────────────────────────────────────────────

/**
 * Compute the full tax for a given set of schedules.
 * All rates read from tax-rules.json via getRules() — no hardcoded constants.
 *
 * Income flow:
 *   Slab-taxable = salary + intraday profit + debt MF gains + other sources
 *   STCG taxed at specialRates.stcg_111A — Section 87A rebate does NOT apply to STCG/LTCG
 *   LTCG taxed at specialRates.ltcg_112A on amount above ltcg_112A_exemption
 */
export function computeTax(
  schedules: Schedules,
  tdsDeducted: number,
  advanceTaxPaid: number,
  ay = '2026-27',
  regime: Regime = 'new',
  filerCategory: FilerCategory = 'general'
): TaxComputation {
  const rules = getRules(ay, regime, filerCategory)
  const { CG, CYLA } = schedules

  // ── Step 1: Aggregate slab-taxable income ─────────────────────────────────
  const slabTaxableIncome = Math.max(
    0,
    CYLA.netSalaryIncome +
    CYLA.netIntradayIncome +
    CG.debtMFGains +
    CYLA.netOtherSources
  )

  // ── Step 2: Capital gains totals ──────────────────────────────────────────
  const netSTCG = CYLA.netSTCG
  const taxableLTCG = CG.taxableLTCG  // already net of exemption

  // ── Step 3: Total income (for surcharge threshold) ────────────────────────
  const totalIncome = slabTaxableIncome + netSTCG + CG.netLTCG + CG.debtMFGains

  // ── Step 4: Slab tax ──────────────────────────────────────────────────────
  let slabTaxRaw = computeSlabTaxFromConfig(slabTaxableIncome, rules.slabs)

  // Section 87A rebate from config
  const { eligible: section87AEligible, rebate: section87ARebate } = computeRebateFromConfig(
    slabTaxRaw,
    slabTaxableIncome,
    rules.section87A
  )
  const slabTax = section87AEligible ? 0 : slabTaxRaw

  // ── Step 5: Capital gains tax from config rates ───────────────────────────
  const stcgTax = Math.round(netSTCG * rules.specialRates.stcg_111A)
  const ltcgTax = Math.round(taxableLTCG * rules.specialRates.ltcg_112A)

  // ── Step 6: Surcharge from config ─────────────────────────────────────────
  const subtotalBeforeSurcharge = slabTax + stcgTax + ltcgTax
  const surcharge = computeSurchargeFromConfig(totalIncome, subtotalBeforeSurcharge, rules.surcharge)
  const totalBeforeCess = subtotalBeforeSurcharge + surcharge

  // ── Step 7: Cess from config ──────────────────────────────────────────────
  const cess = Math.round(totalBeforeCess * rules.cess)
  const totalTaxPayable = totalBeforeCess + cess

  // ── Step 8: Net payable / refund ─────────────────────────────────────────
  const netPayable = totalTaxPayable - tdsDeducted - advanceTaxPaid

  return {
    totalIncome,
    slabTaxableIncome,
    slabTax,
    stcgTax,
    ltcgTax,
    subtotalBeforeSurcharge,
    surcharge,
    totalBeforeCess,
    cess,
    totalTaxPayable,
    section87AEligible,
    section87ARebate,
    tdsDeducted,
    advanceTaxPaid,
    netPayable,
  }
}

/**
 * Compute slab tax using New Regime (default) — kept for backward compat with tests.
 * Uses AY 2026-27 New Regime slabs from config.
 */
export function computeSlabTax(income: number): number {
  const rules = getRules('2026-27', 'new', 'general')
  return computeSlabTaxFromConfig(income, rules.slabs)
}

// Re-export slab type for display use
export type { SlabEntry } from './taxRules'

// ─── computeTax_v2 — with deductions and full TaxCredits ─────────────────────

/**
 * v2 tax computation: accepts pre-computed DeductionsVI_A and TaxCredits.
 *
 * Deduction logic:
 *   New Regime: only 80CCD2 + 80CCH subtracted from slab-taxable income.
 *   Old Regime: full deductions.total subtracted from slab-taxable income.
 *
 * Net payable: totalTaxPayable − credits.totalCredits
 *
 * @param slabIncomeBefore  Slab-taxable income BEFORE any deductions (salary+intraday+OS+debtMF)
 * @param stcg              Net STCG after intra-CG set-off
 * @param ltcg              Taxable LTCG (after exemption)
 * @param netLTCGForSurcharge  Net LTCG (pre-exemption, for total income surcharge calc)
 * @param deductions        Pre-computed DeductionsVI_A (from deductionsEngine)
 * @param credits           Pre-computed TaxCredits (from taxCreditsEngine)
 * @param regime            'new' | 'old'
 * @param filerCategory     Age category — affects Old Regime slabs and 80D caps
 * @param ay                Assessment year (default '2026-27')
 */
export function computeTax_v2(
  slabIncomeBefore: number,
  stcg: number,
  ltcg: number,
  netLTCGForSurcharge: number,
  deductions: DeductionsVI_A,
  credits: TaxCredits,
  regime: Regime = 'new',
  filerCategory: FilerCategory = 'general',
  ay = '2026-27'
): TaxComputation {
  const rules = getRules(ay, regime, filerCategory)

  // ── Step 1: Subtract regime-appropriate deductions from slab income ────────
  let deductionApplied = 0
  if (regime === 'new') {
    // New Regime: only 80CCD2 and 80CCH reduce slab income
    deductionApplied = deductions.sec80CCD2 + deductions.sec80CCH
  } else {
    // Old Regime: full deductions.total
    deductionApplied = deductions.total
  }

  const slabTaxableIncome = Math.max(0, slabIncomeBefore - deductionApplied)

  // ── Step 2: Total income for surcharge threshold ───────────────────────────
  const totalIncome = slabTaxableIncome + stcg + netLTCGForSurcharge

  // ── Step 3: Slab tax + Section 87A rebate ─────────────────────────────────
  const slabTaxRaw = computeSlabTaxFromConfig(slabTaxableIncome, rules.slabs)
  const { eligible: section87AEligible, rebate: section87ARebate } = computeRebateFromConfig(
    slabTaxRaw,
    slabTaxableIncome,
    rules.section87A
  )
  const slabTax = section87AEligible ? 0 : slabTaxRaw

  // ── Step 4: Capital gains tax ──────────────────────────────────────────────
  const stcgTax = Math.round(stcg * rules.specialRates.stcg_111A)
  const ltcgTax = Math.round(ltcg * rules.specialRates.ltcg_112A)

  // ── Step 5: Surcharge ──────────────────────────────────────────────────────
  const subtotalBeforeSurcharge = slabTax + stcgTax + ltcgTax
  const surcharge = computeSurchargeFromConfig(totalIncome, subtotalBeforeSurcharge, rules.surcharge)
  const totalBeforeCess = subtotalBeforeSurcharge + surcharge

  // ── Step 6: Cess ──────────────────────────────────────────────────────────
  const cess = Math.round(totalBeforeCess * rules.cess)
  const totalTaxPayable = totalBeforeCess + cess

  // ── Step 7: Net payable using full TaxCredits ─────────────────────────────
  const netPayable = computeNetPayable(totalTaxPayable, credits)

  // Flatten credit totals for return shape compatibility
  const tdsDeducted = credits.totalTDSDeducted
  const advanceTaxPaid = credits.totalAdvanceTax + credits.totalSelfAssessment + credits.tcsCredits

  return {
    totalIncome,
    slabTaxableIncome,
    slabTax,
    stcgTax,
    ltcgTax,
    subtotalBeforeSurcharge,
    surcharge,
    totalBeforeCess,
    cess,
    totalTaxPayable,
    section87AEligible,
    section87ARebate,
    tdsDeducted,
    advanceTaxPaid,
    netPayable,
  }
}
