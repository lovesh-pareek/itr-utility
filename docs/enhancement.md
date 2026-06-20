# ITR Filing Utility — Enhancement Requirements
**Product:** ITR Filing Data Preparation Utility
**Version:** 2.0 — Full Income Model
**Date:** June 2026
**Extends:** requirements.md v1.2 (v1.0 scope complete)
**Status:** Enhancement specification — not yet implemented

---

## Revision History

| Version | Date | Changes |
|---|---|---|
| 2.0 | June 2026 | Full income model expansion — all 5 heads, deductions, tax credits, bank accounts, AIS, multi-form |

---

## 1. Why v2.0

Version 1.0 serves a narrow but common profile: salaried employee with equity trading and MF investments, New Tax Regime only, ITR-3. It correctly computes intraday speculative income, capital gains (STCG/LTCG), and produces a valid ITR-3 XML.

**What v1.0 cannot do:**

- Handle a second employer (job-changers mid-year)
- Handle house property income or rental income
- Handle property sales with indexation
- Compute deductions under Old Tax Regime (80C, 80D, 80G etc.)
- Compare Old vs New Regime and recommend the better one
- Import 26AS or AIS for cross-validation
- Pre-populate carry-forward losses from a prior year ITR XML
- Auto-detect the correct ITR form (ITR-1, ITR-2, or ITR-3)
- Record bank accounts required for ITR filing
- Handle presumptive business income (freelancers, consultants)
- Handle other income sources: FD interest, RD interest, family pension, gifts, lottery

**v2.0 removes all of these limitations** while keeping the same core design principles: zero server trust, all processing local, progressive disclosure, editable values, AI transparency.

---

## 2. Core Design Principles (unchanged from v1.0)

1. **Zero server trust** — all processing remains client-side. No new server calls.
2. **Progressive disclosure** — new sections only appear when relevant data exists.
3. **Verify over trust** — every computed value is editable.
4. **AI transparency** — no new AI call types. Same 2 fallback types, same logging.
5. **Filing-first output** — output maps to the correct ITR form's portal sections.
6. **Config over code** — tax rules (rates, limits, thresholds) live in JSON. Budget changes = JSON edit only.

---

## 3. Income Heads — Full Model

### 3.1 Salary Income (expanded from v1.0)

**v1.0:** Single employer only.
**v2.0 additions:**
- Multiple employer entries (common for mid-year job changes)
- Each employer entry: employer name, TAN, gross salary, standard deduction (₹75,000 per employer under New Regime), professional tax, net taxable salary, TDS deducted
- Multiple Form 16 PDFs can be uploaded — one per employer
- Aggregated schedule S totals across all employers

### 3.2 House Property Income (new in v2.0)

- Property types: self-occupied, let-out, deemed let-out
- Self-occupied: no rental income; interest on home loan deductible up to ₹2L (Sec 24b)
- Let-out: rental income − municipal taxes = Net Annual Value; 30% standard deduction on NAV; full home loan interest deductible
- Multiple properties supported
- House property loss:
  - Old Regime: HP loss can set off against salary income (up to ₹2L)
  - New Regime: HP loss ring-fenced — cannot set off against any other head
- CII (Cost Inflation Index) table bundled for indexation calculations

### 3.3 Capital Gains (expanded from v1.0)

**v1.0:** Equity delivery (STCG/LTCG) and equity MF (STCG/LTCG) via broker/MF parsers.
**v2.0 additions:**
- Property sales: purchase price, sale price, indexed cost (CII-adjusted), improvement cost, transfer expenses
- Property STCG (held ≤ 2 years) and property LTCG (held > 2 years) with indexation
- Section 54 / 54EC / 54F exemption flags — user can mark if claimed
- Debt MF gains already at slab rate in v1.0 — unchanged

### 3.4 Business & Profession (expanded from v1.0)

**v1.0:** Intraday speculative P&L only (auto-detected from broker file). F&O flagged but not computed.
**v2.0 additions:**
- Presumptive taxation under Sec 44AD (business): gross receipts × 8% (non-digital) or 6% (digital)
- Presumptive taxation under Sec 44ADA (profession): gross receipts × 50%
- F&O income: user enters taxable income manually (CA referral warning shown); turnover field for audit threshold check
- Non-speculative business income: revenue − expenses — manual entry
- Each type has its own loss set-off rules (speculative loss ring-fenced; non-speculative can offset other non-salary heads)

### 3.5 Other Sources (expanded from v1.0)

**v1.0:** Dividends (from broker) + manual interest income (single field).
**v2.0 additions:**
- Savings account interest (eligible for 80TTA up to ₹10,000 — Old Regime only)
- FD interest (slab rate — manual entry)
- RD interest (slab rate — manual entry)
- Senior citizen interest income (eligible for 80TTB up to ₹50,000 — Old Regime only)
- Dividend income (pre-filled from broker; also from AIS if uploaded)
- Dividend from foreign company (slab rate)
- Family pension (standard deduction = lower of 1/3 of pension or ₹15,000)
- Winnings from lottery / crossword / card games (flat 30% — no deduction allowed)
- Casual income (flat 30%)
- Gifts received (taxable above ₹50,000 aggregate if not from relatives)

---

## 4. Deductions

### 4.1 Old Regime — Chapter VI-A Deductions

Only applicable when Old Regime is selected. Under New Regime, only 80CCD2 (employer NPS) applies.

| Section | Description | Cap |
|---|---|---|
| 80C | LIC, PPF, ELSS, ULIP, home loan principal, tuition fees | ₹1,50,000 (combined 80C+80CCC+80CCD1) |
| 80CCC | Pension fund contribution | Within 80C cap |
| 80CCD(1) | NPS employee contribution | Within 80C cap |
| 80CCD(1B) | NPS additional self contribution | ₹50,000 (over and above 80C cap) |
| 80CCD(2) | Employer NPS contribution | Up to 10% of salary (no upper cap) |
| 80D | Health insurance premium | ₹25,000 self+family; ₹25,000 parents; ₹50,000 if senior |
| 80E | Education loan interest | No cap |
| 80EEA | First home loan interest (affordable housing) | ₹1,50,000 |
| 80G | Donations to approved institutions | 50% or 100% with/without limit; cash limit ₹2,000 |
| 80GG | HRA for those without HRA in salary | ₹5,000/month cap |
| 80TTA | Savings account interest | ₹10,000 |
| 80TTB | Senior citizen interest income | ₹50,000 (replaces 80TTA for seniors) |

### 4.2 New Regime Deductions

Only the following apply under New Regime:
- 80CCD(2): Employer NPS contribution (up to 14% of salary for central govt employees, 10% for others)
- 80CCH: Agnipath scheme contributions
- Standard deduction on salary: ₹75,000 (already in v1.0)

### 4.3 Standard Deduction on HP

- Let-out property: 30% of Net Annual Value (automatic, no cap)
- Already computed within the HP income calculation

---

## 5. Tax Credits

### 5.1 TDS Credits

Sources of TDS (beyond employer TDS already in v1.0):
- Form 16A: TDS on interest income (Sec 194A), rent (Sec 194I), professional fees (Sec 194J)
- Form 26Q: TDS on non-salary payments
- 26AS imports all TDS entries — if uploaded, auto-populate

### 5.2 Advance Tax Paid

- User enters BSR code, challan date, challan serial number, and amount for each instalment
- Auto-validated against advance tax due dates (15 Jun, 15 Sep, 15 Dec, 15 Mar)
- Reduce net payable / increase refund

### 5.3 Self-Assessment Tax

- Challan 280 payment made to cover any balance tax
- BSR code, challan date, serial number, amount

### 5.4 TCS Credits

- Tax collected at source on purchases (cars, foreign remittances etc.)
- User enters manually or imports from 26AS

---

## 6. Bank Accounts

Required in all ITR forms for refund credit and portal compliance.

### 6.1 Account Details

- IFSC code (format: 4 letters + 0 + 6 digits, e.g. SBIN0001234)
- Account number (masked — last 4 digits shown in UI)
- Bank name (auto-filled from IFSC prefix table bundled in app)
- Account type: savings / current / overdraft
- Refund account flag: exactly one account must be designated

### 6.2 Validation

- At least one account required before XML download is enabled
- Exactly one refund account required
- IFSC format validated client-side
- Account number must be numeric and between 9–18 digits

### 6.3 Multiple Accounts

- Portal requires all accounts held during the year
- User can add multiple accounts
- One is marked as refund account

---

## 7. Additional Details

### 7.1 AIS / TIS Import (Annual Information Statement)

- Downloaded from IT portal → AIS tab → Download JSON
- Contains: salary, dividends, interest, securities transactions, MF transactions, TDS credits
- Purpose: cross-validate every major field against government-held data
- Mismatches surfaced with severity: info (≤5% delta), warn (5–20%), error (>20%)
- User can choose to adopt AIS value or keep parsed value for each field

### 7.2 Form 26AS Import

- Downloaded from TRACES → View 26AS → Download
- Formats: PDF or Excel
- Extracts: Part A (TDS deducted by deductors), Part C (advance tax paid)
- Supplements or replaces manually entered TDS/advance tax entries
- Cross-validates against Form 16 TDS figure

### 7.3 Prior Year ITR XML Upload

- User uploads their AY 2025-26 (or earlier) filed ITR XML
- System extracts Schedule CFL entries:
  - Unabsorbed speculative (intraday) losses — carry forward up to 4 years
  - Unabsorbed short-term capital losses — carry forward up to 8 years
  - Unabsorbed long-term capital losses — carry forward up to 8 years
  - House property losses — carry forward up to 8 years
  - Business losses — carry forward up to 8 years
- Remaining years of eligibility reduced by 1 for each extracted entry
- Entries with expired eligibility are filtered and flagged
- Pre-populates Schedule CFL in current year's review screen

### 7.4 Regime Comparison

- Run full tax computation for both Old and New Regime independently
- Side-by-side display: income head totals / deductions / taxable income / slab tax / CG tax / surcharge / cess / total tax / credits / net payable
- Recommendation: regime with lower net payable highlighted
- One-click regime switch: updates AppState.selectedRegime, engine recomputes
- Recommendation persisted in session

---

## 8. ITR Form Auto-Detection

After parsing, detect the appropriate ITR form based on income profile:

| Profile | Correct form |
|---|---|
| Salary + OS only, total income ≤ ₹50L, no CG, no HP, no business | ITR-1 Sahaj |
| Salary + CG and/or multiple HP and/or foreign income, no business | ITR-2 |
| Any speculative/intraday income, F&O, non-speculative business | ITR-3 |
| Presumptive business income (44AD/44ADA) only | ITR-4 Sugam |

- Auto-detected form shown as a prominent banner after parsing
- If user has manually selected a different form: warning with explanation
- One-click to confirm auto-detected form
- XML generator routes to correct XSD schema based on confirmed form
- ITR-1 review flow is simplified (no BP tab, only 1 HP)

---

## 9. Tax Rules Configuration

All tax constants move to `public/config/tax-rules.json`. Zero hardcoded values in engine code.

**What lives in config:**
- New Regime slab rates (by AY)
- Old Regime slab rates (by AY; plus senior citizen and super senior variants)
- Standard deduction on salary (by AY)
- Section 87A limit and rebate cap (by AY and regime)
- STCG rate (Sec 111A), LTCG rate (Sec 112A), LTCG exemption limit (by AY)
- Surcharge bands and rates (by AY and regime)
- Surcharge cap for STCG/LTCG under New Regime
- Health & Education cess rate
- Chapter VI-A deduction caps (80C, 80D, 80TTA, 80TTB etc.) — by AY
- Carry-forward year limits by loss type
- Filing deadlines (original, revised, belated) — by AY
- ITR form eligibility descriptions

**When Budget 2027 changes rates:**
1. Add a new `"2027-28"` block to `tax-rules.json`
2. Run CLI validator: `npm run validate-rules`
3. Deploy — zero code change required

---

## 10. Document Registry Configuration

`public/config/document-registry.json` drives the upload screen. Adding a new document type requires only a registry edit — no screen code change.

Supported documents in v2.0:
1. Broker Tax P&L (required) — `.xlsx`
2. Form 16 (required) — `.pdf`
3. MF Capital Gains Statement (optional) — `.json`, `.pdf`
4. Form 26AS (optional) — `.pdf`, `.xlsx`
5. AIS / TIS (optional) — `.json`, `.pdf`
6. Previous Year ITR XML (optional) — `.xml`

---

## 11. Multi-Form XML Output

| Form | When | Key schedules |
|---|---|---|
| ITR-1 XML | Salary + OS only, ≤50L, no CG, no BP | Schedule S, Schedule OS, ScheduleTaxPaid |
| ITR-2 XML | CG / multiple HP / foreign, no business | All ITR-1 + Schedule CG, Schedule HP, Schedule FA |
| ITR-3 XML | Any business income (intraday/F&O/professional) | All ITR-2 + Schedule BP, Schedule AL (if >50L) |

Each XML validated against its AY-specific XSD before download.

---

## 12. What Remains Out of Scope (v2.0)

- Direct submission to IT portal (upload only)
- OCR / scanned document support
- Foreign assets (Schedule FA) — UI flag only, values entered manually
- Surcharge above 25% (incomes above ₹5 crore)
- Agricultural income
- Virtual digital assets (VDA / crypto)
- Section 89 relief (arrear salary)
- Mobile app
- Server-side processing of any kind

---

## 13. User Profiles Served by v2.0

| Profile | v1.0 | v2.0 |
|---|---|---|
| Salaried, New Regime, intraday trader, MF investor | ✓ | ✓ |
| Job-changer with two Form 16s | ✗ | ✓ |
| Salaried with let-out property | ✗ | ✓ |
| Salaried with property sale | ✗ | ✓ |
| Old Regime filer with 80C/80D deductions | ✗ | ✓ |
| Freelancer / consultant (44ADA) | ✗ | ✓ |
| Small business owner (44AD) | ✗ | ✓ |
| Prior year capital losses to carry forward | ✗ | ✓ |
| Wants Old vs New Regime comparison | ✗ | ✓ |
| Has FD/RD interest income | partial | ✓ |
| CA assisting a client | partial | ✓ |

---

*End of Enhancement Requirements v2.0*
