import * as XLSX from 'xlsx'
import type { BrokerName } from '../types'

export interface WorkbookMeta {
  sheetNames: string[]
  columnHeaders: Record<string, string[]>
}

/**
 * Find the best header row in a sheet.
 * Zerodha (and some other brokers) put a title/date row before the actual column headers.
 * We scan the first MAX_HEADER_SCAN_ROWS rows and pick the one with the most
 * non-empty, non-numeric, non-date text cells — that's the column header row.
 */
const MAX_HEADER_SCAN_ROWS = 10

function findHeaderRow(sheet: XLSX.WorkSheet): { rowIndex: number; headers: string[] } {
  if (!sheet['!ref']) return { rowIndex: 0, headers: [] }

  const range = XLSX.utils.decode_range(sheet['!ref'])
  let bestRow = range.s.r
  let bestHeaders: string[] = []
  let bestScore = -1

  for (let r = range.s.r; r <= Math.min(range.s.r + MAX_HEADER_SCAN_ROWS - 1, range.e.r); r++) {
    const cells: string[] = []
    for (let c = range.s.c; c <= Math.min(range.e.c, 30); c++) {
      const cell = sheet[XLSX.utils.encode_cell({ r, c })]
      if (cell?.v != null) {
        const val = String(cell.v).trim()
        if (val) cells.push(val)
      }
    }

    // Score this row: more text cells = better header row
    // Penalise rows with mostly numbers or single long strings (title rows)
    const textCells = cells.filter(v => isNaN(Number(v)) && v.length > 0 && v.length < 50)
    const singleCell = cells.length === 1
    const hasDatePattern = cells.some(v => /\d{4}-\d{2}|\d{2}[/-]\d{2}[/-]\d{2,4}/.test(v))

    let score = textCells.length
    if (singleCell) score -= 5          // title row penalty
    if (hasDatePattern) score -= 3      // date row penalty
    if (textCells.length >= 3) score += 2 // bonus for multiple columns

    if (score > bestScore) {
      bestScore = score
      bestRow = r
      bestHeaders = cells
    }
  }

  return { rowIndex: bestRow, headers: bestHeaders }
}

export function extractWorkbookMeta(workbook: XLSX.WorkBook): WorkbookMeta {
  const sheetNames = workbook.SheetNames
  const columnHeaders: Record<string, string[]> = {}

  for (const name of sheetNames) {
    const sheet = workbook.Sheets[name]
    if (!sheet) continue

    const { headers } = findHeaderRow(sheet)
    if (headers.length > 0) {
      columnHeaders[name] = headers
    }
  }

  return { sheetNames, columnHeaders }
}

export function detectBroker(workbook: XLSX.WorkBook): BrokerName {
  const { sheetNames, columnHeaders } = extractWorkbookMeta(workbook)
  const sheetNamesLower = sheetNames.map(s => s.toLowerCase())

  const hasSheet = (name: string) =>
    sheetNamesLower.some(s => s === name.toLowerCase() || s.includes(name.toLowerCase()))

  const anySheetHasColumn = (col: string): boolean =>
    Object.values(columnHeaders).some(headers =>
      headers.some(h => h.toLowerCase() === col.toLowerCase())
    )

  const anySheetHasColumnContaining = (partial: string): boolean =>
    Object.values(columnHeaders).some(headers =>
      headers.some(h => h.toLowerCase().includes(partial.toLowerCase()))
    )

  // ── Zerodha signatures ────────────────────────────────────────────────────
  // Zerodha Tax P&L exports have varied slightly across years.
  // We check multiple known patterns — any match → zerodha.

  // Pattern 0a: FY 2025-26 "Tradewise Exits" multi-section format
  if (hasSheet('Tradewise Exits') || hasSheet('Tradewise')) {
    return 'zerodha'
  }

  // Pattern 0b: Summary sheet "Equity and Non Equity"
  if (hasSheet('Equity and Non Equity')) {
    return 'zerodha'
  }

  // Pattern 0c: "Equity Dividends" dedicated sheet (Zerodha-specific name)
  if (hasSheet('Equity Dividends')) {
    return 'zerodha'
  }

  // Pattern 1: Classic — sheet "Equity" + "Scrip" + "Trade Type"
  if (hasSheet('Equity') && anySheetHasColumn('Scrip') && anySheetHasColumn('Trade Type')) {
    return 'zerodha'
  }

  // Pattern 2: Newer exports — sheet "Equity" + "Symbol" + "Type"
  // Only if no Groww/Upstox markers present
  if (
    hasSheet('Equity') &&
    anySheetHasColumn('Symbol') &&
    anySheetHasColumn('Type') &&
    !hasSheet('Capital Gains') &&
    !hasSheet('Tradebook')
  ) {
    return 'zerodha'
  }

  // Pattern 3: "Equity" sheet + "ISIN" column (Zerodha-specific)
  if (hasSheet('Equity') && anySheetHasColumn('ISIN')) {
    return 'zerodha'
  }

  // Pattern 4: "Equity Intraday" sheet exists (very Zerodha-specific name)
  if (hasSheet('Equity Intraday')) {
    return 'zerodha'
  }

  // Pattern 5: Sheet named "P&L" or "Tax P&L" with Scrip or Symbol column
  if (
    (hasSheet('P&L') || hasSheet('Tax P&L') || hasSheet('PnL')) &&
    (anySheetHasColumn('Scrip') || anySheetHasColumn('Symbol'))
  ) {
    return 'zerodha'
  }

  // Pattern 6: "tradingsymbol" + pnl — Zerodha Kite (but not Upstox Tradebook)
  if (
    anySheetHasColumn('tradingsymbol') &&
    anySheetHasColumnContaining('pnl') &&
    !hasSheet('Tradebook') &&
    !anySheetHasColumn('instrument_type')
  ) {
    return 'zerodha'
  }

  // Pattern 7: Any sheet with both "Buy Date" and "Sell Date" and "Scrip"/"Symbol"
  // Exclude if Groww or Upstox markers present
  if (
    anySheetHasColumnContaining('buy date') &&
    anySheetHasColumnContaining('sell date') &&
    (anySheetHasColumn('Scrip') || anySheetHasColumn('Symbol')) &&
    !hasSheet('Capital Gains') &&
    !hasSheet('Tradebook') &&
    !anySheetHasColumn('Transaction Type')
  ) {
    return 'zerodha'
  }

  // Pattern 8: Zerodha sometimes exports with "Net Realised Profit"
  if (anySheetHasColumnContaining('net realised') || anySheetHasColumnContaining('net realized')) {
    return 'zerodha'
  }

  // ── Groww signatures ──────────────────────────────────────────────────────
  // Pattern 1: Classic — sheet "Capital Gains" + "Transaction Type"
  if (hasSheet('Capital Gains') && anySheetHasColumn('Transaction Type')) {
    return 'groww'
  }

  // Pattern 2: "Capital Gains" sheet + "Stock" or "Fund Name" column
  if (hasSheet('Capital Gains') && (anySheetHasColumn('Stock') || anySheetHasColumn('Fund Name'))) {
    return 'groww'
  }

  // Pattern 3: Sheet with "Groww" in its name
  if (sheetNamesLower.some(s => s.includes('groww'))) {
    return 'groww'
  }

  // ── Upstox signatures ─────────────────────────────────────────────────────
  // Pattern 1: Classic — sheet "Tradebook" + "instrument_type"
  if (hasSheet('Tradebook') && anySheetHasColumn('instrument_type')) {
    return 'upstox'
  }

  // Pattern 2: "Trade Book" (space variant)
  if (hasSheet('Trade Book') && (anySheetHasColumn('instrument_type') || anySheetHasColumn('Instrument Type'))) {
    return 'upstox'
  }

  // Pattern 3: "buy_price" / "sell_price" snake_case columns (Upstox style)
  if (anySheetHasColumn('buy_price') && anySheetHasColumn('sell_price')) {
    return 'upstox'
  }

  return 'unknown'
}

export async function readExcelFile(file: File): Promise<XLSX.WorkBook> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const workbook = XLSX.read(data, { type: 'array', cellDates: true })
        resolve(workbook)
      } catch (err) {
        reject(new Error(`Failed to read Excel file: ${(err as Error).message}`))
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsArrayBuffer(file)
  })
}

export function sheetToRows(
  workbook: XLSX.WorkBook,
  sheetName: string
): Record<string, unknown>[] {
  const sheet = workbook.Sheets[sheetName]
  if (!sheet || !sheet['!ref']) return []

  // Find the actual header row — handles title rows, blank rows, etc.
  const { rowIndex } = findHeaderRow(sheet)
  const range = XLSX.utils.decode_range(sheet['!ref'])

  if (rowIndex > range.s.r) {
    // Crop the sheet to start from the header row
    const croppedRange = { ...range, s: { ...range.s, r: rowIndex } }
    const croppedSheet: XLSX.WorkSheet = { ...sheet, '!ref': XLSX.utils.encode_range(croppedRange) }
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(croppedSheet, {
      defval: null,
      raw: false,
      dateNF: 'yyyy-mm-dd',
    })
  }

  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: false,
    dateNF: 'yyyy-mm-dd',
  })
}

export function findSheet(workbook: XLSX.WorkBook, name: string): string | null {
  return workbook.SheetNames.find(
    s => s.toLowerCase() === name.toLowerCase() ||
         s.toLowerCase().includes(name.toLowerCase())
  ) ?? null
}
