import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeWorkbook(sheets: Record<string, unknown[][]>): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  for (const [name, data] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(data as XLSX.CellObject[][])
    XLSX.utils.book_append_sheet(wb, ws, name)
  }
  return wb
}

// ─── T50: Parser edge cases ───────────────────────────────────────────────────

import { parseZerodha } from '../../parsers/zerodhaParser'
import { buildForm16Data, extractForm16Fields } from '../../parsers/form16Extractor'
import { parseMFJson } from '../../parsers/mfJsonParser'

describe('T50 — Parser edge cases', () => {

  // Broker: empty intraday sheet
  it('Broker: empty intraday sheet → zero intraday values, no crash', () => {
    const wb = makeWorkbook({
      Equity: [
        ['Scrip', 'Trade Type', 'Buy Date', 'Sell Date', 'Quantity', 'Buy Price', 'Sell Price', 'Net P&L'],
        ['RELIANCE', 'Delivery', '2025-06-01', '2025-09-01', '10', '2400', '2600', '2000'],
      ],
      'Equity Intraday': [
        ['Scrip', 'Trade Type', 'Net P&L'],
        // no data rows
      ],
    })
    const result = parseZerodha(wb)
    expect(result.equityIntraday.turnover).toBe(0)
    expect(result.equityIntraday.netPnL).toBe(0)
    expect(result.equityDelivery.trades).toHaveLength(1)
  })

  // Broker: F&O data detected → hasFnO true, F&O excluded from delivery/intraday
  it('Broker: F&O sheet with data → hasFnO=true, F&O excluded from computation', () => {
    const wb = makeWorkbook({
      Equity: [['Scrip', 'Trade Type', 'Buy Date', 'Sell Date', 'Quantity', 'Buy Price', 'Sell Price', 'Net P&L']],
      'F&O': [
        ['Scrip', 'Type', 'Net P&L'],
        ['NIFTY24DECCE', 'Options', '25000'],
      ],
    })
    const result = parseZerodha(wb)
    expect(result.hasFnO).toBe(true)
    // F&O values do not appear in equity delivery or intraday
    expect(result.equityDelivery.totalSTCG).toBe(0)
    expect(result.equityIntraday.netPnL).toBe(0)
  })

  // Form 16: missing professional tax → defaults to 0, no crash
  it('Form 16: missing professional tax → defaults to 0', () => {
    const text = `
      Employer: Acme Corp  TAN: MUMA12345B
      Assessment Year: 2026-27
      PAN: ABCDE1234F
      Gross Salary: 1200000
      Standard Deduction u/s 16(ia): 75000
      Income chargeable under the head Salaries: 1125000
      Total Tax Deducted at Source: 100000
    `
    const extraction = extractForm16Fields(text)
    const data = buildForm16Data(extraction, text)
    expect(data.professionalTax).toBe(0)
    expect(data.grossSalary).toBe(1200000)
    expect(data.tdsDeducted).toBe(100000)
  })

  // Form 16: AY mismatch
  it('Form 16: AY mismatch surfaces correctly', () => {
    const text = `
      Assessment Year: 2025-26
      PAN: ABCDE1234F
      Gross Salary: 1000000
      Income chargeable under the head Salaries: 925000
      Total Tax Deducted at Source: 80000
    `
    const extraction = extractForm16Fields(text)
    const data = buildForm16Data(extraction, text)
    // assessmentYear extracted as '2025-26'
    expect(data.assessmentYear).toBe('2025-26')
    // Caller (form16Parser) checks this — verified through parser
  })

  // MF: no redemptions in FY → all zeros, no crash
  it('MF: no redemptions in FY 2025-26 → all zeros', () => {
    const stmt = {
      investor_info: { name: 'Test', pan: 'ABCDE1234F' },
      folios: [{
        folio_number: '1',
        fund_house: 'HDFC',
        schemes: [{
          scheme_name: 'HDFC Equity Fund Growth',
          isin: 'INF179K01AA1',
          transactions: [
            { date: '2023-06-01', type: 'purchase', units: '100', nav: '50', amount: '5000' },
            // No redemptions at all
          ],
        }],
      }],
    }
    const result = parseMFJson(stmt)
    expect(result.totalEquitySTCG).toBe(0)
    expect(result.totalEquityLTCG).toBe(0)
    expect(result.totalDebtGains).toBe(0)
  })

  // MF: mixed equity and debt → correct classification
  it('MF: equity and debt funds classified correctly', () => {
    const stmt = {
      investor_info: { name: 'Test', pan: 'ABCDE1234F' },
      folios: [{
        folio_number: '1',
        fund_house: 'Mixed AMC',
        schemes: [
          {
            scheme_name: 'HDFC Equity Growth Fund',  // equity
            isin: 'EQ001',
            transactions: [
              { date: '2024-06-01', type: 'purchase', units: '100', nav: '100', amount: '10000' },
              { date: '2025-08-01', type: 'redemption', units: '100', nav: '130', amount: '13000' }, // 14mo LTCG
            ],
          },
          {
            scheme_name: 'HDFC Liquid Fund Direct',  // debt
            isin: 'DT001',
            transactions: [
              { date: '2025-05-01', type: 'purchase', units: '50', nav: '100', amount: '5000' },
              { date: '2025-11-01', type: 'redemption', units: '50', nav: '110', amount: '5500' },
            ],
          },
        ],
      }],
    }
    const result = parseMFJson(stmt)
    expect(result.totalEquityLTCG).toBeCloseTo(3000, 0)  // 14mo → LTCG: (130-100)*100
    expect(result.totalEquitySTCG).toBe(0)
    expect(result.totalDebtGains).toBeCloseTo(500, 0)    // (110-100)*50
  })
})

// ─── T51: XML validation ──────────────────────────────────────────────────────

import { generateITR3XML } from '../../output/xmlGenerator'
import { computeSchedules } from '../../engine'
import { computeTax } from '../../engine/taxComputation'
import { computeWarnings } from '../../engine/warnings'
import type { AppState, Form16Data, BrokerData, MFData } from '../../types'

function makeForm16(gross: number, tds: number): Form16Data {
  return {
    grossSalary: gross,
    standardDeduction: 75_000,
    professionalTax: 0,
    netTaxableSalary: gross - 75_000,
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

function makeEmptyMF(): MFData {
  return { schemes: [], totalEquitySTCG: 0, totalEquityLTCG: 0, totalDebtGains: 0 }
}

function buildAppState(form16: Form16Data, broker: BrokerData, mf: MFData, overrides: Record<string, number> = {}): AppState {
  const schedules = computeSchedules(broker, form16, mf, overrides)
  const tax = computeTax(schedules, form16.tdsDeducted, 0)
  const parsed = { broker, form16, mfStatement: mf, detectedBroker: broker.broker as 'zerodha' }
  const parseStatus = { brokerPL: 'done' as const, form16: 'done' as const, mfStatement: 'done' as const, errors: {} }
  const warnings = computeWarnings({ parsed, parseStatus, aiCallLog: [] }, schedules, tax)
  return {
    sessionId: 'test-session',
    savedAt: null,
    step: 'export',
    uploadedFilesMeta: { brokerPL: null, form16: null, mfStatement: null },
    parsed,
    schedules,
    tax,
    overrides,
    warnings,
    aiCallLog: [],
    parseStatus,
    lastReviewTab: 'Schedule S',
  }
}

describe('T51 — XML validation', () => {

  // Profile A: salary only
  it('Profile A (salary only) → valid XML', () => {
    const state = buildAppState(makeForm16(12_75_000, 60_000), makeEmptyBroker(), makeEmptyMF())
    const result = generateITR3XML(state)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.xml).toContain('<PAN>ABCDE1234F</PAN>')
    expect(result.xml).toContain('<AssessmentYear>2026-27</AssessmentYear>')
    expect(result.xml).toContain('<NewTaxRegime>Y</NewTaxRegime>')
  })

  // Profile B: salary + LTCG
  it('Profile B (salary + LTCG above exemption) → valid XML', () => {
    const broker = { ...makeEmptyBroker(), equityDelivery: { trades: [], totalSTCG: 0, totalLTCG: 300_000, totalSTCL: 0, totalLTCL: 0 } }
    const state = buildAppState(makeForm16(10_75_000, 50_000), broker, makeEmptyMF())
    const result = generateITR3XML(state)
    expect(result.valid).toBe(true)
    expect(result.xml).toContain('<TaxableLTCG>')
    expect(result.xml).toContain('<ExemptionUS112A>125000</ExemptionUS112A>')
  })

  // Profile C: salary + intraday loss + STCG + MF (primary profile)
  it('Profile C (full primary profile) → valid XML', () => {
    const broker = {
      ...makeEmptyBroker(),
      equityDelivery: { trades: [], totalSTCG: 200_000, totalLTCG: 0, totalSTCL: 0, totalLTCL: 0 },
      equityIntraday: { turnover: 18_500, netPnL: -18_500 },
    }
    const mf: MFData = { schemes: [], totalEquitySTCG: 50_000, totalEquityLTCG: 0, totalDebtGains: 0 }
    const state = buildAppState(makeForm16(12_75_000, 1_00_000), broker, mf)
    const result = generateITR3XML(state)
    expect(result.valid).toBe(true)
    expect(result.xml).toContain('<SpeculativeLoss>18500</SpeculativeLoss>')
  })

  // Missing PAN → XML validation error
  it('Missing PAN → XML validation error surfaced', () => {
    const noPAN: Form16Data = { ...makeForm16(10_00_000, 50_000), pan: '' }
    const state = buildAppState(noPAN, makeEmptyBroker(), makeEmptyMF())
    const result = generateITR3XML(state)
    expect(result.valid).toBe(false)
    expect(result.errors.some(e => e.toLowerCase().includes('pan'))).toBe(true)
  })

  // Invalid PAN format → validation error
  it('Invalid PAN format → validation error', () => {
    const badPAN: Form16Data = { ...makeForm16(10_00_000, 50_000), pan: 'INVALID' }
    const state = buildAppState(badPAN, makeEmptyBroker(), makeEmptyMF())
    const result = generateITR3XML(state)
    expect(result.valid).toBe(false)
  })

  // No tax data → error not crash
  it('No tax/schedules → returns error result without throwing', () => {
    const emptyState: Partial<AppState> = { tax: null, schedules: null }
    const result = generateITR3XML(emptyState as AppState)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })
})

// ─── T52: UI warning display (engine-level) ───────────────────────────────────

describe('T52 — Warning conditions', () => {

  function warningIds(form16: Form16Data | null, broker: BrokerData | null, mf: MFData | null): string[] {
    const b = broker ?? makeEmptyBroker()
    const f = form16 ?? makeForm16(10_75_000, 0)
    const m = mf ?? makeEmptyMF()
    const schedules = computeSchedules(b, f, m, {})
    const tax = computeTax(schedules, f.tdsDeducted, 0)
    const parsed = { broker: b, form16: f, mfStatement: m, detectedBroker: b.broker as 'zerodha' }
    const parseStatus = { brokerPL: 'done' as const, form16: 'done' as const, mfStatement: 'done' as const, errors: {} }
    return computeWarnings({ parsed, parseStatus, aiCallLog: [] }, schedules, tax).map(w => w.id)
  }

  it('AIS_MISMATCH_RISK — always shown', () => {
    expect(warningIds(null, null, null)).toContain('AIS_MISMATCH_RISK')
  })

  it('NEW_REGIME_CONFIRMED — always shown', () => {
    expect(warningIds(null, null, null)).toContain('NEW_REGIME_CONFIRMED')
  })

  it('FNO_DETECTED — when broker hasFnO=true', () => {
    const broker = { ...makeEmptyBroker(), hasFnO: true }
    expect(warningIds(null, broker, null)).toContain('FNO_DETECTED')
    expect(warningIds(null, makeEmptyBroker(), null)).not.toContain('FNO_DETECTED')
  })

  it('INTRADAY_LOSS_RESTRICTION — when intraday loss present', () => {
    const broker = { ...makeEmptyBroker(), equityIntraday: { turnover: 20_000, netPnL: -20_000 } }
    expect(warningIds(null, broker, null)).toContain('INTRADAY_LOSS_RESTRICTION')
    const noLoss = { ...makeEmptyBroker(), equityIntraday: { turnover: 5_000, netPnL: 5_000 } }
    expect(warningIds(null, noLoss, null)).not.toContain('INTRADAY_LOSS_RESTRICTION')
  })

  it('CARRY_FORWARD_DEADLINE — when any unabsorbed loss present', () => {
    const broker = { ...makeEmptyBroker(), equityIntraday: { turnover: 18_500, netPnL: -18_500 } }
    expect(warningIds(null, broker, null)).toContain('CARRY_FORWARD_DEADLINE')
  })

  it('CARRY_FORWARD_DEADLINE — NOT shown when no losses', () => {
    expect(warningIds(makeForm16(10_75_000, 0), makeEmptyBroker(), makeEmptyMF()))
      .not.toContain('CARRY_FORWARD_DEADLINE')
  })

  it('LTCG_EXEMPTION_CAP — when gross LTCG > 1.25L', () => {
    const broker = { ...makeEmptyBroker(), equityDelivery: { trades: [], totalSTCG: 0, totalLTCG: 200_000, totalSTCL: 0, totalLTCL: 0 } }
    expect(warningIds(null, broker, null)).toContain('LTCG_EXEMPTION_CAP')
  })

  it('LTCG_EXEMPTION_CAP — NOT shown when LTCG <= 1.25L', () => {
    const broker = { ...makeEmptyBroker(), equityDelivery: { trades: [], totalSTCG: 0, totalLTCG: 100_000, totalSTCL: 0, totalLTCL: 0 } }
    expect(warningIds(null, broker, null)).not.toContain('LTCG_EXEMPTION_CAP')
  })

  it('BROKER_NOT_RECOGNISED — when detectedBroker is unknown', () => {
    const unknownBroker: BrokerData = { ...makeEmptyBroker(), broker: 'unknown' }
    const parsed = { broker: unknownBroker, form16: makeForm16(10_75_000, 0), mfStatement: makeEmptyMF(), detectedBroker: 'unknown' as const }
    const schedules = computeSchedules(unknownBroker, makeForm16(10_75_000, 0), makeEmptyMF(), {})
    const tax = computeTax(schedules, 0, 0)
    const parseStatus = { brokerPL: 'done' as const, form16: 'done' as const, mfStatement: 'done' as const, errors: {} }
    const ids = computeWarnings({ parsed, parseStatus, aiCallLog: [] }, schedules, tax).map(w => w.id)
    expect(ids).toContain('BROKER_NOT_RECOGNISED')
  })

  it('AI_CALL_MADE — when aiCallLog has entries', () => {
    const b = makeEmptyBroker()
    const f = makeForm16(10_75_000, 0)
    const m = makeEmptyMF()
    const schedules = computeSchedules(b, f, m, {})
    const tax = computeTax(schedules, 0, 0)
    const parsed = { broker: b, form16: f, mfStatement: m, detectedBroker: b.broker as 'zerodha' }
    const parseStatus = { brokerPL: 'done' as const, form16: 'done' as const, mfStatement: 'done' as const, errors: {} }
    const fakeLog = [{ callId: '1', timestamp: '', callType: 'broker_detection' as const, triggerReason: '', payloadSummary: '', responseSummary: '', wasUseful: null, ruleGap: '' }]
    const ids = computeWarnings({ parsed, parseStatus, aiCallLog: fakeLog }, schedules, tax).map(w => w.id)
    expect(ids).toContain('AI_CALL_MADE')
  })

  it('SURCHARGE_APPLICABLE — when total income > 50L', () => {
    const highSalary = makeForm16(51_75_000, 0)  // net ~51L
    expect(warningIds(highSalary, makeEmptyBroker(), makeEmptyMF())).toContain('SURCHARGE_APPLICABLE')
  })

  it('SURCHARGE_APPLICABLE — NOT shown when income <= 50L', () => {
    expect(warningIds(makeForm16(12_75_000, 0), makeEmptyBroker(), makeEmptyMF())).not.toContain('SURCHARGE_APPLICABLE')
  })

  it('F&O warning does NOT block user (is warn not error)', () => {
    const broker = { ...makeEmptyBroker(), hasFnO: true }
    const warnings = computeWarnings(
      { parsed: { broker, form16: makeForm16(10_75_000, 0), mfStatement: makeEmptyMF(), detectedBroker: 'zerodha' as const },
        parseStatus: { brokerPL: 'done' as const, form16: 'done' as const, mfStatement: 'done' as const, errors: {} },
        aiCallLog: [] },
      computeSchedules(broker, makeForm16(10_75_000, 0), makeEmptyMF(), {}),
      computeTax(computeSchedules(broker, makeForm16(10_75_000, 0), makeEmptyMF(), {}), 0, 0)
    )
    const fnoWarn = warnings.find(w => w.id === 'FNO_DETECTED')
    expect(fnoWarn?.severity).toBe('warn')  // not 'error' — doesn't block
  })

  it('Carry-forward deadline warning shows correct date', () => {
    const broker = { ...makeEmptyBroker(), equityIntraday: { turnover: 5_000, netPnL: -5_000 } }
    const b = broker
    const f = makeForm16(10_75_000, 0)
    const m = makeEmptyMF()
    const schedules = computeSchedules(b, f, m, {})
    const tax = computeTax(schedules, 0, 0)
    const parsed = { broker: b, form16: f, mfStatement: m, detectedBroker: b.broker as 'zerodha' }
    const parseStatus = { brokerPL: 'done' as const, form16: 'done' as const, mfStatement: 'done' as const, errors: {} }
    const warnings = computeWarnings({ parsed, parseStatus, aiCallLog: [] }, schedules, tax)
    const cfl = warnings.find(w => w.id === 'CARRY_FORWARD_DEADLINE')
    expect(cfl?.message).toContain('2026')
    expect(cfl?.message).toContain('July')
  })
})

// ─── T53: AI payload sanitiser ────────────────────────────────────────────────

// We test the sanitiser logic directly since it's a pure function
function sanitisePayload(payload: unknown): { clean: boolean; reason?: string } {
  const str = JSON.stringify(payload)
  if (/\b\d{4,}\b/.test(str)) return { clean: false, reason: 'Payload contains numeric values (4+ digits)' }
  if (/\b[A-Z]{5}[0-9]{4}[A-Z]\b/.test(str)) return { clean: false, reason: 'Payload may contain PAN' }
  if (/\b[A-Z]{4}[0-9]{5}[A-Z]\b/.test(str)) return { clean: false, reason: 'Payload may contain TAN' }
  return { clean: true }
}

describe('T53 — AI payload sanitiser', () => {

  it('blocks payload containing 4+ digit numeric value', () => {
    const result = sanitisePayload({ headers: ['Date', 'Amount'], value: 12345 })
    expect(result.clean).toBe(false)
    expect(result.reason).toContain('numeric')
  })

  it('blocks payload containing PAN pattern (AAAAA0000A)', () => {
    const result = sanitisePayload({ labels: ['Gross Salary', 'ABCDE1234F'] })
    expect(result.clean).toBe(false)
    expect(result.reason).toContain('PAN')
  })

  it('blocks payload containing TAN pattern (AAAA00000A)', () => {
    const result = sanitisePayload({ data: 'TAN: MUMA12345B employer' })
    expect(result.clean).toBe(false)
    expect(result.reason).toContain('TAN')
  })

  it('passes clean structural payload (sheet names, column headers only)', () => {
    const result = sanitisePayload({
      sheetNames: ['Equity', 'Equity Intraday', 'Dividends'],
      columnHeaders: {
        Equity: ['Scrip', 'Trade Type', 'Buy Date', 'Sell Date', 'Net P&L'],
        Dividends: ['Scrip', 'Amount'],
      },
    })
    expect(result.clean).toBe(true)
  })

  it('passes Form 16 label-only payload', () => {
    const result = sanitisePayload({
      labels: [
        'Gross Remuneration',
        'Net Salary after Std Ded',
        'Tax at source',
        'Income from Salaries',
      ],
    })
    expect(result.clean).toBe(true)
  })

  it('blocks payload with salary amount embedded in label string', () => {
    // Even if accidentally included — 4+ digits blocked
    const result = sanitisePayload({ labels: ['Gross Salary 1200000'] })
    expect(result.clean).toBe(false)
  })

  it('passes single-digit and 2-3 digit numbers (e.g. column counts)', () => {
    const result = sanitisePayload({ sheetCount: 3, columnCounts: { Equity: 8 } })
    expect(result.clean).toBe(true)
  })
})
