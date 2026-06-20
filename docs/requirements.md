# ITR Filing Utility — Requirements Document
**Product:** ITR-3 Tax Filing Data Preparation Utility
**For:** FY 2025-26 (AY 2026-27)
**User Profile:** Zerodha user · Salaried employee · Intraday equity trader · MF investor · New Tax Regime
**Version:** 1.2 — AI Security Model Revised
**Date:** June 2026
 
---
 
## Revision History
 
| Version | Date | Changes |
|---|---|---|
| 1.0 | June 2026 | Initial draft |
| 1.1 | June 2026 | All 5 open questions resolved — broker support expanded, PDF scope confirmed, ITR XML output added, MF statement source unified, local save/resume added |
| 1.2 | June 2026 | AI usage redesigned — sensitive data never leaves browser, AI limited to 2 anonymised structural fallback calls only, AI call logging added |
 
---
 
## 1. Purpose
 
A web-based utility that accepts raw tax documents uploaded by the user, parses and interprets them using AI, and produces a structured, schedule-wise tax summary **plus a portal-ready ITR XML file** that the user can directly upload to the Income Tax e-filing portal (incometax.gov.in) to pre-fill their ITR-3. The tool does not submit the return — it prepares, validates, and packages the data.
 
**Security principle:** All document parsing and tax computation happens entirely client-side in the user's browser. No financial data, identity data, or document contents are ever transmitted to any server or third-party API.
 
---
 
## 2. Users
 
| User | Description |
|---|---|
| Primary | Individual salaried taxpayer filing ITR-3 under New Tax Regime |
| Secondary | CA or tax advisor assisting the taxpayer |
 
---
 
## 3. Input Documents
 
The user uploads the following files. All three are required for a complete output.
 
### 3.1 Broker Tax P&L — Excel (.xlsx)
Supported brokers in v1.0:
- **Zerodha** — Console → Reports → Tax P&L → FY 2025-26, Q1–Q4
- **Groww** — Tax P&L report downloaded from Groww Console
- **Upstox** — Tax P&L report downloaded from Upstox Console
Each broker uses a different Excel sheet structure. The parser must auto-detect the broker from column headers and route to the correct parsing strategy.
 
Contains (across all brokers): equity delivery gains/losses, intraday turnover and P&L, F&O flag, dividends.
 
### 3.2 Form 16 — PDF (text-based only)
- Issued by employer
- Part A: TDS deducted and deposited quarter-wise
- Part B: Salary breakup — gross salary, allowances, perquisites, deductions
- **Scanned / image PDFs are not supported in v1.0.** User must obtain a text-based PDF from their employer. A clear error message is shown if a scanned PDF is detected.
### 3.3 Mutual Fund Capital Gains Statement — JSON or PDF
- Source: **CAMS Online or KFintech** (both portals produce a structurally compatible combined JSON — single parser handles both)
- JSON format is preferred and recommended to the user
- PDF format is supported as fallback (text-based only, same scanned restriction as Form 16)
- Contains: scheme-wise LTCG, STCG, redemption dates, purchase dates, NAV values across all fund houses in one file
---
 
## 4. Processing Requirements
 
### 4.1 Form 16 Parsing
- Extract gross salary, standard deduction (fixed ₹75,000 under New Regime), professional tax, net taxable salary
- Extract TDS amount deducted by employer (Part A)
- Extract PAN, employer name, employer TAN, assessment year
- Validate assessment year = AY 2026-27; surface error if mismatch
- Detect if PDF is image-based — if so, reject with message: "Scanned PDF detected. Please obtain a text-based Form 16 from your employer."
### 4.2 Broker Tax P&L Parsing
 
**Broker auto-detection logic:**
Inspect column headers on the first sheet. Each broker has a distinct signature set of column names. Route to broker-specific parser accordingly. If no broker is detected, trigger the AI structural fallback (see Section 5 — AI Usage Policy).
 
**Data to extract per broker (normalised output is identical regardless of broker):**
 
| Sheet type | Data to extract |
|---|---|
| Equity delivery | STCG and LTCG per scrip — holding period, buy price, sell price, net gain/loss |
| Equity intraday | Total turnover (absolute sum of P&L), net speculative profit or loss |
| Dividends | Dividend income per scrip, total amount |
| Other segments | Detect F&O, currency, commodity — flag to user, exclude from computation |
 
**Broker-specific parsing notes:**
- Zerodha: sheets labelled "Equity", "Equity Intraday", "Dividends"
- Groww: single sheet with a "Type" column differentiating delivery vs intraday
- Upstox: separate files may need to be merged — prompt user if intraday sheet is missing
### 4.3 Mutual Fund Statement Parsing
- CAMS and KFintech JSON are structurally compatible — single unified parser handles both
- Identify equity-oriented vs debt-oriented funds per scheme
- For equity MFs: classify each redemption as STCG (held ≤ 12 months) or LTCG (held > 12 months)
- For debt MFs: classify gains as slab-rate income (no special capital gains rate)
- Aggregate total STCG and LTCG across all schemes
- If PDF is uploaded instead of JSON: extract using text parsing; flag that JSON is preferred for accuracy
### 4.4 Tax Computation — New Regime (ITR-3)
Compute in the following order:
 
**Step 1 — Income heads**
- Salary income = Gross salary − ₹75,000 standard deduction − Professional tax
- Speculative business income = Intraday net P&L (positive = income, negative = loss)
- Capital gains = STCG (equity + equity MF) + LTCG (equity + equity MF) + debt MF gains
- Other sources = dividends + interest (if any)
**Step 2 — Loss set-off (Schedule CYLA)**
- Intraday loss can only be set off against intraday profit — not against salary or capital gains
- Short-term capital loss can be set off against STCG and LTCG
- Long-term capital loss can only be set off against LTCG
**Step 3 — Carry forward (Schedule CFL)**
- Unabsorbed intraday (speculative) loss: carry forward up to 4 years
- Unabsorbed capital loss: carry forward up to 8 years
- Flag: carry-forward is only valid if ITR is filed before 31 July 2026
**Step 4 — Tax computation**
 
| Income type | Rate |
|---|---|
| Salary + other sources + intraday profit + debt MF gains | New Regime slab rates |
| STCG on equity / equity MF (Sec 111A) | 20% flat |
| LTCG on equity / equity MF above ₹1.25L (Sec 112A) | 12.5% flat |
 
**New Regime slab rates FY 2025-26:**
 
| Income slab | Rate |
|---|---|
| Up to ₹4,00,000 | Nil |
| ₹4,00,001 – ₹8,00,000 | 5% |
| ₹8,00,001 – ₹12,00,000 | 10% |
| ₹12,00,001 – ₹16,00,000 | 15% |
| ₹16,00,001 – ₹20,00,000 | 20% |
| ₹20,00,001 – ₹24,00,000 | 25% |
| Above ₹24,00,000 | 30% |
 
**Step 5 — Rebate and cess**
- Section 87A rebate: nil tax if slab income ≤ ₹12,00,000 (New Regime) — does not apply to STCG/LTCG
- Health & Education cess: 4% on total tax
- Surcharge: 10% if total income ₹50L–₹1Cr; 15% if ₹1Cr–₹2Cr (cap at 15% under New Regime for this version)
**Step 6 — Net payable / refund**
- Total tax − TDS deducted by employer − Advance tax paid (if any) = Net payable or refund
### 4.5 ITR XML Generation
- Generate a valid ITR-3 XML file conforming to the schema published by the Income Tax Department for AY 2026-27
- Pre-fill all computed schedule values into the correct XML nodes
- Include taxpayer PAN (extracted from Form 16) in the XML header
- Mark regime as "New" in the XML
- The generated XML can be uploaded directly on incometax.gov.in under: e-File → Income Tax Returns → Upload XML
- Validate XML structure before offering download — surface any schema errors clearly
- **Note:** The portal may still require the user to review and confirm pre-filled data before final submission
---
 
## 5. AI Usage Policy
 
### 5.1 Core Security Principle
 
**Sensitive financial data never leaves the user's browser.**
 
All document parsing (Excel, PDF, JSON) and all tax computation happen entirely client-side using JavaScript. The Anthropic API is only called in specific, limited fallback scenarios, and only receives anonymised structural metadata — never actual financial values, identity information, or document contents.
 
### 5.2 Permitted AI Calls
 
Exactly two AI call types are permitted in v1.0. Both are fallbacks — triggered only when rule-based parsing fails. For the majority of users with standard documents, zero AI calls will be made.
 
---
 
**AI Call Type 1 — Broker format detection fallback**
 
| Attribute | Detail |
|---|---|
| Trigger | Excel column headers do not match any known broker signature |
| What is sent to AI | Sheet names + column header strings only |
| What is explicitly excluded | All row data — no trade values, prices, P&L figures, scrip names |
| AI task | Identify which broker format this resembles and suggest column mappings |
| Example payload | `{ "sheets": ["Sheet1", "Sheet2"], "headers": ["Date", "Scrip", "Qty", "Avg Price", "P&L"] }` |
 
---
 
**AI Call Type 2 — Form 16 field mapping fallback**
 
| Attribute | Detail |
|---|---|
| Trigger | PDF text extraction produces field labels that do not match known Form 16 patterns |
| What is sent to AI | Extracted field label strings only |
| What is explicitly excluded | All numeric values — no salary amounts, TDS figures, PAN, TAN, employer name |
| AI task | Map ambiguous label strings to standard Form 16 field names |
| Example payload | `{ "labels": ["Gross Remuneration", "Net Salary after deduction u/s 16", "Tax at source"] }` |
 
---
 
### 5.3 What AI Must Never Receive
 
The following data must never be included in any AI API call under any circumstances:
 
- PAN, TAN, Aadhaar, or any identity number
- Salary amounts, TDS amounts, or any rupee values
- Scrip names, trade quantities, buy/sell prices
- Folio numbers, scheme names, NAV values
- Employer name or employee name
- Any raw document text or document content
### 5.4 AI Call Logging
 
Every AI call made by the utility must be logged locally to support future improvement and auditability.
 
**Log entry structure (stored in localStorage under `itr_utility_ai_log`):**
 
```json
{
  "call_id": "uuid-v4",
  "timestamp": "ISO 8601",
  "call_type": "broker_detection | form16_mapping",
  "trigger_reason": "string — why rule-based parsing failed",
  "payload_summary": "string — description of what was sent, not the actual payload",
  "response_summary": "string — what AI returned, not the raw response",
  "was_useful": null,
  "rule_gap": "string — what rule could be added to avoid this AI call in future"
}
```
 
**Log behaviour:**
- Log is append-only — entries are never deleted automatically
- User can view the AI call log from the settings panel
- User can export the log as JSON for sharing with developers
- `was_useful` field is set by the user via a simple thumbs up/down prompt shown after each AI-assisted parse: "Did the AI help parse your document correctly?"
- `rule_gap` is populated by the AI itself as part of its response — it must describe what deterministic rule could replace it in future
- Log is included in the exported session data for developer review
- **Purpose:** Every AI call is a signal that a deterministic rule is missing. The log is the backlog for eliminating future AI calls.
### 5.5 AI Call Reduction Roadmap
 
Each release should aim to reduce AI call frequency. The log drives this directly:
 
| Metric | Target |
|---|---|
| % of sessions making zero AI calls | ≥ 90% at v1.0 launch |
| % of sessions making zero AI calls | ≥ 98% by v1.2 |
| New broker support without AI fallback | Add within 1 release of first log entry for that broker |
 
---
 
## 6. Local Save & Resume
 
- After parsing is complete, all extracted and computed data is saved to **browser localStorage** under a namespaced key (`itr_utility_fy2526_session`)
- On next visit, if a saved session is detected, the user is prompted: "Resume your previous session (saved [date/time])?" or "Start fresh"
- Saved data includes: all parsed values, computed schedule outputs, manual overrides, and AI call log
- Data is stored locally only — nothing is sent to any server
- User can explicitly clear saved data from the settings panel
- Session data is cleared automatically after 31 July 2026 (filing deadline)
---
 
## 7. Validation & Warnings
 
| Check | Condition | Warning |
|---|---|---|
| AIS mismatch risk | Always | "Cross-check all values against your AIS on incometax.gov.in before uploading XML." |
| F&O detected | F&O sheet has data | "F&O income detected — not computed in v1.0. Consult a CA before filing." |
| Carry-forward deadline | Any unabsorbed loss | "File ITR before 31 July 2026 to carry forward this loss." |
| LTCG exemption cap | LTCG > ₹1.25L | "LTCG above ₹1.25L taxable at 12.5%. Section 87A rebate does not apply." |
| New Regime confirmation | Always | "Filing under New Regime. Deductions under 80C–80U are not applicable." |
| Intraday loss restriction | Intraday loss present | "Intraday loss cannot be set off against salary or capital gains." |
| Scanned PDF detected | Image-based PDF uploaded | "Scanned PDF not supported. Please upload a text-based PDF." |
| Broker not recognised | Excel headers unmatched | "Broker format not recognised — AI fallback used. Verify parsed values carefully." |
| AI call made | Any AI call triggered | "AI was used to assist parsing. No financial data was sent — only document structure. Review extracted values before proceeding." |
| XML schema error | XML validation fails | "Generated XML has errors. Review flagged fields before uploading to portal." |
| Surcharge applicable | Total income > ₹50L | "Surcharge applies. Verify final surcharge rate on the IT portal after upload." |
 
---
 
## 8. Out of Scope — Version 1.0
 
- F&O (futures & options) tax computation
- Old Tax Regime
- More than one house property income
- Foreign income or foreign assets (Schedule FA)
- Direct submission to Income Tax portal (upload only, not submit)
- Advance tax computation and challan generation
- Surcharge above 15% (incomes above ₹2 crore)
- OCR / scanned document support
- Mobile app
- Server-side processing of any kind
---
 
## 9. Tech Stack
 
| Layer | Technology | Notes |
|---|---|---|
| Frontend | React (single page) | Vite build |
| File parsing — Excel | SheetJS (xlsx) | Client-side, no upload to server |
| File parsing — PDF | PDF.js | Client-side text extraction; reject if image-based |
| File parsing — JSON | Native JS | CAMS and KFintech formats handled by single parser |
| Broker detection | Rule-based header matching | Zerodha, Groww, Upstox signatures; AI only as fallback |
| AI fallback | Anthropic API (claude-sonnet-4-20250514) | Anonymised structural metadata only — see Section 5 |
| AI call logging | localStorage (`itr_utility_ai_log`) | Append-only, user-exportable |
| Tax computation | Pure JavaScript | Deterministic — zero AI involvement |
| ITR XML generation | JavaScript string builder | Schema: AY 2026-27 ITR-3 XSD from incometax.gov.in |
| Local persistence | Browser localStorage | Namespaced session key, cleared post-deadline |
| Output — PDF | jsPDF | Client-side generation |
| Output — XML | Native JS | Downloaded as .xml file |
| Hosting | Static (Vercel / Netlify) | No backend — all processing client-side |
 
---
 
## 10. User Flow
 
```
1.  Land on utility — check localStorage for existing session
    ├── Session found → prompt: Resume or Start fresh
    └── No session → proceed to upload
 
2.  Upload screen — user uploads 3 files:
    ├── Broker Tax P&L (.xlsx)
    ├── Form 16 (.pdf)
    └── MF Statement (.json or .pdf)
 
3.  Validation pass — detect broker, detect scanned PDFs, validate file types
    └── Any error → surface inline, block progress until resolved
 
4.  Parsing — client-side extraction from all 3 files
    ├── SheetJS parses Excel → broker auto-detection
    │   └── Unknown broker → AI Call Type 1 (headers only, logged)
    ├── PDF.js extracts Form 16 text → field mapping
    │   └── Ambiguous labels → AI Call Type 2 (labels only, logged)
    └── JSON/PDF.js parses MF statement (no AI)
 
5.  If any AI call was made:
    ├── Show banner: "AI assisted parsing — no financial data was sent"
    └── Prompt user thumbs up/down on result accuracy
 
6.  Tax engine — deterministic JS computation (no AI)
    ├── Income heads → loss set-off → carry forward
    ├── Slab tax + special rates + cess + surcharge
    └── Net payable / refund
 
7.  Session saved to localStorage (including AI call log)
 
8.  Results screen — schedule-wise summary displayed
    └── All warnings surfaced as inline banners
 
9.  User reviews and optionally edits any value manually
    └── Tax engine recomputes on any edit; edit flagged in session
 
10. User downloads:
    ├── PDF tax summary
    └── ITR-3 XML file
 
11. User uploads XML on incometax.gov.in
    └── Portal pre-fills ITR-3 — user reviews and submits
```
 
---
 
## 11. Constraints & Assumptions
 
- User is a **resident individual** for FY 2025-26
- Only **New Tax Regime** supported in v1.0
- Broker Tax P&L must use **FIFO** cost matching — Zerodha, Groww, and Upstox all default to FIFO
- Form 16 and MF PDFs must be **text-based** (not scanned)
- CAMS and KFintech JSON statements are structurally compatible — single parser handles both
- Capital gains rates: STCG 20%, LTCG 12.5% (post-Budget 2024, applicable for full FY 2025-26)
- ITR-3 XML schema version: AY 2026-27 schema from incometax.gov.in (to be pulled at build time)
- **All processing is client-side** — no user financial data is sent to or stored on any server
- AI API calls are limited to anonymised structural metadata only — never financial values or identity data
- This is a **decision-support tool** — the user is responsible for final review before portal submission
---
 
## 12. Open Questions
 
All open questions resolved. None outstanding as of v1.2.
 
| # | Question | Resolution |
|---|---|---|
| 1 | Support Groww / Upstox in addition to Zerodha? | **Yes** — all three brokers in v1.0 via auto-detection |
| 2 | Support scanned Form 16 PDFs via OCR? | **No** — text-based only; scanned PDFs rejected with clear error |
| 3 | Generate ITR XML for direct portal upload? | **Yes** — ITR-3 XML is a primary output |
| 4 | KFintech JSON compatible with CAMS JSON? | **Yes** — single unified parser |
| 5 | Save/resume across sessions? | **Yes** — localStorage, no server storage |
 
---
 
*End of Requirements Document v1.2*