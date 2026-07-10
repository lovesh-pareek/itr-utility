/**
 * S02Upload v2 — Registry-driven document hub
 *
 * Layout driven by public/config/document-registry.json.
 * Required slots (brokerPL, form16) block progress until valid.
 * Optional slots (mfStatement, form26AS, ais, previousITR) improve accuracy.
 * Form 16 slot supports multiple uploads (one per employer, up to maxCount).
 */

import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { StepProgress, WarningBanner, ArrowRightIcon } from '../components/shared'
import { FileDropZone, FileCard } from '../components/upload'
import { useAppContext } from '../context/AppContext'
import { detectBroker, readExcelFile, extractWorkbookMeta } from '../parsers/brokerDetection'
import type { BrokerName } from '../types'
import documentRegistry from '../../public/config/document-registry.json'

// ─── Slot state ───────────────────────────────────────────────────────────────

interface SlotState {
  file: File | null
  status: 'idle' | 'checking' | 'valid' | 'error'
  badge?: string          // parsed metadata badge text
  errorMsg?: string
  diagnostic?: string
  broker?: BrokerName | null
}

const idle = (): SlotState => ({ file: null, status: 'idle' })

// ─── Component ────────────────────────────────────────────────────────────────

export default function S02Upload() {
  const navigate = useNavigate()
  const { dispatch } = useAppContext()

  // Single-file slots
  const [brokerSlot,    setBrokerSlot]    = useState<SlotState>(idle())
  const [mfSlot,        setMFSlot]        = useState<SlotState>(idle())
  const [form26ASSlot,  setForm26ASSlot]  = useState<SlotState>(idle())
  const [aisSlot,       setAISSlot]       = useState<SlotState>(idle())
  const [prevITRSlot,   setPrevITRSlot]   = useState<SlotState>(idle())

  // Form 16: multiple files, one per employer
  const [form16Slots, setForm16Slots] = useState<SlotState[]>([idle()])

  const filesRef = useRef<PendingFiles_v2>({
    broker: null,
    form16: [],
    mf: null,
    form26AS: null,
    ais: null,
    previousITR: null,
  })

  const form16Reg  = documentRegistry.documents.find(d => d.id === 'form16')!
  const maxForm16  = form16Reg.maxCount ?? 5

  // Filer type: salaried users must upload Form 16; business/freelance users can skip it
  const [filerType, setFilerType] = useState<'salaried' | 'business' | null>(null)
  const form16Required = filerType === 'salaried' || filerType === null  // default to required until user selects

  // Gate: brokerPL always required; Form 16 only required for salaried filers
  const allRequired =
    brokerSlot.status === 'valid' &&
    (!form16Required || form16Slots.some(s => s.status === 'valid'))

  // ── Broker handler ──────────────────────────────────────────────────────────
  async function handleBrokerFile(file: File) {
    if (!file.name.match(/\.(xlsx|xls|ods)$/i)) {
      setBrokerSlot({ file, status: 'error', errorMsg: 'Invalid file type — please upload an Excel file (.xlsx)' })
      return
    }
    setBrokerSlot({ file, status: 'checking' })
    filesRef.current.broker = file
    try {
      const wb = await readExcelFile(file)
      const detected = detectBroker(wb)
      if (detected === 'unknown') {
        const meta = extractWorkbookMeta(wb)
        const sheetInfo = meta.sheetNames.map(s =>
          `  "${s}": [${(meta.columnHeaders[s] ?? []).map((c: string) => `"${c}"`).join(', ')}]`
        ).join('\n')
        const diagnostic = `Sheet names & columns found:\n${sheetInfo}\n\nExpected for Zerodha: sheet containing "equity" with columns "Scrip" or "Symbol" and "Trade Type" or "Type".`
        setBrokerSlot({ file, status: 'error', broker: 'unknown', errorMsg: 'Broker not recognised — see details below', diagnostic })
      } else {
        setBrokerSlot({ file, status: 'valid', broker: detected, badge: `${detected} detected` })
      }
    } catch (err) {
      setBrokerSlot({ file, status: 'error', errorMsg: `Could not read file: ${(err as Error).message}` })
    }
  }

  // ── Form 16 handler (per-slot index) ───────────────────────────────────────
  async function handleForm16File(file: File, slotIdx: number) {
    if (!file.name.match(/\.pdf$/i)) {
      updateForm16Slot(slotIdx, { file, status: 'error', errorMsg: 'Invalid file type — please upload a PDF' })
      return
    }
    updateForm16Slot(slotIdx, { file, status: 'checking' })
    filesRef.current.form16[slotIdx] = file
    try {
      const { extractPDFText } = await import('../parsers/pdfExtractor')
      const result = await extractPDFText(file)
      if (result.isScanned) {
        updateForm16Slot(slotIdx, { file, status: 'error', errorMsg: 'Scanned PDF detected. Please obtain a text-based Form 16 from your employer.' })
      } else {
        updateForm16Slot(slotIdx, { file, status: 'valid', badge: 'Form 16 ready' })
      }
    } catch {
      updateForm16Slot(slotIdx, { file, status: 'valid', badge: 'Form 16 ready' })
    }
  }

  function updateForm16Slot(idx: number, state: SlotState) {
    setForm16Slots(prev => prev.map((s, i) => i === idx ? state : s))
  }

  function addForm16Slot() {
    if (form16Slots.length < maxForm16) {
      setForm16Slots(prev => [...prev, idle()])
    }
  }

  function removeForm16Slot(idx: number) {
    setForm16Slots(prev => {
      const next = prev.filter((_, i) => i !== idx)
      return next.length === 0 ? [idle()] : next
    })
    filesRef.current.form16 = filesRef.current.form16.filter((_, i) => i !== idx)
  }

  // ── Optional file handlers ──────────────────────────────────────────────────
  function handleMFFile(file: File) {
    if (!file.name.match(/\.(json|pdf)$/i)) {
      setMFSlot({ file, status: 'error', errorMsg: 'Upload .json (preferred) or .pdf from CAMS/KFintech' })
      return
    }
    filesRef.current.mf = file
    const badge = file.name.endsWith('.json') ? 'JSON — high accuracy' : 'PDF — verify values'
    setMFSlot({ file, status: 'valid', badge })
  }

  async function handleForm26ASFile(file: File) {
    if (!file.name.match(/\.(pdf|xlsx|xls)$/i)) {
      setForm26ASSlot({ file, status: 'error', errorMsg: 'Upload .pdf or .xlsx from TRACES' })
      return
    }
    filesRef.current.form26AS = file
    setForm26ASSlot({ file, status: 'checking' })
    // Lightweight peek to count expected TDS entries (full parse happens in S03)
    try {
      if (file.name.match(/\.xlsx?$/i)) {
        const { readExcelFile } = await import('../parsers/brokerDetection')
        const wb = await readExcelFile(file)
        const sheetCount = wb.SheetNames.length
        setForm26ASSlot({ file, status: 'valid', badge: `26AS · ${sheetCount} sheet(s) found` })
      } else {
        setForm26ASSlot({ file, status: 'valid', badge: '26AS PDF ready' })
      }
    } catch {
      setForm26ASSlot({ file, status: 'valid', badge: '26AS ready' })
    }
  }

  function handleAISFile(file: File) {
    if (!file.name.match(/\.(json|pdf)$/i)) {
      setAISSlot({ file, status: 'error', errorMsg: 'Upload .json (preferred) or .pdf from IT Portal → AIS' })
      return
    }
    filesRef.current.ais = file
    const badge = file.name.endsWith('.json') ? 'AIS JSON — cross-validation enabled' : 'AIS PDF — limited validation'
    setAISSlot({ file, status: 'valid', badge })
  }

  function handlePrevITRFile(file: File) {
    if (!file.name.match(/\.(xml|json)$/i)) {
      setPrevITRSlot({ file, status: 'error', errorMsg: 'Upload .json or .xml from IT Portal → e-File → View Filed Returns → Download' })
      return
    }
    filesRef.current.previousITR = file
    const fmt = file.name.endsWith('.json') ? 'JSON' : 'XML'
    setPrevITRSlot({ file, status: 'valid', badge: `Prior ITR ${fmt} — carry-forward extraction pending` })
  }

  // ── Navigate to parsing ─────────────────────────────────────────────────────
  function handleParse() {
    const f = filesRef.current
    if (!f.broker || f.form16.filter(Boolean).length === 0) return

    dispatch({
      type: 'SET_UPLOADED_FILES_META',
      meta: {
        brokerPL: { name: f.broker.name, size: f.broker.size },
        form16: { name: f.form16.filter(Boolean)[0]!.name, size: f.form16.filter(Boolean)[0]!.size },
        mfStatement: f.mf ? { name: f.mf.name, size: f.mf.size } : null,
      },
    })
    dispatch({ type: 'SET_STEP', step: 'parsing' })
    setPendingFiles_v2({ ...f })
    // Also set v1 compat
    setPendingFiles({
      broker: f.broker,
      form16: f.form16.filter(Boolean)[0]!,
      mf: f.mf,
    })
    navigate('/parsing')
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div>
      <StepProgress />
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink-900 mb-1">Upload your documents</h1>
        <p className="text-ink-500 text-sm">Step 1 of 5 — {form16Required ? 'Broker P\u0026L and Form 16 are required' : 'Broker P\u0026L required, Form 16 optional'}</p>
      </div>

      {/* ── Filer type selector ── */}
      <div className="card mb-4">
        <p className="text-sm font-semibold text-ink-800 mb-3">What best describes you?</p>
        <div className="flex gap-2">
          <button
            onClick={() => setFilerType('salaried')}
            className={`flex-1 py-2.5 px-3 rounded-lg border text-sm font-medium transition-colors ${
              filerType === 'salaried'
                ? 'bg-ink-900 text-white border-ink-900'
                : 'bg-ink-50 text-ink-700 border-ink-200 hover:border-ink-400'
            }`}
          >
            🏢 Salaried employee
            <p className="text-xs font-normal mt-0.5 opacity-70">Form 16 required</p>
          </button>
          <button
            onClick={() => setFilerType('business')}
            className={`flex-1 py-2.5 px-3 rounded-lg border text-sm font-medium transition-colors ${
              filerType === 'business'
                ? 'bg-ink-900 text-white border-ink-900'
                : 'bg-ink-50 text-ink-700 border-ink-200 hover:border-ink-400'
            }`}
          >
            💼 Business / Freelance
            <p className="text-xs font-normal mt-0.5 opacity-70">No Form 16 needed</p>
          </button>
        </div>
        {filerType === 'business' && (
          <p className="text-xs text-ink-400 mt-2">Presumptive income (44AD/44ADA), F&O traders, consultants. Enter income manually on the Income screen.</p>
        )}
      </div>

      <div className="space-y-3">
        {/* ── Required section ── */}
        <p className="text-xs font-semibold text-ink-400 uppercase tracking-wider px-1">Required</p>

        {/* 1. Broker P&L */}
        <DocumentCard
          n={1}
          label="Broker Tax P&L"
          hint="Zerodha · Groww · Upstox (.xlsx)"
          subhint="Console → Reports → Tax P&L → FY 2025-26, Q1–Q4"
          required
          formats=".xlsx"
          slot={brokerSlot}
          onFile={handleBrokerFile}
          onRemove={() => { setBrokerSlot(idle()); filesRef.current.broker = null }}
        >
          {brokerSlot.broker === 'unknown' && brokerSlot.diagnostic && (
            <div className="mt-3">
              <details>
                <summary className="text-xs text-amber-600 cursor-pointer font-medium hover:text-amber-800">
                  ▶ View file structure (share this to get help)
                </summary>
                <pre className="mt-2 text-xs bg-amber-50 border border-amber-200 rounded-lg p-3 overflow-x-auto font-mono text-amber-800 whitespace-pre-wrap">
{brokerSlot.diagnostic}
                </pre>
              </details>
              <button
                onClick={() => setBrokerSlot(s => ({ ...s, status: 'valid' }))}
                className="mt-2 btn-secondary text-xs"
              >
                Proceed anyway (AI assist will be used)
              </button>
            </div>
          )}
        </DocumentCard>

        {/* 2. Form 16 — multi-slot */}
        <div className="card">
          <div className="flex items-center gap-2 mb-1">
            <StepBadge n={2} done={form16Slots.some(s => s.status === 'valid')} required={form16Required} />
            <h2 className="font-medium text-ink-900">Form 16</h2>
            <span className="text-xs text-ink-400">· one per employer</span>
            {!form16Required && (
              <span className="ml-1 text-xs font-normal text-ink-400 bg-ink-100 px-2 py-0.5 rounded-full">Optional — business filer</span>
            )}
          </div>
          <p className="text-xs text-ink-300 font-mono mb-3">From employer — text-based PDF only · AY 2026-27</p>

          <div className="space-y-2">
            {form16Slots.map((slot, idx) => (
              <div key={idx}>
                {slot.file ? (
                  <FileCard
                    file={slot.file}
                    status={slot.status as any}
                    errorMsg={slot.errorMsg}
                    badge={slot.badge}
                    onRemove={() => removeForm16Slot(idx)}
                  />
                ) : (
                  <FileDropZone accept=".pdf" onFile={f => handleForm16File(f, idx)}>
                    <div className="py-2 text-sm text-ink-400">
                      <span className="font-medium text-ink-600">
                        {idx === 0 ? 'Drop Form 16 PDF here' : `Drop Form 16 #${idx + 1} here`}
                      </span> or click to browse
                      <p className="text-xs font-mono text-ink-300 mt-1">.pdf (text-based only)</p>
                    </div>
                  </FileDropZone>
                )}
              </div>
            ))}
          </div>

          {form16Slots.length < maxForm16 && form16Slots.every(s => s.file !== null) && (
            <button
              onClick={addForm16Slot}
              className="mt-3 text-xs text-brand-600 hover:text-brand-800 font-medium flex items-center gap-1"
            >
              + Add another Form 16
              <span className="text-ink-400 font-normal">(for job change)</span>
            </button>
          )}
        </div>

        {/* ── Optional section ── */}
        <p className="text-xs font-semibold text-ink-400 uppercase tracking-wider px-1 pt-2">
          Optional — improves accuracy
        </p>

        {/* 3. MF Capital Gains Statement */}
        <DocumentCard
          n={3}
          label="MF Capital Gains Statement"
          hint="CAMS / KFintech (.json preferred / .pdf)"
          subhint="camsonline.com → Mailback → Capital Gains"
          formats=".json, .pdf"
          slot={mfSlot}
          onFile={handleMFFile}
          onRemove={() => { setMFSlot(idle()); filesRef.current.mf = null }}
        >
          {mfSlot.file?.name.endsWith('.pdf') && mfSlot.status === 'valid' && (
            <div className="mt-2">
              <WarningBanner severity="info" message="JSON format gives higher accuracy. Download JSON from CAMS/KFintech for best results." />
            </div>
          )}
        </DocumentCard>

        {/* 4. Form 26AS */}
        <DocumentCard
          n={4}
          label="Form 26AS"
          hint="TRACES → View 26AS → Download (.pdf / .xlsx)"
          subhint="Adds TDS credits and advance tax details"
          formats=".pdf, .xlsx"
          slot={form26ASSlot}
          onFile={handleForm26ASFile}
          onRemove={() => { setForm26ASSlot(idle()); filesRef.current.form26AS = null }}
        />

        {/* 5. AIS / TIS */}
        <DocumentCard
          n={5}
          label="AIS / TIS"
          hint="IT portal → AIS → Download JSON"
          subhint="Enables cross-validation of all income values"
          formats=".json, .pdf"
          slot={aisSlot}
          onFile={handleAISFile}
          onRemove={() => { setAISSlot(idle()); filesRef.current.ais = null }}
        />

        {/* 6. Previous Year ITR (JSON preferred / XML) */}
        <DocumentCard
          n={6}
          label="Previous Year ITR"
          hint="Your AY 2025-26 filed ITR (.json or .xml)"
          subhint="IT portal → e-File → View Filed Returns → Download JSON or Download XML"
          formats=".json, .xml"
          slot={prevITRSlot}
          onFile={handlePrevITRFile}
          onRemove={() => { setPrevITRSlot(idle()); filesRef.current.previousITR = null }}
        />
      </div>

      <div className="mt-6">
        <button onClick={handleParse} disabled={!allRequired} className="btn-primary">
          Parse documents <ArrowRightIcon />
        </button>
        {!allRequired && (
          <p className="text-xs text-ink-400 mt-2">form16Required ? 'Upload Broker P&L and at least one Form 16 to continue' : 'Upload Broker P&L to continue'</p>
        )}
      </div>
    </div>
  )
}

// ─── DocumentCard sub-component ───────────────────────────────────────────────

interface DocumentCardProps {
  n: number
  label: string
  hint: string
  subhint?: string
  required?: boolean
  formats: string
  slot: SlotState
  onFile: (f: File) => void
  onRemove: () => void
  children?: React.ReactNode
}

function DocumentCard({ n, label, hint, subhint, required, formats, slot, onFile, onRemove, children }: DocumentCardProps) {
  return (
    <div className="card">
      <div className="flex items-center gap-2 mb-1">
        <StepBadge n={n} done={slot.status === 'valid'} required={required} />
        <h2 className="font-medium text-ink-900">{label}</h2>
        {!required && (
          <span className="ml-1 text-xs font-normal text-ink-400 bg-ink-100 px-2 py-0.5 rounded-full">Optional</span>
        )}
      </div>
      <p className="text-xs text-ink-400 mb-1">{hint}</p>
      {subhint && <p className="text-xs text-ink-300 font-mono mb-3">{subhint}</p>}

      {slot.file ? (
        <>
          <FileCard
            file={slot.file}
            status={slot.status as any}
            broker={slot.broker}
            errorMsg={slot.errorMsg}
            badge={slot.badge}
            onRemove={onRemove}
          />
          {children}
        </>
      ) : (
        <FileDropZone accept={formats.split(', ').join(',')} onFile={onFile}>
          <div className="py-2 text-sm text-ink-400">
            <span className="font-medium text-ink-600">Drop file here</span> or click to browse
            <p className="text-xs font-mono text-ink-300 mt-1">{formats}</p>
          </div>
        </FileDropZone>
      )}
    </div>
  )
}

// ─── StepBadge ───────────────────────────────────────────────────────────────

function StepBadge({ n, done, required }: { n: number; done: boolean; required?: boolean }) {
  if (done) return (
    <span className="w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center shrink-0 bg-emerald-500 text-white">✓</span>
  )
  if (required) return (
    <span className="w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center shrink-0 bg-red-100 text-red-600 ring-1 ring-red-300">{n}</span>
  )
  return (
    <span className="w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center shrink-0 bg-ink-100 text-ink-500">{n}</span>
  )
}

// ─── Pending files — v2 shape + v1 compat ────────────────────────────────────

export interface PendingFiles_v2 {
  broker: File | null
  form16: (File | null)[]
  mf: File | null
  form26AS: File | null
  ais: File | null
  previousITR: File | null
}

let _pendingFiles_v2: PendingFiles_v2 | null = null
export function setPendingFiles_v2(f: PendingFiles_v2) { _pendingFiles_v2 = f }
export function getPendingFiles_v2(): PendingFiles_v2 | null { return _pendingFiles_v2 }
export function clearPendingFiles_v2() { _pendingFiles_v2 = null }

// v1 compat — S03Parsing still reads these
interface PendingFiles { broker: File; form16: File; mf: File | null }
let _pendingFiles: PendingFiles | null = null
export function setPendingFiles(files: PendingFiles) { _pendingFiles = files }
export function getPendingFiles(): PendingFiles | null { return _pendingFiles }
export function clearPendingFiles() { _pendingFiles = null }
