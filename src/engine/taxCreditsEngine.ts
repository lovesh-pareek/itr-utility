/**
 * Tax Credits Engine + Bank Account Validation
 *
 * computeNetPayable(totalTax, credits) → net payable / refund
 * validateBankAccount(account) → validation result
 * lookupBankName(ifsc) → bank name from IFSC prefix table
 */

import type { TaxCredits, TDSEntry, ChallanEntry, BankAccount } from '../types'
import ifscPrefixes from '../../public/config/ifsc-prefixes.json'

// ─── Tax Credits Computation ──────────────────────────────────────────────────

/**
 * Aggregate all tax credits from their constituent parts.
 * Derives totalTDSDeducted, totalAdvanceTax, totalSelfAssessment, totalCredits.
 */
export function computeTaxCredits(
  tdsEntries: TDSEntry[],
  advanceTaxPaid: ChallanEntry[],
  selfAssessmentTax: ChallanEntry[],
  tcsCredits = 0
): TaxCredits {
  const totalTDSDeducted = tdsEntries.reduce((sum, e) => sum + e.tdsAmount, 0)
  const totalAdvanceTax = advanceTaxPaid.reduce((sum, e) => sum + e.amount, 0)
  const totalSelfAssessment = selfAssessmentTax.reduce((sum, e) => sum + e.amount, 0)
  const totalCredits = totalTDSDeducted + totalAdvanceTax + totalSelfAssessment + tcsCredits

  return {
    tdsEntries,
    advanceTaxPaid,
    selfAssessmentTax,
    tcsCredits,
    totalTDSDeducted,
    totalAdvanceTax,
    totalSelfAssessment,
    totalCredits,
  }
}

/**
 * Compute net tax payable (positive) or refund (negative).
 */
export function computeNetPayable(
  totalTax: number,
  credits: TaxCredits
): number {
  return totalTax - credits.totalCredits
}

/**
 * Empty TaxCredits object — useful as initial state.
 */
export function emptyTaxCredits(): TaxCredits {
  return {
    tdsEntries: [],
    advanceTaxPaid: [],
    selfAssessmentTax: [],
    tcsCredits: 0,
    totalTDSDeducted: 0,
    totalAdvanceTax: 0,
    totalSelfAssessment: 0,
    totalCredits: 0,
  }
}

// ─── Bank Account Validation ──────────────────────────────────────────────────

export interface BankAccountValidationResult {
  valid: boolean
  errors: {
    ifsc?: string
    accountNumber?: string
  }
}

const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/

/**
 * Validate a bank account entry.
 * IFSC: 4 letters + 0 + 6 alphanumeric characters (11 chars total)
 * Account number: 9–18 numeric digits
 */
export function validateBankAccount(
  account: Pick<BankAccount, 'ifscCode' | 'accountNumber'>
): BankAccountValidationResult {
  const errors: BankAccountValidationResult['errors'] = {}

  if (!IFSC_PATTERN.test(account.ifscCode.toUpperCase())) {
    errors.ifsc = 'Invalid IFSC code. Format: 4 letters + 0 + 6 alphanumeric (e.g. SBIN0001234)'
  }

  const digits = account.accountNumber.replace(/\s/g, '')
  if (!/^\d{9,18}$/.test(digits)) {
    errors.accountNumber = 'Account number must be 9–18 digits'
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  }
}

/**
 * Look up bank name from IFSC prefix (first 4 characters).
 * Returns null if not found in the bundled prefix table.
 */
export function lookupBankName(ifscCode: string): string | null {
  const prefix = ifscCode.slice(0, 4).toUpperCase()
  const table = ifscPrefixes as Record<string, string>
  return table[prefix] ?? null
}

/**
 * Mask an account number — show only last 4 digits.
 */
export function maskAccountNumber(accountNumber: string): string {
  const digits = accountNumber.replace(/\s/g, '')
  if (digits.length <= 4) return digits
  const visible = digits.slice(-4)
  const masked = '●'.repeat(Math.min(digits.length - 4, 8))
  return masked + visible
}

/**
 * Validate the full set of bank accounts for ITR compliance.
 * Rules: at least one account, exactly one refund account.
 */
export function validateBankAccountSet(accounts: BankAccount[]): {
  valid: boolean
  errors: string[]
} {
  const errors: string[] = []

  if (accounts.length === 0) {
    errors.push('At least one bank account is required before downloading XML.')
    return { valid: false, errors }
  }

  const refundAccounts = accounts.filter(a => a.isRefundAccount)
  if (refundAccounts.length === 0) {
    errors.push('Mark one account as refund account before downloading XML.')
  } else if (refundAccounts.length > 1) {
    errors.push('Only one account can be marked as refund account.')
  }

  // Validate each account's format
  for (const account of accounts) {
    const result = validateBankAccount(account)
    if (!result.valid) {
      const name = account.bankName || account.ifscCode
      if (result.errors.ifsc) errors.push(`${name}: ${result.errors.ifsc}`)
      if (result.errors.accountNumber) errors.push(`${name}: ${result.errors.accountNumber}`)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}

// ─── Advance Tax Due Date Validation ─────────────────────────────────────────

export interface AdvanceTaxInstalment {
  dueDate: string    // ISO date
  label: string
  minCumulativePct: number  // % of total tax that should have been paid by this date
}

/**
 * Standard advance tax due dates for FY 2025-26.
 * If a challan date is later than the due date, the instalment may attract interest.
 */
export const ADVANCE_TAX_INSTALMENTS: AdvanceTaxInstalment[] = [
  { dueDate: '2025-06-15', label: '1st instalment (15 Jun)', minCumulativePct: 0.15 },
  { dueDate: '2025-09-15', label: '2nd instalment (15 Sep)', minCumulativePct: 0.45 },
  { dueDate: '2025-12-15', label: '3rd instalment (15 Dec)', minCumulativePct: 0.75 },
  { dueDate: '2026-03-15', label: '4th instalment (15 Mar)', minCumulativePct: 1.00 },
]
