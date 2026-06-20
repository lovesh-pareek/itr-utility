import type * as XLSX from 'xlsx'
import type { BrokerData, EquityTrade } from '../types'
import { sheetToRows, findSheet } from './brokerDetection'

const MS_PER_DAY = 1000 * 60 * 60 * 24

function parseDate(val: unknown): Date | null {
  if (!val) return null
  const s = String(val).trim()
  if (!s) return null
  // Handle DD-MM-YYYY and DD/MM/YYYY formats common in Indian broker exports
  const parts = s.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/)
  if (parts) {
    const [, dd, mm, yyyy] = parts
    const d = new Date(`${yyyy}-${mm}-${dd}`)
    return isNaN(d.getTime()) ? null : d
  }
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function holdingDays(buyDate: Date, sellDate: Date): number {
  return Math.floor((sellDate.getTime() - buyDate.getTime()) / MS_PER_DAY)
}

function num(val: unknown): number {
  if (val == null) return 0
  const n = parseFloat(String(val).replace(/,/g, '').replace(/₹/g, '').trim())
  return isNaN(n) ? 0 : n
}

function str(val: unknown): string {
  return val == null ? '' : String(val).trim()
}

// ─── GROWW PARSER ─────────────────────────────────────────────────────────────

/**
 * Groww: single "Capital Gains" sheet.
 * Key columns: Scrip/Symbol, Transaction Type (Delivery/Intraday), Buy Date, Sell Date, Qty, Buy Price, Sell Price, P&L
 */
export function parseGroww(workbook: XLSX.WorkBook): BrokerData {
  const sheetName =
    findSheet(workbook, 'Capital Gains') ??
    findSheet(workbook, 'Equity') ??
    workbook.SheetNames[0]

  if (!sheetName) {
    return emptyBrokerData('groww')
  }

  const rows = sheetToRows(workbook, sheetName)

  const deliveryTrades: EquityTrade[] = []
  let intradayTurnover = 0
  let intradayNetPnL = 0
  const dividendRows: { scrip: string; amount: number }[] = []

  for (const row of rows) {
    const txType = str(
      row['Transaction Type'] ?? row['Type'] ?? row['Trade Type'] ?? row['Category']
    ).toLowerCase()

    if (!txType) continue

    // ── Dividends ──
    if (txType.includes('dividend')) {
      const scrip = str(row['Scrip'] ?? row['Symbol'] ?? row['Company'])
      const amount = num(row['Amount'] ?? row['Dividend Amount'] ?? row['Net Amount'])
      if (scrip) dividendRows.push({ scrip, amount })
      continue
    }

    // ── Intraday ──
    if (txType.includes('intraday') || txType.includes('mis')) {
      const pnl = num(row['P&L'] ?? row['Net P&L'] ?? row['Profit/Loss'] ?? row['Gain/Loss'])
      intradayTurnover += Math.abs(pnl)
      intradayNetPnL += pnl
      continue
    }

    // ── Delivery (default) ──
    if (txType.includes('delivery') || txType.includes('cnc') || txType === 'sell') {
      const scrip = str(row['Scrip'] ?? row['Symbol'] ?? row['Stock'])
      if (!scrip) continue

      const buyDate = parseDate(row['Buy Date'] ?? row['Purchase Date'] ?? row['From Date'])
      const sellDate = parseDate(row['Sell Date'] ?? row['Sale Date'] ?? row['To Date'])
      if (!buyDate || !sellDate) continue

      const quantity = num(row['Quantity'] ?? row['Qty'] ?? row['Units'])
      const buyPrice = num(row['Buy Price'] ?? row['Purchase Price'] ?? row['Avg Buy Price'])
      const sellPrice = num(row['Sell Price'] ?? row['Sale Price'] ?? row['Avg Sell Price'])
      const netGainLoss = num(row['P&L'] ?? row['Net P&L'] ?? row['Gain/Loss'] ?? row['Realized P&L'])

      const days = holdingDays(buyDate, sellDate)
      const gainType: 'STCG' | 'LTCG' = days > 365 ? 'LTCG' : 'STCG'

      deliveryTrades.push({
        scrip,
        buyDate: buyDate.toISOString().split('T')[0],
        sellDate: sellDate.toISOString().split('T')[0],
        quantity,
        buyPrice,
        sellPrice,
        netGainLoss,
        holdingDays: days,
        gainType,
      })
    }
  }

  const totalSTCG = deliveryTrades.filter(t => t.gainType === 'STCG' && t.netGainLoss > 0).reduce((s, t) => s + t.netGainLoss, 0)
  const totalLTCG = deliveryTrades.filter(t => t.gainType === 'LTCG' && t.netGainLoss > 0).reduce((s, t) => s + t.netGainLoss, 0)
  const totalSTCL = Math.abs(deliveryTrades.filter(t => t.gainType === 'STCG' && t.netGainLoss < 0).reduce((s, t) => s + t.netGainLoss, 0))
  const totalLTCL = Math.abs(deliveryTrades.filter(t => t.gainType === 'LTCG' && t.netGainLoss < 0).reduce((s, t) => s + t.netGainLoss, 0))

  // F&O detection
  const fnoSheet = workbook.SheetNames.find(s => {
    const l = s.toLowerCase()
    return l.includes('f&o') || l.includes('futures') || l.includes('options')
  })
  const hasFnO = !!fnoSheet && sheetToRows(workbook, fnoSheet).length > 0

  return {
    broker: 'groww',
    equityDelivery: { trades: deliveryTrades, totalSTCG, totalLTCG, totalSTCL, totalLTCL },
    equityIntraday: { turnover: intradayTurnover, netPnL: intradayNetPnL },
    dividends: {
      scrips: dividendRows,
      total: dividendRows.reduce((s, d) => s + d.amount, 0),
    },
    hasFnO,
    rawSheetNames: workbook.SheetNames,
  }
}

// ─── UPSTOX PARSER ────────────────────────────────────────────────────────────

/**
 * Upstox: "Tradebook" sheet with instrument_type column.
 * instrument_type values: EQ (delivery), INTRADAY, FO (F&O), etc.
 */
export function parseUpstox(workbook: XLSX.WorkBook): BrokerData {
  const sheetName =
    findSheet(workbook, 'Tradebook') ??
    findSheet(workbook, 'Trade Book') ??
    workbook.SheetNames[0]

  if (!sheetName) {
    return emptyBrokerData('upstox')
  }

  const rows = sheetToRows(workbook, sheetName)

  const deliveryTrades: EquityTrade[] = []
  let intradayTurnover = 0
  let intradayNetPnL = 0
  const dividendRows: { scrip: string; amount: number }[] = []
  let hasFnO = false

  for (const row of rows) {
    const instrType = str(
      row['instrument_type'] ?? row['Instrument Type'] ?? row['Type'] ?? row['Segment']
    ).toUpperCase()

    if (!instrType) continue

    // ── F&O detection ──
    if (instrType.includes('FO') || instrType.includes('FUT') || instrType.includes('OPT')) {
      hasFnO = true
      continue
    }

    // ── Intraday ──
    if (instrType.includes('INTRADAY') || instrType.includes('MIS') || instrType === 'I') {
      const pnl = num(row['net_pnl'] ?? row['Net P&L'] ?? row['P&L'] ?? row['realised_profit'])
      intradayTurnover += Math.abs(pnl)
      intradayNetPnL += pnl
      continue
    }

    // ── Delivery (EQ, CNC, D) ──
    if (instrType === 'EQ' || instrType === 'CNC' || instrType === 'D' || instrType.includes('DELIVERY')) {
      const scrip = str(row['tradingsymbol'] ?? row['Symbol'] ?? row['scrip'] ?? row['Scrip'])
      if (!scrip) continue

      const buyDate = parseDate(row['buy_date'] ?? row['Buy Date'] ?? row['trade_date'])
      const sellDate = parseDate(row['sell_date'] ?? row['Sell Date'])
      if (!buyDate || !sellDate) continue

      const quantity = num(row['quantity'] ?? row['Quantity'])
      const buyPrice = num(row['buy_price'] ?? row['Buy Price'] ?? row['buy_average'])
      const sellPrice = num(row['sell_price'] ?? row['Sell Price'] ?? row['sell_average'])
      const netGainLoss = num(row['net_pnl'] ?? row['Net P&L'] ?? row['realised_profit'] ?? row['P&L'])

      const days = holdingDays(buyDate, sellDate)
      const gainType: 'STCG' | 'LTCG' = days > 365 ? 'LTCG' : 'STCG'

      deliveryTrades.push({
        scrip,
        buyDate: buyDate.toISOString().split('T')[0],
        sellDate: sellDate.toISOString().split('T')[0],
        quantity,
        buyPrice,
        sellPrice,
        netGainLoss,
        holdingDays: days,
        gainType,
      })
    }
  }

  // Check for a dividend sheet separately
  const divSheet = findSheet(workbook, 'Dividends') ?? findSheet(workbook, 'Dividend')
  if (divSheet) {
    const divRows = sheetToRows(workbook, divSheet)
    for (const row of divRows) {
      const scrip = str(row['Symbol'] ?? row['Scrip'] ?? row['Company'])
      const amount = num(row['Amount'] ?? row['Net Amount'])
      if (scrip) dividendRows.push({ scrip, amount })
    }
  }

  const totalSTCG = deliveryTrades.filter(t => t.gainType === 'STCG' && t.netGainLoss > 0).reduce((s, t) => s + t.netGainLoss, 0)
  const totalLTCG = deliveryTrades.filter(t => t.gainType === 'LTCG' && t.netGainLoss > 0).reduce((s, t) => s + t.netGainLoss, 0)
  const totalSTCL = Math.abs(deliveryTrades.filter(t => t.gainType === 'STCG' && t.netGainLoss < 0).reduce((s, t) => s + t.netGainLoss, 0))
  const totalLTCL = Math.abs(deliveryTrades.filter(t => t.gainType === 'LTCG' && t.netGainLoss < 0).reduce((s, t) => s + t.netGainLoss, 0))

  // Check if intraday data was found — Upstox sometimes needs a separate file
  const intradaySheetFound = workbook.SheetNames.some(s => {
    const l = s.toLowerCase()
    return l.includes('intraday') || l.includes('mis')
  })

  return {
    broker: 'upstox',
    equityDelivery: { trades: deliveryTrades, totalSTCG, totalLTCG, totalSTCL, totalLTCL },
    equityIntraday: { turnover: intradayTurnover, netPnL: intradayNetPnL },
    dividends: {
      scrips: dividendRows,
      total: dividendRows.reduce((s, d) => s + d.amount, 0),
    },
    hasFnO,
    rawSheetNames: workbook.SheetNames,
    missingIntradaySheet: !intradaySheetFound && intradayTurnover === 0,
  } as any
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emptyBrokerData(broker: BrokerData['broker']): BrokerData {
  return {
    broker,
    equityDelivery: { trades: [], totalSTCG: 0, totalLTCG: 0, totalSTCL: 0, totalLTCL: 0 },
    equityIntraday: { turnover: 0, netPnL: 0 },
    dividends: { scrips: [], total: 0 },
    hasFnO: false,
    rawSheetNames: [],
  }
}
