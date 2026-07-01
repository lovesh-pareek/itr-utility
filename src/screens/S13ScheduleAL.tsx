/**
 * S13 Schedule AL — Assets & Liabilities
 * Shown only when total income > ₹50L AND form is ITR-2 or ITR-3.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { StepProgress, ArrowRightIcon, ALThresholdBanner } from '../components/shared'
import { fmtINR } from '../components/review'
import { useAppContext } from '../context/AppContext'
import type { ScheduleAL, ImmovableAsset } from '../types'

const EMPTY_AL: ScheduleAL = {
  immovableAssets: [], cashInHand: 0, deposits: 0, sharesDebentures: 0,
  insurancePolicies: 0, loansAdvances: 0, motorVehicles: 0, jewellery: 0,
  archaeologicalArt: 0, otherAssets: 0, liabilityImmovable: 0, liabilityOther: 0,
  totalAssets: 0, totalLiabilities: 0,
}

export function S13ScheduleAL() {
  const navigate = useNavigate()
  const { state, dispatch } = useAppContext()
  const totalIncome = state.tax?.totalIncome ?? 0

  const [al, setAL] = useState<ScheduleAL>(state.scheduleAL ?? EMPTY_AL)
  const [showAddAsset, setShowAddAsset] = useState(false)
  const [assetDesc, setAssetDesc] = useState('')
  const [assetType, setAssetType] = useState<ImmovableAsset['assetType']>('residential')
  const [assetCost, setAssetCost] = useState(0)

  function setMovable(key: keyof ScheduleAL, val: number) {
    setAL(prev => {
      const next = { ...prev, [key]: val }
      return recompute(next)
    })
  }

  function recompute(a: ScheduleAL): ScheduleAL {
    const totalAssets = a.immovableAssets.reduce((s, x) => s + x.costOfAcquisition, 0)
      + a.cashInHand + a.deposits + a.sharesDebentures + a.insurancePolicies
      + a.loansAdvances + a.motorVehicles + a.jewellery + a.archaeologicalArt + a.otherAssets
    const totalLiabilities = a.liabilityImmovable + a.liabilityOther
    return { ...a, totalAssets, totalLiabilities }
  }

  function addImmovable() {
    if (!assetDesc) return
    const asset: ImmovableAsset = { id: `ia-${Date.now()}`, description: assetDesc, assetType, costOfAcquisition: assetCost }
    const next = recompute({ ...al, immovableAssets: [...al.immovableAssets, asset] })
    setAL(next); setAssetDesc(''); setAssetCost(0); setShowAddAsset(false)
  }

  function removeImmovable(id: string) {
    setAL(prev => recompute({ ...prev, immovableAssets: prev.immovableAssets.filter(a => a.id !== id) }))
  }

  function handleSave() {
    dispatch({ type: 'SET_SCHEDULE_AL', scheduleAL: recompute(al) })
    navigate('/summary')
  }

  const MovableField = ({ label, field }: { label: string; field: keyof ScheduleAL }) => (
    <div className="flex items-center justify-between py-1.5 border-b border-ink-50">
      <span className="text-sm text-ink-700">{label}</span>
      <div className="flex items-center gap-1">
        <span className="text-xs text-ink-400">₹</span>
        <input type="number" min={0} value={(al[field] as number) || ''}
          onChange={e => setMovable(field, parseFloat(e.target.value) || 0)}
          className="w-32 text-right text-sm border border-ink-200 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-brand-400" />
      </div>
    </div>
  )

  return (
    <div>
      <StepProgress />
      <ALThresholdBanner totalIncome={totalIncome} />
      <div className="mb-4 mt-2">
        <h1 className="text-xl font-bold text-ink-900">Schedule AL — Assets &amp; Liabilities</h1>
        <p className="text-sm text-ink-400 mt-1">Required because your total income exceeds ₹50L · Values as of 31 March 2026</p>
      </div>

      {/* A. Immovable assets */}
      <div className="card mb-3">
        <p className="text-sm font-semibold text-ink-900 mb-3">A. Immovable Assets (Land / Building)</p>
        <div className="space-y-2 mb-3">
          {al.immovableAssets.map(a => (
            <div key={a.id} className="flex items-center justify-between text-sm">
              <div>
                <span className="text-ink-800">{a.description}</span>
                <span className="text-xs text-ink-400 ml-2">({a.assetType})</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-ink-700">{fmtINR(a.costOfAcquisition)}</span>
                <button onClick={() => removeImmovable(a.id)} className="text-xs text-rose-500 hover:underline">Remove</button>
              </div>
            </div>
          ))}
        </div>
        {showAddAsset ? (
          <div className="space-y-2 border-t border-ink-100 pt-3">
            <input value={assetDesc} onChange={e => setAssetDesc(e.target.value)}
              placeholder="Description (address / plot number)"
              className="w-full border border-ink-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400" />
            <select value={assetType} onChange={e => setAssetType(e.target.value as ImmovableAsset['assetType'])}
              className="w-full border border-ink-200 rounded px-3 py-1.5 text-sm">
              <option value="residential">Residential</option>
              <option value="commercial">Commercial</option>
              <option value="agricultural">Agricultural</option>
              <option value="other">Other</option>
            </select>
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-400">₹</span>
              <input type="number" min={0} value={assetCost || ''} onChange={e => setAssetCost(parseFloat(e.target.value) || 0)}
                placeholder="Cost of acquisition" className="flex-1 border border-ink-200 rounded px-3 py-1.5 text-sm" />
            </div>
            <div className="flex gap-2">
              <button onClick={addImmovable} className="btn-primary text-sm">Add property</button>
              <button onClick={() => setShowAddAsset(false)} className="btn-secondary text-sm">Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowAddAsset(true)} className="text-xs text-brand-600 hover:underline">+ Add property</button>
        )}
      </div>

      {/* B. Movable assets */}
      <div className="card mb-3">
        <p className="text-sm font-semibold text-ink-900 mb-3">B. Movable Assets</p>
        <MovableField label="Cash in hand" field="cashInHand" />
        <MovableField label="Deposits (FD/RD/Savings)" field="deposits" />
        <MovableField label="Shares / Debentures (market value)" field="sharesDebentures" />
        <MovableField label="Insurance policies (surrender value)" field="insurancePolicies" />
        <MovableField label="Loans / Advances given" field="loansAdvances" />
        <MovableField label="Motor vehicles (book value)" field="motorVehicles" />
        <MovableField label="Jewellery / Bullion" field="jewellery" />
        <MovableField label="Archaeological / Art collections" field="archaeologicalArt" />
        <MovableField label="Any other assets" field="otherAssets" />
      </div>

      {/* C. Liabilities */}
      <div className="card mb-3">
        <p className="text-sm font-semibold text-ink-900 mb-3">C. Liabilities</p>
        <MovableField label="Loans against immovable assets" field="liabilityImmovable" />
        <MovableField label="Loans against other assets" field="liabilityOther" />
      </div>

      {/* Totals */}
      <div className="card mb-4 bg-ink-50">
        <div className="flex justify-between text-sm font-semibold">
          <span>Total Assets</span><span>{fmtINR(recompute(al).totalAssets)}</span>
        </div>
        <div className="flex justify-between text-sm mt-1 text-ink-600">
          <span>Total Liabilities</span><span>{fmtINR(recompute(al).totalLiabilities)}</span>
        </div>
      </div>

      <p className="text-xs text-ink-400 mb-4">ⓘ All values as of 31 March 2026 (end of FY). These are reported to the IT department.</p>

      <div className="flex items-center justify-between">
        <button onClick={() => navigate('/review/bank-accounts')} className="btn-secondary">← Back to Bank Accounts</button>
        <button onClick={handleSave} className="btn-primary">Continue to Summary <ArrowRightIcon /></button>
      </div>
    </div>
  )
}
