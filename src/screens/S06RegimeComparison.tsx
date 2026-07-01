/**
 * S06 Regime Comparison Screen
 * Side-by-side Old vs New computation. Recommendation + one-click switch.
 */

import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { StepProgress, ArrowRightIcon } from '../components/shared'
import { fmtINR } from '../components/review'
import { useAppContext } from '../context/AppContext'
import { computeRegimeComparison } from '../engine/regimeComparison'
import { emptyRawDeductions } from '../engine/deductionsEngine'
import { emptyTaxCredits, computeTaxCredits } from '../engine/taxCreditsEngine'

export function S06RegimeComparison() {
  const navigate = useNavigate()
  const { state, dispatch } = useAppContext()
  const { selectedRegime, filerProfile, deductions, taxCredits, schedules, schedules_v2, regimeComparison } = state

  // Run comparison on mount or when deductions/credits change
  useEffect(() => {
    if (!schedules) return

    const rawDed = emptyRawDeductions(schedules.S?.grossSalary ?? 0)
    const credits = taxCredits
      ? computeTaxCredits(taxCredits.tdsEntries, taxCredits.advanceTaxPaid, taxCredits.selfAssessmentTax, taxCredits.tcsCredits)
      : emptyTaxCredits()

    // Build minimal schedules_v2 shape from v1 schedules if v2 not available
    const sv2 = schedules_v2 ?? buildMinimalSV2(schedules)

    const comparison = computeRegimeComparison(sv2 as any, rawDed, credits, filerProfile)
    dispatch({ type: 'SET_REGIME_COMPARISON', comparison })
  }, [schedules, deductions, taxCredits])

  const comparison = regimeComparison

  function switchRegime(regime: 'new' | 'old') {
    dispatch({ type: 'SET_SELECTED_REGIME', regime })
  }

  function handleContinue() {
    // Skip AIS screen if no AIS uploaded
    if (state.parsed.aisData) {
      navigate('/review/ais')
    } else {
      navigate('/review/bank-accounts')
    }
  }

  if (!comparison) {
    return (
      <div>
        <StepProgress />
        <div className="card text-center py-12">
          <p className="text-ink-400 text-sm">Computing regime comparison…</p>
        </div>
      </div>
    )
  }

  const { new: newResult, old: oldResult, recommended, saving } = comparison
  const newWins = recommended === 'new'
  const tied = saving === 0

  return (
    <div>
      <StepProgress />
      <div className="mb-4">
        <h1 className="text-xl font-bold text-ink-900">Old Regime vs New Regime</h1>
        <p className="text-sm text-ink-400 mt-1">Side-by-side comparison for AY 2026-27</p>
      </div>

      {/* Comparison table */}
      <div className="card overflow-x-auto mb-4">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-100">
              <th className="text-left py-2 font-medium text-ink-500 pr-4">Item</th>
              <th className={`text-right py-2 font-semibold px-3 ${selectedRegime === 'new' ? 'text-ink-900' : 'text-ink-400'}`}>
                New Regime {selectedRegime === 'new' && '✓'}
              </th>
              <th className={`text-right py-2 font-semibold px-3 ${selectedRegime === 'old' ? 'text-ink-900' : 'text-ink-400'}`}>
                Old Regime {selectedRegime === 'old' && '✓'}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-50">
            <CompRow label="Gross income" newVal={newResult.totalIncome} oldVal={oldResult.totalIncome} />
            <CompRow label="Deductions" newVal={newResult.totalIncome - newResult.slabTaxableIncome - (newResult.stcgTax > 0 ? 0 : 0)} oldVal={oldResult.totalIncome - oldResult.slabTaxableIncome} />
            <CompRow label="Taxable income" newVal={newResult.slabTaxableIncome} oldVal={oldResult.slabTaxableIncome} />
            <CompRow label="Slab tax" newVal={newResult.slabTax} oldVal={oldResult.slabTax} />
            <CompRow label="STCG tax (20%)" newVal={newResult.stcgTax} oldVal={oldResult.stcgTax} />
            <CompRow label="LTCG tax (12.5%)" newVal={newResult.ltcgTax} oldVal={oldResult.ltcgTax} />
            {(newResult.section87ARebate > 0 || oldResult.section87ARebate > 0) && (
              <CompRow label="Section 87A rebate" newVal={-newResult.section87ARebate} oldVal={-oldResult.section87ARebate} />
            )}
            <CompRow label="Surcharge" newVal={newResult.surcharge} oldVal={oldResult.surcharge} />
            <CompRow label="Cess (4%)" newVal={newResult.cess} oldVal={oldResult.cess} />
            <CompRow label="Total tax" newVal={newResult.totalTaxPayable} oldVal={oldResult.totalTaxPayable} bold />
            <CompRow label="TDS deducted" newVal={-newResult.tdsDeducted} oldVal={-oldResult.tdsDeducted} />
            <CompRow label="Net payable / (refund)" newVal={newResult.netPayable} oldVal={oldResult.netPayable} bold highlight />
          </tbody>
        </table>
      </div>

      {/* Recommendation card */}
      <div className={`card mb-4 border-2 ${tied ? 'border-ink-200' : newWins ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}>
        {tied ? (
          <p className="text-sm font-medium text-ink-700">Both regimes result in the same tax. New Regime is simpler — recommended.</p>
        ) : (
          <>
            <p className={`font-semibold text-base ${newWins ? 'text-emerald-800' : 'text-amber-800'}`}>
              ✓ {newWins ? 'New' : 'Old'} Regime saves you {fmtINR(saving)}
            </p>
            <p className={`text-sm mt-0.5 ${newWins ? 'text-emerald-700' : 'text-amber-700'}`}>
              Recommended: {newWins ? 'New' : 'Old'} Regime
            </p>
          </>
        )}
        <div className="mt-3 flex gap-2">
          {selectedRegime !== 'new' && (
            <button onClick={() => switchRegime('new')} className="btn-secondary text-sm">Switch to New Regime</button>
          )}
          {selectedRegime !== 'old' && (
            <button onClick={() => switchRegime('old')} className="btn-secondary text-sm">Switch to Old Regime</button>
          )}
        </div>
        {selectedRegime !== recommended && (
          <p className="text-xs text-ink-500 mt-2">
            ⓘ Switching regime will recompute all schedules. Your entered values will not be lost.
          </p>
        )}
      </div>

      <p className="text-xs text-ink-400 mb-4">Currently filing under: <strong>{selectedRegime === 'new' ? 'New Regime' : 'Old Regime'}</strong></p>

      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/review/deductions')} className="btn-secondary">← Back to Deductions</button>
        <button onClick={handleContinue} className="btn-primary">
          Continue <ArrowRightIcon />
        </button>
      </div>
    </div>
  )
}

function CompRow({ label, newVal, oldVal, bold, highlight }: {
  label: string; newVal: number; oldVal: number; bold?: boolean; highlight?: boolean
}) {
  const fmt = (v: number) => v === 0 ? '—' : fmtINR(Math.abs(v)) + (v < 0 ? ' ↓' : '')
  return (
    <tr className={highlight ? 'bg-ink-50 font-semibold' : ''}>
      <td className={`py-1.5 pr-4 ${bold ? 'font-semibold text-ink-800' : 'text-ink-600'} text-xs`}>{label}</td>
      <td className={`text-right px-3 py-1.5 text-xs tabular-nums ${bold ? 'font-semibold' : ''} ${highlight && newVal < oldVal ? 'text-emerald-700' : ''}`}>
        {fmt(newVal)}
      </td>
      <td className={`text-right px-3 py-1.5 text-xs tabular-nums ${bold ? 'font-semibold' : ''} ${highlight && oldVal < newVal ? 'text-emerald-700' : ''}`}>
        {fmt(oldVal)}
      </td>
    </tr>
  )
}

function buildMinimalSV2(s: any) {
  return {
    S: { totalNetTaxable: s.S?.netTaxableSalary ?? 0, totalTDS: s.S?.tdsDeducted ?? 0, employers: [], totalGross: s.S?.grossSalary ?? 0, totalStdDeduction: s.S?.standardDeduction ?? 0, totalProfessionalTax: s.S?.professionalTax ?? 0 },
    HP: { properties: [], totalIncomeFromHP: 0, totalInterest: 0, lossSetOffAgainstSalary: 0, lossRingFenced: 0 },
    CG: { totalSTCG: (s.CG?.totalSTCG ?? 0), totalLTCG: (s.CG?.totalLTCG ?? 0), debtMFGains: s.CG?.debtMFGains ?? 0, propertySales: [] },
    BP: { speculativePL: s.BP?.speculativePL ?? 0, presumptiveEntries: [], fno: null, nonSpeculativeIncome: 0, nonSpeculativeLoss: 0 },
    OS: { totalAtSlabRate: (s.OS?.dividends ?? 0) + (s.OS?.interest ?? 0), totalAt30Pct: 0, total: s.OS?.total ?? 0 },
    CYLA: {}, CFL: { entries: [], totalSpeculative: 0, totalSTCL: 0, totalLTCL: 0, totalHP: 0, totalBusiness: 0 },
  }
}
