import type { Form16Data } from '../types'


/**
 * Known field aliases from design.md §8.2
 */
const FIELD_ALIASES: Record<string, string[]> = {
  grossSalary: [
    'gross salary',
    'total salary',
    'gross remuneration',
    'total remuneration',
    'gross income from salary',
    'salary as per provisions',
  ],
  standardDeduction: [
    'standard deduction u/s 16(ia)',
    'standard deduction u/s 16(1a)',
    'standard deduction u/s 16',
    'std deduction',
    'standard deduction',
    'deduction u/s 16(ia)',
  ],
  professionalTax: [
    'professional tax u/s 16(iii)',
    'professional tax u/s 16(3)',
    'prof tax',
    'professional tax',
    'tax on employment',
    'employment tax',
  ],
  netTaxableSalary: [
    'income chargeable under the head salaries',
    'income under head salaries',
    'net salary',
    'net taxable salary',
    'income from salaries',
    'taxable salary',
    'net salary after std ded',
    'net salary after standard deduction',
    'net salary after deduction u/s 16',
    'income from salary',
  ],
  tdsDeducted: [
    'total tax deducted at source',
    'tds u/s 192',
    'tax deducted at source',
    'total tds',
    'tds deducted',
    'income tax deducted',
    'tax deducted',
  ],
  pan: [
    'pan of employee',
    'employee pan',
    'pan no',
    'permanent account number',
  ],
  tanEmployer: [
    'tan of employer',
    'employer tan',
    'tan no',
    'tax deduction account number',
  ],
  employerName: [
    'name of employer',
    'employer name',
    'name and address of employer',
    'name of the employer',
  ],
  assessmentYear: [
    'assessment year',
    'a.y.',
    'year of assessment',
  ],
}

export interface ExtractedField {
  field: string   // string — cast to Form16Field when needed
  rawLabel: string
  rawValue: string
  parsedValue: number | string
}

export interface Form16ExtractionResult {
  fields: ExtractedField[]
  unresolved: string[]
}

function parseMoney(raw: string): number {
  const cleaned = raw.replace(/[₹,\s]/g, '').trim()
  const n = parseFloat(cleaned)
  return isNaN(n) ? 0 : n
}

function matchLabel(label: string): string | null {
  const lc = label.toLowerCase().trim()
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      if (lc.includes(alias.toLowerCase())) {
        return field
      }
    }
  }
  return null
}

function extractLabelValuePairs(text: string): Array<{ label: string; value: string }> {
  const pairs: Array<{ label: string; value: string }> = []

  const colonLines = text.split('\n')
  for (const line of colonLines) {
    const colonIdx = line.indexOf(':')
    if (colonIdx > 0 && colonIdx < line.length - 1) {
      const label = line.slice(0, colonIdx).trim()
      const value = line.slice(colonIdx + 1).trim()
      if (label.length > 2 && label.length < 200) {
        pairs.push({ label, value })
      }
    }
  }

  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i]
    const next = lines[i + 1]
    if (
      !/\d{4,}/.test(line) &&
      /[\d,₹]/.test(next) &&
      line.length > 3 &&
      line.length < 200
    ) {
      pairs.push({ label: line, value: next })
    }
  }

  return pairs
}

function extractAssessmentYear(text: string): string {
  const match =
    text.match(/(?:assessment year|a\.?y\.?)[:\s]*(\d{4}-\d{2,4})/i) ??
    text.match(/\b(202[456]-2[567])\b/)
  return match ? match[1] : ''
}

function extractPAN(text: string): string {
  const match = text.match(/\b([A-Z]{5}[0-9]{4}[A-Z])\b/)
  return match ? match[1] : ''
}

function extractTAN(text: string): string {
  const tanSection = text.match(/tan[^A-Z]*?([A-Z]{4}[0-9]{5}[A-Z])/i)
  return tanSection ? tanSection[1] : ''
}

function extractEmployerName(text: string): string {
  const match = text.match(/(?:name of employer|employer name)[:\s]+([A-Za-z][^\n\r]{2,80})/i)
  return match ? match[1].trim() : ''
}

export function extractForm16Fields(text: string): Form16ExtractionResult {
  const pairs = extractLabelValuePairs(text)
  const resolved = new Set<string>()
  const fields: ExtractedField[] = []
  const unresolvedLabels: string[] = []

  for (const { label, value } of pairs) {
    const field = matchLabel(label)
    if (field && !resolved.has(field)) {
      resolved.add(field)
      const isMonetary = !['pan', 'tanEmployer', 'employerName', 'assessmentYear'].includes(field)
      fields.push({
        field,
        rawLabel: label,
        rawValue: value,
        parsedValue: isMonetary ? parseMoney(value) : value,
      })
    } else if (!field && label.length > 5 && label.length < 150) {
      unresolvedLabels.push(label)
    }
  }

  return { fields, unresolved: unresolvedLabels.slice(0, 20) }
}

export function buildForm16Data(
  extractionResult: Form16ExtractionResult,
  fullText: string,
  aiMappings?: Record<string, string>
): Form16Data {
  const { fields, unresolved } = extractionResult

  const data: Form16Data = {
    grossSalary: 0,
    standardDeduction: 75000,
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
    record[f.field] = f.parsedValue
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

  if (!data.pan) data.pan = extractPAN(fullText)
  if (!data.tanEmployer) data.tanEmployer = extractTAN(fullText)
  if (!data.employerName) data.employerName = extractEmployerName(fullText)
  if (!data.assessmentYear) data.assessmentYear = extractAssessmentYear(fullText)

  if (data.netTaxableSalary === 0 && data.grossSalary > 0) {
    data.netTaxableSalary = data.grossSalary - data.standardDeduction - data.professionalTax
  }

  const stillUnresolved = unresolved.filter(label => !aiMappings || !(label in aiMappings))
  data.unresolvedFields = stillUnresolved

  return data
}
