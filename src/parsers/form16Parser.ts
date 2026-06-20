import type { Form16Data } from '../types'
import { extractPDFText } from './pdfExtractor'
import { extractForm16Fields, buildForm16Data } from './form16Extractor'

export type Form16ParseState = 'done' | 'error' | 'needs-ai'

export interface Form16ParseResult {
  data: Form16Data | null
  state: Form16ParseState
  unresolvedLabels: string[]   // passed to AI if needs-ai
  ayMismatch: boolean
  error: string | null
}

const EXPECTED_AY = '2026-27'

/**
 * Primary entry point for Form 16 parsing.
 * Handles: scanned PDF rejection, AY validation, field extraction, AI flag.
 */
export async function parseForm16(file: File): Promise<Form16ParseResult> {
  if (!file.name.match(/\.pdf$/i)) {
    return {
      data: null,
      state: 'error',
      unresolvedLabels: [],
      ayMismatch: false,
      error: 'Invalid file type. Please upload a PDF file.',
    }
  }

  let pdfResult
  try {
    pdfResult = await extractPDFText(file)
  } catch (err) {
    return {
      data: null,
      state: 'error',
      unresolvedLabels: [],
      ayMismatch: false,
      error: `Could not read PDF: ${(err as Error).message}`,
    }
  }

  if (pdfResult.isScanned) {
    return {
      data: null,
      state: 'error',
      unresolvedLabels: [],
      ayMismatch: false,
      error: 'Scanned PDF detected. Please obtain a text-based Form 16 from your employer.',
    }
  }

  const extraction = extractForm16Fields(pdfResult.fullText)
  const data = buildForm16Data(extraction, pdfResult.fullText)

  // AY validation
  const ayMismatch = !!data.assessmentYear && !data.assessmentYear.includes(EXPECTED_AY)

  // Check if any critical fields are unresolved
  const criticalMissing = data.grossSalary === 0 || data.tdsDeducted === 0

  if (extraction.unresolved.length > 0 && criticalMissing) {
    // Critical fields missing — needs AI to resolve labels
    return {
      data,
      state: 'needs-ai',
      unresolvedLabels: extraction.unresolved,
      ayMismatch,
      error: null,
    }
  }

  return {
    data,
    state: 'done',
    unresolvedLabels: extraction.unresolved,
    ayMismatch,
    error: null,
  }
}

/**
 * Re-run Form 16 build after AI provides label→field mappings.
 */
export async function parseForm16WithAIMappings(
  file: File,
  aiMappings: Record<string, string>
): Promise<Form16ParseResult> {
  let pdfResult
  try {
    pdfResult = await extractPDFText(file)
  } catch (err) {
    return {
      data: null,
      state: 'error',
      unresolvedLabels: [],
      ayMismatch: false,
      error: `Could not re-read PDF: ${(err as Error).message}`,
    }
  }

  const extraction = extractForm16Fields(pdfResult.fullText)
  const data = buildForm16Data(extraction, pdfResult.fullText, aiMappings)

  const ayMismatch = !!data.assessmentYear && !data.assessmentYear.includes(EXPECTED_AY)

  return {
    data,
    state: 'done',
    unresolvedLabels: data.unresolvedFields,
    ayMismatch,
    error: null,
  }
}
