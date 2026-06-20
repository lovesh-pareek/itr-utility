import type { AppState } from '../types'

function fmt(n: number): string {
  return '₹' + Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function fmtSigned(n: number): string {
  return (n < 0 ? '−' : '') + fmt(n)
}

export async function generateTaxSummaryPDF(state: AppState): Promise<void> {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const { tax, schedules, parsed, warnings } = state
  if (!tax || !schedules) throw new Error('No tax data to export')

  const form16 = parsed.form16
  const pageW = 210
  const margin = 18
  const col2 = 140
  let y = 20

  // ── Helpers ───────────────────────────────────────────────────────────────
  const line = (label: string, value: string, bold = false, indent = 0) => {
    if (y > 270) { doc.addPage(); y = 20 }
    doc.setFont('helvetica', bold ? 'bold' : 'normal')
    doc.setFontSize(9)
    doc.text(label, margin + indent, y)
    doc.text(value, col2, y, { align: 'right' })
    y += 5.5
  }

  const section = (title: string) => {
    if (y > 265) { doc.addPage(); y = 20 }
    y += 4
    doc.setFillColor(240, 240, 244)
    doc.rect(margin, y - 4, pageW - margin * 2, 7, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(15, 17, 23)
    doc.text(title, margin + 2, y)
    y += 6
    doc.setTextColor(50, 50, 70)
  }

  const divider = () => {
    doc.setDrawColor(200, 200, 210)
    doc.line(margin, y, pageW - margin, y)
    y += 3
  }

  // ── Header ────────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(15, 17, 23)
  doc.text('ITR-3 Tax Summary', margin, y)
  y += 7

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(100, 100, 120)
  doc.text('FY 2025-26 · AY 2026-27 · New Tax Regime', margin, y)
  const now = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  doc.text(`Prepared: ${now}`, pageW - margin, y, { align: 'right' })
  y += 5

  if (form16) {
    doc.text(`PAN: ${form16.pan || '—'} · Employer: ${form16.employerName || '—'} · TAN: ${form16.tanEmployer || '—'}`, margin, y)
    y += 5
  }
  divider()

  // ── Schedule S ────────────────────────────────────────────────────────────
  section('Schedule S — Salary Income')
  line('Gross salary', fmt(schedules.S.grossSalary))
  line('Standard deduction u/s 16(ia)', `(${fmt(schedules.S.standardDeduction)})`, false, 4)
  line('Professional tax u/s 16(iii)', `(${fmt(schedules.S.professionalTax)})`, false, 4)
  line('Net taxable salary', fmt(schedules.S.netTaxableSalary), true)

  // ── Schedule BP ───────────────────────────────────────────────────────────
  section('Schedule BP — Intraday (Speculative)')
  line('Speculative turnover', fmt(schedules.BP.speculativeTurnover))
  line('Net P&L', fmtSigned(schedules.BP.netSpeculativePnL))
  if (schedules.BP.carryForward > 0)
    line('Carry forward to AY 2027-28', fmt(schedules.BP.carryForward))

  // ── Schedule CG ───────────────────────────────────────────────────────────
  section('Schedule CG — Capital Gains')
  line('STCG — equity delivery (Sec 111A)', fmt(schedules.CG.equitySTCG))
  line('STCG — equity MF (Sec 111A)', fmt(schedules.CG.mfEquitySTCG))
  line('LTCG — equity delivery (Sec 112A)', fmt(schedules.CG.equityLTCG))
  line('LTCG — equity MF (Sec 112A)', fmt(schedules.CG.mfEquityLTCG))
  line('Debt MF gains (slab rate)', fmt(schedules.CG.debtMFGains))
  line('LTCG exemption (Sec 112A)', `(${fmt(schedules.CG.ltcgExemption)})`, false, 4)
  line('Net STCG', fmt(schedules.CG.netSTCG), true)
  line('Taxable LTCG', fmt(schedules.CG.taxableLTCG), true)

  // ── Schedule OS ───────────────────────────────────────────────────────────
  section('Schedule OS — Other Sources')
  line('Dividend income', fmt(schedules.OS.dividendIncome))
  line('Interest income', fmt(schedules.OS.interestIncome))
  line('Total', fmt(schedules.OS.total), true)

  // ── Schedule CFL ─────────────────────────────────────────────────────────
  if (schedules.CFL.intradayLossCarryForward > 0 || schedules.CFL.stclCarryForward > 0 || schedules.CFL.ltclCarryForward > 0) {
    section('Schedule CFL — Carry Forward Losses (to AY 2027-28)')
    if (schedules.CFL.intradayLossCarryForward > 0)
      line('Intraday loss (speculative)', fmt(schedules.CFL.intradayLossCarryForward))
    if (schedules.CFL.stclCarryForward > 0)
      line('Short-term capital loss', fmt(schedules.CFL.stclCarryForward))
    if (schedules.CFL.ltclCarryForward > 0)
      line('Long-term capital loss', fmt(schedules.CFL.ltclCarryForward))
  }

  // ── Tax Computation ───────────────────────────────────────────────────────
  section('Tax Computation — New Regime')
  line('Slab-taxable income', fmt(tax.slabTaxableIncome))
  line('Slab tax', fmt(tax.slabTax + tax.section87ARebate), false, 4)
  if (tax.section87AEligible)
    line('Section 87A rebate', `(${fmt(tax.section87ARebate)})`, false, 4)
  line('Slab tax after rebate', fmt(tax.slabTax), false, 4)
  if (tax.stcgTax > 0) line('Tax on STCG @ 20%', fmt(tax.stcgTax))
  if (tax.ltcgTax > 0) line('Tax on LTCG @ 12.5%', fmt(tax.ltcgTax))
  if (tax.surcharge > 0) line('Surcharge', fmt(tax.surcharge))
  line('Health & Education cess @ 4%', fmt(tax.cess))
  line('Total tax payable', fmt(tax.totalTaxPayable), true)
  divider()
  line('TDS deducted by employer', `(${fmt(tax.tdsDeducted)})`)
  if (tax.advanceTaxPaid > 0) line('Advance tax paid', `(${fmt(tax.advanceTaxPaid)})`)
  line(tax.netPayable < 0 ? 'NET REFUND' : 'NET PAYABLE', fmtSigned(tax.netPayable), true)

  // ── Warnings ──────────────────────────────────────────────────────────────
  if (warnings.length > 0) {
    section('Warnings & Notices')
    for (const w of warnings) {
      if (y > 270) { doc.addPage(); y = 20 }
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(w.severity === 'warn' ? 120 : w.severity === 'error' ? 180 : 60, 80, 20)
      const prefix = w.severity === 'warn' ? '⚠ ' : w.severity === 'error' ? '✕ ' : 'ℹ '
      const lines = doc.splitTextToSize(prefix + w.message, pageW - margin * 2 - 4)
      doc.text(lines, margin + 2, y)
      y += lines.length * 4.5 + 1
    }
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  const totalPages = (doc as any).internal.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.setTextColor(160, 160, 175)
    doc.text(
      'Prepared by ITR Filing Utility v1.0 — Verify all values against AIS before filing. This is a preparation aid only.',
      margin, 292
    )
    doc.text(`Page ${i} of ${totalPages}`, pageW - margin, 292, { align: 'right' })
  }

  doc.save('itr3_summary_ay2026_27.pdf')
}
