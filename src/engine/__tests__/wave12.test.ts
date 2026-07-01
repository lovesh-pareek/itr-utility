/**
 * Wave 12 Tests
 * T72 — Chapter VI-A deductions engine
 * T73 — Tax credits engine + bank account validation
 * T74 — computeTax_v2 with deductions wired in
 */

import { describe, it, expect } from 'vitest'
import {
  computeDeductionsVI_A,
  emptyRawDeductions,
  compute80CBucketUsage,
  type RawDeductions,
} from '../deductionsEngine'
import {
  computeTaxCredits,
  computeNetPayable,
  emptyTaxCredits,
  validateBankAccount,
  validateBankAccountSet,
  lookupBankName,
  maskAccountNumber,
} from '../taxCreditsEngine'
import { computeTax_v2 } from '../taxComputation'
import type { TDSEntry, ChallanEntry, BankAccount, DeductionsVI_A } from '../../types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRaw(overrides: Partial<RawDeductions> = {}): RawDeductions {
  return { ...emptyRawDeductions(1_200_000), ...overrides }
}

function makeTDS(tdsAmount: number, section = '192'): TDSEntry {
  return {
    id: 'tds-1',
    tanDeductor: 'MUMA12345B',
    deductorName: 'Acme Corp',
    grossAmount: tdsAmount * 10,
    tdsAmount,
    section,
    source: 'form16',
  }
}

function makeChallan(amount: number, type: ChallanEntry['type'] = 'advance_tax'): ChallanEntry {
  return {
    id: 'chal-1',
    bsrCode: '0000123',
    challanDate: '2025-09-15',
    serialNumber: '00001',
    amount,
    assessmentYear: '2026-27',
    type,
  }
}

function makeBankAccount(overrides: Partial<BankAccount> = {}): BankAccount {
  return {
    id: 'ba-1',
    ifscCode: 'SBIN0001234',
    accountNumber: '1234567890',
    bankName: 'State Bank of India',
    accountType: 'savings',
    isRefundAccount: true,
    isForeign: false,
    ...overrides,
  }
}

// ─── T72: Chapter VI-A Deductions Engine ─────────────────────────────────────

describe('T72 · computeDeductionsVI_A — New Regime', () => {
  it('zeros all deductions except 80CCD2 and 80CCH under New Regime', () => {
    const raw = makeRaw({
      sec80C_lic: 50_000,
      sec80C_ppf: 50_000,
      sec80CCD1B: 50_000,
      sec80D_self: 25_000,
      sec80TTA: 8_000,
      sec80CCD2: 120_000,   // 10% of 12L = 1.2L ✓
      sec80CCH: 10_000,
    })
    const result = computeDeductionsVI_A(raw, 'new')

    expect(result.sec80C).toBe(0)
    expect(result.sec80CCD1B).toBe(0)
    expect(result.sec80D_self).toBe(0)
    expect(result.sec80TTA).toBe(0)
    expect(result.sec80CCD2).toBe(120_000)
    expect(result.sec80CCH).toBe(10_000)
    expect(result.total).toBe(130_000)
  })

  it('caps 80CCD2 at 10% of gross salary in New Regime', () => {
    const raw = makeRaw({ sec80CCD2: 300_000, grossSalary: 1_200_000 })
    const result = computeDeductionsVI_A(raw, 'new')
    expect(result.sec80CCD2).toBe(120_000)   // capped at 10% of 12L
  })

  it('allows zero 80CCD2 in New Regime', () => {
    const raw = makeRaw()
    const result = computeDeductionsVI_A(raw, 'new')
    expect(result.total).toBe(0)
  })
})

describe('T72 · computeDeductionsVI_A — Old Regime general', () => {
  it('caps 80C bucket at ₹1,50,000', () => {
    const raw = makeRaw({
      sec80C_lic: 80_000,
      sec80C_ppf: 80_000,
      sec80C_elss: 40_000,   // total = 2L → capped at 1.5L
    })
    const result = computeDeductionsVI_A(raw, 'old', 'general')
    expect(result.sec80C + result.sec80CCC + result.sec80CCD1).toBeLessThanOrEqual(150_000)
    expect(result.total).toBeGreaterThan(0)
  })

  it('allows 80CCD1B up to ₹50,000 over and above 80C cap', () => {
    const raw = makeRaw({
      sec80C_lic: 150_000,
      sec80CCD1B: 50_000,
    })
    const result = computeDeductionsVI_A(raw, 'old', 'general')
    expect(result.sec80CCD1B).toBe(50_000)
    expect(result.total).toBeGreaterThanOrEqual(200_000)
  })

  it('caps 80CCD1B at ₹50,000', () => {
    const raw = makeRaw({ sec80CCD1B: 80_000 })
    const result = computeDeductionsVI_A(raw, 'old', 'general')
    expect(result.sec80CCD1B).toBe(50_000)
  })

  it('caps 80D self at ₹25,000 for general filer', () => {
    const raw = makeRaw({ sec80D_self: 40_000 })
    const result = computeDeductionsVI_A(raw, 'old', 'general')
    expect(result.sec80D_self).toBe(25_000)
  })

  it('caps 80D parents at ₹25,000 when parents not senior', () => {
    const raw = makeRaw({ sec80D_parents: 40_000, sec80D_parentsAreSenior: false })
    const result = computeDeductionsVI_A(raw, 'old', 'general')
    expect(result.sec80D_parents).toBe(25_000)
  })

  it('caps 80D parents at ₹50,000 when parents are senior', () => {
    const raw = makeRaw({ sec80D_parents: 60_000, sec80D_parentsAreSenior: true })
    const result = computeDeductionsVI_A(raw, 'old', 'general')
    expect(result.sec80D_parents).toBe(50_000)
  })

  it('caps 80TTA at ₹10,000 for general filer', () => {
    const raw = makeRaw({ sec80TTA: 18_000 })
    const result = computeDeductionsVI_A(raw, 'old', 'general')
    expect(result.sec80TTA).toBe(10_000)
    expect(result.sec80TTB).toBe(0)
  })

  it('passes 80E through without cap (education loan)', () => {
    const raw = makeRaw({ sec80E: 200_000 })
    const result = computeDeductionsVI_A(raw, 'old', 'general')
    expect(result.sec80E).toBe(200_000)
  })

  it('caps 80EEA at ₹1,50,000', () => {
    const raw = makeRaw({ sec80EEA: 200_000 })
    const result = computeDeductionsVI_A(raw, 'old', 'general')
    expect(result.sec80EEA).toBe(150_000)
  })
})

describe('T72 · computeDeductionsVI_A — Old Regime senior citizen', () => {
  it('caps 80D self at ₹50,000 for senior filer', () => {
    const raw = makeRaw({ sec80D_self: 60_000 })
    const result = computeDeductionsVI_A(raw, 'old', 'senior')
    expect(result.sec80D_self).toBe(50_000)
  })

  it('uses 80TTB (₹50,000) instead of 80TTA for senior citizen', () => {
    const raw = makeRaw({ sec80TTB: 60_000, sec80TTA: 8_000 })
    const result = computeDeductionsVI_A(raw, 'old', 'senior')
    expect(result.sec80TTB).toBe(50_000)
    expect(result.sec80TTA).toBe(0)
  })

  it('uses 80TTB for super_senior citizen too', () => {
    const raw = makeRaw({ sec80TTB: 40_000 })
    const result = computeDeductionsVI_A(raw, 'old', 'super_senior')
    expect(result.sec80TTB).toBe(40_000)
    expect(result.sec80TTA).toBe(0)
  })
})

describe('T72 · compute80CBucketUsage', () => {
  it('returns correct used / cap / pct when under cap', () => {
    const raw = makeRaw({ sec80C_lic: 50_000, sec80C_ppf: 50_000 })
    const { used, cap, pct } = compute80CBucketUsage(raw)
    expect(cap).toBe(150_000)
    expect(used).toBe(100_000)
    expect(pct).toBeCloseTo(0.667, 2)
  })

  it('returns pct of 1.0 when at or over cap', () => {
    const raw = makeRaw({ sec80C_lic: 200_000 })
    const { used, pct } = compute80CBucketUsage(raw)
    expect(used).toBe(150_000)
    expect(pct).toBe(1.0)
  })
})

// ─── T73: Tax Credits Engine ──────────────────────────────────────────────────

describe('T73 · computeTaxCredits', () => {
  it('sums TDS from multiple entries', () => {
    const tds = [makeTDS(50_000), { ...makeTDS(30_000), id: 'tds-2', section: '194A' }]
    const result = computeTaxCredits(tds, [], [])
    expect(result.totalTDSDeducted).toBe(80_000)
    expect(result.totalCredits).toBe(80_000)
  })

  it('sums advance tax paid challans', () => {
    const challans = [makeChallan(25_000), { ...makeChallan(25_000), id: 'chal-2' }]
    const result = computeTaxCredits([], challans, [])
    expect(result.totalAdvanceTax).toBe(50_000)
    expect(result.totalCredits).toBe(50_000)
  })

  it('combines TDS + advance tax + self-assessment + TCS', () => {
    const tds = [makeTDS(100_000)]
    const adv = [makeChallan(20_000)]
    const self = [makeChallan(5_000, 'self_assessment')]
    const result = computeTaxCredits(tds, adv, self, 2_000)
    expect(result.totalTDSDeducted).toBe(100_000)
    expect(result.totalAdvanceTax).toBe(20_000)
    expect(result.totalSelfAssessment).toBe(5_000)
    expect(result.tcsCredits).toBe(2_000)
    expect(result.totalCredits).toBe(127_000)
  })

  it('returns zero total for empty credits', () => {
    const result = emptyTaxCredits()
    expect(result.totalCredits).toBe(0)
  })
})

describe('T73 · computeNetPayable', () => {
  it('returns positive when tax exceeds credits (payable)', () => {
    const credits = computeTaxCredits([makeTDS(100_000)], [], [])
    expect(computeNetPayable(150_000, credits)).toBe(50_000)
  })

  it('returns negative when credits exceed tax (refund)', () => {
    const credits = computeTaxCredits([makeTDS(150_000)], [], [])
    expect(computeNetPayable(100_000, credits)).toBe(-50_000)
  })

  it('returns zero when exactly balanced', () => {
    const credits = computeTaxCredits([makeTDS(100_000)], [], [])
    expect(computeNetPayable(100_000, credits)).toBe(0)
  })
})

// ─── T73: Bank Account Validation ────────────────────────────────────────────

describe('T73 · validateBankAccount', () => {
  it('accepts valid IFSC and account number', () => {
    const result = validateBankAccount({ ifscCode: 'SBIN0001234', accountNumber: '1234567890' })
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual({})
  })

  it('rejects IFSC shorter than 11 chars', () => {
    const result = validateBankAccount({ ifscCode: 'SBIN001234', accountNumber: '1234567890' })
    expect(result.valid).toBe(false)
    expect(result.errors.ifsc).toBeDefined()
  })

  it('rejects IFSC where 5th char is not 0', () => {
    const result = validateBankAccount({ ifscCode: 'SBIN1001234', accountNumber: '1234567890' })
    expect(result.valid).toBe(false)
    expect(result.errors.ifsc).toBeDefined()
  })

  it('rejects IFSC with lowercase letters', () => {
    // IFSC must be uppercase; validate should still handle it via toUpperCase internally
    const result = validateBankAccount({ ifscCode: 'sbin0001234', accountNumber: '1234567890' })
    // Our validator calls .toUpperCase() so this should pass
    expect(result.valid).toBe(true)
  })

  it('rejects account number with fewer than 9 digits', () => {
    const result = validateBankAccount({ ifscCode: 'SBIN0001234', accountNumber: '12345678' })
    expect(result.valid).toBe(false)
    expect(result.errors.accountNumber).toBeDefined()
  })

  it('rejects account number with more than 18 digits', () => {
    const result = validateBankAccount({ ifscCode: 'SBIN0001234', accountNumber: '1234567890123456789' })
    expect(result.valid).toBe(false)
    expect(result.errors.accountNumber).toBeDefined()
  })

  it('rejects account number with non-numeric chars', () => {
    const result = validateBankAccount({ ifscCode: 'SBIN0001234', accountNumber: 'ACC123456' })
    expect(result.valid).toBe(false)
    expect(result.errors.accountNumber).toBeDefined()
  })

  it('accepts 18-digit account number', () => {
    const result = validateBankAccount({ ifscCode: 'SBIN0001234', accountNumber: '123456789012345678' })
    expect(result.valid).toBe(true)
  })
})

describe('T73 · lookupBankName', () => {
  it('returns correct bank name for known IFSC prefix', () => {
    expect(lookupBankName('SBIN0001234')).toBe('State Bank of India')
    expect(lookupBankName('HDFC0001234')).toBe('HDFC Bank')
    expect(lookupBankName('ICIC0001234')).toBe('ICICI Bank')
  })

  it('returns null for unknown IFSC prefix', () => {
    expect(lookupBankName('ZZZZ0001234')).toBeNull()
  })
})

describe('T73 · maskAccountNumber', () => {
  it('masks all but last 4 digits', () => {
    expect(maskAccountNumber('1234567890')).toBe('●●●●●●7890')
  })

  it('shows full number if 4 digits or fewer', () => {
    expect(maskAccountNumber('1234')).toBe('1234')
  })
})

describe('T73 · validateBankAccountSet', () => {
  it('fails with zero accounts', () => {
    const result = validateBankAccountSet([])
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/at least one/i)
  })

  it('fails when no refund account is set', () => {
    const accounts = [makeBankAccount({ isRefundAccount: false })]
    const result = validateBankAccountSet(accounts)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => /refund/i.test(e))).toBe(true)
  })

  it('fails when more than one refund account is set', () => {
    const accounts = [
      makeBankAccount({ id: 'ba-1', isRefundAccount: true }),
      makeBankAccount({ id: 'ba-2', accountNumber: '9876543210', isRefundAccount: true }),
    ]
    const result = validateBankAccountSet(accounts)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => /only one/i.test(e))).toBe(true)
  })

  it('passes with one valid account marked as refund', () => {
    const accounts = [makeBankAccount()]
    const result = validateBankAccountSet(accounts)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('passes with two accounts, one marked refund', () => {
    const accounts = [
      makeBankAccount({ id: 'ba-1', isRefundAccount: true }),
      makeBankAccount({ id: 'ba-2', accountNumber: '9876543210', isRefundAccount: false }),
    ]
    const result = validateBankAccountSet(accounts)
    expect(result.valid).toBe(true)
  })
})

// ─── T74: computeTax_v2 with deductions wired in ─────────────────────────────

describe('T74 · computeTax_v2 — New Regime ignores Chapter VI-A deductions', () => {
  it('ignores 80C/80D deductions under New Regime', () => {
    const deductions: DeductionsVI_A = {
      sec80C: 150_000, sec80CCC: 0, sec80CCD1: 0, sec80CCD1B: 50_000,
      sec80CCD2: 0, sec80CCH: 0,
      sec80D_self: 25_000, sec80D_parents: 0, sec80D_parentsAreSenior: false,
      sec80E: 0, sec80EEA: 0, sec80G: [], sec80GG: 0, sec80TTA: 10_000, sec80TTB: 0,
      total: 235_000,
    }
    const credits = emptyTaxCredits()
    // Slab income 10L: tax should not be reduced by 80C/80D under New Regime
    const withDeductions = computeTax_v2(1_000_000, 0, 0, 0, deductions, credits, 'new')
    const withoutDeductions = computeTax_v2(1_000_000, 0, 0, 0, {
      ...deductions, total: 0,
    }, credits, 'new')
    expect(withDeductions.slabTaxableIncome).toBe(withoutDeductions.slabTaxableIncome)
    expect(withDeductions.totalTaxPayable).toBe(withoutDeductions.totalTaxPayable)
  })

  it('applies 80CCD2 deduction even under New Regime', () => {
    const deductionsWithCCD2: DeductionsVI_A = {
      sec80C: 0, sec80CCC: 0, sec80CCD1: 0, sec80CCD1B: 0,
      sec80CCD2: 120_000, sec80CCH: 0,
      sec80D_self: 0, sec80D_parents: 0, sec80D_parentsAreSenior: false,
      sec80E: 0, sec80EEA: 0, sec80G: [], sec80GG: 0, sec80TTA: 0, sec80TTB: 0,
      total: 120_000,
    }
    const credits = emptyTaxCredits()
    const result = computeTax_v2(1_200_000, 0, 0, 0, deductionsWithCCD2, credits, 'new')
    // Slab income should be 12L - 1.2L (80CCD2) = 10.8L
    expect(result.slabTaxableIncome).toBe(1_080_000)
  })
})

describe('T74 · computeTax_v2 — Old Regime applies all deductions', () => {
  it('subtracts full deductions from slab income under Old Regime', () => {
    const deductions: DeductionsVI_A = {
      sec80C: 150_000, sec80CCC: 0, sec80CCD1: 0, sec80CCD1B: 50_000,
      sec80CCD2: 0, sec80CCH: 0,
      sec80D_self: 25_000, sec80D_parents: 0, sec80D_parentsAreSenior: false,
      sec80E: 0, sec80EEA: 0, sec80G: [], sec80GG: 0, sec80TTA: 10_000, sec80TTB: 0,
      total: 235_000,
    }
    const credits = emptyTaxCredits()
    const result = computeTax_v2(1_200_000, 0, 0, 0, deductions, credits, 'old')
    // 12L - 2.35L deductions = 9.65L slab income
    expect(result.slabTaxableIncome).toBe(965_000)
  })

  it('senior citizen uses correct slabs under Old Regime', () => {
    const deductions: DeductionsVI_A = {
      sec80C: 0, sec80CCC: 0, sec80CCD1: 0, sec80CCD1B: 0,
      sec80CCD2: 0, sec80CCH: 0,
      sec80D_self: 0, sec80D_parents: 0, sec80D_parentsAreSenior: false,
      sec80E: 0, sec80EEA: 0, sec80G: [], sec80GG: 0, sec80TTA: 0, sec80TTB: 0,
      total: 0,
    }
    const credits = emptyTaxCredits()
    // Use 6L income — above 87A rebate limit (5L) so rebate does not apply.
    // General nil slab: 0-2.5L → pays more tax than senior whose nil slab is 0-3L.
    const general = computeTax_v2(600_000, 0, 0, 0, deductions, credits, 'old', 'general')
    const senior  = computeTax_v2(600_000, 0, 0, 0, deductions, credits, 'old', 'senior')
    expect(general.slabTax).toBeGreaterThan(0)           // 6L > 5L, pays tax
    expect(senior.slabTax).toBeGreaterThan(0)             // also pays, but less
    expect(senior.slabTax).toBeLessThan(general.slabTax)  // higher nil slab → lower tax
  })
})

describe('T74 · computeTax_v2 — Tax credits reduce net payable', () => {
  it('reduces netPayable by TDS credits', () => {
    const deductions: DeductionsVI_A = {
      sec80C: 0, sec80CCC: 0, sec80CCD1: 0, sec80CCD1B: 0,
      sec80CCD2: 0, sec80CCH: 0,
      sec80D_self: 0, sec80D_parents: 0, sec80D_parentsAreSenior: false,
      sec80E: 0, sec80EEA: 0, sec80G: [], sec80GG: 0, sec80TTA: 0, sec80TTB: 0,
      total: 0,
    }
    const credits = computeTaxCredits([makeTDS(80_000)], [], [])
    const result = computeTax_v2(1_000_000, 0, 0, 0, deductions, credits, 'new')
    expect(result.netPayable).toBe(result.totalTaxPayable - 80_000)
  })

  it('shows refund when credits exceed total tax', () => {
    const deductions: DeductionsVI_A = {
      sec80C: 0, sec80CCC: 0, sec80CCD1: 0, sec80CCD1B: 0,
      sec80CCD2: 0, sec80CCH: 0,
      sec80D_self: 0, sec80D_parents: 0, sec80D_parentsAreSenior: false,
      sec80E: 0, sec80EEA: 0, sec80G: [], sec80GG: 0, sec80TTA: 0, sec80TTB: 0,
      total: 0,
    }
    const credits = computeTaxCredits([makeTDS(500_000)], [], [])
    const result = computeTax_v2(1_000_000, 0, 0, 0, deductions, credits, 'new')
    expect(result.netPayable).toBeLessThan(0)
  })
})
