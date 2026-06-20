import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { detectBroker, extractWorkbookMeta } from '../../parsers/brokerDetection'
import { parseZerodha } from '../../parsers/zerodhaParser'

// ─── Workbook builder ─────────────────────────────────────────────────────────

function makeWB(sheets: Record<string, unknown[][]>): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  for (const [name, data] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data as XLSX.CellObject[][]), name)
  }
  return wb
}

// ─── Format 1: Classic FY 2022-23 style ──────────────────────────────────────
// Row 0: Title row "Zerodha Tax P&L"
// Row 1: Date range
// Row 2: Actual column headers

const FMT1_EQUITY = [
  ['Zerodha Tax P&L Report'],
  ['FY 2025-26 (Q1 to Q4)'],
  ['Scrip', 'ISIN', 'Trade Type', 'Quantity', 'Buy Date', 'Buy Price', 'Sell Date', 'Sell Price', 'Net P&L'],
  ['RELIANCE', 'INE002A01018', 'Delivery', 10, '2025-06-01', 2400, '2025-09-10', 2600, 2000],
  ['INFY', 'INE009A01021', 'Delivery', 5, '2024-03-01', 1400, '2025-04-10', 1700, 1500],
]

const FMT1_INTRADAY = [
  ['Zerodha Tax P&L Report'],
  ['FY 2025-26'],
  ['Scrip', 'Trade Type', 'Buy Value', 'Sell Value', 'Net P&L'],
  ['HDFC', 'Intraday', 80000, 61500, -18500],
]

const FMT1_DIVIDENDS = [
  ['Dividends'],
  ['Scrip', 'ISIN', 'Amount', 'Date'],
  ['ITC', 'INE154A01025', 3000, '2025-08-15'],
]

// ─── Format 2: FY 2024-25 Console export ─────────────────────────────────────
// No title row — headers start at row 0
// Different column names: Symbol instead of Scrip

const FMT2_EQUITY = [
  ['Symbol', 'ISIN', 'Type', 'Qty', 'Buy date', 'Avg. buy price', 'Sell date', 'Avg. sell price', 'Profit/Loss'],
  ['RELIANCE', 'INE002A01018', 'CNC', '10', '01-06-2025', '2400', '10-09-2025', '2600', '2000'],
  ['TCS', 'INE467B01029', 'CNC', '5', '15-07-2025', '3500', '20-11-2025', '3200', '-1500'],
]

const FMT2_INTRADAY = [
  ['Symbol', 'Type', 'Turnover', 'Net P&L'],
  ['HDFC', 'MIS', '141500', '-18500'],
]

// ─── Format 3: New Console export (2025-26) — "Net Realised Profit" column ───

const FMT3_EQUITY = [
  ['Stock', 'ISIN', 'Trade type', 'Quantity sold', 'Date of purchase', 'Cost Price', 'Date of sale', 'Sale Price', 'Net Realised Profit'],
  ['RELIANCE', 'INE002A01018', 'CNC', '10', '01/06/2025', '2400', '10/09/2025', '2600', '2000'],
]

const FMT3_INTRADAY = [
  ['Stock', 'Trade type', 'Turnover', 'Net Realised Profit'],
  ['HDFC', 'MIS', '141500', '-18500'],
]

// ─── Format 4: Blank row before headers ──────────────────────────────────────

const FMT4_EQUITY = [
  [''],  // blank row
  ['Scrip', 'ISIN', 'Trade Type', 'Quantity', 'Buy Date', 'Buy Price', 'Sell Date', 'Sell Price', 'Net P&L'],
  ['WIPRO', 'INE075A01022', 'Delivery', 20, '2025-05-01', 450, '2025-10-15', 520, 1400],
]

// ─── Format 5: Q1-Q4 combined with "Equity (Realised)" sheet name ─────────────

const FMT5_EQUITY_REALISED = [
  ['Scrip', 'Trade Type', 'Buy Date', 'Buy Avg Price', 'Sell Date', 'Sell Avg Price', 'Qty', 'Net P&L'],
  ['BAJFINANCE', 'Delivery', '2025-04-10', '6800', '2025-09-20', '7200', '2', '800'],
]

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Zerodha format compatibility', () => {

  // ── Detection tests ──────────────────────────────────────────────────────

  it('Format 1 (title rows): detects as zerodha', () => {
    const wb = makeWB({
      'Equity': FMT1_EQUITY,
      'Equity Intraday': FMT1_INTRADAY,
      'Dividends': FMT1_DIVIDENDS,
    })
    expect(detectBroker(wb)).toBe('zerodha')
  })

  it('Format 2 (Symbol/Type cols, no title): detects as zerodha', () => {
    const wb = makeWB({
      'Equity': FMT2_EQUITY,
      'Equity Intraday': FMT2_INTRADAY,
    })
    expect(detectBroker(wb)).toBe('zerodha')
  })

  it('Format 3 (Stock/Net Realised Profit cols): detects as zerodha', () => {
    const wb = makeWB({
      'Equity': FMT3_EQUITY,
      'Equity Intraday': FMT3_INTRADAY,
    })
    expect(detectBroker(wb)).toBe('zerodha')
  })

  it('Format 4 (blank row before headers): detects as zerodha', () => {
    const wb = makeWB({
      'Equity': FMT4_EQUITY,
      'Equity Intraday': FMT2_INTRADAY,
    })
    expect(detectBroker(wb)).toBe('zerodha')
  })

  it('Sheet named "Equity Intraday" alone is enough to detect Zerodha', () => {
    const wb = makeWB({ 'Equity Intraday': FMT1_INTRADAY })
    expect(detectBroker(wb)).toBe('zerodha')
  })

  it('Format 5 (Equity Realised sheet): detects as zerodha', () => {
    const wb = makeWB({
      'Equity (Realised)': FMT5_EQUITY_REALISED,
      'Equity Intraday': FMT1_INTRADAY,
    })
    expect(detectBroker(wb)).toBe('zerodha')
  })

  // ── Header row detection ──────────────────────────────────────────────────

  it('extractWorkbookMeta skips title rows and finds actual column headers', () => {
    const wb = makeWB({ 'Equity': FMT1_EQUITY })
    const meta = extractWorkbookMeta(wb)
    const headers = meta.columnHeaders['Equity']
    // Should find the actual column headers row, not the title
    expect(headers).toBeDefined()
    const hasRealHeaders = headers.some(h =>
      ['Scrip','Symbol','Stock','ISIN','Trade Type','Type','Quantity','Qty'].includes(h)
    )
    expect(hasRealHeaders).toBe(true)
    // Should NOT contain the title string
    expect(headers).not.toContain('Zerodha Tax P&L Report')
  })

  it('extractWorkbookMeta handles blank first row', () => {
    const wb = makeWB({ 'Equity': FMT4_EQUITY })
    const meta = extractWorkbookMeta(wb)
    const headers = meta.columnHeaders['Equity']
    expect(headers).toContain('Scrip')
  })

  // ── Parsing tests ─────────────────────────────────────────────────────────

  it('Format 1: parses equity trades correctly (with title rows)', () => {
    const wb = makeWB({
      'Equity': FMT1_EQUITY,
      'Equity Intraday': FMT1_INTRADAY,
      'Dividends': FMT1_DIVIDENDS,
    })
    const result = parseZerodha(wb)
    expect(result.equityDelivery.trades.length).toBe(2)
    expect(result.equityDelivery.totalSTCG).toBe(2000)
    expect(result.equityDelivery.totalLTCG).toBe(1500)
    expect(result.equityIntraday.netPnL).toBe(-18500)
    expect(result.dividends.total).toBe(3000)
  })

  it('Format 2: parses with Symbol/Type/Profit-Loss column names', () => {
    const wb = makeWB({
      'Equity': FMT2_EQUITY,
      'Equity Intraday': FMT2_INTRADAY,
    })
    const result = parseZerodha(wb)
    expect(result.equityDelivery.trades.length).toBe(2)
    expect(result.equityDelivery.totalSTCG).toBe(2000)
    expect(result.equityDelivery.totalSTCL).toBe(1500)
    expect(result.equityIntraday.netPnL).toBe(-18500)
  })

  it('Format 3: parses with Stock/Net Realised Profit column names', () => {
    const wb = makeWB({
      'Equity': FMT3_EQUITY,
      'Equity Intraday': FMT3_INTRADAY,
    })
    const result = parseZerodha(wb)
    expect(result.equityDelivery.trades.length).toBe(1)
    expect(result.equityDelivery.totalSTCG).toBe(2000)
    expect(result.equityIntraday.netPnL).toBe(-18500)
  })

  it('Format 4: parses correctly when blank row precedes headers', () => {
    const wb = makeWB({
      'Equity': FMT4_EQUITY,
      'Equity Intraday': FMT2_INTRADAY,
    })
    const result = parseZerodha(wb)
    expect(result.equityDelivery.trades.length).toBe(1)
    expect(result.equityDelivery.trades[0].scrip).toBe('WIPRO')
    expect(result.equityDelivery.totalSTCG).toBe(1400)
  })

  it('LTCG vs STCG classification: held > 365 days → LTCG', () => {
    // INFY: bought 2024-03-01, sold 2025-04-10 = ~400 days → LTCG
    const wb = makeWB({ 'Equity': FMT1_EQUITY, 'Equity Intraday': FMT1_INTRADAY })
    const result = parseZerodha(wb)
    const infy = result.equityDelivery.trades.find(t => t.scrip === 'INFY')
    expect(infy?.gainType).toBe('LTCG')
    expect(infy?.holdingDays).toBeGreaterThan(365)
  })

  it('STCG: held ≤ 365 days → STCG', () => {
    // RELIANCE: bought 2025-06-01, sold 2025-09-10 = 101 days → STCG
    const wb = makeWB({ 'Equity': FMT1_EQUITY, 'Equity Intraday': FMT1_INTRADAY })
    const result = parseZerodha(wb)
    const rel = result.equityDelivery.trades.find(t => t.scrip === 'RELIANCE')
    expect(rel?.gainType).toBe('STCG')
    expect(rel?.holdingDays).toBeLessThanOrEqual(365)
  })

  it('Intraday turnover = absolute sum of all P&L rows', () => {
    const wb = makeWB({
      'Equity': FMT1_EQUITY,
      'Equity Intraday': [
        ['Scrip', 'Trade Type', 'Net P&L'],
        ['HDFC', 'MIS', -18500],
        ['SBI', 'MIS', 5000],
        ['AXIS', 'MIS', -3000],
      ],
    })
    const result = parseZerodha(wb)
    // Turnover = |−18500| + |5000| + |−3000| = 26500
    expect(result.equityIntraday.turnover).toBe(26500)
    // Net = −18500 + 5000 + −3000 = −16500
    expect(result.equityIntraday.netPnL).toBe(-16500)
  })

  it('Date formats: DD-MM-YYYY, DD/MM/YYYY, YYYY-MM-DD all parsed correctly', () => {
    const wb = makeWB({
      'Equity': [
        ['Scrip', 'Trade Type', 'Quantity', 'Buy Date', 'Buy Price', 'Sell Date', 'Sell Price', 'Net P&L'],
        ['A', 'Delivery', 10, '01-06-2025', 100, '10-09-2025', 120, 200],  // DD-MM-YYYY
        ['B', 'Delivery', 10, '01/06/2025', 100, '10/09/2025', 120, 200],  // DD/MM/YYYY
        ['C', 'Delivery', 10, '2025-06-01', 100, '2025-09-10', 120, 200],  // YYYY-MM-DD
      ],
      'Equity Intraday': [['Scrip', 'Net P&L']],
    })
    const result = parseZerodha(wb)
    expect(result.equityDelivery.trades).toHaveLength(3)
    // All should be parsed as STCG (< 365 days)
    expect(result.equityDelivery.trades.every(t => t.gainType === 'STCG')).toBe(true)
  })

  it('Numbers with commas parsed correctly (e.g. "1,20,000")', () => {
    const wb = makeWB({
      'Equity': [
        ['Scrip', 'Trade Type', 'Quantity', 'Buy Date', 'Buy Price', 'Sell Date', 'Sell Price', 'Net P&L'],
        ['RELIANCE', 'Delivery', '10', '2025-06-01', '2,400.00', '2025-09-10', '2,600.00', '2,000.00'],
      ],
      'Equity Intraday': [['Scrip', 'Net P&L']],
    })
    const result = parseZerodha(wb)
    expect(result.equityDelivery.trades[0].buyPrice).toBe(2400)
    expect(result.equityDelivery.trades[0].sellPrice).toBe(2600)
    expect(result.equityDelivery.totalSTCG).toBe(2000)
  })

  it('F&O sheet with data → hasFnO=true', () => {
    const wb = makeWB({
      'Equity': FMT1_EQUITY,
      'Equity Intraday': FMT1_INTRADAY,
      'F&O': [
        ['Scrip', 'Type', 'Net P&L'],
        ['NIFTY24DECCE', 'Options', 25000],
      ],
    })
    expect(parseZerodha(wb).hasFnO).toBe(true)
  })
})
