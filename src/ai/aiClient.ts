import { v4 as uuidv4 } from 'uuid'
import type { BrokerData, BrokerName, AICallEntry, AppAction } from '../types'

const AI_LOG_KEY = 'itr_utility_ai_log'

function persistLogEntry(entry: AICallEntry): void {
  try {
    const raw = localStorage.getItem(AI_LOG_KEY)
    const log: AICallEntry[] = raw ? JSON.parse(raw) : []
    log.push(entry)
    localStorage.setItem(AI_LOG_KEY, JSON.stringify(log))
  } catch {
    // Silently fail if storage unavailable
  }
}
import type { WorkbookMeta } from '../parsers/brokerDetection'

// ─── Payload sanitiser ────────────────────────────────────────────────────────

const PAN_PATTERN = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/
const TAN_PATTERN = /\b[A-Z]{4}[0-9]{5}[A-Z]\b/

interface SanitiseResult {
  clean: boolean
  reason?: string
}

function sanitisePayload(payload: unknown): SanitiseResult {
  const str = JSON.stringify(payload)

  // Block any numeric values beyond single-digit
  if (/\b\d{4,}\b/.test(str)) {
    return { clean: false, reason: 'Payload contains numeric values (4+ digits)' }
  }

  // Block PAN-like patterns
  if (PAN_PATTERN.test(str)) {
    return { clean: false, reason: 'Payload may contain PAN' }
  }

  // Block TAN-like patterns
  if (TAN_PATTERN.test(str)) {
    return { clean: false, reason: 'Payload may contain TAN' }
  }

  return { clean: true }
}

// ─── Core API caller ──────────────────────────────────────────────────────────

async function callClaude(prompt: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    throw new Error(`Anthropic API error: ${response.status}`)
  }

  const data = await response.json()
  const text = data.content
    ?.filter((b: { type: string }) => b.type === 'text')
    .map((b: { text: string }) => b.text)
    .join('')
  return text ?? ''
}

function logEntry(
  callType: AICallEntry['callType'],
  triggerReason: string,
  payloadSummary: string,
  responseSummary: string,
  ruleGap: string
): AICallEntry {
  return {
    callId: uuidv4(),
    timestamp: new Date().toISOString(),
    callType,
    triggerReason,
    payloadSummary,
    responseSummary,
    wasUseful: null,
    ruleGap,
  }
}

// ─── AI Call Type 1 — Broker format detection ────────────────────────────────

export interface BrokerAIResult {
  data: BrokerData | null
  error: string | null
}

export async function callBrokerDetectionAI(
  meta: WorkbookMeta,
  dispatch: React.Dispatch<AppAction>
): Promise<BrokerAIResult> {
  const payload = {
    sheetNames: meta.sheetNames,
    columnHeaders: meta.columnHeaders,
  }

  const sanitised = sanitisePayload(payload)
  if (!sanitised.clean) {
    const entry = logEntry(
      'broker_detection',
      'Broker not recognised by rule engine',
      'BLOCKED by sanitiser',
      'Sanitiser blocked payload',
      `Sanitiser blocked: ${sanitised.reason}`
    )
    dispatch({ type: 'ADD_AI_LOG_ENTRY', entry })
    persistLogEntry(entry)
    return { data: null, error: `AI call blocked: ${sanitised.reason}` }
  }

  const prompt = `You are a tax document parsing assistant. Identify which Indian stock broker produced this Excel file based only on the sheet names and column headers. Do not make up data.

Sheet names: ${JSON.stringify(meta.sheetNames)}
Column headers per sheet: ${JSON.stringify(meta.columnHeaders)}

Respond with ONLY valid JSON in this exact shape:
{
  "broker": "zerodha" | "groww" | "upstox" | "unknown",
  "confidence": "high" | "medium" | "low",
  "reasoning": "brief explanation",
  "rule_gap": "What deterministic rule could be added to avoid this AI call in future"
}`

  let responseText = ''
  let ruleGap = ''
  let detectedBroker: BrokerName = 'unknown'

  try {
    responseText = await callClaude(prompt)
    const clean = responseText.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)
    detectedBroker = parsed.broker ?? 'unknown'
    ruleGap = parsed.rule_gap ?? ''

    const entry = logEntry(
      'broker_detection',
      'Broker column headers did not match any known signature (Zerodha/Groww/Upstox)',
      `Sent sheet names (${meta.sheetNames.length}) and column headers only — no row data`,
      `AI identified broker as: ${detectedBroker} (confidence: ${parsed.confidence ?? 'unknown'})`,
      ruleGap
    )
    dispatch({ type: 'ADD_AI_LOG_ENTRY', entry })
    persistLogEntry(entry)

    if (detectedBroker === 'unknown') {
      return { data: null, error: 'AI could not identify broker format' }
    }

    // Re-parse with AI-suggested broker — return detectedBroker for caller to re-parse
    return { data: null, error: null }

  } catch (err) {
    const entry = logEntry(
      'broker_detection',
      'Broker column headers did not match any known signature',
      `Sent sheet names and column headers`,
      `Error: ${(err as Error).message}`,
      'Fix: improve rule-based detection to handle more broker formats'
    )
    dispatch({ type: 'ADD_AI_LOG_ENTRY', entry })
    persistLogEntry(entry)
    return { data: null, error: `AI call failed: ${(err as Error).message}` }
  }
}

// ─── AI Call Type 2 — Form 16 field mapping ──────────────────────────────────

export interface Form16AIResult {
  mappings: Record<string, string> | null
  error: string | null
}

export async function callForm16MappingAI(
  unresolvedLabels: string[],
  dispatch: React.Dispatch<AppAction>
): Promise<Form16AIResult> {
  // Sanitise — labels should be strings only, no numerics
  const payload = { labels: unresolvedLabels }
  const sanitised = sanitisePayload(payload)

  if (!sanitised.clean) {
    const entry = logEntry(
      'form16_mapping',
      'Unresolved Form 16 field labels',
      'BLOCKED by sanitiser',
      'Sanitiser blocked payload',
      `Sanitiser blocked: ${sanitised.reason}`
    )
    dispatch({ type: 'ADD_AI_LOG_ENTRY', entry })
    persistLogEntry(entry)
    return { mappings: null, error: `AI call blocked: ${sanitised.reason}` }
  }

  const VALID_FIELDS = [
    'grossSalary', 'standardDeduction', 'professionalTax',
    'netTaxableSalary', 'tdsDeducted', 'pan', 'tanEmployer',
    'employerName', 'assessmentYear',
  ]

  const prompt = `You are a tax document parsing assistant for Indian Form 16 PDFs. Map these ambiguous field labels to their standard Form 16 field names. Use ONLY the provided valid field names.

Labels to map: ${JSON.stringify(unresolvedLabels)}

Valid field names: ${JSON.stringify(VALID_FIELDS)}

Rules:
- Only map labels you are confident about
- Do not include mappings for labels you cannot confidently identify
- Labels containing numbers should NOT have been sent — if you see them, return an empty mappings object

Respond with ONLY valid JSON:
{
  "mappings": { "original label string": "fieldName", ... },
  "rule_gap": "What alias rules could be added to avoid this AI call in future"
}`

  try {
    const responseText = await callClaude(prompt)
    const clean = responseText.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)
    const mappings: Record<string, string> = parsed.mappings ?? {}
    const ruleGap: string = parsed.rule_gap ?? ''

    const mapped = Object.keys(mappings)
    const entry = logEntry(
      'form16_mapping',
      `${unresolvedLabels.length} Form 16 field labels did not match known aliases`,
      `Sent ${unresolvedLabels.length} label strings only — no monetary values, no PAN/TAN`,
      `AI mapped ${mapped.length} of ${unresolvedLabels.length} labels: ${mapped.slice(0, 3).join(', ')}${mapped.length > 3 ? '…' : ''}`,
      ruleGap
    )
    dispatch({ type: 'ADD_AI_LOG_ENTRY', entry })
    persistLogEntry(entry)

    return { mappings, error: null }
  } catch (err) {
    const entry = logEntry(
      'form16_mapping',
      'Unresolved Form 16 field labels',
      `Sent ${unresolvedLabels.length} label strings`,
      `Error: ${(err as Error).message}`,
      'Fix: expand alias table in form16Extractor.ts'
    )
    dispatch({ type: 'ADD_AI_LOG_ENTRY', entry })
    persistLogEntry(entry)
    return { mappings: null, error: `AI call failed: ${(err as Error).message}` }
  }
}
