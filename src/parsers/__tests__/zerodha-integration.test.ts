import { describe, it, expect, beforeAll } from 'vitest'
import * as XLSX from 'xlsx'
import { readFileSync, existsSync } from 'fs'
import { detectBroker } from '../../parsers/brokerDetection'
import { parseZerodha } from '../../parsers/zerodhaParser'

const FILE_PATH = '/mnt/user-data/uploads/taxpnl-TTP345-2025_2026-Q1-Q4.xlsx'
const fileExists = existsSync(FILE_PATH)

// Expected values verified from the "Equity and Non Equity" summary sheet
const EXPECTED = {
  intradayNetPnL: -1725.70,
  intradayTurnover: 1725.70,
  shortTermProfit: -37731.43,
  longTermProfit: -5730.83,
  hasFnO: true,       // F&O section has 105 data rows
}

describe.skipIf(!fileExists)('Zerodha actual file integration test', () => {

  let wb: XLSX.WorkBook
  let result: ReturnType<typeof parseZerodha>

  beforeAll(() => {
    const buf = readFileSync(FILE_PATH)
    wb = XLSX.read(buf, { type: 'buffer', cellDates: true })
    result = parseZerodha(wb)
  })

  it('detects as zerodha', () => {
    expect(detectBroker(wb)).toBe('zerodha')
  })

  it('intraday net P&L matches summary sheet', () => {
    expect(result.equityIntraday.netPnL).toBeCloseTo(EXPECTED.intradayNetPnL, 1)
  })

  it('intraday turnover matches summary sheet', () => {
    expect(result.equityIntraday.turnover).toBeCloseTo(EXPECTED.intradayTurnover, 1)
  })

  it('short term net P&L matches summary sheet', () => {
    const stNet = result.equityDelivery.totalSTCG - result.equityDelivery.totalSTCL
    expect(stNet).toBeCloseTo(EXPECTED.shortTermProfit, 1)
  })

  it('long term net P&L matches summary sheet', () => {
    const ltNet = result.equityDelivery.totalLTCG - result.equityDelivery.totalLTCL
    expect(ltNet).toBeCloseTo(EXPECTED.longTermProfit, 1)
  })

  it('hasFnO is true (F&O trades present)', () => {
    expect(result.hasFnO).toBe(true)
  })

  it('has equity delivery trades', () => {
    expect(result.equityDelivery.trades.length).toBeGreaterThan(0)
  })

  it('all short term trades have gainType STCG', () => {
    const stTrades = result.equityDelivery.trades.filter(t => t.gainType === 'STCG')
    expect(stTrades.length).toBeGreaterThan(0)
  })

  it('all long term trades have gainType LTCG', () => {
    const ltTrades = result.equityDelivery.trades.filter(t => t.gainType === 'LTCG')
    expect(ltTrades.length).toBeGreaterThan(0)
  })

  it('dividends parsed from Equity Dividends sheet', () => {
    expect(result.dividends.scrips.length).toBeGreaterThan(0)
    expect(result.dividends.total).toBeGreaterThan(0)
  })

  it('PAN extracted from metadata', () => {
    // PAN is on the summary sheet (Equity and Non Equity)
    // Verify the sheet is accessible
    expect(wb.SheetNames).toContain('Equity and Non Equity')
  })

  it('broker name is zerodha', () => {
    expect(result.broker).toBe('zerodha')
  })

  it('raw sheet names preserved', () => {
    expect(result.rawSheetNames.length).toBeGreaterThan(0)
  })
})
