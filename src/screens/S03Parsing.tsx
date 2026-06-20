import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { StepProgress } from '../components/shared'
import { ParseProgressCard, AICallBannerParsing } from '../components/parsing'
import { useAppContext } from '../context/AppContext'
import { useAppDispatch } from '../context/AppContext'
import { useSessionPersistence, useAILog } from '../hooks/useSessionPersistence'
import { getPendingFiles, clearPendingFiles } from './S02Upload'
import type { ParseState } from '../types'

interface DocStatus {
  state: ParseState
  milestones: { label: string; done: boolean }[]
  error?: string
}

const idle = (): DocStatus => ({ state: 'idle', milestones: [] })

export default function S03Parsing() {
  const navigate = useNavigate()
  const { state, dispatch } = useAppContext()
  const { saveSession } = useSessionPersistence()
  const { setAILogUseful } = useAppDispatch()
  const { updateEntry } = useAILog()
  const [brokerStatus, setBrokerStatus] = useState<DocStatus>(idle())
  const [showThumbsFor, setShowThumbsFor] = useState<string | null>(null)
  const [form16Status, setForm16Status] = useState<DocStatus>(idle())
  const [mfStatus, setMFStatus] = useState<DocStatus>(idle())
  const [allDone, setAllDone] = useState(false)
  const hasStarted = useRef(false)

  useEffect(() => {
    if (hasStarted.current) return
    hasStarted.current = true

    const files = getPendingFiles()
    if (!files) {
      navigate('/upload')
      return
    }

    runPipeline(files.broker, files.form16, files.mf)
    clearPendingFiles()
  }, [])

  useEffect(() => {
    if (!allDone) return
    const timer = setTimeout(() => {
      dispatch({ type: 'SET_STEP', step: 'review' })
      navigate('/review')
    }, 1500)
    return () => clearTimeout(timer)
  }, [allDone, navigate, dispatch])

  async function runPipeline(brokerFile: File, form16File: File, mfFile: File | null) {
    // Sequential: broker → form16 → MF

    // ── 1. Broker ───────────────────────────────────────────────────────────
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
        // AI fallback
        const { callBrokerDetectionAI } = await import('../ai/aiClient')
        const aiResult = await callBrokerDetectionAI(result.workbookMeta, dispatch)

        if (aiResult.data) {
          dispatch({ type: 'SET_PARSED_BROKER', data: aiResult.data, broker: aiResult.data.broker })
        } else {
          dispatch({ type: 'SET_PARSE_ERROR', key: 'brokerPL', message: aiResult.error ?? 'AI fallback failed' })
        }
        const aiError = aiResult.error
          ? aiResult.error.includes('fetch') || aiResult.error.includes('network') || aiResult.error.includes('API')
            ? 'AI assist unavailable. Please select broker manually by re-uploading with a recognised Zerodha, Groww, or Upstox export.'
            : aiResult.error
          : undefined
        setBrokerStatus({ state: result.needsAI && !aiResult.data ? 'error' : 'done',
          milestones: [
            { label: 'Reading sheets', done: true },
            { label: 'Equity', done: !!aiResult.data },
            { label: 'Intraday', done: !!aiResult.data },
            { label: 'Dividends', done: !!aiResult.data },
          ],
          error: aiError,
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
            ...(missingIntraday ? [{ label: '⚠ Intraday sheet not found — upload intraday file separately if you have intraday trades', done: true }] : []),
          ],
        })
      } else {
        setBrokerStatus({ state: 'error', milestones: [], error: result.error ?? 'Parse failed' })
        dispatch({ type: 'SET_PARSE_STATUS', key: 'brokerPL', status: 'error' })
        dispatch({ type: 'SET_PARSE_ERROR', key: 'brokerPL', message: result.error ?? 'Parse failed' })
      }
    } catch (err) {
      const msg = (err as Error).message
      setBrokerStatus({ state: 'error', milestones: [], error: msg })
      dispatch({ type: 'SET_PARSE_STATUS', key: 'brokerPL', status: 'error' })
    }

    // ── 2. Form 16 ──────────────────────────────────────────────────────────
    setForm16Status({ state: 'parsing', milestones: [
      { label: 'Extracting text', done: false },
      { label: 'Field mapping', done: false },
      { label: 'AY validation', done: false },
    ]})
    dispatch({ type: 'SET_PARSE_STATUS', key: 'form16', status: 'parsing' })

    try {
      const { parseForm16 } = await import('../parsers/form16Parser')
      const result = await parseForm16(form16File)
      setForm16Status(s => ({ ...s, milestones: s.milestones.map((m, i) => i === 0 ? { ...m, done: true } : m) }))

      if (result.state === 'needs-ai' && result.unresolvedLabels.length > 0) {
        setForm16Status(s => ({ ...s, state: 'needs-ai' }))
        const { callForm16MappingAI } = await import('../ai/aiClient')
        const aiResult = await callForm16MappingAI(result.unresolvedLabels, dispatch)

        const { parseForm16WithAIMappings } = await import('../parsers/form16Parser')
        const finalResult = await parseForm16WithAIMappings(form16File, (aiResult.mappings ?? {}) as Record<string, string>)

        if (finalResult.data) {
          dispatch({ type: 'SET_PARSED_FORM16', data: finalResult.data })
        }
        setForm16Status({
          state: finalResult.data ? 'done' : 'error',
          milestones: [
            { label: 'Extracting text', done: true },
            { label: 'Field mapping (AI)', done: !!finalResult.data },
            { label: 'AY validation', done: !finalResult.ayMismatch },
          ],
          error: finalResult.error ?? undefined,
        })
      } else if (result.data) {
        dispatch({ type: 'SET_PARSED_FORM16', data: result.data })
        setForm16Status({
          state: 'done',
          milestones: [
            { label: 'Extracting text', done: true },
            { label: 'Field mapping', done: true },
            { label: 'AY validation', done: !result.ayMismatch },
            ...(result.ayMismatch ? [{ label: '⚠ AY mismatch', done: true }] : [
              { label: `Employer: ${result.data.employerName || '—'}`, done: true },
            ]),
          ],
        })
      } else {
        setForm16Status({ state: 'error', milestones: [], error: result.error ?? 'Parse failed' })
        dispatch({ type: 'SET_PARSE_STATUS', key: 'form16', status: 'error' })
      }
    } catch (err) {
      const msg = (err as Error).message
      setForm16Status({ state: 'error', milestones: [], error: msg })
      dispatch({ type: 'SET_PARSE_STATUS', key: 'form16', status: 'error' })
    }

    // ── 3. MF Statement ─────────────────────────────────────────────────────
    setMFStatus({ state: 'parsing', milestones: [
      { label: 'Reading schemes', done: false },
      { label: 'FIFO matching', done: false },
      { label: 'CG classification', done: false },
    ]})
    dispatch({ type: 'SET_PARSE_STATUS', key: 'mfStatement', status: 'parsing' })

    try {
      const { parseMFStatement } = await import('../parsers/mfParser')
      const result = await parseMFStatement(mfFile!)
      setMFStatus(s => ({ ...s, milestones: s.milestones.map((m, i) => i === 0 ? { ...m, done: true } : m) }))

      if (result.data) {
        dispatch({ type: 'SET_PARSED_MF', data: result.data })
        const schemes = result.data.schemes.length
        setMFStatus({
          state: 'done',
          milestones: [
            { label: 'Reading schemes', done: true },
            { label: 'FIFO matching', done: true },
            { label: 'CG classification', done: true },
            { label: `${schemes} scheme${schemes !== 1 ? 's' : ''} processed`, done: true },
          ],
        })
      } else {
        const errMsg = result.error ?? 'Parse failed'
        const suggestion = errMsg.includes('Scanned') || result.usedPDFFallback
          ? errMsg + ' Try downloading a JSON statement from CAMS (camsonline.com) or KFintech for better accuracy.'
          : errMsg
        setMFStatus({ state: 'error', milestones: [], error: suggestion })
        dispatch({ type: 'SET_PARSE_STATUS', key: 'mfStatement', status: 'error' })
      }
    } catch (err) {
      const msg = (err as Error).message
      const suggestion = msg.includes('Scanned') || msg.includes('PDF')
        ? msg + ' Try using a JSON statement from CAMS or KFintech instead.'
        : msg
      setMFStatus({ state: 'error', milestones: [], error: suggestion })
      dispatch({ type: 'SET_PARSE_STATUS', key: 'mfStatement', status: 'error' })
    }

    saveSession()
    setAllDone(true)
  }

  return (
    <div>
      <StepProgress />
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink-900 mb-1">Parsing your documents…</h1>
        <p className="text-sm text-ink-400">All parsing runs locally in your browser — nothing is sent to any server</p>
      </div>

      <div className="space-y-4 mb-4">
        <ParseProgressCard
          title={`Broker Tax P&L${state.parsed.detectedBroker && state.parsed.detectedBroker !== 'unknown' ? ` (${state.parsed.detectedBroker.charAt(0).toUpperCase() + state.parsed.detectedBroker.slice(1)})` : ''}`}
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
          title="MF Statement (optional)"
          status={mfStatus.state}
          milestones={mfStatus.milestones}
          errorMsg={mfStatus.error}
          onRetry={() => navigate('/upload')}
        />
      </div>

      <AICallBannerParsing entries={state.aiCallLog} />

      {state.aiCallLog.length > 0 && (
        <div className="mt-3 space-y-2">
          {state.aiCallLog.map(entry => (
            <div key={entry.callId} className="flex items-center gap-3 text-sm text-ink-600 bg-sky-50 border border-sky-200 rounded-lg px-4 py-2">
              <span className="flex-1">Did AI help parse correctly for <span className="font-medium">{entry.callType === 'broker_detection' ? 'broker format' : 'Form 16 fields'}</span>?</span>
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
          <p>All documents parsed. Computing tax… redirecting to review.</p>
        </div>
      )}
    </div>
  )
}
