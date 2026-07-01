/**
 * S03Parsing v2 — Sequential parse pipeline for all 6 document types.
 *
 * Order: brokerPL → form16 (all) → mfStatement → form26AS → ais → previousITR
 *
 * All 3 new parsers (form26AS, ais, previousITR) are optional —
 * errors are surfaced but do not block navigation to /review.
 */

import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { StepProgress } from '../components/shared'
import { ParseProgressCard, AICallBannerParsing } from '../components/parsing'
import { useAppContext, useAppDispatch } from '../context/AppContext'
import { useSessionPersistence, useAILog } from '../hooks/useSessionPersistence'
import { getPendingFiles, clearPendingFiles, getPendingFiles_v2, clearPendingFiles_v2 } from './S02Upload'
import type { ParseState } from '../types'

interface DocStatus {
  state: ParseState
  milestones: { label: string; done: boolean }[]
  error?: string
}

const idle = (): DocStatus => ({ state: 'idle', milestones: [] })
const skipped = (): DocStatus => ({ state: 'done', milestones: [{ label: 'Not uploaded — skipped', done: true }] })

export default function S03Parsing() {
  const navigate    = useNavigate()
  const { state, dispatch } = useAppContext()
  const { saveSession }     = useSessionPersistence()
  const { setAILogUseful }  = useAppDispatch()
  const { updateEntry }     = useAILog()

  const [brokerStatus,   setBrokerStatus]   = useState<DocStatus>(idle())
  const [form16Status,   setForm16Status]   = useState<DocStatus>(idle())
  const [mfStatus,       setMFStatus]       = useState<DocStatus>(idle())
  const [f26asStatus,    setF26asStatus]    = useState<DocStatus>(idle())
  const [aisStatus,      setAISStatus]      = useState<DocStatus>(idle())
  const [prevITRStatus,  setPrevITRStatus]  = useState<DocStatus>(idle())

  const [showThumbsFor, setShowThumbsFor] = useState<string | null>(null)
  const [allDone,       setAllDone]       = useState(false)
  const hasStarted = useRef(false)

  useEffect(() => {
    if (hasStarted.current) return
    hasStarted.current = true

    const v2files = getPendingFiles_v2()
    const v1files = getPendingFiles()

    if (!v2files && !v1files) {
      navigate('/upload')
      return
    }

    // Resolve files — prefer v2 shape
    const broker     = v2files?.broker     ?? v1files?.broker     ?? null
    const form16List = v2files?.form16     ?? (v1files?.form16 ? [v1files.form16] : [])
    const mf         = v2files?.mf         ?? v1files?.mf         ?? null
    const form26AS   = v2files?.form26AS   ?? null
    const ais        = v2files?.ais        ?? null
    const prevITR    = v2files?.previousITR ?? null

    if (!broker) { navigate('/upload'); return }

    clearPendingFiles()
    clearPendingFiles_v2()

    runPipeline(broker, form16List.filter(Boolean) as File[], mf, form26AS, ais, prevITR)
  }, [])

  useEffect(() => {
    if (!allDone) return
    const timer = setTimeout(() => {
      dispatch({ type: 'SET_STEP', step: 'review' })
      navigate('/review')
    }, 1500)
    return () => clearTimeout(timer)
  }, [allDone, navigate, dispatch])

  // ─── Pipeline ──────────────────────────────────────────────────────────────

  async function runPipeline(
    brokerFile: File,
    form16Files: File[],
    mfFile: File | null,
    form26ASFile: File | null,
    aisFile: File | null,
    prevITRFile: File | null,
  ) {

    // ── 1. Broker ────────────────────────────────────────────────────────────
    setBrokerStatus({ state: 'parsing', milestones: [
      { label: 'Reading sheets', done: false },
      { label: 'Equity', done: false },
      { label: 'Intraday', done: false },
      { label: 'Dividends', done: false },
    ]})
    dispatch({ type: 'SET_PARSE_STATUS', key: 'brokerPL', status: 'parsing' })

    try {
      const { parseBrokerPL } = await import('../parsers/brokerParser')
      setBrokerStatus(s => ({ ...s, milestones: s.milestones.map((m, i) => i === 0 ? { ...m, done: true } : m) }))
      const result = await parseBrokerPL(brokerFile)

      if (result.needsAI && result.workbookMeta) {
        setBrokerStatus(s => ({ ...s, state: 'needs-ai' }))
        const { callBrokerDetectionAI } = await import('../ai/aiClient')
        const aiResult = await callBrokerDetectionAI(result.workbookMeta, dispatch)
        if (aiResult.data) {
          dispatch({ type: 'SET_PARSED_BROKER', data: aiResult.data, broker: aiResult.data.broker })
        }
        setBrokerStatus({
          state: aiResult.data ? 'done' : 'error',
          milestones: [
            { label: 'Reading sheets', done: true },
            { label: 'Equity', done: !!aiResult.data },
            { label: 'Intraday', done: !!aiResult.data },
            { label: 'Dividends', done: !!aiResult.data },
          ],
          error: aiResult.error ?? undefined,
        })
      } else if (result.data) {
        dispatch({ type: 'SET_PARSED_BROKER', data: result.data, broker: result.detectedBroker })
        const hasFnO = result.data.hasFnO
        const missingIntraday = (result.data as any).missingIntradaySheet
        setBrokerStatus({
          state: 'done',
          milestones: [
            { label: 'Reading sheets', done: true },
            { label: 'Equity', done: true },
            { label: 'Intraday', done: !missingIntraday },
            { label: 'Dividends', done: true },
            ...(hasFnO ? [{ label: '⚠ F&O detected', done: true }] : []),
            ...(missingIntraday ? [{ label: '⚠ Intraday sheet missing', done: true }] : []),
          ],
        })
      } else {
        setBrokerStatus({ state: 'error', milestones: [], error: result.error ?? 'Parse failed' })
        dispatch({ type: 'SET_PARSE_STATUS', key: 'brokerPL', status: 'error' })
      }
    } catch (err) {
      setBrokerStatus({ state: 'error', milestones: [], error: (err as Error).message })
      dispatch({ type: 'SET_PARSE_STATUS', key: 'brokerPL', status: 'error' })
    }

    // ── 2. Form 16 (all employers, sequential) ───────────────────────────────
    setForm16Status({ state: 'parsing', milestones: form16Files.map((_, i) => ({
      label: form16Files.length > 1 ? `Employer ${i + 1}` : 'Extracting text',
      done: false,
    }))})
    dispatch({ type: 'SET_PARSE_STATUS', key: 'form16', status: 'parsing' })

    try {
      const { parseForm16 } = await import('../parsers/form16Parser')
      const allForm16Data = []
      const milestones: { label: string; done: boolean }[] = []

      for (let i = 0; i < form16Files.length; i++) {
        const f16file = form16Files[i]
        const result = await parseForm16(f16file)

        if (result.state === 'needs-ai' && result.unresolvedLabels.length > 0) {
          const { callForm16MappingAI } = await import('../ai/aiClient')
          const aiResult = await callForm16MappingAI(result.unresolvedLabels, dispatch)
          const { parseForm16WithAIMappings } = await import('../parsers/form16Parser')
          const finalResult = await parseForm16WithAIMappings(f16file, (aiResult.mappings ?? {}) as Record<string, string>)
          if (finalResult.data) {
            allForm16Data.push(finalResult.data)
            milestones.push({ label: `${finalResult.data.employerName || `Employer ${i + 1}`} (AI)`, done: true })
          } else {
            milestones.push({ label: `⚠ Employer ${i + 1}: ${finalResult.error ?? 'failed'}`, done: false })
          }
        } else if (result.data) {
          dispatch({ type: 'SET_PARSED_FORM16', data: result.data })
          allForm16Data.push(result.data)
          milestones.push({
            label: result.ayMismatch
              ? `⚠ ${result.data.employerName || `Employer ${i + 1}`}: AY mismatch`
              : result.data.employerName || `Employer ${i + 1}`,
            done: true,
          })
        } else {
          milestones.push({ label: `⚠ Employer ${i + 1}: ${result.error ?? 'failed'}`, done: false })
        }
      }

      // Dispatch all at once if multiple
      if (allForm16Data.length > 0 && form16Files.length > 1) {
        // Additional employers beyond first: dispatch individually
        for (const d of allForm16Data.slice(1)) {
          dispatch({ type: 'SET_PARSED_FORM16', data: d })
        }
      }

      setForm16Status({ state: 'done', milestones })
      dispatch({ type: 'SET_PARSE_STATUS', key: 'form16', status: 'done' })
    } catch (err) {
      setForm16Status({ state: 'error', milestones: [], error: (err as Error).message })
      dispatch({ type: 'SET_PARSE_STATUS', key: 'form16', status: 'error' })
    }

    // ── 3. MF Statement (optional) ───────────────────────────────────────────
    if (!mfFile) {
      setMFStatus(skipped())
    } else {
      setMFStatus({ state: 'parsing', milestones: [
        { label: 'Reading schemes', done: false },
        { label: 'FIFO matching', done: false },
        { label: 'CG classification', done: false },
      ]})
      dispatch({ type: 'SET_PARSE_STATUS', key: 'mfStatement', status: 'parsing' })
      try {
        const { parseMFStatement } = await import('../parsers/mfParser')
        const result = await parseMFStatement(mfFile)
        if (result.data) {
          dispatch({ type: 'SET_PARSED_MF', data: result.data })
          const n = result.data.schemes.length
          setMFStatus({ state: 'done', milestones: [
            { label: 'Reading schemes', done: true },
            { label: 'FIFO matching', done: true },
            { label: 'CG classification', done: true },
            { label: `${n} scheme${n !== 1 ? 's' : ''} processed`, done: true },
          ]})
        } else {
          setMFStatus({ state: 'error', milestones: [], error: result.error ?? 'Parse failed' })
        }
      } catch (err) {
        setMFStatus({ state: 'error', milestones: [], error: (err as Error).message })
      }
    }

    // ── 4. Form 26AS (optional) ──────────────────────────────────────────────
    if (!form26ASFile) {
      setF26asStatus(skipped())
    } else {
      setF26asStatus({ state: 'parsing', milestones: [
        { label: 'Detecting format', done: false },
        { label: 'Part A — TDS entries', done: false },
        { label: 'Part C — Advance tax', done: false },
      ]})
      try {
        const { parseForm26AS } = await import('../parsers/form26ASParser')
        setF26asStatus(s => ({ ...s, milestones: s.milestones.map((m, i) => i === 0 ? { ...m, done: true } : m) }))
        const result = await parseForm26AS(form26ASFile)
        setParsedForm26AS(result)
        dispatch({ type: 'SET_PARSE_STATUS', key: 'brokerPL', status: 'done' }) // reuse key to signal done
        setF26asStatus({ state: 'done', milestones: [
          { label: 'Format detected', done: true },
          { label: `Part A — ${result.partA.length} TDS entries`, done: true },
          { label: `Part C — ${result.partC.length} challan entries`, done: true },
        ]})
      } catch (err) {
        setF26asStatus({ state: 'error', milestones: [], error: (err as Error).message })
      }
    }

    // ── 5. AIS (optional) ────────────────────────────────────────────────────
    if (!aisFile) {
      setAISStatus(skipped())
    } else {
      setAISStatus({ state: 'parsing', milestones: [
        { label: 'Reading AIS data', done: false },
        { label: 'Normalising entries', done: false },
        { label: 'Cross-validation ready', done: false },
      ]})
      try {
        const { parseAIS } = await import('../parsers/aisParser')
        const result = await parseAIS(aisFile)
        setParsedAIS(result)
        setAISStatus({ state: 'done', milestones: [
          { label: 'AIS data loaded', done: true },
          { label: `${result.salary.length} salary · ${result.dividends.length} dividend entries`, done: true },
          { label: `${result.tdsCredits.length} TDS credits found`, done: true },
        ]})
      } catch (err) {
        setAISStatus({ state: 'error', milestones: [], error: (err as Error).message })
      }
    }

    // ── 6. Previous ITR XML (optional) ───────────────────────────────────────
    if (!prevITRFile) {
      setPrevITRStatus(skipped())
    } else {
      setPrevITRStatus({ state: 'parsing', milestones: [
        { label: 'Parsing XML', done: false },
        { label: 'Extracting ScheduleCFL', done: false },
        { label: 'Filtering expired entries', done: false },
      ]})
      try {
        const { parsePriorITRXML } = await import('../parsers/priorITRParser')
        const entries = await parsePriorITRXML(prevITRFile)
        setParsedPriorCFL(entries)
        setPrevITRStatus({ state: 'done', milestones: [
          { label: 'XML parsed', done: true },
          { label: `${entries.length} carry-forward ${entries.length === 1 ? 'entry' : 'entries'} found`, done: true },
          { label: 'Expired entries filtered', done: true },
        ]})
      } catch (err) {
        setPrevITRStatus({ state: 'error', milestones: [], error: (err as Error).message })
      }
    }

    saveSession()
    setAllDone(true)
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div>
      <StepProgress />
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink-900 mb-1">Parsing your documents…</h1>
        <p className="text-sm text-ink-400">All parsing runs locally in your browser — nothing is sent to any server</p>
      </div>

      <div className="space-y-3 mb-4">
        <ParseProgressCard
          title={`Broker Tax P&L${state.parsed.detectedBroker && state.parsed.detectedBroker !== 'unknown'
            ? ` (${state.parsed.detectedBroker.charAt(0).toUpperCase() + state.parsed.detectedBroker.slice(1)})`
            : ''}`}
          status={brokerStatus.state}
          milestones={brokerStatus.milestones}
          errorMsg={brokerStatus.error}
          onRetry={() => navigate('/upload')}
        />
        <ParseProgressCard
          title="Form 16"
          status={form16Status.state}
          milestones={form16Status.milestones}
          errorMsg={form16Status.error}
          onRetry={() => navigate('/upload')}
        />
        <ParseProgressCard
          title="MF Capital Gains Statement"
          status={mfStatus.state}
          milestones={mfStatus.milestones}
          errorMsg={mfStatus.error}
          onRetry={() => navigate('/upload')}
        />
        <ParseProgressCard
          title="Form 26AS"
          status={f26asStatus.state}
          milestones={f26asStatus.milestones}
          errorMsg={f26asStatus.error}
          onRetry={() => navigate('/upload')}
        />
        <ParseProgressCard
          title="AIS / TIS"
          status={aisStatus.state}
          milestones={aisStatus.milestones}
          errorMsg={aisStatus.error}
          onRetry={() => navigate('/upload')}
        />
        <ParseProgressCard
          title="Previous Year ITR XML"
          status={prevITRStatus.state}
          milestones={prevITRStatus.milestones}
          errorMsg={prevITRStatus.error}
          onRetry={() => navigate('/upload')}
        />
      </div>

      <AICallBannerParsing entries={state.aiCallLog} />

      {state.aiCallLog.length > 0 && (
        <div className="mt-3 space-y-2">
          {state.aiCallLog.map(entry => (
            <div key={entry.callId} className="flex items-center gap-3 text-sm text-ink-600 bg-sky-50 border border-sky-200 rounded-lg px-4 py-2">
              <span className="flex-1">Did AI help parse correctly for <span className="font-medium">
                {entry.callType === 'broker_detection' ? 'broker format' : 'Form 16 fields'}
              </span>?</span>
              <button
                onClick={() => { setAILogUseful(entry.callId, true); updateEntry(entry.callId, true); setShowThumbsFor(entry.callId) }}
                className={`p-1.5 rounded transition-colors ${showThumbsFor === entry.callId && entry.wasUseful === true ? 'bg-emerald-100 text-emerald-600' : 'text-ink-400 hover:text-emerald-600'}`}
              >👍</button>
              <button
                onClick={() => { setAILogUseful(entry.callId, false); updateEntry(entry.callId, false); setShowThumbsFor(entry.callId) }}
                className={`p-1.5 rounded transition-colors ${showThumbsFor === entry.callId && entry.wasUseful === false ? 'bg-rose-100 text-rose-600' : 'text-ink-400 hover:text-rose-600'}`}
              >👎</button>
            </div>
          ))}
          <button
            onClick={() => navigate('/settings/ai-log')}
            className="text-xs text-sky-600 hover:text-sky-800 underline"
          >
            View full AI call log →
          </button>
        </div>
      )}

      {allDone && (
        <div className="mt-4 banner-success">
          <span>✓</span>
          <p>All documents parsed. Redirecting to income review…</p>
        </div>
      )}
    </div>
  )
}

// ─── Module-level stores for v2 parsed data (read by downstream screens) ─────
// These will be wired into AppState in Wave 14 (T79).

import type { Form26ASData, AISData, CFLEntry } from '../types'

let _parsedForm26AS: Form26ASData | null = null
let _parsedAIS: AISData | null = null
let _parsedPriorCFL: CFLEntry[] = []

export function setParsedForm26AS(d: Form26ASData) { _parsedForm26AS = d }
export function getParsedForm26AS(): Form26ASData | null { return _parsedForm26AS }

export function setParsedAIS(d: AISData) { _parsedAIS = d }
export function getParsedAIS(): AISData | null { return _parsedAIS }

export function setParsedPriorCFL(entries: CFLEntry[]) { _parsedPriorCFL = entries }
export function getParsedPriorCFL(): CFLEntry[] { return _parsedPriorCFL }
