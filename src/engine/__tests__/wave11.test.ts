import { describe, it, expect } from 'vitest'
import { computeScheduleS_v2, computeFilerCategory, employerFromForm16 } from '../scheduleS_v2'
import { computeScheduleHP } from '../scheduleHP'
import { computePropertyCG, getCII, computeIndexedCost } from '../schedulePropertyCG'
import { computeScheduleBP_v2, getTotalPresumptiveIncome } from '../scheduleBP_v2'
import { computeScheduleOS_v2, emptyOtherSourcesBreakdown } from '../scheduleOS_v2'
import { detectITRForm, computeScheduleALRequired, computeTotalIncome_v2 } from '../incomeEngine_v2'
import type {
  EmployerEntry, HouseProperty, PropertySale, PresumptiveEntry,
  FnOEntry, ScheduleS_v2, ScheduleHP, ScheduleCG_v2, ScheduleBP_v2,
  ScheduleOS_v2, ScheduleCG,
} from '../../types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeEmployer(overrides: Partial<EmployerEntry> = {}): EmployerEntry {
  return {
    id: 'emp_1',
    employerName: 'Acme Corp',
    tan: 'MUMA12345B',
    grossSalary: 1_200_000,
    standardDeduction: 75_000,
    professionalTax: 2_400,
    netTaxableSalary: 1_122_600,
    tdsDeducted: 100_000,
    form16Available: true,
    ...overrides,
  }
}

function emptyScheduleS_v2(): ScheduleS_v2 {
  return {
    employers: [],
    totalGross: 0,
    totalStdDeduction: 0,
    totalProfessionalTax: 0,
    totalNetTaxable: 0,
    totalTDS: 0,
  }
}

function emptyHP(): ScheduleHP {
  return { properties: [], totalIncomeFromHP: 0, totalInterest: 0, lossSetOffAgainstSalary: 0, lossRingFenced: 0 }
}

function emptyCG(): ScheduleCG_v2 {
  const base: ScheduleCG = {
    equitySTCG: 0, equityLTCG: 0, mfEquitySTCG: 0, mfEquityLTCG: 0, debtMFGains: 0,
    grossSTCG: 0, grossLTCG: 0, ltcgExemption: 0, taxableLTCG: 0, stcl: 0, ltcl: 0,
    netSTCG: 0, netLTCG: 0,
  }
  return { ...base, propertySales: [], propertySTCG: 0, propertyLTCG: 0, totalSTCG: 0, totalLTCG: 0 }
}

function emptyBP_v2(): ScheduleBP_v2 {
  return {
    speculativeTurnover: 0, netSpeculativePnL: 0, setOffThisYear: 0, carryForward: 0,
    presumptiveEntries: [], fno: null, nonSpeculativeIncome: 0, nonSpeculativeLoss: 0,
  }
}

function emptyOS_v2(): ScheduleOS_v2 {
  return { breakdown: emptyOtherSourcesBreakdown(), totalAtSlabRate: 0, totalAt30Pct: 0, total: 0 }
}

// ─── T66: Multi-employer salary ───────────────────────────────────────────────

describe('T66 — computeScheduleS_v2', () => {
  it('single employer: matches v1.0 net taxable computation', () => {
    const emp = makeEmployer()
    const result = computeScheduleS_v2([emp], {})
    expect(result.totalGross).toBe(1_200_000)
    expect(result.totalStdDeduction).toBe(75_000)
    expect(result.totalProfessionalTax).toBe(2_400)
    expect(result.totalNetTaxable).toBe(1_122_600)
    expect(result.totalTDS).toBe(100_000)
    expect(result.employers).toHaveLength(1)
  })

  it('two employers: sums gross, std deduction, net taxable, TDS correctly', () => {
    const emp1 = makeEmployer({ id: 'emp_1', grossSalary: 800_000, professionalTax: 2_400, tdsDeducted: 60_000 })
    const emp2 = makeEmployer({ id: 'emp_2', employerName: 'Beta Corp', grossSalary: 600_000, professionalTax: 0, tdsDeducted: 40_000 })
    const result = computeScheduleS_v2([emp1, emp2], {})
    expect(result.totalGross).toBe(1_400_000)
    expect(result.totalStdDeduction).toBe(150_000)    // 75k × 2
    expect(result.totalProfessionalTax).toBe(2_400)
    expect(result.totalNetTaxable).toBe(1_400_000 - 150_000 - 2_400)  // 1,247,600
    expect(result.totalTDS).toBe(100_000)
  })

  it('override applies to specific employer field', () => {
    const emp = makeEmployer({ id: 'emp_1', grossSalary: 1_200_000 })
    const result = computeScheduleS_v2([emp], { 'S_v2.emp_1.grossSalary': 1_500_000 })
    expect(result.totalGross).toBe(1_500_000)
    expect(result.totalNetTaxable).toBe(1_500_000 - 75_000 - 2_400)
  })

  it('standard deduction is fixed at 75000 per employer — not overridable', () => {
    const emp = makeEmployer({ id: 'emp_1' })
    const result = computeScheduleS_v2([emp], {})
    expect(result.employers[0].standardDeduction).toBe(75_000)
  })

  it('employerFromForm16 creates valid EmployerEntry', () => {
    const form16 = { grossSalary: 1_000_000, standardDeduction: 75_000, professionalTax: 0, netTaxableSalary: 925_000, tdsDeducted: 80_000, employerName: 'TestCo', tanEmployer: 'TUNA12345A' }
    const entry = employerFromForm16(form16)
    expect(entry.id).toBe('emp_1')
    expect(entry.grossSalary).toBe(1_000_000)
    expect(entry.form16Available).toBe(true)
  })
})

// ─── computeFilerCategory ─────────────────────────────────────────────────────

describe('computeFilerCategory', () => {
  it('null DOB → general', () => {
    expect(computeFilerCategory(null)).toBe('general')
  })

  it('age < 60 → general', () => {
    // AY 2026-27: reference date = 1 Apr 2025; born 1980-06-01 = 44 years old
    expect(computeFilerCategory('1980-06-01', '2026-27')).toBe('general')
  })

  it('age exactly 60 → senior', () => {
    // Born 1965-04-01 = exactly 60 on 1 Apr 2025
    expect(computeFilerCategory('1965-04-01', '2026-27')).toBe('senior')
  })

  it('age 65 → senior', () => {
    expect(computeFilerCategory('1960-01-15', '2026-27')).toBe('senior')
  })

  it('age exactly 80 → super_senior', () => {
    expect(computeFilerCategory('1945-04-01', '2026-27')).toBe('super_senior')
  })

  it('age 85 → super_senior', () => {
    expect(computeFilerCategory('1940-01-01', '2026-27')).toBe('super_senior')
  })
})

// ─── T67: House property income ───────────────────────────────────────────────

describe('T67 — computeScheduleHP', () => {
  const selfOccProp: HouseProperty = {
    id: 'hp_1', propertyType: 'self_occupied', address: '123 MG Road', coOwnerShare: 1,
    annualRentReceived: 0, municipalTaxPaid: 0, netAnnualValue: 0,
    standardDeduction30pct: 0, interestOnLoan: 150_000, incomeFromHP: 0,
  }

  const letOutProp: HouseProperty = {
    id: 'hp_2', propertyType: 'let_out', address: '456 Park Ave', coOwnerShare: 1,
    annualRentReceived: 300_000, municipalTaxPaid: 20_000, netAnnualValue: 280_000,
    standardDeduction30pct: 0, interestOnLoan: 100_000, incomeFromHP: 0,
  }

  it('self-occupied: NAV=0, interest capped at ₹2L', () => {
    const r = computeScheduleHP([selfOccProp], 'new', {})
    expect(r.properties[0].netAnnualValue).toBe(0)
    expect(r.properties[0].standardDeduction30pct).toBe(0)
    expect(r.properties[0].interestOnLoan).toBe(150_000)
    expect(r.properties[0].incomeFromHP).toBe(-150_000)
    expect(r.totalIncomeFromHP).toBe(-150_000)
  })

  it('self-occupied: interest > ₹2L gets capped', () => {
    const prop = { ...selfOccProp, interestOnLoan: 300_000 }
    const r = computeScheduleHP([prop], 'new', {})
    expect(r.properties[0].interestOnLoan).toBe(200_000)  // capped at 2L
    expect(r.properties[0].incomeFromHP).toBe(-200_000)
  })

  it('let-out: NAV computed correctly, 30% std deduction applied', () => {
    const r = computeScheduleHP([letOutProp], 'new', {})
    const nav = 300_000 - 20_000  // 280_000
    expect(r.properties[0].netAnnualValue).toBe(nav)
    expect(r.properties[0].standardDeduction30pct).toBe(Math.round(nav * 0.30))
    expect(r.properties[0].incomeFromHP).toBe(nav - Math.round(nav * 0.30) - 100_000)
  })

  it('let-out with profit: positive income', () => {
    const highRent = { ...letOutProp, annualRentReceived: 600_000, interestOnLoan: 50_000 }
    const r = computeScheduleHP([highRent], 'new', {})
    expect(r.totalIncomeFromHP).toBeGreaterThan(0)
  })

  it('let-out loss: Old Regime — loss set off against salary up to ₹2L', () => {
    const lossLetOut = { ...letOutProp, annualRentReceived: 100_000, interestOnLoan: 300_000 }
    const r = computeScheduleHP([lossLetOut], 'old', {})
    expect(r.totalIncomeFromHP).toBeLessThan(0)
    expect(r.lossSetOffAgainstSalary).toBeGreaterThan(0)
    expect(r.lossSetOffAgainstSalary).toBeLessThanOrEqual(200_000)
    expect(r.lossRingFenced).toBe(0)
  })

  it('let-out loss: New Regime — loss ring-fenced', () => {
    const lossLetOut = { ...letOutProp, annualRentReceived: 100_000, interestOnLoan: 300_000 }
    const r = computeScheduleHP([lossLetOut], 'new', {})
    expect(r.lossSetOffAgainstSalary).toBe(0)
    expect(r.lossRingFenced).toBeGreaterThan(0)
  })

  it('two properties: totals aggregated correctly', () => {
    const r = computeScheduleHP([selfOccProp, letOutProp], 'new', {})
    expect(r.properties).toHaveLength(2)
    const expected = r.properties.reduce((s, p) => s + p.incomeFromHP, 0)
    expect(r.totalIncomeFromHP).toBe(expected)
  })
})

// ─── T68: Property capital gains ─────────────────────────────────────────────

describe('T68 — computePropertyCG', () => {
  it('getCII returns correct value for known year', () => {
    expect(getCII('2015-16')).toBe(254)
    expect(getCII('2025-26')).toBe(381)
    expect(getCII('2001-02')).toBe(100)
  })

  it('getCII returns null for unknown year', () => {
    expect(getCII('1999-00')).toBeNull()
    expect(getCII('2030-31')).toBeNull()
  })

  it('computeIndexedCost: correct CII-based computation', () => {
    // Purchase FY 2010-11 (CII=167), Sale FY 2025-26 (CII=381)
    const { indexedCost, ciiMissing } = computeIndexedCost(1_000_000, '2010-11', '2025-26')
    expect(ciiMissing).toBe(false)
    expect(indexedCost).toBe(Math.round(1_000_000 * (381 / 167)))
  })

  it('computeIndexedCost: missing purchase year falls back to purchase price', () => {
    const { indexedCost, ciiMissing, missingFY } = computeIndexedCost(1_000_000, '1995-96', '2025-26')
    expect(ciiMissing).toBe(true)
    expect(missingFY).toBe('1995-96')
    expect(indexedCost).toBe(1_000_000)
  })

  it('STCG property: held ≤ 2 years, no indexation', () => {
    const sale: PropertySale = {
      id: 'ps_1', address: '123 Park', purchaseDate: '2024-01-01', saleDate: '2025-06-01',
      purchasePrice: 5_000_000, salePrice: 5_500_000, purchaseFY: '2023-24', saleFY: '2025-26',
      indexedCost: 0, improvementCost: 0, transferExpenses: 100_000,
      netGain: 0, gainType: 'STCG', exemptionClaimed: false, exemptionAmount: 0,
    }
    const { propertySTCG, propertyLTCG } = computePropertyCG([sale], {})
    expect(propertySTCG).toBe(5_500_000 - 5_000_000 - 100_000)  // 400,000
    expect(propertyLTCG).toBe(0)
  })

  it('LTCG property: held > 2 years, indexation applied', () => {
    const sale: PropertySale = {
      id: 'ps_2', address: '456 Road', purchaseDate: '2015-06-01', saleDate: '2025-09-01',
      purchasePrice: 3_000_000, salePrice: 8_000_000, purchaseFY: '2015-16', saleFY: '2025-26',
      indexedCost: 0, improvementCost: 0, transferExpenses: 200_000,
      netGain: 0, gainType: 'LTCG', exemptionClaimed: false, exemptionAmount: 0,
    }
    const { propertyLTCG, updatedSales } = computePropertyCG([sale], {})
    const expectedIndexed = Math.round(3_000_000 * (381 / 254))  // CII 2025-26 / 2015-16
    expect(updatedSales[0].indexedCost).toBe(expectedIndexed)
    expect(propertyLTCG).toBe(8_000_000 - expectedIndexed - 200_000)
  })

  it('54EC exemption: deducted from LTCG gain', () => {
    const sale: PropertySale = {
      id: 'ps_3', address: '789 Ave', purchaseDate: '2010-01-01', saleDate: '2025-06-01',
      purchasePrice: 2_000_000, salePrice: 10_000_000, purchaseFY: '2010-11', saleFY: '2025-26',
      indexedCost: 0, improvementCost: 0, transferExpenses: 0,
      netGain: 0, gainType: 'LTCG', exemptionClaimed: true, exemptionAmount: 5_000_000,
    }
    const { propertyLTCG } = computePropertyCG([sale], {})
    expect(propertyLTCG).toBeGreaterThan(0)
    // Net gain before exemption would be higher
  })

  it('missing CII year: fallback to purchase price + warning added', () => {
    const sale: PropertySale = {
      id: 'ps_4', address: 'Old House', purchaseDate: '1990-01-01', saleDate: '2025-06-01',
      purchasePrice: 500_000, salePrice: 5_000_000, purchaseFY: '1990-91', saleFY: '2025-26',
      indexedCost: 0, improvementCost: 0, transferExpenses: 0,
      netGain: 0, gainType: 'LTCG', exemptionClaimed: false, exemptionAmount: 0,
    }
    const { warnings, updatedSales } = computePropertyCG([sale], {})
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings[0]).toContain('CII')
    expect(updatedSales[0].indexedCost).toBe(500_000)  // fallback to purchase price
  })
})

// ─── T69: Business & profession expanded ─────────────────────────────────────

describe('T69 — computeScheduleBP_v2', () => {
  const presumptive44AD: PresumptiveEntry = {
    type: 'presumptive_44AD', grossReceipts: 2_000_000, isDigital: false,
    presumptiveRate: 0.08, presumptiveIncome: 0,
  }
  const presumptive44ADA: PresumptiveEntry = {
    type: 'presumptive_44ADA', grossReceipts: 1_800_000, isDigital: false,
    presumptiveRate: 0.50, presumptiveIncome: 0,
  }
  const fnoEntry: FnOEntry = { turnover: 500_000, taxableIncome: 50_000, notComputed: true }

  it('44AD non-digital: income = 8% of receipts', () => {
    const r = computeScheduleBP_v2(null, [presumptive44AD], null, 0, 0, {})
    expect(r.presumptiveEntries[0].presumptiveRate).toBe(0.08)
    expect(r.presumptiveEntries[0].presumptiveIncome).toBe(160_000)
  })

  it('44AD digital: income = 6% of receipts', () => {
    const digitalEntry = { ...presumptive44AD, isDigital: true }
    const r = computeScheduleBP_v2(null, [digitalEntry], null, 0, 0, {})
    expect(r.presumptiveEntries[0].presumptiveRate).toBe(0.06)
    expect(r.presumptiveEntries[0].presumptiveIncome).toBe(120_000)
  })

  it('44ADA: income = 50% of receipts', () => {
    const r = computeScheduleBP_v2(null, [presumptive44ADA], null, 0, 0, {})
    expect(r.presumptiveEntries[0].presumptiveRate).toBe(0.50)
    expect(r.presumptiveEntries[0].presumptiveIncome).toBe(900_000)
  })

  it('F&O: notComputed=true, turnover preserved', () => {
    const r = computeScheduleBP_v2(null, [], fnoEntry, 0, 0, {})
    expect(r.fno?.notComputed).toBe(true)
    expect(r.fno?.turnover).toBe(500_000)
  })

  it('getTotalPresumptiveIncome: sums all entries', () => {
    const r = computeScheduleBP_v2(null, [presumptive44AD, presumptive44ADA], null, 0, 0, {})
    expect(getTotalPresumptiveIncome(r.presumptiveEntries)).toBe(160_000 + 900_000)
  })

  it('combined: speculative + presumptive + F&O', () => {
    const r = computeScheduleBP_v2(null, [presumptive44AD], fnoEntry, 100_000, 0, {})
    expect(r.presumptiveEntries).toHaveLength(1)
    expect(r.fno).not.toBeNull()
    expect(r.nonSpeculativeIncome).toBe(100_000)
  })
})

// ─── T70: Other sources v2 ────────────────────────────────────────────────────

describe('T70 — computeScheduleOS_v2', () => {
  it('all zero → all totals zero', () => {
    const r = computeScheduleOS_v2(emptyOtherSourcesBreakdown(), {})
    expect(r.total).toBe(0)
    expect(r.totalAtSlabRate).toBe(0)
    expect(r.totalAt30Pct).toBe(0)
  })

  it('FD interest at slab rate', () => {
    const b = { ...emptyOtherSourcesBreakdown(), fdInterest: 50_000 }
    const r = computeScheduleOS_v2(b, {})
    expect(r.totalAtSlabRate).toBe(50_000)
    expect(r.totalAt30Pct).toBe(0)
  })

  it('lottery at 30% flat', () => {
    const b = { ...emptyOtherSourcesBreakdown(), lotteryWinnings: 100_000 }
    const r = computeScheduleOS_v2(b, {})
    expect(r.totalAt30Pct).toBe(100_000)
    expect(r.totalAtSlabRate).toBe(0)
  })

  it('family pension: std deduction applied', () => {
    const b = { ...emptyOtherSourcesBreakdown(), familyPension: 120_000 }
    const r = computeScheduleOS_v2(b, {})
    // Std ded = min(120000 × 0.333, 15000) = min(39960, 15000) = 15000
    expect(r.breakdown.familyPensionStdDed).toBe(15_000)
    expect(r.totalAtSlabRate).toBe(120_000 - 15_000)  // 105,000
  })

  it('gifts: only amount above ₹50k is taxable', () => {
    const b = { ...emptyOtherSourcesBreakdown(), giftReceived: 80_000 }
    const r = computeScheduleOS_v2(b, {})
    expect(r.totalAtSlabRate).toBe(30_000)  // 80k - 50k
  })

  it('gifts below ₹50k: not taxable', () => {
    const b = { ...emptyOtherSourcesBreakdown(), giftReceived: 40_000 }
    const r = computeScheduleOS_v2(b, {})
    expect(r.totalAtSlabRate).toBe(0)
  })

  it('override applies to savings interest', () => {
    const b = { ...emptyOtherSourcesBreakdown(), savingsInterest: 5_000 }
    const r = computeScheduleOS_v2(b, { 'OS_v2.savingsInterest': 8_000 })
    expect(r.breakdown.savingsInterest).toBe(8_000)
  })
})

// ─── T71: ITR form detection ──────────────────────────────────────────────────

describe('T71 — detectITRForm', () => {
  const sEmpty = emptyScheduleS_v2()
  const hpEmpty = emptyHP()
  const cgEmpty = emptyCG()
  const bpEmpty = emptyBP_v2()
  const osEmpty = emptyOS_v2()

  it('salary only, income ≤ ₹50L → ITR-1', () => {
    const S = { ...sEmpty, totalNetTaxable: 4_000_000, employers: [makeEmployer({ netTaxableSalary: 4_000_000 })] }
    expect(detectITRForm(S, hpEmpty, cgEmpty, bpEmpty, osEmpty, 4_000_000)).toBe('ITR1')
  })

  it('salary + CG → ITR-2', () => {
    const CG = { ...cgEmpty, totalSTCG: 200_000 }
    const S = { ...sEmpty, totalNetTaxable: 1_000_000 }
    expect(detectITRForm(S, hpEmpty, CG, bpEmpty, osEmpty, 1_200_000)).toBe('ITR2')
  })

  it('salary + intraday → ITR-3', () => {
    const BP = { ...bpEmpty, netSpeculativePnL: -18_500, speculativeTurnover: 18_500 }
    expect(detectITRForm(sEmpty, hpEmpty, cgEmpty, BP, osEmpty, 500_000)).toBe('ITR3')
  })

  it('F&O → ITR-3', () => {
    const BP = { ...bpEmpty, fno: { turnover: 500_000, taxableIncome: 50_000, notComputed: true } }
    expect(detectITRForm(sEmpty, hpEmpty, cgEmpty, BP, osEmpty, 50_000)).toBe('ITR3')
  })

  it('presumptive only → ITR-4', () => {
    const BP: ScheduleBP_v2 = {
      ...bpEmpty,
      presumptiveEntries: [{ type: 'presumptive_44ADA', grossReceipts: 1_800_000, isDigital: false, presumptiveRate: 0.50, presumptiveIncome: 900_000 }],
    }
    expect(detectITRForm(sEmpty, hpEmpty, cgEmpty, BP, osEmpty, 900_000)).toBe('ITR4')
  })

  it('presumptive + salary → ITR-3 (mixed)', () => {
    const BP: ScheduleBP_v2 = {
      ...bpEmpty,
      presumptiveEntries: [{ type: 'presumptive_44ADA', grossReceipts: 1_000_000, isDigital: false, presumptiveRate: 0.50, presumptiveIncome: 500_000 }],
    }
    const S = { ...sEmpty, totalNetTaxable: 500_000, employers: [makeEmployer({ netTaxableSalary: 500_000 })] }
    expect(detectITRForm(S, hpEmpty, cgEmpty, BP, osEmpty, 1_000_000)).toBe('ITR3')
  })

  it('income > ₹50L but no CG/BP → ITR-2', () => {
    const S = { ...sEmpty, totalNetTaxable: 6_000_000, employers: [makeEmployer({ netTaxableSalary: 6_000_000 })] }
    expect(detectITRForm(S, hpEmpty, cgEmpty, bpEmpty, osEmpty, 6_000_000)).toBe('ITR2')
  })

  it('multiple HP properties → ITR-2', () => {
    const HP: ScheduleHP = {
      properties: [
        { id: 'hp_1', propertyType: 'self_occupied', address: 'A', coOwnerShare: 1, annualRentReceived: 0, municipalTaxPaid: 0, netAnnualValue: 0, standardDeduction30pct: 0, interestOnLoan: 0, incomeFromHP: 0 },
        { id: 'hp_2', propertyType: 'let_out', address: 'B', coOwnerShare: 1, annualRentReceived: 200_000, municipalTaxPaid: 0, netAnnualValue: 200_000, standardDeduction30pct: 60_000, interestOnLoan: 0, incomeFromHP: 140_000 },
      ],
      totalIncomeFromHP: 140_000, totalInterest: 0, lossSetOffAgainstSalary: 0, lossRingFenced: 0,
    }
    expect(detectITRForm(sEmpty, HP, cgEmpty, bpEmpty, osEmpty, 140_000)).toBe('ITR2')
  })
})

describe('T71 — computeScheduleALRequired', () => {
  it('income > ₹50L + ITR-2 → required', () => {
    expect(computeScheduleALRequired(6_000_000, 'ITR2')).toBe(true)
  })

  it('income > ₹50L + ITR-3 → required', () => {
    expect(computeScheduleALRequired(6_000_000, 'ITR3')).toBe(true)
  })

  it('income > ₹50L + ITR-1 → NOT required', () => {
    expect(computeScheduleALRequired(6_000_000, 'ITR1')).toBe(false)
  })

  it('income > ₹50L + ITR-4 → NOT required', () => {
    expect(computeScheduleALRequired(6_000_000, 'ITR4')).toBe(false)
  })

  it('income ≤ ₹50L → NOT required regardless of form', () => {
    expect(computeScheduleALRequired(4_000_000, 'ITR2')).toBe(false)
    expect(computeScheduleALRequired(4_000_000, 'ITR3')).toBe(false)
  })
})
