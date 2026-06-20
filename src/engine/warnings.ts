import type { AppState, Warning, Schedules, TaxComputation } from '../types'

const FILING_DEADLINE = new Date('2026-07-31T23:59:59')
const SURCHARGE_THRESHOLD = 5_000_000   // ₹50L

/**
 * Evaluate all warning conditions and return triggered warnings only.
 * Every warning from requirements.md §7 is checked here.
 * Order matters — most critical first.
 */
export function computeWarnings(
  state: Pick<AppState, 'parsed' | 'parseStatus' | 'aiCallLog'>,
  schedules: Schedules | null,
  tax: TaxComputation | null
): Warning[] {
  const warnings: Warning[] = []

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
      severity: 'warn',
      message:
        'F&O income detected — not computed in v1.0. Consult a CA before filing.',
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
        severity: 'warn',
        message:
          'Intraday loss cannot be set off against salary or capital gains. It can only offset intraday profit.',
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
    if (schedules.CG.grossLTCG > 125_000) {
      warnings.push({
        id: 'LTCG_EXEMPTION_CAP',
        severity: 'info',
        message:
          'LTCG above ₹1,25,000 is taxable at 12.5% (Sec 112A). Section 87A rebate does not apply to LTCG.',
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

  // ── 11. XML schema error — added dynamically when XML validation fails ────
  // XML_SCHEMA_ERROR is pushed directly by the XML generator / S06 screen.
  // computeWarnings checks for it via the parseStatus errors map.
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
