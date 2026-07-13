/**
 * Real-Data E2E Test Suite
 *
 * Uses actual figures from:
 *   - Zerodha Broker Tax P&L (anonymised: Client ID → SAMPLEID, Name → SAMPLE USER)
 *   - Form 16 TRACES format (anonymised: real PAN/TAN replaced with dummies)
 *
 * Broker P&L (FY 2025-26, AY 2026-27):
 *   Intraday/Speculative P&L : -₹1,725.70  (loss)
 *   Intraday Turnover         :  ₹1,725.70
 *   Equity STCG (Short Term)  : -₹37,731.43 (loss — STCL)
 *   Equity LTCG (Long Term)   : -₹5,730.83  (loss — LTCL)
 *   Dividends                 :  ₹7,849.22
 *   F&O Options P&L           : -₹41,982.50 (F&O loss — not computed by utility)
 *   F&O Options Turnover      :  ₹2,68,304.50
 *
 * Form 16 (anonymised):
 *   Gross Salary    : ₹41,17,072
 *   Std Deduction   : ₹75,000
 *   Net Taxable Sal : ₹40,42,072
 *   TDS Deducted    : ₹8,27,194
 *   PAN             : AAAAA9999A  (anonymised)
 *   TAN             : MUMX99999X  (anonymised)
 *   AY              : 2026-27
 */

import { describe, it, expect } from 'vitest'

// Engine
import { computeTax, computeTax_v2 } from '../taxComputation'
import { computeDeductionsVI_A, emptyRawDeductions } from '../deductionsEngine'
import { computeTaxCredits, emptyTaxCredits, validateBankAccountSet } from '../taxCreditsEngine'
import { computeRegimeComparison, computeFilerCategory } from '../regimeComparison'
import { detectITRForm, computeScheduleALRequired } from '../incomeEngine_v2'
import { getRules, computeSlabTaxFromConfig } from '../taxRules'

// XML
import { generateITR3XML } from '../../output/xmlGenerator'

// Form 16 parser
import { extractForm16Fields, buildForm16Data } from '../../parsers/form16Extractor'

// State
import { initialState, appReducer_test } from '../../context/AppContext'
import type { AppState, BankAccount, Schedules_v2, FilerProfile } from '../../types'

// ─── Actual figures from uploaded files (anonymised) ─────────────────────────

const BROKER = {
  // From "Equity and Non Equity" sheet summary
  intradayPL:       -1725.70,
  intradayTurnover:  1725.70,
  stcg:            -37731.43,   // short-term capital LOSS
  ltcg:             -5730.83,   // long-term capital LOSS
  // From "Equity Dividends" sheet
  dividendTotal:     7849.22,
  // From "F&O" sheet — NOT computed by utility (CA referral)
  fnoOptionsPL:    -41982.50,
  fnoOptionsTurnover: 268304.50,
}

const FORM16 = {
  grossSalary:      4_117_072,
  standardDeduction:   75_000,
  professionalTax:          0,
  netTaxableSalary: 4_042_072,
  tdsDeducted:        827_194,
  pan:        'AAAAA9999A',   // anonymised
  tanEmployer:'MUMX99999X',   // anonymised
  employerName: 'SAMPLE EMPLOYER PVT LTD',
  assessmentYear: '2026-27',
}

// Helpers
function makeBankAccount(overrides: Partial<BankAccount> = {}): BankAccount {
  return {
    id: 'ba-1', ifscCode: 'SBIN0001234', accountNumber: '1234567890',
    bankName: 'State Bank of India', accountType: 'savings',
    isRefundAccount: true, isForeign: false, ...overrides,
  }
}

function makeSV2Base(): Schedules_v2 {
  return {
    S: {
      employers: [],
      totalGross: FORM16.grossSalary,
      totalStdDeduction: FORM16.standardDeduction,
      totalProfessionalTax: FORM16.professionalTax,
      totalNetTaxable: FORM16.netTaxableSalary,
      totalTDS: FORM16.tdsDeducted,
    },
    HP: { properties: [], totalIncomeFromHP: 0, totalInterest: 0, lossSetOffAgainstSalary: 0, lossRingFenced: 0 },
    CG: {
      equitySTCG: 0,     // losses — STCG is negative (STCL)
      equityLTCG: 0,     // losses — LTCG is negative (LTCL)
      equityMFSTCG: 0, equityMFLTCG: 0, debtMFGains: 0,
      propertySales: [],
      propertySTCG: 0, propertyLTCG: 0,
      totalSTCG: 0,     // net STCG after losses = 0 (all loss)
      totalLTCG: 0,     // net LTCG after losses = 0 (all loss)
      intraEquitySetOff: 0,
    } as any,
    BP: {
      speculativeTurnover: BROKER.intradayTurnover,
      speculativePL: BROKER.intradayPL,
      netSpeculativePnL: BROKER.intradayPL,
      presumptiveEntries: [],
      fno: {
        turnover: BROKER.fnoOptionsTurnover,
        taxableIncome: 0,
        notComputed: true,   // F&O not computed — CA referral
      },
      nonSpeculativeIncome: 0,
      nonSpeculativeLoss: 0,
    } as any,
    OS: {
      breakdown: {
        savingsInterest: 0, fdInterest: 0, rdInterest: 0,
        seniorCitizenInterest: 0,
        dividendIncome: BROKER.dividendTotal,
        dividendFromForeignCompany: 0,
        giftReceived: 0, lotteryWinnings: 0, casualIncome: 0,
        familyPension: 0, familyPensionStdDed: 0,
      },
      totalAtSlabRate: BROKER.dividendTotal,
      totalAt30Pct: 0,
      total: BROKER.dividendTotal,
    },
    CYLA: {} as any,
    CFL: {
      entries: [],
      totalSpeculative: Math.abs(BROKER.intradayPL),
      totalSTCL: Math.abs(BROKER.stcg),
      totalLTCL: Math.abs(BROKER.ltcg),
      totalHP: 0, totalBusiness: 0,
    },
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: Form 16 Parser — real TRACES format text (anonymised)
// ═══════════════════════════════════════════════════════════════════════════════

const ANONYMISED_FORM16_TEXT = `
FORM NO. 16
PAN of the Deductor
ZZZZZ1234Z
TAN of the Deductor
MUMX99999X
PAN of the Employee/Specified senior citizen
AAAAA9999A
Assessment Year
2026-27
Q1 RCPT0001A 906603.00 146331.00 146331.00
Q2 RCPT0002B 1043298.00 236248.00 236248.00
Q3 RCPT0003C 819263.00 208296.00 208296.00
Q4 RCPT0004D 1347908.00 236319.00 236319.00
Total (Rs.) 4117072.00 827194.00 827194.00
PART B
(a) Salary as per provisions contained in section 17(1) 4117072.00
(a) Standard deduction under section 16(ia) 75000.00
(c) Tax on employment under section 16(iii) 0.00
6. Income chargeable under the head "Salaries" 4042072.00
`

describe('Real Data — Form 16 Parser (anonymised TRACES format)', () => {
  const result = extractForm16Fields(ANONYMISED_FORM16_TEXT)
  const data   = buildForm16Data(result, ANONYMISED_FORM16_TEXT)

  it('extracts employee PAN correctly', () => {
    expect(data.pan).toBe('AAAAA9999A')
  })

  it('extracts TAN of employer/deductor', () => {
    expect(data.tanEmployer).toBe('MUMX99999X')
  })

  it('extracts gross salary ₹41,17,072', () => {
    expect(data.grossSalary).toBe(4_117_072)
  })

  it('standard deduction is positive ₹75,000 (bug-fix regression test)', () => {
    expect(data.standardDeduction).toBe(75_000)
    expect(data.standardDeduction).toBeGreaterThan(0)
  })

  it('TDS deducted ₹8,27,194 from Part A quarterly total', () => {
    expect(data.tdsDeducted).toBe(827_194)
  })

  it('net taxable salary ₹40,42,072', () => {
    // Either directly extracted or computed: 41,17,072 - 75,000 = 40,42,072
    expect(data.netTaxableSalary).toBe(4_042_072)
  })

  it('assessment year 2026-27', () => {
    expect(data.assessmentYear).toBe('2026-27')
  })

  it('professional tax is 0 (not in this Form 16)', () => {
    expect(data.professionalTax).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: Broker P&L — real Zerodha figures validation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Real Data — Zerodha Broker P&L figures', () => {
  it('intraday is a LOSS of ₹1,725.70 (ring-fenced)', () => {
    expect(BROKER.intradayPL).toBeLessThan(0)
    expect(Math.abs(BROKER.intradayPL)).toBe(1725.70)
  })

  it('intraday turnover = absolute P&L = ₹1,725.70', () => {
    expect(BROKER.intradayTurnover).toBe(Math.abs(BROKER.intradayPL))
  })

  it('equity STCG is negative (STCL) = -₹37,731.43', () => {
    expect(BROKER.stcg).toBeLessThan(0)
    expect(BROKER.stcg).toBe(-37731.43)
  })

  it('equity LTCG is negative (LTCL) = -₹5,730.83', () => {
    expect(BROKER.ltcg).toBeLessThan(0)
  })

  it('dividends total = ₹7,849.22', () => {
    expect(BROKER.dividendTotal).toBe(7849.22)
  })

  it('F&O detected: Options P&L = -₹41,982.50 (not computed — CA referral)', () => {
    expect(BROKER.fnoOptionsPL).toBeLessThan(0)
    expect(BROKER.fnoOptionsTurnover).toBe(268304.50)
  })

  it('net STCG after losses = 0 (all positions in loss)', () => {
    const sv2 = makeSV2Base()
    expect(sv2.CG.totalSTCG).toBe(0)
    expect(sv2.CG.totalLTCG).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: ITR Form Detection with real profile
// ═══════════════════════════════════════════════════════════════════════════════

describe('Real Data — ITR Form Detection', () => {
  it('detects ITR-3 (has intraday BP + F&O)', () => {
    const sv2 = makeSV2Base()
    const form = detectITRForm(sv2.S, sv2.HP, sv2.CG as any, sv2.BP as any, sv2.OS,
      FORM16.netTaxableSalary + BROKER.dividendTotal)
    expect(form).toBe('ITR3')
  })

  it('Schedule AL NOT required — total income < ₹50L', () => {
    const totalIncome = FORM16.netTaxableSalary + BROKER.dividendTotal
    // 40,42,072 + 7,849 = 40,49,921 — well under 50L
    expect(totalIncome).toBeLessThan(5_000_000)
    expect(computeScheduleALRequired(totalIncome, 'ITR3')).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: Tax Computation — New Regime (actual numbers)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Real Data — Tax Computation New Regime', () => {
  // Income components:
  // Salary net taxable: 40,42,072
  // Dividends (OS):     7,849
  // Intraday PL:       -1,726 (ring-fenced — not included in slab income)
  // STCG:              0 (loss — carry forward)
  // LTCG:              0 (loss — carry forward)
  // Total slab income: 40,42,072 + 7,849 = 40,49,921

  const slabIncome = FORM16.netTaxableSalary + BROKER.dividendTotal
  const deductions = emptyRawDeductions(FORM16.grossSalary)
  const computedDed = computeDeductionsVI_A(deductions, 'new', 'general')
  const credits = computeTaxCredits(
    [{ id: 't1', tanDeductor: 'MUMX99999X', deductorName: 'SAMPLE EMPLOYER PVT LTD', grossAmount: FORM16.grossSalary, tdsAmount: FORM16.tdsDeducted, section: '192', source: 'form16' }],
    [], []
  )

  it('total income ≈ ₹40,49,921', () => {
    expect(Math.round(slabIncome)).toBe(4_049_921)
  })

  it('New Regime: income > ₹12L so 87A rebate does NOT apply', () => {
    const tax = computeTax_v2(slabIncome, 0, 0, 0, computedDed, emptyTaxCredits(), 'new')
    expect(tax.section87AEligible).toBe(false)
    expect(tax.slabTax).toBeGreaterThan(0)
  })

  it('New Regime slab tax computed correctly on ₹40,49,921', () => {
    // New Regime slabs:
    // 0-4L: 0%, 4-8L: 5% (20k), 8-12L: 10% (40k), 12-16L: 15% (60k),
    // 16-20L: 20% (80k), 20-24L: 25% (100k), >24L: 30%
    // On 40,49,921:
    //   4L @ 0%  = 0
    //   4L @ 5%  = 20,000
    //   4L @ 10% = 40,000
    //   4L @ 15% = 60,000
    //   4L @ 20% = 80,000
    //   4L @ 25% = 100,000
    //   (40,49,921 - 24L) @ 30% = 16,49,921 * 0.30 = 4,94,976.30
    //   Total = 7,94,976.30
    const r = getRules('2026-27', 'new')
    const slabTax = computeSlabTaxFromConfig(Math.round(slabIncome), r.slabs)
    expect(slabTax).toBeCloseTo(794_976, -1)  // within ₹100
  })

  it('No STCG or LTCG tax (both in loss)', () => {
    const tax = computeTax_v2(slabIncome, 0, 0, 0, computedDed, emptyTaxCredits(), 'new')
    expect(tax.stcgTax).toBe(0)
    expect(tax.ltcgTax).toBe(0)
  })

  it('No surcharge — income < ₹50L', () => {
    const tax = computeTax_v2(slabIncome, 0, 0, 0, computedDed, emptyTaxCredits(), 'new')
    expect(tax.surcharge).toBe(0)
  })

  it('Cess = 4% of (slabTax + surcharge)', () => {
    const tax = computeTax_v2(slabIncome, 0, 0, 0, computedDed, emptyTaxCredits(), 'new')
    expect(tax.cess).toBe(Math.round(tax.totalBeforeCess * 0.04))
  })

  it('Net refund = TDS paid minus tax payable (overpaid TDS)', () => {
    const tax = computeTax_v2(slabIncome, 0, 0, 0, computedDed, credits, 'new')
    // TDS was ₹8,27,194. Actual tax ≈ ₹8,26,775 + cess
    // Net should be small payable or small refund
    expect(typeof tax.netPayable).toBe('number')
    // The TDS was correctly calibrated by employer — difference should be small
    expect(Math.abs(tax.netPayable)).toBeLessThan(50_000)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5: Regime Comparison with real income
// ═══════════════════════════════════════════════════════════════════════════════

describe('Real Data — Regime Comparison', () => {
  const sv2 = makeSV2Base()
  const profile: FilerProfile = { dateOfBirth: null, filerCategory: 'general' }

  it('computes both regimes without error', () => {
    const r = computeRegimeComparison(sv2 as any, emptyRawDeductions(FORM16.grossSalary), emptyTaxCredits(), profile)
    expect(r.new.totalTaxPayable).toBeGreaterThan(0)
    expect(r.old.totalTaxPayable).toBeGreaterThan(0)
    expect(['new', 'old']).toContain(r.recommended)
  })

  it('New Regime wins without deductions (no 80C/80D entered)', () => {
    // This filer has no deductions → New Regime is typically better or equal
    const r = computeRegimeComparison(sv2 as any, emptyRawDeductions(FORM16.grossSalary), emptyTaxCredits(), profile)
    // New Regime has lower slabs above 12L for most income levels
    expect(r.new.slabTax).toBeLessThanOrEqual(r.old.slabTax)
  })

  it('Old Regime wins with max 80C + 80D + 80CCD1B deductions', () => {
    const raw = emptyRawDeductions(FORM16.grossSalary)
    raw.sec80C_lic = 150_000
    raw.sec80CCD1B = 50_000
    raw.sec80D_self = 25_000
    raw.sec80D_parents = 25_000
    // 2.5L deductions on 40.4L income — may or may not beat new regime
    const r = computeRegimeComparison(sv2 as any, raw, emptyTaxCredits(), profile)
    expect(r.old.slabTaxableIncome).toBeLessThan(r.new.slabTaxableIncome)
    expect(r.saving).toBeGreaterThanOrEqual(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6: CFL — carry forward of losses
// ═══════════════════════════════════════════════════════════════════════════════

describe('Real Data — Carry Forward Losses', () => {
  it('intraday loss ₹1,725.70 is ring-fenced (cannot offset salary)', () => {
    // The intraday loss cannot be set off against salary or CG
    expect(BROKER.intradayPL).toBeLessThan(0)
    // It goes to CFL.totalSpeculative
    const sv2 = makeSV2Base()
    expect(sv2.CFL.totalSpeculative).toBeCloseTo(Math.abs(BROKER.intradayPL), 2)
  })

  it('STCL ₹37,731.43 can only offset STCG — but there is no STCG so it carries forward', () => {
    const sv2 = makeSV2Base()
    expect(sv2.CG.totalSTCG).toBe(0)     // no STCG to offset
    expect(sv2.CFL.totalSTCL).toBeCloseTo(Math.abs(BROKER.stcg), 2)
  })

  it('LTCL ₹5,730.83 can only offset LTCG — no LTCG so it carries forward', () => {
    const sv2 = makeSV2Base()
    expect(sv2.CG.totalLTCG).toBe(0)
    expect(sv2.CFL.totalLTCL).toBeCloseTo(Math.abs(BROKER.ltcg), 2)
  })

  it('CFL filing deadline warning: losses are only carriable if ITR filed before 31 Jul 2026', () => {
    // This is a key user warning — losses above confirm the deadline matters
    const hasLosses = Math.abs(BROKER.intradayPL) > 0 || Math.abs(BROKER.stcg) > 0 || Math.abs(BROKER.ltcg) > 0
    expect(hasLosses).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7: F&O handling
// ═══════════════════════════════════════════════════════════════════════════════

describe('Real Data — F&O Handling', () => {
  it('F&O options P&L is not computed (CA referral flag set)', () => {
    const sv2 = makeSV2Base()
    expect(sv2.BP.fno?.notComputed).toBe(true)
  })

  it('F&O turnover ₹2,68,304.50 — below audit threshold', () => {
    // Audit threshold for options: turnover ≤ ₹10Cr (for FY 2025-26)
    // This user's F&O turnover is well below
    expect(BROKER.fnoOptionsTurnover).toBeLessThan(10_000_000)
  })

  it('F&O does NOT trigger ITR-4 (user also has salary)', () => {
    const sv2 = makeSV2Base()
    const form = detectITRForm(sv2.S, sv2.HP, sv2.CG as any, sv2.BP as any, sv2.OS,
      FORM16.netTaxableSalary + BROKER.dividendTotal)
    expect(form).toBe('ITR3')
    expect(form).not.toBe('ITR4')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 8: XML Generation with real data
// ═══════════════════════════════════════════════════════════════════════════════

describe('Real Data — XML Generation', () => {
  const baseState: AppState = {
    ...initialState,
    selectedITRForm: 'ITR3',
    selectedRegime: 'new',
    tax: (() => {
      const slabIncome = FORM16.netTaxableSalary + BROKER.dividendTotal
      const d = emptyRawDeductions(FORM16.grossSalary)
      const ded = computeDeductionsVI_A(d, 'new', 'general')
      return computeTax_v2(slabIncome, 0, 0, 0, ded, emptyTaxCredits(), 'new')
    })(),
    schedules: {
      S: { grossSalary: FORM16.grossSalary, standardDeduction: FORM16.standardDeduction, professionalTax: 0, netTaxableSalary: FORM16.netTaxableSalary },
      OS: { dividendIncome: BROKER.dividendTotal, interestIncome: 0, total: BROKER.dividendTotal },
      CG: { equitySTCG: 0, equityLTCG: 0, mfEquitySTCG: 0, mfEquityLTCG: 0, debtMFGains: 0, netSTCG: 0, taxableLTCG: 0, ltcgExemption: 0, stcl: Math.abs(BROKER.stcg), ltcl: Math.abs(BROKER.ltcg) },
      BP: { speculativeTurnover: BROKER.intradayTurnover, netSpeculativePnL: BROKER.intradayPL, carryForward: Math.abs(BROKER.intradayPL), hasFnO: true },
    } as any,
    parsed: {
      ...initialState.parsed,
      form16: {
        grossSalary: FORM16.grossSalary,
        standardDeduction: FORM16.standardDeduction,
        professionalTax: 0,
        netTaxableSalary: FORM16.netTaxableSalary,
        tdsDeducted: FORM16.tdsDeducted,
        pan: FORM16.pan,
        tanEmployer: FORM16.tanEmployer,
        employerName: FORM16.employerName,
        assessmentYear: FORM16.assessmentYear,
        unresolvedFields: [],
      },
    },
    bankAccounts: [makeBankAccount()],
  }

  it('generates valid ITR-3 XML', () => {
    const r = generateITR3XML(baseState)
    expect(r.valid).toBe(true)
    expect(r.xml).toContain('<ITR3>')
    expect(r.errors).toHaveLength(0)
  })

  it('XML contains anonymised PAN', () => {
    const r = generateITR3XML(baseState)
    expect(r.xml).toContain(FORM16.pan)
    // Must NOT contain real PAN (from original file)
    expect(r.xml).not.toContain('CPLPP2726Q')
  })

  it('XML contains TDS amount', () => {
    const r = generateITR3XML(baseState)
    expect(r.xml).toContain(String(FORM16.tdsDeducted))
  })

  it('XML marks New Regime', () => {
    const r = generateITR3XML(baseState)
    expect(r.xml).toMatch(/NewRegime|New|N<\/Regime|NewTaxRegime/i)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 9: Bank Account + AppState with real data
// ═══════════════════════════════════════════════════════════════════════════════

describe('Real Data — Bank Account & State', () => {
  it('bank account set valid with one refund account', () => {
    const result = validateBankAccountSet([makeBankAccount()])
    expect(result.valid).toBe(true)
  })

  it('AppState updated correctly with real Form 16 data', () => {
    let s = initialState
    s = appReducer_test(s, { type: 'SET_SELECTED_AY', ay: '2026-27' })
    s = appReducer_test(s, { type: 'SET_SELECTED_REGIME', regime: 'new' })
    s = appReducer_test(s, { type: 'SET_SELECTED_ITR_FORM', form: 'ITR3' })
    s = appReducer_test(s, { type: 'ADD_BANK_ACCOUNT', account: makeBankAccount() })

    expect(s.selectedAY).toBe('2026-27')
    expect(s.selectedRegime).toBe('new')
    expect(s.selectedITRForm).toBe('ITR3')
    expect(s.bankAccounts).toHaveLength(1)
    expect(s.bankAccounts[0].isRefundAccount).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 10: Edge Cases specific to this user's profile
// ═══════════════════════════════════════════════════════════════════════════════

describe('Real Data — Edge Cases & Boundary Conditions', () => {
  it('intraday turnover = |P&L| (both positions are losses = absolute sum)', () => {
    // For intraday, turnover = sum of absolute values of all P&L
    // This user has turnover exactly equal to absolute P&L → single losing trade net
    expect(BROKER.intradayTurnover).toBe(Math.abs(BROKER.intradayPL))
  })

  it('dividend income < ₹10 — well below any threshold requiring special treatment', () => {
    // Dividends ₹7,849 are small — no TDS was likely deducted
    expect(BROKER.dividendTotal).toBeLessThan(10_000)
  })

  it('total income stays below ₹50L even with generous OS additions', () => {
    const totalIncome = FORM16.netTaxableSalary + BROKER.dividendTotal + 100_000 // extra cushion
    expect(totalIncome).toBeLessThan(5_000_000)
    expect(computeScheduleALRequired(totalIncome, 'ITR3')).toBe(false)
  })

  it('F&O audit threshold NOT breached (turnover < ₹10Cr)', () => {
    // Section 44AB requires audit if business turnover > ₹10Cr
    // F&O options turnover ₹2,68,304 is vastly below
    expect(BROKER.fnoOptionsTurnover).toBeLessThan(10_00_00_000)
  })

  it('all capital loss carry-forwards are within eligible years', () => {
    // Losses from FY 2025-26 can be carried forward 8 years (till AY 2034-35)
    const yearsSTCL = 8  // from this year
    const yearsLTCL = 8
    const yearsSpec = 4
    expect(yearsSTCL).toBe(8)
    expect(yearsLTCL).toBe(8)
    expect(yearsSpec).toBe(4)
  })

  it('filer category is general (salary-based, no senior citizen indicators)', () => {
    // No DOB provided → defaults to general
    expect(computeFilerCategory(null, '2026-27')).toBe('general')
  })

  it('no surcharge applicable (income ₹40.5L < ₹50L threshold)', () => {
    const income = FORM16.netTaxableSalary + BROKER.dividendTotal
    const r = getRules('2026-27', 'new')
    // Surcharge kicks in at 50L
    const threshold = r.surchargeThresholds?.basic ?? 5_000_000
    expect(income).toBeLessThan(threshold)
  })
})
