import type { MFData, MFScheme, MFTransaction } from '../types'
import { classifyFundOrientation } from './fundClassification'

// ─── Raw JSON shapes from CAMS / KFintech ────────────────────────────────────

interface RawTransaction {
  date: string
  type: string
  units: number | string
  nav: number | string
  amount: number | string
  description?: string
  balance?: number | string
}

interface RawScheme {
  scheme_name?: string
  schemeName?: string
  isin?: string
  transactions: RawTransaction[]
}

interface RawFolio {
  folio_number?: string
  folioNumber?: string
  fund_house?: string
  fundHouse?: string
  schemes: RawScheme[]
}

interface RawMFStatement {
  investor_info?: { name?: string; pan?: string; email?: string }
  investorInfo?: { name?: string; pan?: string }
  folios: RawFolio[]
}

// ─── FIFO computation ─────────────────────────────────────────────────────────

interface PurchaseLot {
  date: Date
  units: number
  nav: number
  remainingUnits: number
}

const FY_START = new Date('2025-04-01')
const FY_END = new Date('2026-03-31')
const EQUITY_LTCG_THRESHOLD_MONTHS = 12

function parseDateStr(s: string): Date {
  // Handle DD-MMM-YYYY (e.g. 15-Apr-2024) and YYYY-MM-DD
  const ddMmmYyyy = s.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/)
  if (ddMmmYyyy) {
    const [, dd, mmm, yyyy] = ddMmmYyyy
    return new Date(`${mmm} ${dd}, ${yyyy}`)
  }
  return new Date(s)
}

function monthsBetween(from: Date, to: Date): number {
  return (
    (to.getFullYear() - from.getFullYear()) * 12 +
    (to.getMonth() - from.getMonth())
  )
}

function isInFY(date: Date): boolean {
  return date >= FY_START && date <= FY_END
}

function normalizeType(raw: string): MFTransaction['type'] {
  const lower = raw.toLowerCase()
  if (lower.includes('redempt') || lower.includes('redeem') || lower.includes('withdrawal')) return 'redemption'
  if (lower.includes('switch out') || lower.includes('switch-out')) return 'switch_out'
  if (lower.includes('switch in') || lower.includes('switch-in')) return 'switch_in'
  if (lower.includes('stp out')) return 'switch_out'
  if (lower.includes('stp in')) return 'switch_in'
  if (lower.includes('stp')) return 'stp'
  return 'purchase'
}

function num(val: unknown): number {
  if (val == null) return 0
  const n = parseFloat(String(val).replace(/,/g, ''))
  return isNaN(n) ? 0 : n
}

/**
 * Compute STCG / LTCG for a single scheme using FIFO matching.
 * Returns gains for current FY only.
 */
function computeSchemeCG(
  transactions: MFTransaction[],
  orientation: 'equity' | 'debt'
): { stcg: number; ltcg: number; debtGains: number } {
  // Sort transactions by date ascending
  const sorted = [...transactions].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  )

  // Build purchase lot queue (FIFO)
  const lots: PurchaseLot[] = []
  let stcg = 0
  let ltcg = 0
  let debtGains = 0

  for (const tx of sorted) {
    const txDate = parseDateStr(tx.date)

    if (tx.type === 'purchase' || tx.type === 'switch_in' || tx.type === 'stp') {
      lots.push({
        date: txDate,
        units: tx.units,
        nav: tx.nav,
        remainingUnits: tx.units,
      })
    } else if (tx.type === 'redemption' || tx.type === 'switch_out') {
      // Only count redemptions in this FY for capital gains
      if (!isInFY(txDate)) continue

      let unitsToRedeem = tx.units
      const redeemNav = tx.nav

      // FIFO: consume oldest lots first
      for (const lot of lots) {
        if (unitsToRedeem <= 0) break
        if (lot.remainingUnits <= 0) continue

        const consumed = Math.min(lot.remainingUnits, unitsToRedeem)
        lot.remainingUnits -= consumed
        unitsToRedeem -= consumed

        const gainPerUnit = redeemNav - lot.nav
        const gain = gainPerUnit * consumed

        if (orientation === 'debt') {
          // Post-2023 budget: debt MF gains taxed at slab rate regardless of holding
          debtGains += gain
        } else {
          // Equity-oriented: STCG if ≤12 months, LTCG if >12 months
          const months = monthsBetween(lot.date, txDate)
          if (months <= EQUITY_LTCG_THRESHOLD_MONTHS) {
            stcg += gain
          } else {
            ltcg += gain
          }
        }
      }
    }
  }

  return { stcg, ltcg, debtGains }
}

// ─── Main parser ──────────────────────────────────────────────────────────────

/**
 * Parse CAMS / KFintech JSON statement.
 * Both use the same top-level structure per design.md §8.3.
 */
export function parseMFJson(raw: unknown): MFData {
  const statement = raw as RawMFStatement

  if (!statement.folios || !Array.isArray(statement.folios)) {
    throw new Error('Invalid MF statement format — expected "folios" array')
  }

  const schemes: MFScheme[] = []
  let totalEquitySTCG = 0
  let totalEquityLTCG = 0
  let totalDebtGains = 0

  for (const folio of statement.folios) {
    const folioSchemes = folio.schemes ?? []

    for (const rawScheme of folioSchemes) {
      const schemeName = rawScheme.scheme_name ?? rawScheme.schemeName ?? 'Unknown Scheme'
      const isin = rawScheme.isin ?? ''
      const orientation = classifyFundOrientation(schemeName)

      const transactions: MFTransaction[] = (rawScheme.transactions ?? []).map(t => ({
        date: t.date,
        type: normalizeType(t.type),
        units: num(t.units),
        nav: num(t.nav),
        amount: num(t.amount),
      }))

      const { stcg, ltcg, debtGains } = computeSchemeCG(transactions, orientation)

      schemes.push({
        schemeName,
        isin,
        fundOrientation: orientation,
        transactions,
        stcg,
        ltcg,
        debtGains,
      })

      if (orientation === 'equity') {
        totalEquitySTCG += stcg
        totalEquityLTCG += ltcg
      } else {
        totalDebtGains += debtGains
      }
    }
  }

  const investorPan =
    statement.investor_info?.pan ??
    statement.investorInfo?.pan ??
    undefined

  return {
    schemes,
    totalEquitySTCG,
    totalEquityLTCG,
    totalDebtGains,
    investorPan,
  }
}

/**
 * Read a JSON file and return the parsed object.
 */
export async function readJsonFile(file: File): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        resolve(JSON.parse(e.target!.result as string))
      } catch {
        reject(new Error('Invalid JSON file — could not parse'))
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsText(file)
  })
}
