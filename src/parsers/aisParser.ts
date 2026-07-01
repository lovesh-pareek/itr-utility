/**
 * AIS Parser + Cross-Validation Engine
 *
 * parseAIS(file) → AISData
 * crossValidateWithAIS(parsedData, aisData) → AISMismatch[]
 *
 * AIS JSON downloaded from: IT Portal → AIS → Download JSON
 * Severity: deltaPct ≤ 5% → info | 5–20% → warn | > 20% → error
 */

import type { AISData, AISMismatch, TDSEntry, ChallanEntry } from '../types'

// ─── AIS raw JSON shapes (as downloaded from portal) ─────────────────────────

interface AISSalaryEntry {
  deductorName?: string
  employerName?: string
  amount?: number
  tdsAmount?: number
}

interface AISDividendEntry {
  companyName?: string
  name?: string
  amount?: number
  tdsAmount?: number
}

interface AISInterestEntry {
  payerName?: string
  name?: string
  type?: string
  interestType?: string
  amount?: number
}

interface AISSecurityEntry {
  isin?: string
  purchaseValue?: number
  saleValue?: number
  capitalGain?: number
}

interface AISMFEntry {
  schemeName?: string
  name?: string
  redemptionValue?: number
  capitalGain?: number
}

interface AISTDSEntry {
  tanDeductor?: string
  deductorName?: string
  grossAmount?: number
  tdsAmount?: number
  section?: string
}

interface AISRawData {
  // Portal may wrap in various top-level keys
  data?: AISPayload
  aisData?: AISPayload
  annualInformationStatement?: AISPayload
  // Or data directly at root
  salary?: AISSalaryEntry[]
  dividend?: AISDividendEntry[]
  interest?: AISInterestEntry[]
  securitiesTransactions?: AISSecurityEntry[]
  mutualFundTransactions?: AISMFEntry[]
  tdsCredits?: AISTDSEntry[]
  advanceTax?: unknown[]
}

interface AISPayload {
  salary?: AISSalaryEntry[]
  dividend?: AISDividendEntry[]
  interest?: AISInterestEntry[]
  securitiesTransactions?: AISSecurityEntry[]
  mutualFundTransactions?: AISMFEntry[]
  tdsCredits?: AISTDSEntry[]
  advanceTax?: unknown[]
}

// ─── Parse AIS file ───────────────────────────────────────────────────────────

export async function parseAIS(file: File): Promise<AISData> {
  const ext = file.name.split('.').pop()?.toLowerCase()

  if (ext === 'json') {
    return parseAISJSON(file)
  } else if (ext === 'pdf') {
    return parseAISPDF(file)
  } else {
    throw new Error(`Unsupported AIS format: .${ext}. Download the JSON from IT Portal → AIS → Download.`)
  }
}

async function parseAISJSON(file: File): Promise<AISData> {
  const text = await file.text()
  let raw: AISRawData

  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('AIS file is not valid JSON. Download the JSON version from IT Portal → AIS → Download.')
  }

  // Unwrap nested payload — portal wraps in different keys across versions
  const payload: AISPayload =
    raw.data ??
    raw.aisData ??
    raw.annualInformationStatement ??
    raw  // treat root as payload if no wrapper key

  return normaliseAISPayload(payload)
}

async function parseAISPDF(file: File): Promise<AISData> {
  // PDF fallback — basic text extraction
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js'

  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise

  let text = ''
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    text += content.items.map((i: any) => i.str).join(' ') + '\n'
  }

  if (!text.toLowerCase().includes('annual information') && !text.toLowerCase().includes('ais')) {
    throw new Error('This does not appear to be an AIS document.')
  }

  // Extract salary from PDF text
  const salaryMatch = text.match(/salary[^\d]*([\d,]+)/i)
  const salaryAmount = salaryMatch ? parseNum(salaryMatch[1]) : 0

  const tdsMatch = text.match(/tds[^\d]*([\d,]+)/i)
  const tdsAmount = tdsMatch ? parseNum(tdsMatch[1]) : 0

  // Return minimal AIS data from PDF — user should use JSON for better accuracy
  return {
    salary: salaryAmount > 0 ? [{ employer: 'From AIS PDF', gross: salaryAmount, tds: tdsAmount }] : [],
    dividends: [],
    interest: [],
    securities: [],
    mfTransactions: [],
    tdsCredits: [],
    advanceTax: [],
  }
}

function normaliseAISPayload(p: AISPayload): AISData {
  const salary = (p.salary ?? []).map(e => ({
    employer: e.deductorName ?? e.employerName ?? 'Unknown',
    gross: e.amount ?? 0,
    tds: e.tdsAmount ?? 0,
  }))

  const dividends = (p.dividend ?? []).map(e => ({
    company: e.companyName ?? e.name ?? 'Unknown',
    amount: e.amount ?? 0,
    tds: e.tdsAmount ?? 0,
  }))

  const interest = (p.interest ?? []).map(e => ({
    payer: e.payerName ?? e.name ?? 'Unknown',
    type: e.interestType ?? e.type ?? 'interest',
    amount: e.amount ?? 0,
  }))

  const securities = (p.securitiesTransactions ?? []).map(e => ({
    isin: e.isin ?? '',
    buyValue: e.purchaseValue ?? 0,
    saleValue: e.saleValue ?? 0,
    gain: e.capitalGain ?? 0,
  }))

  const mfTransactions = (p.mutualFundTransactions ?? []).map(e => ({
    schemeName: e.schemeName ?? e.name ?? 'Unknown',
    redemptionValue: e.redemptionValue ?? 0,
    gain: e.capitalGain ?? 0,
  }))

  const tdsCredits: TDSEntry[] = (p.tdsCredits ?? []).map((e, i) => ({
    id: `ais-tds-${i}`,
    tanDeductor: e.tanDeductor ?? '',
    deductorName: e.deductorName ?? '',
    grossAmount: e.grossAmount ?? 0,
    tdsAmount: e.tdsAmount ?? 0,
    section: e.section ?? '194',
    source: 'ais' as const,
  }))

  const advanceTax: ChallanEntry[] = []  // not typically in AIS JSON

  return { salary, dividends, interest, securities, mfTransactions, tdsCredits, advanceTax }
}

// ─── Cross-validation engine ──────────────────────────────────────────────────

/**
 * Parsed data shape — the values we've computed from uploaded documents.
 * Only fields that can be cross-validated against AIS are included.
 */
export interface ParsedDataForValidation {
  grossSalary: number           // from Form 16(s)
  tdsDeducted: number           // from Form 16(s)
  dividendIncome: number        // from broker P&L
  fdInterest: number            // manual entry
  rdInterest: number            // manual entry
  savingsInterest: number       // manual entry
}

/**
 * Cross-validate parsed values against AIS data.
 * Returns mismatches with severity classification.
 *
 * Severity thresholds (deltaPct of the larger value):
 *   ≤ 5%  → info   (likely rounding)
 *   5–20% → warn   (possible missing source)
 *   > 20% → error  (significant mismatch — must reconcile)
 */
export function crossValidateWithAIS(
  parsed: ParsedDataForValidation,
  ais: AISData
): AISMismatch[] {
  const mismatches: AISMismatch[] = []

  // ── Salary ─────────────────────────────────────────────────────────────────
  const aisSalaryTotal = ais.salary.reduce((s, e) => s + e.gross, 0)
  if (aisSalaryTotal > 0 || parsed.grossSalary > 0) {
    const mismatch = buildMismatch(
      'grossSalary',
      'Gross Salary',
      parsed.grossSalary,
      aisSalaryTotal,
      'Salary reported by employer(s) in AIS differs from Form 16.'
    )
    if (mismatch) mismatches.push(mismatch)
  }

  // ── TDS ────────────────────────────────────────────────────────────────────
  const aisTDSTotal = ais.salary.reduce((s, e) => s + e.tds, 0)
  if (aisTDSTotal > 0 || parsed.tdsDeducted > 0) {
    const mismatch = buildMismatch(
      'tdsDeducted',
      'TDS Deducted (Salary)',
      parsed.tdsDeducted,
      aisTDSTotal,
      'TDS deducted by employer in AIS differs from Form 16 Part A.'
    )
    if (mismatch) mismatches.push(mismatch)
  }

  // ── Dividends ──────────────────────────────────────────────────────────────
  const aisDividendTotal = ais.dividends.reduce((s, e) => s + e.amount, 0)
  if (aisDividendTotal > 0 || parsed.dividendIncome > 0) {
    const mismatch = buildMismatch(
      'dividendIncome',
      'Dividend Income',
      parsed.dividendIncome,
      aisDividendTotal,
      'Dividend income in AIS differs from broker P&L. Check all demat accounts.'
    )
    if (mismatch) mismatches.push(mismatch)
  }

  // ── Interest (FD + RD + savings) ───────────────────────────────────────────
  const parsedInterestTotal = parsed.fdInterest + parsed.rdInterest + parsed.savingsInterest
  const aisInterestTotal = ais.interest.reduce((s, e) => s + e.amount, 0)
  if (aisInterestTotal > 0 || parsedInterestTotal > 0) {
    const mismatch = buildMismatch(
      'interestIncome',
      'Interest Income (FD/RD/Savings)',
      parsedInterestTotal,
      aisInterestTotal,
      'Interest income in AIS differs from your entries. Check all bank accounts and FD statements.'
    )
    if (mismatch) mismatches.push(mismatch)
  }

  return mismatches
}

/**
 * Build a single AISMismatch if values differ meaningfully.
 * Returns null if values match exactly (no mismatch to report).
 */
function buildMismatch(
  field: string,
  fieldLabel: string,
  parsedValue: number,
  aisValue: number,
  description: string
): AISMismatch | null {
  const delta = Math.abs(parsedValue - aisValue)
  const base = Math.max(parsedValue, aisValue)
  const deltaPct = base > 0 ? delta / base : 0

  // Exact match — no mismatch
  if (delta === 0) return null

  const severity: AISMismatch['severity'] =
    deltaPct <= 0.05 ? 'info' :
    deltaPct <= 0.20 ? 'warn' :
    'error'

  return { field, fieldLabel, parsedValue, aisValue, delta, deltaPct, severity, description }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseNum(raw: string): number {
  return parseFloat(raw.replace(/,/g, '').trim()) || 0
}
