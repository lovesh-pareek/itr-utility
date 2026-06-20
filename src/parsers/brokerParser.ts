import type { BrokerData, BrokerName } from '../types'
import type { WorkbookMeta } from './brokerDetection'
import { detectBroker, extractWorkbookMeta, readExcelFile } from './brokerDetection'
import { parseZerodha } from './zerodhaParser'
import { parseGroww, parseUpstox } from './growwUpstoxParser'

export interface BrokerParseResult {
  data: BrokerData | null
  detectedBroker: BrokerName
  needsAI: boolean
  workbookMeta: WorkbookMeta | null
  error: string | null
}

/**
 * Primary entry point — takes a File, reads it, detects broker, routes to parser.
 * Returns either parsed BrokerData or a needsAI flag with workbook metadata for AI fallback.
 */
export async function parseBrokerPL(file: File): Promise<BrokerParseResult> {
  // Validate file type
  if (!file.name.match(/\.(xlsx|xls|ods)$/i)) {
    return {
      data: null,
      detectedBroker: 'unknown',
      needsAI: false,
      workbookMeta: null,
      error: 'Invalid file type. Please upload an Excel file (.xlsx)',
    }
  }

  let workbook
  try {
    const { readExcelFile: rEF } = await import('./brokerDetection')
    workbook = await rEF(file)
  } catch (err) {
    return {
      data: null,
      detectedBroker: 'unknown',
      needsAI: false,
      workbookMeta: null,
      error: `Could not read Excel file: ${(err as Error).message}`,
    }
  }

  const detectedBroker = detectBroker(workbook)
  const workbookMeta = extractWorkbookMeta(workbook)

  if (detectedBroker === 'unknown') {
    // Signal AI fallback — return meta but no data
    return {
      data: null,
      detectedBroker: 'unknown',
      needsAI: true,
      workbookMeta,
      error: null,
    }
  }

  try {
    let data: BrokerData

    switch (detectedBroker) {
      case 'zerodha':
        data = parseZerodha(workbook)
        break
      case 'groww':
        data = parseGroww(workbook)
        break
      case 'upstox':
        data = parseUpstox(workbook)
        break
      default:
        throw new Error('Unexpected broker')
    }

    return { data, detectedBroker, needsAI: false, workbookMeta, error: null }
  } catch (err) {
    return {
      data: null,
      detectedBroker,
      needsAI: false,
      workbookMeta,
      error: `Failed to parse ${detectedBroker} file: ${(err as Error).message}`,
    }
  }
}

/**
 * After AI returns column mappings, attempt to re-parse with the suggested broker.
 */
export async function parseBrokerWithAISuggestion(
  file: File,
  suggestedBroker: BrokerName
): Promise<BrokerParseResult> {
  if (suggestedBroker === 'unknown') {
    return {
      data: null,
      detectedBroker: 'unknown',
      needsAI: false,
      workbookMeta: null,
      error: 'AI could not identify broker format. Please select manually.',
    }
  }

  const { readExcelFile: rEF } = await import('./brokerDetection')
  const workbook = await rEF(file)
  const workbookMeta = extractWorkbookMeta(workbook)

  try {
    let data: BrokerData
    switch (suggestedBroker) {
      case 'zerodha': data = parseZerodha(workbook); break
      case 'groww': data = parseGroww(workbook); break
      case 'upstox': data = parseUpstox(workbook); break
      default: throw new Error('Unknown broker')
    }
    return { data, detectedBroker: suggestedBroker, needsAI: false, workbookMeta, error: null }
  } catch (err) {
    return {
      data: null,
      detectedBroker: suggestedBroker,
      needsAI: false,
      workbookMeta,
      error: `Parse failed even with AI suggestion: ${(err as Error).message}`,
    }
  }
}

// Re-export for convenience
export { readExcelFile, detectBroker, extractWorkbookMeta }
