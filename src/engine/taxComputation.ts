import type { Schedules, TaxComputation } from '../types'

// ─── New Regime slab rates FY 2025-26 ────────────────────────────────────────
// Source: requirements.md §4.4

interface SlabEntry {
  from: number
  to: number      // Infinity for the top slab
  rate: number    // as decimal, e.g. 0.05 for 5%
}

const NEW_REGIME_SLABS: SlabEntry[] = [
  { from: 0,          to: 400_000,    rate: 0 },
  { from: 400_000,    to: 800_000,    rate: 0.05 },
  { from: 800_000,    to: 1_200_000,  rate: 0.10 },
  { from: 1_200_000,  to: 1_600_000,  rate: 0.15 },
  { from: 1_600_000,  to: 2_000_000,  rate: 0.20 },
  { from: 2_000_000,  to: 2_400_000,  rate: 0.25 },
  { from: 2_400_000,  to: Infinity,   rate: 0.30 },
]

// Section 87A: full rebate if slab income ≤ ₹12,00,000 under New Regime
const SECTION_87A_LIMIT = 1_200_000

// Capital gains rates (post-Budget 2024)
const STCG_RATE     = 0.20    // Sec 111A
const LTCG_RATE     = 0.125   // Sec 112A

// Cess
const CESS_RATE = 0.04

// Surcharge (New Regime caps at 25% for STCG/LTCG but 15% for others — simplified to 15% cap per requirements)
const SURCHARGE_THRESHOLD_1 = 5_000_000    // ₹50L
const SURCHARGE_THRESHOLD_2 = 10_000_000   // ₹1Cr
const SURCHARGE_RATE_1 = 0.10
const SURCHARGE_RATE_2 = 0.15

// ─── Core slab tax function ───────────────────────────────────────────────────

/**
 * Compute slab tax on the given income using New Regime rates.
 * Pure function — no side effects.
 */
export function computeSlabTax(income: number): number {
  if (income <= 0) return 0

  let tax = 0
  for (const slab of NEW_REGIME_SLABS) {
    if (income <= slab.from) break
    const taxableInSlab = Math.min(income, slab.to === Infinity ? income : slab.to) - slab.from
    tax += taxableInSlab * slab.rate
  }
  return Math.round(tax)
}

/**
 * Compute surcharge based on total income.
 * Cap at 15% per requirements.md (incomes ≤ ₹2Cr handled; above ₹2Cr is out of scope).
 */
function computeSurcharge(totalIncome: number, baseTax: number): number {
  if (totalIncome <= SURCHARGE_THRESHOLD_1) return 0
  if (totalIncome <= SURCHARGE_THRESHOLD_2) return Math.round(baseTax * SURCHARGE_RATE_1)
  return Math.round(baseTax * SURCHARGE_RATE_2)
}

// ─── Full tax computation ─────────────────────────────────────────────────────

/**
 * Compute the full tax for a given set of schedules and optional advance tax.
 *
 * Income flow:
 *   Slab-taxable = salary + intraday profit + debt MF gains + other sources
 *   STCG taxed at 20% (Sec 111A) — Section 87A rebate does NOT apply to STCG/LTCG
 *   LTCG taxed at 12.5% (Sec 112A) on amount above ₹1.25L exemption
 */
export function computeTax(
  schedules: Schedules,
  tdsDeducted: number,
  advanceTaxPaid: number
): TaxComputation {
  const { CG, CYLA } = schedules

  // ── Step 1: Aggregate slab-taxable income ─────────────────────────────────
  // Uses CYLA-adjusted net values
  const slabTaxableIncome = Math.max(
    0,
    CYLA.netSalaryIncome +
    CYLA.netIntradayIncome +
    CG.debtMFGains +       // debt MF gains are slab-rate income
    CYLA.netOtherSources
  )

  // ── Step 2: Capital gains totals ──────────────────────────────────────────
  const netSTCG     = CYLA.netSTCG
  const taxableLTCG = CG.taxableLTCG   // already net of ₹1.25L exemption

  // ── Step 3: Total income (for surcharge threshold) ────────────────────────
  const totalIncome = slabTaxableIncome + netSTCG + CG.netLTCG + CG.debtMFGains

  // ── Step 4: Slab tax ──────────────────────────────────────────────────────
  let slabTax = computeSlabTax(slabTaxableIncome)

  // Section 87A rebate: zero slab tax if slab income ≤ ₹12L
  // NOTE: rebate does NOT apply to STCG (Sec 111A) or LTCG (Sec 112A)
  const section87AEligible = slabTaxableIncome <= SECTION_87A_LIMIT
  const section87ARebate   = section87AEligible ? slabTax : 0
  slabTax = section87AEligible ? 0 : slabTax

  // ── Step 5: Capital gains tax ─────────────────────────────────────────────
  const stcgTax = Math.round(netSTCG * STCG_RATE)
  const ltcgTax = Math.round(taxableLTCG * LTCG_RATE)

  // ── Step 6: Surcharge (on total tax before cess) ──────────────────────────
  const subtotalBeforeSurcharge = slabTax + stcgTax + ltcgTax
  const surcharge = computeSurcharge(totalIncome, subtotalBeforeSurcharge)
  const totalBeforeCess = subtotalBeforeSurcharge + surcharge

  // ── Step 7: Cess @ 4% ─────────────────────────────────────────────────────
  const cess = Math.round(totalBeforeCess * CESS_RATE)
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

// ─── Export slab table for display ───────────────────────────────────────────
export { NEW_REGIME_SLABS }
export type { SlabEntry }
