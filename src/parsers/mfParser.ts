import type { MFData } from '../types'
import { parseMFJson, readJsonFile } from './mfJsonParser'
import { parseMFPdf } from './mfPdfParser'

export type MFParseState = 'done' | 'error'

export interface MFParseResult {
  data: MFData | null
  state: MFParseState
  usedPDFFallback: boolean
  warning: string | null
  error: string | null
}

/**
 * Primary entry point — detects JSON vs PDF by file type and routes accordingly.
 */
export async function parseMFStatement(file: File): Promise<MFParseResult> {
  const ext = file.name.split('.').pop()?.toLowerCase()

  if (ext === 'json') {
    return parseMFJsonFile(file)
  }

  if (ext === 'pdf') {
    return parseMFPDFFile(file)
  }

  return {
    data: null,
    state: 'error',
    usedPDFFallback: false,
    warning: null,
    error: `Unsupported file type ".${ext}". Please upload a JSON or PDF MF statement.`,
  }
}

async function parseMFJsonFile(file: File): Promise<MFParseResult> {
  try {
    const raw = await readJsonFile(file)
    const data = parseMFJson(raw)
    return { data, state: 'done', usedPDFFallback: false, warning: null, error: null }
  } catch (err) {
    return {
      data: null,
      state: 'error',
      usedPDFFallback: false,
      warning: null,
      error: `Failed to parse MF JSON: ${(err as Error).message}`,
    }
  }
}

async function parseMFPDFFile(file: File): Promise<MFParseResult> {
  try {
    const data = await parseMFPdf(file)
    return {
      data,
      state: 'done',
      usedPDFFallback: true,
      warning: 'PDF parsed — JSON format is recommended for higher accuracy. Download a JSON statement from CAMS/KFintech for best results.',
      error: null,
    }
  } catch (err) {
    return {
      data: null,
      state: 'error',
      usedPDFFallback: true,
      warning: null,
      error: `Failed to parse MF PDF: ${(err as Error).message}`,
    }
  }
}
