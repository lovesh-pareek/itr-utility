import type { AppState, Warning, Schedules, TaxComputation } from '../types'
import { getRules } from './taxRules'

/**
 * Evaluate all warning conditions and return triggered warnings only.
 * All thresholds read from tax-rules.json via getRules().
 */
export function computeWarnings(
  state: Pick<AppState, 'parsed' | 'parseStatus' | 'aiCallLog'>,
  schedules: Schedules | null,
  tax: TaxComputation | null,
  ay = '2026-27'
): Warning[] {
  const warnings: Warning[] = []
  const rules = getRules(ay, 'new')  // surcharge threshold is regime-independent
  const SURCHARGE_THRESHOLD = rules.surchargeThresholds.scheduleALRequired
  const FILING_DEADLINE = new Date(rules.deadlines.original + 'T23:59:59')

  // ── 1. AIS mismatch risk — ALWAYS shown ──────────────────────────────────
  warnings.push({
    id: 'AIS_MISMATCH_RISK',
    severity: 'info',
    message:
      'Cross-check all values against your AIS on incometax.gov.in before uploading XML.',
  })

  // ── 2. New Regime confirmation — ALWAYS shown ─────────────────────────────
  warnings.push({
    id: 'NEW_REGIME_CONFIRMED',
    severity: 'info',
    message:
      'Filing under New Regime. Deductions under 80C–80U are not applicable.',
  })

  // ── 3. F&O detected ───────────────────────────────────────────────────────
  if (state.parsed.broker?.hasFnO) {
    warnings.push({
      id: 'FNO_DETECTED',
      severity: 'info',
      message:
        'F&O income detected. Enter taxable F&O income in the Business tab — loss will be auto set-off against other heads.',
    })
  }

  // ── 4. Broker not recognised ──────────────────────────────────────────────
  if (state.parsed.detectedBroker === 'unknown' && state.parsed.broker) {
    warnings.push({
      id: 'BROKER_NOT_RECOGNISED',
      severity: 'warn',
      message:
        'Broker format not recognised — AI fallback used. Verify parsed values carefully.',
    })
  }

  // ── 5. AI call made ───────────────────────────────────────────────────────
  if (state.aiCallLog.length > 0) {
    warnings.push({
      id: 'AI_CALL_MADE',
      severity: 'info',
      message:
        'AI was used to assist parsing. No financial data was sent — only document structure. Review extracted values before proceeding.',
    })
  }

  if (schedules) {
    // ── 6. Intraday loss restriction ─────────────────────────────────────────
    if (schedules.BP.netSpeculativePnL < 0) {
      warnings.push({
        id: 'INTRADAY_LOSS_RESTRICTION',
        severity: 'info',
        message:
          'Intraday (speculative) loss is ring-fenced — it can only offset intraday profit. This loss will be carried forward for up to 4 years.',
        scheduleRef: 'BP',
      })
    }

    // ── 7. Carry forward deadline ─────────────────────────────────────────────
    const hasCFL =
      schedules.CFL.intradayLossCarryForward > 0 ||
      schedules.CFL.stclCarryForward > 0 ||
      schedules.CFL.ltclCarryForward > 0

    if (hasCFL) {
      const deadlineStr = FILING_DEADLINE.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
      warnings.push({
        id: 'CARRY_FORWARD_DEADLINE',
        severity: 'warn',
        message: `File ITR before ${deadlineStr} to carry forward this loss to AY 2027-28.`,
        scheduleRef: 'CFL',
      })
    }

    // ── 8. LTCG exemption cap ─────────────────────────────────────────────────
    const ltcgExemptionLimit = rules.specialRates.ltcg_112A_exemption
    if (schedules.CG.grossLTCG > ltcgExemptionLimit) {
      warnings.push({
        id: 'LTCG_EXEMPTION_CAP',
        severity: 'info',
        message: `LTCG above ₹${(ltcgExemptionLimit / 100000).toFixed(2).replace('.00', '')}L is taxable at ${rules.specialRates.ltcg_112A * 100}% (Sec 112A). Section 87A rebate does not apply to LTCG.`,
        scheduleRef: 'CG',
      })
    }
  }

  // ── 9. Surcharge applicable ───────────────────────────────────────────────
  if (tax && tax.totalIncome > SURCHARGE_THRESHOLD) {
    warnings.push({
      id: 'SURCHARGE_APPLICABLE',
      severity: 'warn',
      message:
        'Surcharge applies to your income level. Verify final surcharge rate on the IT portal after upload.',
    })
  }

  // ── 10. Scanned PDF detected ──────────────────────────────────────────────
  if (state.parseStatus.form16 === 'error' &&
      state.parseStatus.errors['form16']?.includes('Scanned')) {
    warnings.push({
      id: 'SCANNED_PDF',
      severity: 'error',
      message:
        'Scanned PDF not supported. Please upload a text-based PDF from your employer.',
    })
  }

  // ── 11. XML schema error ──────────────────────────────────────────────────
  if (state.parseStatus.errors['xml_schema']) {
    warnings.push({
      id: 'XML_SCHEMA_ERROR',
      severity: 'error',
      message: `Generated XML has errors: ${state.parseStatus.errors['xml_schema']}. Review flagged fields before uploading to portal.`,
    })
  }

  return warnings
}

/**
 * Produce a single warning by ID (used for inline schedule-level warnings).
 */
export function getWarning(warnings: Warning[], id: Warning['id']): Warning | undefined {
  return warnings.find(w => w.id === id)
}
