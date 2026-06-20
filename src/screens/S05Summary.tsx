import { useNavigate } from 'react-router-dom'
import { StepProgress, MetricCard, WarningBanner, ArrowRightIcon } from '../components/shared'
import { TaxRow } from '../components/review'
import { fmtINR } from '../components/review'
import { useAppContext } from '../context/AppContext'
import { useEngine } from '../hooks/useEngine'

export default function S05Summary() {
  const navigate = useNavigate()
  const { state } = useAppContext()
  const { tax, warnings } = state

  useEngine()

  const hasData = !!(state.parsed.broker || state.parsed.form16 || state.parsed.mfStatement)

  if (!hasData || !tax) {
    return (
      <div>
        <StepProgress />
        <div className="card text-center py-16">
          <p className="text-ink-500 mb-3">No tax data available yet.</p>
          <button onClick={() => navigate('/upload')} className="btn-primary">← Upload documents</button>
        </div>
      </div>
    )
  }

  const isRefund = tax.netPayable < 0

  return (
    <div>
      <StepProgress />
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-ink-900 mb-1">Tax Summary</h1>
        <p className="text-sm text-ink-400">Step 3 of 3 — Review before exporting</p>
      </div>

      {/* Top metric cards */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <MetricCard label="Total income" value={fmtINR(tax.totalIncome)} />
        <MetricCard label="Total tax" value={fmtINR(tax.totalTaxPayable)} />
        <MetricCard
          label={isRefund ? 'Net refund' : 'Net payable'}
          value={fmtINR(Math.abs(tax.netPayable))}
          colorState={isRefund ? 'positive' : 'warning'}
          subtext={isRefund ? 'Refund due' : 'Self-assessment tax due'}
        />
      </div>

      {/* Computation breakdown */}
      <div className="card mb-5">
        <h2 className="font-display font-semibold text-ink-800 mb-3">Computation breakdown</h2>
        <div>
          <TaxRow label="Slab-taxable income" value={tax.slabTaxableIncome} />
          <TaxRow label="Tax on slab income" value={tax.slabTax + tax.section87ARebate} indent />
          {tax.section87AEligible && (
            <TaxRow label="Section 87A rebate" value={-tax.section87ARebate} indent />
          )}
          <TaxRow label="Slab tax after rebate" value={tax.slabTax} indent muted={tax.slabTax === 0} />

          {tax.stcgTax > 0 && <TaxRow label="Tax on STCG @ 20% (Sec 111A)" value={tax.stcgTax} />}
          {tax.ltcgTax > 0 && <TaxRow label="Tax on LTCG @ 12.5% (Sec 112A)" value={tax.ltcgTax} />}

          <TaxRow label="Subtotal before surcharge" value={tax.subtotalBeforeSurcharge} />
          {tax.surcharge > 0
            ? <TaxRow label={`Surcharge (${tax.totalIncome > 10_000_000 ? '15' : '10'}%)`} value={tax.surcharge} indent />
            : <TaxRow label="Surcharge" value={0} indent muted />
          }
          <TaxRow label="Health & Education cess @ 4%" value={tax.cess} indent />

          <TaxRow label="Total tax payable" value={tax.totalTaxPayable} isTotal />

          <div className="mt-3 space-y-0">
            <TaxRow label="TDS deducted by employer" value={-tax.tdsDeducted} />
            {tax.advanceTaxPaid > 0 && <TaxRow label="Advance tax paid" value={-tax.advanceTaxPaid} />}
          </div>

          <TaxRow
            label={isRefund ? 'Net refund' : 'Net payable'}
            value={tax.netPayable}
            isTotal
          />
        </div>
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="mb-5">
          <h2 className="font-display font-semibold text-ink-800 mb-3">Warnings &amp; notices</h2>
          <div className="space-y-2">
            {warnings.map(w => (
              <WarningBanner key={w.id} severity={w.severity} message={w.message} />
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => navigate('/review', { state: { tab: state.lastReviewTab ?? 'Schedule S' } })}
          className="btn-secondary"
        >
          ← Edit values
        </button>
        <button onClick={() => navigate('/export')} className="btn-primary">
          Download &amp; export <ArrowRightIcon />
        </button>
      </div>
    </div>
  )
}
