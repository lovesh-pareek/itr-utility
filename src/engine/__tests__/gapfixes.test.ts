/**
 * Gap-fix verification tests
 *
 * Covers fixes made after the post-Wave-15 audit:
 *  - SET_SELECTED_AY reducer case (was dispatched but missing — Settings AY dropdown was broken)
 *  - generateITR1XML (was a stub-only route)
 *  - generateITR4XML (was a stub-only route)
 *  - generateXML_v2 routing to ITR1/ITR4 generators
 */

import { describe, it, expect } from 'vitest'
import { initialState, appReducer_test } from '../../context/AppContext'
import { generateITR1XML, generateITR4XML, generateXML_v2 } from '../../output/xmlGenerator'
import type { AppState, BankAccount, Form16Data, TaxComputation } from '../../types'

function makeBankAccount(): BankAccount {
  return {
    id: 'ba-1', ifscCode: 'SBIN0001234', accountNumber: '1234567890',
    bankName: 'State Bank of India', accountType: 'savings',
    isRefundAccount: true, isForeign: false,
  }
}

function makeForm16(): Form16Data {
  return {
    grossSalary: 800_000, standardDeduction: 75_000, professionalTax: 0,
    netTaxableSalary: 725_000, tdsDeducted: 30_000,
    pan: 'ABCDE1234F', tanEmployer: 'MUMA12345B', employerName: 'Acme Corp',
    assessmentYear: '2026-27', unresolvedFields: [],
  }
}

function makeTax(totalIncome = 725_000): TaxComputation {
  return {
    totalIncome, slabTaxableIncome: totalIncome, slabTax: 0,
    stcgTax: 0, ltcgTax: 0, subtotalBeforeSurcharge: 0, surcharge: 0,
    totalBeforeCess: 0, cess: 0, totalTaxPayable: 0,
    section87AEligible: true, section87ARebate: 0,
    tdsDeducted: 30_000, advanceTaxPaid: 0, netPayable: -30_000,
  }
}

// ─── SET_SELECTED_AY reducer fix ─────────────────────────────────────────────

describe('Gap fix · SET_SELECTED_AY reducer case', () => {
  it('updates selectedAY when dispatched (was previously a no-op)', () => {
    const s = appReducer_test(initialState, { type: 'SET_SELECTED_AY', ay: '2025-26' })
    expect(s.selectedAY).toBe('2025-26')
  })

  it('does not affect other state slices', () => {
    const s = appReducer_test(initialState, { type: 'SET_SELECTED_AY', ay: '2025-26' })
    expect(s.selectedRegime).toBe(initialState.selectedRegime)
    expect(s.step).toBe(initialState.step)
  })
})

// ─── generateITR1XML ──────────────────────────────────────────────────────────

describe('Gap fix · generateITR1XML', () => {
  function makeState(): AppState {
    return {
      ...initialState,
      tax: makeTax(),
      schedules: {
        S: { grossSalary: 800_000, standardDeduction: 75_000, professionalTax: 0, netTaxableSalary: 725_000 },
        OS: { dividendIncome: 5_000, interestIncome: 2_000, total: 7_000 },
      } as any,
      parsed: { ...initialState.parsed, form16: makeForm16() },
      bankAccounts: [makeBankAccount()],
      selectedITRForm: 'ITR1',
    }
  }

  it('generates valid XML when bank account present', () => {
    const result = generateITR1XML(makeState())
    expect(result.valid).toBe(true)
    expect(result.xml).toContain('<ITR1>')
    expect(result.xml).toContain('<PAN>ABCDE1234F</PAN>')
  })

  it('includes salary and OS schedules but no CG/BP nodes', () => {
    const result = generateITR1XML(makeState())
    expect(result.xml).toContain('<ScheduleTCS>')
    expect(result.xml).toContain('<ScheduleOS>')
    expect(result.xml).not.toContain('<ScheduleCG')
    expect(result.xml).not.toContain('<ScheduleBP')
  })

  it('includes bank account details with refund flag', () => {
    const result = generateITR1XML(makeState())
    expect(result.xml).toContain('<IFSCCode>SBIN0001234</IFSCCode>')
    expect(result.xml).toContain('<RefundAccount>Y</RefundAccount>')
  })

  it('fails validation when no bank account present', () => {
    const state = { ...makeState(), bankAccounts: [] }
    const result = generateITR1XML(state)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/bank account/i)
  })

  it('fails when no tax data available', () => {
    const state = { ...makeState(), tax: null }
    const result = generateITR1XML(state)
    expect(result.valid).toBe(false)
  })
})

// ─── generateITR4XML ──────────────────────────────────────────────────────────

describe('Gap fix · generateITR4XML', () => {
  function makeState(): AppState {
    return {
      ...initialState,
      tax: makeTax(600_000),
      schedules: null,
      schedules_v2: {
        S: { employers: [], totalGross: 0, totalStdDeduction: 0, totalProfessionalTax: 0, totalNetTaxable: 0, totalTDS: 0 },
        HP: { properties: [], totalIncomeFromHP: 0, totalInterest: 0, lossSetOffAgainstSalary: 0, lossRingFenced: 0 },
        CG: {} as any,
        BP: {
          speculativeTurnover: 0, speculativePL: 0,
          presumptiveEntries: [{
            type: 'presumptive_44ADA', grossReceipts: 1_200_000,
            isDigital: false, presumptiveRate: 0.5, presumptiveIncome: 600_000,
          }],
          fno: null, nonSpeculativeIncome: 0, nonSpeculativeLoss: 0,
        } as any,
        OS: { breakdown: {} as any, totalAtSlabRate: 0, totalAt30Pct: 0, total: 0 },
        CYLA: {} as any,
        CFL: { entries: [], totalSpeculative: 0, totalSTCL: 0, totalLTCL: 0, totalHP: 0, totalBusiness: 0 },
      },
      parsed: { ...initialState.parsed, form16: null },
      bankAccounts: [makeBankAccount()],
      selectedITRForm: 'ITR4',
    }
  }

  it('generates valid XML for presumptive 44ADA filer', () => {
    const result = generateITR4XML(makeState())
    expect(result.valid).toBe(true)
    expect(result.xml).toContain('<ITR4>')
    expect(result.xml).toContain('<Sec44ADA>')
  })

  it('includes correct presumptive income figures', () => {
    const result = generateITR4XML(makeState())
    expect(result.xml).toContain('<GrossReceipts>1200000</GrossReceipts>')
    expect(result.xml).toContain('<PresumptiveIncome>600000</PresumptiveIncome>')
  })

  it('fails validation when no bank account present', () => {
    const state = { ...makeState(), bankAccounts: [] }
    const result = generateITR4XML(state)
    expect(result.valid).toBe(false)
  })
})

// ─── generateXML_v2 routing ───────────────────────────────────────────────────

describe('Gap fix · generateXML_v2 routes to correct form generator', () => {
  function baseState(form: AppState['selectedITRForm']): AppState {
    return {
      ...initialState,
      tax: makeTax(),
      schedules: {
        S: { grossSalary: 800_000, standardDeduction: 75_000, professionalTax: 0, netTaxableSalary: 725_000 },
        OS: { dividendIncome: 0, interestIncome: 0, total: 0 },
        CG: { equitySTCG: 0, equityLTCG: 0, mfEquitySTCG: 0, mfEquityLTCG: 0, debtMFGains: 0, netSTCG: 0, taxableLTCG: 0, ltcgExemption: 0, stcl: 0, ltcl: 0 },
        BP: { speculativeTurnover: 0, netSpeculativePnL: 0, carryForward: 0 },
      } as any,
      parsed: { ...initialState.parsed, form16: makeForm16() },
      bankAccounts: [makeBankAccount()],
      selectedITRForm: form,
    }
  }

  it('routes ITR1 → generateITR1XML output shape', () => {
    const result = generateXML_v2(baseState('ITR1'))
    expect(result.valid).toBe(true)
    expect(result.xml).toContain('<ITR1>')
  })

  it('routes ITR4 → generateITR4XML output shape', () => {
    const state = baseState('ITR4')
    state.schedules_v2 = {
      S: { employers: [], totalGross: 0, totalStdDeduction: 0, totalProfessionalTax: 0, totalNetTaxable: 0, totalTDS: 0 },
      HP: { properties: [], totalIncomeFromHP: 0, totalInterest: 0, lossSetOffAgainstSalary: 0, lossRingFenced: 0 },
      CG: {} as any,
      BP: { speculativeTurnover: 0, speculativePL: 0, presumptiveEntries: [], fno: null, nonSpeculativeIncome: 0, nonSpeculativeLoss: 0 } as any,
      OS: { breakdown: {} as any, totalAtSlabRate: 0, totalAt30Pct: 0, total: 0 },
      CYLA: {} as any,
      CFL: { entries: [], totalSpeculative: 0, totalSTCL: 0, totalLTCL: 0, totalHP: 0, totalBusiness: 0 },
    }
    const result = generateXML_v2(state)
    expect(result.valid).toBe(true)
    expect(result.xml).toContain('<ITR4>')
  })

  it('blocks XML generation when no bank account regardless of form', () => {
    const state = { ...baseState('ITR3'), bankAccounts: [] }
    const result = generateXML_v2(state)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/bank account/i)
  })

  it('blocks XML generation when no refund account marked', () => {
    const acc = { ...makeBankAccount(), isRefundAccount: false }
    const state = { ...baseState('ITR3'), bankAccounts: [acc] }
    const result = generateXML_v2(state)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/refund account/i)
  })
})
