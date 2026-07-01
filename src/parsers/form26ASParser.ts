/**
 * Form 26AS Parser
 *
 * parseForm26AS(file) → Form26ASData
 *
 * Supports:
 *   - Excel (.xlsx) downloaded from TRACES
 *   - PDF (text-based) downloaded from TRACES
 *
 * Extracts:
 *   Part A  — TDS deducted by each deductor → TDSEntry[]
 *   Part C  — Advance tax / self-assessment paid → ChallanEntry[]
 */

import * as XLSX from 'xlsx'
import type { Form26ASData, TDSEntry, ChallanEntry } from '../types'

// ─── Public entry point ───────────────────────────────────────────────────────

export async function parseForm26AS(file: File): Promise<Form26ASData> {
  const ext = file.name.split('.').pop()?.toLowerCase()

  if (ext === 'xlsx' || ext === 'xls') {
    return parseExcel26AS(file)
  } else if (ext === 'pdf') {
    return parsePDF26AS(file)
  } else {
    throw new Error(`Unsupported Form 26AS format: .${ext}. Upload .xlsx or .pdf from TRACES.`)
  }
}

// ─── Excel parser ─────────────────────────────────────────────────────────────

async function parseExcel26AS(file: File): Promise<Form26ASData> {
  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array' })

  // Detect AY from sheet name or cell content
  let ay = '2026-27'

  const partA: TDSEntry[] = []
  const partC: ChallanEntry[] = []

  // Scan all sheets for Part A and Part C tables
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName]
    const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as string[][]

    // Look for AY in first 10 rows
    for (const row of rows.slice(0, 10)) {
      const rowStr = row.join(' ')
      const ayMatch = rowStr.match(/20\d\d-\d\d/)
      if (ayMatch) { ay = ayMatch[0]; break }
    }

    // Detect Part A section
    const partAStartIdx = findSectionRow(rows, ['Part A', 'TDS', 'Deductor'])
    if (partAStartIdx >= 0) {
      const entries = extractPartA(rows, partAStartIdx)
      partA.push(...entries)
    }

    // Detect Part C section
    const partCStartIdx = findSectionRow(rows, ['Part C', 'Advance Tax', 'Self Assessment'])
    if (partCStartIdx >= 0) {
      const entries = extractPartC(rows, partCStartIdx, ay)
      partC.push(...entries)
    }
  }

  return { partA, partC, ay }
}

/** Find the row index containing all given keywords (case-insensitive) */
function findSectionRow(rows: string[][], keywords: string[]): number {
  for (let i = 0; i < rows.length; i++) {
    const rowStr = rows[i].join(' ').toLowerCase()
    if (keywords.some(k => rowStr.includes(k.toLowerCase()))) {
      return i
    }
  }
  return -1
}

/** Extract TDS entries from Part A rows */
function extractPartA(rows: string[][], startIdx: number): TDSEntry[] {
  const entries: TDSEntry[] = []

  // Find header row: contains TAN / Deductor Name / Amount / TDS
  let headerIdx = -1
  for (let i = startIdx; i < Math.min(startIdx + 10, rows.length); i++) {
    const rowStr = rows[i].join(' ').toLowerCase()
    if (rowStr.includes('tan') && (rowStr.includes('amount') || rowStr.includes('tds'))) {
      headerIdx = i
      break
    }
  }
  if (headerIdx < 0) return entries

  const headers = rows[headerIdx].map(h => h.toString().toLowerCase().trim())
  const colTAN = findCol(headers, ['tan', 'tan of deductor'])
  const colName = findCol(headers, ['name of deductor', 'deductor name', 'name'])
  const colGross = findCol(headers, ['gross amount', 'amount paid', 'amount credited'])
  const colTDS = findCol(headers, ['tds deposited', 'tax deducted', 'tds amount', 'tds'])
  const colSection = findCol(headers, ['section', 'section code'])

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.every(c => !c)) break  // blank row = end of section

    const tan = str(row[colTAN])
    const name = str(row[colName])
    const gross = num(row[colGross])
    const tds = num(row[colTDS])
    const section = str(row[colSection]) || '192'

    if (!tan && !name) break  // truly empty row
    if (tds === 0 && gross === 0) continue  // skip zero rows

    entries.push({
      id: `26as-a-${i}`,
      tanDeductor: tan,
      deductorName: name,
      grossAmount: gross,
      tdsAmount: tds,
      section,
      source: 'form26AS',
    })
  }

  return entries
}

/** Extract advance tax / self-assessment challans from Part C rows */
function extractPartC(rows: string[][], startIdx: number, ay: string): ChallanEntry[] {
  const entries: ChallanEntry[] = []

  let headerIdx = -1
  for (let i = startIdx; i < Math.min(startIdx + 10, rows.length); i++) {
    const rowStr = rows[i].join(' ').toLowerCase()
    if (rowStr.includes('bsr') || rowStr.includes('challan') || rowStr.includes('date of deposit')) {
      headerIdx = i
      break
    }
  }
  if (headerIdx < 0) return entries

  const headers = rows[headerIdx].map(h => h.toString().toLowerCase().trim())
  const colBSR = findCol(headers, ['bsr code', 'bsr'])
  const colDate = findCol(headers, ['date of deposit', 'challan date', 'date'])
  const colSerial = findCol(headers, ['challan serial no', 'serial no', 'serial'])
  const colAmount = findCol(headers, ['amount', 'tax deposited'])
  const colType = findCol(headers, ['minor head', 'type', 'nature'])

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row.every(c => !c)) break

    const bsr = str(row[colBSR])
    const date = parseDate(str(row[colDate]))
    const serial = str(row[colSerial])
    const amount = num(row[colAmount])
    const typeStr = str(row[colType]).toLowerCase()

    if (!bsr && amount === 0) continue

    // Minor head 300 = self-assessment, 100/400 = advance tax
    const type: ChallanEntry['type'] =
      typeStr.includes('self') || typeStr.includes('300')
        ? 'self_assessment'
        : 'advance_tax'

    entries.push({
      id: `26as-c-${i}`,
      bsrCode: bsr,
      challanDate: date,
      serialNumber: serial,
      amount,
      assessmentYear: ay,
      type,
    })
  }

  return entries
}

// ─── PDF parser ───────────────────────────────────────────────────────────────

async function parsePDF26AS(file: File): Promise<Form26ASData> {
  // Dynamically import PDF.js (same pattern as existing form16Parser)
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js'

  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise

  let fullText = ''
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const content = await page.getTextContent()
    fullText += content.items.map((i: any) => i.str).join(' ') + '\n'
  }

  if (!fullText.toLowerCase().includes('26as') && !fullText.toLowerCase().includes('tax credit')) {
    throw new Error('This does not appear to be a Form 26AS PDF. Please upload the correct file.')
  }

  return parsePDFText26AS(fullText)
}

function parsePDFText26AS(text: string): Form26ASData {
  const partA: TDSEntry[] = []
  const partC: ChallanEntry[] = []

  // Extract AY
  const ayMatch = text.match(/Assessment Year\s*[:\-]?\s*(20\d\d-\d\d)/i)
  const ay = ayMatch?.[1] ?? '2026-27'

  // Part A: match TAN + deductor name + amounts pattern
  // Pattern: TAN(XXXX99999X) followed by name, gross amount, TDS amount
  const tanPattern = /([A-Z]{4}\d{5}[A-Z])\s+([A-Za-z &.,\-]+?)\s+([\d,]+(?:\.\d+)?)\s+([\d,]+(?:\.\d+)?)\s*(\d{3}[A-Z]?)?/g
  let m: RegExpExecArray | null
  let idx = 0
  while ((m = tanPattern.exec(text)) !== null) {
    const gross = parseFloat(m[3].replace(/,/g, ''))
    const tds = parseFloat(m[4].replace(/,/g, ''))
    if (gross > 0 || tds > 0) {
      partA.push({
        id: `26as-pdf-a-${idx++}`,
        tanDeductor: m[1],
        deductorName: m[2].trim(),
        grossAmount: gross,
        tdsAmount: tds,
        section: m[5] ?? '192',
        source: 'form26AS',
      })
    }
  }

  // Part C: match BSR code + date + amount
  const challanPattern = /(\d{7})\s+(\d{2}[\/\-]\d{2}[\/\-]\d{4}|\d{4}[\/\-]\d{2}[\/\-]\d{2})\s+(\d{5})\s+([\d,]+(?:\.\d+)?)\s*(\d{3})?/g
  let cidx = 0
  while ((m = challanPattern.exec(text)) !== null) {
    const amount = parseFloat(m[4].replace(/,/g, ''))
    if (amount > 0) {
      const typeCode = m[5] ?? '100'
      partC.push({
        id: `26as-pdf-c-${cidx++}`,
        bsrCode: m[1],
        challanDate: parseDate(m[2]),
        serialNumber: m[3],
        amount,
        assessmentYear: ay,
        type: typeCode === '300' ? 'self_assessment' : 'advance_tax',
      })
    }
  }

  return { partA, partC, ay }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findCol(headers: string[], candidates: string[]): number {
  for (const c of candidates) {
    const idx = headers.findIndex(h => h.includes(c.toLowerCase()))
    if (idx >= 0) return idx
  }
  return -1
}

function str(val: unknown): string {
  if (val === null || val === undefined) return ''
  return String(val).trim()
}

function num(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0
  const n = parseFloat(String(val).replace(/,/g, '').trim())
  return isNaN(n) ? 0 : n
}

function parseDate(raw: string): string {
  if (!raw) return ''
  // DD/MM/YYYY → YYYY-MM-DD
  const dmy = raw.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/)
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  return raw
}
