import type { EmployerEntry, ScheduleS_v2 } from '../types'
import { getRules } from './taxRules'

/**
 * Compute Schedule S v2 — Multi-employer salary income.
 *
 * Standard deduction: a SINGLE fixed deduction (₹75,000 for AY 2026-27)
 * applied to aggregate salary income regardless of number of employers.
 * For display, it is attributed to the first employer (or proportionally if needed).
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
  const STD_DEDUCTION = rules.standardDeductionSalary  // 75000 from config — applied ONCE total

  // First pass: resolve gross salary, professional tax, TDS per employer
  const resolvedEmployers: EmployerEntry[] = employers.map(emp => {
    const prefix = `S_v2.${emp.id}`
    const gross = overrides[`${prefix}.grossSalary`] ?? emp.grossSalary
    const profTax = overrides[`${prefix}.professionalTax`] ?? emp.professionalTax
    const tds = overrides[`${prefix}.tdsDeducted`] ?? emp.tdsDeducted

    return {
      ...emp,
      grossSalary: gross,
      standardDeduction: 0,  // will be set below
      professionalTax: profTax,
      netTaxableSalary: 0,   // will be computed below
      tdsDeducted: tds,
    }
  })

  const totalGross = resolvedEmployers.reduce((s, e) => s + e.grossSalary, 0)
  const totalProfessionalTax = resolvedEmployers.reduce((s, e) => s + e.professionalTax, 0)
  const totalTDS = resolvedEmployers.reduce((s, e) => s + e.tdsDeducted, 0)

  // Standard deduction is applied ONCE to aggregate salary (capped at gross salary)
  const totalStdDeduction = Math.min(STD_DEDUCTION, totalGross)

  // Compute aggregate net taxable salary
  const totalNetTaxable = overrides['S_v2.totalNetTaxable']
    ?? Math.max(0, totalGross - totalStdDeduction - totalProfessionalTax)

  // Attribute standard deduction to first employer for display
  // (ITR forms show it as a single line item, not per employer)
  if (resolvedEmployers.length > 0) {
    resolvedEmployers[0].standardDeduction = totalStdDeduction
  }

  // Per-employer net taxable: distribute proportionally for display
  if (resolvedEmployers.length === 1) {
    resolvedEmployers[0].netTaxableSalary = totalNetTaxable
  } else {
    // Proportional distribution based on gross salary share
    let allocated = 0
    for (let i = 0; i < resolvedEmployers.length; i++) {
      const emp = resolvedEmployers[i]
      if (i === resolvedEmployers.length - 1) {
        // Last employer gets the remainder to avoid rounding errors
        emp.netTaxableSalary = totalNetTaxable - allocated
      } else {
        const share = totalGross > 0 ? emp.grossSalary / totalGross : 0
        emp.netTaxableSalary = Math.round(totalNetTaxable * share)
        allocated += emp.netTaxableSalary
      }
    }
  }

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
