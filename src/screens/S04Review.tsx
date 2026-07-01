/**
 * S04 Income Hub v2 — 5-tab income review
 * Uses v1 schedule types (ScheduleS, ScheduleCG, ScheduleBP, ScheduleOS)
 * with correct field names. v2 HP data from schedules_v2.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  StepProgress, WarningBanner, ArrowRightIcon,
  ITRFormBadge, RegimeBadge, ALThresholdBanner,
} from '../components/shared'
import { EditableField, ScheduleSection, SummaryRow, fmtINR } from '../components/review'
import { useAppContext } from '../context/AppContext'
import { useEngine } from '../hooks/useEngine'

type Tab = 'Salary' | 'House Property' | 'Capital Gains' | 'Business' | 'Other Sources'
const TABS: Tab[] = ['Salary', 'House Property', 'Capital Gains', 'Business', 'Other Sources']

export default function S04Review() {
  const navigate = useNavigate()
  const { state } = useAppContext()

  useEngine()

  const [activeTab, setActiveTab] = useState<Tab>('Salary')

  const { schedules: s, schedules_v2: sv2, warnings, tax,
          selectedITRForm, detectedITRForm, selectedRegime, overrides, parsed } = state

  const hasData = !!(parsed.broker || parsed.form16)
  if (!hasData) {
    return (
      <div>
        <StepProgress />
        <div className="card text-center py-16">
          <p className="text-ink-500 mb-3">No data loaded yet.</p>
          <button onClick={() => navigate('/upload')} className="btn-primary">← Upload documents</button>
        </div>
      </div>
    )
  }

  // Tab active state — greyed if no data for that head
  const tabActive: Record<Tab, boolean> = {
    'Salary':         !!s?.S,
    'House Property': !!(sv2?.HP?.properties?.length),
    'Capital Gains':  !!(s?.CG && (s.CG.equitySTCG || s.CG.equityLTCG || s.CG.mfEquitySTCG || s.CG.mfEquityLTCG)),
    'Business':       !!(s?.BP && s.BP.netSpeculativePnL !== 0) || !!(parsed.broker?.hasFnO),
    'Other Sources':  !!(s?.OS && (s.OS.dividendIncome || s.OS.interestIncome)),
  }

  const totalIncome = tax?.totalIncome ?? 0

  return (
    <div>
      <StepProgress />

      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <h1 className="text-xl font-bold text-ink-900">Review your income</h1>
        <ITRFormBadge form={selectedITRForm} detected={detectedITRForm} />
        <RegimeBadge regime={selectedRegime} onSwitch={() => navigate('/review/regime')} />
      </div>

      <ALThresholdBanner totalIncome={totalIncome} />

      {warnings.some(w => w.id === 'AIS_MISMATCH_RISK') && (
        <div className="mb-3">
          <WarningBanner severity="warn" message="Cross-check all values against your AIS on incometax.gov.in before uploading XML." />
        </div>
      )}

      {/* 5-tab navigation */}
      <div className="flex gap-1 mb-4 overflow-x-auto pb-1">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => tabActive[tab] && setActiveTab(tab)}
            className={`px-3 py-1.5 text-sm rounded-lg font-medium whitespace-nowrap transition-colors ${
              activeTab === tab
                ? 'bg-ink-900 text-white'
                : tabActive[tab]
                ? 'bg-ink-100 text-ink-700 hover:bg-ink-200'
                : 'bg-ink-50 text-ink-300 cursor-not-allowed'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tabs */}
      {activeTab === 'Salary'         && <SalaryTab s={s} overrides={overrides} />}
      {activeTab === 'House Property' && <HousePropertyTab sv2={sv2} regime={selectedRegime} />}
      {activeTab === 'Capital Gains'  && <CapitalGainsTab s={s} overrides={overrides} />}
      {activeTab === 'Business'       && <BusinessTab s={s} broker={parsed.broker} overrides={overrides} />}
      {activeTab === 'Other Sources'  && <OtherSourcesTab s={s} overrides={overrides} regime={selectedRegime} />}

      {/* Footer */}
      <div className="mt-6 pt-4 border-t border-ink-100 flex items-center justify-between">
        <button onClick={() => navigate('/upload')} className="btn-secondary">← Back to upload</button>
        <button onClick={() => navigate('/review/deductions')} className="btn-primary">
          Continue to Deductions <ArrowRightIcon />
        </button>
      </div>

      {warnings.length > 0 && (
        <div className="mt-4 space-y-2">
          {warnings
            .filter(w => w.id !== 'AIS_MISMATCH_RISK')
            .map(w => <WarningBanner key={w.id} severity={w.severity} message={w.message} />)}
        </div>
      )}
    </div>
  )
}

// ─── Salary Tab ───────────────────────────────────────────────────────────────

function SalaryTab({ s, overrides }: { s: any; overrides: Record<string, number> }) {
  if (!s?.S) return <EmptyTab msg="No Form 16 parsed yet." />
  const S = s.S
  return (
    <ScheduleSection title="Schedule S — Salary Income" source="Form 16">
      <EditableField
        label="Gross salary"
        fieldPath="S.grossSalary"
        value={overrides['S.grossSalary'] ?? S.grossSalary}
        isOverridden={'S.grossSalary' in overrides}
      />
      <SummaryRow label="Standard deduction" value={-S.standardDeduction} muted />
      <EditableField
        label="Professional tax"
        fieldPath="S.professionalTax"
        value={-(overrides['S.professionalTax'] ?? S.professionalTax)}
        isOverridden={'S.professionalTax' in overrides}
      />
      <div className="border-t border-ink-100 mt-2 pt-2">
        <SummaryRow label="Net taxable salary" value={S.netTaxableSalary} bold />
        <SummaryRow label="TDS deducted" value={s.parsed?.tdsDeducted ?? S.tdsDeducted ?? 0} muted />
      </div>
    </ScheduleSection>
  )
}

// ─── House Property Tab ───────────────────────────────────────────────────────

function HousePropertyTab({ sv2, regime }: { sv2: any; regime: string }) {
  if (!sv2?.HP?.properties?.length) {
    return <EmptyTab msg="No house property added. Property income can be entered manually in a future update." />
  }
  const hp = sv2.HP
  return (
    <div className="space-y-3">
      {hp.properties.map((p: any) => (
        <ScheduleSection
          key={p.id}
          title={`${p.propertyType === 'self_occupied' ? 'Self-Occupied' : 'Let-Out'} — ${p.address || 'Property'}`}
          source="Manual entry"
        >
          <SummaryRow label="Annual rent received" value={p.annualRentReceived} />
          <SummaryRow label="Municipal taxes paid" value={-p.municipalTaxPaid} muted />
          <SummaryRow label="Net Annual Value" value={p.netAnnualValue} />
          {p.standardDeduction30pct > 0 && (
            <SummaryRow label="Standard deduction (30%)" value={-p.standardDeduction30pct} muted />
          )}
          <SummaryRow label="Interest on loan" value={-p.interestOnLoan} muted />
          <div className="border-t border-ink-100 mt-2 pt-2">
            <SummaryRow label="Income from HP" value={p.incomeFromHP} bold positive={p.incomeFromHP >= 0} />
          </div>
        </ScheduleSection>
      ))}
      {hp.totalIncomeFromHP < 0 && (
        <WarningBanner
          severity="info"
          message={regime === 'new'
            ? 'Under New Regime, HP loss is ring-fenced — cannot offset salary or capital gains.'
            : `HP loss of ${fmtINR(Math.abs(hp.totalIncomeFromHP))} can be set off against salary income (up to ₹2L).`}
        />
      )}
      <div className="card">
        <SummaryRow label="Total income from HP" value={hp.totalIncomeFromHP} bold positive={hp.totalIncomeFromHP >= 0} />
      </div>
    </div>
  )
}

// ─── Capital Gains Tab ────────────────────────────────────────────────────────

function CapitalGainsTab({ s, overrides }: { s: any; overrides: Record<string, number> }) {
  const [cgTab, setCGTab] = useState<'Equity' | 'MF'>('Equity')
  if (!s?.CG) return <EmptyTab msg="No capital gains data parsed." />
  const cg = s.CG

  return (
    <div>
      <div className="flex gap-1 mb-3">
        {(['Equity', 'MF'] as const).map(t => (
          <button key={t} onClick={() => setCGTab(t)}
            className={`px-3 py-1 text-xs rounded-lg font-medium ${cgTab === t ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200'}`}>
            {t === 'MF' ? 'Mutual Funds' : 'Equity Delivery'}
          </button>
        ))}
      </div>

      {cgTab === 'Equity' && (
        <ScheduleSection title="Equity Delivery" source="Broker P&L">
          <EditableField label="STCG (Sec 111A @ 20%)" fieldPath="CG.equitySTCG"
            value={overrides['CG.equitySTCG'] ?? cg.equitySTCG} isOverridden={'CG.equitySTCG' in overrides} />
          <EditableField label="LTCG above ₹1.25L (@ 12.5%)" fieldPath="CG.equityLTCG"
            value={overrides['CG.equityLTCG'] ?? cg.equityLTCG} isOverridden={'CG.equityLTCG' in overrides} />
          {(cg.stcl > 0 || cg.ltcl > 0) && (
            <div className="mt-2 pt-2 border-t border-ink-100">
              <SummaryRow label="STCL carry-forward" value={cg.stcl} muted />
              <SummaryRow label="LTCL carry-forward" value={cg.ltcl} muted />
            </div>
          )}
        </ScheduleSection>
      )}

      {cgTab === 'MF' && (
        <ScheduleSection title="Equity Mutual Funds" source="CAMS / KFintech">
          <EditableField label="STCG" fieldPath="CG.mfEquitySTCG"
            value={overrides['CG.mfEquitySTCG'] ?? cg.mfEquitySTCG} isOverridden={'CG.mfEquitySTCG' in overrides} />
          <EditableField label="LTCG above ₹1.25L" fieldPath="CG.mfEquityLTCG"
            value={overrides['CG.mfEquityLTCG'] ?? cg.mfEquityLTCG} isOverridden={'CG.mfEquityLTCG' in overrides} />
          {cg.debtMFGains !== 0 && (
            <div className="mt-2 pt-2 border-t border-ink-100">
              <SummaryRow label="Debt MF gains (slab rate)" value={cg.debtMFGains} />
            </div>
          )}
        </ScheduleSection>
      )}

      <div className="card mt-3">
        <SummaryRow label="Net STCG" value={cg.netSTCG ?? (cg.equitySTCG + cg.mfEquitySTCG)} bold />
        <SummaryRow label="Net LTCG" value={cg.netLTCG ?? cg.taxableLTCG} bold />
      </div>
    </div>
  )
}

// ─── Business Tab ─────────────────────────────────────────────────────────────

function BusinessTab({ s, broker, overrides }: { s: any; broker: any; overrides: Record<string, number> }) {
  const bp = s?.BP
  const hasFnO = broker?.hasFnO ?? false
  if (!bp && !hasFnO) return <EmptyTab msg="No business income data." />

  return (
    <div className="space-y-3">
      {bp && (
        <ScheduleSection title="Intraday (Speculative)" source="Broker P&L">
          <EditableField label="Turnover (absolute sum of P&L)" fieldPath="BP.speculativeTurnover"
            value={overrides['BP.speculativeTurnover'] ?? bp.speculativeTurnover}
            isOverridden={'BP.speculativeTurnover' in overrides} />
          <EditableField label="Net P&L" fieldPath="BP.netSpeculativePnL"
            value={overrides['BP.netSpeculativePnL'] ?? bp.netSpeculativePnL}
            isOverridden={'BP.netSpeculativePnL' in overrides} />
          {bp.netSpeculativePnL < 0 && (
            <p className="text-xs text-amber-600 mt-1">⚠ Intraday loss is ring-fenced — cannot offset salary or capital gains.</p>
          )}
          {bp.carryForward > 0 && (
            <SummaryRow label="Loss carried forward" value={bp.carryForward} muted />
          )}
        </ScheduleSection>
      )}

      {hasFnO && (
        <ScheduleSection title="F&O" source="Broker P&L">
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
            <p className="font-medium">⚠ F&O income detected — computation skipped.</p>
            <p className="text-xs mt-1">Enter taxable F&O income manually after consulting a CA.</p>
          </div>
          <div className="mt-2">
            <EditableField label="F&O taxable income (manual)" fieldPath="BP.fnoIncome"
              value={overrides['BP.fnoIncome'] ?? 0} isOverridden={'BP.fnoIncome' in overrides} />
          </div>
        </ScheduleSection>
      )}
    </div>
  )
}

// ─── Other Sources Tab ────────────────────────────────────────────────────────

function OtherSourcesTab({ s, overrides, regime }: { s: any; overrides: Record<string, number>; regime: string }) {
  if (!s?.OS) return <EmptyTab msg="No other income data." />
  const os = s.OS

  return (
    <ScheduleSection title="Schedule OS — Other Sources">
      <EditableField label="Dividend income" fieldPath="OS.dividendIncome"
        value={overrides['OS.dividendIncome'] ?? os.dividendIncome}
        isOverridden={'OS.dividendIncome' in overrides} />
      <EditableField label="Interest income" fieldPath="OS.interestIncome"
        value={overrides['OS.interestIncome'] ?? os.interestIncome}
        isOverridden={'OS.interestIncome' in overrides} />
      {regime === 'old' && (
        <p className="text-xs text-ink-400 mt-1">Savings interest up to ₹10,000 eligible for 80TTA deduction on the Deductions screen.</p>
      )}
      <div className="border-t border-ink-100 mt-2 pt-2">
        <SummaryRow label="Total other sources" value={os.total} bold />
      </div>
    </ScheduleSection>
  )
}

// ─── Empty tab card ───────────────────────────────────────────────────────────

function EmptyTab({ msg }: { msg: string }) {
  return (
    <div className="card text-center py-8">
      <p className="text-sm text-ink-400">{msg}</p>
    </div>
  )
}
