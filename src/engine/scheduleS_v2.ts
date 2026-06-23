import type { EmployerEntry, ScheduleS_v2 } from '../types'
import { getRules } from './taxRules'

/**
 * Compute Schedule S v2 — Multi-employer salary income.
 *
 * Each employer contributes: gross salary, standard deduction (fixed ₹75,000
 * under New Regime per employer), professional tax, net taxable salary, TDS.
 *
 * Overrides keyed as: `S_v2.{employerId}.grossSalary`, etc.
 */
export function computeScheduleS_v2(
  employers: EmployerEntry[],
  overrides: Record<string, number>,
  ay = '2026-27',
  regime: 'new' | 'old' = 'new'
): ScheduleS_v2 {
  const rules = getRules(ay, regime)
  const STD_DEDUCTION = rules.standardDeductionSalary  // 75000 from config

  const resolvedEmployers: EmployerEntry[] = employers.map(emp => {
    const prefix = `S_v2.${emp.id}`
    const gross = overrides[`${prefix}.grossSalary`] ?? emp.grossSalary
    const profTax = overrides[`${prefix}.professionalTax`] ?? emp.professionalTax
    const tds = overrides[`${prefix}.tdsDeducted`] ?? emp.tdsDeducted
    // Standard deduction is fixed per employer under New Regime — not overridable
    const stdDed = STD_DEDUCTION
    const netTaxable = overrides[`${prefix}.netTaxableSalary`] ?? Math.max(0, gross - stdDed - profTax)

    return {
      ...emp,
      grossSalary: gross,
      standardDeduction: stdDed,
      professionalTax: profTax,
      netTaxableSalary: netTaxable,
      tdsDeducted: tds,
    }
  })

  const totalGross = resolvedEmployers.reduce((s, e) => s + e.grossSalary, 0)
  const totalStdDeduction = resolvedEmployers.reduce((s, e) => s + e.standardDeduction, 0)
  const totalProfessionalTax = resolvedEmployers.reduce((s, e) => s + e.professionalTax, 0)
  const totalNetTaxable = resolvedEmployers.reduce((s, e) => s + e.netTaxableSalary, 0)
  const totalTDS = resolvedEmployers.reduce((s, e) => s + e.tdsDeducted, 0)

  return {
    employers: resolvedEmployers,
    totalGross,
    totalStdDeduction,
    totalProfessionalTax,
    totalNetTaxable,
    totalTDS,
  }
}

/**
 * Build a single EmployerEntry from a Form16Data object.
 * Adapter for backward compat when migrating v1 form16 data.
 */
export function employerFromForm16(
  form16: { grossSalary: number; standardDeduction: number; professionalTax: number; netTaxableSalary: number; tdsDeducted: number; employerName: string; tanEmployer: string },
  id = 'emp_1'
): EmployerEntry {
  return {
    id,
    employerName: form16.employerName,
    tan: form16.tanEmployer,
    grossSalary: form16.grossSalary,
    standardDeduction: form16.standardDeduction,
    professionalTax: form16.professionalTax,
    netTaxableSalary: form16.netTaxableSalary,
    tdsDeducted: form16.tdsDeducted,
    form16Available: true,
  }
}

/**
 * Compute filer category from date of birth and AY.
 * Age reference date: 1 April of (AY start year - 1)
 * For AY "2026-27" → age as of 1 Apr 2025
 */
export function computeFilerCategory(
  dateOfBirth: string | null,
  ay = '2026-27'
): import('../types').FilerCategory {
  if (!dateOfBirth) return 'general'

  const match = ay.match(/^(\d{4})-/)
  if (!match) return 'general'

  const ayStartYear = parseInt(match[1])
  const referenceDate = new Date(`${ayStartYear - 1}-04-01`)
  const dob = new Date(dateOfBirth)

  if (isNaN(dob.getTime())) return 'general'

  let age = referenceDate.getFullYear() - dob.getFullYear()
  const monthDiff = referenceDate.getMonth() - dob.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getDate() < dob.getDate())) {
    age--
  }

  if (age >= 80) return 'super_senior'
  if (age >= 60) return 'senior'
  return 'general'
}
