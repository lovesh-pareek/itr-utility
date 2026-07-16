import type {
  AppState,
  BrokerData,
  Form16Data,
  MFData,
  Schedules,
  TaxComputation,
  Warning,
} from '../types'
import { computeScheduleS, computeScheduleOS } from './scheduleS_OS'
import { computeScheduleCG } from './scheduleCG'
import { computeScheduleBP, computeScheduleCFL, finaliseBP } from './scheduleBP_CFL'
import { computeScheduleCYLA } from './scheduleCYLA'
import { computeTax } from './taxComputation'
import { computeWarnings } from './warnings'

// ─── Master schedule computation ─────────────────────────────────────────────

/**
 * Compute all schedules from parsed data and overrides.
 * Deterministic — no AI, no network.
 * Call order matters: S → OS → CG → BP → CYLA → CFL → finalise BP
 */
export function computeSchedules(
  broker: BrokerData | null,
  form16: Form16Data | null,
  mf: MFData | null,
  overrides: Record<string, number>
): Schedules {
  // Track A: salary + other sources (no interdependencies)
  const scheduleS  = computeScheduleS(form16, overrides)
  const scheduleOS = computeScheduleOS(broker, overrides)

  // Track B: capital gains (intra-CG set-off done inside)
  const scheduleCG = computeScheduleCG(broker, mf, overrides)

  // Track C: intraday speculative income
  const scheduleBP = computeScheduleBP(broker, overrides)

  // F&O taxable income (user-entered override)
  const fnoTaxableIncome = overrides['BP.fnoIncome'] ?? overrides['BP_v2.fno.taxableIncome'] ?? 0

  // CYLA: cross-head loss adjustment (uses all schedules + F&O)
  const scheduleCYLA = computeScheduleCYLA(scheduleS, scheduleBP, scheduleCG, scheduleOS, fnoTaxableIncome)

  // CFL: carry forward from residual losses after CYLA
  const scheduleCFL = computeScheduleCFL(scheduleCYLA)

  // Finalise BP with carry forward values
  const finalisedBP = finaliseBP(scheduleBP, scheduleCFL)

  return {
    S:    scheduleS,
    BP:   finalisedBP,
    CG:   scheduleCG,
    OS:   scheduleOS,
    CYLA: scheduleCYLA,
    CFL:  scheduleCFL,
  }
}

// ─── Full engine run (schedules + tax + warnings) ────────────────────────────

export interface EngineResult {
  schedules: Schedules
  tax: TaxComputation
  warnings: Warning[]
}

/**
 * Run the full engine: schedules → tax → warnings.
 * Takes the full AppState slice needed for warnings context.
 */
export function runEngine(
  broker: BrokerData | null,
  form16: Form16Data | null,
  mf: MFData | null,
  overrides: Record<string, number>,
  tdsDeducted: number,
  advanceTaxPaid: number,
  stateForWarnings: Pick<AppState, 'parsed' | 'parseStatus' | 'aiCallLog'>
): EngineResult {
  const schedules = computeSchedules(broker, form16, mf, overrides)

  const tax = computeTax(
    schedules,
    overrides['TAX.tdsDeducted'] ?? tdsDeducted,
    overrides['TAX.advanceTaxPaid'] ?? advanceTaxPaid
  )

  const warnings = computeWarnings(stateForWarnings, schedules, tax)

  return { schedules, tax, warnings }
}
