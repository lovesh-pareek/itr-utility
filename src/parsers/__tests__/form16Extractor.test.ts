/**
 * Form 16 Extractor Tests — verifies TRACES format parsing
 * Uses text that mirrors the actual TRACES PDF structure seen in production Form 16s.
 */

import { describe, it, expect } from 'vitest'
import { extractForm16Fields, buildForm16Data } from '../form16Extractor'

// Synthetic text mirroring actual TRACES Form 16 PDF (Part A + Part B Annexure I)
// Values match the real Form 16 TSTCERT1 uploaded during testing
const TRACES_FORM16_TEXT = `
FORM NO. 16
Certificate under Section 203 of the Income-tax Act, 1961

Name and address of the Employer/Specified Bank
SAMPLE EMPLOYER PRIVATE LIMITED
5th Floor, Sample Building, MG Road,

Name and address of the Employee/Specified senior citizen
SAMPLE TAXPAYER
1/A TEST COLONY, SAMPLE ROAD

PAN of the Deductor
ZZZZZ1234Z
TAN of the Deductor
MUMX99999X
PAN of the Employee/Specified senior citizen
AAAAA9999A
Assessment Year
2026-27

Quarter(s) Receipt Numbers Amount paid/credited (Rs.) Amount of tax deducted (Rs.) Amount of tax deposited / remitted
Q1 RCPT0001A 906603.00 146331.00 146331.00
Q2 RCPT0002B 1043298.00 236248.00 236248.00
Q3 RCPT0003C 819263.00 208296.00 208296.00
Q4 RCPT0004D 1347908.00 236319.00 236319.00
Total (Rs.) 4117072.00 827194.00 827194.00

PART B
Annexure - I
Details of Salary Paid and any other income and tax deducted

Whether opting out of taxation u/s 115BAC(1A)? No

1. Gross Salary
(a) Salary as per provisions contained in section 17(1) 4117072.00
(b) Value of perquisites under section 17(2) 0.00
(c) Profits in lieu of salary under section 17(3) 0.00
(d) Total 4117072.00

2. Less: Allowances to the extent exempt under section 10
(e) House rent allowance under section 10(13A) 0.00

3. Total amount of salary received from current employer 4117072.00

4. Less: Deductions under section 16
(a) Standard deduction under section 16(ia) 75000.00
(b) Entertainment allowance under section 16(ii) 0.00
(c) Tax on employment under section 16(iii) 0.00

5. Total amount of deductions under section 16 75000.00

6. Income chargeable under the head "Salaries" 4042072.00

7. Add: Any other income reported by the employee under as per section 192 (2B)
(b) Income under the head Other Sources offered for TDS 9192.00

9. Gross total income (6+8) 4051264.00

12. Total taxable income (9-11) 4051264.00
13. Tax on total income 795378.00
16. Health and education cess 31815.00
17. Tax payable (13+15+16-14) 827193.00
21. Net tax payable (17-18-19-20) 827193.00
`

describe('Form 16 Extractor — TRACES format', () => {
  it('extracts PAN of employee (not employer PAN)', () => {
    const result = extractForm16Fields(TRACES_FORM16_TEXT)
    const data = buildForm16Data(result, TRACES_FORM16_TEXT)
    expect(data.pan).toBe('AAAAA9999A')  // employee PAN, not ZZZZZ1234Z (employer)
  })

  it('extracts TAN of employer', () => {
    const result = extractForm16Fields(TRACES_FORM16_TEXT)
    const data = buildForm16Data(result, TRACES_FORM16_TEXT)
    expect(data.tanEmployer).toBe('MUMX99999X')
  })

  it('extracts assessment year', () => {
    const result = extractForm16Fields(TRACES_FORM16_TEXT)
    const data = buildForm16Data(result, TRACES_FORM16_TEXT)
    expect(data.assessmentYear).toBe('2026-27')
  })

  it('extracts gross salary of ₹41,17,072 from section 17(1)', () => {
    const result = extractForm16Fields(TRACES_FORM16_TEXT)
    const data = buildForm16Data(result, TRACES_FORM16_TEXT)
    expect(data.grossSalary).toBe(4_117_072)
  })

  it('extracts standard deduction of ₹75,000 (positive, not negative)', () => {
    const result = extractForm16Fields(TRACES_FORM16_TEXT)
    const data = buildForm16Data(result, TRACES_FORM16_TEXT)
    expect(data.standardDeduction).toBe(75_000)
    expect(data.standardDeduction).toBeGreaterThan(0)  // must NOT be negative
  })

  it('extracts TDS deducted of ₹8,27,194 from Part A total', () => {
    const result = extractForm16Fields(TRACES_FORM16_TEXT)
    const data = buildForm16Data(result, TRACES_FORM16_TEXT)
    expect(data.tdsDeducted).toBe(827_194)
  })

  it('extracts net taxable salary of ₹40,42,072', () => {
    const result = extractForm16Fields(TRACES_FORM16_TEXT)
    const data = buildForm16Data(result, TRACES_FORM16_TEXT)
    expect(data.netTaxableSalary).toBe(4_042_072)
  })

  it('computes net taxable salary correctly when not directly extracted', () => {
    // If netTaxableSalary is not found, it should be computed as gross - std - profTax
    const minimalText = `
      Assessment Year 2026-27
      PAN of the Employee ABCDE1234F
      TAN of the Deductor MUMA12345B
      Salary as per provisions contained in section 17(1) 1200000.00
      Standard deduction under section 16(ia) 75000.00
      Total (Rs.) 1200000.00 149114.00 149114.00
    `
    const result = extractForm16Fields(minimalText)
    const data = buildForm16Data(result, minimalText)
    expect(data.grossSalary).toBe(1_200_000)
    expect(data.standardDeduction).toBe(75_000)
    expect(data.netTaxableSalary).toBe(1_125_000)  // 12L - 75k - 0 prof tax
    expect(data.tdsDeducted).toBe(149_114)
  })

  it('defaults standardDeduction to 75000 when not found in PDF', () => {
    const minText = `Assessment Year 2026-27\nPAN of the Employee ABCDE1234F`
    const result = extractForm16Fields(minText)
    const data = buildForm16Data(result, minText)
    expect(data.standardDeduction).toBe(75_000)
  })

  it('returns positive values only (no negative standard deduction bug)', () => {
    const result = extractForm16Fields(TRACES_FORM16_TEXT)
    const data = buildForm16Data(result, TRACES_FORM16_TEXT)
    expect(data.grossSalary).toBeGreaterThanOrEqual(0)
    expect(data.standardDeduction).toBeGreaterThanOrEqual(0)
    expect(data.professionalTax).toBeGreaterThanOrEqual(0)
    expect(data.netTaxableSalary).toBeGreaterThanOrEqual(0)
    expect(data.tdsDeducted).toBeGreaterThanOrEqual(0)
  })
})
