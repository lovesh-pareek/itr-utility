import type {
  ScheduleS_v2, ScheduleHP, ScheduleCG_v2, ScheduleBP_v2, ScheduleOS_v2,
  ScheduleCFL_v2, CFLEntry, ITRForm, Warning, WarningId,
  WarningSeverity,
} from '../types'
import { getRules } from './taxRules'
import { getTotalPresumptiveIncome, getNetNonSpeculativeIncome } from './scheduleBP_v2'

// ─── Total income aggregation ─────────────────────────────────────────────────

export interface TotalIncome_v2 {
  salaryIncome: number          // after std deduction, prof tax
  hpIncome: number              // net HP income (can be negative for New Regime ring-fenced)
  cgSTCG: number                // net STCG after set-off
  cgLTCG: number                // taxable LTCG after exemption
  businessSpeculative: number   // net intraday P&L (positive only)
  businessPresumptive: number   // total presumptive income
  businessFnO: number           // F&O taxable income (user-entered)
  businessNonSpeculative: number // net non-speculative income
  otherSourcesSlabRate: number
  otherSourcesFlat30: number
  totalSlabIncome: number       // income taxed at slab rates
  totalIncome: number           // grand total
}

/**
 * Compute total income v2 with full set-off rules for both regimes.
 *
 * Set-off order:
 *   1. HP loss → salary (Old Regime only, up to ₹2L); ring-fenced under New Regime
 *   2. Non-speculative business loss → all non-salary heads
 *   3. STCL → STCG first, then LTCG
 *   4. LTCL → LTCG only
 *   5. Speculative loss → speculative income only (ring-fenced)
 *   6. HP loss (New Regime) → ring-fenced, no set-off
 */
export function computeTotalIncome_v2(
  S: ScheduleS_v2,
  HP: ScheduleHP,
  CG: ScheduleCG_v2,
  BP: ScheduleBP_v2,
  OS: ScheduleOS_v2,
  regime: 'new' | 'old'
): TotalIncome_v2 {
  let salaryIncome = S.totalNetTaxable

  // HP loss set-off
  let hpIncome = HP.totalIncomeFromHP
  if (regime === 'old' && HP.lossSetOffAgainstSalary > 0) {
    salaryIncome = Math.max(0, salaryIncome - HP.lossSetOffAgainstSalary)
  }
  // New Regime: HP loss is ring-fenced (hpIncome stays negative but not set off)

  // Business income components
  // Speculative (intraday): ring-fenced — loss cannot offset other heads
  const businessSpeculative = Math.max(0, BP.netSpeculativePnL)
  const businessPresumptive = getTotalPresumptiveIncome(BP.presumptiveEntries)

  // F&O income/loss is non-speculative business income per Indian tax law.
  // Combine F&O with other non-speculative business income/loss into a single pool.
  const fnoIncome = BP.fno?.taxableIncome ?? 0
  const netNonSpec = getNetNonSpeculativeIncome(BP) + fnoIncome

  // Positive non-speculative income goes to slab; negative becomes loss for set-off
  const businessNonSpeculative = Math.max(0, netNonSpec)
  const nonSpecLoss = Math.max(0, -netNonSpec)

  // Non-speculative business loss set-off (can offset any head EXCEPT salary):
  //   Order: Other Sources → STCG → LTCG → HP income (Old Regime)
  let cgSTCGBase = CG.totalSTCG
  let cgLTCGBase = CG.totalLTCG
  let otherSourcesSlabRate = OS.totalAtSlabRate
  let remainingNonSpecLoss = nonSpecLoss

  if (remainingNonSpecLoss > 0) {
    // First: set off against Other Sources (slab rate portion)
    const absorbedFromOS = Math.min(remainingNonSpecLoss, otherSourcesSlabRate)
    otherSourcesSlabRate -= absorbedFromOS
    remainingNonSpecLoss -= absorbedFromOS

    // Then: set off against STCG
    const absorbedFromSTCG = Math.min(remainingNonSpecLoss, cgSTCGBase)
    cgSTCGBase -= absorbedFromSTCG
    remainingNonSpecLoss -= absorbedFromSTCG

    // Then: set off against LTCG
    const absorbedFromLTCG = Math.min(remainingNonSpecLoss, cgLTCGBase)
    cgLTCGBase -= absorbedFromLTCG
    remainingNonSpecLoss -= absorbedFromLTCG

    // Old Regime: can also offset against HP income (positive only)
    if (regime === 'old' && remainingNonSpecLoss > 0 && hpIncome > 0) {
      const absorbedFromHP = Math.min(remainingNonSpecLoss, hpIncome)
      hpIncome -= absorbedFromHP
      remainingNonSpecLoss -= absorbedFromHP
    }
  }

  // CG loss set-off (STCL/LTCL are already in CG.stcl/ltcl from ScheduleCG)
  // Note: intra-CG set-off done in scheduleCG; here we use post-set-off values
  const cgSTCG = cgSTCGBase
  const cgLTCG = cgLTCGBase  // taxableLTCG already applied exemption

  const otherSourcesFlat30 = OS.totalAt30Pct
  const debtMFGains = ((CG as any).debtMFGains ?? 0) as number

  // F&O income for reporting: positive portion already in businessNonSpeculative,
  // negative already absorbed via set-off. Report the raw value for display.
  const businessFnO = fnoIncome

  // Total slab income: salary (after HP set-off) + speculative profit + presumptive +
  //   non-speculative (incl. F&O net positive) + OS slab (after set-off) + debt MF gains
  const totalSlabIncome =
    salaryIncome +
    businessSpeculative +
    businessPresumptive +
    businessNonSpeculative +
    otherSourcesSlabRate +
    debtMFGains

  const totalIncome =
    totalSlabIncome +
    cgSTCG +
    cgLTCG +
    otherSourcesFlat30 +
    (regime === 'new' ? 0 : Math.max(0, hpIncome))

  return {
    salaryIncome,
    hpIncome,
    cgSTCG,
    cgLTCG,
    businessSpeculative,
    businessPresumptive,
    businessFnO,
    businessNonSpeculative,
    otherSourcesSlabRate,
    otherSourcesFlat30,
    totalSlabIncome,
    totalIncome,
  }
}

// ─── ITR Form detection ───────────────────────────────────────────────────────

/**
 * Detect the appropriate ITR form based on income profile.
 *
 * Evaluation order (most complex → simplest):
 * 1. Has non-presumptive business, speculative intraday, or F&O → ITR-3
 * 2. Has presumptive AND (salary OR CG OR HP) → ITR-3 (mixed profile)
 * 3. Has presumptive ONLY, no other complex income → ITR-4
 * 4. Has CG OR multiple HP OR foreign income, no business → ITR-2
 * 5. Salary + ≤1 HP + OS only, total income ≤ ₹50L, no CG, no business → ITR-1
 * 6. Fallback → ITR-2
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function detectITRForm(
  S: ScheduleS_v2,
  HP: ScheduleHP,
  CG: ScheduleCG_v2,
  BP: ScheduleBP_v2,
  _OS: ScheduleOS_v2,
  totalIncome: number,
  ay = '2026-27'
): ITRForm {
  const rules = getRules(ay, 'new')
  const ITR1_INCOME_LIMIT = rules.surchargeThresholds.scheduleALRequired  // ₹50L

  const hasIntraday = BP.netSpeculativePnL !== 0 || BP.speculativeTurnover > 0
  const hasFnO = BP.fno !== null && BP.fno.turnover > 0
  const hasNonSpeculative = BP.nonSpeculativeIncome > 0 || BP.nonSpeculativeLoss > 0
  const hasPresumptive = BP.presumptiveEntries.length > 0
  const hasAnyBusinessIncome = hasIntraday || hasFnO || hasNonSpeculative
  const hasCG = CG.totalSTCG > 0 || CG.totalLTCG > 0 || CG.propertySales.length > 0
  const hasMultipleHP = HP.properties.length > 1
  // hasSingleHP reserved for future ITR-1 simplified flow
  const hasSalary = S.totalNetTaxable > 0

  // Rule 1: Any non-presumptive business → ITR-3
  if (hasAnyBusinessIncome) return 'ITR3'

  // Rule 2: Presumptive + other complex income → ITR-3
  if (hasPresumptive && (hasSalary || hasCG || HP.properties.length > 0)) return 'ITR3'

  // Rule 3: Presumptive ONLY → ITR-4
  if (hasPresumptive && !hasSalary && !hasCG && HP.properties.length === 0) return 'ITR4'

  // Rule 4: CG or multiple HP or no business → ITR-2
  if (hasCG || hasMultipleHP) return 'ITR2'

  // Rule 5: Simple salary + ≤1 HP + OS, total ≤ ₹50L → ITR-1
  if (
    hasSalary &&
    !hasCG &&
    !hasAnyBusinessIncome &&
    !hasPresumptive &&
    !hasMultipleHP &&
    totalIncome <= ITR1_INCOME_LIMIT
  ) {
    return 'ITR1'
  }

  // Fallback
  return 'ITR2'
}

// ─── Schedule AL requirement ──────────────────────────────────────────────────

/**
 * Returns true if Schedule AL is required.
 * Required when: total income > ₹50L AND form is ITR-2 or ITR-3.
 * ITR-1 and ITR-4 never require Schedule AL.
 */
export function computeScheduleALRequired(
  totalIncome: number,
  selectedITRForm: ITRForm,
  ay = '2026-27'
): boolean {
  if (selectedITRForm === 'ITR1' || selectedITRForm === 'ITR4') return false
  const rules = getRules(ay, 'new')
  return totalIncome > rules.surchargeThresholds.scheduleALRequired
}

// ─── Warnings v2 ─────────────────────────────────────────────────────────────

/**
 * Compute v2 warnings — extends v1.0 warning set.
 */
export function computeWarnings_v2(
  BP: ScheduleBP_v2,
  HP: ScheduleHP,
  regime: 'new' | 'old',
  totalIncome: number,
  selectedITRForm: ITRForm,
  filerCategory: import('../types').FilerCategory,
  dobEntered: boolean,
  deductionsTotal: number,
  ay = '2026-27'
): Warning[] {
  const warnings: Warning[] = []
  const scheduleALRequired = computeScheduleALRequired(totalIncome, selectedITRForm, ay)

  // HP loss ring-fenced under New Regime
  if (regime === 'new' && HP.lossRingFenced > 0) {
    warnings.push({
      id: 'HP_LOSS_RING_FENCED' as WarningId,
      severity: 'info' as WarningSeverity,
      message: `House property loss of ₹${HP.lossRingFenced.toLocaleString('en-IN')} is ring-fenced under New Regime and cannot be set off against any other income.`,
    })
  }

  // F&O not computed
  if (BP.fno && BP.fno.notComputed) {
    warnings.push({
      id: 'FNO_NOT_COMPUTED' as WarningId,
      severity: 'info' as WarningSeverity,
      message: 'F&O income detected. Enter taxable F&O income (profit or loss) in the Business tab — it will be auto set-off against other income heads.',
    })
  }

  // Old Regime with zero deductions
  if (regime === 'old' && deductionsTotal === 0) {
    warnings.push({
      id: 'OLD_REGIME_NO_DEDUCTIONS' as WarningId,
      severity: 'info' as WarningSeverity,
      message: 'Old Regime selected but no deductions entered. New Regime may result in lower tax — compare using the Regime Comparison screen.',
    })
  }

  // Schedule AL required
  if (scheduleALRequired) {
    warnings.push({
      id: 'SCHEDULE_AL_REQUIRED' as WarningId,
      severity: 'error' as WarningSeverity,
      message: `Your total income exceeds ₹50L. Schedule AL (assets & liabilities) is required for ${selectedITRForm}. Complete it before downloading XML.`,
    })
  }

  // Senior citizen with no 80TTB (Old Regime only)
  if (regime === 'old' && (filerCategory === 'senior' || filerCategory === 'super_senior')) {
    warnings.push({
      id: 'SENIOR_NO_80TTB' as WarningId,
      severity: 'info' as WarningSeverity,
      message: 'Senior citizens can claim up to ₹50,000 deduction on interest income under Section 80TTB (replaces 80TTA). Enter it in the Deductions screen.',
    })
  }

  // DOB not entered with Old Regime
  if (!dobEntered && regime === 'old') {
    warnings.push({
      id: 'DOB_NOT_ENTERED' as WarningId,
      severity: 'info' as WarningSeverity,
      message: 'Enter your date of birth in Settings to ensure the correct tax slab is applied. Without it, general (under-60) slabs are assumed.',
    })
  }

  // ITR-4 with incompatible income
  if (selectedITRForm === 'ITR4' && (BP.netSpeculativePnL !== 0 || (BP as any).hasFnO)) {
    warnings.push({
      id: 'ITR4_MIXED_INCOME' as WarningId,
      severity: 'error' as WarningSeverity,
      message: 'ITR-4 cannot include speculative (intraday) or F&O income. Switch to ITR-3.',
    })
  }

  return warnings
}

// ─── CFL v2 computation ───────────────────────────────────────────────────────

/**
 * Compute ScheduleCFL_v2 from current year losses + prior ITR entries.
 * Current-year losses are added as CFLEntry with source 'current_year'.
 * Prior-year entries (from uploaded ITR XML) are merged in with source 'prior_itr'.
 */
export function computeScheduleCFL_v2(
  intradayLoss: number,
  stcl: number,
  ltcl: number,
  hpLoss: number,
  nonSpecLoss: number,
  priorITREntries: CFLEntry[],
  currentAY = '2026-27'
): ScheduleCFL_v2 {
  const entries: CFLEntry[] = []
  const { v4: uuidv4 } = { v4: () => Math.random().toString(36).slice(2) }

  if (intradayLoss > 0) {
    entries.push({ id: uuidv4(), lossType: 'speculative', ayOfOrigin: currentAY, amount: intradayLoss, yearsRemaining: 4, source: 'current_year' })
  }
  if (stcl > 0) {
    entries.push({ id: uuidv4(), lossType: 'stcl', ayOfOrigin: currentAY, amount: stcl, yearsRemaining: 8, source: 'current_year' })
  }
  if (ltcl > 0) {
    entries.push({ id: uuidv4(), lossType: 'ltcl', ayOfOrigin: currentAY, amount: ltcl, yearsRemaining: 8, source: 'current_year' })
  }
  if (hpLoss > 0) {
    entries.push({ id: uuidv4(), lossType: 'hp', ayOfOrigin: currentAY, amount: hpLoss, yearsRemaining: 8, source: 'current_year' })
  }
  if (nonSpecLoss > 0) {
    entries.push({ id: uuidv4(), lossType: 'business', ayOfOrigin: currentAY, amount: nonSpecLoss, yearsRemaining: 8, source: 'current_year' })
  }

  // Merge prior ITR entries (already filtered for expiry by the parser)
  for (const entry of priorITREntries) {
    entries.push(entry)
  }

  return {
    entries,
    totalSpeculative: entries.filter(e => e.lossType === 'speculative').reduce((s, e) => s + e.amount, 0),
    totalSTCL: entries.filter(e => e.lossType === 'stcl').reduce((s, e) => s + e.amount, 0),
    totalLTCL: entries.filter(e => e.lossType === 'ltcl').reduce((s, e) => s + e.amount, 0),
    totalHP: entries.filter(e => e.lossType === 'hp').reduce((s, e) => s + e.amount, 0),
    totalBusiness: entries.filter(e => e.lossType === 'business').reduce((s, e) => s + e.amount, 0),
  }
}
