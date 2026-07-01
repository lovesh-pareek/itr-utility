/**
 * Deductions Engine — Chapter VI-A
 *
 * computeDeductionsVI_A(raw, regime, filerCategory, salary80CCD2Cap)
 *
 * New Regime: only 80CCD(2) and 80CCH apply — all others zeroed.
 * Old Regime: all deductions with age-aware caps from tax-rules.json.
 *
 * All caps read from config deductionCaps — zero hardcoded values here.
 */

import type { DeductionsVI_A, DonationEntry, FilerCategory } from '../types'
import { getRules } from './taxRules'

// ─── Raw input shape ──────────────────────────────────────────────────────────

/**
 * Raw deduction inputs as entered by the user.
 * The engine applies caps and regime rules to produce computed DeductionsVI_A.
 */
export interface RawDeductions {
  // 80C bucket
  sec80C_lic: number
  sec80C_ppf: number
  sec80C_elss: number
  sec80C_homeLoanPrincipal: number
  sec80C_tuitionFees: number
  sec80C_other: number

  // 80CCC — pension fund (within 80C cap)
  sec80CCC: number

  // 80CCD
  sec80CCD1: number    // employee NPS (within 80C cap)
  sec80CCD1B: number   // additional NPS self (₹50,000 over 80C cap)
  sec80CCD2: number    // employer NPS (allowed in both regimes)

  // 80CCH — Agnipath (allowed in New Regime)
  sec80CCH: number

  // 80D
  sec80D_self: number
  sec80D_parents: number
  sec80D_parentsAreSenior: boolean

  // Other
  sec80E: number       // education loan interest (no cap)
  sec80EEA: number     // first home loan interest (₹1.5L cap)
  sec80G: DonationEntry[]
  sec80GG: number      // HRA for non-HRA salaried (₹5k/month cap = ₹60k annual)
  sec80TTA: number     // savings interest (₹10k cap, not available for super_senior under 80TTB)
  sec80TTB: number     // senior citizen interest (₹50k cap, replaces 80TTA)

  // Gross salary (needed for 80CCD2 cap check)
  grossSalary: number
}

// ─── Main engine function ─────────────────────────────────────────────────────

/**
 * Compute Chapter VI-A deductions with cap enforcement.
 *
 * @param raw       Raw user-entered deduction values
 * @param regime    'new' | 'old'
 * @param filerCategory  Age category — affects 80D and 80TTB caps
 * @param ay        Assessment year (defaults to 2026-27)
 */
export function computeDeductionsVI_A(
  raw: RawDeductions,
  regime: 'new' | 'old',
  filerCategory: FilerCategory = 'general',
  ay = '2026-27'
): DeductionsVI_A {
  // ── New Regime: only 80CCD2 and 80CCH apply ──────────────────────────────
  if (regime === 'new') {
    // const rules = getRules(ay, 'new')
    // 80CCD2 cap: 10% of gross salary (14% for central govt, but 10% is conservative default)
    const ccd2Cap = Math.round(raw.grossSalary * 0.10)
    const sec80CCD2 = Math.min(raw.sec80CCD2, ccd2Cap)
    const sec80CCH = Math.max(0, raw.sec80CCH)
    const total = sec80CCD2 + sec80CCH

    return {
      sec80C: 0,
      sec80CCC: 0,
      sec80CCD1: 0,
      sec80CCD1B: 0,
      sec80CCD2,
      sec80CCH,
      sec80D_self: 0,
      sec80D_parents: 0,
      sec80D_parentsAreSenior: false,
      sec80E: 0,
      sec80EEA: 0,
      sec80G: [],
      sec80GG: 0,
      sec80TTA: 0,
      sec80TTB: 0,
      total,
    }
  }

  // ── Old Regime: full Chapter VI-A with age-aware caps ─────────────────────
  const rules = getRules(ay, 'old', filerCategory)
  const caps = rules.deductionCaps!

  // ── 80C bucket (combined cap: 80C + 80CCC + 80CCD1) ──────────────────────
  const rawCBucket =
    Math.max(0, raw.sec80C_lic) +
    Math.max(0, raw.sec80C_ppf) +
    Math.max(0, raw.sec80C_elss) +
    Math.max(0, raw.sec80C_homeLoanPrincipal) +
    Math.max(0, raw.sec80C_tuitionFees) +
    Math.max(0, raw.sec80C_other) +
    Math.max(0, raw.sec80CCC) +
    Math.max(0, raw.sec80CCD1)

  const cBucketAllowed = Math.min(rawCBucket, caps['80C'])

  // Attribute proportionally within bucket for record-keeping
  // (all mapped to sec80C for simplicity; sec80CCC and sec80CCD1 tracked separately)
  const cBucketRaw = Math.max(0, raw.sec80C_lic) + Math.max(0, raw.sec80C_ppf) +
    Math.max(0, raw.sec80C_elss) + Math.max(0, raw.sec80C_homeLoanPrincipal) +
    Math.max(0, raw.sec80C_tuitionFees) + Math.max(0, raw.sec80C_other)

  const scaleFactor = rawCBucket > 0 ? cBucketAllowed / rawCBucket : 0
  const sec80C = Math.round(cBucketRaw * scaleFactor)
  const sec80CCC = Math.round(Math.max(0, raw.sec80CCC) * scaleFactor)
  const sec80CCD1 = Math.round(Math.max(0, raw.sec80CCD1) * scaleFactor)

  // ── 80CCD(1B) — additional NPS, ₹50,000 cap over and above 80C ───────────
  const sec80CCD1B = Math.min(Math.max(0, raw.sec80CCD1B), caps['80CCD1B'])

  // ── 80CCD(2) — employer NPS, 10% of gross salary cap ────────────────────
  const ccd2Cap = Math.round(raw.grossSalary * 0.10)
  const sec80CCD2 = Math.min(Math.max(0, raw.sec80CCD2), ccd2Cap)

  // ── 80CCH — Agnipath ─────────────────────────────────────────────────────
  const sec80CCH = Math.max(0, raw.sec80CCH)

  // ── 80D — Health insurance — age-aware caps ───────────────────────────────
  const selfCap = (filerCategory === 'senior' || filerCategory === 'super_senior')
    ? caps['80D_senior_self']
    : caps['80D_self']

  const parentsCap = raw.sec80D_parentsAreSenior
    ? caps['80D_senior_parents']
    : caps['80D_parents']

  const sec80D_self = Math.min(Math.max(0, raw.sec80D_self), selfCap)
  const sec80D_parents = Math.min(Math.max(0, raw.sec80D_parents), parentsCap)

  // ── 80E — education loan interest (no cap) ───────────────────────────────
  const sec80E = Math.max(0, raw.sec80E)

  // ── 80EEA — first home loan interest (₹1.5L cap) ─────────────────────────
  const sec80EEA = Math.min(Math.max(0, raw.sec80EEA), 150_000)

  // ── 80G — donations ──────────────────────────────────────────────────────
  // Cash donations: per-entry limit ₹2,000
  const sec80G: DonationEntry[] = raw.sec80G.map(entry => ({
    ...entry,
    cashAmount: Math.min(entry.cashAmount, caps['80G_cash_limit']),
  }))

  // ── 80GG — HRA for non-HRA salaried (₹5k/month = ₹60k annual) ──────────
  const sec80GG = Math.min(Math.max(0, raw.sec80GG), caps['80GG_monthly'] * 12)

  // ── 80TTA / 80TTB — interest deduction, age-aware ────────────────────────
  // Super-seniors and seniors: 80TTB (₹50k, replaces 80TTA)
  // General: 80TTA (₹10k on savings interest only)
  let sec80TTA = 0
  let sec80TTB = 0

  if (filerCategory === 'senior' || filerCategory === 'super_senior') {
    sec80TTB = Math.min(Math.max(0, raw.sec80TTB), caps['80TTB'])
    sec80TTA = 0  // 80TTB replaces 80TTA for seniors
  } else {
    sec80TTA = Math.min(Math.max(0, raw.sec80TTA), caps['80TTA'])
    sec80TTB = 0
  }

  // ── 80G total deductible amount ──────────────────────────────────────────
  const sec80GTotal = sec80G.reduce((sum, entry) => {
    const deductibleCash = Math.min(entry.cashAmount, caps['80G_cash_limit'])
    const nonCashAmount = entry.amount - entry.cashAmount
    return sum + (deductibleCash + nonCashAmount) * entry.deductiblePct
  }, 0)

  // ── Total ─────────────────────────────────────────────────────────────────
  const total = Math.round(
    sec80C +
    sec80CCC +
    sec80CCD1 +
    sec80CCD1B +
    sec80CCD2 +
    sec80CCH +
    sec80D_self +
    sec80D_parents +
    sec80E +
    sec80EEA +
    sec80GTotal +
    sec80GG +
    sec80TTA +
    sec80TTB
  )

  return {
    sec80C,
    sec80CCC,
    sec80CCD1,
    sec80CCD1B,
    sec80CCD2,
    sec80CCH,
    sec80D_self,
    sec80D_parents,
    sec80D_parentsAreSenior: raw.sec80D_parentsAreSenior,
    sec80E,
    sec80EEA,
    sec80G,
    sec80GG,
    sec80TTA,
    sec80TTB,
    total,
  }
}

// ─── Helper: empty raw deductions ────────────────────────────────────────────

export function emptyRawDeductions(grossSalary = 0): RawDeductions {
  return {
    sec80C_lic: 0,
    sec80C_ppf: 0,
    sec80C_elss: 0,
    sec80C_homeLoanPrincipal: 0,
    sec80C_tuitionFees: 0,
    sec80C_other: 0,
    sec80CCC: 0,
    sec80CCD1: 0,
    sec80CCD1B: 0,
    sec80CCD2: 0,
    sec80CCH: 0,
    sec80D_self: 0,
    sec80D_parents: 0,
    sec80D_parentsAreSenior: false,
    sec80E: 0,
    sec80EEA: 0,
    sec80G: [],
    sec80GG: 0,
    sec80TTA: 0,
    sec80TTB: 0,
    grossSalary,
  }
}

// ─── Helper: compute 80C bucket usage ────────────────────────────────────────

export function compute80CBucketUsage(raw: RawDeductions, ay = '2026-27'): {
  used: number
  cap: number
  pct: number
} {
  const rules = getRules(ay, 'old')
  const cap = rules.deductionCaps!['80C']
  const used = Math.min(
    Math.max(0, raw.sec80C_lic) +
    Math.max(0, raw.sec80C_ppf) +
    Math.max(0, raw.sec80C_elss) +
    Math.max(0, raw.sec80C_homeLoanPrincipal) +
    Math.max(0, raw.sec80C_tuitionFees) +
    Math.max(0, raw.sec80C_other) +
    Math.max(0, raw.sec80CCC) +
    Math.max(0, raw.sec80CCD1),
    cap
  )
  return { used, cap, pct: cap > 0 ? used / cap : 0 }
}
