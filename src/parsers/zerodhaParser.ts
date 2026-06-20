import type * as XLSX from 'xlsx'
import type { BrokerData, EquityTrade } from '../types'
import { findSheet, sheetToRows } from './brokerDetection'
import * as XLSXLib from 'xlsx'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function num(val: unknown): number {
  if (val == null) return 0
  const n = parseFloat(String(val).replace(/,/g, ''))
  return isNaN(n) ? 0 : n
}

function str(val: unknown): string {
  return val == null ? '' : String(val).trim()
}

function parseDate(val: unknown): Date | null {
  if (!val) return null
  const s = String(val).trim().split('T')[0]  // strip time component
  if (!s) return null

  // DD-MM-YYYY or DD/MM/YYYY
  const dmy = s.match(/^(\d{2})[\-/](\d{2})[\-/](\d{4})$/)
  if (dmy) {
    const d = new Date(`${dmy[3]}-${dmy[2]}-${dmy[1]}`)
    return isNaN(d.getTime()) ? null : d
  }

  // DD-MMM-YYYY e.g. 15-Apr-2025
  const dMmmY = s.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/)
  if (dMmmY) {
    const d = new Date(`${dMmmY[2]} ${dMmmY[1]}, ${dMmmY[3]}`)
    return isNaN(d.getTime()) ? null : d
  }

  // ISO YYYY-MM-DD
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

// Flexible column resolver — tries exact, then case-insensitive, then partial match
function resolveCol(row: Record<string, unknown>, candidates: string[]): unknown {
  for (const c of candidates) {
    if (row[c] != null) return row[c]
    const cLower = c.toLowerCase()
    for (const [k, v] of Object.entries(row)) {
      if (k.toLowerCase() === cLower && v != null) return v
    }
    for (const [k, v] of Object.entries(row)) {
      if (k.toLowerCase().includes(cLower) && v != null) return v
    }
  }
  return null
}

// ─── Section reader for Tradewise Exits multi-section format ─────────────────

const SECTION_NAMES = [
  'Equity - Intraday', 'Equity - Short Term', 'Equity - Long Term',
  'Equity - Buyback', 'Non Equity', 'Mutual Funds', 'F&O', 'Currency', 'Commodity',
]

interface SectionBoundary {
  name: string
  colRow: number    // 0-based row of column headers
  dataStart: number // 0-based first data row
  dataEnd: number   // 0-based exclusive end row
}

function findSectionBoundaries(sheet: XLSX.WorkSheet): SectionBoundary[] {
  if (!sheet['!ref']) return []
  const range = XLSXLib.utils.decode_range(sheet['!ref'])
  const found: Array<{ name: string; row: number }> = []

  for (let r = range.s.r; r <= range.e.r; r++) {
    const cell = sheet[XLSXLib.utils.encode_cell({ r, c: 1 })]
    if (cell?.v != null && SECTION_NAMES.includes(String(cell.v).trim())) {
      found.push({ name: String(cell.v).trim(), row: r })
    }
  }

  return found.map((b, i) => ({
    name: b.name,
    colRow: b.row + 2,
    dataStart: b.row + 3,
    dataEnd: i + 1 < found.length ? found[i + 1].row : range.e.r + 1,
  }))
}

function readSectionRows(sheet: XLSX.WorkSheet, s: SectionBoundary): Record<string, string>[] {
  if (!sheet['!ref']) return []
  const range = XLSXLib.utils.decode_range(sheet['!ref'])

  const colNames: Record<number, string> = {}
  for (let c = 1; c <= range.e.c; c++) {
    const cell = sheet[XLSXLib.utils.encode_cell({ r: s.colRow, c })]
    if (cell?.v != null) colNames[c] = String(cell.v).trim()
  }

  const rows: Record<string, string>[] = []
  for (let r = s.dataStart; r < s.dataEnd && r <= range.e.r; r++) {
    const row: Record<string, string> = {}
    let hasData = false
    for (let c = 1; c <= range.e.c; c++) {
      const cell = sheet[XLSXLib.utils.encode_cell({ r, c })]
      if (cell?.v != null && colNames[c]) {
        row[colNames[c]] = String(cell.v).trim()
        hasData = true
      }
    }
    if (hasData && row['Symbol'] && !SECTION_NAMES.includes(row['Symbol'])) {
      rows.push(row)
    }
  }
  return rows
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function parseZerodha(workbook: XLSX.WorkBook): BrokerData {
  const tradewiseSheetName =
    findSheet(workbook, 'Tradewise Exits') ??
    findSheet(workbook, 'Tradewise')

  if (tradewiseSheetName) {
    return parseNewFormat(workbook, tradewiseSheetName)
  }
  return parseLegacyFormat(workbook)
}

// ─── New format: Tradewise Exits (FY 2025-26+) ───────────────────────────────
// All sections in one sheet, columns start at B, data pre-calculated.

function parseNewFormat(workbook: XLSX.WorkBook, sheetName: string): BrokerData {
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) return emptyBrokerData()

  const sections = findSectionBoundaries(sheet)
  const getSection = (name: string) => sections.find(s => s.name === name)

  // ── Intraday ────────────────────────────────────────────────────────────
  let intradayTurnover = 0, intradayNetPnL = 0
  const intradaySection = getSection('Equity - Intraday')
  if (intradaySection) {
    for (const row of readSectionRows(sheet, intradaySection)) {
      const profit = num(row['Taxable Profit'] ?? row['Profit'])
      const turnover = num(row['Turnover'])
      intradayNetPnL += profit
      intradayTurnover += turnover > 0 ? turnover : Math.abs(profit)
    }
  }

  // ── Short Term ──────────────────────────────────────────────────────────
  const stTrades: EquityTrade[] = []
  const stSection = getSection('Equity - Short Term')
  if (stSection) {
    for (const row of readSectionRows(sheet, stSection)) {
      const trade = buildTradeFromNewFormatRow(row, 'STCG')
      if (trade) stTrades.push(trade)
    }
  }

  // ── Long Term ───────────────────────────────────────────────────────────
  const ltTrades: EquityTrade[] = []
  const ltSection = getSection('Equity - Long Term')
  if (ltSection) {
    for (const row of readSectionRows(sheet, ltSection)) {
      const trade = buildTradeFromNewFormatRow(row, 'LTCG')
      if (trade) ltTrades.push(trade)
    }
  }

  // ── F&O detection ───────────────────────────────────────────────────────
  let hasFnO = false
  const fnoSection = getSection('F&O')
  const currencySection = getSection('Currency')
  const commoditySection = getSection('Commodity')
  if (fnoSection && readSectionRows(sheet, fnoSection).length > 0) hasFnO = true
  if (!hasFnO && currencySection && readSectionRows(sheet, currencySection).length > 0) hasFnO = true
  if (!hasFnO && commoditySection && readSectionRows(sheet, commoditySection).length > 0) hasFnO = true

  // ── Dividends ───────────────────────────────────────────────────────────
  const dividends = parseDividends(workbook)

  // ── Aggregates ──────────────────────────────────────────────────────────
  const allTrades = [...stTrades, ...ltTrades]
  return {
    broker: 'zerodha',
    equityDelivery: {
      trades: allTrades,
      totalSTCG: stTrades.filter(t => t.netGainLoss > 0).reduce((s, t) => s + t.netGainLoss, 0),
      totalLTCG: ltTrades.filter(t => t.netGainLoss > 0).reduce((s, t) => s + t.netGainLoss, 0),
      totalSTCL: Math.abs(stTrades.filter(t => t.netGainLoss < 0).reduce((s, t) => s + t.netGainLoss, 0)),
      totalLTCL: Math.abs(ltTrades.filter(t => t.netGainLoss < 0).reduce((s, t) => s + t.netGainLoss, 0)),
    },
    equityIntraday: { turnover: intradayTurnover, netPnL: intradayNetPnL },
    dividends,
    hasFnO,
    rawSheetNames: workbook.SheetNames,
  }
}

function buildTradeFromNewFormatRow(row: Record<string, string>, gainType: 'STCG' | 'LTCG'): EquityTrade | null {
  const scrip = str(row['Symbol'])
  if (!scrip) return null
  const buyDate = parseDate(row['Entry Date'])
  const sellDate = parseDate(row['Exit Date'])
  const netGainLoss = num(row['Taxable Profit'] ?? row['Profit'])
  const quantity = num(row['Quantity'])
  const buyValue = num(row['Buy Value'])
  const sellValue = num(row['Sell Value'])
  const holdingDays = Math.round(num(row['Period of Holding']))
  return {
    scrip,
    buyDate: buyDate?.toISOString().split('T')[0] ?? '',
    sellDate: sellDate?.toISOString().split('T')[0] ?? '',
    quantity,
    buyPrice: quantity > 0 ? buyValue / quantity : 0,
    sellPrice: quantity > 0 ? sellValue / quantity : 0,
    netGainLoss,
    holdingDays,
    gainType,
  }
}

// ─── Legacy format: separate Equity / Equity Intraday / Dividends sheets ──────
// FY 2022-23 through 2024-25 style.

function parseLegacyFormat(workbook: XLSX.WorkBook): BrokerData {
  const equitySheetName = findSheet(workbook, 'Equity')
  const intradaySheetName = findSheet(workbook, 'Equity Intraday') ?? findSheet(workbook, 'Intraday')
  const dividendSheetName = findSheet(workbook, 'Dividends') ?? findSheet(workbook, 'Dividend')

  const MS_PER_DAY = 1000 * 60 * 60 * 24
  const BUY_DATE_COLS  = ['Buy Date', 'Purchase Date', 'Date of Purchase', 'Avg. buy date', 'Buy date', 'Entry Date', 'Acquisition Date']
  const SELL_DATE_COLS = ['Sell Date', 'Sale Date', 'Date of Sale', 'Date of sale', 'Avg. sell date', 'Sell date', 'Exit Date', 'Disposal Date']
  const BUY_PRICE_COLS = ['Buy Price', 'Purchase Price', 'Avg. buy price', 'Avg. Cost Price', 'Cost Price', 'Average Buy Price']
  const SELL_PRICE_COLS = ['Sell Price', 'Sale Price', 'Avg. sell price', 'Average Sell Price', 'Selling Price']
  const PNL_COLS = ['Net P&L', 'Net Profit/Loss', 'Profit/Loss', 'Realised P&L', 'Realized P&L',
                    'Net Realised Profit', 'Net Realized Profit', 'P&L', 'Gain/Loss', 'Profit', 'Taxable Profit']

  // ── Equity delivery ──────────────────────────────────────────────────────
  const trades: EquityTrade[] = []
  if (equitySheetName) {
    for (const row of sheetToRows(workbook, equitySheetName)) {
      const scrip = str(resolveCol(row, ['Scrip', 'Symbol', 'Stock', 'Instrument', 'Security', 'Name', 'Stock Name']))
      if (!scrip || ['scrip','symbol','stock','instrument','security','name'].includes(scrip.toLowerCase())) continue
      const buyDate = parseDate(resolveCol(row, BUY_DATE_COLS))
      const sellDate = parseDate(resolveCol(row, SELL_DATE_COLS))
      if (!buyDate || !sellDate) continue
      const quantity = num(resolveCol(row, ['Quantity', 'Qty', 'No. of shares', 'Units', 'Quantity sold']))
      const buyPrice = num(resolveCol(row, BUY_PRICE_COLS))
      const sellPrice = num(resolveCol(row, SELL_PRICE_COLS))
      const netGainLoss = num(resolveCol(row, PNL_COLS))
      const holdingDaysCol = num(resolveCol(row, ['Period of Holding', 'Holding Period', 'Days']))
      const holdingDays = holdingDaysCol > 0
        ? holdingDaysCol
        : Math.floor((sellDate.getTime() - buyDate.getTime()) / MS_PER_DAY)
      trades.push({
        scrip,
        buyDate: buyDate.toISOString().split('T')[0],
        sellDate: sellDate.toISOString().split('T')[0],
        quantity, buyPrice, sellPrice, netGainLoss,
        holdingDays,
        gainType: holdingDays > 365 ? 'LTCG' : 'STCG',
      })
    }
  }

  // ── Intraday ─────────────────────────────────────────────────────────────
  let intradayTurnover = 0, intradayNetPnL = 0
  if (intradaySheetName) {
    for (const row of sheetToRows(workbook, intradaySheetName)) {
      const rawPnl = resolveCol(row, PNL_COLS)
      if (rawPnl == null) continue
      const pnl = num(rawPnl)
      if (!isNaN(pnl)) { intradayTurnover += Math.abs(pnl); intradayNetPnL += pnl }
    }
  }

  // ── Dividends ─────────────────────────────────────────────────────────────
  const divScrips: { scrip: string; amount: number }[] = []
  if (dividendSheetName) {
    for (const row of sheetToRows(workbook, dividendSheetName)) {
      const scrip = str(resolveCol(row, ['Scrip', 'Symbol', 'Company', 'Name', 'Stock']))
      if (!scrip || ['scrip','symbol','company','name','stock'].includes(scrip.toLowerCase())) continue
      const rawAmt = resolveCol(row, ['Amount', 'Dividend Amount', 'Net Amount', 'Net Dividend', 'Dividend', 'Net Dividend Amount'])
      const amount = num(rawAmt)
      if (rawAmt != null && amount !== 0) divScrips.push({ scrip, amount })
    }
  }

  // ── F&O detection ─────────────────────────────────────────────────────────
  const fnoKeywords = ['f&o', 'futures', 'options', 'currency', 'commodity', 'derivatives']
  let hasFnO = false
  for (const sheetName of workbook.SheetNames) {
    if (fnoKeywords.some(kw => sheetName.toLowerCase().includes(kw))) {
      if (sheetToRows(workbook, sheetName).length > 0) { hasFnO = true; break }
    }
  }

  return {
    broker: 'zerodha',
    equityDelivery: {
      trades,
      totalSTCG: trades.filter(t => t.gainType === 'STCG' && t.netGainLoss > 0).reduce((s, t) => s + t.netGainLoss, 0),
      totalLTCG: trades.filter(t => t.gainType === 'LTCG' && t.netGainLoss > 0).reduce((s, t) => s + t.netGainLoss, 0),
      totalSTCL: Math.abs(trades.filter(t => t.gainType === 'STCG' && t.netGainLoss < 0).reduce((s, t) => s + t.netGainLoss, 0)),
      totalLTCL: Math.abs(trades.filter(t => t.gainType === 'LTCG' && t.netGainLoss < 0).reduce((s, t) => s + t.netGainLoss, 0)),
    },
    equityIntraday: { turnover: intradayTurnover, netPnL: intradayNetPnL },
    dividends: { scrips: divScrips, total: divScrips.reduce((s, d) => s + d.amount, 0) },
    hasFnO,
    rawSheetNames: workbook.SheetNames,
  }
}

// ─── Dividends parser (new format — dedicated Equity Dividends sheet) ─────────

function parseDividends(workbook: XLSX.WorkBook): BrokerData['dividends'] {
  const sheetName =
    findSheet(workbook, 'Equity Dividends') ??
    findSheet(workbook, 'Dividends') ??
    findSheet(workbook, 'Dividend')

  if (!sheetName) return { scrips: [], total: 0 }
  const sheet = workbook.Sheets[sheetName]
  if (!sheet?.['!ref']) return { scrips: [], total: 0 }

  const range = XLSXLib.utils.decode_range(sheet['!ref'])

  // Find header row — look for "Symbol" in col B (index 1)
  let headerRow = -1
  for (let r = range.s.r; r <= range.e.r; r++) {
    const cell = sheet[XLSXLib.utils.encode_cell({ r, c: 1 })]
    if (cell?.v != null && String(cell.v).trim() === 'Symbol') { headerRow = r; break }
  }
  if (headerRow < 0) return { scrips: [], total: 0 }

  // Build column name map from header row
  const colNames: Record<number, string> = {}
  for (let c = 1; c <= range.e.c; c++) {
    const cell = sheet[XLSXLib.utils.encode_cell({ r: headerRow, c })]
    if (cell?.v != null) colNames[c] = String(cell.v).trim()
  }

  const scrips: { scrip: string; amount: number }[] = []
  for (let r = headerRow + 1; r <= range.e.r; r++) {
    const symbolCell = sheet[XLSXLib.utils.encode_cell({ r, c: 1 })]
    if (!symbolCell?.v) continue
    const scrip = String(symbolCell.v).trim()
    if (!scrip || scrip === 'Symbol') continue

    let amount = 0
    for (let c = 1; c <= range.e.c; c++) {
      const colName = colNames[c] ?? ''
      if (colName.toLowerCase().includes('net dividend') || colName.toLowerCase().includes('dividend amount')) {
        const cell = sheet[XLSXLib.utils.encode_cell({ r, c })]
        if (cell?.v != null) { amount = num(cell.v); break }
      }
    }
    if (amount !== 0) scrips.push({ scrip, amount })
  }

  return { scrips, total: scrips.reduce((s, d) => s + d.amount, 0) }
}

// ─── Empty result ─────────────────────────────────────────────────────────────

function emptyBrokerData(): BrokerData {
  return {
    broker: 'zerodha',
    equityDelivery: { trades: [], totalSTCG: 0, totalLTCG: 0, totalSTCL: 0, totalLTCL: 0 },
    equityIntraday: { turnover: 0, netPnL: 0 },
    dividends: { scrips: [], total: 0 },
    hasFnO: false,
    rawSheetNames: [],
  }
}
