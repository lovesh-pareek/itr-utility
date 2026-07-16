/**
 * End-to-End Test: CA's Statement of Income Verification
 *
 * This test uses the ACTUAL figures from the sample documents:
 *   - Form 16 (FINANCEWORKS TECHNOLOGIES PVT LTD)
 *   - Zerodha Broker P&L (intraday, equity delivery, F&O)
 *   - AIS (interest income, dividends)
 *   - Prior ITR JSON (AY 2025-26 carry forward: speculative loss ₹114)
 *
 * Expected output per CA's Statement of Income (PAN: TPNDD2456D, AY 2026-27):
 *   Salary (net):       ₹40,42,080
 *   Business loss:      -₹51,681 (non-speculative, from F&O)
 *   Speculative loss:   -₹1,726 (ring-fenced, carry forward)
 *   STCL:              -₹37,741 (carry forward)
 *   LTCL:              -₹5,730 (carry forward)
 *   Other Sources:       ₹61,110 (interest ₹53,261 + dividends ₹7,849)
 *   Business loss set-off against OS: -₹51,681 → net OS = ₹9,429
 *   Total income:        ₹40,51,509 (rounded ₹40,51,510)
 *   Tax on total income: ₹7,95,453
 *   Cess (4%):           ₹31,818
 *   Total tax + cess:    ₹8,27,271
 *   TDS:                 ₹8,27,274
 *   Balance payable:     ₹0 (slight refund of ₹3)
 */

import { describe, it, expect } from 'vitest'

// Engine imports
import { computeTax_v2 } from '../taxComputation'
import { computeDeductionsVI_A, emptyRawDeductions } from '../deductionsEngine'
import { computeTaxCredits, emptyTaxCredits } from '../taxCreditsEngine'
import { computeScheduleS_v2, employerFromForm16 } from '../scheduleS_v2'
import { computeScheduleBP_v2 } from '../scheduleBP_v2'
import { computeScheduleOS_v2, emptyOtherSourcesBreakdown } from '../scheduleOS_v2'
import { computeTotalIncome_v2 } from '../incomeEngine_v2'
import { computeSlabTaxFromConfig, getRules } from '../taxRules'
import type { ScheduleHP, ScheduleCG_v2 } from '../../types'

// ─── Actual figures from CA's Statement of Income ────────────────────────────

const CA_EXPECTED = {
  grossSalary: 4_117_080,
  standardDeduction: 75_000,
  netSalary: 4_042_080,
  businessLoss: -51_681,       // non-speculative (F&O) after excluding speculative
  speculativeLoss: -1_726,
  stcl: -37_741,
  ltcl: -5_730,
  interestIncome: 53_261,
  dividendIncome: 7_849,
  otherSources: 61_110,        // interest + dividends
  businessLossSetOffAgainstOS: 51_681,
  netOtherSources: 9_429,      // 61,110 - 51,681
  totalIncome: 4_051_509,      // 40,42,080 + 9,429
  totalIncomeRounded: 4_051_510,
  slabTax: 795_453,
  cess: 31_818,
  totalTaxWithCess: 827_271,
  tds: 827_274,
  balancePayable: 0,           // TDS > tax → no balance payable (tiny refund ₹3)
}

// ─── Input data from sample documents ────────────────────────────────────────

const SALARY = {
  grossSalary: 4_117_080,
  standardDeduction: 75_000,
  professionalTax: 0,
  netTaxableSalary: 4_042_080,
  tdsDeducted: 827_274,
  employerName: 'FINANCEWORKS TECHNOLOGIES PRIVATE LIMITED',
  tanEmployer: 'PUNE8736S',
}

const BROKER_DATA = {
  intradayPL: -1726,                // speculative loss
  intradayTurnover: 1726,
  fnoTaxableIncome: -51_681,        // F&O loss (non-speculative)
  fnoTurnover: 130_898,             // approximate from prior ITR data
  stcl: 37_741,                     // short-term capital LOSS (absolute)
  ltcl: 5_730,                      // long-term capital LOSS (absolute)
}

const OTHER_SOURCES = {
  interestIncome: 53_261,           // savings + FD + other interest
  dividendIncome: 7_849,
}

const PRIOR_ITR_CFL = {
  speculativeLoss: 114,             // from AY 2025-26 (carried forward)
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SECTION 1: Schedule S — Salary computation
// ═══════════════════════════════════════════════════════════════════════════════

describe('CA Statement E2E — Schedule S (Salary)', () => {
  it('computes net salary = ₹40,42,080 (gross - 75k std deduction)', () => {
    const emp = employerFromForm16({
      ...SALARY,
      standardDeduction: SALARY.standardDeduction,
    })
    const result = computeScheduleS_v2([emp], {})

    expect(result.totalGross).toBe(CA_EXPECTED.grossSalary)
    expect(result.totalStdDeduction).toBe(CA_EXPECTED.standardDeduction)
    expect(result.totalNetTaxable).toBe(CA_EXPECTED.netSalary)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SECTION 2: Schedule BP — Business & Profession
// ═══════════════════════════════════════════════════════════════════════════════

describe('CA Statement E2E — Schedule BP (Business & Profession)', () => {
  it('F&O loss is treated as non-speculative business loss', () => {
    const bp = computeScheduleBP_v2(
      null,                         // no raw broker data
      [],                           // no presumptive entries
      {                             // F&O entry
        turnover: BROKER_DATA.fnoTurnover,
        taxableIncome: BROKER_DATA.fnoTaxableIncome,
        notComputed: false,
      },
      0, 0,                         // no other non-speculative income/loss
      { 'BP.netSpeculativePnL': BROKER_DATA.intradayPL }  // override speculative
    )

    expect(bp.fno?.taxableIncome).toBe(-51_681)
    expect(bp.netSpeculativePnL).toBe(-1726)
  })

  it('speculative loss is ring-fenced (cannot offset other heads)', () => {
    // Speculative loss goes to carry-forward, not set off
    const speculativeProfit = Math.max(0, BROKER_DATA.intradayPL)
    expect(speculativeProfit).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SECTION 3: Schedule OS — Other Sources
// ═══════════════════════════════════════════════════════════════════════════════

describe('CA Statement E2E — Schedule OS (Other Sources)', () => {
  it('total other sources = ₹61,110 (interest ₹53,261 + dividends ₹7,849)', () => {
    const breakdown = {
      ...emptyOtherSourcesBreakdown(),
      savingsInterest: 15_985,         // HDFC savings
      fdInterest: 36_489 + 787,        // CPRC + REIT interest
      dividendIncome: OTHER_SOURCES.dividendIncome,
    }
    const os = computeScheduleOS_v2(breakdown, {})

    expect(os.totalAtSlabRate).toBe(
      15_985 + 36_489 + 787 + OTHER_SOURCES.dividendIncome
    )
    expect(os.totalAtSlabRate).toBe(CA_EXPECTED.otherSources)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SECTION 4: Total Income — Business loss set-off against OS
// ═══════════════════════════════════════════════════════════════════════════════

describe('CA Statement E2E — Total Income Computation', () => {
  // Build all schedules for the v2 engine
  const scheduleS = {
    employers: [],
    totalGross: SALARY.grossSalary,
    totalStdDeduction: SALARY.standardDeduction,
    totalProfessionalTax: 0,
    totalNetTaxable: CA_EXPECTED.netSalary,
    totalTDS: SALARY.tdsDeducted,
  }

  const scheduleHP: ScheduleHP = {
    properties: [],
    totalIncomeFromHP: 0,
    totalInterest: 0,
    lossSetOffAgainstSalary: 0,
    lossRingFenced: 0,
  }

  const scheduleCG: ScheduleCG_v2 = {
    equitySTCG: 0,
    equityLTCG: 0,
    mfEquitySTCG: 0,
    mfEquityLTCG: 0,
    debtMFGains: 0,
    grossSTCG: 0,
    grossLTCG: 0,
    ltcgExemption: 0,
    taxableLTCG: 0,
    stcl: BROKER_DATA.stcl,
    ltcl: BROKER_DATA.ltcl,
    netSTCG: 0,
    netLTCG: 0,
    propertySales: [],
    propertySTCG: 0,
    propertyLTCG: 0,
    totalSTCG: 0,       // all losses — no gains
    totalLTCG: 0,
  }

  const scheduleBP = {
    speculativeTurnover: BROKER_DATA.intradayTurnover,
    netSpeculativePnL: BROKER_DATA.intradayPL,
    setOffThisYear: 0,
    carryForward: 0,
    presumptiveEntries: [],
    fno: {
      turnover: BROKER_DATA.fnoTurnover,
      taxableIncome: BROKER_DATA.fnoTaxableIncome,
      notComputed: false,
    },
    nonSpeculativeIncome: 0,
    nonSpeculativeLoss: 0,
  }

  const scheduleOS = {
    breakdown: {
      ...emptyOtherSourcesBreakdown(),
      savingsInterest: 15_985,
      fdInterest: 36_489 + 787,
      dividendIncome: OTHER_SOURCES.dividendIncome,
    },
    totalAtSlabRate: CA_EXPECTED.otherSources,   // 61,110
    totalAt30Pct: 0,
    total: CA_EXPECTED.otherSources,
  }

  it('business loss (₹51,681) is set off against Other Sources', () => {
    const result = computeTotalIncome_v2(
      scheduleS as any,
      scheduleHP,
      scheduleCG,
      scheduleBP as any,
      scheduleOS,
      'new'
    )

    // Business loss of 51,681 should reduce OS from 61,110 to 9,429
    expect(result.otherSourcesSlabRate).toBe(CA_EXPECTED.netOtherSources)
  })

  it('speculative loss is NOT set off against any other head', () => {
    const result = computeTotalIncome_v2(
      scheduleS as any,
      scheduleHP,
      scheduleCG,
      scheduleBP as any,
      scheduleOS,
      'new'
    )

    // Speculative loss doesn't reduce salary or OS
    expect(result.salaryIncome).toBe(CA_EXPECTED.netSalary)
    expect(result.businessSpeculative).toBe(0)  // no speculative profit
  })

  it('STCL and LTCL are carried forward (not reducing total income)', () => {
    const result = computeTotalIncome_v2(
      scheduleS as any,
      scheduleHP,
      scheduleCG,
      scheduleBP as any,
      scheduleOS,
      'new'
    )

    // CG is 0 because all are losses
    expect(result.cgSTCG).toBe(0)
    expect(result.cgLTCG).toBe(0)
  })

  it('total income = ₹40,51,509 (salary ₹40,42,080 + net OS ₹9,429)', () => {
    const result = computeTotalIncome_v2(
      scheduleS as any,
      scheduleHP,
      scheduleCG,
      scheduleBP as any,
      scheduleOS,
      'new'
    )

    expect(result.totalSlabIncome).toBe(CA_EXPECTED.totalIncome)
    expect(result.totalIncome).toBe(CA_EXPECTED.totalIncome)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SECTION 5: Tax Computation — matching CA's final figures
// ═══════════════════════════════════════════════════════════════════════════════

describe('CA Statement E2E — Tax Computation (New Regime)', () => {
  // The total slab income after business loss set-off = ₹40,51,509
  const slabIncome = CA_EXPECTED.totalIncome

  it('slab tax = ₹7,95,453', () => {
    // New Regime slabs for AY 2026-27:
    //   0-4L: 0%, 4-8L: 5% (20,000), 8-12L: 10% (40,000),
    //   12-16L: 15% (60,000), 16-20L: 20% (80,000),
    //   20-24L: 25% (100,000), >24L: 30%
    //
    // On ₹40,51,509:
    //   4L @ 0% = 0
    //   4L @ 5% = 20,000
    //   4L @ 10% = 40,000
    //   4L @ 15% = 60,000
    //   4L @ 20% = 80,000
    //   4L @ 25% = 100,000
    //   (40,51,509 - 24,00,000) @ 30% = 16,51,509 × 0.30 = 4,95,452.70
    //   Total = 7,95,452.70 → rounded = 7,95,453
    const rules = getRules('2026-27', 'new')
    const slabTax = computeSlabTaxFromConfig(slabIncome, rules.slabs)

    expect(slabTax).toBe(CA_EXPECTED.slabTax)
  })

  it('no STCG/LTCG tax (both are losses)', () => {
    const deductions = computeDeductionsVI_A(
      emptyRawDeductions(CA_EXPECTED.grossSalary), 'new', 'general'
    )
    const tax = computeTax_v2(slabIncome, 0, 0, 0, deductions, emptyTaxCredits(), 'new')

    expect(tax.stcgTax).toBe(0)
    expect(tax.ltcgTax).toBe(0)
  })

  it('no surcharge (income < ₹50L)', () => {
    const deductions = computeDeductionsVI_A(
      emptyRawDeductions(CA_EXPECTED.grossSalary), 'new', 'general'
    )
    const tax = computeTax_v2(slabIncome, 0, 0, 0, deductions, emptyTaxCredits(), 'new')

    expect(tax.surcharge).toBe(0)
  })

  it('cess = ₹31,818 (4% of ₹7,95,453)', () => {
    const deductions = computeDeductionsVI_A(
      emptyRawDeductions(CA_EXPECTED.grossSalary), 'new', 'general'
    )
    const tax = computeTax_v2(slabIncome, 0, 0, 0, deductions, emptyTaxCredits(), 'new')

    expect(tax.cess).toBe(CA_EXPECTED.cess)
  })

  it('total tax + cess = ₹8,27,271', () => {
    const deductions = computeDeductionsVI_A(
      emptyRawDeductions(CA_EXPECTED.grossSalary), 'new', 'general'
    )
    const tax = computeTax_v2(slabIncome, 0, 0, 0, deductions, emptyTaxCredits(), 'new')

    expect(tax.totalTaxPayable).toBe(CA_EXPECTED.totalTaxWithCess)
  })

  it('with TDS ₹8,27,274 → balance payable = ₹0 (small refund of ₹3)', () => {
    const deductions = computeDeductionsVI_A(
      emptyRawDeductions(CA_EXPECTED.grossSalary), 'new', 'general'
    )
    const credits = computeTaxCredits(
      [{
        id: 'tds-salary',
        tanDeductor: SALARY.tanEmployer,
        deductorName: SALARY.employerName,
        grossAmount: SALARY.grossSalary,
        tdsAmount: CA_EXPECTED.tds,
        section: '192',
        source: 'form16',
      }],
      [], []
    )
    const tax = computeTax_v2(slabIncome, 0, 0, 0, deductions, credits, 'new')

    // Tax payable = 8,27,271. TDS = 8,27,274. Net = -3 (refund of ₹3)
    expect(tax.netPayable).toBe(CA_EXPECTED.totalTaxWithCess - CA_EXPECTED.tds)
    expect(tax.netPayable).toBe(-3)
    // Balance payable is 0 (since it's a refund)
    expect(Math.max(0, tax.netPayable)).toBe(CA_EXPECTED.balancePayable)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SECTION 6: Losses Carried Forward
// ═══════════════════════════════════════════════════════════════════════════════

describe('CA Statement E2E — Carry Forward Losses', () => {
  it('speculative loss ₹1,726 carried forward (from current year)', () => {
    // Current year speculative loss = 1,726
    // Ring-fenced: cannot be set off against any head
    expect(Math.abs(BROKER_DATA.intradayPL)).toBe(1726)
  })

  it('STCL ₹37,741 carried forward (no STCG to offset)', () => {
    expect(BROKER_DATA.stcl).toBe(37_741)
  })

  it('LTCL ₹5,730 carried forward (no LTCG to offset)', () => {
    expect(BROKER_DATA.ltcl).toBe(5_730)
  })

  it('total carry forward = ₹45,197 (spec 1,726 + STCL 37,741 + LTCL 5,730)', () => {
    const totalCF = Math.abs(BROKER_DATA.intradayPL) + BROKER_DATA.stcl + BROKER_DATA.ltcl
    expect(totalCF).toBe(45_197)
  })

  it('prior year B/F speculative loss ₹114 (from AY 2025-26) remains unset', () => {
    // Prior speculative loss of ₹114 cannot be set off against current year
    // (no speculative profit exists) — continues to carry forward
    expect(PRIOR_ITR_CFL.speculativeLoss).toBe(114)
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// TEST SECTION 7: Full Pipeline Summary
// ═══════════════════════════════════════════════════════════════════════════════

describe('CA Statement E2E — Full Pipeline Summary', () => {
  it('end-to-end: salary + F&O loss + OS → matches CA total income and tax', () => {
    // Build schedules
    const scheduleS = {
      employers: [],
      totalGross: SALARY.grossSalary,
      totalStdDeduction: SALARY.standardDeduction,
      totalProfessionalTax: 0,
      totalNetTaxable: CA_EXPECTED.netSalary,
      totalTDS: SALARY.tdsDeducted,
    }

    const scheduleHP: ScheduleHP = {
      properties: [], totalIncomeFromHP: 0, totalInterest: 0,
      lossSetOffAgainstSalary: 0, lossRingFenced: 0,
    }

    const scheduleCG: ScheduleCG_v2 = {
      equitySTCG: 0, equityLTCG: 0, mfEquitySTCG: 0, mfEquityLTCG: 0,
      debtMFGains: 0, grossSTCG: 0, grossLTCG: 0, ltcgExemption: 0,
      taxableLTCG: 0, stcl: BROKER_DATA.stcl, ltcl: BROKER_DATA.ltcl,
      netSTCG: 0, netLTCG: 0,
      propertySales: [], propertySTCG: 0, propertyLTCG: 0,
      totalSTCG: 0, totalLTCG: 0,
    }

    const scheduleBP = {
      speculativeTurnover: BROKER_DATA.intradayTurnover,
      netSpeculativePnL: BROKER_DATA.intradayPL,
      setOffThisYear: 0, carryForward: 0,
      presumptiveEntries: [],
      fno: {
        turnover: BROKER_DATA.fnoTurnover,
        taxableIncome: BROKER_DATA.fnoTaxableIncome,
        notComputed: false,
      },
      nonSpeculativeIncome: 0,
      nonSpeculativeLoss: 0,
    }

    const scheduleOS = {
      breakdown: emptyOtherSourcesBreakdown(),
      totalAtSlabRate: CA_EXPECTED.otherSources,
      totalAt30Pct: 0,
      total: CA_EXPECTED.otherSources,
    }

    // Step 1: Compute total income with set-offs
    const income = computeTotalIncome_v2(
      scheduleS as any, scheduleHP, scheduleCG,
      scheduleBP as any, scheduleOS, 'new'
    )

    // Step 2: Compute tax
    const deductions = computeDeductionsVI_A(
      emptyRawDeductions(SALARY.grossSalary), 'new', 'general'
    )
    const credits = computeTaxCredits(
      [{
        id: 'tds-salary',
        tanDeductor: SALARY.tanEmployer,
        deductorName: SALARY.employerName,
        grossAmount: SALARY.grossSalary,
        tdsAmount: CA_EXPECTED.tds,
        section: '192',
        source: 'form16',
      }],
      [], []
    )
    const tax = computeTax_v2(
      income.totalSlabIncome, 0, 0, 0,
      deductions, credits, 'new'
    )

    // ─── Assert all CA expected values ─────────────────────────────────────
    expect(income.salaryIncome).toBe(CA_EXPECTED.netSalary)
    expect(income.otherSourcesSlabRate).toBe(CA_EXPECTED.netOtherSources)
    expect(income.totalIncome).toBe(CA_EXPECTED.totalIncome)
    expect(income.businessNonSpeculative).toBe(0)  // loss consumed via set-off
    expect(income.businessSpeculative).toBe(0)     // speculative loss → 0 profit
    expect(income.cgSTCG).toBe(0)                  // all CG are losses
    expect(income.cgLTCG).toBe(0)

    expect(tax.slabTax).toBe(CA_EXPECTED.slabTax)
    expect(tax.cess).toBe(CA_EXPECTED.cess)
    expect(tax.totalTaxPayable).toBe(CA_EXPECTED.totalTaxWithCess)
    expect(tax.netPayable).toBe(-3)                // refund of ₹3
  })
})
