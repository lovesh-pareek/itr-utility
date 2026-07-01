/**
 * S12BankAccounts — stub (built fully in Wave 15)
 */
import { useNavigate } from 'react-router-dom'
import { StepProgress } from '../components/shared'

export function S12BankAccounts() {
  const navigate = useNavigate()
  return (
    <div>
      <StepProgress />
      <div className="card">
        <p className="text-ink-500 text-sm">S12BankAccounts — coming in Wave 15</p>
        <div className="flex gap-3 mt-4">
          <button onClick={() => navigate(-1)} className="btn-secondary">← Back</button>
          <button onClick={() => navigate('/summary')} className="btn-primary">Continue →</button>
        </div>
      </div>
    </div>
  )
}
