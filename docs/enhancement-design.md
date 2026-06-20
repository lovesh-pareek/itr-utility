# ITR Filing Utility — Enhancement Design Document
**Product:** ITR-3 Tax Filing Data Preparation Utility
**Version:** 2.0 — Full Income Model
**Date:** June 2026
**Extends:** design.md v1.0
**Depends on:** enhancement.md v2.0

---

## Revision History

| Version | Date | Changes |
|---|---|---|
| 2.0 | June 2026 | Enhancement design — new screens, expanded components, updated state model, data flow for all 5 income heads, deductions, regime comparison, AIS/26AS, prior ITR, bank accounts, multi-form XML |
| 2.1 | June 2026 | Three high-impact fixes: Schedule AL screen + XML nodes (income > ₹50L), ITR-4 XML generator + integration profile, Old Regime senior/super-senior slab variants + age-aware engine |

---

## 1. Design Principles (unchanged + additions)

All 5 principles from design.md v1.0 carry forward unchanged:

1. **Zero server trust** — all processing remains client-side.
2. **Progressive disclosure** — new sections appear only when relevant data exists.
3. **Verify over trust** — every computed value is editable.
4. **AI transparency** — same 2 fallback types, same logging, same banner behaviour.
5. **Filing-first output** — output maps to the correct ITR form's portal sections.

Two new principles added for v2.0:

6. **Config over code** — all tax rates, thresholds, and deadlines live in `tax-rules.json`. No Budget change requires a code edit.
7. **Profile-adaptive UI** — the review flow shows only the income heads the user actually has. A salary-only user never sees the BP tab. An ITR-1 user gets a simplified 2-tab review.

---

## 2. Screen Inventory — v2.0

Screens carried forward from v1.0 (S01–S08) are unchanged in route and purpose. New and modified screens listed below.

| Screen ID | Name | Route | Status | Description |
|---|---|---|---|---|
| S01 | Landing / Resume | `/` | Unchanged | Entry point — resume or fresh start |
| S02 | Upload Hub v2 | `/upload` | Modified | Now handles up to 6 document types, registry-driven |
| S03 | Parsing Progress | `/parsing` | Minor update | Shows status for all uploaded documents |
| S04 | Income Hub v2 | `/review` | Major rebuild | 5-tab income review replacing 6-schedule tabs |
| S05 | Deductions | `/review/deductions` | New | Chapter VI-A deductions — Old Regime or 80CCD2 only |
| S06 | Regime Comparison | `/review/regime` | New | Side-by-side Old vs New computation, regime switch |
| S07 | AIS Validation | `/review/ais` | New | Cross-validate parsed values against AIS — shown only if AIS uploaded |
| S08 | Tax Summary v2 | `/summary` | Modified | Adds 5 income head cards, regime badge, prior CFL used |
| S09 | Export v2 | `/export` | Modified | Three downloads: XML (correct form), PDF summary, regime comparison PDF |
| S10 | AI Call Log | `/settings/ai-log` | Unchanged | View, rate, export AI call history |
| S11 | Settings | `/settings` | Minor update | Adds AY selector, tax rules display panel |
| S12 | Bank Accounts | `/review/bank-accounts` | New | Add/edit/validate bank accounts for refund and ITR compliance |
| S13 | Schedule AL | `/review/schedule-al` | New | Assets & liabilities entry — shown only when total income > ₹50L; required for ITR-2 and ITR-3 |

---

## 3. Screen Designs

---

### S02 — Upload Hub v2

**Purpose:** Accept up to 6 document types. Required documents block progress; optional documents improve accuracy. All document slots driven by `document-registry.json` — no hardcoded layout.

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│  Step 1 of 3 — Upload your documents               │
│                                                     │
│  ── Required ──────────────────────────────────── │
│                                                     │
│  ┌─ 1. Broker Tax P&L ──────────────────────────┐  │
│  │  Zerodha · Groww · Upstox (.xlsx)            │  │
│  │  ✓ zerodha_tax_pl_2025_26.xlsx               │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌─ 2. Form 16 ──────────────────────────────────┐  │
│  │  From employer (.pdf) — one per employer      │  │
│  │  ✓ form16_acme.pdf   [ + Add another Form 16 ]│  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  ── Optional — improves accuracy ─────────────── │
│                                                     │
│  ┌─ 3. MF Capital Gains Statement ───────────────┐  │
│  │  CAMS / KFintech (.json preferred / .pdf)     │  │
│  │  [ Drop file here or click to browse ]        │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  ┌─ 4. Form 26AS ─────────────────────────────── │  │
│  │  TRACES → View 26AS → Download (.pdf / .xlsx) │  │
│  │  Adds TDS credits and advance tax details      │  │
│  │  [ Drop file here or click to browse ]        │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  ┌─ 5. AIS / TIS ─────────────────────────────── │  │
│  │  IT portal → AIS → Download JSON              │  │
│  │  Enables cross-validation of all values       │  │
│  │  [ Drop file here or click to browse ]        │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  ┌─ 6. Previous Year ITR XML ─────────────────── │  │
│  │  Your AY 2025-26 ITR XML — for carry-forward  │  │
│  │  [ Drop file here or click to browse ]        │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  [ Parse documents → ]  (enabled when required ✓) │
└─────────────────────────────────────────────────────┘
```

**Behaviour:**
- Layout is driven by `document-registry.json` — each document slot is a `DocumentCard` component reading registry metadata
- Required slots: red dot when empty, green checkmark when valid
- Optional slots: greyed "Add for better accuracy" hint when empty; show parsed metadata badge after upload (e.g. "26AS: 12 TDS entries found", "AIS: salary ₹12,00,000 detected", "Prior ITR: 2 CFL entries found")
- Form 16 slot: "+ Add another Form 16" link — creates a second drop zone for job-changers (up to 5 employers)
- "Parse documents" enabled when all required documents are valid

---

### S04 — Income Hub v2

**Purpose:** Replace the 6-schedule tab navigation from v1.0 with a 5-income-head tab structure that mirrors ITR form language. Tabs shown adaptively — only tabs with relevant data are active; empty heads are greyed.

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│  Step 2 of 3 — Review your income                  │
│  ⚠ Cross-check all values against your AIS         │
│                                                     │
│  [ Salary ] [ House Property ] [ Capital Gains ]   │
│  [ Business ] [ Other Sources ]                    │
│  ─────────────────────────────────────────────────  │
│                                                     │
│  ── Salary ─────────────────────────────────────── │
│                                                     │
│  ┌─ Acme Corp · TAN: MUMA12345B ─────────────────┐ │
│  │  Source: Form 16 (form16_acme.pdf)            │ │
│  │                                               │ │
│  │  Gross salary          ₹ [ 12,00,000 ] ✎      │ │
│  │  Standard deduction    ₹     75,000   (fixed) │ │
│  │  Professional tax      ₹ [      2,400 ] ✎     │ │
│  │  ─────────────────────────────────            │ │
│  │  Net taxable salary    ₹   11,22,600           │ │
│  │  TDS deducted          ₹    1,49,114           │ │
│  └───────────────────────────────────────────────┘ │
│                                                     │
│  [ + Add employer ]  (for second Form 16)           │
│                                                     │
│  ─────────────────────────────────── Total ─────── │
│  Total net taxable salary          ₹   11,22,600   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**House Property tab layout:**
```
│  ── House Property ─────────────────────────────── │
│                                                     │
│  [ + Add property ]                                 │
│                                                     │
│  ┌─ Property 1 — Self-occupied ──────────────────┐ │
│  │  123 MG Road, Bengaluru                       │ │
│  │  Annual rent              ₹          0        │ │
│  │  Net Annual Value         ₹          0        │ │
│  │  Interest on loan     ₹ [ 1,20,000 ] ✎        │ │
│  │  (capped at ₹2L under New Regime)             │ │
│  │  ─────────────────────────────────            │ │
│  │  Income from HP           ₹      -1,20,000    │ │
│  │                                               │ │
│  │  ⓘ Under New Regime, HP loss is ring-fenced.  │ │
│  │  Cannot set off against salary or CG.         │ │
│  └───────────────────────────────────────────────┘ │
│                                                     │
│  Total income from HP             ₹    -1,20,000   │
│  Net set-off this year            ₹            0   │
│  Loss to carry forward            ₹    -1,20,000   │
```

**Capital Gains tab layout:**
```
│  ── Capital Gains ──────────────────────────────── │
│                                                     │
│  [ Equity Delivery ] [ Equity MF ] [ Property ]    │
│  [ Other ]                                         │
│                                                     │
│  ── Equity Delivery (Source: Zerodha) ──────────── │
│  STCG (Sec 111A @ 20%)      ₹ [   45,000 ] ✎      │
│  LTCG above ₹1.25L (@ 12.5%) ₹ [   28,000 ] ✎    │
│  STCL to set off            ₹          0           │
│                                                     │
│  ── Equity MF (Source: CAMS JSON) ──────────────── │
│  STCG                       ₹ [   12,000 ] ✎      │
│  LTCG above ₹1.25L          ₹ [    5,000 ] ✎      │
│                                                     │
│  ── Property ───────────────────────────────────── │
│  [ + Add property sale ]                            │
│  (No property sales entered)                        │
│                                                     │
│  ── CYLA — Loss set-off ─────────────────────────  │
│  STCL set off against STCG  ₹          0           │
│  LTCL set off against LTCG  ₹          0           │
│  Carry forward STCL         ₹          0           │
│  Carry forward LTCL         ₹          0           │
```

**Business tab layout:**
```
│  ── Business & Profession ─────────────────────── │
│                                                     │
│  ┌─ Intraday (Speculative) ──────────────────────┐ │
│  │  Source: Zerodha Tax P&L                      │ │
│  │  Speculative turnover  ₹ [   3,45,000 ] ✎     │ │
│  │  Net P&L               ₹ [    -18,500 ] ✎     │ │
│  │  ⓘ Loss ring-fenced — not set off against     │ │
│  │  salary or capital gains.                     │ │
│  └───────────────────────────────────────────────┘ │
│                                                     │
│  ┌─ F&O ─────────────────────────────────────────┐ │
│  │  ⚠ F&O income detected. Computation skipped.  │ │
│  │  Enter manually after consulting a CA.        │ │
│  │  F&O turnover           ₹ [         0 ] ✎     │ │
│  │  F&O taxable income     ₹ [         0 ] ✎     │ │
│  └───────────────────────────────────────────────┘ │
│                                                     │
│  [ + Add presumptive income (44AD / 44ADA) ]        │
│  [ + Add non-speculative business income ]          │
```

**Other Sources tab layout:**
```
│  ── Other Sources ──────────────────────────────── │
│                                                     │
│  Dividends (Source: Zerodha)  ₹ [   8,200 ] ✎     │
│  Savings interest             ₹ [   4,500 ] ✎     │
│    (80TTA eligible, up to ₹10,000)                 │
│  FD interest                  ₹ [  18,000 ] ✎     │
│  RD interest                  ₹ [       0 ] ✎     │
│  Family pension               ₹ [       0 ] ✎     │
│    Standard deduction:        ₹           0        │
│  Lottery / winnings           ₹ [       0 ] ✎     │
│    (Flat 30% — no deduction)                       │
│  Gifts received               ₹ [       0 ] ✎     │
│    (Taxable above ₹50,000 from non-relatives)      │
│                                                     │
│  ─────────────────────────────────────────         │
│  Total at slab rate           ₹      30,700        │
│  Total at 30% flat            ₹           0        │
│  Total other sources          ₹      30,700        │
```

**Navigation footer (all tabs):**
```
│  ─────────────────────────────────────────────────  │
│  ITR form detected: ITR-3   [ Change ]              │
│  [ ← Back to upload ]  [ Continue to Deductions → ]│
└─────────────────────────────────────────────────────┘
```

**Behaviour:**
- 5 primary tabs — greyed and non-clickable if the head has zero data (e.g. user with no property will see House Property tab greyed)
- Within Capital Gains, 4 sub-tabs: Equity Delivery / Equity MF / Property / Other
- Each employer entry is a collapsible card — expanded by default if only one; collapsed if multiple
- "+" Add links for employer, property, property sale, presumptive income, non-speculative income
- Property sale modal: address, purchase date, sale date, purchase price, sale price, improvement cost, transfer expenses → system computes indexed cost (LTCG) and gain automatically
- ITR form auto-detected banner at bottom of every tab — shows detected form, allows override
- On any edit: engine recomputes immediately, summary values update live

---

### S05 — Deductions

**Purpose:** Chapter VI-A deductions entry. Shown after the 5 income tabs. Content adapts to selected regime: under New Regime, only 80CCD2 is shown; Old Regime shows full Chapter VI-A form.

**Layout — New Regime (compact):**
```
┌─────────────────────────────────────────────────────┐
│  Deductions                                        │
│                                                     │
│  Filing under New Regime.                          │
│  Most Chapter VI-A deductions do not apply.        │
│                                                     │
│  ── Allowed under New Regime ───────────────────── │
│                                                     │
│  80CCD(2) — Employer NPS contribution              │
│  Up to 10% of basic salary                        │
│  ₹ [        0 ] ✎                                  │
│                                                     │
│  80CCH — Agnipath scheme                           │
│  ₹ [        0 ] ✎                                  │
│                                                     │
│  ── Not applicable under New Regime ──────────── │
│  80C · 80D · 80E · 80G · 80TTA (greyed out)       │
│  Switch to Old Regime to claim these.              │
│  [ Compare Old vs New Regime → ]                  │
│                                                     │
│  ─────────────────────────────────────────────────  │
│  Total deductions             ₹           0        │
│                                                     │
│  [ ← Back to income ]  [ Continue to Regime → ]   │
└─────────────────────────────────────────────────────┘
```

**Layout — Old Regime (full):**
```
┌─────────────────────────────────────────────────────┐
│  Deductions — Old Regime                           │
│                                                     │
│  ── Section 80C (cap ₹1,50,000) ──────────────── │
│  LIC premiums               ₹ [  50,000 ] ✎        │
│  PPF contributions          ₹ [  50,000 ] ✎        │
│  ELSS / mutual funds        ₹ [  30,000 ] ✎        │
│  Home loan principal        ₹ [       0 ] ✎        │
│  Tuition fees               ₹ [       0 ] ✎        │
│  ────────────────────────────────────              │
│  80C used: ₹1,30,000 of ₹1,50,000 cap             │
│  ████████████████████░░░  87% used                 │
│                                                     │
│  ── Section 80CCD(1B) — NPS extra (₹50,000) ───── │
│  NPS self contribution      ₹ [  50,000 ] ✎        │
│                                                     │
│  ── Section 80D — Health Insurance ─────────────── │
│  Self + family premium      ₹ [  25,000 ] ✎        │
│  Parents premium            ₹ [  15,000 ] ✎        │
│  (Cap: ₹25,000 self, ₹25,000 parents)             │
│                                                     │
│  ── Section 80E — Education Loan ─────────────── │
│  Interest paid              ₹ [       0 ] ✎        │
│  (No cap)                                          │
│                                                     │
│  ── Section 80G — Donations ───────────────────── │
│  [ + Add donation ]                                │
│  (Cash limit: ₹2,000 per donation)                │
│                                                     │
│  ── Section 80TTA / 80TTB ─────────────────────── │
│  Savings interest (80TTA)   ₹       4,500 (auto)  │
│  (Capped at ₹10,000)                              │
│                                                     │
│  ─────────────────────────────────────────────────  │
│  Total deductions             ₹    2,74,500        │
│                                                     │
│  [ ← Back to income ]  [ Continue to Regime → ]   │
└─────────────────────────────────────────────────────┘
```

**Behaviour:**
- Cap progress bars for 80C — visual indicator of how close to the limit
- 80TTA auto-populated from savings interest entered in Other Sources
- 80G entries: "+ Add donation" opens inline row — institution name, amount, % deductible (50% / 100%), cash limit warning
- Any deduction edit triggers engine recompute and updates regime comparison
- "Compare Old vs New Regime" link navigates to S06 without losing state

---

### S06 — Regime Comparison

**Purpose:** Side-by-side Old vs New computation. Clear recommendation. One-click regime switch persisted to session.

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│  Old Regime vs New Regime                          │
│                                                     │
│  ┌────────────────────┬────────────────────────┐   │
│  │                    │ New Regime  Old Regime  │   │
│  ├────────────────────┼──────────┬─────────────┤   │
│  │ Gross income       │14,85,200 │  14,85,200  │   │
│  │ Deductions         │       0  │   2,74,500  │   │
│  │ Taxable income     │14,85,200 │  12,10,700  │   │
│  ├────────────────────┼──────────┼─────────────┤   │
│  │ Slab tax           │ 1,22,780 │     97,640  │   │
│  │ STCG tax (20%)     │    24,000│     24,000  │   │
│  │ LTCG tax (12.5%)   │     8,750│      8,750  │   │
│  │ Section 87A rebate │        0 │          0  │   │
│  │ Surcharge          │        0 │          0  │   │
│  │ Cess (4%)          │     6,222│      5,216  │   │
│  ├────────────────────┼──────────┼─────────────┤   │
│  │ Total tax          │ 1,61,752 │   1,35,606  │   │
│  │ TDS deducted       │-1,49,114 │  -1,49,114  │   │
│  ├────────────────────┼──────────┼─────────────┤   │
│  │ Net payable        │   12,638 │    -13,508  │   │
│  └────────────────────┴──────────┴─────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  ✓ Old Regime saves you ₹26,146             │   │
│  │  Recommended: Old Regime                    │   │
│  │                                             │   │
│  │  [ Switch to Old Regime ]                   │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Currently filing under: New Regime                │
│                                                     │
│  ⓘ Switching regime will recompute all schedules.  │
│  Your entered values will not be lost.             │
│                                                     │
│  [ ← Back to Deductions ]  [ Continue to AIS → ]  │
└─────────────────────────────────────────────────────┘
```

**Behaviour:**
- Table always computed for both regimes regardless of currently selected regime
- Recommended regime highlighted (green header if refund, amber if lower payable)
- "Switch to [Regime]" button: updates `AppState.selectedRegime`, triggers full engine recompute, persisted
- If regimes produce equal net payable: "Both regimes result in the same tax. New Regime is simpler."
- "Download comparison PDF" button — generates two-column PDF of this table
- Navigation: AIS screen shown next only if AIS file was uploaded; otherwise goes straight to S07 (Bank Accounts)

---

### S07 — AIS Validation

**Purpose:** Cross-validate every major parsed value against the government-held AIS. Only shown if AIS JSON was uploaded. Mismatches surfaced with severity and actionable options.

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│  AIS Validation                                    │
│                                                     │
│  Annual Information Statement — AY 2026-27         │
│  PAN: ABCDE1234F · Downloaded: 15 Jun 2026         │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │  ✓  2 values match AIS exactly             │   │
│  │  ⚠  1 value has a small difference         │   │
│  │  ✗  1 value has a significant difference   │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ─────────────────────────────────────────────────  │
│                                                     │
│  ✓  Gross salary          ₹12,00,000  =  ₹12,00,000│
│  ✓  TDS deducted          ₹ 1,49,114  =  ₹ 1,49,114│
│                                                     │
│  ⚠  Dividend income                                │
│     Your value:    ₹8,200                          │
│     AIS value:     ₹8,450    (delta: ₹250, 3%)    │
│     Likely rounding difference — safe to ignore    │
│     [ Use AIS value ]  [ Keep my value ]           │
│                                                     │
│  ✗  FD interest income                             │
│     Your value:    ₹18,000                         │
│     AIS value:     ₹24,000   (delta: ₹6,000, 33%) │
│     Significant mismatch — reconcile before filing │
│     [ Use AIS value ]  [ Keep my value ]           │
│     ⓘ Possible cause: interest from a bank not in  │
│     your uploaded 26AS. Check all FD accounts.    │
│                                                     │
│  ─────────────────────────────────────────────────  │
│  [ ← Back to Regime ]  [ Continue to Bank Accounts→]│
└─────────────────────────────────────────────────────┘
```

**Behaviour:**
- Summary card at top: counts of matching / warn / error mismatches
- "Use AIS value" writes the AIS figure to `overrides` in AppContext → triggers engine recompute
- "Keep my value" dismisses the row warning (value stays unchanged)
- Zero mismatches: show full green "✓ All values match AIS" card — no action needed
- If no AIS uploaded: show a prompt card linking to IT portal AIS download, with instructions; allow skipping

---

### S12 — Bank Accounts

**Purpose:** Capture all bank accounts held during the year. One must be designated as refund account. Required before XML download is enabled.

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│  Bank Accounts                                     │
│                                                     │
│  Required for ITR filing — add all accounts held   │
│  during FY 2025-26.                                │
│                                                     │
│  ┌─ Account 1 ────────────────────────────────────┐ │
│  │  IFSC: SBIN0001234   → State Bank of India    │ │
│  │  Account: ●●●●●●7890  (savings)               │ │
│  │  ★ Refund account                              │ │
│  │  [ Edit ]  [ Remove ]                          │ │
│  └───────────────────────────────────────────────┘ │
│                                                     │
│  [ + Add bank account ]                             │
│                                                     │
│  ─────────────────────────────────────────────────  │
│  Add account form (shown when + clicked):           │
│                                                     │
│  IFSC code        [ SBIN0001234 ]                  │
│                   → State Bank of India (auto-fill)│
│  Account number   [              ]                 │
│  Account type     [ Savings ▼ ]                    │
│  Refund account   [✓] Mark as refund account        │
│                                                     │
│  [ Save account ]  [ Cancel ]                      │
│  ─────────────────────────────────────────────────  │
│                                                     │
│  ⚠ Add at least one account before downloading XML.│
│                                                     │
│  [ ← Back to AIS ]  [ Continue to Summary → ]     │
└─────────────────────────────────────────────────────┘
```

**Behaviour:**
- IFSC validation: must match `AAAA0NNNNNN` format (4 letters + 0 + 6 digits)
- Bank name auto-filled from bundled IFSC prefix lookup table on valid IFSC entry
- Account number: masked to last 4 digits in display mode, full number in edit mode
- Exactly one refund account allowed — selecting a new one deselects the previous
- Foreign accounts: toggle "Foreign bank?" reveals SWIFT code + bank country fields (for Schedule FA)
- XML download disabled with tooltip if zero accounts added
- Multiple accounts: all displayed as cards, sorted with refund account first

---

### S08 — Tax Summary v2

**Purpose:** Expanded from v1.0. Adds per-income-head breakdown, regime badge, ITR form badge, and prior CFL entries used this year.

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│  Step 3 of 3 — Tax Summary                         │
│                                                     │
│  Filing ITR-3 · New Regime · AY 2026-27            │
│                                                     │
│  ── Income breakdown ───────────────────────────── │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │ Salary   │ │ Cap Gains│ │ Business │            │
│  │₹11,22,600│ │ ₹88,000  │ │ -₹18,500 │            │
│  └──────────┘ └──────────┘ └──────────┘            │
│  ┌──────────┐ ┌──────────┐                          │
│  │ House Prop│ │ Other Src│                          │
│  │ -₹1,20,000│ │ ₹30,700  │                          │
│  └──────────┘ └──────────┘                          │
│                                                     │
│  ── Tax computation ─────────────────────────────  │
│  [same as v1.0 computation table]                  │
│                                                     │
│  ── Prior year losses used this year ────────────  │
│  STCL from AY 2025-26        ₹ 12,000 set off      │
│  (2 years of carry-forward remaining)              │
│                                                     │
│  ── Warnings ────────────────────────────────────  │
│  [same warning list as v1.0, plus new warnings]    │
│                                                     │
│  ─────────────────────────────────────────────────  │
│  [ ← Edit values ]     [ Download & export → ]     │
└─────────────────────────────────────────────────────┘
```

**Behaviour:**
- Income head MetricCards: 5 cards (Salary / CG / Business / HP / Other) — values in cards update if user navigates back and edits
- Negative values (HP loss, speculative loss): shown in red
- "Prior year losses used" section: only shown if prior ITR XML was uploaded and CFL entries exist
- Regime badge and ITR form badge always visible at the top
- Rest of screen identical to v1.0 summary

---

### S09 — Export v2

**Purpose:** Three downloads. ITR form shown on XML card matches auto-detected form.

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│  Your ITR-3 data is ready                          │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  📋 ITR-3 XML — AY 2026-27                  │  │
│  │  Upload this on incometax.gov.in to pre-fill │  │
│  │  your return                                 │  │
│  │  [ Download XML ]                           │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  📄 Tax Summary — PDF                       │  │
│  │  Full income-head and schedule breakdown     │  │
│  │  [ Download PDF ]                           │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  📊 Regime Comparison — PDF                 │  │
│  │  Old vs New Regime side-by-side             │  │
│  │  [ Download PDF ]                           │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  [Portal upload instructions — same as v1.0]        │
│                                                     │
│  ⚠ Review all values on the portal before          │
│  submitting. This tool is a preparation aid.        │
└─────────────────────────────────────────────────────┘
```

**Behaviour:**
- XML card header ("ITR-3 XML") dynamically shows the auto-detected form: ITR-1, ITR-2, or ITR-3
- XML download: routes to correct XML generator (`generateITR1XML`, `generateITR2XML`, `generateITR3XML_v2`)
- Regime comparison PDF: only shown if `selectedRegime` was evaluated (both computations ran)
- All generation is client-side — no server calls

---

### S11 — Settings (updated)

**Layout additions:**
```
│  ── Tax Rules ───────────────────────────────────  │
│  Active AY: [ AY 2026-27 ▼ ]                      │
│  Loaded rules: New Regime slabs, cess 4%          │
│  [ View full rules → ]  (expandable code block)   │
│                                                     │
│  ── ITR Form ────────────────────────────────────  │
│  Auto-detected: ITR-3                              │
│  [ Override ITR form ▼ ] (advanced — use with care)│
```

---

### S13 — Schedule AL (Assets & Liabilities)

**Purpose:** Capture assets and liabilities as required by the IT department when total income exceeds ₹50L. Shown only when this threshold is crossed — hidden entirely otherwise. Required for ITR-2 and ITR-3; not applicable to ITR-1 or ITR-4.

**Trigger:** `AppState.tax.totalIncome > getRules().surchargeThresholds.scheduleALRequired` (₹50,00,000).

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│  Schedule AL — Assets & Liabilities                │
│  Required because your total income exceeds ₹50L   │
│                                                     │
│  ── A. Immovable assets ────────────────────────── │
│                                                     │
│  ┌─ Land / Building ──────────────────────────────┐ │
│  │  [ + Add property ]                            │ │
│  │                                                │ │
│  │  ┌─ 123 MG Road, Bengaluru ─────────────────┐  │ │
│  │  │  Type: Residential                       │  │ │
│  │  │  Cost of acquisition  ₹ [ 45,00,000 ] ✎  │  │ │
│  │  │  [ Edit ]  [ Remove ]                    │  │ │
│  │  └─────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────┘ │
│                                                     │
│  ── B. Movable assets ──────────────────────────── │
│                                                     │
│  Cash in hand             ₹ [        0 ] ✎         │
│  Deposits (FD/RD/savings) ₹ [  5,00,000 ] ✎        │
│  Shares / debentures      ₹ [ 12,00,000 ] ✎        │
│  (market value as of 31 Mar 2026)                  │
│  Insurance policies       ₹ [  3,00,000 ] ✎        │
│  (surrender value)                                 │
│  Loans / advances given   ₹ [        0 ] ✎         │
│  Motor vehicles           ₹ [  8,00,000 ] ✎        │
│  Jewellery / bullion      ₹ [  2,00,000 ] ✎        │
│  Archaeological / art     ₹ [        0 ] ✎         │
│  Any other assets         ₹ [        0 ] ✎         │
│                                                     │
│  ── C. Liabilities ─────────────────────────────── │
│                                                     │
│  Loans against immovable  ₹ [  30,00,000 ] ✎       │
│  Loans against other      ₹ [        0 ] ✎         │
│                                                     │
│  ─────────────────────────────────────────────────  │
│  ⓘ Values are as of 31 March 2026 (end of FY).     │
│  These are reported to IT department and must      │
│  match your actual holdings.                       │
│                                                     │
│  [ ← Back to Bank Accounts ]  [ Continue → ]      │
└─────────────────────────────────────────────────────┘
```

**Behaviour:**
- Screen inserted between S12 (Bank Accounts) and S08 (Tax Summary) in the navigation flow — but only when income threshold is exceeded
- If total income ≤ ₹50L: route from S12 goes directly to S08, S13 never appears
- "+ Add property" opens inline form: description (address/name), type (residential / commercial / agricultural), cost of acquisition
- All monetary fields use `EditableField` — no auto-population (all values are manual)
- Shares/debentures: market value as of 31 Mar 2026; insurance: surrender value; vehicles: book value
- Validation: all fields required before XML download enabled — zero is a valid entry (no assets in that category)
- Warning at top if total income just crossed ₹50L threshold: "Schedule AL is now required. Please fill in all asset and liability details."

**Assets & Liabilities TypeScript type:**
```typescript
interface ImmovableAsset {
  id: string
  description: string            // e.g. address or plot number
  assetType: 'residential' | 'commercial' | 'agricultural' | 'other'
  costOfAcquisition: number
}
interface ScheduleAL {
  immovableAssets: ImmovableAsset[]
  cashInHand: number
  deposits: number               // FD + RD + savings
  sharesDebentures: number       // market value
  insurancePolicies: number      // surrender value
  loansAdvances: number
  motorVehicles: number
  jewellery: number
  archaeologicalArt: number
  otherAssets: number
  liabilityImmovable: number
  liabilityOther: number
  totalAssets: number            // sum — auto-computed
  totalLiabilities: number       // sum — auto-computed
}
```

---

## 4. Navigation Flow — v2.0

The linear flow from v1.0 (Upload → Parsing → Review → Summary → Export) expands with new screens inserted between Review and Summary:

```
S01 Landing
  │
  ▼
S02 Upload Hub v2
  │
  ▼
S03 Parsing Progress
  │
  ▼
S04 Income Hub v2 (5 income tabs)
  │
  ▼
S05 Deductions
  │
  ▼
S06 Regime Comparison
  │
  ▼
S07 AIS Validation  ← shown only if AIS uploaded; skipped otherwise
  │
  ▼
S12 Bank Accounts
  │
  ▼
S13 Schedule AL  ← shown only if total income > ₹50L AND form is ITR-2 or ITR-3; skipped otherwise
  │
  ▼
S08 Tax Summary v2
  │
  ▼
S09 Export v2
```

`StepProgress` component in v2.0: 5 steps instead of 3 — Upload → Income → Deductions → Review → Export. "Review" step now maps to S06–S13 as a group.

**Navigation skip logic in `navigateNext()`:**
- From S07: if `parsed_v2.aisData !== null` → S07; else skip to S12
- From S12: if `tax.totalIncome > 5000000 AND selectedITRForm !== 'ITR1' AND selectedITRForm !== 'ITR4'` → S13; else skip to S08
- From S13: always → S08

---

## 5. Component Breakdown — v2.0

### 5.1 New / Modified Shared Components

| Component | Status | Description |
|---|---|---|
| `StepProgress` | Modified | Now 5 steps: Upload → Income → Deductions → Review → Export |
| `ITRFormBadge` | New | Shows detected form (ITR-1/2/3/4) with optional override menu |
| `RegimeBadge` | New | Shows active regime (New / Old) with quick-switch link |
| `CapProgressBar` | New | Horizontal bar showing how much of a deduction cap is used |

### 5.2 New Upload Components

| Component | Status | Description |
|---|---|---|
| `DocumentCard` | New | Registry-driven upload slot — reads document metadata from registry JSON |
| `MultiForm16Zone` | New | Form 16 slot that allows adding multiple PDFs (one per employer) |
| `DocumentBadge` | New | Post-upload metadata badge — "26AS: 12 TDS entries", "AIS: salary detected" |

### 5.3 New Income Hub Components

| Component | Status | Description |
|---|---|---|
| `IncomeHubTabs` | New | 5-tab navigation (Salary / HP / CG / BP / Other) — adaptive visibility |
| `EmployerCard` | New | Per-employer salary card — collapsible, editable fields, TDS shown |
| `HousePropertyCard` | New | Per-property card — type selector, NAV calc, interest, income/loss |
| `AddPropertyModal` | New | Modal for adding property details with all required fields |
| `PropertySaleModal` | New | Modal for property sale details + auto-computed indexed cost |
| `CGSubTabs` | New | Sub-tabs within Capital Gains: Equity / MF / Property / Other |
| `CYLAMatrix` | New | Visual matrix showing which losses set off against which gains |
| `PresumptiveIncomeCard` | New | Card for 44AD / 44ADA income with computed taxable income |

### 5.4 New Deductions Components

| Component | Status | Description |
|---|---|---|
| `DeductionSection` | New | Per-section deduction group — collapsible, shows cap usage |
| `DonationRow` | New | 80G donation entry row — institution, amount, deductible % |
| `RegimeSwitchPrompt` | New | Inline prompt to compare regimes, appears in New Regime deductions view |

### 5.5 New Regime Comparison Components

| Component | Status | Description |
|---|---|---|
| `RegimeComparisonTable` | New | Side-by-side table with row-level delta computation |
| `RegimeRecommendationCard` | New | Highlighted recommendation with saving amount and one-click switch |

### 5.6 New AIS Validation Components

| Component | Status | Description |
|---|---|---|
| `AISMismatchRow` | New | Per-field mismatch — shows both values, delta, severity, action buttons |
| `AISSummaryCard` | New | Summary count of match / warn / error mismatches |

### 5.8 New Schedule AL Components

| Component | Status | Description |
|---|---|---|
| `ScheduleALScreen` | New | Full S13 screen — conditional render based on income threshold |
| `ImmovableAssetCard` | New | Per-property card in Schedule AL with type, description, cost |
| `AddImmovableAssetForm` | New | Inline form for adding land/building entry |
| `ALThresholdBanner` | New | Warning banner shown when user crosses ₹50L threshold mid-session |

### 5.7 New Bank Account Components

| Component | Status | Description |
|---|---|---|
| `BankAccountCard` | New | Displays masked account, IFSC, type, refund flag |
| `AddBankAccountForm` | New | Inline form with IFSC validation and bank name auto-fill |

---

## 6. State Model — v2.0

All additions to `AppState`. Existing slices from v1.0 unchanged.

### 6.1 New State Shape Additions

```typescript
type AppState_v2 = AppState & {

  // Config
  selectedAY: string                          // e.g. "2026-27", from tax-rules.json defaultAY
  selectedRegime: 'new' | 'old'               // persisted
  selectedITRForm: 'ITR1' | 'ITR2' | 'ITR3' | 'ITR4'  // auto-detected, overridable
  detectedITRForm: 'ITR1' | 'ITR2' | 'ITR3' | 'ITR4'  // always from auto-detection

  // Uploaded files (File objects — not persisted)
  files_v2: {
    brokerPL: File | null
    form16: File[]                            // array — multi-employer
    mfStatement: File | null
    form26AS: File | null
    ais: File | null
    previousITR: File | null
  }

  // Parsed data additions (persisted)
  parsed_v2: {
    form16: Form16Data[]                      // array — one per employer
    aisData: AISData | null
    form26AS: Form26ASData | null
    priorITRCFL: CFLEntry[]                   // extracted from prior ITR XML
    detectedBroker: 'zerodha' | 'groww' | 'upstox' | 'unknown' | null
  }

  // Income schedules v2 (derived — recomputed on any edit)
  schedules_v2: {
    S: ScheduleS_v2                           // multi-employer
    HP: ScheduleHP                            // new
    CG: ScheduleCG_v2                         // + property sales
    BP: ScheduleBP_v2                         // + presumptive + F&O
    OS: ScheduleOS_v2                         // expanded other sources
    CYLA: ScheduleCYLA_v2                     // all heads
    CFL: ScheduleCFL_v2                       // + prior year entries
  }

  // Deductions (persisted)
  deductions: DeductionsVI_A

  // Tax credits (persisted)
  taxCredits: TaxCredits

  // Regime comparison (derived)
  regimeComparison: {
    new: TaxComputation
    old: TaxComputation
    recommended: 'new' | 'old'
    saving: number
  } | null

  // AIS mismatches (derived after AIS parse)
  aisMismatches: AISMismatch[]
  aisMismatchResolutions: Record<string, 'use_ais' | 'keep_parsed'>  // persisted

  // Bank accounts (persisted)
  bankAccounts: BankAccount[]

  // Filer profile (persisted) — drives senior slab selection
  filerProfile: {
    dateOfBirth: string | null     // ISO date — determines filerCategory
    filerCategory: 'general' | 'senior' | 'super_senior'
    // general: age < 60; senior: 60 ≤ age < 80; super_senior: age ≥ 80
    // computed from dateOfBirth and AY start date (1 Apr of AY year - 1)
    // e.g. for AY 2026-27: age as of 1 Apr 2025
  }

  // Schedule AL — assets & liabilities (persisted)
  scheduleAL: ScheduleAL | null   // null if total income ≤ ₹50L

  // Parse status additions
  parseStatus_v2: {
    form26AS: 'idle' | 'parsing' | 'done' | 'error'
    ais: 'idle' | 'parsing' | 'done' | 'error'
    previousITR: 'idle' | 'parsing' | 'done' | 'error'
    errors: Record<string, string>
  }

}
```

### 6.2 Updated Persistence Rules

All existing persistence rules from design.md Section 5.2 carry forward. Additions:

| State slice | Persisted | Notes |
|---|---|---|
| `selectedAY` | Yes | Restored on resume |
| `selectedRegime` | Yes | Must survive resume — user's regime choice is intentional |
| `selectedITRForm` | Yes | Persisted if user overrode auto-detection |
| `detectedITRForm` | No | Recomputed on resume from schedules |
| `files_v2` | No | File objects not serialisable |
| `parsed_v2.form16` | Yes | All employer Form 16 data |
| `parsed_v2.aisData` | Yes | AIS data for cross-validation |
| `parsed_v2.priorITRCFL` | Yes | CFL entries from prior ITR |
| `deductions` | Yes | User-entered deduction values |
| `taxCredits` | Yes | TDS entries, advance tax challans |
| `regimeComparison` | Yes | Avoid recomputing on resume |
| `aisMismatchResolutions` | Yes | User's "Use AIS" / "Keep" decisions |
| `bankAccounts` | Yes | Required for XML export |
| `filerProfile` | Yes | DOB and category must survive resume |
| `scheduleAL` | Yes | Manual entries must survive resume |
| `parseStatus_v2` | No | Resets on resume |

### 6.3 Updated Recomputation Triggers

All v1.0 triggers carry forward. Additions:

`computeTax()` and `computeRegimeComparison()` re-run whenever:
- Any value in `deductions` changes
- Any value in `taxCredits` changes
- `selectedRegime` changes
- Any `aisMismatchResolutions` entry set to `'use_ais'`

`detectITRForm()` re-runs whenever:
- `schedules_v2` changes

---

## 7. Data Flow — v2.0

```
Files (browser memory)
        │
        ▼
┌──────────────────────────────────────────────────────────┐
│                 CLIENT-SIDE PARSERS                      │
│  SheetJS → BrokerParser (unchanged)                      │
│  PDF.js  → Form16Parser × N (multi-employer)             │
│  JSON    → MFStatementParser (unchanged)                 │
│  PDF/XLS → Form26ASParser (new — TDS + advance tax)      │
│  JSON    → AISParser (new — cross-validation data)       │
│  XML     → PriorITRParser (new — CFL extraction)         │
└──────────────────────────────────────────────────────────┘
        │                           │
        │ parse success              │ parse ambiguous
        │                           ▼
        │               ┌────────────────────────┐
        │               │  AI FALLBACK           │
        │               │  (same 2 call types,   │
        │               │   same logging)        │
        │               └────────────────────────┘
        │                           │
        ▼                           ▼
┌──────────────────────────────────────────────────────────┐
│            NORMALISED PARSED DATA                        │
│  BrokerData / Form16Data[] / MFData /                    │
│  Form26ASData / AISData / CFLEntry[]                     │
└──────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────┐
│            TAX ENGINE v2 (pure JS, reads tax-rules.json) │
│  computeSchedules_v2() → all 5 income heads              │
│  computeDeductionsVI_A() → cap-bounded deductions        │
│  computeTax(regime='new') → New Regime computation       │
│  computeTax(regime='old') → Old Regime computation       │
│  computeRegimeComparison() → side-by-side delta          │
│  detectITRForm() → ITR1 / ITR2 / ITR3 / ITR4            │
│  crossValidateWithAIS() → AISMismatch[]                  │
│  computeWarnings_v2() → all warning conditions           │
│  No AI. No network. Deterministic.                       │
└──────────────────────────────────────────────────────────┘
        │
        ▼
┌──────────────────────────────────────────────────────────┐
│            OUTPUT GENERATORS v2                          │
│  generateXML(state) → routes to ITR1/2/3 generator       │
│  generateTaxSummaryPDF_v2() → updated layout             │
│  generateRegimeComparisonPDF() → new output              │
│  (all client-side, no server)                            │
└──────────────────────────────────────────────────────────┘
```

---

## 8. Tax Rules Config — Design Contract

`public/config/tax-rules.json` is the authoritative source for all tax constants. The engine never hardcodes a rate, threshold, or cap.

**Senior and super-senior citizen slab variants (Old Regime only):**

Under the Old Regime, individuals aged 60–79 (senior citizens) and 80+ (super senior citizens) get higher basic exemption limits. The New Regime has no age-based slab differentiation — all filers use the same slabs.

The `old` regime block in `tax-rules.json` carries three slab arrays:
```json
"old": {
  "slabs": { ... },                    // general — age < 60
  "slabs_senior": [                    // senior — age 60–79
    { "from": 0, "to": 300000, "rate": 0 },
    { "from": 300000, "to": 500000, "rate": 0.05 },
    { "from": 500000, "to": 1000000, "rate": 0.20 },
    { "from": 1000000, "to": null, "rate": 0.30 }
  ],
  "slabs_super_senior": [             // super senior — age 80+
    { "from": 0, "to": 500000, "rate": 0 },
    { "from": 500000, "to": 1000000, "rate": 0.20 },
    { "from": 1000000, "to": null, "rate": 0.30 }
  ],
  ...
}
```

`getRules()` is extended to accept `filerCategory`:
```typescript
getRules(ay: string, regime: 'new' | 'old', filerCategory?: 'general' | 'senior' | 'super_senior')
// Returns the correct slabs key based on regime + filerCategory
// New Regime: always returns 'slabs' (no age differentiation)
// Old Regime: returns 'slabs', 'slabs_senior', or 'slabs_super_senior' based on filerCategory
```

**Access pattern in engine code:**
```typescript
const rules = getRules('2026-27', 'new', 'general')
const slabTax = computeSlabTax(income, rules.slabs)
const surcharge = computeSurcharge(income, rules.surcharge)
const deductionCap = rules.deductionCaps['80C']  // Old Regime only
```

**Section 87A under Old Regime for seniors:** The ₹5L limit and ₹12,500 max rebate apply to all filers regardless of age. Senior/super-senior benefit only from higher basic exemption (wider nil slab), not from a higher 87A limit.

**Adding a new AY (Budget change):**
1. Add `"2027-28"` block to `tax-rules.json`
2. Run `npm run validate-rules` — CLI checks for gaps, invalid rates, missing required fields
3. Deploy — zero code change required

**What never changes (not in config):**
- Loss set-off rules (which loss type can offset which income head) — these are statutory, not Budget-year-dependent
- ITR form eligibility logic — determined by income type presence, not thresholds

---

## 9. Document Registry — Design Contract

`public/config/document-registry.json` drives the upload screen. Adding a document type = registry edit only, no screen code change.

**Schema:**
```json
{
  "documents": [
    {
      "id": "brokerPL",
      "label": "Broker Tax P&L",
      "required": true,
      "multiple": false,
      "formats": [".xlsx"],
      "hint": "Zerodha / Groww / Upstox Console → Tax P&L",
      "parsedBadge": "broker_name_detected",
      "errorOnMissing": "Required to compute capital gains and intraday income"
    },
    {
      "id": "form16",
      "label": "Form 16",
      "required": true,
      "multiple": true,
      "maxCount": 5,
      "formats": [".pdf"],
      "hint": "From employer — text-based only",
      "parsedBadge": "employer_name_detected",
      "addMoreLabel": "Add another Form 16"
    }
  ]
}
```

---

## 10. Parser Specifications — Additions

### 10.1 Form 26AS Parser

| Source | Format | What to extract |
|---|---|---|
| TRACES download | PDF or Excel (.xlsx) | Part A: TDS deducted by each deductor (TAN, deductor name, section, amount). Part C: Advance tax challan details (BSR code, date, serial, amount) |

Detection: Excel file — look for "Form 26AS" in cell A1 or sheet name. PDF — look for "Form 26AS" in first 200 chars of extracted text.

### 10.2 AIS Parser

The AIS JSON downloaded from the IT portal (`compliance.gov.in`) has a structured format. Parser extracts:
- Salary entries (per employer) — gross salary and TDS
- Dividend entries (per company) — amount and TDS
- Interest entries — payer, type (savings/FD/RD), amount
- Securities transactions — buy/sale value, computed gain
- MF transactions — redemption value, computed gain
- TDS credit entries (same as 26AS Part A)

### 10.3 Prior ITR XML Parser

Target: ITR-2 or ITR-3 XML (AY 2025-26 or earlier).
Extract from `<ScheduleCFL>` node: per-year, per-type unabsorbed loss entries.
Validate carry-forward eligibility: speculative loss ≤ 4 years from AY of origin; capital/HP/business loss ≤ 8 years.
Filter expired entries before loading into AppState.

### 10.4 ISIN Classification Table

`public/config/isin-classification.json` (existing in v1.0) — maps ISIN prefixes to `equity_oriented` or `debt_oriented`. No change to structure.

### 10.5 CII Table

`public/config/cii.json` — new static file for property LTCG computation:
```json
{
  "base_year": "2001-02",
  "values": {
    "2001-02": 100,
    "2010-11": 167,
    "2024-25": 363,
    "2025-26": 381
  }
}
```

### 10.6 IFSC Prefix Table

`public/config/ifsc-prefixes.json` — new static file for bank name auto-fill from IFSC:
```json
{
  "SBIN": "State Bank of India",
  "HDFC": "HDFC Bank",
  "ICIC": "ICICI Bank",
  ...
}
```
Bank name is the first 4 characters of the IFSC code mapped to this table.

---

## 11. XML Output — v2.0 Additions

### 11.1 Multi-Form Routing

```
generateXML(state)
  │
  ├── state.selectedITRForm === 'ITR1' → generateITR1XML(state)
  ├── state.selectedITRForm === 'ITR2' → generateITR2XML(state)
  ├── state.selectedITRForm === 'ITR3' → generateITR3XML_v2(state)
  └── state.selectedITRForm === 'ITR4' → generateITR4XML(state)
```

### 11.2 New Nodes in ITR-3 XML v2

```xml
<ScheduleHP>
  <HP1>
    <PropertyType>SOP</PropertyType>       <!-- SOP / LOP / DLOP -->
    <GrossAnnualRent>0</GrossAnnualRent>
    <MunicipalTax>0</MunicipalTax>
    <NetAnnualValue>0</NetAnnualValue>
    <StandardDeduction>0</StandardDeduction>
    <InterestPayable>120000</InterestPayable>
    <IncomeFromHP>-120000</IncomeFromHP>
  </HP1>
</ScheduleHP>

<ScheduleAL>         <!-- Required if total income > ₹50L, ITR-2 and ITR-3 only -->
  <ImmovableAssets>
    <LandBuilding>
      <SLNo>1</SLNo>
      <Description>123 MG Road Bengaluru Residential</Description>
      <CostAcquisition>4500000</CostAcquisition>
    </LandBuilding>
  </ImmovableAssets>
  <MovableAssets>
    <CashInHand>0</CashInHand>
    <Deposits>500000</Deposits>
    <SharesSecurities>1200000</SharesSecurities>
    <InsurancePolicies>300000</InsurancePolicies>
    <LoansAdvancesGiven>0</LoansAdvancesGiven>
    <MotorVehicles>800000</MotorVehicles>
    <JewelleryBullion>200000</JewelleryBullion>
    <ArchaeologicalCollections>0</ArchaeologicalCollections>
    <OtherAssets>0</OtherAssets>
  </MovableAssets>
  <Liabilities>
    <LiabilityImmovable>3000000</LiabilityImmovable>
    <LiabilityOther>0</LiabilityOther>
  </Liabilities>
</ScheduleAL>

<BankAccountDetails>
  <BankAccount>
    <IFSCCode>SBIN0001234</IFSCCode>
    <AccountNo>●●●●●●7890</AccountNo>
    <AccountType>SB</AccountType>        <!-- SB / CA / CC -->
    <RefundAccount>Y</RefundAccount>
  </BankAccount>
</BankAccountDetails>
```

### 11.3 ITR-1 XML Key Nodes

ITR-1 is a simplified form. Nodes populated:
- `<PersonalInfo>` — PAN, name, address, regime
- `<ScheduleTCS>` — salary from single employer
- `<ScheduleOS>` — other sources
- `<ScheduleTaxPaid>` — TDS from employer
- `<TaxComputation>` — slab tax, cess, net payable
- `<BankAccountDetails>` — refund account

No BP, no CG schedules.

### 11.4 ITR-4 XML Key Nodes

ITR-4 (Sugam) is for filers with only presumptive business income under Sec 44AD or 44ADA. Nodes populated:
- `<PersonalInfo>` — PAN, name, address, DOB, regime
- `<ScheduleBP>` — presumptive income section only:
  ```xml
  <ScheduleBP>
    <Sec44AD>
      <GrossReceipts>2000000</GrossReceipts>
      <PresumptiveIncome>160000</PresumptiveIncome>   <!-- 8% of receipts -->
    </Sec44AD>
    <Sec44ADA>
      <GrossReceipts>0</GrossReceipts>
      <PresumptiveIncome>0</PresumptiveIncome>
    </Sec44ADA>
  </ScheduleBP>
  ```
- `<ScheduleS>` — salary income if any (ITR-4 allows salary + presumptive)
- `<ScheduleOS>` — other sources if any
- `<ScheduleTaxPaid>` — TDS credits
- `<TaxComputation>` — slab tax, surcharge, cess, net payable
- `<BankAccountDetails>` — refund account

ITR-4 does not include: ScheduleHP, ScheduleCG, ScheduleAL, ScheduleCFL, ScheduleBP non-presumptive sections.

Validate against ITR-4 AY 2026-27 XSD before download. Bundle XSD at `/public/schemas/itr4_ay2026_27.xsd`.

---

## 12. Error States — v2.0 Additions

| Error | Screen | Handling |
|---|---|---|
| Multiple Form 16 — AY mismatch between two PDFs | S03 | Error card on second Form 16 card — "AY in this Form 16 (2025-26) does not match AY 2026-27. Upload the correct Form 16." |
| 26AS AY mismatch | S03 | Warning card — "26AS is for a different AY. TDS entries may not match." |
| AIS PAN mismatch (AIS PAN ≠ Form 16 PAN) | S07 | Error card blocking AIS validation — "AIS PAN does not match Form 16 PAN. Upload the correct AIS." |
| Prior ITR XML from wrong assessee (PAN mismatch) | S03 | Error — "PAN in uploaded ITR XML does not match. CFL entries not loaded." |
| Prior ITR CFL — all entries expired | S04 | Info card in CFL section — "All carry-forward entries from prior ITR have expired. No losses to bring forward." |
| Property sale — LTCG CII year not in table | S04 | Warning on property sale modal — "CII for purchase year [YYYY] not found. Enter indexed cost manually." |
| Bank account — duplicate IFSC + account number | S12 | Inline error on add form — "This account already exists." |
| Refund account not set | S12 | Block XML download with tooltip — "Mark one account as refund account before downloading XML." |
| ITR-2 or ITR-3 selected but income is ITR-1 eligible | S08 | Info banner — "Your income profile qualifies for the simpler ITR-1 form." |
| Old Regime selected but 80C deductions are zero | S05 | Soft warning — "You have selected Old Regime but no deductions entered. New Regime may be simpler." |
| Total income crosses ₹50L mid-session (edit pushes over threshold) | S04/S08 | `ALThresholdBanner` — "Your total income now exceeds ₹50L. Schedule AL (assets & liabilities) is required before filing. It has been added to your review flow." |
| Schedule AL not completed but income > ₹50L | S09 | Block XML download with tooltip — "Schedule AL is required for incomes above ₹50L. Complete it before downloading XML." |
| ITR-4 selected but filer also has salary or CG income | S08 | Warning banner — "ITR-4 is only for pure presumptive income filers. Your income profile requires ITR-3. Switch to ITR-3 to include all income heads." |
| DOB not entered and Old Regime selected | S05/S11 | Soft warning — "Enter your date of birth in Settings to ensure the correct tax slab is applied. Without it, general (under-60) slabs are used." |
| Senior citizen with no 80TTB entry | S05 | Info — "Senior citizens can claim up to ₹50,000 deduction on interest income under 80TTB (replaces 80TTA)." |

---

## 13. Open Design Questions — v2.0

| # | Question | Resolution |
|---|---|---|
| D5 | Should presumptive income (44AD / 44ADA) pre-populate from any document, or is it always manual entry? | **Manual only** — no document source exists for presumptive income; user enters gross receipts directly on S04 Business tab |
| D6 | Should the CII table update path be part of the tax-rules.json config or remain a separate cii.json? | **Separate cii.json** — CII values are published annually by CBDT independent of Budget; keeping them separate avoids cluttering tax-rules.json and allows targeted updates |
| D7 | Should Schedule AL be shown in S04 as a separate tab, or as a standalone screen? | **Standalone screen S13** — inserted between S12 (Bank Accounts) and S08 (Tax Summary), shown conditionally when total income > ₹50L and form is ITR-2 or ITR-3. Now in scope for v2.0. |
| D8 | For ITR-2 users (no business income), should the BP tab in S04 be hidden entirely or shown greyed? | **Greyed but clickable** — user may want to manually add non-speculative or F&O income discovered after parsing; greyed tab with "No business income detected — add manually" placeholder |
| D9 | Should the regime comparison be mandatory in the flow (always visited) or optional (skipped if user has already chosen)? | **Mandatory on first visit, skippable on resume** — first time through the flow S06 must be visited; on resume, if `selectedRegime` is already set, S06 shows a compact "Regime already chosen" summary card with a "Review comparison" expand option |

---

*End of Enhancement Design Document v2.0*
