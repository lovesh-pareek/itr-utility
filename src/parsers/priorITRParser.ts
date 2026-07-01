/**
 * Prior ITR XML Parser
 *
 * parsePriorITRXML(file) → CFLEntry[]
 *
 * Parses AY 2025-26 (or earlier) ITR-2 / ITR-3 XML filed return.
 * Extracts ScheduleCFL loss carry-forward entries.
 * Filters expired entries. Reduces yearsRemaining by 1 per year elapsed.
 *
 * Carry-forward year limits from tax-rules.json carryForward config:
 *   speculative loss → 4 years
 *   capital loss (STCL/LTCL) → 8 years
 *   HP loss → 8 years
 *   business loss → 8 years
 */

import type { CFLEntry } from '../types'
import taxRulesJson from '../../public/config/tax-rules.json'

// ─── Public entry point ───────────────────────────────────────────────────────

export async function parsePriorITRXML(file: File): Promise<CFLEntry[]> {
  if (!file.name.endsWith('.xml')) {
    throw new Error('Prior ITR file must be an XML file (.xml). Download from IT Portal → e-File → View Filed Returns.')
  }

  const text = await file.text()

  // Basic sanity check
  if (!text.includes('ITR') && !text.includes('ScheduleCFL') && !text.includes('AssessmentYear')) {
    throw new Error('This does not appear to be a valid ITR XML file.')
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(text, 'application/xml')

  const parseError = doc.querySelector('parsererror')
  if (parseError) {
    throw new Error('ITR XML is malformed and cannot be parsed. Please download a fresh copy from the IT portal.')
  }

  // Extract the assessment year from XML
  const priorAY = extractAY(doc)

  // Current AY is always 2026-27; prior filed AY drives yearsElapsed
  const currentAY = '2026-27'
  const yearsElapsed = computeYearsElapsed(priorAY, currentAY)

  // Extract CFL entries
  const entries = extractCFLEntries(doc, priorAY, yearsElapsed)

  // Filter expired entries
  const valid = entries.filter(e => e.yearsRemaining > 0)

  return valid
}

// ─── AY extraction ────────────────────────────────────────────────────────────

function extractAY(doc: Document): string {
  // Try common ITR XML AY node names
  const candidates = [
    'AssessmentYear',
    'AY',
    'AssYr',
    'FormName > AssessmentYear',
  ]

  for (const sel of candidates) {
    const node = doc.querySelector(sel)
    if (node?.textContent) {
      const text = node.textContent.trim()
      // Normalise: "202526" → "2025-26", "2025-26" stays
      const match = text.match(/(\d{4})[- ]?(\d{2})/)
      if (match) return `${match[1]}-${match[2]}`
    }
  }

  // Fallback: look in XML header attributes
  const root = doc.documentElement
  const ayAttr = root.getAttribute('assessmentYear') ?? root.getAttribute('AssessmentYear')
  if (ayAttr) {
    const match = ayAttr.match(/(\d{4})[- ]?(\d{2})/)
    if (match) return `${match[1]}-${match[2]}`
  }

  // Default to prior year
  return '2025-26'
}

/** Compute how many years have elapsed between filed AY and current AY. */
function computeYearsElapsed(filedAY: string, currentAY: string): number {
  const filedYear = parseInt(filedAY.split('-')[0], 10)
  const currentYear = parseInt(currentAY.split('-')[0], 10)
  return Math.max(0, currentYear - filedYear)
}

// ─── CFL extraction ───────────────────────────────────────────────────────────

const carryForwardConfig = (taxRulesJson as any).rules['2026-27'].carryForward as {
  speculativeLoss: number
  capitalLoss: number
  hpLoss: number
  businessLoss: number
}

function extractCFLEntries(doc: Document, priorAY: string, yearsElapsed: number): CFLEntry[] {
  const entries: CFLEntry[] = []

  // ITR XML uses various ScheduleCFL node structures across form versions.
  // Try both ITR-3 and ITR-2 CFL node patterns.

  // ── Speculative loss (intraday) ─────────────────────────────────────────
  const specNodes = queryAll(doc, [
    'ScheduleCFL SpeculativeLoss',
    'ScheduleCFL IntraDay',
    'LossCFSpecBus',
    'CFSpecBus',
  ])
  for (const node of specNodes) {
    const amount = numContent(node)
    if (amount > 0) {
      const maxYears = carryForwardConfig.speculativeLoss
      const remaining = maxYears - yearsElapsed
      entries.push({
        id: `cfl-spec-${priorAY}`,
        lossType: 'speculative',
        ayOfOrigin: priorAY,
        amount,
        yearsRemaining: remaining,
        source: 'prior_itr',
      })
    }
  }

  // ── Short-term capital loss ──────────────────────────────────────────────
  const stclNodes = queryAll(doc, [
    'ScheduleCFL STCL',
    'ScheduleCFL ShortTermLoss',
    'LossCFSTC',
    'CFShorTermCapLoss',
    'LossesCF > ShortTerm',
  ])
  for (const node of stclNodes) {
    const amount = numContent(node)
    if (amount > 0) {
      const maxYears = carryForwardConfig.capitalLoss
      const remaining = maxYears - yearsElapsed
      entries.push({
        id: `cfl-stcl-${priorAY}`,
        lossType: 'stcl',
        ayOfOrigin: priorAY,
        amount,
        yearsRemaining: remaining,
        source: 'prior_itr',
      })
    }
  }

  // ── Long-term capital loss ───────────────────────────────────────────────
  const ltclNodes = queryAll(doc, [
    'ScheduleCFL LTCL',
    'ScheduleCFL LongTermLoss',
    'LossCFLTC',
    'CFLongTermCapLoss',
    'LossesCF > LongTerm',
  ])
  for (const node of ltclNodes) {
    const amount = numContent(node)
    if (amount > 0) {
      const maxYears = carryForwardConfig.capitalLoss
      const remaining = maxYears - yearsElapsed
      entries.push({
        id: `cfl-ltcl-${priorAY}`,
        lossType: 'ltcl',
        ayOfOrigin: priorAY,
        amount,
        yearsRemaining: remaining,
        source: 'prior_itr',
      })
    }
  }

  // ── House property loss ─────────────────────────────────────────────────
  const hpNodes = queryAll(doc, [
    'ScheduleCFL HPLoss',
    'ScheduleCFL HousePropLoss',
    'LossCFHP',
    'CFHousePropLoss',
    'LossesCF > HouseProperty',
  ])
  for (const node of hpNodes) {
    const amount = numContent(node)
    if (amount > 0) {
      const maxYears = carryForwardConfig.hpLoss
      const remaining = maxYears - yearsElapsed
      entries.push({
        id: `cfl-hp-${priorAY}`,
        lossType: 'hp',
        ayOfOrigin: priorAY,
        amount,
        yearsRemaining: remaining,
        source: 'prior_itr',
      })
    }
  }

  // ── Non-speculative business loss ───────────────────────────────────────
  const busNodes = queryAll(doc, [
    'ScheduleCFL BusinessLoss',
    'ScheduleCFL NonSpecBusLoss',
    'LossCFBusiness',
    'CFOthBusLoss',
    'LossesCF > Business',
  ])
  for (const node of busNodes) {
    const amount = numContent(node)
    if (amount > 0) {
      const maxYears = carryForwardConfig.businessLoss
      const remaining = maxYears - yearsElapsed
      entries.push({
        id: `cfl-bus-${priorAY}`,
        lossType: 'business',
        ayOfOrigin: priorAY,
        amount,
        yearsRemaining: remaining,
        source: 'prior_itr',
      })
    }
  }

  // Deduplicate by id (in case multiple selectors matched same node)
  const seen = new Set<string>()
  return entries.filter(e => {
    if (seen.has(e.id)) return false
    seen.add(e.id)
    return true
  })
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Try multiple CSS selectors, return first set of matching nodes. */
function queryAll(doc: Document, selectors: string[]): Element[] {
  for (const sel of selectors) {
    try {
      const nodes = Array.from(doc.querySelectorAll(sel))
      if (nodes.length > 0) return nodes
    } catch {
      // Invalid selector — skip
    }
  }
  return []
}

/** Parse numeric text content from an XML element. */
function numContent(node: Element): number {
  const text = node.textContent?.trim() ?? ''
  const n = parseFloat(text.replace(/,/g, ''))
  return isNaN(n) ? 0 : Math.abs(n)  // losses are stored as positive amounts
}
