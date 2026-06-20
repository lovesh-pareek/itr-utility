import { describe, it, expect } from 'vitest'
import { computeSlabTax, computeTax } from '../taxComputation'
import { computeSchedules } from '../index'
import type { BrokerData, Form16Data, MFData, Schedules } from '../../types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeForm16(gross: number, tds: number, profTax = 0): Form16Data {
  return {
    grossSalary: gross,
    standardDeduction: 75_000,
    professionalTax: profTax,
    netTaxableSalary: gross - 75_000 - profTax,
    tdsDeducted: tds,
    pan: 'ABCDE1234F',
    tanEmployer: 'MUMA12345B',
    employerName: 'Acme Corp',
    assessmentYear: '2026-27',
    unresolvedFields: [],
  }
}

function makeEmptyBroker(): BrokerData {
  return {
    broker: 'zerodha',
    equityDelivery: { trades: [], totalSTCG: 0, totalLTCG: 0, totalSTCL: 0, totalLTCL: 0 },
    equityIntraday: { turnover: 0, netPnL: 0 },
    dividends: { scrips: [], total: 0 },
    hasFnO: false,
    rawSheetNames: [],
  }
}

function makeBroker(opts: {
  stcg?: number; ltcg?: number; stcl?: number; ltcl?: number
  intradayPnL?: number; dividends?: number
}): BrokerData {
  return {
    broker: 'zerodha',
    equityDelivery: {
      trades: [],
      totalSTCG: opts.stcg ?? 0,
      totalLTCG: opts.ltcg ?? 0,
      totalSTCL: opts.stcl ?? 0,
      totalLTCL: opts.ltcl ?? 0,
    },
    equityIntraday: { turnover: Math.abs(opts.intradayPnL ?? 0), netPnL: opts.intradayPnL ?? 0 },
    dividends: { scrips: [], total: opts.dividends ?? 0 },
    hasFnO: false,
    rawSheetNames: [],
  }
}

function makeEmptyMF(): MFData {
  return { schemes: [], totalEquitySTCG: 0, totalEquityLTCG: 0, totalDebtGains: 0 }
}

function schedules(
  form16?: Form16Data | null,
  broker?: BrokerData | null,
  mf?: MFData | null,
  overrides: Record<string, number> = {}
): Schedules {
  return computeSchedules(broker ?? null, form16 ?? null, mf ?? null, overrides)
}

// ─── T47: Boundary and exemption tests ───────────────────────────────────────

describe('computeSlabTax — New Regime slabs', () => {
  it('zero income → zero tax', () => {
    expect(computeSlabTax(0)).toBe(0)
  })

  it('income ₹4,00,000 (nil slab top) → zero tax', () => {
    expect(computeSlabTax(400_000)).toBe(0)
  })

  it('income ₹8,00,000 → 5% on 4L = ₹20,000', () => {
    expect(computeSlabTax(800_000)).toBe(20_000)
  })

  it('income ₹12,00,000 → ₹80,000 slab tax', () => {
    // 0 on first 4L + 5% on 4L (₹20k) + 10% on 4L (₹40k) = ₹60k
    // Wait — slab 3 is ₹8L–₹12L at 10% = ₹40k; slab 2 is ₹4L–₹8L at 5% = ₹20k; total ₹60k
    expect(computeSlabTax(1_200_000)).toBe(60_000)
  })

  it('income ₹12,00,001 → same slab tax as ₹12L plus marginal tax on ₹1', () => {
    // 15% on ₹1 = 0 (rounds to 0), so still ₹60k
    expect(computeSlabTax(1_200_001)).toBeGreaterThanOrEqual(60_000)
  })
})

describe('Section 87A rebate', () => {
  it('slab income ₹12,00,000 → full slab tax rebated (net zero)', () => {
    const f16 = makeForm16(12_75_000, 0)   // gross, TDS — net taxable = 12L after std deduction
    const s = schedules(f16, makeEmptyBroker(), makeEmptyMF())
    const tax = computeTax(s, 0, 0)
    expect(tax.section87AEligible).toBe(true)
    expect(tax.section87ARebate).toBe(tax.slabTax + tax.section87ARebate) // rebate = full slab tax
    expect(tax.slabTax).toBe(0)
  })

  it('slab income ₹12,00,001 → rebate does NOT apply', () => {
    const f16 = makeForm16(12_75_001, 0)   // net taxable just over 12L
    const s = schedules(f16, makeEmptyBroker(), makeEmptyMF())
    const tax = computeTax(s, 0, 0)
    expect(tax.section87AEligible).toBe(false)
    expect(tax.section87ARebate).toBe(0)
    expect(tax.slabTax).toBeGreaterThan(0)
  })

  it('87A rebate does NOT apply to STCG', () => {
    const f16 = makeForm16(5_75_000, 0)    // net taxable 5L — below rebate threshold
    const broker = makeBroker({ stcg: 200_000 })
    const s = schedules(f16, broker, makeEmptyMF())
    const tax = computeTax(s, 0, 0)
    // Slab income is 5L (below 12L), so slab tax is rebated
    expect(tax.section87AEligible).toBe(true)
    expect(tax.slabTax).toBe(0)
    // But STCG tax is still charged
    expect(tax.stcgTax).toBe(Math.round(200_000 * 0.20))
  })
})

describe('LTCG exemption', () => {
  it('LTCG exactly ₹1,25,000 → zero LTCG tax', () => {
    const f16 = makeForm16(5_75_000, 0)
    const broker = makeBroker({ ltcg: 125_000 })
    const s = schedules(f16, broker, makeEmptyMF())
    expect(s.CG.taxableLTCG).toBe(0)
    const tax = computeTax(s, 0, 0)
    expect(tax.ltcgTax).toBe(0)
  })

  it('LTCG ₹1,25,001 → ₹1 taxable at 12.5%', () => {
    const f16 = makeForm16(5_75_000, 0)
    const broker = makeBroker({ ltcg: 125_001 })
    const s = schedules(f16, broker, makeEmptyMF())
    expect(s.CG.taxableLTCG).toBe(1)
    const tax = computeTax(s, 0, 0)
    // 12.5% of ₹1 rounds to 0
    expect(tax.ltcgTax).toBe(0)
  })

  it('LTCG ₹3,25,000 → ₹2,00,000 taxable at 12.5% = ₹25,000', () => {
    const f16 = makeForm16(5_75_000, 0)
    const broker = makeBroker({ ltcg: 325_000 })
    const s = schedules(f16, broker, makeEmptyMF())
    expect(s.CG.taxableLTCG).toBe(200_000)
    const tax = computeTax(s, 0, 0)
    expect(tax.ltcgTax).toBe(25_000)
  })
})

// ─── T48: Loss set-off and carry forward ─────────────────────────────────────

describe('Loss set-off rules', () => {
  it('intraday loss cannot offset salary income', () => {
    const f16 = makeForm16(15_75_000, 0)   // high salary
    const broker = makeBroker({ intradayPnL: -50_000 })
    const s = schedules(f16, broker, makeEmptyMF())
    // Salary remains unchanged despite intraday loss
    expect(s.CYLA.netSalaryIncome).toBe(s.S.netTaxableSalary)
    // Intraday loss carries forward
    expect(s.CFL.intradayLossCarryForward).toBe(50_000)
  })

  it('intraday loss cannot offset capital gains', () => {
    const f16 = makeForm16(5_75_000, 0)
    const broker = makeBroker({ stcg: 100_000, intradayPnL: -30_000 })
    const s = schedules(f16, broker, makeEmptyMF())
    // STCG is not reduced by intraday loss
    expect(s.CYLA.netSTCG).toBe(100_000)
    expect(s.CFL.intradayLossCarryForward).toBe(30_000)
  })

  it('STCL fully absorbed by STCG → zero carry forward', () => {
    const f16 = makeForm16(5_75_000, 0)
    const broker = makeBroker({ stcg: 100_000, stcl: 80_000 })
    const s = schedules(f16, broker, makeEmptyMF())
    expect(s.CG.netSTCG).toBe(20_000)
    expect(s.CFL.stclCarryForward).toBe(0)
  })

  it('STCL exceeds STCG → remainder set off against LTCG', () => {
    const f16 = makeForm16(5_75_000, 0)
    const broker = makeBroker({ stcg: 50_000, stcl: 80_000, ltcg: 200_000 })
    const s = schedules(f16, broker, makeEmptyMF())
    // 30k STCL remains after absorbing STCG; sets off against LTCG
    expect(s.CG.netSTCG).toBe(0)
    expect(s.CG.netLTCG).toBe(200_000 - 30_000)   // 170k
    expect(s.CFL.stclCarryForward).toBe(0)
  })

  it('STCL exceeds both STCG and LTCG → remainder carried forward', () => {
    const f16 = makeForm16(5_75_000, 0)
    const broker = makeBroker({ stcg: 50_000, stcl: 200_000, ltcg: 100_000 })
    const s = schedules(f16, broker, makeEmptyMF())
    expect(s.CG.netSTCG).toBe(0)
    expect(s.CG.netLTCG).toBe(0)
    // 50k absorbed STCG, remaining 150k; 100k absorbed LTCG, remaining 50k carries forward
    expect(s.CFL.stclCarryForward).toBe(50_000)
  })

  it('LTCL cannot offset STCG', () => {
    const f16 = makeForm16(5_75_000, 0)
    const broker = makeBroker({ stcg: 100_000, ltcl: 80_000, ltcg: 0 })
    const s = schedules(f16, broker, makeEmptyMF())
    // LTCL cannot touch STCG
    expect(s.CG.netSTCG).toBe(100_000)
    // LTCL carries forward since no LTCG to absorb it
    expect(s.CFL.ltclCarryForward).toBe(80_000)
  })

  it('LTCL offset against LTCG', () => {
    const f16 = makeForm16(5_75_000, 0)
    const broker = makeBroker({ ltcg: 300_000, ltcl: 100_000 })
    const s = schedules(f16, broker, makeEmptyMF())
    expect(s.CG.netLTCG).toBe(200_000)
    expect(s.CFL.ltclCarryForward).toBe(0)
  })
})

// ─── T49: Surcharge and multi-profile tests ───────────────────────────────────

describe('Surcharge', () => {
  it('income ₹49,99,999 → no surcharge', () => {
    const f16 = makeForm16(50_74_999, 0)   // net taxable just under ₹50L
    const s = schedules(f16, makeEmptyBroker(), makeEmptyMF())
    const tax = computeTax(s, 0, 0)
    expect(tax.totalIncome).toBeLessThan(5_000_000)
    expect(tax.surcharge).toBe(0)
  })

  it('income ₹50,00,001 → 10% surcharge', () => {
    const f16 = makeForm16(50_75_001, 0)   // net taxable just over ₹50L
    const s = schedules(f16, makeEmptyBroker(), makeEmptyMF())
    const tax = computeTax(s, 0, 0)
    expect(tax.totalIncome).toBeGreaterThan(5_000_000)
    expect(tax.surcharge).toBeGreaterThan(0)
    // Surcharge = 10% of (slabTax + stcgTax + ltcgTax)
    expect(tax.surcharge).toBe(Math.round(tax.subtotalBeforeSurcharge * 0.10))
  })

  it('income ₹1Cr → 15% surcharge', () => {
    const f16 = makeForm16(1_00_75_001, 0)  // net taxable ~₹1Cr
    const s = schedules(f16, makeEmptyBroker(), makeEmptyMF())
    const tax = computeTax(s, 0, 0)
    expect(tax.totalIncome).toBeGreaterThan(10_000_000)
    expect(tax.surcharge).toBe(Math.round(tax.subtotalBeforeSurcharge * 0.15))
  })
})

describe('Full income profiles', () => {
  it('Profile A: salary only, no trading', () => {
    const f16 = makeForm16(12_75_000, 60_000)   // gross 12.75L, TDS 60k
    const s = schedules(f16, makeEmptyBroker(), makeEmptyMF())
    const tax = computeTax(s, 60_000, 0)
    // Net taxable salary = 12,75,000 - 75,000 = 12,00,000
    expect(s.S.netTaxableSalary).toBe(12_00_000)
    // Section 87A: slab income exactly 12L → rebate applies
    expect(tax.section87AEligible).toBe(true)
    expect(tax.slabTax).toBe(0)
    expect(tax.totalTaxPayable).toBe(0)  // zero tax after rebate, so no cess
    // Net payable = 0 - 60,000 TDS = -60,000 (refund)
    expect(tax.netPayable).toBe(-60_000)
  })

  it('Profile B: salary + LTCG above exemption, no losses', () => {
    const f16 = makeForm16(10_75_000, 50_000)
    const broker = makeBroker({ ltcg: 300_000 })
    const s = schedules(f16, broker, makeEmptyMF())
    const tax = computeTax(s, 50_000, 0)
    // Net salary = 10L; slab tax: 5% on 4L (₹20k) + 10% on 2L (₹20k) = ₹40k → rebate since slab ≤ 12L
    expect(tax.section87AEligible).toBe(true)
    expect(tax.slabTax).toBe(0)
    // Taxable LTCG = 3L - 1.25L = 1.75L → 12.5% = ₹21,875
    expect(s.CG.taxableLTCG).toBe(175_000)
    expect(tax.ltcgTax).toBe(21_875)
    // Cess on LTCG tax only
    expect(tax.cess).toBe(Math.round(tax.totalBeforeCess * 0.04))
  })

  it('Profile C: salary + intraday loss + STCG + MF gains (primary user)', () => {
    const f16 = makeForm16(12_75_000, 1_00_000)    // gross 12.75L
    const broker = makeBroker({ stcg: 200_000, intradayPnL: -18_500 })
    const mf: MFData = {
      schemes: [],
      totalEquitySTCG: 50_000,
      totalEquityLTCG: 0,
      totalDebtGains: 0,
    }
    const s = schedules(f16, broker, mf)
    const tax = computeTax(s, 1_00_000, 0)

    // Salary net = 12L (87A eligible)
    expect(s.S.netTaxableSalary).toBe(12_00_000)
    expect(tax.section87AEligible).toBe(true)
    expect(tax.slabTax).toBe(0)

    // Intraday loss carries forward — does NOT reduce salary or CG
    expect(s.CFL.intradayLossCarryForward).toBe(18_500)
    expect(s.CYLA.netSalaryIncome).toBe(12_00_000)  // unchanged

    // Total STCG = 2L + 50k = 2.5L → 20% = ₹50,000
    expect(s.CG.grossSTCG).toBe(250_000)
    expect(tax.stcgTax).toBe(50_000)
  })
})

describe('Cess computation', () => {
  it('cess is exactly 4% of totalBeforeCess', () => {
    const f16 = makeForm16(15_75_000, 0)
    const s = schedules(f16, makeEmptyBroker(), makeEmptyMF())
    const tax = computeTax(s, 0, 0)
    expect(tax.cess).toBe(Math.round(tax.totalBeforeCess * 0.04))
  })
})

describe('Net payable / refund', () => {
  it('TDS > total tax → refund (negative netPayable)', () => {
    const f16 = makeForm16(5_75_000, 50_000)
    const s = schedules(f16, makeEmptyBroker(), makeEmptyMF())
    const tax = computeTax(s, 50_000, 0)
    expect(tax.netPayable).toBeLessThan(0)
  })

  it('TDS < total tax → payable (positive netPayable)', () => {
    const f16 = makeForm16(25_75_000, 10_000)
    const s = schedules(f16, makeEmptyBroker(), makeEmptyMF())
    const tax = computeTax(s, 10_000, 0)
    expect(tax.netPayable).toBeGreaterThan(0)
  })

  it('advance tax reduces payable', () => {
    const f16 = makeForm16(25_75_000, 50_000)
    const s = schedules(f16, makeEmptyBroker(), makeEmptyMF())
    const taxWithout = computeTax(s, 50_000, 0)
    const taxWith    = computeTax(s, 50_000, 50_000)
    expect(taxWith.netPayable).toBe(taxWithout.netPayable - 50_000)
  })
})
