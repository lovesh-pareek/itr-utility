import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { StepProgress, WarningBanner, ArrowRightIcon } from '../components/shared'
import { EditableField, ScheduleSection, SummaryRow } from '../components/review'
import { fmtINR } from '../components/review'
import { useAppContext } from '../context/AppContext'
import { useAppDispatch } from '../context/AppContext'
import { useEngine } from '../hooks/useEngine'
import { getWarning } from '../engine/warnings'

const TABS = ['Schedule S', 'Schedule BP', 'Schedule CG', 'Schedule OS', 'CYLA', 'CFL'] as const
type Tab = typeof TABS[number]

export default function S04Review() {
  const navigate = useNavigate()
  const location = useLocation()
  const { state, dispatch } = useAppContext()
  const { schedules, warnings, tax } = state

  useEngine() // reactive recomputation on any change

  const initialTab: Tab = (location.state as { tab?: Tab })?.tab ?? 'Schedule S'
  const [activeTab, setActiveTab] = useState<Tab>(initialTab)

  function handleTabChange(tab: Tab) {
    setActiveTab(tab)
    dispatch({ type: 'SET_LAST_REVIEW_TAB', tab })
  }

  const overrides = state.overrides

  const hasData = !!(state.parsed.broker || state.parsed.form16 || state.parsed.mfStatement)

  if (!hasData) {
    return (
      <div>
        <StepProgress />
        <div className="card text-center py-16">
          <p className="text-ink-500 mb-3">No data loaded yet.</p>
          <button onClick={() => navigate('/upload')} className="btn-primary">
            ← Upload documents
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <StepProgress />
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-ink-900 mb-1">Review your data</h1>
        <p className="text-sm text-ink-400">Step 2 of 3 — All values are editable · Tax updates live</p>
      </div>

      {/* AIS warning — always shown */}
      <WarningBanner
        severity="warn"
        message="Cross-check all values against your AIS on incometax.gov.in before uploading."
      />

      {/* Inline warnings from other conditions */}
      {warnings.filter(w => ['FNO_DETECTED','AI_CALL_MADE','BROKER_NOT_RECOGNISED'].includes(w.id)).map(w => (
        <div key={w.id} className="mt-2">
          <WarningBanner severity={w.severity} message={w.message} />
        </div>
      ))}

      {/* Live tax summary bar */}
      {tax && (
        <div className="mt-4 bg-ink-900 text-white rounded-xl px-4 py-3 flex flex-wrap gap-4 text-sm">
          <div>
            <p className="text-ink-400 text-xs">Total income</p>
            <p className="font-mono font-semibold">{fmtINR(tax.totalIncome)}</p>
          </div>
          <div>
            <p className="text-ink-400 text-xs">Total tax</p>
            <p className="font-mono font-semibold">{fmtINR(tax.totalTaxPayable)}</p>
          </div>
          <div>
            <p className="text-ink-400 text-xs">Net {tax.netPayable >= 0 ? 'payable' : 'refund'}</p>
            <p className={`font-mono font-semibold ${tax.netPayable < 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
              {fmtINR(Math.abs(tax.netPayable))}
            </p>
          </div>
          <p className="text-ink-500 text-xs self-end ml-auto">Updates live as you edit ↓</p>
        </div>
      )}

      {/* Schedule tabs */}
      <div className="mt-5 flex gap-2 mb-5 overflow-x-auto pb-1 scrollbar-none">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => handleTabChange(tab)}
            className={`schedule-tab shrink-0 ${activeTab === tab ? 'schedule-tab-active' : 'schedule-tab-inactive'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'Schedule S' && <ScheduleSTab schedules={schedules} overrides={overrides} state={state} />}
      {activeTab === 'Schedule BP' && <ScheduleBPTab schedules={schedules} overrides={overrides} warnings={warnings} />}
      {activeTab === 'Schedule CG' && <ScheduleCGTab schedules={schedules} overrides={overrides} warnings={warnings} />}
      {activeTab === 'Schedule OS' && <ScheduleOSTab schedules={schedules} overrides={overrides} />}
      {activeTab === 'CYLA' && <ScheduleCYLATab schedules={schedules} />}
      {activeTab === 'CFL' && <ScheduleCFLTab schedules={schedules} warnings={warnings} />}

      <div className="mt-6 pt-4 border-t border-[var(--color-border)]">
        <button onClick={() => navigate('/summary')} className="btn-primary">
          Continue to tax summary <ArrowRightIcon />
        </button>
      </div>
    </div>
  )
}

// ─── Schedule S ───────────────────────────────────────────────────────────────
function ScheduleSTab({ schedules, overrides, state }: any) {
  const s = schedules?.S
  if (!s) return <EmptySchedule />
  const unresolvedFields: string[] = state?.parsed?.form16?.unresolvedFields ?? []
  return (
    <>
    {unresolvedFields.length > 0 && (
      <div className="banner-warn mb-4">
        <span>⚠</span>
        <div>
          <p className="font-medium">Some Form 16 fields could not be mapped automatically</p>
          <p className="text-xs mt-1">Please verify and manually enter values for: <span className="font-mono">{unresolvedFields.join(', ')}</span></p>
          <p className="text-xs mt-1">Use the ✎ edit icon next to each field to enter the correct value.</p>
        </div>
      </div>
    )}
    <ScheduleSection title="Schedule S — Salary" source={s.source}>
      <EditableField label="Gross salary" fieldPath="S.grossSalary" value={s.grossSalary} isOverridden={'S.grossSalary' in overrides} />
      <EditableField label="Standard deduction u/s 16(ia)" fieldPath="S.standardDeduction" value={s.standardDeduction} isOverridden={false} fixed note="₹75,000" negative />
      <EditableField label="Professional tax u/s 16(iii)" fieldPath="S.professionalTax" value={s.professionalTax} isOverridden={'S.professionalTax' in overrides} negative />
      <SummaryRow label="Net taxable salary" value={s.netTaxableSalary} bold />
    </ScheduleSection>
    <ScheduleSection title="Advance Tax &amp; TDS">
      <EditableField label="TDS deducted by employer" fieldPath="TAX.tdsDeducted" value={overrides['TAX.tdsDeducted'] ?? (state.parsed.form16?.tdsDeducted ?? 0)} isOverridden={'TAX.tdsDeducted' in overrides} />
      <div className="py-2 border-b border-[var(--color-border)]">
        <div className="flex items-center justify-between">
          <span className="text-sm text-ink-700">Advance tax paid</span>
          <div className="flex items-center gap-2">
            <span className={`font-mono text-sm ${(overrides['TAX.advanceTaxPaid'] ?? 0) > 0 ? 'text-ink-900' : 'text-ink-300'}`}>
              {(overrides['TAX.advanceTaxPaid'] ?? 0) > 0 ? '₹' + (overrides['TAX.advanceTaxPaid']).toLocaleString('en-IN') : '—'}
            </span>
            <AddFieldButton fieldPath="TAX.advanceTaxPaid" label="Enter amount" />
          </div>
        </div>
      </div>
    </ScheduleSection>

    {/* Unresolved Form 16 fields — show manual entry prompts */}
    {state.parsed.form16?.unresolvedFields && state.parsed.form16.unresolvedFields.length > 0 && (
      <div className="card border-amber-200 bg-amber-50">
        <p className="font-medium text-amber-800 text-sm mb-2">
          ⚠ Some Form 16 fields could not be mapped automatically
        </p>
        <p className="text-xs text-amber-700 mb-3">
          The following labels were not recognised. Enter values manually using the edit controls above.
        </p>
        <div className="space-y-1">
          {state.parsed.form16.unresolvedFields.map((label: string) => (
            <p key={label} className="text-xs font-mono bg-white border border-amber-200 rounded px-2 py-1 text-amber-700">
              {label}
            </p>
          ))}
        </div>
        <p className="text-xs text-amber-600 mt-2">
          Tip: Cross-check these fields against your Form 16 PDF and enter the correct values above.
        </p>
      </div>
    )}
    </>
  )
}

// ─── Schedule BP ─────────────────────────────────────────────────────────────
function ScheduleBPTab({ schedules, overrides, warnings }: any) {
  const bp = schedules?.BP
  const intradayWarn = getWarning(warnings, 'INTRADAY_LOSS_RESTRICTION')
  if (!bp) return <EmptySchedule />
  return (
    <ScheduleSection
      title="Schedule BP — Intraday (Speculative)"
      source="Broker Tax P&L · Equity Intraday"
      warning={intradayWarn?.message}
    >
      <EditableField label="Speculative turnover" fieldPath="BP.speculativeTurnover" value={bp.speculativeTurnover} isOverridden={'BP.speculativeTurnover' in overrides} />
      <EditableField label="Net P&L" fieldPath="BP.netSpeculativePnL" value={bp.netSpeculativePnL} isOverridden={'BP.netSpeculativePnL' in overrides} />
      <SummaryRow label="Set-off this year" value={bp.setOffThisYear} />
      <SummaryRow label="Carry forward to AY 2027-28" value={bp.carryForward} />
    </ScheduleSection>
  )
}

// ─── Schedule CG ─────────────────────────────────────────────────────────────
function ScheduleCGTab({ schedules, overrides, warnings }: any) {
  const cg = schedules?.CG
  const ltcgWarn = getWarning(warnings, 'LTCG_EXEMPTION_CAP')
  if (!cg) return <EmptySchedule />
  return (
    <>
      <ScheduleSection title="Schedule CG — Capital Gains (Equity Delivery)" source="Broker Tax P&L · Equity" warning={ltcgWarn?.message}>
        <EditableField label="STCG — equity delivery (Sec 111A)" fieldPath="CG.equitySTCG" value={cg.equitySTCG} isOverridden={'CG.equitySTCG' in overrides} />
        <EditableField label="LTCG — equity delivery (Sec 112A)" fieldPath="CG.equityLTCG" value={cg.equityLTCG} isOverridden={'CG.equityLTCG' in overrides} />
        <EditableField label="STCL (loss)" fieldPath="CG.equitySTCL" value={cg.stcl} isOverridden={'CG.equitySTCL' in overrides} negative />
        <EditableField label="LTCL (loss)" fieldPath="CG.equityLTCL" value={cg.ltcl} isOverridden={'CG.equityLTCL' in overrides} negative />
      </ScheduleSection>
      <ScheduleSection title="Schedule CG — Capital Gains (MF)" source="MF Statement">
        <EditableField label="STCG — equity MF (Sec 111A)" fieldPath="CG.mfEquitySTCG" value={cg.mfEquitySTCG} isOverridden={'CG.mfEquitySTCG' in overrides} />
        <EditableField label="LTCG — equity MF (Sec 112A)" fieldPath="CG.mfEquityLTCG" value={cg.mfEquityLTCG} isOverridden={'CG.mfEquityLTCG' in overrides} />
        <EditableField label="Debt MF gains (slab rate)" fieldPath="CG.debtMFGains" value={cg.debtMFGains} isOverridden={'CG.debtMFGains' in overrides} />
      </ScheduleSection>
      <ScheduleSection title="Capital Gains — Net after set-off">
        <SummaryRow label="Gross STCG" value={cg.grossSTCG} />
        <SummaryRow label="Gross LTCG" value={cg.grossLTCG} />
        <SummaryRow label="LTCG exemption (Sec 112A)" value={-cg.ltcgExemption} />
        <SummaryRow label="Net STCG (after set-off)" value={cg.netSTCG} bold />
        <SummaryRow label="Taxable LTCG (after exemption)" value={cg.taxableLTCG} bold />
      </ScheduleSection>
    </>
  )
}

// ─── Schedule OS ─────────────────────────────────────────────────────────────
function ScheduleOSTab({ schedules, overrides }: any) {
  const os = schedules?.OS
  if (!os) return <EmptySchedule />
  return (
    <ScheduleSection title="Schedule OS — Other Sources" source="Broker Tax P&L · Dividends">
      <EditableField label="Dividend income" fieldPath="OS.dividendIncome" value={os.dividendIncome} isOverridden={'OS.dividendIncome' in overrides} />
      <div className="py-2 border-b border-[var(--color-border)]">
        <div className="flex items-center justify-between">
          <span className="text-sm text-ink-700">Interest income</span>
          <div className="flex items-center gap-2">
            <span className={`font-mono text-sm ${os.interestIncome > 0 ? 'text-ink-900' : 'text-ink-300'}`}>
              {os.interestIncome > 0 ? '₹' + os.interestIncome.toLocaleString('en-IN') : '—'}
            </span>
            <AddFieldButton fieldPath="OS.interestIncome" label="Add interest income" />
          </div>
        </div>
      </div>
      <SummaryRow label="Total other sources" value={os.total} bold />
    </ScheduleSection>
  )
}

// ─── Schedule CYLA ────────────────────────────────────────────────────────────
function AddFieldButton({ fieldPath, label }: { fieldPath: string; label: string }) {
  const { setOverride } = useAppDispatch()
  const [open, setOpen] = useState(false)
  const [val, setVal] = useState('')
  if (!open) return (
    <button onClick={() => setOpen(true)} className="text-xs text-sky-600 hover:text-sky-800 underline">+ Add</button>
  )
  return (
    <div className="flex items-center gap-1">
      <span className="text-sm text-ink-400">₹</span>
      <input
        type="number"
        value={val}
        onChange={e => setVal(e.target.value)}
        onBlur={() => { if (val) setOverride(fieldPath, parseFloat(val)); setOpen(false) }}
        onKeyDown={e => { if (e.key === 'Enter' && val) { setOverride(fieldPath, parseFloat(val)); setOpen(false) } if (e.key === 'Escape') setOpen(false) }}
        className="w-24 input-field text-right py-0.5 text-sm"
        placeholder={label}
        autoFocus
      />
    </div>
  )
}

function ScheduleCYLATab({ schedules }: any) {
  const cyla = schedules?.CYLA
  if (!cyla) return <EmptySchedule />
  return (
    <ScheduleSection title="Schedule CYLA — Current Year Loss Adjustment">
      <div className="py-2 text-xs text-ink-400 border-b border-[var(--color-border)]">
        Loss set-off rules: intraday loss is ring-fenced · STCL sets off against STCG then LTCG · LTCL sets off against LTCG only
      </div>
      <SummaryRow label="Net salary income" value={cyla.netSalaryIncome} />
      <SummaryRow label="Net intraday income" value={cyla.netIntradayIncome} />
      <SummaryRow label="Net STCG (post set-off)" value={cyla.netSTCG} />
      <SummaryRow label="Net LTCG (post set-off)" value={cyla.netLTCG} />
      <SummaryRow label="Net other sources" value={cyla.netOtherSources} />
      {cyla.setOffs.remainingIntradayLoss > 0 && (
        <div className="py-2 text-xs text-amber-600">
          ⚠ Intraday loss {fmtINR(cyla.setOffs.remainingIntradayLoss)} unabsorbed → carries forward
        </div>
      )}
    </ScheduleSection>
  )
}

// ─── Schedule CFL ─────────────────────────────────────────────────────────────
function ScheduleCFLTab({ schedules, warnings }: any) {
  const cfl = schedules?.CFL
  const cflWarn = getWarning(warnings, 'CARRY_FORWARD_DEADLINE')
  if (!cfl) return <EmptySchedule />
  return (
    <ScheduleSection title="Schedule CFL — Carry Forward Losses" warning={cflWarn?.message}>
      <SummaryRow label={`Intraday loss → AY ${cfl.targetAY} (up to 4 years)`} value={cfl.intradayLossCarryForward} />
      <SummaryRow label={`STCL → AY ${cfl.targetAY} (up to 8 years)`} value={cfl.stclCarryForward} />
      <SummaryRow label={`LTCL → AY ${cfl.targetAY} (up to 8 years)`} value={cfl.ltclCarryForward} />
      {cfl.intradayLossCarryForward === 0 && cfl.stclCarryForward === 0 && cfl.ltclCarryForward === 0 && (
        <div className="py-3 text-sm text-ink-400 text-center">No losses to carry forward.</div>
      )}
    </ScheduleSection>
  )
}

function EmptySchedule() {
  return (
    <div className="card text-center py-10 text-ink-400">
      <p className="text-sm">Schedule data will appear after parsing.</p>
    </div>
  )
}
