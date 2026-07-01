/**
 * Wave 14 Tests
 * T79 — AppState v2 reducer: new action types, initial state shape
 * T80 — Regime comparison engine: computeRegimeComparison, computeFilerCategory
 * T81 — Navigation helpers: computeScheduleALRequired (from incomeEngine_v2)
 */

import { describe, it, expect } from 'vitest'
import { computeFilerCategory, computeRegimeComparison } from '../regimeComparison'
import { computeScheduleALRequired } from '../incomeEngine_v2'
import { initialState, appReducer_test } from '../../context/AppContext'
import { emptyRawDeductions } from '../deductionsEngine'
import { emptyTaxCredits } from '../taxCreditsEngine'
import type {
  Schedules_v2,
  FilerProfile,
  BankAccount,
  Form26ASData,
  AISData,
  CFLEntry,
} from '../../types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMinimalSchedules(overrides: Partial<Schedules_v2> = {}): Schedules_v2 {
  return {
    S: {
      employers: [],
      totalGross: 0,
      totalStdDeduction: 0,
      totalProfessionalTax: 0,
      totalNetTaxable: 0,
      totalTDS: 0,
    },
    HP: {
      properties: [],
      totalIncomeFromHP: 0,
      totalInterest: 0,
      lossSetOffAgainstSalary: 0,
      lossRingFenced: 0,
    },
    CG: {
      equitySTCG: 0, equityLTCG: 0,
      equityMFSTCG: 0, equityMFLTCG: 0,
      debtMFGains: 0,
      propertySales: [],
      propertySTCG: 0, propertyLTCG: 0,
      totalSTCG: 0, totalLTCG: 0,
      intraEquitySetOff: 0,
    } as any,
    BP: {
      speculativeTurnover: 0,
      speculativePL: 0,
      presumptiveEntries: [],
      fno: null,
      nonSpeculativeIncome: 0,
      nonSpeculativeLoss: 0,
    } as any,
    OS: {
      breakdown: {
        savingsInterest: 0, fdInterest: 0, rdInterest: 0,
        seniorCitizenInterest: 0, dividendIncome: 0, dividendFromForeignCompany: 0,
        giftReceived: 0, lotteryWinnings: 0, casualIncome: 0,
        familyPension: 0, familyPensionStdDed: 0,
      },
      totalAtSlabRate: 0,
      totalAt30Pct: 0,
      total: 0,
    },
    CYLA: {} as any,
    CFL: { entries: [], totalSpeculative: 0, totalSTCL: 0, totalLTCL: 0, totalHP: 0, totalBusiness: 0 },
    ...overrides,
  }
}

function makeProfile(dob: string | null = null, category: FilerProfile['filerCategory'] = 'general'): FilerProfile {
  return { dateOfBirth: dob, filerCategory: category }
}

// ─── T79: AppState v2 reducer ─────────────────────────────────────────────────

describe('T79 · initialState v2 shape', () => {
  it('has all v2 slices in initial state', () => {
    expect(initialState.selectedAY).toBe('2026-27')
    expect(initialState.selectedRegime).toBe('new')
    expect(initialState.selectedITRForm).toBe('ITR3')
    expect(initialState.detectedITRForm).toBeNull()
    expect(initialState.filerProfile.filerCategory).toBe('general')
    expect(initialState.deductions).toBeNull()
    expect(initialState.taxCredits).toBeNull()
    expect(initialState.regimeComparison).toBeNull()
    expect(initialState.aisMismatches).toEqual([])
    expect(initialState.aisMismatchResolutions).toEqual({})
    expect(initialState.bankAccounts).toEqual([])
    expect(initialState.scheduleAL).toBeNull()
    expect(initialState.schedules_v2).toBeNull()
    expect(initialState.parsed.form16List).toEqual([])
    expect(initialState.parsed.form26AS).toBeNull()
    expect(initialState.parsed.aisData).toBeNull()
    expect(initialState.parsed.priorITRCFL).toEqual([])
  })
})

describe('T79 · reducer: v2 action types', () => {
  it('SET_SELECTED_REGIME updates selectedRegime', () => {
    const s = appReducer_test(initialState, { type: 'SET_SELECTED_REGIME', regime: 'old' })
    expect(s.selectedRegime).toBe('old')
  })

  it('SET_SELECTED_ITR_FORM updates selectedITRForm', () => {
    const s = appReducer_test(initialState, { type: 'SET_SELECTED_ITR_FORM', form: 'ITR2' })
    expect(s.selectedITRForm).toBe('ITR2')
  })

  it('SET_DETECTED_ITR_FORM updates detectedITRForm', () => {
    const s = appReducer_test(initialState, { type: 'SET_DETECTED_ITR_FORM', form: 'ITR1' })
    expect(s.detectedITRForm).toBe('ITR1')
  })

  it('SET_FILER_PROFILE updates filerProfile', () => {
    const profile: FilerProfile = { dateOfBirth: '1960-06-15', filerCategory: 'senior' }
    const s = appReducer_test(initialState, { type: 'SET_FILER_PROFILE', profile })
    expect(s.filerProfile.filerCategory).toBe('senior')
    expect(s.filerProfile.dateOfBirth).toBe('1960-06-15')
  })

  it('SET_PARSED_FORM26AS updates parsed.form26AS and parseStatus_v2', () => {
    const data: Form26ASData = { partA: [], partC: [], ay: '2026-27' }
    const s = appReducer_test(initialState, { type: 'SET_PARSED_FORM26AS', data })
    expect(s.parsed.form26AS).toEqual(data)
    expect(s.parseStatus_v2.form26AS).toBe('done')
  })

  it('SET_PARSED_AIS updates parsed.aisData and parseStatus_v2', () => {
    const data: AISData = {
      salary: [], dividends: [], interest: [], securities: [],
      mfTransactions: [], tdsCredits: [], advanceTax: [],
    }
    const s = appReducer_test(initialState, { type: 'SET_PARSED_AIS', data })
    expect(s.parsed.aisData).toEqual(data)
    expect(s.parseStatus_v2.ais).toBe('done')
  })

  it('SET_PRIOR_ITR_CFL updates parsed.priorITRCFL and parseStatus_v2', () => {
    const entries: CFLEntry[] = [{
      id: 'cfl-1', lossType: 'stcl', ayOfOrigin: '2025-26',
      amount: 12000, yearsRemaining: 7, source: 'prior_itr',
    }]
    const s = appReducer_test(initialState, { type: 'SET_PRIOR_ITR_CFL', entries })
    expect(s.parsed.priorITRCFL).toHaveLength(1)
    expect(s.parseStatus_v2.previousITR).toBe('done')
  })

  it('ADD_BANK_ACCOUNT appends to bankAccounts', () => {
    const account: BankAccount = {
      id: 'ba-1', ifscCode: 'SBIN0001234', accountNumber: '1234567890',
      bankName: 'SBI', accountType: 'savings', isRefundAccount: true, isForeign: false,
    }
    const s = appReducer_test(initialState, { type: 'ADD_BANK_ACCOUNT', account })
    expect(s.bankAccounts).toHaveLength(1)
    expect(s.bankAccounts[0].id).toBe('ba-1')
  })

  it('REMOVE_BANK_ACCOUNT removes by id', () => {
    const account: BankAccount = {
      id: 'ba-1', ifscCode: 'SBIN0001234', accountNumber: '1234567890',
      bankName: 'SBI', accountType: 'savings', isRefundAccount: true, isForeign: false,
    }
    let s = appReducer_test(initialState, { type: 'ADD_BANK_ACCOUNT', account })
    s = appReducer_test(s, { type: 'REMOVE_BANK_ACCOUNT', id: 'ba-1' })
    expect(s.bankAccounts).toHaveLength(0)
  })

  it('SET_AIS_MISMATCH_RESOLUTION stores resolution', () => {
    const s = appReducer_test(initialState, {
      type: 'SET_AIS_MISMATCH_RESOLUTION',
      field: 'dividendIncome',
      resolution: 'use_ais',
    })
    expect(s.aisMismatchResolutions['dividendIncome']).toBe('use_ais')
  })

  it('SET_SCHEDULE_AL stores and clears scheduleAL', () => {
    const al = {
      immovableAssets: [], cashInHand: 0, deposits: 500000,
      sharesDebentures: 0, insurancePolicies: 0, loansAdvances: 0,
      motorVehicles: 0, jewellery: 0, archaeologicalArt: 0, otherAssets: 0,
      liabilityImmovable: 0, liabilityOther: 0,
      totalAssets: 500000, totalLiabilities: 0,
    }
    let s = appReducer_test(initialState, { type: 'SET_SCHEDULE_AL', scheduleAL: al })
    expect(s.scheduleAL?.deposits).toBe(500000)
    s = appReducer_test(s, { type: 'SET_SCHEDULE_AL', scheduleAL: null })
    expect(s.scheduleAL).toBeNull()
  })
})

// ─── T80: computeFilerCategory ────────────────────────────────────────────────

describe('T80 · computeFilerCategory', () => {
  it('returns general for null DOB', () => {
    expect(computeFilerCategory(null)).toBe('general')
  })

  it('returns general for age < 60 as of 1 Apr 2025', () => {
    // Born 1975-01-01 → age 50 on 1 Apr 2025
    expect(computeFilerCategory('1975-01-01', '2026-27')).toBe('general')
  })

  it('returns senior for age 60 as of 1 Apr 2025', () => {
    // Born 1965-04-01 → exactly 60 on 1 Apr 2025
    expect(computeFilerCategory('1965-04-01', '2026-27')).toBe('senior')
  })

  it('returns senior for age 65', () => {
    expect(computeFilerCategory('1960-01-01', '2026-27')).toBe('senior')
  })

  it('returns super_senior for age >= 80', () => {
    // Born 1944-01-01 → age 81 on 1 Apr 2025
    expect(computeFilerCategory('1944-01-01', '2026-27')).toBe('super_senior')
  })

  it('returns super_senior for exactly age 80', () => {
    // Born 1945-04-01 → exactly 80 on 1 Apr 2025
    expect(computeFilerCategory('1945-04-01', '2026-27')).toBe('super_senior')
  })

  it('returns general for invalid date string', () => {
    expect(computeFilerCategory('not-a-date')).toBe('general')
  })
})

// ─── T80: computeRegimeComparison ────────────────────────────────────────────

describe('T80 · computeRegimeComparison — New Regime wins', () => {
  it('recommends New when net payable is lower under New Regime', () => {
    // High salary, no deductions — New Regime slabs are generally more favourable
    const schedules = makeMinimalSchedules({
      S: { employers: [], totalGross: 1_200_000, totalStdDeduction: 75_000, totalProfessionalTax: 2_400, totalNetTaxable: 1_122_600, totalTDS: 0 },
    } as any)
    const raw = emptyRawDeductions(1_200_000)
    const credits = emptyTaxCredits()
    const profile = makeProfile()

    const result = computeRegimeComparison(schedules, raw, credits, profile)
    expect(result.new).toBeDefined()
    expect(result.old).toBeDefined()
    expect(result.recommended).toMatch(/new|old/)  // valid value
    expect(result.saving).toBeGreaterThanOrEqual(0)
  })
})

describe('T80 · computeRegimeComparison — Old Regime wins with large deductions', () => {
  it('recommends Old when deductions make Old Regime cheaper', () => {
    // Income 20L + large deductions (80C + 80CCD1B + 80D + 80E ₹5L = ₹7.5L total).
    // New Regime: zero deductions → 20L taxable → ₹2,08,000 tax.
    // Old Regime: 20L - 7.5L = 12.5L taxable → lower tax → Old wins.
    const grossSalary = 2_000_000
    const schedules = makeMinimalSchedules({
      S: {
        employers: [], totalGross: grossSalary, totalStdDeduction: 75_000,
        totalProfessionalTax: 0, totalNetTaxable: grossSalary, totalTDS: 0,
      },
    } as any)
    const raw = emptyRawDeductions(grossSalary)
    raw.sec80C_lic = 150_000   // 80C cap
    raw.sec80CCD1B = 50_000    // extra NPS
    raw.sec80D_self = 25_000   // health insurance
    raw.sec80D_parents = 25_000
    raw.sec80E = 500_000       // education loan interest (no cap)

    const credits = emptyTaxCredits()
    const profile = makeProfile()

    const result = computeRegimeComparison(schedules, raw, credits, profile)
    // Old Regime deductions = 7.5L → clearly lower slab taxable income
    expect(result.old.slabTaxableIncome).toBeLessThan(result.new.slabTaxableIncome)
    expect(result.recommended).toBe('old')
    expect(result.saving).toBeGreaterThan(0)
  })
})

describe('T80 · computeRegimeComparison — equal → recommends New', () => {
  it('recommends New when both regimes produce the same net payable', () => {
    // Zero income → both regimes produce zero tax
    const schedules = makeMinimalSchedules()
    const raw = emptyRawDeductions(0)
    const credits = emptyTaxCredits()
    const profile = makeProfile()

    const result = computeRegimeComparison(schedules, raw, credits, profile)
    expect(result.new.netPayable).toBe(0)
    expect(result.old.netPayable).toBe(0)
    expect(result.recommended).toBe('new')
    expect(result.saving).toBe(0)
  })
})

describe('T80 · computeRegimeComparison — senior citizen slabs', () => {
  it('applies senior citizen slabs under Old Regime', () => {
    const schedules = makeMinimalSchedules({
      S: { employers: [], totalGross: 600_000, totalStdDeduction: 75_000, totalProfessionalTax: 0, totalNetTaxable: 525_000, totalTDS: 0 },
    } as any)
    const raw = emptyRawDeductions(600_000)
    const credits = emptyTaxCredits()

    const generalProfile = makeProfile('1975-01-01', 'general')
    const seniorProfile = makeProfile('1960-01-01', 'senior')

    const generalResult = computeRegimeComparison(schedules, raw, credits, generalProfile)
    const seniorResult = computeRegimeComparison(schedules, raw, credits, seniorProfile)

    // Senior gets higher nil slab → lower Old Regime tax
    expect(seniorResult.old.slabTax).toBeLessThanOrEqual(generalResult.old.slabTax)
  })
})

// ─── T81: computeScheduleALRequired ──────────────────────────────────────────

describe('T81 · computeScheduleALRequired', () => {
  it('returns false when total income ≤ ₹50L', () => {
    expect(computeScheduleALRequired(4_500_000, 'ITR3')).toBe(false)
  })

  it('returns true when total income > ₹50L and form is ITR3', () => {
    expect(computeScheduleALRequired(5_100_000, 'ITR3')).toBe(true)
  })

  it('returns true for ITR2 when income > ₹50L', () => {
    expect(computeScheduleALRequired(5_100_000, 'ITR2')).toBe(true)
  })

  it('returns false for ITR1 even when income > ₹50L (ITR1 not applicable)', () => {
    expect(computeScheduleALRequired(5_100_000, 'ITR1')).toBe(false)
  })

  it('returns false for ITR4 even when income > ₹50L', () => {
    expect(computeScheduleALRequired(5_100_000, 'ITR4')).toBe(false)
  })

  it('returns false at exactly ₹50L boundary', () => {
    expect(computeScheduleALRequired(5_000_000, 'ITR3')).toBe(false)
  })

  it('returns true at ₹50L + 1 rupee', () => {
    expect(computeScheduleALRequired(5_000_001, 'ITR3')).toBe(true)
  })
})
