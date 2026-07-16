/**
 * Prior ITR Parser — JSON + XML
 *
 * parsePriorITR(file) → CFLEntry[]
 *
 * Supports both formats downloaded from IT Portal → e-File → View Filed Returns:
 *   .json — new default format (IT Portal 2024+ → "Download JSON")
 *   .xml  — legacy format (still available via "Download XML")
 *
 * Extracts ScheduleCFL loss carry-forward entries.
 * Filters expired entries. Reduces yearsRemaining by 1 per year elapsed.
 *
 * JSON structure (IT Portal format):
 *   ITR → ITR3 (or ITR2/ITR1/ITR4) → ScheduleCFL → (various loss fields)
 *   OR at root: { "ScheduleCFL": { ... } }
 *
 * Carry-forward year limits from tax-rules.json:
 *   speculative loss → 4 years
 *   capital loss (STCL/LTCL) → 8 years
 *   HP loss → 8 years
 *   business loss → 8 years
 */

import type { CFLEntry } from '../types'
import taxRulesJson from '../../public/config/tax-rules.json'

const carryForwardConfig = (taxRulesJson as any).rules['2026-27'].carryForward as {
  speculativeLoss: number
  capitalLoss: number
  hpLoss: number
  businessLoss: number
}

// ─── Public entry point ───────────────────────────────────────────────────────

/**
 * Parse a prior year ITR file (.json or .xml) and return carry-forward entries.
 * Keeps the old function name as an alias for backward compat.
 */
export async function parsePriorITR(file: File): Promise<CFLEntry[]> {
  const ext = file.name.split('.').pop()?.toLowerCase()

  if (ext === 'json') {
    return parsePriorITRJSON(file)
  } else if (ext === 'xml') {
    return parsePriorITRXML_internal(file)
  } else {
    throw new Error(
      `Unsupported format: .${ext}. Upload the ITR JSON (IT Portal → e-File → View Filed Returns → Download JSON) or the XML version.`
    )
  }
}

/** Backward-compatible alias — routes through parsePriorITR so both .json and .xml are handled */
export async function parsePriorITRXML(file: File): Promise<CFLEntry[]> {
  // If it's an XML file, use the XML internal parser directly
  // For any other extension (including .json), route through the main dispatcher
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'xml') return parsePriorITRXML_internal(file)
  return parsePriorITR(file)
}

// ─── JSON Parser ──────────────────────────────────────────────────────────────

async function parsePriorITRJSON(file: File): Promise<CFLEntry[]> {
  const text = await file.text()
  let raw: any

  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('ITR JSON file is malformed. Download a fresh copy from IT Portal → e-File → View Filed Returns.')
  }

  // Extract assessment year
  const priorAY = extractAYFromJSON(raw)
  const yearsElapsed = computeYearsElapsed(priorAY, '2026-27')

  // Navigate to ScheduleCFL — IT Portal wraps in ITR → ITR3/ITR2/ITR1 → ScheduleCFL
  const cfl = findScheduleCFL(raw)

  if (!cfl) {
    // No CFL schedule found — could be ITR-1 (no losses) or unexpected structure
    return []
  }

  return extractCFLFromJSON(cfl, priorAY, yearsElapsed)
}

function extractAYFromJSON(raw: any): string {
  // Try common paths for IT Portal JSON format
  const candidates = [
    raw?.ITR?.ITR3?.PersonalInfo?.AssessmentYear,
    raw?.ITR?.ITR2?.PersonalInfo?.AssessmentYear,
    raw?.ITR?.ITR4?.PersonalInfo?.AssessmentYear,
    raw?.ITR?.ITR1?.PersonalInfo?.AssessmentYear,
    raw?.ITR?.ITR3?.Form_ITR3?.AssessmentYear,
    raw?.ITR?.ITR2?.Form_ITR2?.AssessmentYear,
    raw?.ITR?.ITR4?.Form_ITR4?.AssessmentYear,
    raw?.ITR?.ITR1?.Form_ITR1?.AssessmentYear,
    raw?.PersonalInfo?.AssessmentYear,
    raw?.AssessmentYear,
    raw?.assessmentYear,
    raw?.ITR?.ITR3?.['@AssessmentYear'],
    raw?.['@AssessmentYear'],
  ]

  for (const c of candidates) {
    if (c === undefined || c === null) continue
    const s = String(c).trim()

    // Format: "2024-25" or "2024-2025"
    const matchDash = s.match(/(\d{4})[- ](\d{2,4})/)
    if (matchDash) return `${matchDash[1]}-${matchDash[2].slice(-2)}`

    // Format: just a year like "2025" — IT Portal uses AY start year
    const matchYear = s.match(/^(\d{4})$/)
    if (matchYear) {
      const yr = parseInt(matchYear[1])
      return `${yr}-${String(yr + 1).slice(-2)}`
    }
  }

  return '2025-26'  // default: assume prior year is 2025-26
}

function findScheduleCFL(raw: any): any {
  // IT Portal JSON structure (multiple possible paths across ITR forms):
  const paths = [
    raw?.ITR?.ITR3?.ScheduleCFL,
    raw?.ITR?.ITR2?.ScheduleCFL,
    raw?.ITR?.ITR4?.ScheduleCFL,
    raw?.ITR?.ITR1?.ScheduleCFL,
    raw?.ScheduleCFL,
    raw?.scheduleCFL,
    // Flat structure
    raw?.ITR3?.ScheduleCFL,
    raw?.ITR2?.ScheduleCFL,
  ]

  for (const p of paths) {
    if (p && typeof p === 'object') return p
  }

  // Deep search: walk the object tree looking for ScheduleCFL key
  return deepFind(raw, 'ScheduleCFL') ?? deepFind(raw, 'scheduleCFL')
}

function deepFind(obj: any, key: string, depth = 0): any {
  if (!obj || typeof obj !== 'object' || depth > 6) return null
  if (obj[key]) return obj[key]
  for (const k of Object.keys(obj)) {
    const found = deepFind(obj[k], key, depth + 1)
    if (found) return found
  }
  return null
}

function extractCFLFromJSON(cfl: any, priorAY: string, yearsElapsed: number): CFLEntry[] {
  const entries: CFLEntry[] = []

  // IT Portal JSON nests losses under TotalLossCFSummary.LossSummaryDetail
  // or CurrentAYloss.LossSummaryDetail. Flatten these into the search scope.
  const searchTargets = [
    cfl,
    cfl?.TotalLossCFSummary?.LossSummaryDetail,
    cfl?.TotalLossCFSummary,
    cfl?.CurrentAYloss?.LossSummaryDetail,
    cfl?.CurrentAYloss,
    cfl?.LossSummaryDetail,
  ].filter(Boolean)

  // ── Speculative (Intraday) Loss ─────────────────────────────────────────────
  const specLoss = numFieldMulti(searchTargets, [
    'LossFrmSpecBusCF', 'LossCFSpecBus', 'SpeculativeLoss', 'IntraDayLoss',
    'LossFrmSpecBus', 'TotLossCFSpecBus', 'SpeculativeBusinessLoss',
  ])
  if (specLoss > 0) {
    const remaining = carryForwardConfig.speculativeLoss - yearsElapsed
    entries.push({
      id: `cfl-spec-${priorAY}`,
      lossType: 'speculative',
      ayOfOrigin: priorAY,
      amount: specLoss,
      yearsRemaining: remaining,
      source: 'prior_itr',
    })
  }

  // ── Short-term Capital Loss ─────────────────────────────────────────────────
  const stcl = numFieldMulti(searchTargets, [
    'TotalSTCGPTILossCF', 'LossCFSTC', 'ShortTermCapLoss', 'STCL',
    'ShortTermLoss', 'TotLossCFSTC', 'LossFrmSTC',
  ])
  if (stcl > 0) {
    const remaining = carryForwardConfig.capitalLoss - yearsElapsed
    entries.push({
      id: `cfl-stcl-${priorAY}`,
      lossType: 'stcl',
      ayOfOrigin: priorAY,
      amount: stcl,
      yearsRemaining: remaining,
      source: 'prior_itr',
    })
  }

  // ── Long-term Capital Loss ──────────────────────────────────────────────────
  const ltcl = numFieldMulti(searchTargets, [
    'TotalLTCGPTILossCF', 'LossCFLTC', 'LongTermCapLoss', 'LTCL',
    'LongTermLoss', 'TotLossCFLTC', 'LossFrmLTC',
  ])
  if (ltcl > 0) {
    const remaining = carryForwardConfig.capitalLoss - yearsElapsed
    entries.push({
      id: `cfl-ltcl-${priorAY}`,
      lossType: 'ltcl',
      ayOfOrigin: priorAY,
      amount: ltcl,
      yearsRemaining: remaining,
      source: 'prior_itr',
    })
  }

  // ── House Property Loss ─────────────────────────────────────────────────────
  const hpLoss = numFieldMulti(searchTargets, [
    'TotalHPPTILossCF', 'LossCFHP', 'HPLoss', 'HousePropLoss',
    'LossFrmHP', 'TotLossCFHP', 'HousePropertyLoss',
  ])
  if (hpLoss > 0) {
    const remaining = carryForwardConfig.hpLoss - yearsElapsed
    entries.push({
      id: `cfl-hp-${priorAY}`,
      lossType: 'hp',
      ayOfOrigin: priorAY,
      amount: hpLoss,
      yearsRemaining: remaining,
      source: 'prior_itr',
    })
  }

  // ── Non-speculative Business Loss ───────────────────────────────────────────
  const busLoss = numFieldMulti(searchTargets, [
    'BusLossOthThanSpecLossCF', 'LossCFBusiness', 'BusinessLoss',
    'NonSpecBusLoss', 'OthBusLoss', 'TotLossCFBusiness', 'LossFrmOthBus',
  ])
  if (busLoss > 0) {
    const remaining = carryForwardConfig.businessLoss - yearsElapsed
    entries.push({
      id: `cfl-bus-${priorAY}`,
      lossType: 'business',
      ayOfOrigin: priorAY,
      amount: busLoss,
      yearsRemaining: remaining,
      source: 'prior_itr',
    })
  }

  // Filter expired entries (yearsRemaining ≤ 0)
  return entries.filter(e => e.yearsRemaining > 0)
}

// ─── XML Parser (legacy — unchanged logic, updated to call shared helpers) ────

async function parsePriorITRXML_internal(file: File): Promise<CFLEntry[]> {
  const text = await file.text()

  if (!text.includes('ITR') && !text.includes('ScheduleCFL') && !text.includes('AssessmentYear')) {
    throw new Error('This does not appear to be a valid ITR XML file.')
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(text, 'application/xml')

  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    throw new Error('ITR XML is malformed. Please download a fresh copy from the IT portal.')
  }

  const priorAY = extractAYFromXML(doc)
  const yearsElapsed = computeYearsElapsed(priorAY, '2026-27')
  const entries = extractCFLFromXML(doc, priorAY, yearsElapsed)

  return entries.filter(e => e.yearsRemaining > 0)
}

function extractAYFromXML(doc: Document): string {
  const candidates = ['AssessmentYear', 'AY', 'AssYr']
  for (const sel of candidates) {
    const node = doc.querySelector(sel)
    if (node?.textContent) {
      const match = node.textContent.trim().match(/(\d{4})[- ]?(\d{2})/)
      if (match) return `${match[1]}-${match[2]}`
    }
  }
  const ayAttr = doc.documentElement.getAttribute('assessmentYear')
    ?? doc.documentElement.getAttribute('AssessmentYear')
  if (ayAttr) {
    const match = ayAttr.match(/(\d{4})[- ]?(\d{2})/)
    if (match) return `${match[1]}-${match[2]}`
  }
  return '2025-26'
}

function extractCFLFromXML(doc: Document, priorAY: string, yearsElapsed: number): CFLEntry[] {
  const entries: CFLEntry[] = []

  const lossMap: Array<{
    selectors: string[]
    lossType: CFLEntry['lossType']
    maxYears: number
    id: string
  }> = [
    {
      selectors: ['ScheduleCFL SpeculativeLoss', 'ScheduleCFL IntraDay', 'LossCFSpecBus', 'CFSpecBus'],
      lossType: 'speculative',
      maxYears: carryForwardConfig.speculativeLoss,
      id: `cfl-spec-${priorAY}`,
    },
    {
      selectors: ['ScheduleCFL STCL', 'ScheduleCFL ShortTermLoss', 'LossCFSTC', 'CFShorTermCapLoss'],
      lossType: 'stcl',
      maxYears: carryForwardConfig.capitalLoss,
      id: `cfl-stcl-${priorAY}`,
    },
    {
      selectors: ['ScheduleCFL LTCL', 'ScheduleCFL LongTermLoss', 'LossCFLTC', 'CFLongTermCapLoss'],
      lossType: 'ltcl',
      maxYears: carryForwardConfig.capitalLoss,
      id: `cfl-ltcl-${priorAY}`,
    },
    {
      selectors: ['ScheduleCFL HPLoss', 'ScheduleCFL HousePropLoss', 'LossCFHP', 'CFHousePropLoss'],
      lossType: 'hp',
      maxYears: carryForwardConfig.hpLoss,
      id: `cfl-hp-${priorAY}`,
    },
    {
      selectors: ['ScheduleCFL BusinessLoss', 'ScheduleCFL NonSpecBusLoss', 'LossCFBusiness', 'CFOthBusLoss'],
      lossType: 'business',
      maxYears: carryForwardConfig.businessLoss,
      id: `cfl-bus-${priorAY}`,
    },
  ]

  for (const { selectors, lossType, maxYears, id } of lossMap) {
    for (const sel of selectors) {
      try {
        const nodes = Array.from(doc.querySelectorAll(sel))
        for (const node of nodes) {
          const amount = numContent(node)
          if (amount > 0) {
            entries.push({
              id,
              lossType,
              ayOfOrigin: priorAY,
              amount,
              yearsRemaining: maxYears - yearsElapsed,
              source: 'prior_itr',
            })
            break
          }
        }
        if (entries.find(e => e.id === id)) break
      } catch {
        // invalid selector — skip
      }
    }
  }

  return entries
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function computeYearsElapsed(filedAY: string, currentAY: string): number {
  const filedYear = parseInt(filedAY.split('-')[0], 10)
  const currentYear = parseInt(currentAY.split('-')[0], 10)
  return Math.max(0, currentYear - filedYear)
}

/** Try multiple field name candidates and return the first non-zero value */
function numField(obj: any, candidates: string[]): number {
  for (const key of candidates) {
    const val = obj[key]
    if (val !== undefined && val !== null) {
      const n = parseFloat(String(val).replace(/,/g, ''))
      if (!isNaN(n) && n > 0) return n
    }
  }
  return 0
}

/** Search across multiple objects for field name candidates */
function numFieldMulti(targets: any[], candidates: string[]): number {
  for (const obj of targets) {
    const val = numField(obj, candidates)
    if (val > 0) return val
  }
  return 0
}

function numContent(node: Element): number {
  const text = node.textContent?.trim() ?? ''
  const n = parseFloat(text.replace(/,/g, ''))
  return isNaN(n) ? 0 : Math.abs(n)
}


