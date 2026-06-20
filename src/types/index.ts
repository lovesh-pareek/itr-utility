// ─── Core domain types ───────────────────────────────────────────────────────

export type BrokerName = 'zerodha' | 'groww' | 'upstox' | 'unknown'

export interface EquityTrade {
  scrip: string
  buyDate: string        // ISO date
  sellDate: string       // ISO date
  quantity: number
  buyPrice: number
  sellPrice: number
  netGainLoss: number
  holdingDays: number
  gainType: 'STCG' | 'LTCG'
}

export interface BrokerData {
  broker: BrokerName
  equityDelivery: {
    trades: EquityTrade[]
    totalSTCG: number
    totalLTCG: number
    totalSTCL: number
    totalLTCL: number
  }
  equityIntraday: {
    turnover: number       // absolute sum of all P&L
    netPnL: number         // positive = profit, negative = loss
  }
  dividends: {
    scrips: { scrip: string; amount: number }[]
    total: number
  }
  hasFnO: boolean
  rawSheetNames: string[]
}

export interface Form16Data {
  grossSalary: number
  standardDeduction: number       // fixed ₹75,000 under New Regime
  professionalTax: number
  netTaxableSalary: number
  tdsDeducted: number
  pan: string
  tanEmployer: string
  employerName: string
  assessmentYear: string          // should be "2026-27"
  unresolvedFields: string[]      // label strings AI needs to map
}

export interface MFTransaction {
  date: string
  type: 'purchase' | 'redemption' | 'switch_in' | 'switch_out' | 'stp'
  units: number
  nav: number
  amount: number
}

export interface MFScheme {
  schemeName: string
  isin: string
  fundOrientation: 'equity' | 'debt'
  transactions: MFTransaction[]
  stcg: number
  ltcg: number
  debtGains: number
}

export interface MFData {
  schemes: MFScheme[]
  totalEquitySTCG: number
  totalEquityLTCG: number
  totalDebtGains: number
  investorPan?: string
}

// ─── Schedule types ───────────────────────────────────────────────────────────

export interface ScheduleS {
  grossSalary: number
  standardDeduction: number
  professionalTax: number
  netTaxableSalary: number
  source: string
}

export interface ScheduleBP {
  speculativeTurnover: number
  netSpeculativePnL: number       // positive = income, negative = loss
  setOffThisYear: number
  carryForward: number
}

export interface ScheduleCG {
  // Equity delivery
  equitySTCG: number
  equityLTCG: number
  // MF
  mfEquitySTCG: number
  mfEquityLTCG: number
  // Debt MF (slab rate)
  debtMFGains: number
  // Gross before set-off
  grossSTCG: number
  grossLTCG: number
  // After ₹1.25L exemption
  ltcgExemption: number
  taxableLTCG: number
  // Losses
  stcl: number
  ltcl: number
  // Net after set-off
  netSTCG: number
  netLTCG: number
}

export interface ScheduleOS {
  dividendIncome: number
  interestIncome: number
  total: number
}

export interface CYLASetOff {
  intradayProfitAbsorbed: number
  stcgAbsorbed: number
  ltcgAbsorbed: number
  remainingIntradayLoss: number
  remainingSTCL: number
  remainingLTCL: number
}

export interface ScheduleCYLA {
  setOffs: CYLASetOff
  netSalaryIncome: number
  netIntradayIncome: number
  netSTCG: number
  netLTCG: number
  netOtherSources: number
}

export interface ScheduleCFL {
  intradayLossCarryForward: number    // up to 4 years
  stclCarryForward: number            // up to 8 years
  ltclCarryForward: number            // up to 8 years
  targetAY: string                    // "2027-28"
}

export interface Schedules {
  S: ScheduleS
  BP: ScheduleBP
  CG: ScheduleCG
  OS: ScheduleOS
  CYLA: ScheduleCYLA
  CFL: ScheduleCFL
}

// ─── Tax computation ──────────────────────────────────────────────────────────

export interface TaxComputation {
  // Income aggregates
  totalIncome: number
  slabTaxableIncome: number

  // Tax lines
  slabTax: number
  stcgTax: number             // STCG × 20%
  ltcgTax: number             // taxable LTCG × 12.5%
  subtotalBeforeSurcharge: number
  surcharge: number
  totalBeforeCess: number
  cess: number                // 4%
  totalTaxPayable: number

  // Rebate
  section87AEligible: boolean
  section87ARebate: number

  // Payments
  tdsDeducted: number
  advanceTaxPaid: number

  // Final
  netPayable: number          // positive = payable, negative = refund
}

// ─── Warnings ─────────────────────────────────────────────────────────────────

export type WarningSeverity = 'info' | 'warn' | 'error'

export type WarningId =
  | 'AIS_MISMATCH_RISK'
  | 'FNO_DETECTED'
  | 'CARRY_FORWARD_DEADLINE'
  | 'LTCG_EXEMPTION_CAP'
  | 'NEW_REGIME_CONFIRMED'
  | 'INTRADAY_LOSS_RESTRICTION'
  | 'SCANNED_PDF'
  | 'BROKER_NOT_RECOGNISED'
  | 'AI_CALL_MADE'
  | 'XML_SCHEMA_ERROR'
  | 'SURCHARGE_APPLICABLE'

export interface Warning {
  id: WarningId
  severity: WarningSeverity
  message: string
  scheduleRef?: keyof Schedules
}

// ─── AI call log ──────────────────────────────────────────────────────────────

export type AICallType = 'broker_detection' | 'form16_mapping'

export interface AICallEntry {
  callId: string
  timestamp: string
  callType: AICallType
  triggerReason: string
  payloadSummary: string
  responseSummary: string
  wasUseful: boolean | null
  ruleGap: string
}

// ─── Parse status ─────────────────────────────────────────────────────────────

export type ParseState = 'idle' | 'parsing' | 'done' | 'error' | 'needs-ai'

export interface ParseStatus {
  brokerPL: ParseState
  form16: ParseState
  mfStatement: ParseState
  errors: Record<string, string>
}

// ─── App state ────────────────────────────────────────────────────────────────

export type AppStep =
  | 'upload'
  | 'parsing'
  | 'review'
  | 'summary'
  | 'export'

export interface UploadedFilesMeta {
  brokerPL: { name: string; size: number } | null
  form16: { name: string; size: number } | null
  mfStatement: { name: string; size: number } | null
}

export interface AppState {
  // Session
  sessionId: string
  savedAt: string | null
  step: AppStep

  // Uploaded file metadata (persisted — actual File objects are not)
  uploadedFilesMeta: UploadedFilesMeta

  // Parsed raw data
  parsed: {
    broker: BrokerData | null
    form16: Form16Data | null
    mfStatement: MFData | null
    detectedBroker: BrokerName | null
  }

  // Computed schedules
  schedules: Schedules | null

  // Tax computation output
  tax: TaxComputation | null

  // Manual overrides — keyed by field path e.g. "S.grossSalary"
  overrides: Record<string, number>

  // Warnings — derived, not persisted
  warnings: Warning[]

  // AI call log
  aiCallLog: AICallEntry[]

  // Parse status — not persisted
  parseStatus: ParseStatus

  // UI state — last active review tab
  lastReviewTab: string
}

// ─── Context actions ──────────────────────────────────────────────────────────

export type AppAction =
  | { type: 'SET_STEP'; step: AppStep }
  | { type: 'SET_UPLOADED_FILES_META'; meta: UploadedFilesMeta }
  | { type: 'SET_PARSED_BROKER'; data: BrokerData; broker: BrokerName }
  | { type: 'SET_PARSED_FORM16'; data: Form16Data }
  | { type: 'SET_PARSED_MF'; data: MFData }
  | { type: 'SET_SCHEDULES'; schedules: Schedules }
  | { type: 'SET_TAX'; tax: TaxComputation }
  | { type: 'SET_OVERRIDE'; fieldPath: string; value: number }
  | { type: 'CLEAR_OVERRIDE'; fieldPath: string }
  | { type: 'SET_WARNINGS'; warnings: Warning[] }
  | { type: 'SET_PARSE_STATUS'; key: keyof Omit<ParseStatus, 'errors'>; status: ParseState }
  | { type: 'SET_PARSE_ERROR'; key: string; message: string }
  | { type: 'ADD_AI_LOG_ENTRY'; entry: AICallEntry }
  | { type: 'SET_AI_LOG_USEFUL'; callId: string; wasUseful: boolean }
  | { type: 'RESTORE_SESSION'; state: Partial<AppState> }
  | { type: 'CLEAR_SESSION' }
  | { type: 'SET_SAVED_AT'; timestamp: string }
  | { type: 'SET_LAST_REVIEW_TAB'; tab: string }

// ─── Persisted session shape (subset of AppState) ────────────────────────────

export interface PersistedSession {
  sessionId: string
  savedAt: string
  step: AppStep
  uploadedFilesMeta: UploadedFilesMeta
  parsed: AppState['parsed']
  schedules: Schedules | null
  tax: TaxComputation | null
  overrides: Record<string, number>
  aiCallLog: AICallEntry[]
}
