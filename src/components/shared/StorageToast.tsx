import { useState, useEffect } from 'react'
import { XIcon } from './index'

export function StorageToast() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    function handler() {
      setVisible(true)
      setTimeout(() => setVisible(false), 6000)
    }
    window.addEventListener('storage-quota-exceeded', handler)
    return () => window.removeEventListener('storage-quota-exceeded', handler)
  }, [])

  if (!visible) return null

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 fade-in">
      <div className="bg-rose-700 text-white text-sm px-4 py-3 rounded-xl shadow-lg flex items-center gap-3 max-w-sm">
        <span>⚠️ Storage full — session cannot be saved. Free up browser storage.</span>
        <button onClick={() => setVisible(false)} className="shrink-0 opacity-70 hover:opacity-100">
          <XIcon />
        </button>
      </div>
    </div>
  )
}
