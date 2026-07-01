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
    turnover: number
    netPnL: number
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
  standardDeduction: number
  professionalTax: number
  netTaxableSalary: number
  tdsDeducted: number
  pan: string
  tanEmployer: string
  employerName: string
  assessmentYear: string
  unresolvedFields: string[]
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

// ─── Schedule types (v1.0) ────────────────────────────────────────────────────

export interface ScheduleS {
  grossSalary: number
  standardDeduction: number
  professionalTax: number
  netTaxableSalary: number
  source: string
}

export interface ScheduleBP {
  speculativeTurnover: number
  netSpeculativePnL: number
  setOffThisYear: number
  carryForward: number
}

export interface ScheduleCG {
  equitySTCG: number
  equityLTCG: number
  mfEquitySTCG: number
  mfEquityLTCG: number
  debtMFGains: number
  grossSTCG: number
  grossLTCG: number
  ltcgExemption: number
  taxableLTCG: number
  stcl: number
  ltcl: number
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
  intradayLossCarryForward: number
  stclCarryForward: number
  ltclCarryForward: number
  targetAY: string
  deadlineForCFL?: string
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
  totalIncome: number
  slabTaxableIncome: number
  slabTax: number
  stcgTax: number
  ltcgTax: number
  subtotalBeforeSurcharge: number
  surcharge: number
  totalBeforeCess: number
  cess: number
  totalTaxPayable: number
  section87AEligible: boolean
  section87ARebate: number
  tdsDeducted: number
  advanceTaxPaid: number
  netPayable: number
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
  // v2.0 additions
  | 'HP_LOSS_RING_FENCED'
  | 'FNO_NOT_COMPUTED'
  | 'PROPERTY_CII_NOT_FOUND'
  | 'OLD_REGIME_NO_DEDUCTIONS'
  | 'SCHEDULE_AL_REQUIRED'
  | 'SENIOR_NO_80TTB'
  | 'DOB_NOT_ENTERED'
  | 'ITR4_MIXED_INCOME'

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
  sessionId: string
  savedAt: string | null
  step: AppStep
  uploadedFilesMeta: UploadedFilesMeta
  parsed: {
    broker: BrokerData | null
    form16: Form16Data | null
    mfStatement: MFData | null
    detectedBroker: BrokerName | null
    // v2 additions
    form16List: Form16Data[]
    form26AS: Form26ASData | null
    aisData: AISData | null
    priorITRCFL: CFLEntry[]
  }
  schedules: Schedules | null
  tax: TaxComputation | null
  overrides: Record<string, number>
  warnings: Warning[]
  aiCallLog: AICallEntry[]
  parseStatus: ParseStatus
  parseStatus_v2: ParseStatus_v2
  lastReviewTab: string
  // ── v2 additions ───────────────────────────────────────────────────────────
  selectedAY: string                    // e.g. '2026-27'
  selectedRegime: 'new' | 'old'
  selectedITRForm: ITRForm
  detectedITRForm: ITRForm | null
  filerProfile: FilerProfile
  deductions: DeductionsVI_A | null
  taxCredits: TaxCredits | null
  regimeComparison: RegimeComparison | null
  aisMismatches: AISMismatch[]
  aisMismatchResolutions: Record<string, 'use_ais' | 'keep_parsed'>
  bankAccounts: BankAccount[]
  scheduleAL: ScheduleAL | null
  schedules_v2: Schedules_v2 | null
}

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
  // ── v2 actions ─────────────────────────────────────────────────────────────
  | { type: 'SET_PARSED_FORM16_LIST'; data: Form16Data[] }
  | { type: 'SET_PARSED_FORM26AS'; data: Form26ASData }
  | { type: 'SET_PARSED_AIS'; data: AISData }
  | { type: 'SET_PRIOR_ITR_CFL'; entries: CFLEntry[] }
  | { type: 'SET_SELECTED_AY'; ay: string }
  | { type: 'SET_SELECTED_REGIME'; regime: 'new' | 'old' }
  | { type: 'SET_SELECTED_ITR_FORM'; form: ITRForm }
  | { type: 'SET_DETECTED_ITR_FORM'; form: ITRForm }
  | { type: 'SET_FILER_PROFILE'; profile: FilerProfile }
  | { type: 'SET_DEDUCTIONS'; deductions: DeductionsVI_A }
  | { type: 'SET_TAX_CREDITS'; credits: TaxCredits }
  | { type: 'SET_REGIME_COMPARISON'; comparison: RegimeComparison }
  | { type: 'SET_AIS_MISMATCHES'; mismatches: AISMismatch[] }
  | { type: 'SET_AIS_MISMATCH_RESOLUTION'; field: string; resolution: 'use_ais' | 'keep_parsed' }
  | { type: 'SET_BANK_ACCOUNTS'; accounts: BankAccount[] }
  | { type: 'ADD_BANK_ACCOUNT'; account: BankAccount }
  | { type: 'REMOVE_BANK_ACCOUNT'; id: string }
  | { type: 'SET_SCHEDULE_AL'; scheduleAL: ScheduleAL | null }
  | { type: 'SET_SCHEDULES_V2'; schedules: Schedules_v2 }

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
  // v2 persisted slices
  selectedAY?: string
  selectedRegime?: 'new' | 'old'
  selectedITRForm?: ITRForm
  filerProfile?: FilerProfile
  deductions?: DeductionsVI_A | null
  taxCredits?: TaxCredits | null
  regimeComparison?: RegimeComparison | null
  aisMismatchResolutions?: Record<string, 'use_ais' | 'keep_parsed'>
  bankAccounts?: BankAccount[]
  scheduleAL?: ScheduleAL | null
  schedules_v2?: Schedules_v2 | null
}

// ─── v2.0 Income Model Types ──────────────────────────────────────────────────

// ── Salary v2 ────────────────────────────────────────────────────────────────

export interface EmployerEntry {
  id: string
  employerName: string
  tan: string
  grossSalary: number
  standardDeduction: number      // always 75000 per employer under New Regime
  professionalTax: number
  netTaxableSalary: number
  tdsDeducted: number
  form16Available: boolean
}

export interface ScheduleS_v2 {
  employers: EmployerEntry[]
  totalGross: number
  totalStdDeduction: number
  totalProfessionalTax: number
  totalNetTaxable: number
  totalTDS: number
}

// ── House Property ────────────────────────────────────────────────────────────

export type PropertyType = 'self_occupied' | 'let_out' | 'deemed_let_out'

export interface HouseProperty {
  id: string
  propertyType: PropertyType
  address: string
  coOwnerShare: number
  annualRentReceived: number
  municipalTaxPaid: number
  netAnnualValue: number          // rent - municipal tax (0 for self-occ)
  standardDeduction30pct: number  // 30% of NAV — auto-computed
  interestOnLoan: number          // capped at ₹2L for self-occ under both regimes
  incomeFromHP: number            // NAV - 30% - interest (can be negative)
}

export interface ScheduleHP {
  properties: HouseProperty[]
  totalIncomeFromHP: number
  totalInterest: number
  lossSetOffAgainstSalary: number  // Old Regime only, up to ₹2L
  lossRingFenced: number           // New Regime: ring-fenced, cannot set off
}

// ── Capital Gains v2 ──────────────────────────────────────────────────────────

export interface PropertySale {
  id: string
  address: string
  purchaseDate: string            // ISO date
  saleDate: string
  purchasePrice: number
  salePrice: number
  purchaseFY: string              // e.g. "2015-16" — for CII lookup
  saleFY: string                  // e.g. "2025-26"
  indexedCost: number             // auto-computed: purchasePrice × (CII_sale / CII_purchase)
  improvementCost: number
  transferExpenses: number
  netGain: number                 // salePrice - indexedCost - improvement - transfer
  gainType: 'STCG' | 'LTCG'      // STCG if held ≤ 2 years, LTCG otherwise
  exemptionClaimed: boolean       // Sec 54 / 54EC / 54F
  exemptionAmount: number
}

export interface ScheduleCG_v2 extends ScheduleCG {
  propertySales: PropertySale[]
  propertySTCG: number
  propertyLTCG: number
  totalSTCG: number               // equity + mf + property
  totalLTCG: number
}

// ── Business & Profession v2 ──────────────────────────────────────────────────

export type BPIncomeType = 'speculative' | 'non_speculative' | 'presumptive_44AD' | 'presumptive_44ADA' | 'fno'

export interface PresumptiveEntry {
  type: 'presumptive_44AD' | 'presumptive_44ADA'
  grossReceipts: number
  isDigital: boolean              // 44AD: 6% if digital, 8% if not
  presumptiveRate: number         // auto-set from type + isDigital
  presumptiveIncome: number       // auto-computed
}

export interface FnOEntry {
  turnover: number
  taxableIncome: number
  notComputed: boolean            // always true in v2.0 — user referred to CA
}

export interface ScheduleBP_v2 extends ScheduleBP {
  presumptiveEntries: PresumptiveEntry[]
  fno: FnOEntry | null
  nonSpeculativeIncome: number    // manual entry
  nonSpeculativeLoss: number
}

// ── Other Sources v2 ──────────────────────────────────────────────────────────

export interface OtherSourcesBreakdown {
  savingsInterest: number
  fdInterest: number
  rdInterest: number
  seniorCitizenInterest: number
  dividendIncome: number
  dividendFromForeignCompany: number
  giftReceived: number
  lotteryWinnings: number
  casualIncome: number
  familyPension: number
  familyPensionStdDed: number     // auto-computed: min(pension/3, 15000)
}

export interface ScheduleOS_v2 {
  breakdown: OtherSourcesBreakdown
  totalAtSlabRate: number
  totalAt30Pct: number            // lottery + casual
  total: number
}

// ── CFL v2 ────────────────────────────────────────────────────────────────────

export interface CFLEntry {
  id: string
  lossType: 'speculative' | 'stcl' | 'ltcl' | 'hp' | 'business'
  ayOfOrigin: string              // e.g. "2024-25"
  amount: number
  yearsRemaining: number
  source: 'current_year' | 'prior_itr'
}

export interface ScheduleCFL_v2 {
  entries: CFLEntry[]
  totalSpeculative: number
  totalSTCL: number
  totalLTCL: number
  totalHP: number
  totalBusiness: number
}

// ── Filer Profile ─────────────────────────────────────────────────────────────

export type FilerCategory = 'general' | 'senior' | 'super_senior'

export interface FilerProfile {
  dateOfBirth: string | null      // ISO date e.g. "1960-06-15"
  filerCategory: FilerCategory    // computed from DOB; defaults to 'general' if DOB null
}

// ── Schedule AL ───────────────────────────────────────────────────────────────

export interface ImmovableAsset {
  id: string
  description: string
  assetType: 'residential' | 'commercial' | 'agricultural' | 'other'
  costOfAcquisition: number
}

export interface ScheduleAL {
  immovableAssets: ImmovableAsset[]
  cashInHand: number
  deposits: number                // FD + RD + savings combined
  sharesDebentures: number        // market value as of 31 Mar
  insurancePolicies: number       // surrender value
  loansAdvances: number
  motorVehicles: number
  jewellery: number
  archaeologicalArt: number
  otherAssets: number
  liabilityImmovable: number
  liabilityOther: number
  totalAssets: number             // auto-computed sum
  totalLiabilities: number        // auto-computed sum
}

// ── Deductions VI-A ───────────────────────────────────────────────────────────

export interface DonationEntry {
  institution: string
  amount: number
  deductiblePct: 0.50 | 1.00
  cashAmount: number              // must not exceed ₹2,000
}

export interface DeductionsVI_A {
  sec80C: number
  sec80CCC: number
  sec80CCD1: number
  sec80CCD1B: number
  sec80CCD2: number               // employer NPS — New Regime allowed
  sec80CCH: number                // Agnipath — New Regime allowed
  sec80D_self: number
  sec80D_parents: number
  sec80D_parentsAreSenior: boolean
  sec80E: number
  sec80EEA: number
  sec80G: DonationEntry[]
  sec80GG: number
  sec80TTA: number
  sec80TTB: number
  total: number                   // computed by engine
}

// ── Tax Credits ───────────────────────────────────────────────────────────────

export interface TDSEntry {
  id: string
  tanDeductor: string
  deductorName: string
  grossAmount: number
  tdsAmount: number
  section: string                 // '192' salary, '194' dividend, '194A' interest
  source: 'form16' | 'form26AS' | 'ais' | 'manual'
}

export interface ChallanEntry {
  id: string
  bsrCode: string
  challanDate: string             // ISO date
  serialNumber: string
  amount: number
  assessmentYear: string
  type: 'advance_tax' | 'self_assessment'
}

export interface TaxCredits {
  tdsEntries: TDSEntry[]
  advanceTaxPaid: ChallanEntry[]
  selfAssessmentTax: ChallanEntry[]
  tcsCredits: number
  totalTDSDeducted: number
  totalAdvanceTax: number
  totalSelfAssessment: number
  totalCredits: number
}

// ── Bank Accounts ─────────────────────────────────────────────────────────────

export interface BankAccount {
  id: string
  ifscCode: string
  accountNumber: string           // stored full, displayed masked (last 4)
  bankName: string                // auto-filled from ifsc-prefixes.json
  accountType: 'savings' | 'current' | 'overdraft'
  isRefundAccount: boolean
  isForeign: boolean
  swiftCode?: string
  bankCountry?: string
}

// ── AIS Types ─────────────────────────────────────────────────────────────────

export interface AISMismatch {
  field: string
  fieldLabel: string
  parsedValue: number
  aisValue: number
  delta: number
  deltaPct: number
  severity: 'info' | 'warn' | 'error'
  description: string
}

export interface AISData {
  salary: { employer: string; gross: number; tds: number }[]
  dividends: { company: string; amount: number; tds: number }[]
  interest: { payer: string; type: string; amount: number }[]
  securities: { isin: string; buyValue: number; saleValue: number; gain: number }[]
  mfTransactions: { schemeName: string; redemptionValue: number; gain: number }[]
  tdsCredits: TDSEntry[]
  advanceTax: ChallanEntry[]
}

// ── Form 26AS Types ───────────────────────────────────────────────────────────

export interface Form26ASData {
  partA: TDSEntry[]               // TDS deducted by deductors
  partC: ChallanEntry[]           // Advance tax / self-assessment
  ay: string
}

// ── Schedules v2 ─────────────────────────────────────────────────────────────

export interface Schedules_v2 {
  S: ScheduleS_v2
  HP: ScheduleHP
  CG: ScheduleCG_v2
  BP: ScheduleBP_v2
  OS: ScheduleOS_v2
  CYLA: ScheduleCYLA
  CFL: ScheduleCFL_v2
}

// ── ITR Form ──────────────────────────────────────────────────────────────────

export type ITRForm = 'ITR1' | 'ITR2' | 'ITR3' | 'ITR4'

// ── Regime Comparison ─────────────────────────────────────────────────────────

export interface RegimeComparison {
  new: TaxComputation
  old: TaxComputation
  recommended: 'new' | 'old'
  saving: number
}

// ── Parse Status v2 ───────────────────────────────────────────────────────────

export interface ParseStatus_v2 {
  form26AS: ParseState
  ais: ParseState
  previousITR: ParseState
  errors: Record<string, string>
}
