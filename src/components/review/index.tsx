import { useState } from 'react'
import { useAppDispatch } from '../../context/AppContext'

// ─── Currency formatter ───────────────────────────────────────────────────────

export function fmtINR(n: number): string {
  return '₹' + Math.abs(n).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

export function fmtINRSigned(n: number): string {
  return (n < 0 ? '−' : '') + fmtINR(n)
}

// ─── EditableField ────────────────────────────────────────────────────────────

interface EditableFieldProps {
  label: string
  fieldPath: string           // e.g. "S.grossSalary"
  value: number               // current computed value (with overrides applied)
  isOverridden: boolean       // true if override exists for this field
  fixed?: boolean             // if true, not editable (e.g. standard deduction)
  negative?: boolean          // display as negative
  indent?: boolean
  note?: string               // small note shown next to value
}

export function EditableField({
  label,
  fieldPath,
  value,
  isOverridden,
  fixed = false,
  negative = false,
  indent = false,
  note,
}: EditableFieldProps) {
  const { setOverride, clearOverride } = useAppDispatch()
  const [editing, setEditing] = useState(false)
  const [inputVal, setInputVal] = useState('')

  function startEdit() {
    if (fixed) return
    setInputVal(String(Math.round(value)))
    setEditing(true)
  }

  function commitEdit() {
    const parsed = parseFloat(inputVal.replace(/,/g, ''))
    if (!isNaN(parsed)) {
      setOverride(fieldPath, parsed)
    }
    setEditing(false)
  }

  function revert() {
    clearOverride(fieldPath)
    setEditing(false)
  }

  const displayVal = negative ? -Math.abs(value) : value

  return (
    <div className={`flex items-center justify-between py-2 border-b border-[var(--color-border)] last:border-0 ${indent ? 'pl-4' : ''}`}>
      {/* Label */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className={`text-sm ${indent ? 'text-ink-500' : 'text-ink-700'}`}>{label}</span>
        {note && <span className="text-xs text-ink-300">({note})</span>}
        {fixed && <span className="text-xs text-ink-300 font-mono">(fixed)</span>}
      </div>

      {/* Value / edit */}
      <div className="flex items-center gap-2 shrink-0">
        {editing ? (
          <div className="flex items-center gap-1">
            <span className="text-sm text-ink-400">₹</span>
            <input
              type="number"
              value={inputVal}
              onChange={e => setInputVal(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditing(false) }}
              className="w-28 input-field text-right py-1 text-sm"
              autoFocus
            />
            {isOverridden && (
              <button onClick={revert} className="text-xs text-amber-600 hover:text-amber-800 underline">
                Revert
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className={`font-mono text-sm ${
              isOverridden ? 'overridden text-amber-700' :
              displayVal < 0 ? 'text-rose-600' : 'text-ink-900'
            }`}>
              {displayVal < 0 ? '−' : ''}{fmtINR(displayVal)}
            </span>
            {!fixed && (
              <button
                onClick={startEdit}
                className="text-ink-300 hover:text-ink-700 transition-colors p-0.5 rounded"
                title="Edit value"
              >
                <EditIcon />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── ScheduleSection ─────────────────────────────────────────────────────────

interface ScheduleSectionProps {
  title: string
  source?: string
  children: React.ReactNode
  warning?: string
}

export function ScheduleSection({ title, source, children, warning }: ScheduleSectionProps) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="font-display font-semibold text-ink-800">{title}</h3>
        {source && (
          <span className="text-xs font-mono bg-ink-50 border border-ink-100 text-ink-400 px-2 py-0.5 rounded-full">
            {source}
          </span>
        )}
      </div>
      {warning && (
        <div className="banner-warn mb-3 text-xs">
          <span>⚠</span><p>{warning}</p>
        </div>
      )}
      <div className="card p-0 overflow-hidden">
        <div className="px-4">{children}</div>
      </div>
    </div>
  )
}

// ─── SummaryRow (non-editable total row) ─────────────────────────────────────

interface SummaryRowProps {
  label: string
  value: number
  bold?: boolean
  positive?: boolean
}

export function SummaryRow({ label, value, bold, positive }: SummaryRowProps) {
  return (
    <div className={`flex items-center justify-between py-2.5 border-t border-[var(--color-border)] ${bold ? 'bg-ink-50 -mx-4 px-4' : ''}`}>
      <span className={`text-sm ${bold ? 'font-semibold text-ink-900' : 'text-ink-600'}`}>{label}</span>
      <span className={`font-mono text-sm font-semibold ${
        positive && value > 0 ? 'text-emerald-600' :
        value < 0 ? 'text-rose-600' : 'text-ink-900'
      }`}>
        {value < 0 ? '−' : ''}{fmtINR(value)}
      </span>
    </div>
  )
}

// ─── TaxRow (for tax computation table) ──────────────────────────────────────

interface TaxRowProps {
  label: string
  value: number
  indent?: boolean
  muted?: boolean
  isTotal?: boolean
}

export function TaxRow({ label, value, indent, muted, isTotal }: TaxRowProps) {
  return (
    <div className={`flex justify-between py-2 ${
      isTotal ? 'border-t-2 border-ink-200 mt-1 pt-3' :
      'border-b border-[var(--color-border)] last:border-0'
    } ${indent ? 'pl-4' : ''}`}>
      <span className={`text-sm ${muted ? 'text-ink-400' : isTotal ? 'font-semibold text-ink-900' : 'text-ink-700'}`}>
        {label}
      </span>
      <span className={`font-mono text-sm ${
        muted ? 'text-ink-300' :
        isTotal ? 'font-bold text-ink-900' :
        value < 0 ? 'text-emerald-600' : 'text-ink-700'
      }`}>
        {value < 0 ? '−' : ''}{fmtINR(value)}
      </span>
    </div>
  )
}

// ─── EditIcon ─────────────────────────────────────────────────────────────────

function EditIcon() {
  return (
    <svg className="w-3.5 h-3.5" viewBox="0 0 14 14" fill="none">
      <path d="M10 2l2 2-7 7H3V9l7-7z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  )
}
