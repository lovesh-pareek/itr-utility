import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { WarningBanner, DownloadIcon } from '../components/shared'
import { useAppContext } from '../context/AppContext'

type BtnState = 'idle' | 'generating' | 'done' | 'error'

export default function S06Export() {
  const navigate = useNavigate()
  const { state } = useAppContext()
  const [pdfState, setPdfState] = useState<BtnState>('idle')
  const [xmlState, setXmlState] = useState<BtnState>('idle')
  const [xmlErrors, setXmlErrors] = useState<string[]>([])
  const [regimePdfState, setRegimePdfState] = useState<BtnState>('idle')

  const hasData = !!(state.tax && state.schedules)

  async function handlePDF() {
    if (!state.tax || !state.schedules || !state.parsed.form16) return
    setPdfState('generating')
    try {
      const { generateTaxSummaryPDF_v2 } = await import('../output/pdfGenerator')
      await generateTaxSummaryPDF_v2(state)
      setPdfState('done')
    } catch (err) {
      console.error(err)
      setPdfState('error')
    }
  }

  async function handleXML() {
    if (!state.tax || !state.schedules) return
    setXmlState('generating')
    setXmlErrors([])
    try {
      const { generateXML_v2 } = await import('../output/xmlGenerator')
      const result = generateXML_v2(state)
      if (!result.valid) {
        setXmlErrors(result.errors)
        setXmlState('error')
        return
      }
      // Trigger download
      const blob = new Blob([result.xml], { type: 'application/xml' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${(state.selectedITRForm ?? 'ITR3').toLowerCase()}_ay2026_27.xml`
      a.click()
      URL.revokeObjectURL(url)
      setXmlState('done')
    } catch (err) {
      console.error(err)
      setXmlState('error')
    }
  }

  async function handleRegimePDF() {
    setRegimePdfState('generating')
    try {
      const { generateRegimeComparisonPDF } = await import('../output/pdfGenerator')
      await generateRegimeComparisonPDF(state)
      setRegimePdfState('done')
    } catch (err) {
      console.error(err)
      setRegimePdfState('error')
    }
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-ink-900 mb-1">Your {state.selectedITRForm ?? 'ITR3'} data is ready</h1>
        <p className="text-sm text-ink-400">Download both files, then upload the XML on the portal</p>
      </div>

      {!hasData && (
        <div className="mb-4">
          <WarningBanner
            severity="warn"
            message="No tax data available. Please upload and parse your documents first."
          />
          <button onClick={() => navigate('/upload')} className="btn-primary mt-3">← Upload documents</button>
        </div>
      )}

      <div className="space-y-4 mb-6">
        {/* PDF */}
        <div className="card">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xl">📄</span>
            <div>
              <p className="font-medium text-ink-900">Tax Summary — PDF</p>
              <p className="text-xs text-ink-400">Full schedule-wise breakdown for your records</p>
            </div>
          </div>
          <button
            onClick={handlePDF}
            disabled={!hasData || pdfState === 'generating'}
            className={`btn-secondary ${!hasData ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            {pdfState === 'generating' ? (
              <><SpinnerInline /> Generating…</>
            ) : pdfState === 'done' ? (
              <>✓ Downloaded</>
            ) : pdfState === 'error' ? (
              <>⚠ Error — try again</>
            ) : (
              <><DownloadIcon /> Download PDF</>
            )}
          </button>
        </div>

        {/* XML */}
        <div className="card">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xl">📋</span>
            <div>
              <p className="font-medium text-ink-900">{state.selectedITRForm ?? 'ITR3'} XML — AY 2026-27</p>
              <p className="text-xs text-ink-400">Upload this on incometax.gov.in to pre-fill your return</p>
            </div>
          </div>
          <button
            onClick={handleXML}
            disabled={!hasData || xmlState === 'generating'}
            className={`btn-primary ${!hasData ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            {xmlState === 'generating' ? (
              <><SpinnerInline /> Generating…</>
            ) : xmlState === 'done' ? (
              <>✓ Downloaded</>
            ) : xmlState === 'error' ? (
              <>⚠ Validation errors</>
            ) : (
              <><DownloadIcon /> Download XML</>
            )}
          </button>

          {xmlErrors.length > 0 && (
            <div className="mt-3 space-y-1">
              {xmlErrors.map((e, i) => (
                <div key={i} className="banner-error text-xs">
                  <span>⚠</span>
                  <span>{e}</span>
                  {' '}
                  <button
                    onClick={() => navigate('/review')}
                    className="underline hover:no-underline ml-1"
                  >
                    Fix in Review →
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Regime Comparison PDF */}
        {state.regimeComparison && (
          <div className="card">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-xl">📊</span>
              <div>
                <p className="font-medium text-ink-900">Regime Comparison — PDF</p>
                <p className="text-xs text-ink-400">Old vs New Regime side-by-side, with recommendation</p>
              </div>
            </div>
            <button
              onClick={handleRegimePDF}
              disabled={regimePdfState === 'generating'}
              className="btn-secondary"
            >
              {regimePdfState === 'generating' ? (
                <><SpinnerInline /> Generating…</>
              ) : regimePdfState === 'done' ? (
                <>✓ Downloaded</>
              ) : regimePdfState === 'error' ? (
                <>⚠ Error — try again</>
              ) : (
                <><DownloadIcon /> Download PDF</>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Portal steps */}
      <div className="card mb-4">
        <h2 className="font-display font-semibold text-ink-700 text-sm mb-3">
          How to upload XML on the portal
        </h2>
        <ol className="space-y-2">
          {[
            'Go to incometax.gov.in → Login',
            'e-File → Income Tax Returns → File ITR',
            `Select AY 2026-27 → ${state.selectedITRForm ?? 'ITR-3'} → Upload XML`,
            `Select the downloaded ${(state.selectedITRForm ?? 'ITR3').toLowerCase()}_ay2026_27.xml file`,
            'Review all pre-filled values on portal',
            'Verify against your AIS before confirming',
            'Submit and e-verify',
          ].map((step, i) => (
            <li key={i} className="flex gap-3 text-sm text-ink-600">
              <span className="shrink-0 w-5 h-5 rounded-full bg-ink-100 text-ink-500 text-xs font-bold flex items-center justify-center">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </div>

      <WarningBanner
        severity="warn"
        message="Review all values on the portal before submitting. This tool is a preparation aid — you are responsible for final accuracy."
      />
    </div>
  )
}

function SpinnerInline() {
  return (
    <svg className="w-4 h-4 animate-spin" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="28" strokeDashoffset="10" strokeLinecap="round" />
    </svg>
  )
}
