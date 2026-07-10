/**
 * Form 16 Field Extractor v2
 *
 * Handles both TRACES-format (table layout) and employer-format (colon-separated).
 *
 * TRACES Form 16 (most common — from incometax.gov.in/TRACES):
 *   - Part A: quarterly TDS summary table
 *   - Part B (Annexure I): salary breakdown in numbered rows
 *   - Labels and values appear on separate lines in a fixed row structure
 *   - "Salary as per provisions contained in section 17(1)" → value on same or next line
 *
 * Root causes of previous bugs:
 *   1. grossSalary = 0  : "salary as per provisions..." is a long phrase; regex missed it
 *   2. standardDeduction = -75000 : "75000.00" was preceded by "deductions" label
 *      which the code sometimes parsed as a negative monetary value
 *   3. tdsDeducted = 0  : TDS total is in Part A quarterly table, not a label:value pair
 */

import type { Form16Data } from '../types'

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ExtractedField {
  field: string
  rawLabel: string
  rawValue: string
  parsedValue: number | string
}

export interface Form16ExtractionResult {
  fields: ExtractedField[]
  unresolved: string[]
}

// ─── Money parser ─────────────────────────────────────────────────────────────

function parseMoney(raw: string): number {
  const cleaned = raw.replace(/[₹,\s]/g, '').trim()
  const n = parseFloat(cleaned)
  return isNaN(n) ? 0 : Math.abs(n)   // always positive — fields are inherently positive
}

// ─── Primary extraction approach: TRACES structured regex patterns ─────────────

/**
 * Extract key fields using direct regex patterns against the full PDF text.
 * This handles TRACES Form 16 where values appear in specific structural positions.
 */
function extractViaTracesPatterns(text: string): Partial<Record<keyof Form16Data, number | string>> {
  const result: Partial<Record<keyof Form16Data, number | string>> = {}

  // ── Assessment Year ────────────────────────────────────────────────────────
  const ayMatch = text.match(/Assessment\s+Year[\s\S]{0,30}?(20\d\d-\d\d)/i)
    ?? text.match(/\b(202[456]-2[5-7])\b/)
  if (ayMatch) result.assessmentYear = ayMatch[1]

  // ── PAN of Employee ────────────────────────────────────────────────────────
  // TRACES puts "PAN of the Employee" then the PAN value; skip employer PAN
  const panSection = text.match(/PAN\s+of\s+(?:the\s+)?[Ee]mployee[^A-Z]*([A-Z]{5}\d{4}[A-Z])/i)
    ?? text.match(/PAN\s+of\s+[Ee]mployee[^A-Z]*([A-Z]{5}\d{4}[A-Z])/i)
  if (panSection) {
    result.pan = panSection[1]
  } else {
    // Fallback: find the second PAN (first is employer's, second is employee's)
    const allPANs = [...text.matchAll(/\b([A-Z]{5}\d{4}[A-Z])\b/g)].map(m => m[1])
    const unique = [...new Set(allPANs)]
    if (unique.length >= 2) result.pan = unique[1]
    else if (unique.length === 1) result.pan = unique[0]
  }

  // ── TAN of Employer ────────────────────────────────────────────────────────
  const tanSection = text.match(/TAN\s+of\s+(?:the\s+)?(?:[Ee]mployer|[Dd]eductor)[^A-Z]*([A-Z]{4}\d{5}[A-Z])/i)
  if (tanSection) result.tanEmployer = tanSection[1]

  // ── Employer name ──────────────────────────────────────────────────────────
  // First substantial block of text after "Name and address of the Employer"
  const empNameMatch = text.match(
    /Name\s+and\s+address\s+of\s+the\s+Employer[^a-z\n]{0,10}\n([A-Z][^\n]{5,100})/i
  )
  if (empNameMatch) result.employerName = empNameMatch[1].trim()

  // ── Gross Salary — Section 17(1) ─────────────────────────────────────────
  // TRACES Part B line 1(a): "Salary as per provisions contained in section 17(1)" VALUE
  // The value appears as a standalone number on the same or next line
  const grossPatterns = [
    /17\(1\)[^\d]*([\d,]+\.?\d*)/i,
    /Salary\s+as\s+per\s+provisions[^\d]*([\d,]+\.?\d*)/i,
    /(?:Gross\s+Salary|Total\s+Salary)\s*[\n:]\s*([\d,]+\.?\d*)/i,
    /Amount\s+paid\/credited.*?Total.*?([\d,]+\.?\d*)\s*\n/is,
  ]
  for (const pat of grossPatterns) {
    const m = text.match(pat)
    if (m) {
      const v = parseMoney(m[1])
      if (v > 10_000) { result.grossSalary = v; break }
    }
  }

  // Fallback: Part A total "Amount paid/credited" row
  if (!result.grossSalary) {
    const partATotal = text.match(/Total\s+\(Rs\.\)[^\d]*([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)/i)
    if (partATotal) {
      const v = parseMoney(partATotal[1])
      if (v > 10_000) result.grossSalary = v
    }
  }

  // ── Standard Deduction ─────────────────────────────────────────────────────
  // TRACES Part B line 4(a): "Standard deduction under section 16(ia)  75000.00"
  const stdDeductMatch = text.match(
    /[Ss]tandard\s+deduction\s+under\s+section\s+16[^\d]*([\d,]+\.?\d*)/i
  ) ?? text.match(/[Ss]tandard\s+deduction[^\d]*([\d]+\.?\d*)/i)
  if (stdDeductMatch) {
    const v = parseMoney(stdDeductMatch[1])
    if (v > 0 && v <= 100_000) result.standardDeduction = v
  }
  if (!result.standardDeduction) result.standardDeduction = 75_000  // statutory default AY 2026-27

  // ── Professional Tax ───────────────────────────────────────────────────────
  const profTaxMatch = text.match(
    /[Tt]ax\s+on\s+employment\s+under\s+section\s+16[^\d]*([\d,]+\.?\d*)/i
  ) ?? text.match(/[Pp]rofessional\s+[Tt]ax[^\d]*([\d,]+\.?\d*)/i)
  if (profTaxMatch) {
    const v = parseMoney(profTaxMatch[1])
    if (v < 10_000) result.professionalTax = v  // sanity: prof tax ≤ ₹2,500/month
  }

  // ── Net Taxable Salary ────────────────────────────────────────────────────
  // TRACES Part B line 6: "Income chargeable under the head Salaries"
  const netSalaryPatterns = [
    /[Ii]ncome\s+chargeable\s+under\s+the\s+head\s+["\u201c]?[Ss]alar[^\d]*([\d,]+\.?\d*)/i,
    /[Ii]ncome\s+from\s+[Ss]alar[^\d]*([\d,]+\.?\d*)/i,
    /[Nn]et\s+[Tt]axable\s+[Ss]alar[^\d]*([\d,]+\.?\d*)/i,
  ]
  for (const pat of netSalaryPatterns) {
    const m = text.match(pat)
    if (m) {
      const v = parseMoney(m[1])
      if (v > 10_000) { result.netTaxableSalary = v; break }
    }
  }

  // ── TDS Deducted ──────────────────────────────────────────────────────────
  // TRACES Part A has "Total (Rs.)" row with 3 numbers: amount paid, TDS deducted, TDS deposited
  // They are equal in well-matched Form 16s. Pattern: Total (Rs.) PAID TDS TDS
  const partATotalLine = text.match(
    /Total\s+\(Rs\.\)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)/i
  )
  if (partATotalLine) {
    const tds = parseMoney(partATotalLine[2])
    if (tds > 0) result.tdsDeducted = tds
  }

  // Fallback TDS patterns
  if (!result.tdsDeducted) {
    const tdsPatterns = [
      /[Nn]et\s+[Tt]ax\s+[Pp]ayable[^\d]*([\d,]+\.?\d*)/i,
      /[Tt]ax\s+[Pp]ayable[^\d]*([\d,]+\.?\d*)\n/i,
      /[Tt]otal\s+[Tt]ax\s+[Dd]eposited[^\d]*([\d,]+\.?\d*)/i,
    ]
    for (const pat of tdsPatterns) {
      const m = text.match(pat)
      if (m) {
        const v = parseMoney(m[1])
        if (v > 1_000) { result.tdsDeducted = v; break }
      }
    }
  }

  return result
}

// ─── Fallback: colon-separated label:value pairs (employer-issued Form 16) ───

const FIELD_ALIASES: Record<string, string[]> = {
  grossSalary: [
    'gross salary', 'total salary', 'gross remuneration',
    'salary as per provisions', '17(1)',
  ],
  standardDeduction: [
    'standard deduction u/s 16(ia)', 'standard deduction u/s 16',
    'std deduction', 'standard deduction', 'deduction u/s 16(ia)',
  ],
  professionalTax: [
    'professional tax u/s 16(iii)', 'prof tax', 'professional tax',
    'tax on employment', 'employment tax',
  ],
  netTaxableSalary: [
    'income chargeable under the head salaries', 'income from salaries',
    'net salary', 'net taxable salary', 'taxable salary',
  ],
  tdsDeducted: [
    'total tax deducted', 'tds u/s 192', 'tax deducted at source',
    'total tds', 'tds deducted', 'net tax payable',
  ],
  pan: ['pan of employee', 'employee pan'],
  tanEmployer: ['tan of employer', 'employer tan', 'tan of deductor'],
  employerName: ['name of employer', 'employer name', 'name and address of employer'],
  assessmentYear: ['assessment year'],
}

function matchLabel(label: string): string | null {
  const lc = label.toLowerCase().trim()
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      if (lc.includes(alias.toLowerCase())) return field
    }
  }
  return null
}

function extractColonPairs(text: string): Array<{ label: string; value: string }> {
  const pairs: Array<{ label: string; value: string }> = []
  const lines = text.split('\n')
  for (const line of lines) {
    const colonIdx = line.indexOf(':')
    if (colonIdx > 2 && colonIdx < line.length - 1) {
      const label = line.slice(0, colonIdx).trim()
      const value = line.slice(colonIdx + 1).trim()
      if (label.length > 2 && label.length < 200) pairs.push({ label, value })
    }
  }
  return pairs
}

// ─── Main extractor ────────────────────────────────────────────────────────────

export function extractForm16Fields(text: string): Form16ExtractionResult {
  const traced = extractViaTracesPatterns(text)
  const fields: ExtractedField[] = []
  const resolved = new Set<string>()

  // Apply TRACES-extracted fields first
  for (const [field, value] of Object.entries(traced)) {
    if (value !== undefined && value !== 0 && value !== '') {
      resolved.add(field)
      const isMonetary = !['pan', 'tanEmployer', 'employerName', 'assessmentYear'].includes(field)
      fields.push({
        field,
        rawLabel: `traces:${field}`,
        rawValue: String(value),
        parsedValue: isMonetary ? Number(value) : String(value),
      })
    }
  }

  // Supplement with colon-pair extraction for non-TRACES format
  const pairs = extractColonPairs(text)
  const unresolved: string[] = []
  for (const { label, value } of pairs) {
    const field = matchLabel(label)
    if (field && !resolved.has(field)) {
      resolved.add(field)
      const isMonetary = !['pan', 'tanEmployer', 'employerName', 'assessmentYear'].includes(field)
      const parsed = isMonetary ? parseMoney(value) : value
      if (!isMonetary || (parsed as number) > 0) {
        fields.push({ field, rawLabel: label, rawValue: value, parsedValue: parsed })
      }
    } else if (!field && label.length > 5 && label.length < 150) {
      unresolved.push(label)
    }
  }

  return { fields, unresolved: unresolved.slice(0, 20) }
}

export function buildForm16Data(
  extractionResult: Form16ExtractionResult,
  _fullText: string,
  aiMappings?: Record<string, string>
): Form16Data {
  const { fields } = extractionResult

  const data: Form16Data = {
    grossSalary: 0,
    standardDeduction: 75_000,
    professionalTax: 0,
    netTaxableSalary: 0,
    tdsDeducted: 0,
    pan: '',
    tanEmployer: '',
    employerName: '',
    assessmentYear: '',
    unresolvedFields: [],
  }

  const record = data as unknown as Record<string, unknown>
  for (const f of fields) {
    if (f.parsedValue !== 0 || ['pan', 'tanEmployer', 'employerName', 'assessmentYear'].includes(f.field)) {
      record[f.field] = f.parsedValue
    }
  }

  if (aiMappings) {
    for (const [label, field] of Object.entries(aiMappings)) {
      const pair = extractionResult.fields.find(f => f.rawLabel === label)
      const isMonetary = !['pan', 'tanEmployer', 'employerName', 'assessmentYear'].includes(field)
      if (pair?.rawValue) {
        record[field] = isMonetary ? parseMoney(pair.rawValue) : pair.rawValue
      }
    }
  }

  // Compute netTaxableSalary if not extracted
  if (!data.netTaxableSalary && data.grossSalary > 0) {
    data.netTaxableSalary = data.grossSalary - data.standardDeduction - data.professionalTax
  }

  data.unresolvedFields = extractionResult.unresolved.filter(
    label => !aiMappings || !(label in aiMappings)
  )

  return data
}
