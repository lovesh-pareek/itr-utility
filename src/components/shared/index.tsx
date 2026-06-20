import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import type { WarningSeverity } from '../../types'

// ─── AppShell ─────────────────────────────────────────────────────────────────

interface AppShellProps {
  children: React.ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const isSettings = location.pathname.startsWith('/settings')

  return (
    <div className="min-h-screen bg-[var(--color-bg)] flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-40 bg-white border-b border-[var(--color-border)] px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
          >
            <div className="w-7 h-7 rounded-lg bg-ink-900 flex items-center justify-center">
              <span className="text-white text-xs font-bold font-display">ITR</span>
            </div>
            <span className="font-display font-semibold text-ink-900 text-sm tracking-tight">
              Filing Utility
            </span>
          </button>
          <span className="hidden sm:inline text-ink-300 text-sm">·</span>
          <span className="hidden sm:inline text-ink-400 text-xs font-mono">
            FY 2025-26 · AY 2026-27
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-ink-400 hidden md:inline">
            All processing is local — nothing leaves your browser
          </span>
          <button
            onClick={() => navigate('/settings')}
            className={`p-2 rounded-lg transition-colors ${
              isSettings
                ? 'bg-ink-100 text-ink-900'
                : 'text-ink-400 hover:text-ink-700 hover:bg-ink-50'
            }`}
            title="Settings"
          >
            <SettingsIcon />
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 px-4 sm:px-6 py-6 max-w-3xl mx-auto w-full">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--color-border)] px-6 py-3 text-center">
        <p className="text-xs text-ink-300">
          ITR Filing Utility v1.0 · This is a preparation aid — verify all values before filing
        </p>
      </footer>
    </div>
  )
}

// ─── StepProgress ─────────────────────────────────────────────────────────────

const STEPS = [
  { label: 'Upload', route: '/upload' },
  { label: 'Review', route: '/review' },
  { label: 'Summary', route: '/summary' },
]

export function StepProgress() {
  const location = useLocation()

  const currentStepIndex = STEPS.findIndex(
    s => location.pathname === s.route || location.pathname.startsWith(s.route + '/')
  )

  // Special case: parsing is between upload and review
  const effectiveIndex = location.pathname === '/parsing'
    ? 0.5
    : currentStepIndex

  return (
    <div className="flex items-center gap-0 mb-6">
      {STEPS.map((step, i) => {
        const isDone = effectiveIndex > i
        const isActive = Math.floor(effectiveIndex) === i || (effectiveIndex === 0.5 && i === 0)

        return (
          <React.Fragment key={step.route}>
            <div className="flex items-center gap-2">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  isDone
                    ? 'bg-emerald-500 text-white'
                    : isActive
                    ? 'bg-ink-900 text-white'
                    : 'bg-ink-100 text-ink-400'
                }`}
              >
                {isDone ? (
                  <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  i + 1
                )}
              </div>
              <span
                className={`text-sm font-medium transition-colors ${
                  isDone || isActive ? 'text-ink-900' : 'text-ink-400'
                }`}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`flex-1 h-px mx-3 transition-colors ${
                  effectiveIndex > i ? 'bg-emerald-400' : 'bg-ink-200'
                }`}
              />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ─── WarningBanner ────────────────────────────────────────────────────────────

interface WarningBannerProps {
  severity: WarningSeverity
  message: string
  action?: { label: string; onClick: () => void }
  onDismiss?: () => void
}

export function WarningBanner({ severity, message, action, onDismiss }: WarningBannerProps) {
  const styles = {
    info: { container: 'banner-info', icon: <InfoIcon className="text-sky-500 shrink-0 mt-0.5" /> },
    warn: { container: 'banner-warn', icon: <WarnIcon className="text-amber-500 shrink-0 mt-0.5" /> },
    error: { container: 'banner-error', icon: <ErrorIcon className="text-rose-500 shrink-0 mt-0.5" /> },
  }

  const { container, icon } = styles[severity]

  return (
    <div className={container}>
      {icon}
      <div className="flex-1">
        <p>{message}</p>
        {action && (
          <button
            onClick={action.onClick}
            className="mt-1 text-xs font-medium underline hover:no-underline"
          >
            {action.label}
          </button>
        )}
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
        >
          <XIcon />
        </button>
      )}
    </div>
  )
}

// ─── MetricCard ───────────────────────────────────────────────────────────────

interface MetricCardProps {
  label: string
  value: string
  colorState?: 'neutral' | 'positive' | 'warning' | 'negative'
  subtext?: string
}

export function MetricCard({ label, value, colorState = 'neutral', subtext }: MetricCardProps) {
  const valueColor = {
    neutral: 'text-ink-900',
    positive: 'text-emerald-600',
    warning: 'text-amber-600',
    negative: 'text-rose-600',
  }[colorState]

  const borderColor = {
    neutral: 'border-[var(--color-border)]',
    positive: 'border-emerald-200',
    warning: 'border-amber-200',
    negative: 'border-rose-200',
  }[colorState]

  const bgColor = {
    neutral: 'bg-white',
    positive: 'bg-emerald-50',
    warning: 'bg-amber-50',
    negative: 'bg-rose-50',
  }[colorState]

  return (
    <div className={`rounded-xl border ${borderColor} ${bgColor} p-4`}>
      <p className="text-xs font-medium uppercase tracking-wider text-ink-400 mb-1">{label}</p>
      <p className={`font-display text-2xl font-bold ${valueColor} leading-none`}>{value}</p>
      {subtext && <p className="text-xs text-ink-400 mt-1">{subtext}</p>}
    </div>
  )
}

// ─── AICallBanner ─────────────────────────────────────────────────────────────

interface AICallBannerProps {
  callType: string
  onViewPayload: () => void
}

export function AICallBanner({ callType, onViewPayload }: AICallBannerProps) {
  return (
    <div className="banner-info">
      <InfoIcon className="text-sky-500 shrink-0 mt-0.5" />
      <div>
        <p className="font-medium">AI assist used for {callType}</p>
        <p className="mt-0.5">
          Only document structure was sent — no amounts, names, or personal data.{' '}
          <button onClick={onViewPayload} className="underline hover:no-underline font-medium">
            View what was sent →
          </button>
        </p>
      </div>
    </div>
  )
}

// ─── SourceTag ────────────────────────────────────────────────────────────────

interface SourceTagProps {
  source: string
}

export function SourceTag({ source }: SourceTagProps) {
  return (
    <span className="inline-flex items-center gap-1 bg-ink-50 border border-ink-100 text-ink-400 text-xs px-2 py-0.5 rounded-full font-mono">
      {source}
    </span>
  )
}

// ─── Divider ──────────────────────────────────────────────────────────────────

export function Divider() {
  return <hr className="border-[var(--color-border)] my-4" />
}

// ─── Section header ───────────────────────────────────────────────────────────

interface SectionHeaderProps {
  title: string
  source?: string
  actions?: React.ReactNode
}

export function SectionHeader({ title, source, actions }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-3">
      <div className="flex items-center gap-2">
        <h3 className="font-display font-semibold text-ink-900 text-base">{title}</h3>
        {source && <SourceTag source={source} />}
      </div>
      {actions}
    </div>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────

export function InfoIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={`w-4 h-4 ${className}`} viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 7v4M8 5.5v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function WarnIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={`w-4 h-4 ${className}`} viewBox="0 0 16 16" fill="none">
      <path d="M8 2L14.5 13.5H1.5L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M8 6.5v3M8 11v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function ErrorIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={`w-4 h-4 ${className}`} viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 6l4 4M10 6l-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function CheckIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={`w-4 h-4 ${className}`} viewBox="0 0 16 16" fill="none">
      <path d="M3 8l4 4 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function SettingsIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={`w-4 h-4 ${className}`} viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3m10 0h1.5M3.2 3.2l1 1M11.8 11.8l1 1M12.8 3.2l-1 1M4.2 11.8l-1 1"
        stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function XIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={`w-4 h-4 ${className}`} viewBox="0 0 16 16" fill="none">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

export function ArrowRightIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={`w-4 h-4 ${className}`} viewBox="0 0 16 16" fill="none">
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function DownloadIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={`w-4 h-4 ${className}`} viewBox="0 0 16 16" fill="none">
      <path d="M8 2v8M5 7l3 3 3-3M2 13h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function ThumbsUpIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={`w-4 h-4 ${className}`} viewBox="0 0 16 16" fill="none">
      <path d="M5 7L7 2a1 1 0 011 1v3h4a1 1 0 011 1l-1 5H5V7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M5 7H3v6h2V7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}

export function ThumbsDownIcon({ className = '' }: { className?: string }) {
  return (
    <svg className={`w-4 h-4 ${className}`} viewBox="0 0 16 16" fill="none">
      <path d="M11 9L9 14a1 1 0 01-1-1v-3H4a1 1 0 01-1-1l1-5h8v6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M11 9h2V3h-2v6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  )
}
