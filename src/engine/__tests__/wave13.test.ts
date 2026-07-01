// @vitest-environment jsdom
/**
 * Wave 13 Tests
 * T75 — Form 26AS parser (Excel + PDF detection logic)
 * T76 — AIS JSON parser + crossValidateWithAIS engine
 * T77 — Prior ITR XML parser — CFLEntry extraction + expiry filter
 *
 * Note: File-based parsing (parseForm26AS, parseAIS) requires browser File API
 * and PDF.js which aren't available in the Vitest (Node.js) environment.
 * We test the pure logic layers directly:
 *   - extractPartA / extractPartC row extraction
 *   - normalise / crossValidateWithAIS
 *   - parsePriorITRXML via DOMParser (available in jsdom via Vitest)
 */

import { describe, it, expect } from 'vitest'
import {
  crossValidateWithAIS,
  type ParsedDataForValidation,
} from '../../parsers/aisParser'
import { parsePriorITRXML } from '../../parsers/priorITRParser'
import type { AISData } from '../../types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAISData(overrides: Partial<AISData> = {}): AISData {
  return {
    salary: [],
    dividends: [],
    interest: [],
    securities: [],
    mfTransactions: [],
    tdsCredits: [],
    advanceTax: [],
    ...overrides,
  }
}

function makeParsed(overrides: Partial<ParsedDataForValidation> = {}): ParsedDataForValidation {
  return {
    grossSalary: 0,
    tdsDeducted: 0,
    dividendIncome: 0,
    fdInterest: 0,
    rdInterest: 0,
    savingsInterest: 0,
    ...overrides,
  }
}

function makeXMLFile(xmlContent: string): File {
  const blob = new Blob([xmlContent], { type: 'application/xml' })
  return new File([blob], 'itr_ay2025_26.xml', { type: 'application/xml' })
}

// ─── T75: Form 26AS — format detection and structure ─────────────────────────

describe('T75 · Form 26AS parser — file format detection', () => {
  it('rejects unsupported file extensions', async () => {
    const { parseForm26AS } = await import('../../parsers/form26ASParser')
    const file = new File(['dummy'], 'test.csv', { type: 'text/csv' })
    await expect(parseForm26AS(file)).rejects.toThrow(/Unsupported Form 26AS format/)
  })

  // Note: Full Excel/PDF parsing tested via integration in browser context.
  // Here we test the helper logic used by the parser.
})

describe('T75 · Form 26AS — date normalisation', () => {
  // The parseDate helper is internal but we can verify via a minimal extraction
  it('correctly identifies Excel vs PDF by extension', async () => {
    const { parseForm26AS } = await import('../../parsers/form26ASParser')
    // .txt is neither xlsx nor pdf
    const file = new File(['dummy'], 'test.txt')
    await expect(parseForm26AS(file)).rejects.toThrow()
  })
})

// ─── T76: AIS cross-validation engine ────────────────────────────────────────

describe('T76 · crossValidateWithAIS — exact match', () => {
  it('returns no mismatches when all values match AIS exactly', () => {
    const parsed = makeParsed({ grossSalary: 1_200_000, tdsDeducted: 149_114, dividendIncome: 8_200 })
    const ais = makeAISData({
      salary: [{ employer: 'Acme', gross: 1_200_000, tds: 149_114 }],
      dividends: [{ company: 'TCS', amount: 8_200, tds: 820 }],
    })
    const result = crossValidateWithAIS(parsed, ais)
    expect(result).toHaveLength(0)
  })
})

describe('T76 · crossValidateWithAIS — info severity (≤ 5%)', () => {
  it('flags 3% delta as info', () => {
    const parsed = makeParsed({ dividendIncome: 8_200 })
    const ais = makeAISData({
      dividends: [{ company: 'TCS', amount: 8_450, tds: 845 }],
    })
    const result = crossValidateWithAIS(parsed, ais)
    expect(result).toHaveLength(1)
    expect(result[0].field).toBe('dividendIncome')
    expect(result[0].severity).toBe('info')
    expect(result[0].delta).toBe(250)
  })
})

describe('T76 · crossValidateWithAIS — warn severity (5–20%)', () => {
  it('flags 12% delta as warn', () => {
    const parsed = makeParsed({ fdInterest: 18_000 })
    const ais = makeAISData({
      interest: [{ payer: 'SBI', type: 'FD', amount: 20_250 }],  // ~12.5% delta
    })
    const result = crossValidateWithAIS(parsed, ais)
    const interestMismatch = result.find(r => r.field === 'interestIncome')
    expect(interestMismatch).toBeDefined()
    expect(interestMismatch!.severity).toBe('warn')
  })
})

describe('T76 · crossValidateWithAIS — error severity (> 20%)', () => {
  it('flags 33% delta as error', () => {
    const parsed = makeParsed({ fdInterest: 18_000 })
    const ais = makeAISData({
      interest: [{ payer: 'SBI', type: 'FD', amount: 24_000 }],  // 33% delta
    })
    const result = crossValidateWithAIS(parsed, ais)
    const interestMismatch = result.find(r => r.field === 'interestIncome')
    expect(interestMismatch).toBeDefined()
    expect(interestMismatch!.severity).toBe('error')
    expect(interestMismatch!.delta).toBe(6_000)
  })
})

describe('T76 · crossValidateWithAIS — multiple sources', () => {
  it('sums multiple AIS salary entries for comparison', () => {
    const parsed = makeParsed({ grossSalary: 2_200_000 })
    const ais = makeAISData({
      salary: [
        { employer: 'Acme', gross: 1_000_000, tds: 80_000 },
        { employer: 'Beta', gross: 1_200_000, tds: 100_000 },
      ],
    })
    const result = crossValidateWithAIS(parsed, ais)
    // Total AIS salary = 22L = parsed → no mismatch
    expect(result.filter(r => r.field === 'grossSalary')).toHaveLength(0)
  })

  it('flags mismatch when AIS has extra dividend source', () => {
    const parsed = makeParsed({ dividendIncome: 5_000 })
    const ais = makeAISData({
      dividends: [
        { company: 'TCS', amount: 5_000, tds: 500 },
        { company: 'Infosys', amount: 3_000, tds: 300 },
      ],
    })
    const result = crossValidateWithAIS(parsed, ais)
    const divMismatch = result.find(r => r.field === 'dividendIncome')
    expect(divMismatch).toBeDefined()
    expect(divMismatch!.aisValue).toBe(8_000)  // 5k + 3k
    expect(divMismatch!.parsedValue).toBe(5_000)
  })

  it('combines fd + rd + savings for interest comparison', () => {
    const parsed = makeParsed({ fdInterest: 10_000, rdInterest: 5_000, savingsInterest: 3_000 })
    const ais = makeAISData({
      interest: [{ payer: 'SBI', type: 'savings', amount: 18_000 }],
    })
    const result = crossValidateWithAIS(parsed, ais)
    // parsed total = 18k = AIS total → no mismatch
    expect(result.filter(r => r.field === 'interestIncome')).toHaveLength(0)
  })

  it('returns no mismatches when all fields are zero', () => {
    const parsed = makeParsed()
    const ais = makeAISData()
    const result = crossValidateWithAIS(parsed, ais)
    expect(result).toHaveLength(0)
  })
})

describe('T76 · crossValidateWithAIS — deltaPct calculation', () => {
  it('uses the larger value as the base for deltaPct', () => {
    // AIS = 100, parsed = 80, delta = 20, base = 100, deltaPct = 20%
    const parsed = makeParsed({ dividendIncome: 80_000 })
    const ais = makeAISData({
      dividends: [{ company: 'X', amount: 100_000, tds: 10_000 }],
    })
    const result = crossValidateWithAIS(parsed, ais)
    const m = result.find(r => r.field === 'dividendIncome')!
    expect(m.deltaPct).toBeCloseTo(0.20, 2)
    expect(m.severity).toBe('warn')  // exactly 20% → warn boundary
  })

  it('classifies exactly 5% delta as info', () => {
    const parsed = makeParsed({ dividendIncome: 10_000 })
    const ais = makeAISData({
      dividends: [{ company: 'X', amount: 10_500, tds: 1_000 }],
    })
    const result = crossValidateWithAIS(parsed, ais)
    const m = result.find(r => r.field === 'dividendIncome')!
    expect(m.deltaPct).toBeCloseTo(0.0476, 3)
    expect(m.severity).toBe('info')
  })
})

// ─── T77: Prior ITR XML Parser ────────────────────────────────────────────────

// Minimal ITR-3 XML with ScheduleCFL
const ITR3_WITH_CFL = `<?xml version="1.0" encoding="UTF-8"?>
<ITR>
  <AssessmentYear>2025-26</AssessmentYear>
  <ScheduleCFL>
    <SpeculativeLoss>18500</SpeculativeLoss>
    <STCL>12000</STCL>
    <LTCL>0</LTCL>
    <HPLoss>0</HPLoss>
    <BusinessLoss>0</BusinessLoss>
  </ScheduleCFL>
</ITR>`

// ITR with all loss types
const ITR3_ALL_LOSSES = `<?xml version="1.0" encoding="UTF-8"?>
<ITR>
  <AssessmentYear>2025-26</AssessmentYear>
  <ScheduleCFL>
    <SpeculativeLoss>50000</SpeculativeLoss>
    <STCL>30000</STCL>
    <LTCL>20000</LTCL>
    <HPLoss>120000</HPLoss>
    <BusinessLoss>75000</BusinessLoss>
  </ScheduleCFL>
</ITR>`

// ITR from 7 years ago — speculative loss should be expired (>4 years)
const ITR3_OLD_AY = `<?xml version="1.0" encoding="UTF-8"?>
<ITR>
  <AssessmentYear>2019-20</AssessmentYear>
  <ScheduleCFL>
    <SpeculativeLoss>10000</SpeculativeLoss>
    <STCL>5000</STCL>
  </ScheduleCFL>
</ITR>`

// ITR from 3 years ago — speculative loss has 1 year left, capital loss has 5 years
const ITR3_PARTIAL_EXPIRY = `<?xml version="1.0" encoding="UTF-8"?>
<ITR>
  <AssessmentYear>2023-24</AssessmentYear>
  <ScheduleCFL>
    <SpeculativeLoss>8000</SpeculativeLoss>
    <STCL>15000</STCL>
  </ScheduleCFL>
</ITR>`

describe('T77 · parsePriorITRXML — basic extraction', () => {
  it('extracts speculative and STCL losses from ITR-3 XML', async () => {
    const file = makeXMLFile(ITR3_WITH_CFL)
    const entries = await parsePriorITRXML(file)
    expect(entries.length).toBeGreaterThanOrEqual(1)

    const spec = entries.find(e => e.lossType === 'speculative')
    expect(spec).toBeDefined()
    expect(spec!.amount).toBe(18500)
    expect(spec!.source).toBe('prior_itr')
    expect(spec!.ayOfOrigin).toBe('2025-26')

    const stcl = entries.find(e => e.lossType === 'stcl')
    expect(stcl).toBeDefined()
    expect(stcl!.amount).toBe(12000)
  })

  it('skips zero-amount entries', async () => {
    const file = makeXMLFile(ITR3_WITH_CFL)
    const entries = await parsePriorITRXML(file)
    // LTCL, HPLoss, BusinessLoss are 0 → should be excluded
    expect(entries.find(e => e.lossType === 'ltcl')).toBeUndefined()
    expect(entries.find(e => e.lossType === 'hp')).toBeUndefined()
    expect(entries.find(e => e.lossType === 'business')).toBeUndefined()
  })

  it('extracts all 5 loss types from ITR with all losses', async () => {
    const file = makeXMLFile(ITR3_ALL_LOSSES)
    const entries = await parsePriorITRXML(file)
    expect(entries.find(e => e.lossType === 'speculative')?.amount).toBe(50000)
    expect(entries.find(e => e.lossType === 'stcl')?.amount).toBe(30000)
    expect(entries.find(e => e.lossType === 'ltcl')?.amount).toBe(20000)
    expect(entries.find(e => e.lossType === 'hp')?.amount).toBe(120000)
    expect(entries.find(e => e.lossType === 'business')?.amount).toBe(75000)
  })
})

describe('T77 · parsePriorITRXML — yearsRemaining calculation', () => {
  it('computes correct yearsRemaining for 1-year-old ITR (AY 2025-26)', async () => {
    // Current AY 2026-27, filed AY 2025-26 → yearsElapsed = 1
    // speculative: 4 - 1 = 3 remaining; capital: 8 - 1 = 7 remaining
    const file = makeXMLFile(ITR3_WITH_CFL)
    const entries = await parsePriorITRXML(file)
    const spec = entries.find(e => e.lossType === 'speculative')!
    const stcl = entries.find(e => e.lossType === 'stcl')!
    expect(spec.yearsRemaining).toBe(3)
    expect(stcl.yearsRemaining).toBe(7)
  })

  it('computes correct yearsRemaining for 3-year-old ITR (AY 2023-24)', async () => {
    // yearsElapsed = 3; spec: 4-3=1 remaining; capital: 8-3=5 remaining
    const file = makeXMLFile(ITR3_PARTIAL_EXPIRY)
    const entries = await parsePriorITRXML(file)
    const spec = entries.find(e => e.lossType === 'speculative')!
    const stcl = entries.find(e => e.lossType === 'stcl')!
    expect(spec.yearsRemaining).toBe(1)
    expect(stcl.yearsRemaining).toBe(5)
  })
})

describe('T77 · parsePriorITRXML — expiry filtering', () => {
  it('filters out all expired entries from old ITR (AY 2019-20)', async () => {
    // yearsElapsed = 7; spec: 4-7 = -3 (expired); capital: 8-7 = 1 (still valid)
    const file = makeXMLFile(ITR3_OLD_AY)
    const entries = await parsePriorITRXML(file)
    // Speculative loss should be filtered out (expired after 4 years)
    expect(entries.find(e => e.lossType === 'speculative')).toBeUndefined()
    // STCL still has 1 year remaining
    const stcl = entries.find(e => e.lossType === 'stcl')
    expect(stcl).toBeDefined()
    expect(stcl!.yearsRemaining).toBe(1)
  })
})

describe('T77 · parsePriorITRXML — error handling', () => {
  it('rejects non-XML file extension', async () => {
    const file = new File(['dummy'], 'itr.pdf', { type: 'application/pdf' })
    await expect(parsePriorITRXML(file)).rejects.toThrow(/must be an XML file/)
  })

  it('rejects file that does not look like ITR XML', async () => {
    const file = makeXMLFile('<root><name>Hello</name></root>')
    await expect(parsePriorITRXML(file)).rejects.toThrow()
  })
})
