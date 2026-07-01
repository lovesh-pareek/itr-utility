/**
 * PDF Generators v2
 *
 * generateTaxSummaryPDF_v2(state)   — 5-income-head layout, regime badge,
 *                                     deductions, prior CFL used
 * generateRegimeComparisonPDF(state) — two-column Old vs New table
 *
 * Both fall back to v1 schedules if v2 schedules_v2 not present.
 */

import type { AppState } from '../types'

// ─── Shared helpers ───────────────────────────────────────────────────────────

function fmt(n: number): string {
  return '₹' + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}
function fmtSigned(n: number): string {
  return (n < 0 ? '−' : '') + fmt(n)
}

type Doc = any   // jsPDF instance — typed loosely to avoid bundling @types/jspdf

function makePDFHelpers(doc: Doc, marginL = 18, col2 = 145) {
  const pageW = 210
  let y = 20

  const newPage = () => { doc.addPage(); y = 20 }
  const guard = (space = 10) => { if (y > 277 - space) newPage() }

  const line = (label: string, value: string, bold = false, indent = 0) => {
    guard()
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(9)
    doc.setTextColor(50, 50, 70)
    doc.text(label, marginL + indent, y)
    doc.text(value, col2, y, { align: 'right' })
    y += 5.5
  }

  const section = (title: string) => {
    guard(12)
    y += 3
    doc.setFillColor(237, 240, 247)
    doc.rect(marginL, y - 3.5, pageW - marginL * 2, 7, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(15, 17, 23)
    doc.text(title, marginL + 2, y)
    y += 6
  }

  const divider = () => {
    guard()
    doc.setDrawColor(200, 200, 210)
    doc.line(marginL, y, pageW - marginL, y)
    y += 3
  }

  const badge = (text: string, r: number, g: number, b: number) => {
    guard()
    doc.setFillColor(r, g, b)
    doc.roundedRect(marginL, y - 3, 45, 5.5, 1, 1, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7)
    doc.setTextColor(255, 255, 255)
    doc.text(text, marginL + 2, y)
    y += 7
  }

  const getY = () => y
  const setY = (v: number) => { y = v }

  return { line, section, divider, badge, guard, newPage, getY, setY, pageW, marginL }
}

function addFooter(doc: Doc, pageW: number, margin: number, version = 'v2.0') {
  const totalPages = doc.internal.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(160, 160, 175)
    doc.text(
      `ITR Filing Utility ${version} — Verify all values against AIS before filing. Preparation aid only.`,
      margin, 292
    )
    doc.text(`Page ${i} of ${totalPages}`, pageW - margin, 292, { align: 'right' })
  }
}

// ─── Tax Summary PDF v2 ───────────────────────────────────────────────────────

export async function generateTaxSummaryPDF(state: AppState): Promise<void> {
  return generateTaxSummaryPDF_v2(state)
}

export async function generateTaxSummaryPDF_v2(state: AppState): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const { tax, schedules, schedules_v2: sv2, parsed, warnings,
          selectedRegime, selectedITRForm, deductions, regimeComparison } = state

  if (!tax || !schedules) throw new Error('No tax data to export')

  const { line, section, divider, badge, guard, getY, setY, pageW, marginL } = makePDFHelpers(doc)

  // ── Header ──────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(15, 17, 23)
  doc.text(`${selectedITRForm ?? 'ITR-3'} Tax Summary`, marginL, 20)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(100, 100, 120)
  const now = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  doc.text(`FY 2025-26 · AY 2026-27 · Prepared: ${now}`, marginL, 27)

  // Regime badge
  setY(33)
  const isNew = selectedRegime === 'new'
  badge(
    isNew ? 'NEW REGIME' : 'OLD REGIME',
    isNew ? 22 : 180, isNew ? 163 : 140, isNew ? 74 : 20
  )

  if (parsed.form16) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(80, 80, 100)
    doc.text(
      `PAN: ${parsed.form16.pan || '—'}  ·  Employer: ${parsed.form16.employerName || '—'}  ·  TAN: ${parsed.form16.tanEmployer || '—'}`,
      marginL, getY()
    )
    setY(getY() + 5)
  }
  divider()

  // ── 5 Income Head Cards ──────────────────────────────────────────────────────
  section('Income Summary')

  const heads = [
    { label: 'Salary income',       value: schedules.S?.netTaxableSalary ?? 0 },
    { label: 'House property',      value: sv2?.HP?.totalIncomeFromHP ?? 0 },
    { label: 'Capital gains (net)', value: (schedules.CG?.netSTCG ?? 0) + (schedules.CG?.taxableLTCG ?? 0) },
    { label: 'Business (intraday)', value: schedules.BP?.netSpeculativePnL ?? 0 },
    { label: 'Other sources',       value: schedules.OS?.total ?? 0 },
  ]
  for (const h of heads) {
    if (h.value !== 0) line(h.label, fmtSigned(h.value), false, 4)
  }
  line('Total income', fmt(tax.totalIncome), true)

  // ── Deductions ───────────────────────────────────────────────────────────────
  if (deductions && deductions.total > 0) {
    section(`Deductions — ${isNew ? 'New Regime' : 'Old Regime'}`)
    if (!isNew) {
      const d = deductions
      if (d.sec80C > 0)    line('80C (LIC/PPF/ELSS etc.)', fmt(d.sec80C), false, 4)
      if (d.sec80CCD1B > 0) line('80CCD(1B) NPS', fmt(d.sec80CCD1B), false, 4)
      if (d.sec80D_self > 0) line('80D Health insurance', fmt(d.sec80D_self + d.sec80D_parents), false, 4)
      if (d.sec80E > 0)    line('80E Education loan interest', fmt(d.sec80E), false, 4)
      if (d.sec80TTA > 0)  line('80TTA Savings interest', fmt(d.sec80TTA), false, 4)
      if (d.sec80TTB > 0)  line('80TTB Senior interest', fmt(d.sec80TTB), false, 4)
    }
    if (deductions.sec80CCD2 > 0) line('80CCD(2) Employer NPS', fmt(deductions.sec80CCD2), false, 4)
    line('Total deductions', fmt(deductions.total), true)
    line('Taxable income after deductions', fmt(tax.slabTaxableIncome), true)
  }

  // ── Schedule CG ──────────────────────────────────────────────────────────────
  if (schedules.CG && (schedules.CG.netSTCG > 0 || schedules.CG.taxableLTCG > 0)) {
    section('Schedule CG — Capital Gains')
    line('Equity STCG (Sec 111A)', fmt(schedules.CG.equitySTCG), false, 4)
    line('Equity MF STCG (Sec 111A)', fmt(schedules.CG.mfEquitySTCG), false, 4)
    line('Equity LTCG (Sec 112A)', fmt(schedules.CG.equityLTCG), false, 4)
    line('Equity MF LTCG (Sec 112A)', fmt(schedules.CG.mfEquityLTCG), false, 4)
    if (schedules.CG.debtMFGains > 0) line('Debt MF gains (slab)', fmt(schedules.CG.debtMFGains), false, 4)
    line('LTCG exemption (Sec 112A)', `(${fmt(schedules.CG.ltcgExemption)})`, false, 4)
    line('Net STCG', fmt(schedules.CG.netSTCG), true)
    line('Taxable LTCG', fmt(schedules.CG.taxableLTCG), true)
  }

  // ── Prior year CFL used ──────────────────────────────────────────────────────
  if (parsed.priorITRCFL.length > 0) {
    section('Prior Year Losses — Carry Forward (from filed ITR)')
    for (const e of parsed.priorITRCFL) {
      line(
        `${e.lossType.toUpperCase()} from AY ${e.ayOfOrigin}`,
        `${fmt(e.amount)}  (${e.yearsRemaining}yr remaining)`,
        false, 4
      )
    }
  }

  // ── Tax Computation ──────────────────────────────────────────────────────────
  section(`Tax Computation — ${isNew ? 'New Regime' : 'Old Regime'}`)
  line('Slab-taxable income', fmt(tax.slabTaxableIncome))
  if (tax.section87AEligible) {
    line('Slab tax (before rebate)', fmt(tax.slabTax + tax.section87ARebate), false, 4)
    line('Section 87A rebate', `(${fmt(tax.section87ARebate)})`, false, 4)
    line('Slab tax after rebate', fmt(tax.slabTax), false, 4)
  } else {
    line('Slab tax', fmt(tax.slabTax), false, 4)
  }
  if (tax.stcgTax > 0) line('Tax on STCG @ 20%', fmt(tax.stcgTax))
  if (tax.ltcgTax > 0) line('Tax on LTCG @ 12.5%', fmt(tax.ltcgTax))
  if (tax.surcharge > 0) line('Surcharge', fmt(tax.surcharge))
  line('Health & Education cess @ 4%', fmt(tax.cess))
  line('Total tax payable', fmt(tax.totalTaxPayable), true)
  divider()
  line('TDS deducted', `(${fmt(tax.tdsDeducted)})`)
  if (tax.advanceTaxPaid > 0) line('Advance tax / Self-assessment paid', `(${fmt(tax.advanceTaxPaid)})`)
  line(tax.netPayable < 0 ? 'NET REFUND' : 'NET PAYABLE', fmtSigned(tax.netPayable), true)

  // Regime saving note
  if (regimeComparison && regimeComparison.saving > 0) {
    guard()
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8)
    doc.setTextColor(22, 163, 74)
    const winner = regimeComparison.recommended
    const saving = fmt(regimeComparison.saving)
    doc.text(
      `ℹ ${winner === selectedRegime ? `Filing under recommended regime — saves ${saving} vs the alternative.` : `Note: ${winner === 'new' ? 'New' : 'Old'} Regime would save ${saving}. See comparison PDF.`}`,
      marginL, getY()
    )
    setY(getY() + 6)
  }

  // ── Warnings ─────────────────────────────────────────────────────────────────
  if (warnings.length > 0) {
    section('Warnings & Notices')
    for (const w of warnings) {
      guard(8)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      const col = w.severity === 'error' ? [185, 28, 28] : w.severity === 'warn' ? [146, 64, 14] : [30, 64, 175]
      doc.setTextColor(col[0], col[1], col[2])
      const prefix = w.severity === 'error' ? '✕ ' : w.severity === 'warn' ? '⚠ ' : 'ℹ '
      const wrapped = doc.splitTextToSize(prefix + w.message, pageW - marginL * 2 - 4)
      doc.text(wrapped, marginL + 2, getY())
      setY(getY() + wrapped.length * 4.5 + 1)
    }
  }

  addFooter(doc, pageW, marginL)
  doc.save(`itr_summary_${selectedITRForm ?? 'ITR3'}_ay2026_27.pdf`)
}

// ─── Regime Comparison PDF ────────────────────────────────────────────────────

export async function generateRegimeComparisonPDF(state: AppState): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const { regimeComparison, selectedRegime } = state
  if (!regimeComparison) throw new Error('No regime comparison data to export')

  const { new: newR, old: oldR, recommended, saving } = regimeComparison
  const marginL = 18
  const pageW   = 210
  const colNew  = 130
  const colOld  = 175

  let y = 20
  const guard = () => { if (y > 275) { doc.addPage(); y = 20 } }
  const divider = () => {
    doc.setDrawColor(210, 210, 220)
    doc.line(marginL, y, pageW - marginL, y)
    y += 3
  }

  // ── Header ───────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(15, 17, 23)
  doc.text('Old Regime vs New Regime — Comparison', marginL, y); y += 8

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(100, 100, 120)
  const now = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  doc.text(`AY 2026-27  ·  Prepared: ${now}`, marginL, y); y += 6
  divider()

  // ── Column headers ────────────────────────────────────────────────────────────
  doc.setFillColor(237, 240, 247)
  doc.rect(marginL, y - 3, pageW - marginL * 2, 8, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(15, 17, 23)
  doc.text('Item', marginL + 2, y + 1)
  doc.text('New Regime', colNew, y + 1, { align: 'right' })
  doc.text('Old Regime', colOld, y + 1, { align: 'right' })
  y += 9

  // ── Comparison rows ───────────────────────────────────────────────────────────
  type Row = { label: string; newVal: number; oldVal: number; bold?: boolean; highlight?: boolean }

  const rows: Row[] = [
    { label: 'Gross income',           newVal: newR.totalIncome,         oldVal: oldR.totalIncome },
    { label: 'Deductions applied',     newVal: newR.totalIncome - newR.slabTaxableIncome - newR.stcgTax/0.2|0, oldVal: oldR.totalIncome - oldR.slabTaxableIncome - oldR.stcgTax/0.2|0 },
    { label: 'Taxable income',         newVal: newR.slabTaxableIncome,   oldVal: oldR.slabTaxableIncome },
    { label: 'Slab tax',               newVal: newR.slabTax,             oldVal: oldR.slabTax },
    { label: 'STCG tax',               newVal: newR.stcgTax,             oldVal: oldR.stcgTax },
    { label: 'LTCG tax',               newVal: newR.ltcgTax,             oldVal: oldR.ltcgTax },
    { label: 'Section 87A rebate',     newVal: -newR.section87ARebate,   oldVal: -oldR.section87ARebate },
    { label: 'Surcharge',              newVal: newR.surcharge,           oldVal: oldR.surcharge },
    { label: 'Cess (4%)',              newVal: newR.cess,                oldVal: oldR.cess },
    { label: 'Total tax payable',      newVal: newR.totalTaxPayable,     oldVal: oldR.totalTaxPayable, bold: true },
    { label: 'TDS / Credits',          newVal: -newR.tdsDeducted,        oldVal: -oldR.tdsDeducted },
    { label: 'Net payable / (refund)', newVal: newR.netPayable,          oldVal: oldR.netPayable, bold: true, highlight: true },
  ]

  const fmtCell = (v: number) => v === 0 ? '—' : (v < 0 ? '(' : '') + fmt(Math.abs(v)) + (v < 0 ? ')' : '')

  for (const row of rows) {
    guard()
    if (row.highlight) {
      doc.setFillColor(250, 250, 253)
      doc.rect(marginL, y - 3.5, pageW - marginL * 2, 7, 'F')
    }
    doc.setFont('helvetica', row.bold ? 'bold' : 'normal')
    doc.setFontSize(9)
    doc.setTextColor(row.bold ? 15 : 60, row.bold ? 17 : 60, row.bold ? 23 : 75)
    doc.text(row.label, marginL + 2, y)

    // New regime value — green if lower net payable
    const newBetter = row.highlight && newR.netPayable <= oldR.netPayable
    const oldBetter = row.highlight && oldR.netPayable < newR.netPayable
    doc.setTextColor(newBetter ? 22 : 50, newBetter ? 163 : 50, newBetter ? 74 : 70)
    doc.text(fmtCell(row.newVal), colNew, y, { align: 'right' })

    doc.setTextColor(oldBetter ? 22 : 50, oldBetter ? 163 : 50, oldBetter ? 74 : 70)
    doc.text(fmtCell(row.oldVal), colOld, y, { align: 'right' })

    y += 6
    if (row.bold) divider()
  }

  // ── Recommendation box ────────────────────────────────────────────────────────
  guard()
  y += 4
  const recColor: [number, number, number] = recommended === 'new' ? [240, 253, 244] : [255, 251, 235]
  const recBorder: [number, number, number] = recommended === 'new' ? [134, 239, 172] : [253, 211, 77]
  doc.setFillColor(...recColor)
  doc.setDrawColor(...recBorder)
  doc.roundedRect(marginL, y, pageW - marginL * 2, 20, 2, 2, 'FD')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(15, 17, 23)
  const recLabel = recommended === 'new' ? 'New Regime' : 'Old Regime'
  doc.text(`✓  Recommended: ${recLabel}`, marginL + 4, y + 7)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(60, 60, 80)
  const savingText = saving > 0
    ? `${recLabel} saves ₹${Math.abs(saving).toLocaleString('en-IN')} compared to the alternative.`
    : 'Both regimes result in the same tax. New Regime is simpler.'
  doc.text(savingText, marginL + 4, y + 14)
  y += 24

  if (selectedRegime !== recommended) {
    guard()
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(8)
    doc.setTextColor(185, 28, 28)
    doc.text(
      `⚠  Currently filing under ${selectedRegime === 'new' ? 'New' : 'Old'} Regime — switch to ${recLabel} to save ${fmt(saving)}.`,
      marginL, y
    )
    y += 6
  }

  addFooter(doc, pageW, marginL)
  doc.save('regime_comparison_ay2026_27.pdf')
}
