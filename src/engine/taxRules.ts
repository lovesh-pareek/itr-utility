/**
 * Tax Rules Config Loader
 *
 * Loads tax-rules.json and exposes getRules() for engine consumption.
 * All tax constants come from config — no hardcoded values in engine code.
 *
 * getRules(ay, regime, filerCategory?) → rule object with slabs, caps, rates
 */

import taxRulesRaw from '../../public/config/tax-rules.json'

export type FilerCategory = 'general' | 'senior' | 'super_senior'
export type Regime = 'new' | 'old'

export interface SlabEntry {
  from: number
  to: number | null  // null = unbounded top slab
  rate: number
}

export interface SurchargeEntry {
  from: number
  to: number | null
  rate: number
}

export interface Section87AConfig {
  limit: number
  maxRebate?: number
  appliesToCG: boolean
}

export interface DeductionCaps {
  '80C': number
  '80CCD1B': number
  '80D_self': number
  '80D_parents': number
  '80D_senior_self': number
  '80D_senior_parents': number
  '80G_cash_limit': number
  '80GG_monthly': number
  '80TTA': number
  '80TTB': number
  '24b_selfOccupied': number
  familyPensionStdDed: number
  familyPensionStdDedPct: number
}

export interface SpecialRates {
  stcg_111A: number
  ltcg_112A: number
  ltcg_112A_exemption: number
  lottery: number
  casualIncome: number
  debt_mf: string
  dividends: string
}

export interface CarryForwardLimits {
  speculativeLoss: number
  capitalLoss: number
  hpLoss: number
  businessLoss: number
}

export interface Deadlines {
  original: string
  revised: string
  belated: string
}

export interface TaxRules {
  slabs: SlabEntry[]
  standardDeductionSalary: number
  section87A: Section87AConfig
  surcharge: SurchargeEntry[]
  surchargeCapForCG?: number
  deductionCaps?: DeductionCaps  // Old Regime only
  specialRates: SpecialRates
  cess: number
  carryForward: CarryForwardLimits
  deadlines: Deadlines
  itrForms: Record<string, string>
  surchargeThresholds: { scheduleALRequired: number }
}

// Type the raw JSON
interface RawTaxRules {
  schemaVersion: string
  defaultAY: string
  rules: Record<string, {
    regime: {
      new: {
        slabs: SlabEntry[]
        standardDeductionSalary: number
        section87A: Section87AConfig
        surcharge: SurchargeEntry[]
        surchargeCapForCG: number
      }
      old: {
        slabs: SlabEntry[]
        slabs_senior: SlabEntry[]
        slabs_super_senior: SlabEntry[]
        standardDeductionSalary: number
        section87A: Section87AConfig
        surcharge: SurchargeEntry[]
        deductionCaps: DeductionCaps
      }
    }
    specialRates: SpecialRates
    cess: number
    carryForward: CarryForwardLimits
    deadlines: Deadlines
    itrForms: Record<string, string>
    surchargeThresholds: { scheduleALRequired: number }
  }>
}

const taxRules = taxRulesRaw as RawTaxRules

/**
 * Get tax rules for a given AY, regime, and optional filer category.
 *
 * Slab selection logic:
 * - New Regime: always returns `slabs` (no age differentiation)
 * - Old Regime + 'general' or undefined: returns `slabs`
 * - Old Regime + 'senior': returns `slabs_senior`
 * - Old Regime + 'super_senior': returns `slabs_super_senior`
 */
export function getRules(
  ay: string,
  regime: Regime,
  filerCategory: FilerCategory = 'general'
): TaxRules {
  const ayRules = taxRules.rules[ay]
  if (!ayRules) {
    throw new Error(`Tax rules not found for AY: ${ay}. Available AYs: ${Object.keys(taxRules.rules).join(', ')}`)
  }

  const regimeRules = ayRules.regime[regime]

  let slabs: SlabEntry[]
  if (regime === 'new') {
    slabs = regimeRules.slabs
  } else {
    const oldRules = ayRules.regime.old
    if (filerCategory === 'super_senior') {
      slabs = oldRules.slabs_super_senior
    } else if (filerCategory === 'senior') {
      slabs = oldRules.slabs_senior
    } else {
      slabs = oldRules.slabs
    }
  }

  return {
    slabs,
    standardDeductionSalary: regimeRules.standardDeductionSalary,
    section87A: regimeRules.section87A,
    surcharge: regimeRules.surcharge,
    surchargeCapForCG: regime === 'new' ? (regimeRules as typeof ayRules.regime.new).surchargeCapForCG : undefined,
    deductionCaps: regime === 'old' ? (regimeRules as typeof ayRules.regime.old).deductionCaps : undefined,
    specialRates: ayRules.specialRates,
    cess: ayRules.cess,
    carryForward: ayRules.carryForward,
    deadlines: ayRules.deadlines,
    itrForms: ayRules.itrForms,
    surchargeThresholds: ayRules.surchargeThresholds,
  }
}

/**
 * Get the default AY from config.
 */
export function getDefaultAY(): string {
  return taxRules.defaultAY
}

/**
 * Get all available AYs from config.
 */
export function getAvailableAYs(): string[] {
  return Object.keys(taxRules.rules)
}

/**
 * Compute slab tax using a slab array from config.
 * null in `to` means unbounded (top slab).
 */
export function computeSlabTaxFromConfig(income: number, slabs: SlabEntry[]): number {
  if (income <= 0) return 0

  let tax = 0
  for (const slab of slabs) {
    if (income <= slab.from) break
    const upperBound = slab.to === null ? income : slab.to
    const taxableInSlab = Math.min(income, upperBound) - slab.from
    tax += taxableInSlab * slab.rate
  }
  return Math.round(tax)
}

/**
 * Compute surcharge using a surcharge array from config.
 * null in `to` means unbounded.
 */
export function computeSurchargeFromConfig(
  totalIncome: number,
  baseTax: number,
  surchargeConfig: SurchargeEntry[]
): number {
  for (const band of [...surchargeConfig].reverse()) {
    if (totalIncome > band.from) {
      return Math.round(baseTax * band.rate)
    }
  }
  return 0
}

/**
 * Compute Section 87A rebate from config.
 */
export function computeRebateFromConfig(
  slabTax: number,
  slabIncome: number,
  rebateConfig: Section87AConfig
): { eligible: boolean; rebate: number } {
  if (slabIncome > rebateConfig.limit) {
    return { eligible: false, rebate: 0 }
  }
  const maxRebate = rebateConfig.maxRebate ?? slabTax  // New Regime: full rebate; Old Regime: capped
  const rebate = Math.min(slabTax, maxRebate)
  return { eligible: true, rebate }
}

export { taxRules as rawTaxRules }
