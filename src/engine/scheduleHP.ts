import type { HouseProperty, ScheduleHP } from '../types'
import { getRules } from './taxRules'

/**
 * Compute Schedule HP — House Property Income.
 *
 * Self-occupied:
 *   NAV = 0; interest on loan capped at ₹2L (from config 24b_selfOccupied)
 *
 * Let-out / Deemed let-out:
 *   NAV = annualRentReceived − municipalTaxPaid
 *   Standard deduction = 30% of NAV (auto)
 *   Interest on loan: fully deductible (no cap)
 *   incomeFromHP = NAV − 30% − interest
 *
 * HP loss rules:
 *   Old Regime: loss can set off against salary/other income up to ₹2L
 *   New Regime: HP loss is ring-fenced — cannot set off against any other head
 */
export function computeScheduleHP(
  properties: HouseProperty[],
  regime: 'new' | 'old',
  overrides: Record<string, number>,
  ay = '2026-27'
): ScheduleHP {
  const rules = getRules(ay, regime)
  const interestCapSelfOcc = rules.deductionCaps?.['24b_selfOccupied'] ?? 200000

  const resolvedProperties: HouseProperty[] = properties.map(prop => {
    const prefix = `HP.${prop.id}`

    const annualRent = overrides[`${prefix}.annualRentReceived`] ?? prop.annualRentReceived
    const municipalTax = overrides[`${prefix}.municipalTaxPaid`] ?? prop.municipalTaxPaid
    const interestOnLoan = overrides[`${prefix}.interestOnLoan`] ?? prop.interestOnLoan

    let nav = 0
    let stdDed30 = 0
    let effectiveInterest = interestOnLoan

    if (prop.propertyType === 'self_occupied') {
      nav = 0
      stdDed30 = 0
      // Interest capped at ₹2L for self-occupied under both regimes
      effectiveInterest = Math.min(interestOnLoan, interestCapSelfOcc)
    } else {
      // Let-out or deemed let-out
      nav = Math.max(0, annualRent - municipalTax)
      stdDed30 = Math.round(nav * 0.30)
      // Full interest deductible for let-out
      effectiveInterest = interestOnLoan
    }

    const incomeFromHP = nav - stdDed30 - effectiveInterest

    return {
      ...prop,
      annualRentReceived: annualRent,
      municipalTaxPaid: municipalTax,
      netAnnualValue: nav,
      standardDeduction30pct: stdDed30,
      interestOnLoan: effectiveInterest,
      incomeFromHP,
    }
  })

  const totalIncomeFromHP = resolvedProperties.reduce((s, p) => s + p.incomeFromHP, 0)
  const totalInterest = resolvedProperties.reduce((s, p) => s + p.interestOnLoan, 0)

  let lossSetOffAgainstSalary = 0
  let lossRingFenced = 0

  if (totalIncomeFromHP < 0) {
    if (regime === 'old') {
      // Old Regime: HP loss can set off against salary up to ₹2L
      lossSetOffAgainstSalary = Math.min(Math.abs(totalIncomeFromHP), interestCapSelfOcc)
      lossRingFenced = 0
    } else {
      // New Regime: HP loss is ring-fenced
      lossSetOffAgainstSalary = 0
      lossRingFenced = Math.abs(totalIncomeFromHP)
    }
  }

  return {
    properties: resolvedProperties,
    totalIncomeFromHP,
    totalInterest,
    lossSetOffAgainstSalary,
    lossRingFenced,
  }
}
