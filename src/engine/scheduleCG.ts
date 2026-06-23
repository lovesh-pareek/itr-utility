import type { BrokerData, MFData, ScheduleCG } from '../types'
import { getRules } from './taxRules'

/**
 * Compute Schedule CG — Capital gains from equity delivery trades and MF redemptions.
 *
 * Rates (from config specialRates):
 *   STCG equity / equity MF (Sec 111A): stcg_111A
 *   LTCG equity / equity MF (Sec 112A): ltcg_112A above ltcg_112A_exemption
 *
 * Loss set-off within CG:
 *   STCL → set off against STCG first, then LTCG
 *   LTCL → set off against LTCG only
 *   (Cross-head CYLA happens later in computeScheduleCYLA)
 */
export function computeScheduleCG(
  broker: BrokerData | null,
  mf: MFData | null,
  overrides: Record<string, number>,
  ay = '2026-27'
): ScheduleCG {
  const rules = getRules(ay, 'new')
  const LTCG_EXEMPTION_LIMIT = rules.specialRates.ltcg_112A_exemption

  // ── Raw gains from broker ─────────────────────────────────────────────────
  const equitySTCG = overrides['CG.equitySTCG'] ?? broker?.equityDelivery.totalSTCG ?? 0
  const equityLTCG = overrides['CG.equityLTCG'] ?? broker?.equityDelivery.totalLTCG ?? 0
  const equitySTCL = overrides['CG.equitySTCL'] ?? broker?.equityDelivery.totalSTCL ?? 0
  const equityLTCL = overrides['CG.equityLTCL'] ?? broker?.equityDelivery.totalLTCL ?? 0

  // ── Raw gains from MF ─────────────────────────────────────────────────────
  const mfEquitySTCG = overrides['CG.mfEquitySTCG'] ?? mf?.totalEquitySTCG ?? 0
  const mfEquityLTCG = overrides['CG.mfEquityLTCG'] ?? mf?.totalEquityLTCG ?? 0
  const debtMFGains  = overrides['CG.debtMFGains']  ?? mf?.totalDebtGains  ?? 0

  // ── Aggregate gross gains/losses ──────────────────────────────────────────
  const grossSTCG = equitySTCG + mfEquitySTCG
  const grossLTCG = equityLTCG + mfEquityLTCG
  const stcl      = equitySTCL
  const ltcl      = equityLTCL

  // ── Intra-CG loss set-off ─────────────────────────────────────────────────
  // Step 1: STCL against STCG
  let remainingSTCL = stcl
  const netSTCG = Math.max(0, grossSTCG - remainingSTCL)
  remainingSTCL = Math.max(0, remainingSTCL - grossSTCG)

  // Step 2: remaining STCL against LTCG
  const remainingLTCL = ltcl
  const netLTCG = Math.max(0, grossLTCG - remainingSTCL - remainingLTCL)

  // ── LTCG exemption from config ────────────────────────────────────────────
  const ltcgExemption = Math.min(netLTCG, LTCG_EXEMPTION_LIMIT)
  const taxableLTCG   = Math.max(0, netLTCG - ltcgExemption)

  return {
    equitySTCG,
    equityLTCG,
    mfEquitySTCG,
    mfEquityLTCG,
    debtMFGains,
    grossSTCG,
    grossLTCG,
    ltcgExemption,
    taxableLTCG,
    stcl,
    ltcl,
    netSTCG,
    netLTCG,
  }
}
