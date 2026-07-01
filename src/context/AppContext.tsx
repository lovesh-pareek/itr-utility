import React, {
  createContext,
  useContext,
  useReducer,
  useCallback,
  type ReactNode,
} from 'react'
import { v4 as uuidv4 } from 'uuid'
import type {
  AppState,
  AppAction,
  ParseStatus,
  ParseStatus_v2,
  Schedules,
  TaxComputation,
  Warning,
  FilerProfile,
} from '../types'

// ─── Initial state ────────────────────────────────────────────────────────────

const initialParseStatus: ParseStatus = {
  brokerPL: 'idle',
  form16: 'idle',
  mfStatement: 'idle',
  errors: {},
}

const initialParseStatus_v2: ParseStatus_v2 = {
  form26AS: 'idle',
  ais: 'idle',
  previousITR: 'idle',
  errors: {},
}

const initialFilerProfile: FilerProfile = {
  dateOfBirth: null,
  filerCategory: 'general',
}

export const initialState: AppState = {
  sessionId: uuidv4(),
  savedAt: null,
  step: 'upload',

  uploadedFilesMeta: {
    brokerPL: null,
    form16: null,
    mfStatement: null,
  },

  parsed: {
    broker: null,
    form16: null,
    mfStatement: null,
    detectedBroker: null,
    // v2
    form16List: [],
    form26AS: null,
    aisData: null,
    priorITRCFL: [],
  },

  schedules: null,
  tax: null,
  overrides: {},
  warnings: [],
  aiCallLog: [],
  parseStatus: initialParseStatus,
  parseStatus_v2: initialParseStatus_v2,
  lastReviewTab: 'Schedule S',

  // v2 slices
  selectedAY: '2026-27',
  selectedRegime: 'new',
  selectedITRForm: 'ITR3',
  detectedITRForm: null,
  filerProfile: initialFilerProfile,
  deductions: null,
  taxCredits: null,
  regimeComparison: null,
  aisMismatches: [],
  aisMismatchResolutions: {},
  bankAccounts: [],
  scheduleAL: null,
  schedules_v2: null,
}

// ─── Reducer ──────────────────────────────────────────────────────────────────

export function appReducer_test(state: AppState, action: AppAction): AppState { return appReducer(state, action) }

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_STEP':
      return { ...state, step: action.step }

    case 'SET_UPLOADED_FILES_META':
      return { ...state, uploadedFilesMeta: action.meta }

    case 'SET_PARSED_BROKER':
      return {
        ...state,
        parsed: {
          ...state.parsed,
          broker: action.data,
          detectedBroker: action.broker,
        },
        parseStatus: { ...state.parseStatus, brokerPL: 'done' },
      }

    case 'SET_PARSED_FORM16':
      return {
        ...state,
        parsed: { ...state.parsed, form16: action.data },
        parseStatus: { ...state.parseStatus, form16: 'done' },
      }

    case 'SET_PARSED_MF':
      return {
        ...state,
        parsed: { ...state.parsed, mfStatement: action.data },
        parseStatus: { ...state.parseStatus, mfStatement: 'done' },
      }

    case 'SET_SCHEDULES':
      return { ...state, schedules: action.schedules }

    case 'SET_TAX':
      return { ...state, tax: action.tax }

    case 'SET_OVERRIDE':
      return {
        ...state,
        overrides: { ...state.overrides, [action.fieldPath]: action.value },
      }

    case 'CLEAR_OVERRIDE': {
      const next = { ...state.overrides }
      delete next[action.fieldPath]
      return { ...state, overrides: next }
    }

    case 'SET_WARNINGS':
      return { ...state, warnings: action.warnings }

    case 'SET_PARSE_STATUS':
      return {
        ...state,
        parseStatus: { ...state.parseStatus, [action.key]: action.status },
      }

    case 'SET_PARSE_ERROR':
      return {
        ...state,
        parseStatus: {
          ...state.parseStatus,
          errors: { ...state.parseStatus.errors, [action.key]: action.message },
        },
      }

    case 'ADD_AI_LOG_ENTRY':
      return { ...state, aiCallLog: [...state.aiCallLog, action.entry] }

    case 'SET_AI_LOG_USEFUL':
      return {
        ...state,
        aiCallLog: state.aiCallLog.map(entry =>
          entry.callId === action.callId
            ? { ...entry, wasUseful: action.wasUseful }
            : entry
        ),
      }

    case 'RESTORE_SESSION':
      return {
        ...state,
        ...action.state,
        // Never restore parse status or warnings — always recomputed
        parseStatus: initialParseStatus,
        parseStatus_v2: initialParseStatus_v2,
        lastReviewTab: action.state.lastReviewTab ?? 'Schedule S',
        warnings: [],
      }

    case 'CLEAR_SESSION':
      return { ...initialState, sessionId: uuidv4() }

    case 'SET_SAVED_AT':
      return { ...state, savedAt: action.timestamp }

    case 'SET_LAST_REVIEW_TAB':
      return { ...state, lastReviewTab: action.tab }

    // ── v2 actions ───────────────────────────────────────────────────────────

    case 'SET_PARSED_FORM16_LIST':
      return { ...state, parsed: { ...state.parsed, form16List: action.data, form16: action.data[0] ?? null } }

    case 'SET_PARSED_FORM26AS':
      return {
        ...state,
        parsed: { ...state.parsed, form26AS: action.data },
        parseStatus_v2: { ...state.parseStatus_v2, form26AS: 'done' },
      }

    case 'SET_PARSED_AIS':
      return {
        ...state,
        parsed: { ...state.parsed, aisData: action.data },
        parseStatus_v2: { ...state.parseStatus_v2, ais: 'done' },
      }

    case 'SET_PRIOR_ITR_CFL':
      return {
        ...state,
        parsed: { ...state.parsed, priorITRCFL: action.entries },
        parseStatus_v2: { ...state.parseStatus_v2, previousITR: 'done' },
      }

    case 'SET_SELECTED_REGIME':
      return { ...state, selectedRegime: action.regime }

    case 'SET_SELECTED_ITR_FORM':
      return { ...state, selectedITRForm: action.form }

    case 'SET_DETECTED_ITR_FORM':
      return { ...state, detectedITRForm: action.form }

    case 'SET_FILER_PROFILE':
      return { ...state, filerProfile: action.profile }

    case 'SET_DEDUCTIONS':
      return { ...state, deductions: action.deductions }

    case 'SET_TAX_CREDITS':
      return { ...state, taxCredits: action.credits }

    case 'SET_REGIME_COMPARISON':
      return { ...state, regimeComparison: action.comparison }

    case 'SET_AIS_MISMATCHES':
      return { ...state, aisMismatches: action.mismatches }

    case 'SET_AIS_MISMATCH_RESOLUTION':
      return {
        ...state,
        aisMismatchResolutions: {
          ...state.aisMismatchResolutions,
          [action.field]: action.resolution,
        },
      }

    case 'SET_BANK_ACCOUNTS':
      return { ...state, bankAccounts: action.accounts }

    case 'ADD_BANK_ACCOUNT':
      return { ...state, bankAccounts: [...state.bankAccounts, action.account] }

    case 'REMOVE_BANK_ACCOUNT':
      return { ...state, bankAccounts: state.bankAccounts.filter(a => a.id !== action.id) }

    case 'SET_SCHEDULE_AL':
      return { ...state, scheduleAL: action.scheduleAL }

    case 'SET_SCHEDULES_V2':
      return { ...state, schedules_v2: action.schedules }

    default:
      return state
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface AppContextValue {
  state: AppState
  dispatch: React.Dispatch<AppAction>
  // Convenience selectors
  schedules: Schedules | null
  tax: TaxComputation | null
  warnings: Warning[]
  hasSession: boolean
}

const AppContext = createContext<AppContextValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState)

  const contextValue: AppContextValue = {
    state,
    dispatch,
    schedules: state.schedules,
    tax: state.tax,
    warnings: state.warnings,
    hasSession: state.savedAt !== null,
  }

  return (
    <AppContext.Provider value={contextValue}>
      {children}
    </AppContext.Provider>
  )
}

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useAppContext must be used within AppProvider')
  return ctx
}

// ─── Typed dispatch helpers ───────────────────────────────────────────────────

export function useAppDispatch() {
  const { dispatch } = useAppContext()

  const setStep = useCallback(
    (step: AppState['step']) => dispatch({ type: 'SET_STEP', step }),
    [dispatch]
  )

  const setOverride = useCallback(
    (fieldPath: string, value: number) =>
      dispatch({ type: 'SET_OVERRIDE', fieldPath, value }),
    [dispatch]
  )

  const clearOverride = useCallback(
    (fieldPath: string) => dispatch({ type: 'CLEAR_OVERRIDE', fieldPath }),
    [dispatch]
  )

  const setParseStatus = useCallback(
    (
      key: keyof Omit<ParseStatus, 'errors'>,
      status: AppState['parseStatus']['brokerPL']
    ) => dispatch({ type: 'SET_PARSE_STATUS', key, status }),
    [dispatch]
  )

  const setAILogUseful = useCallback(
    (callId: string, wasUseful: boolean) =>
      dispatch({ type: 'SET_AI_LOG_USEFUL', callId, wasUseful }),
    [dispatch]
  )

  const clearSession = useCallback(
    () => dispatch({ type: 'CLEAR_SESSION' }),
    [dispatch]
  )

  return {
    dispatch,
    setStep,
    setOverride,
    clearOverride,
    setParseStatus,
    setAILogUseful,
    clearSession,
  }
}
