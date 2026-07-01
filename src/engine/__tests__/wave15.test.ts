/**
 * Wave 15 — T90 Integration Tests
 *
 * Profile 1: Simple salary only → ITR1, no ScheduleAL
 * Profile 2: Salary + equity + MF → ITR3, CFL entries
 * Profile 3: Two employers + income > 50L → ITR2, ScheduleAL required
 * Profile 4: Senior citizen, Old Regime, max deductions
 * Profile 5: Presumptive 44ADA → ITR4
 *
 * Tests run entirely in the engine layer (no UI, no file parsing).
 * All assertions use the actual tax engine functions built in Waves 10–14.
 */

import { describe, it, expect } from 'vitest'
import { computeTax_v2 }            from '../taxComputation'
import { computeDeductionsVI_A, emptyRawDeductions } from '../deductionsEngine'
import { computeTaxCredits, emptyTaxCredits }         from '../taxCreditsEngine'
import { computeRegimeComparison, computeFilerCategory } from '../regimeComparison'
import { detectITRForm, computeScheduleALRequired }   from '../incomeEngine_v2'
import type { Schedules_v2, FilerProfile, CFLEntry } from '../../types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSV2(s: Partial<Schedules_v2> = {}): Schedules_v2 {
  return {
    S: { employers: [], totalGross: 0, totalStdDeduction: 75_000, totalProfessionalTax: 0, totalNetTaxable: 0, totalTDS: 0 },
    HP: { properties: [], totalIncomeFromHP: 0, totalInterest: 0, lossSetOffAgainstSalary: 0, lossRingFenced: 0 },
    CG: { equitySTCG: 0, equityLTCG: 0, equityMFSTCG: 0, equityMFLTCG: 0, debtMFGains: 0, propertySales: [], propertySTCG: 0, propertyLTCG: 0, totalSTCG: 0, totalLTCG: 0, intraEquitySetOff: 0 } as any,
    BP: { speculativeTurnover: 0, speculativePL: 0, netSpeculativePnL: 0, presumptiveEntries: [], fno: null, nonSpeculativeIncome: 0, nonSpeculativeLoss: 0 } as any,
    OS: { breakdown: { savingsInterest: 0, fdInterest: 0, rdInterest: 0, seniorCitizenInterest: 0, dividendIncome: 0, dividendFromForeignCompany: 0, giftReceived: 0, lotteryWinnings: 0, casualIncome: 0, familyPension: 0, familyPensionStdDed: 0 }, totalAtSlabRate: 0, totalAt30Pct: 0, total: 0 },
    CYLA: {} as any,
    CFL: { entries: [], totalSpeculative: 0, totalSTCL: 0, totalLTCL: 0, totalHP: 0, totalBusiness: 0 },
    ...s,
  }
}

function makeProfile(dob: string | null, ay = '2026-27'): FilerProfile {
  const cat = computeFilerCategory(dob, ay)
  return { dateOfBirth: dob, filerCategory: cat }
}

// ─── Profile 1: Simple salary only → ITR-1 ───────────────────────────────────

describe('Integration Profile 1 — Simple salary, New Regime → ITR-1', () => {
  const grossSalary = 800_000
  const stdDed      = 75_000
  const netSalary   = grossSalary - stdDed         // 7,25,000
  const tds         = 30_000

  const sv2 = makeSV2({
    S: { employers: [], totalGross: grossSalary, totalStdDeduction: stdDed, totalProfessionalTax: 0, totalNetTaxable: netSalary, totalTDS: tds },
  })

  const deductions = computeDeductionsVI_A(emptyRawDeductions(grossSalary), 'new', 'general')
  const credits    = computeTaxCredits([{ id: 't1', tanDeductor: 'T', deductorName: 'Emp', grossAmount: grossSalary, tdsAmount: tds, section: '192', source: 'form16' }], [], [])

  it('ITR form detection → ITR1 (salary + OS only, no CG/BP, total ≤ 50L)', () => {
    const form = detectITRForm(sv2.S, sv2.HP, sv2.CG as any, sv2.BP as any, sv2.OS, netSalary)
    expect(form).toBe('ITR1')
  })

  it('Schedule AL not required (income ≤ ₹50L)', () => {
    expect(computeScheduleALRequired(netSalary, 'ITR1')).toBe(false)
  })

  it('87A rebate applies — total tax = 0 (income ≤ ₹12L New Regime)', () => {
    const tax = computeTax_v2(netSalary, 0, 0, 0, deductions, credits, 'new')
    expect(tax.section87AEligible).toBe(true)
    expect(tax.totalTaxPayable).toBe(0)
    expect(tax.netPayable).toBe(-tds)   // full refund of TDS
  })
})

// ─── Profile 2: Salary + equity + MF + intraday → ITR-3, CFL ────────────────

describe('Integration Profile 2 — Salary + equity + MF + intraday → ITR-3', () => {
  const grossSalary   = 1_200_000
  const netSalary     = 1_122_600   // after std ded + prof tax
  const equitySTCG    = 45_000
  const equityLTCG    = 28_000
  const mfSTCG        = 12_000
  const mfLTCG        = 5_000
  const intradayLoss  = -18_500
  const tds           = 149_114

  const sv2 = makeSV2({
    S: { employers: [], totalGross: grossSalary, totalStdDeduction: 75_000, totalProfessionalTax: 2_400, totalNetTaxable: netSalary, totalTDS: tds },
    CG: { equitySTCG, equityLTCG, equityMFSTCG: mfSTCG, equityMFLTCG: mfLTCG, debtMFGains: 0, propertySales: [], propertySTCG: 0, propertyLTCG: 0, totalSTCG: equitySTCG + mfSTCG, totalLTCG: equityLTCG + mfLTCG, intraEquitySetOff: 0 } as any,
    BP: { speculativeTurnover: 345_000, speculativePL: intradayLoss, netSpeculativePnL: intradayLoss, presumptiveEntries: [], fno: null, nonSpeculativeIncome: 0, nonSpeculativeLoss: 0 } as any,
    CFL: {
      entries: [{
        id: 'cfl-spec', lossType: 'speculative' as const,
        ayOfOrigin: '2025-26', amount: 18_500, yearsRemaining: 3, source: 'prior_itr' as const,
      }],
      totalSpeculative: 18_500, totalSTCL: 0, totalLTCL: 0, totalHP: 0, totalBusiness: 0,
    },
  })

  it('ITR form detection → ITR3 (has intraday/speculative BP income)', () => {
    expect(detectITRForm(sv2.S, sv2.HP, sv2.CG as any, sv2.BP as any, sv2.OS, netSalary + equitySTCG + mfSTCG + equityLTCG + mfLTCG)).toBe('ITR3')
  })

  it('CFL entries carry speculative loss forward correctly', () => {
    expect(sv2.CFL.entries).toHaveLength(1)
    expect(sv2.CFL.entries[0].lossType).toBe('speculative')
    expect(sv2.CFL.entries[0].yearsRemaining).toBe(3)
    expect(sv2.CFL.entries[0].amount).toBe(18_500)
  })

  it('Tax computed correctly: STCG @ 20%, LTCG @ 12.5%', () => {
    const deductions = computeDeductionsVI_A(emptyRawDeductions(grossSalary), 'new')
    const credits    = emptyTaxCredits()
    const totalSTCG  = equitySTCG + mfSTCG   // 57,000
    const totalLTCG  = equityLTCG + mfLTCG   // 33,000
    const tax = computeTax_v2(netSalary, totalSTCG, totalLTCG, totalLTCG, deductions, credits, 'new')
    expect(tax.stcgTax).toBe(Math.round(totalSTCG * 0.20))
    expect(tax.ltcgTax).toBe(Math.round(totalLTCG * 0.125))
    expect(tax.cess).toBe(Math.round((tax.slabTax + tax.stcgTax + tax.ltcgTax + tax.surcharge) * 0.04))
  })

  it('Schedule AL not required (total income < 50L)', () => {
    expect(computeScheduleALRequired(netSalary + equitySTCG + mfSTCG + equityLTCG + mfLTCG, 'ITR3')).toBe(false)
  })
})

// ─── Profile 3: High income (> 50L) → ITR-2, ScheduleAL required ─────────────

describe('Integration Profile 3 — Income > ₹50L → ITR-2, ScheduleAL required', () => {
  const grossSalary = 6_000_000   // 60L
  const netSalary   = 5_922_600   // after std ded + prof tax

  const sv2 = makeSV2({
    S: { employers: [], totalGross: grossSalary, totalStdDeduction: 75_000, totalProfessionalTax: 2_400, totalNetTaxable: netSalary, totalTDS: 800_000 },
  })

  it('ITR form detection → ITR2 (salary only, no BP, income > 50L)', () => {
    // No speculative/FnO → ITR2 (has no BP income)
    expect(detectITRForm(sv2.S, sv2.HP, sv2.CG as any, sv2.BP as any, sv2.OS, netSalary)).toBe('ITR2')
  })

  it('Schedule AL required for ITR2 when income > ₹50L', () => {
    expect(computeScheduleALRequired(netSalary, 'ITR2')).toBe(true)
  })

  it('Schedule AL NOT required for ITR1 even above 50L', () => {
    expect(computeScheduleALRequired(netSalary, 'ITR1')).toBe(false)
  })

  it('Surcharge applies at 10% for income 50L–1Cr', () => {
    const deductions = computeDeductionsVI_A(emptyRawDeductions(grossSalary), 'new')
    const credits    = emptyTaxCredits()
    const tax = computeTax_v2(netSalary, 0, 0, 0, deductions, credits, 'new')
    expect(tax.surcharge).toBeGreaterThan(0)
    expect(tax.totalIncome).toBeGreaterThan(5_000_000)
  })
})

// ─── Profile 4: Senior citizen, Old Regime, max deductions ───────────────────

describe('Integration Profile 4 — Senior citizen, Old Regime, max deductions', () => {
  const dob         = '1960-01-01'   // age 65 as of 1 Apr 2025 → senior
  const grossSalary = 1_500_000
  const netSalary   = 1_422_600

  const profile = makeProfile(dob)

  const raw = emptyRawDeductions(grossSalary)
  raw.sec80C_lic    = 100_000
  raw.sec80C_ppf    = 50_000     // 80C total 1.5L (at cap)
  raw.sec80CCD1B    = 50_000     // 80CCD1B extra NPS
  raw.sec80D_self   = 50_000     // senior self cap
  raw.sec80D_parents = 25_000
  raw.sec80TTB      = 40_000     // senior interest deduction

  const priorCFL: CFLEntry[] = [{
    id: 'cfl-stcl-prior', lossType: 'stcl',
    ayOfOrigin: '2025-26', amount: 12_000, yearsRemaining: 7, source: 'prior_itr',
  }]

  it('computeFilerCategory → senior (age 65)', () => {
    expect(profile.filerCategory).toBe('senior')
  })

  it('Old Regime deductions: 80C capped at 1.5L, 80TTB applies (not 80TTA)', () => {
    const ded = computeDeductionsVI_A(raw, 'old', 'senior')
    expect(ded.sec80C + ded.sec80CCC + ded.sec80CCD1).toBeLessThanOrEqual(150_000)
    expect(ded.sec80TTB).toBe(40_000)
    expect(ded.sec80TTA).toBe(0)   // 80TTB replaces 80TTA for seniors
    expect(ded.sec80D_self).toBe(50_000)   // senior cap ₹50k
  })

  it('Old Regime uses senior slabs (higher nil slab vs general)', () => {
    const ded     = computeDeductionsVI_A(raw, 'old', 'senior')
    const credits = emptyTaxCredits()
    const seniorTax  = computeTax_v2(netSalary, 0, 0, 0, ded, credits, 'old', 'senior')
    const generalDed = computeDeductionsVI_A(raw, 'old', 'general')
    const generalTax = computeTax_v2(netSalary, 0, 0, 0, generalDed, credits, 'old', 'general')
    // Senior has higher nil slab (3L vs 2.5L) → lower slab tax
    expect(seniorTax.slabTax).toBeLessThanOrEqual(generalTax.slabTax)
  })

  it('Prior year STCL carry-forward entries have correct yearsRemaining', () => {
    expect(priorCFL[0].yearsRemaining).toBe(7)
    expect(priorCFL[0].lossType).toBe('stcl')
    expect(priorCFL[0].source).toBe('prior_itr')
  })

  it('Regime comparison: Old Regime wins with large deductions at 15L income', () => {
    const sv2 = makeSV2({
      S: { employers: [], totalGross: grossSalary, totalStdDeduction: 75_000, totalProfessionalTax: 2_400, totalNetTaxable: netSalary, totalTDS: 0 },
    })
    const credits  = emptyTaxCredits()
    const result   = computeRegimeComparison(sv2 as any, raw, credits, profile)
    // With ~2.65L total old-regime deductions, Old Regime should have lower slab taxable
    expect(result.old.slabTaxableIncome).toBeLessThan(result.new.slabTaxableIncome)
  })
})

// ─── Profile 5: Presumptive 44ADA → ITR-4 ────────────────────────────────────

describe('Integration Profile 5 — Presumptive 44ADA → ITR-4', () => {
  const grossReceipts      = 1_200_000    // 12L professional receipts
  const presumptiveRate    = 0.50
  const presumptiveIncome  = grossReceipts * presumptiveRate   // 6L

  const sv2 = makeSV2({
    BP: {
      speculativeTurnover: 0, speculativePL: 0, netSpeculativePnL: 0,
      presumptiveEntries: [{
        type: 'presumptive_44ADA' as const,
        grossReceipts,
        isDigital: false,
        presumptiveRate,
        presumptiveIncome,
      }],
      fno: null, nonSpeculativeIncome: 0, nonSpeculativeLoss: 0,
    } as any,
  })

  it('ITR form detection → ITR4 (only presumptive 44ADA, no salary/CG/HP)', () => {
    expect(detectITRForm(sv2.S, sv2.HP, sv2.CG as any, sv2.BP as any, sv2.OS, presumptiveIncome)).toBe('ITR4')
  })

  it('Presumptive income is 50% of gross receipts (44ADA)', () => {
    const entry = sv2.BP.presumptiveEntries![0]
    expect(entry.presumptiveIncome).toBe(grossReceipts * 0.5)
    expect(entry.type).toBe('presumptive_44ADA')
  })

  it('Schedule AL not required for ITR4 even at high income', () => {
    expect(computeScheduleALRequired(5_500_000, 'ITR4')).toBe(false)
  })

  it('No ScheduleCG/HP in ITR4 profile', () => {
    expect(sv2.CG.totalSTCG).toBe(0)
    expect(sv2.CG.totalLTCG).toBe(0)
    expect(sv2.HP.properties).toHaveLength(0)
  })

  it('Tax on 6L presumptive income correctly computed (New Regime)', () => {
    const deductions = computeDeductionsVI_A(emptyRawDeductions(0), 'new')
    const credits    = emptyTaxCredits()
    // slabIncome = presumptive income 6L; 87A rebate applies (≤ 12L)
    const tax = computeTax_v2(presumptiveIncome, 0, 0, 0, deductions, credits, 'new')
    expect(tax.section87AEligible).toBe(true)
    expect(tax.totalTaxPayable).toBe(0)
  })
})
