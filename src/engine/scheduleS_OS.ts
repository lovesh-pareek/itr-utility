import type { Form16Data, BrokerData, ScheduleS, ScheduleOS } from '../types'

const STANDARD_DEDUCTION = 75_000   // Fixed under New Regime FY 2025-26

/**
 * Compute Schedule S — Salary income.
 * Net taxable salary = Gross − Standard deduction − Professional tax.
 * Manual overrides keyed as "S.grossSalary", "S.professionalTax", etc.
 */
export function computeScheduleS(
  form16: Form16Data | null,
  overrides: Record<string, number>
): ScheduleS {
  const grossSalary   = overrides['S.grossSalary']       ?? form16?.grossSalary       ?? 0
  const professionalTax = overrides['S.professionalTax'] ?? form16?.professionalTax   ?? 0

  // Standard deduction is fixed — not overridable per New Regime rules
  const standardDeduction = STANDARD_DEDUCTION

  const netTaxableSalary =
    overrides['S.netTaxableSalary'] ??
    Math.max(0, grossSalary - standardDeduction - professionalTax)

  return {
    grossSalary,
    standardDeduction,
    professionalTax,
    netTaxableSalary,
    source: form16
      ? `Form 16 · ${form16.employerName || 'Employer'} · TAN: ${form16.tanEmployer || '—'}`
      : 'No Form 16 loaded',
  }
}

/**
 * Compute Schedule OS — Other sources income.
 * Covers dividends (from broker data) and interest income (manual entry only).
 */
export function computeScheduleOS(
  broker: BrokerData | null,
  overrides: Record<string, number>
): ScheduleOS {
  const dividendIncome = overrides['OS.dividendIncome'] ?? broker?.dividends.total ?? 0
  const interestIncome = overrides['OS.interestIncome'] ?? 0

  return {
    dividendIncome,
    interestIncome,
    total: dividendIncome + interestIncome,
  }
}
