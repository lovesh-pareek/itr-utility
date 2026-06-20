import { useState } from 'react'
import * as XLSX from 'xlsx'

interface SheetInfo {
  name: string
  rowCount: number
  headers: { row: number; values: string[] }[]  // first 5 rows
}

export default function DiagnosticPage() {
  const [info, setInfo] = useState<SheetInfo[] | null>(null)
  const [detecting, setDetecting] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function handleFile(file: File) {
    setDetecting(true)
    setInfo(null)
    setResult(null)

    const reader = new FileReader()
    reader.onload = async (e) => {
      const data = new Uint8Array(e.target!.result as ArrayBuffer)
      const wb = XLSX.read(data, { type: 'array', cellDates: true })

      const sheets: SheetInfo[] = wb.SheetNames.map(name => {
        const ws = wb.Sheets[name]
        if (!ws || !ws['!ref']) return { name, rowCount: 0, headers: [] }

        const range = XLSX.utils.decode_range(ws['!ref'])
        const rowCount = range.e.r - range.s.r + 1

        // Read first 5 rows
        const headers: { row: number; values: string[] }[] = []
        for (let r = range.s.r; r <= Math.min(range.s.r + 4, range.e.r); r++) {
          const vals: string[] = []
          for (let c = range.s.c; c <= Math.min(range.e.c, 20); c++) {
            const cell = ws[XLSX.utils.encode_cell({ r, c })]
            vals.push(cell?.v != null ? String(cell.v).trim() : '')
          }
          if (vals.some(v => v)) headers.push({ row: r - range.s.r, values: vals })
        }

        return { name, rowCount, headers }
      })

      setInfo(sheets)

      // Run broker detection
      const { detectBroker } = await import('../parsers/brokerDetection')
      const detected = detectBroker(wb)
      setResult(detected)
      setDetecting(false)
    }
    reader.readAsArrayBuffer(file)
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-ink-900 mb-2">Broker File Diagnostic</h1>
      <p className="text-sm text-ink-500 mb-6">
        Drop your broker P&L file to see exactly what the parser reads. Use this to debug detection issues.
      </p>

      <div
        className="border-2 border-dashed border-ink-300 rounded-xl p-8 text-center cursor-pointer hover:border-ink-500 mb-6"
        onClick={() => document.getElementById('diag-input')?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
      >
        <input id="diag-input" type="file" accept=".xlsx,.xls" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        <p className="text-ink-500">Drop Excel file here or click to browse</p>
      </div>

      {detecting && <p className="text-ink-500 text-sm">Reading file…</p>}

      {result && (
        <div className={`rounded-xl px-4 py-3 mb-4 text-sm font-medium ${
          result === 'unknown' ? 'bg-rose-50 border border-rose-200 text-rose-700' :
          'bg-emerald-50 border border-emerald-200 text-emerald-700'
        }`}>
          Detection result: <span className="font-mono font-bold">{result}</span>
          {result === 'unknown' && (
            <p className="font-normal mt-1 text-rose-600">
              No signature matched. Check the sheet names and row 0 headers below — the actual column headers may be on a different row.
            </p>
          )}
        </div>
      )}

      {info && info.map(sheet => (
        <div key={sheet.name} className="card mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold text-ink-900">
              Sheet: <span className="font-mono text-sky-700">"{sheet.name}"</span>
            </h2>
            <span className="text-xs text-ink-400 font-mono">{sheet.rowCount} rows</span>
          </div>

          <div className="space-y-2">
            {sheet.headers.map(h => (
              <div key={h.row}>
                <p className="text-xs font-mono text-ink-400 mb-1">Row {h.row} (parser reads row 0 as headers):</p>
                <div className="flex flex-wrap gap-1">
                  {h.values.filter(v => v).map((v, i) => (
                    <span key={i} className={`text-xs font-mono px-2 py-0.5 rounded border ${
                      h.row === 0
                        ? 'bg-sky-50 border-sky-200 text-sky-800'
                        : 'bg-ink-50 border-ink-200 text-ink-500'
                    }`}>
                      {v}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {info && (
        <div className="card bg-ink-50">
          <p className="text-xs font-mono text-ink-600 font-semibold mb-2">Raw JSON (copy for bug report):</p>
          <pre className="text-xs text-ink-500 overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(info.map(s => ({ name: s.name, row0: s.headers[0]?.values.filter(Boolean) })), null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}
