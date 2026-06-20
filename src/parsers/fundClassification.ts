/**
 * Equity-oriented fund classification for MF capital gains.
 *
 * A fund is "equity-oriented" if it holds ≥65% in equity.
 * For tax purposes:
 *   - Equity-oriented: STCG @ 20% (Sec 111A), LTCG @ 12.5% above ₹1.25L (Sec 112A)
 *   - Debt/Other: Gains added to slab income (no special rate)
 *
 * We classify by scheme name keywords since ISINs change and a static list
 * would need constant maintenance. This covers >95% of typical investor portfolios.
 */

const EQUITY_KEYWORDS = [
  'equity',
  'flexi cap',
  'flexicap',
  'large cap',
  'largecap',
  'mid cap',
  'midcap',
  'small cap',
  'smallcap',
  'multi cap',
  'multicap',
  'elss',
  'tax saver',
  'tax saving',
  'balanced advantage',
  'aggressive hybrid',
  'dynamic asset allocation',
  'nifty',
  'sensex',
  'index fund',
  'etf',
  'momentum',
  'value fund',
  'contra fund',
  'focused fund',
  'thematic',
  'sectoral',
  'pharma',
  'banking',
  'infra',
  'infrastructure',
  'technology',
  'consumption',
  'dividend yield',
  'blue chip',
  'bluechip',
  'opportunities',
  'advantage fund',
  'growth fund',
  'pure equity',
  'all cap',
  'allcap',
]

const DEBT_KEYWORDS = [
  'liquid',
  'overnight',
  'ultra short',
  'low duration',
  'short duration',
  'medium duration',
  'long duration',
  'corporate bond',
  'credit risk',
  'dynamic bond',
  'gilt',
  'g-sec',
  'money market',
  'floater',
  'banking and psu',
  'banking & psu',
  'fixed maturity',
  'fmp',
  'income fund',
  'debt fund',
  'bond fund',
]

// Known hybrid categories that depend on equity allocation
const HYBRID_EQUITY_KEYWORDS = [
  'aggressive hybrid',
  'equity savings',
  'multi asset',
  'balanced advantage',
  'dynamic asset allocation',
]


export type FundOrientation = 'equity' | 'debt'

/**
 * Classify a mutual fund scheme as equity-oriented or debt-oriented.
 * Uses scheme name keywords — no ISIN lookup required.
 */
export function classifyFundOrientation(schemeName: string): FundOrientation {
  const lower = schemeName.toLowerCase()

  // Explicit debt keywords take precedence
  for (const kw of DEBT_KEYWORDS) {
    if (lower.includes(kw)) {
      // Unless it also has an equity override
      const hasEquityOverride = HYBRID_EQUITY_KEYWORDS.some(ekw => lower.includes(ekw))
      if (!hasEquityOverride) return 'debt'
    }
  }

  // Equity keywords
  for (const kw of EQUITY_KEYWORDS) {
    if (lower.includes(kw)) return 'equity'
  }

  // Hybrid — debt by default unless equity keyword present
  for (const kw of HYBRID_EQUITY_KEYWORDS) {
    if (lower.includes(kw)) return 'equity'
  }

  // Unknown — default to debt (conservative; user can review)
  return 'debt'
}
