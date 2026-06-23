import type { Schedules, TaxComputation } from '../types'
import {
  getRules,
  computeSlabTaxFromConfig,
  computeSurchargeFromConfig,
  computeRebateFromConfig,
  type FilerCategory,
  type Regime,
} from './taxRules'

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
