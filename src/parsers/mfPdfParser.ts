import type { MFData, MFScheme, MFTransaction } from '../types'
import { extractPDFText } from './pdfExtractor'
import { classifyFundOrientation } from './fundClassification'
import { parseMFJson } from './mfJsonParser'

// ─── Text-based MF statement parser ─────────────────────────────────────────

/**
 * Attempt to parse a text-extracted MF statement.
 * CAMS and KFintech PDF text follows predictable patterns:
 *
 *   Scheme Name: SBI Blue Chip Fund - Regular Plan - Growth
 *   ISIN: INF200K01RB2
 *   Date       | Type    | Units    | NAV     | Amount
 *   15-Apr-24  | Purchase| 100.000  | 72.34   | 7234.00
 *   ...
 */
export async function parseMFPdf(file: File): Promise<MFData> {
  const { fullText, isScanned } = await extractPDFText(file)

  if (isScanned) {
    throw new Error('Scanned PDF detected. Please use text-based MF statement or JSON format.')
  }

  const schemes = extractSchemesFromText(fullText)

  let totalEquitySTCG = 0
  let totalEquityLTCG = 0
  let totalDebtGains = 0

  for (const scheme of schemes) {
    if (scheme.fundOrientation === 'equity') {
      totalEquitySTCG += scheme.stcg
      totalEquityLTCG += scheme.ltcg
    } else {
      totalDebtGains += scheme.debtGains
    }
  }

  return { schemes, totalEquitySTCG, totalEquityLTCG, totalDebtGains }
}

// ─── Text pattern matching ────────────────────────────────────────────────────

const FY_START = new Date('2025-04-01')
const FY_END = new Date('2026-03-31')

function parseDateStr(s: string): Date | null {
  // DD-MMM-YYYY: 15-Apr-2024
  const m1 = s.match(/(\d{2})-([A-Za-z]{3})-(\d{4})/)
  if (m1) {
    const d = new Date(`${m1[2]} ${m1[1]}, ${m1[3]}`)
    return isNaN(d.getTime()) ? null : d
  }
  // DD/MM/YYYY
  const m2 = s.match(/(\d{2})\/(\d{2})\/(\d{4})/)
  if (m2) {
    const d = new Date(`${m2[3]}-${m2[2]}-${m2[1]}`)
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

function num(s: string): number {
  const n = parseFloat(s.replace(/,/g, ''))
  return isNaN(n) ? 0 : n
}

function isInFY(date: Date): boolean {
  return date >= FY_START && date <= FY_END
}

function normalizeTransactionType(raw: string): MFTransaction['type'] {
  const lower = raw.toLowerCase()
  if (lower.includes('redempt') || lower.includes('withdrawal')) return 'redemption'
  if (lower.includes('switch out')) return 'switch_out'
  if (lower.includes('switch in')) return 'switch_in'
  if (lower.includes('stp')) return 'stp'
  return 'purchase'
}

interface PurchaseLot {
  date: Date
  units: number
  nav: number
  remaining: number
}

function computeGainsFromTransactions(
  transactions: MFTransaction[],
  orientation: 'equity' | 'debt'
): { stcg: number; ltcg: number; debtGains: number } {
  const sorted = [...transactions].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  )

  const lots: PurchaseLot[] = []
  let stcg = 0
  let ltcg = 0
  let debtGains = 0

  for (const tx of sorted) {
    const txDate = new Date(tx.date)

    if (tx.type === 'purchase' || tx.type === 'switch_in' || tx.type === 'stp') {
      lots.push({ date: txDate, units: tx.units, nav: tx.nav, remaining: tx.units })
    } else if (tx.type === 'redemption' || tx.type === 'switch_out') {
      if (!isInFY(txDate)) continue

      let toRedeem = tx.units
      for (const lot of lots) {
        if (toRedeem <= 0 || lot.remaining <= 0) continue
        const consumed = Math.min(lot.remaining, toRedeem)
        lot.remaining -= consumed
        toRedeem -= consumed
        const gain = (tx.nav - lot.nav) * consumed
        const months = Math.floor(
          (txDate.getTime() - lot.date.getTime()) / (1000 * 60 * 60 * 24 * 30)
        )

        if (orientation === 'debt') {
          debtGains += gain
        } else if (months <= 12) {
          stcg += gain
        } else {
          ltcg += gain
        }
      }
    }
  }

  return { stcg, ltcg, debtGains }
}

/**
 * Extract scheme sections from PDF text.
 * Looks for scheme headers followed by transaction tables.
 */
function extractSchemesFromText(text: string): MFScheme[] {
  const schemes: MFScheme[] = []

  // Split by scheme boundaries — common patterns in CAMS/KFintech PDFs
  const schemePattern = /(?:Scheme\s*:\s*|Fund\s*:\s*)([^\n\r]{5,120})/gi
  const matches = [...text.matchAll(schemePattern)]

  if (matches.length === 0) {
    // Try to detect a single scheme
    const transactions = extractTransactionsFromBlock(text)
    if (transactions.length > 0) {
      const orientation = 'equity' // default
      const { stcg, ltcg, debtGains } = computeGainsFromTransactions(transactions, orientation)
      schemes.push({
        schemeName: 'Unknown Scheme (PDF)',
        isin: '',
        fundOrientation: orientation,
        transactions,
        stcg,
        ltcg,
        debtGains,
      })
    }
    return schemes
  }

  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]
    const schemeName = match[1].trim()
    const start = match.index! + match[0].length
    const end = matches[i + 1]?.index ?? text.length
    const block = text.slice(start, end)

    // Extract ISIN if present
    const isinMatch = block.match(/ISIN\s*:\s*([A-Z]{2}[A-Z0-9]{10})/i)
    const isin = isinMatch ? isinMatch[1] : ''

    const orientation = classifyFundOrientation(schemeName)
    const transactions = extractTransactionsFromBlock(block)
    const { stcg, ltcg, debtGains } = computeGainsFromTransactions(transactions, orientation)

    schemes.push({ schemeName, isin, fundOrientation: orientation, transactions, stcg, ltcg, debtGains })
  }

  return schemes
}

/**
 * Extract transaction rows from a text block.
 * Matches lines with date, type keyword, and numeric values.
 */
function extractTransactionsFromBlock(block: string): MFTransaction[] {
  const transactions: MFTransaction[] = []
  const lines = block.split('\n')

  for (const line of lines) {
    // Match: Date  TransactionType  Units  NAV  Amount
    const dateMatch = line.match(/(\d{2}[-/][A-Za-z0-9]{2,3}[-/]\d{4})/)
    if (!dateMatch) continue

    const date = parseDateStr(dateMatch[1])
    if (!date) continue

    // Look for transaction type keywords
    const typeMatch = line.match(
      /(purchase|redempt|switch\s+(?:in|out)|stp|dividend|bonus)/i
    )
    const type = normalizeTransactionType(typeMatch ? typeMatch[1] : 'purchase')

    // Extract numbers from the line
    const numbers = [...line.matchAll(/[\d,]+\.?\d*/g)]
      .map(m => num(m[0]))
      .filter(n => n > 0)

    if (numbers.length >= 3) {
      // Heuristic: units, NAV, amount are the three largest numbers
      const [units, nav, amount] = numbers.length >= 3
        ? [numbers[0], numbers[1], numbers[numbers.length - 1]]
        : [0, 0, 0]

      transactions.push({
        date: date.toISOString().split('T')[0],
        type,
        units,
        nav,
        amount,
      })
    }
  }

  return transactions
}

// Export for use in router
export { parseMFJson }
