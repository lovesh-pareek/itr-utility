import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { StepProgress, WarningBanner, ArrowRightIcon } from '../components/shared'
import { FileDropZone, FileCard } from '../components/upload'
import { useAppContext } from '../context/AppContext'
import { detectBroker, readExcelFile, extractWorkbookMeta } from '../parsers/brokerDetection'
import type { BrokerName } from '../types'

interface UploadSlot {
  file: File | null
  status: 'idle' | 'checking' | 'valid' | 'error'
  broker?: BrokerName | null
  errorMsg?: string
  diagnostic?: string   // shows raw sheet/column info when unknown
}

const initialSlot = (): UploadSlot => ({ file: null, status: 'idle' })

export default function S02Upload() {
  const navigate = useNavigate()
  const { dispatch } = useAppContext()

  const [brokerSlot, setBrokerSlot] = useState<UploadSlot>(initialSlot())
  const [form16Slot, setForm16Slot] = useState<UploadSlot>(initialSlot())
  const [mfSlot, setMFSlot] = useState<UploadSlot>(initialSlot())

  const filesRef = useRef<{ broker: File | null; form16: File | null; mf: File | null }>({
    broker: null, form16: null, mf: null,
  })

  // MF statement is optional — broker P&L and Form 16 are required
  const allValid =
    brokerSlot.status === 'valid' &&
    form16Slot.status === 'valid'

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
        // Generate diagnostic to help the user / developer
        const meta = extractWorkbookMeta(wb)
        const sheetInfo = meta.sheetNames.map(s =>
          `  "${s}": [${(meta.columnHeaders[s] ?? []).map(c => `"${c}"`).join(', ')}]`
        ).join('\n')
        const diagnostic = `Sheet names & columns found:\n${sheetInfo}\n\nExpected for Zerodha: sheet containing "equity" with columns "Scrip" or "Symbol" and "Trade Type" or "Type".`
        setBrokerSlot({ file, status: 'error', broker: 'unknown', errorMsg: 'Broker not recognised — see details below', diagnostic })
      } else {
        setBrokerSlot({ file, status: 'valid', broker: detected })
      }
    } catch (err) {
      setBrokerSlot({ file, status: 'error', errorMsg: `Could not read file: ${(err as Error).message}` })
    }
  }

  async function handleForm16File(file: File) {
    if (!file.name.match(/\.pdf$/i)) {
      setForm16Slot({ file, status: 'error', errorMsg: 'Invalid file type — please upload a PDF' })
      return
    }
    setForm16Slot({ file, status: 'checking' })
    filesRef.current.form16 = file
    try {
      const { extractPDFText } = await import('../parsers/pdfExtractor')
      const result = await extractPDFText(file)
      if (result.isScanned) {
        setForm16Slot({ file, status: 'error', errorMsg: 'Scanned PDF detected. Please obtain a text-based Form 16 from your employer.' })
      } else {
        setForm16Slot({ file, status: 'valid' })
      }
    } catch {
      setForm16Slot({ file, status: 'valid' })
    }
  }

  function handleMFFile(file: File) {
    if (!file.name.match(/\.(json|pdf)$/i)) {
      setMFSlot({ file, status: 'error', errorMsg: 'Invalid file type — please upload a JSON or PDF file' })
      return
    }
    filesRef.current.mf = file
    setMFSlot({ file, status: 'valid' })
  }

  function handleParse() {
    const { broker: bFile, form16: fFile, mf: mFile } = filesRef.current
    if (!bFile || !fFile) return
    dispatch({
      type: 'SET_UPLOADED_FILES_META',
      meta: {
        brokerPL: { name: bFile.name, size: bFile.size },
        form16: { name: fFile.name, size: fFile.size },
        mfStatement: mFile ? { name: mFile.name, size: mFile.size } : null,
      },
    })
    dispatch({ type: 'SET_STEP', step: 'parsing' })
    setPendingFiles({ broker: bFile, form16: fFile, mf: mFile ?? null })
    navigate('/parsing')
  }

  return (
    <div>
      <StepProgress />
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink-900 mb-1">Upload your documents</h1>
        <p className="text-ink-500 text-sm">Step 1 of 3 — Broker P&L and Form 16 are required</p>
      </div>

      <div className="space-y-4">
        {/* Broker P&L */}
        <div className="card">
          <div className="flex items-center gap-2 mb-1">
            <StepBadge n={1} done={brokerSlot.status === 'valid'} />
            <h2 className="font-medium text-ink-900">Broker Tax P&L</h2>
          </div>
          <p className="text-xs text-ink-400 mb-1">Zerodha · Groww · Upstox · Excel (.xlsx)</p>
          <p className="text-xs text-ink-300 font-mono mb-3">Console → Reports → Tax P&L → FY 2025-26, Q1–Q4</p>
          {brokerSlot.file ? (
            <>
              <FileCard
                file={brokerSlot.file}
                status={brokerSlot.status as 'valid' | 'error' | 'checking' | 'pending'}
                broker={brokerSlot.broker}
                errorMsg={brokerSlot.errorMsg}
                onRemove={() => { setBrokerSlot(initialSlot()); filesRef.current.broker = null }}
              />
              {/* Diagnostic block for unknown broker */}
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
                  <p className="text-xs text-ink-500 mt-2">
                    If this is a Zerodha file, please share the sheet names and columns above so we can add support.
                    The app will use AI assist as a fallback — you can still proceed.
                  </p>
                  <button
                    onClick={() => {
                      // Allow proceeding with unknown broker — AI fallback handles it
                      setBrokerSlot(s => ({ ...s, status: 'valid' }))
                    }}
                    className="mt-2 btn-secondary text-xs"
                  >
                    Proceed anyway (AI assist will be used)
                  </button>
                </div>
              )}
            </>
          ) : (
            <FileDropZone accept=".xlsx,.xls,.ods" onFile={handleBrokerFile}>
              <div className="py-2 text-sm text-ink-400">
                <span className="font-medium text-ink-600">Drop Excel file here</span> or click to browse
                <p className="text-xs font-mono text-ink-300 mt-1">.xlsx</p>
              </div>
            </FileDropZone>
          )}
        </div>

        {/* Form 16 */}
        <div className="card">
          <div className="flex items-center gap-2 mb-1">
            <StepBadge n={2} done={form16Slot.status === 'valid'} />
            <h2 className="font-medium text-ink-900">Form 16</h2>
          </div>
          <p className="text-xs text-ink-400 mb-1">From your employer · Text-based PDF only</p>
          <p className="text-xs text-ink-300 font-mono mb-3">Must cover AY 2026-27</p>
          {form16Slot.file ? (
            <FileCard
              file={form16Slot.file}
              status={form16Slot.status as 'valid' | 'error' | 'checking' | 'pending'}
              errorMsg={form16Slot.errorMsg}
              onRemove={() => { setForm16Slot(initialSlot()); filesRef.current.form16 = null }}
            />
          ) : (
            <FileDropZone accept=".pdf" onFile={handleForm16File}>
              <div className="py-2 text-sm text-ink-400">
                <span className="font-medium text-ink-600">Drop PDF here</span> or click to browse
                <p className="text-xs font-mono text-ink-300 mt-1">.pdf (text-based only)</p>
              </div>
            </FileDropZone>
          )}
        </div>

        {/* MF Statement */}
        <div className="card">
          <div className="flex items-center gap-2 mb-1">
            <StepBadge n={3} done={mfSlot.status === 'valid'} />
            <h2 className="font-medium text-ink-900">
              MF Capital Gains Statement
              <span className="ml-2 text-xs font-normal text-ink-400 bg-ink-100 px-2 py-0.5 rounded-full">Optional</span>
            </h2>
          </div>
          <p className="text-xs text-ink-400 mb-1">CAMS or KFintech · JSON preferred · Skip if no MF redemptions</p>
          <p className="text-xs text-ink-300 font-mono mb-3">camsonline.com → Mailback → Capital Gains</p>
          {mfSlot.file ? (
            <FileCard
              file={mfSlot.file}
              status={mfSlot.status as 'valid' | 'error' | 'checking' | 'pending'}
              errorMsg={mfSlot.errorMsg}
              onRemove={() => { setMFSlot(initialSlot()); filesRef.current.mf = null }}
            />
          ) : (
            <FileDropZone accept=".json,.pdf" onFile={handleMFFile}>
              <div className="py-2 text-sm text-ink-400">
                <span className="font-medium text-ink-600">Drop JSON or PDF here</span> or click to browse
                <p className="text-xs font-mono text-ink-300 mt-1">.json (preferred) · .pdf</p>
              </div>
            </FileDropZone>
          )}
          {mfSlot.file?.name.endsWith('.pdf') && mfSlot.status === 'valid' && (
            <div className="mt-2">
              <WarningBanner severity="info" message="PDF accepted — JSON format gives higher accuracy. Download JSON from CAMS/KFintech for best results." />
            </div>
          )}
        </div>
      </div>

      <div className="mt-6">
        <button onClick={handleParse} disabled={!allValid} className="btn-primary">
          Parse documents <ArrowRightIcon />
        </button>
        {!allValid && <p className="text-xs text-ink-400 mt-2">Upload Broker P&L and Form 16 to continue</p>}
      </div>
    </div>
  )
}

function StepBadge({ n, done }: { n: number; done: boolean }) {
  return (
    <span className={`w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${done ? 'bg-emerald-500 text-white' : 'bg-ink-100 text-ink-500'}`}>
      {done ? '✓' : n}
    </span>
  )
}

interface PendingFiles { broker: File; form16: File; mf: File | null }
let _pendingFiles: PendingFiles | null = null
export function setPendingFiles(files: PendingFiles) { _pendingFiles = files }
export function getPendingFiles(): PendingFiles | null { return _pendingFiles }
export function clearPendingFiles() { _pendingFiles = null }
