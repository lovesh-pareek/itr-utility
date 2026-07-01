import { useRef, useState, useCallback } from 'react'
import type { BrokerName } from '../../types'
import { CheckIcon, ErrorIcon, XIcon } from '../shared'

// ─── FileDropZone ─────────────────────────────────────────────────────────────

interface FileDropZoneProps {
  accept: string          // e.g. ".xlsx,.xls"
  onFile: (file: File) => void
  disabled?: boolean
  children?: React.ReactNode
}

export function FileDropZone({ accept, onFile, disabled, children }: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (disabled) return
    const file = e.dataTransfer.files[0]
    if (file) onFile(file)
  }, [onFile, disabled])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onFile(file)
    // Reset so same file can be re-selected
    e.target.value = ''
  }, [onFile])

  return (
    <div
      onClick={() => !disabled && inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); if (!disabled) setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`
        border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all
        ${disabled
          ? 'border-ink-100 bg-ink-50 cursor-not-allowed opacity-50'
          : dragging
          ? 'border-ink-400 bg-ink-50 scale-[1.01]'
          : 'border-ink-200 hover:border-ink-400 hover:bg-ink-50'
        }
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        className="hidden"
        disabled={disabled}
      />
      {children ?? (
        <div className="text-sm text-ink-400">
          <span className="font-medium text-ink-600">Drop file here</span> or click to browse
          <p className="text-xs font-mono text-ink-300 mt-1">{accept}</p>
        </div>
      )}
    </div>
  )
}

// ─── FileCard ─────────────────────────────────────────────────────────────────

interface FileCardProps {
  file: File
  status: 'pending' | 'valid' | 'error' | 'checking'
  broker?: BrokerName | null
  errorMsg?: string
  badge?: string
  onRemove: () => void
}

export function FileCard({ file, status, broker, errorMsg, badge, onRemove }: FileCardProps) {
  const sizeStr = file.size < 1024 * 1024
    ? `${(file.size / 1024).toFixed(1)} KB`
    : `${(file.size / (1024 * 1024)).toFixed(1)} MB`

  return (
    <div className={`
      rounded-xl border px-4 py-3 flex items-start gap-3 transition-colors
      ${status === 'error'
        ? 'bg-rose-50 border-rose-200'
        : status === 'valid'
        ? 'bg-emerald-50 border-emerald-200'
        : 'bg-white border-[var(--color-border)]'
      }
    `}>
      {/* Status icon */}
      <div className="shrink-0 mt-0.5">
        {status === 'checking' ? (
          <Spinner />
        ) : status === 'valid' ? (
          <CheckIcon className="text-emerald-500" />
        ) : status === 'error' ? (
          <ErrorIcon className="text-rose-500" />
        ) : (
          <FileIcon />
        )}
      </div>

      {/* File info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink-900 truncate">{file.name}</p>
        <p className="text-xs text-ink-400 font-mono">{sizeStr}</p>
        {broker && broker !== 'unknown' && (
          <BrokerBadge broker={broker} />
        )}
        {broker === 'unknown' && (
          <span className="inline-flex items-center gap-1 mt-1 text-xs bg-amber-50 border border-amber-200 text-amber-700 px-2 py-0.5 rounded-full">
            ⚠ Broker not recognised — AI assist will be used
          </span>
        )}
        {status === 'error' && errorMsg && (
          <p className="mt-1 text-xs text-rose-600">{errorMsg}</p>
        )}
        {status === 'valid' && badge && (
          <span className="inline-flex items-center mt-1 text-xs bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded-full">
            {badge}
          </span>
        )}
      </div>

      {/* Remove */}
      <button
        onClick={onRemove}
        className="shrink-0 p-1 text-ink-300 hover:text-ink-700 transition-colors rounded"
        title="Remove file"
      >
        <XIcon />
      </button>
    </div>
  )
}

// ─── BrokerBadge ─────────────────────────────────────────────────────────────

const BROKER_LABELS: Record<string, string> = {
  zerodha: 'Zerodha',
  groww: 'Groww',
  upstox: 'Upstox',
}

interface BrokerBadgeProps {
  broker: BrokerName
}

export function BrokerBadge({ broker }: BrokerBadgeProps) {
  if (broker === 'unknown') return null
  return (
    <span className="inline-flex items-center gap-1 mt-1 text-xs bg-sky-50 border border-sky-200 text-sky-700 px-2 py-0.5 rounded-full font-medium">
      ✓ {BROKER_LABELS[broker] ?? broker} detected
    </span>
  )
}

// ─── ScannedPDFError ──────────────────────────────────────────────────────────

export function ScannedPDFError() {
  return (
    <div className="banner-error mt-2">
      <ErrorIcon className="text-rose-500 shrink-0 mt-0.5" />
      <div>
        <p className="font-medium">Scanned PDF detected</p>
        <p className="mt-0.5">
          Please obtain a text-based PDF from your employer or CAMS/KFintech.
          Scanned (image-based) PDFs cannot be parsed.
        </p>
      </div>
    </div>
  )
}

// ─── Spinner ──────────────────────────────────────────────────────────────────

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg className={`w-4 h-4 animate-spin text-ink-400 ${className}`} viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="28" strokeDashoffset="10" strokeLinecap="round" />
    </svg>
  )
}

// ─── FileIcon ─────────────────────────────────────────────────────────────────

function FileIcon() {
  return (
    <svg className="w-4 h-4 text-ink-300" viewBox="0 0 16 16" fill="none">
      <path d="M3 2h7l3 3v9a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M10 2v3h3" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}
