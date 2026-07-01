import { useEffect, useCallback } from 'react'
import { useAppContext } from '../context/AppContext'
import type { PersistedSession, AICallEntry } from '../types'

const SESSION_KEY = 'itr_utility_fy2526_session'
const AI_LOG_KEY = 'itr_utility_ai_log'
const DEADLINE = new Date('2026-07-31T23:59:59')

// ─── Session storage ──────────────────────────────────────────────────────────

export function useSessionPersistence() {
  const { state, dispatch } = useAppContext()

  // On mount: check for existing session and restore if valid
  useEffect(() => {
    const raw = localStorage.getItem(SESSION_KEY)
    if (!raw) return

    try {
      const saved: PersistedSession = JSON.parse(raw)

      // Auto-clear after deadline
      if (new Date() > DEADLINE) {
        localStorage.removeItem(SESSION_KEY)
        localStorage.removeItem(AI_LOG_KEY)
        return
      }

      dispatch({ type: 'RESTORE_SESSION', state: saved })
    } catch {
      // Corrupt data — clear it
      localStorage.removeItem(SESSION_KEY)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only on mount

  // Save session whenever relevant state changes
  const saveSession = useCallback(() => {
    try {
      const toSave: PersistedSession = {
        sessionId: state.sessionId,
        savedAt: new Date().toISOString(),
        step: state.step,
        uploadedFilesMeta: state.uploadedFilesMeta,
        parsed: state.parsed,
        schedules: state.schedules,
        tax: state.tax,
        overrides: state.overrides,
        aiCallLog: state.aiCallLog,
        // v2 slices
        selectedAY: state.selectedAY,
        selectedRegime: state.selectedRegime,
        selectedITRForm: state.selectedITRForm,
        filerProfile: state.filerProfile,
        deductions: state.deductions,
        taxCredits: state.taxCredits,
        regimeComparison: state.regimeComparison,
        aisMismatchResolutions: state.aisMismatchResolutions,
        bankAccounts: state.bankAccounts,
        scheduleAL: state.scheduleAL,
        schedules_v2: state.schedules_v2,
      }

      localStorage.setItem(SESSION_KEY, JSON.stringify(toSave))
      dispatch({ type: 'SET_SAVED_AT', timestamp: toSave.savedAt })
    } catch (e) {
      // localStorage quota exceeded
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        window.dispatchEvent(new CustomEvent('storage-quota-exceeded'))
      }
    }
  }, [state, dispatch])

  const clearSession = useCallback(() => {
    localStorage.removeItem(SESSION_KEY)
    localStorage.removeItem(AI_LOG_KEY)
    dispatch({ type: 'CLEAR_SESSION' })
  }, [dispatch])

  // Auto-save when step, parsed data, tax, or overrides change
  useEffect(() => {
    if (state.parsed.broker || state.parsed.form16 || state.parsed.mfStatement) {
      saveSession()
    }
  }, [state.step, state.parsed, state.schedules, state.tax, state.overrides, saveSession])

  return { saveSession, clearSession }
}

// ─── Load persisted session (used by S01 for resume prompt) ──────────────────

export function loadPersistedSession(): PersistedSession | null {
  const raw = localStorage.getItem(SESSION_KEY)
  if (!raw) return null

  try {
    const saved: PersistedSession = JSON.parse(raw)
    if (new Date() > DEADLINE) {
      localStorage.removeItem(SESSION_KEY)
      localStorage.removeItem(AI_LOG_KEY)
      return null
    }
    return saved
  } catch {
    return null
  }
}

// ─── Storage size helper ──────────────────────────────────────────────────────

export function getStorageSize(): number {
  let total = 0
  for (const key of [SESSION_KEY, AI_LOG_KEY]) {
    const val = localStorage.getItem(key)
    if (val) total += val.length * 2 // UTF-16 chars = 2 bytes each
  }
  return total
}

// ─── AI log storage ───────────────────────────────────────────────────────────

export function useAILog() {
  const appendEntry = useCallback((entry: AICallEntry) => {
    try {
      const raw = localStorage.getItem(AI_LOG_KEY)
      const log: AICallEntry[] = raw ? JSON.parse(raw) : []
      log.push(entry)
      localStorage.setItem(AI_LOG_KEY, JSON.stringify(log))
    } catch {
      // Silently fail if quota exceeded — entry still in memory via AppContext
    }
  }, [])

  const updateEntry = useCallback((callId: string, wasUseful: boolean) => {
    try {
      const raw = localStorage.getItem(AI_LOG_KEY)
      if (!raw) return
      const log: AICallEntry[] = JSON.parse(raw)
      const idx = log.findIndex(e => e.callId === callId)
      if (idx !== -1) {
        log[idx] = { ...log[idx], wasUseful }
        localStorage.setItem(AI_LOG_KEY, JSON.stringify(log))
      }
    } catch {
      // Silently fail
    }
  }, [])

  const exportLog = useCallback(() => {
    const raw = localStorage.getItem(AI_LOG_KEY) ?? '[]'
    const blob = new Blob([raw], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'itr_ai_log.json'
    a.click()
    URL.revokeObjectURL(url)
  }, [])

  return { appendEntry, updateEntry, exportLog }
}

// ─── Deadline helper ──────────────────────────────────────────────────────────

export function getDaysToDeadline(): number | null {
  const now = new Date()
  const diff = DEADLINE.getTime() - now.getTime()
  if (diff < 0) return null
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
  return days <= 30 ? days : null
}

export function formatSavedAt(isoTimestamp: string): string {
  const d = new Date(isoTimestamp)
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
