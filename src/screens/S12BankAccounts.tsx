/**
 * S12 Bank Accounts — required before XML download.
 * IFSC validation + bank name auto-fill. One refund account enforced.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { StepProgress, ArrowRightIcon } from '../components/shared'
import { useAppContext } from '../context/AppContext'
import { validateBankAccount, lookupBankName, validateBankAccountSet } from '../engine/taxCreditsEngine'
import type { BankAccount } from '../types'

export function S12BankAccounts() {
  const navigate = useNavigate()
  const { state, dispatch } = useAppContext()
  const { bankAccounts } = state

  const [showForm, setShowForm] = useState(false)
  const [ifsc, setIfsc] = useState('')
  const [accNum, setAccNum] = useState('')
  const [accType, setAccType] = useState<BankAccount['accountType']>('savings')
  const [isRefund, setIsRefund] = useState(bankAccounts.length === 0)
  const [bankName, setBankName] = useState('')
  const [errors, setErrors] = useState<{ ifsc?: string; accountNumber?: string }>({})

  function handleIfscChange(val: string) {
    const upper = val.toUpperCase()
    setIfsc(upper)
    if (upper.length >= 4) {
      setBankName(lookupBankName(upper) ?? '')
    }
  }

  function handleAdd() {
    const result = validateBankAccount({ ifscCode: ifsc, accountNumber: accNum })
    if (!result.valid) { setErrors(result.errors); return }
    setErrors({})
    // If marking as refund, clear existing refund flag
    const updatedAccounts = isRefund
      ? bankAccounts.map(a => ({ ...a, isRefundAccount: false }))
      : bankAccounts
    const newAccount: BankAccount = {
      id: `ba-${Date.now()}`,
      ifscCode: ifsc.toUpperCase(),
      accountNumber: accNum,
      bankName: bankName || lookupBankName(ifsc) || '',
      accountType: accType,
      isRefundAccount: isRefund,
      isForeign: false,
    }
    dispatch({ type: 'SET_BANK_ACCOUNTS', accounts: [...updatedAccounts, newAccount] })
    setIfsc(''); setAccNum(''); setIsRefund(false); setBankName(''); setShowForm(false)
  }

  function setRefund(id: string) {
    dispatch({
      type: 'SET_BANK_ACCOUNTS',
      accounts: bankAccounts.map(a => ({ ...a, isRefundAccount: a.id === id })),
    })
  }

  const setValid = validateBankAccountSet(bankAccounts)
  const canContinue = setValid.valid

  return (
    <div>
      <StepProgress />
      <div className="mb-4">
        <h1 className="text-xl font-bold text-ink-900">Bank Accounts</h1>
        <p className="text-sm text-ink-400 mt-1">Required for ITR filing — add all accounts held during FY 2025-26</p>
      </div>

      {/* Existing accounts */}
      <div className="space-y-2 mb-4">
        {bankAccounts.map(acc => (
          <div key={acc.id} className="card">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-ink-900">{acc.bankName || acc.ifscCode}</p>
                <p className="text-xs text-ink-500 font-mono mt-0.5">
                  IFSC: {acc.ifscCode} · ●●●●{acc.accountNumber.slice(-4)} · {acc.accountType}
                </p>
                {acc.isRefundAccount && (
                  <span className="inline-flex items-center mt-1 text-xs bg-amber-50 border border-amber-200 text-amber-700 px-2 py-0.5 rounded-full">★ Refund account</span>
                )}
              </div>
              <div className="flex gap-2">
                {!acc.isRefundAccount && (
                  <button onClick={() => setRefund(acc.id)} className="text-xs text-brand-600 hover:underline">Set refund</button>
                )}
                <button onClick={() => dispatch({ type: 'REMOVE_BANK_ACCOUNT', id: acc.id })} className="text-xs text-rose-500 hover:underline">Remove</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Add form */}
      {showForm ? (
        <div className="card border-brand-200">
          <p className="text-sm font-semibold text-ink-900 mb-3">Add bank account</p>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-ink-600 font-medium">IFSC code</label>
              <input value={ifsc} onChange={e => handleIfscChange(e.target.value)}
                className="mt-1 w-full border border-ink-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-400"
                placeholder="SBIN0001234" maxLength={11} />
              {bankName && <p className="text-xs text-emerald-600 mt-1">→ {bankName}</p>}
              {errors.ifsc && <p className="text-xs text-rose-600 mt-1">{errors.ifsc}</p>}
            </div>
            <div>
              <label className="text-xs text-ink-600 font-medium">Account number</label>
              <input value={accNum} onChange={e => setAccNum(e.target.value)}
                className="mt-1 w-full border border-ink-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-400"
                placeholder="9–18 digit account number" />
              {errors.accountNumber && <p className="text-xs text-rose-600 mt-1">{errors.accountNumber}</p>}
            </div>
            <div>
              <label className="text-xs text-ink-600 font-medium">Account type</label>
              <select value={accType} onChange={e => setAccType(e.target.value as BankAccount['accountType'])}
                className="mt-1 w-full border border-ink-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400">
                <option value="savings">Savings</option>
                <option value="current">Current</option>
                <option value="overdraft">Overdraft</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink-700">
              <input type="checkbox" checked={isRefund} onChange={e => setIsRefund(e.target.checked)} className="rounded" />
              Mark as refund account
            </label>
            <div className="flex gap-2">
              <button onClick={handleAdd} className="btn-primary text-sm">Save account</button>
              <button onClick={() => setShowForm(false)} className="btn-secondary text-sm">Cancel</button>
            </div>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowForm(true)} className="btn-secondary w-full">+ Add bank account</button>
      )}

      {!canContinue && bankAccounts.length > 0 && (
        <div className="mt-3">
          {setValid.errors.map((e, i) => (
            <p key={i} className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-1.5 mt-1">{e}</p>
          ))}
        </div>
      )}

      {bankAccounts.length === 0 && (
        <p className="text-xs text-ink-400 mt-3 text-center">⚠ Add at least one account before downloading XML.</p>
      )}

      <div className="mt-6 flex items-center justify-between">
        <button onClick={() => navigate('/review/ais')} className="btn-secondary">← Back to AIS</button>
        <button onClick={() => navigate(state.tax && state.tax.totalIncome > 5_000_000 && state.selectedITRForm !== 'ITR1' && state.selectedITRForm !== 'ITR4' ? '/review/schedule-al' : '/summary')}
          disabled={!canContinue} className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
          Continue <ArrowRightIcon />
        </button>
      </div>
    </div>
  )
}
