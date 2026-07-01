import React from 'react'
/**
 * S05 Deductions Screen
 * New Regime: only 80CCD(2) and 80CCH shown; rest greyed.
 * Old Regime: full Chapter VI-A with cap progress bars.
 * Age-aware: senior citizen gets 80D/80TTB caps from filerCategory.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { StepProgress, WarningBanner, ArrowRightIcon } from '../components/shared'
import { fmtINR } from '../components/review'
import { useAppContext } from '../context/AppContext'
import { computeDeductionsVI_A, compute80CBucketUsage, emptyRawDeductions, type RawDeductions } from '../engine/deductionsEngine'

export function S05Deductions() {
  const navigate = useNavigate()
  const { state, dispatch } = useAppContext()
  const { selectedRegime, filerProfile } = state

  const grossSalary = state.schedules?.S?.grossSalary ?? 0
  const fc = filerProfile.filerCategory

  const [raw, setRaw] = useState<RawDeductions>(() => {
    // Restore from saved if available, else empty
    return emptyRawDeductions(grossSalary)
  })

  const computed = computeDeductionsVI_A(raw, selectedRegime, fc)
  const bucketUsage = compute80CBucketUsage(raw)

  function setField(key: keyof RawDeductions, value: number | boolean) {
    setRaw(prev => ({ ...prev, [key]: value }))
  }

  function handleContinue() {
    dispatch({ type: 'SET_DEDUCTIONS', deductions: computed })
    navigate('/review/regime')
  }

  const isNew = selectedRegime === 'new'

  return (
    <div>
      <StepProgress />
      <div className="mb-4">
        <h1 className="text-xl font-bold text-ink-900">Deductions</h1>
        <p className="text-sm text-ink-400 mt-1">
          {isNew ? 'Filing under New Regime — most deductions do not apply.' : 'Old Regime — enter your Chapter VI-A deductions.'}
        </p>
      </div>

      {filerProfile.filerCategory !== 'general' && !isNew && (
        <div className="mb-3 text-xs bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-blue-800">
          {filerProfile.filerCategory === 'super_senior' ? 'Super Senior Citizen' : 'Senior Citizen'} — enhanced 80D and 80TTB caps applied.
        </div>
      )}

      {/* ── New Regime: compact view ── */}
      {isNew && (
        <div className="space-y-3">
          <div className="card">
            <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-3">Allowed under New Regime</p>
            <DeductionField label="80CCD(2) — Employer NPS contribution" subLabel={`Up to 10% of basic salary (₹${fmtINR(Math.round(grossSalary * 0.1))} cap)`}
              value={raw.sec80CCD2} onChange={v => setField('sec80CCD2', v)} />
            <DeductionField label="80CCH — Agnipath scheme" value={raw.sec80CCH} onChange={v => setField('sec80CCH', v)} />
          </div>
          <div className="card opacity-60">
            <p className="text-xs font-semibold text-ink-400 uppercase tracking-wider mb-2">Not applicable under New Regime</p>
            <p className="text-xs text-ink-400">80C · 80D · 80E · 80G · 80TTA and all other Chapter VI-A deductions are not available.</p>
            <button onClick={() => navigate('/review/regime')} className="mt-2 text-xs text-brand-600 hover:underline">
              Compare Old vs New Regime →
            </button>
          </div>
          <DeductionTotal total={computed.total} />
        </div>
      )}

      {/* ── Old Regime: full form ── */}
      {!isNew && (
        <div className="space-y-3">
          {/* 80C bucket */}
          <div className="card">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-ink-900">Section 80C — cap ₹1,50,000</p>
              <span className="text-xs text-ink-500">{fmtINR(bucketUsage.used)} / ₹1,50,000</span>
            </div>
            <CapBar pct={bucketUsage.pct} />
            <div className="mt-3 space-y-2">
              <DeductionField label="LIC premiums" value={raw.sec80C_lic} onChange={v => setField('sec80C_lic', v)} />
              <DeductionField label="PPF contributions" value={raw.sec80C_ppf} onChange={v => setField('sec80C_ppf', v)} />
              <DeductionField label="ELSS / mutual funds" value={raw.sec80C_elss} onChange={v => setField('sec80C_elss', v)} />
              <DeductionField label="Home loan principal" value={raw.sec80C_homeLoanPrincipal} onChange={v => setField('sec80C_homeLoanPrincipal', v)} />
              <DeductionField label="Tuition fees" value={raw.sec80C_tuitionFees} onChange={v => setField('sec80C_tuitionFees', v)} />
              <DeductionField label="Other 80C" value={raw.sec80C_other} onChange={v => setField('sec80C_other', v)} />
            </div>
          </div>

          {/* 80CCD(1B) */}
          <div className="card">
            <DeductionField label="80CCD(1B) — NPS additional self contribution" subLabel="₹50,000 over and above 80C cap"
              value={raw.sec80CCD1B} onChange={v => setField('sec80CCD1B', v)} />
          </div>

          {/* 80CCD(2) */}
          <div className="card">
            <DeductionField label="80CCD(2) — Employer NPS contribution" subLabel={`Up to 10% of salary (₹${fmtINR(Math.round(grossSalary * 0.1))} cap)`}
              value={raw.sec80CCD2} onChange={v => setField('sec80CCD2', v)} />
          </div>

          {/* 80D */}
          <div className="card">
            <p className="text-sm font-semibold text-ink-900 mb-3">Section 80D — Health Insurance</p>
            <DeductionField
              label={fc === 'general' ? 'Self + family (cap ₹25,000)' : 'Self + family (cap ₹50,000 — senior)'}
              value={raw.sec80D_self} onChange={v => setField('sec80D_self', v)} />
            <div className="mt-2">
              <DeductionField label="Parents premium" value={raw.sec80D_parents} onChange={v => setField('sec80D_parents', v)} />
              <label className="flex items-center gap-2 mt-1 text-xs text-ink-600">
                <input type="checkbox" checked={raw.sec80D_parentsAreSenior}
                  onChange={e => setField('sec80D_parentsAreSenior', e.target.checked)}
                  className="rounded" />
                Parents are senior citizens (cap ₹50,000)
              </label>
            </div>
          </div>

          {/* 80E */}
          <div className="card">
            <DeductionField label="80E — Education loan interest" subLabel="No cap"
              value={raw.sec80E} onChange={v => setField('sec80E', v)} />
          </div>

          {/* 80EEA */}
          <div className="card">
            <DeductionField label="80EEA — First home loan interest" subLabel="Affordable housing · Cap ₹1,50,000"
              value={raw.sec80EEA} onChange={v => setField('sec80EEA', v)} />
          </div>

          {/* 80GG */}
          <div className="card">
            <DeductionField label="80GG — HRA (no HRA in salary)" subLabel="Cap ₹5,000/month = ₹60,000 annual"
              value={raw.sec80GG} onChange={v => setField('sec80GG', v)} />
          </div>

          {/* 80G Donations */}
          <div className="card">
            <p className="text-sm font-semibold text-ink-900 mb-2">Section 80G — Donations</p>
            <DonationRows raw={raw} setRaw={setRaw} />
          </div>

          {/* 80TTA / 80TTB */}
          <div className="card">
            {(fc === 'senior' || fc === 'super_senior') ? (
              <DeductionField label="80TTB — Senior citizen interest income" subLabel="Cap ₹50,000 (replaces 80TTA)"
                value={raw.sec80TTB} onChange={v => setField('sec80TTB', v)} />
            ) : (
              <DeductionField label="80TTA — Savings account interest" subLabel="Cap ₹10,000"
                value={raw.sec80TTA} onChange={v => setField('sec80TTA', v)} />
            )}
          </div>

          <DeductionTotal total={computed.total} />
        </div>
      )}

      {computed.total === 0 && !isNew && (
        <WarningBanner severity="info" message="No deductions entered. New Regime may be equally effective — compare before filing." />
      )}

      <div className="mt-6 flex items-center justify-between">
        <button onClick={() => navigate('/review')} className="btn-secondary">← Back to income</button>
        <button onClick={handleContinue} className="btn-primary">
          Continue to Regime <ArrowRightIcon />
        </button>
      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DeductionField({ label, subLabel, value, onChange }: {
  label: string; subLabel?: string; value: number; onChange: (v: number) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div className="flex-1">
        <p className="text-sm text-ink-800">{label}</p>
        {subLabel && <p className="text-xs text-ink-400">{subLabel}</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <span className="text-xs text-ink-400">₹</span>
        <input
          type="number" min={0} value={value || ''}
          onChange={e => onChange(Math.max(0, parseFloat(e.target.value) || 0))}
          className="w-28 text-right text-sm border border-ink-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-400"
          placeholder="0"
        />
      </div>
    </div>
  )
}

function CapBar({ pct }: { pct: number }) {
  const w = Math.min(100, Math.round(pct * 100))
  return (
    <div className="h-1.5 bg-ink-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full transition-all ${w >= 100 ? 'bg-emerald-500' : 'bg-brand-500'}`}
        style={{ width: `${w}%` }} />
    </div>
  )
}

// ─── Donation Rows (80G) ────────────────────────────────────────────────────

function DonationRows({ raw, setRaw }: { raw: RawDeductions; setRaw: React.Dispatch<React.SetStateAction<RawDeductions>> }) {
  const donations = raw.sec80G ?? []

  function add() {
    setRaw(prev => ({
      ...prev,
      sec80G: [...(prev.sec80G ?? []), { institution: '', amount: 0, cashAmount: 0, deductiblePct: 0.5 as 0.5 | 1.0 }],
    }))
  }

  function update(i: number, key: string, val: any) {
    setRaw(prev => {
      const next = [...(prev.sec80G ?? [])]
      next[i] = { ...next[i], [key]: val }
      return { ...prev, sec80G: next }
    })
  }

  function remove(i: number) {
    setRaw(prev => ({ ...prev, sec80G: (prev.sec80G ?? []).filter((_, j) => j !== i) }))
  }

  return (
    <div className="space-y-2">
      {donations.map((d: any, i: number) => (
        <div key={i} className="border border-ink-100 rounded-lg p-3 space-y-2">
          <input value={d.institution} onChange={e => update(i, 'institution', e.target.value)}
            placeholder="Institution name" className="w-full text-sm border border-ink-200 rounded px-2 py-1" />
          <div className="flex gap-2 items-center">
            <div className="flex-1">
              <label className="text-xs text-ink-500">Amount ₹</label>
              <input type="number" min={0} value={d.amount || ''}
                onChange={e => update(i, 'amount', parseFloat(e.target.value) || 0)}
                className="w-full text-sm border border-ink-200 rounded px-2 py-1" />
            </div>
            <div className="flex-1">
              <label className="text-xs text-ink-500">Cash portion ₹ (max ₹2,000)</label>
              <input type="number" min={0} max={2000} value={d.cashAmount || ''}
                onChange={e => update(i, 'cashAmount', Math.min(2000, parseFloat(e.target.value) || 0))}
                className="w-full text-sm border border-ink-200 rounded px-2 py-1" />
            </div>
            <div>
              <label className="text-xs text-ink-500">Deductible</label>
              <select value={d.deductiblePct}
                onChange={e => update(i, 'deductiblePct', parseFloat(e.target.value) as 0.5 | 1.0)}
                className="w-full text-sm border border-ink-200 rounded px-2 py-1">
                <option value={1.0}>100%</option>
                <option value={0.5}>50%</option>
              </select>
            </div>
          </div>
          <button onClick={() => remove(i)} className="text-xs text-rose-500 hover:underline">Remove</button>
        </div>
      ))}
      <button onClick={add} className="text-xs text-brand-600 hover:underline">+ Add donation</button>
      {donations.length > 0 && (
        <p className="text-xs text-ink-400">Cash donations above ₹2,000 are not eligible for 80G deduction.</p>
      )}
    </div>
  )
}

function DeductionTotal({ total }: { total: number }) {
  return (
    <div className="card border-ink-200 bg-ink-50">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-ink-900">Total deductions</span>
        <span className="text-base font-bold text-ink-900">{fmtINR(total)}</span>
      </div>
    </div>
  )
}
