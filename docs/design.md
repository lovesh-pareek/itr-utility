# ITR Filing Utility — Design Document
**Product:** ITR-3 Tax Filing Data Preparation Utility
**For:** FY 2025-26 (AY 2026-27)
**Version:** 1.0 — Initial Design
**Date:** June 2026
**Depends on:** requirements.md v1.2

---

## Revision History

| Version | Date | Changes |
|---|---|---|
| 1.0 | June 2026 | Initial design — screens, components, state model, data flow, API boundaries |

---

## 1. Design Principles

1. **Zero server trust** — the UI must make it visually clear that all processing is local. No loading spinners that imply server calls unless an AI fallback is actually firing.
2. **Progressive disclosure** — show only what the user needs at each step. Never show all schedules at once before parsing is done.
3. **Verify over trust** — every parsed value is editable. The user is always in control of the final numbers.
4. **AI transparency** — when an AI fallback fires, a persistent visible banner appears. The user is never unaware that AI was involved.
5. **Filing-first output** — the final screen maps directly to ITR-3 portal sections. The user should be able to open the portal on one screen and follow the utility on another, field by field.

---

## 2. Screen Inventory

| Screen ID | Name | Route | Description |
|---|---|---|---|
| S01 | Landing / Resume | `/` | Entry point — resume prompt or fresh start CTA |
| S02 | Upload | `/upload` | Upload 3 files with guidance |
| S03 | Parsing Progress | `/parsing` | Live parsing status per document |
| S04 | Review & Edit | `/review` | Schedule-wise parsed values, editable |
| S05 | Tax Summary | `/summary` | Final computed tax, warnings, net payable |
| S06 | Export | `/export` | Download PDF and XML outputs |
| S07 | AI Call Log | `/settings/ai-log` | View, rate, and export AI call history |
| S08 | Settings | `/settings` | Clear session, view storage, preferences |

---

## 3. Screen Designs

---

### S01 — Landing / Resume

**Purpose:** Entry point. Detect existing session and offer resume or fresh start.

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│  ITR Filing Utility  ·  FY 2025-26 · AY 2026-27    │
│  ─────────────────────────────────────────────────  │
│                                                     │
│  [IF SESSION EXISTS]                                │
│  ┌─────────────────────────────────────────────┐   │
│  │  📄 Session found — saved 2 Jun 2026, 11:42 │   │
│  │  Zerodha P&L ✓  Form 16 ✓  MF Statement ✓  │   │
│  │                                             │   │
│  │  [ Resume session ]   [ Start fresh ]       │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  [IF NO SESSION]                                    │
│  Prepare your ITR-3 data in 3 steps.               │
│  All processing happens in your browser.           │
│  Nothing is uploaded to any server.                │
│                                                     │
│              [ Get started → ]                      │
│                                                     │
│  ─────────────────────────────────────────────────  │
│  What you'll need:                                  │
│  · Zerodha Tax P&L (.xlsx)                         │
│  · Form 16 from employer (.pdf)                    │
│  · CAMS / KFintech MF Statement (.json or .pdf)   │
│                                                     │
│  Deadline: 31 July 2026                            │
└─────────────────────────────────────────────────────┘
```

**Behaviour:**
- Session detection runs on mount — checks `itr_utility_fy2526_session` in localStorage
- "Start fresh" shows a confirmation dialog if session exists: "This will clear all saved data. Continue?"
- Deadline countdown shown if within 30 days of 31 July 2026

---

### S02 — Upload

**Purpose:** Collect the 3 required files. Guide the user on where to get each one.

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│  Step 1 of 3 — Upload your documents               │
│                                                     │
│  ┌─ 1. Broker Tax P&L ──────────────────────────┐  │
│  │  Zerodha · Groww · Upstox (.xlsx)            │  │
│  │  Where to get it: Console → Reports → Tax P&L│  │
│  │  Select FY 2025-26, Q1 to Q4                 │  │
│  │                                              │  │
│  │  [ Drop file here or click to browse ]       │  │
│  │  ✓ zerodha_tax_pl_2025_26.xlsx               │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌─ 2. Form 16 ──────────────────────────────────┐  │
│  │  From your employer (.pdf — text-based only)  │  │
│  │  Must cover AY 2026-27                        │  │
│  │                                               │  │
│  │  [ Drop file here or click to browse ]        │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  ┌─ 3. MF Capital Gains Statement ───────────────┐  │
│  │  CAMS or KFintech (.json preferred / .pdf)    │  │
│  │  camsonline.com → Mailback → Capital Gains    │  │
│  │                                               │  │
│  │  [ Drop file here or click to browse ]        │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  [ Parse documents → ]   (disabled until all 3 ✓) │
└─────────────────────────────────────────────────────┘
```

**Behaviour:**
- Each upload zone accepts only the correct file type (`.xlsx`, `.pdf`, `.json/.pdf`)
- On file select: show filename + file size, green checkmark
- Scanned PDF detection runs immediately on PDF drop — surface error inline before user proceeds
- "Parse documents" button enabled only when all 3 files are present and valid
- Broker is auto-detected when Excel is dropped — show detected broker name as a badge ("Zerodha detected ✓"). If unknown, show "Broker not recognised — will use AI assist"

---

### S03 — Parsing Progress

**Purpose:** Show live parsing status per document. Make clear what is happening locally vs what (rarely) goes to AI.

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│  Parsing your documents...                          │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  Broker Tax P&L (Zerodha)                   │  │
│  │  ████████████████████░░░░  Parsing sheets   │  │
│  │  ✓ Equity delivery  ✓ Intraday  ✓ Dividends │  │
│  │  ⚠ F&O trades detected — see warnings       │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  Form 16                                    │  │
│  │  ████████████████████████  Complete         │  │
│  │  ✓ Employer: Acme Corp  ✓ AY 2026-27        │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  MF Statement (CAMS JSON)                   │  │
│  │  ████████░░░░░░░░░░░░░░░░  Reading schemes  │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  [IF AI FALLBACK FIRES]                            │
│  ┌──────────────────────────────────────────────┐  │
│  │  ⓘ AI assist used for Form 16 field mapping │  │
│  │  Only field label text was sent — no amounts│  │
│  │  or personal data. [ View what was sent ]   │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  Computing tax...  ████████████████████  Done      │
└─────────────────────────────────────────────────────┘
```

**Behaviour:**
- Each document parses sequentially (Excel first, then PDF, then JSON/PDF)
- Progress bar per document — driven by actual parsing milestones, not fake timers
- AI fallback banner appears immediately if an AI call fires — shows call type and a "View what was sent" link that opens a modal with the anonymised payload
- After all parsing and computation complete, auto-advance to S04 after 1.5s pause
- If any parsing error occurs: show inline error on that document card, "Fix and retry" button

---

### S04 — Review & Edit

**Purpose:** Show all parsed and computed values schedule-by-schedule. Allow user to override any value. Tax recomputes on every change.

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│  Step 2 of 3 — Review your data                    │
│  ⚠ Cross-check all values against your AIS         │
│                                                     │
│  [ Schedule S ] [ Schedule BP ] [ Schedule CG ]    │
│  [ Schedule OS ] [ CYLA ] [ CFL ]                  │
│  ─────────────────────────────────────────────────  │
│                                                     │
│  ── Schedule S — Salary ─────────────────────────  │
│  Source: Form 16 · Acme Corp · TAN: MUMA12345B    │
│                                                     │
│  Gross salary               ₹ [  12,00,000  ] ✎   │
│  Standard deduction         ₹      75,000  (fixed) │
│  Professional tax           ₹ [       2,400  ] ✎   │
│  ─────────────────────────────────────────         │
│  Net taxable salary         ₹   11,22,600          │
│                                                     │
│  ── Schedule BP — Intraday (Speculative) ────────  │
│  Source: Zerodha Tax P&L · Equity Intraday sheet   │
│                                                     │
│  Speculative turnover       ₹ [    3,45,000  ] ✎   │
│  Net P&L                    ₹ [     −18,500  ] ✎   │
│  Set-off this year          ₹          0           │
│  Carry forward to AY 2027-28  ₹       18,500       │
│                                                     │
│  ...[ Schedule CG, OS, CYLA, CFL — same pattern ]  │
│                                                     │
│  ─────────────────────────────────────────────────  │
│  [ Continue to tax summary → ]                     │
└─────────────────────────────────────────────────────┘
```

**Behaviour:**
- Tab navigation across schedules — all tabs visible, user can jump to any
- Every parsed value has an edit (✎) icon — clicking opens an inline number input
- Edited values shown with a subtle amber underline to distinguish from parsed values
- On any edit: tax engine recomputes immediately, summary figures at top update live
- Source attribution shown per schedule (which document + which sheet)
- Manually added values (e.g. advance tax paid, interest income) via "+ Add" links
- Warning banners shown inline within the relevant schedule (e.g. intraday loss restriction shown within Schedule BP)

---

### S05 — Tax Summary

**Purpose:** Final computed tax breakdown. All warnings. Net payable or refund prominently displayed.

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│  Step 3 of 3 — Tax Summary                         │
│                                                     │
│  ┌─────────────┐ ┌─────────────┐ ┌──────────────┐  │
│  │ Total income│ │ Total tax   │ │ Net payable  │  │
│  │ ₹14,85,200  │ │  ₹1,82,450  │ │   ₹12,450   │  │
│  └─────────────┘ └─────────────┘ └──────────────┘  │
│                                                     │
│  ── Computation breakdown ──────────────────────── │
│  Slab-taxable income          ₹11,22,600           │
│  Tax on slab income           ₹  1,22,600           │
│  Tax on STCG @ 20%            ₹    24,000           │
│  Tax on LTCG @ 12.5%          ₹     8,750           │
│  Section 87A rebate           ₹         0           │
│  Cess @ 4%                    ₹     6,214           │
│  ─────────────────────────────────────────         │
│  Total tax payable            ₹  1,61,564           │
│  TDS deducted by employer     ₹ −1,49,114           │
│  ─────────────────────────────────────────         │
│  Net payable                  ₹    12,450           │
│                                                     │
│  ── Warnings ────────────────────────────────────  │
│  ⚠ F&O income detected. Not computed. See CA.      │
│  ⚠ ₹18,500 intraday loss — carry forward to        │
│    AY 2027-28. File before 31 July 2026.           │
│  ⓘ Filing under New Regime. 80C–80U not applicable│
│  ⓘ Cross-check against AIS before uploading XML.  │
│                                                     │
│  [ ← Edit values ]     [ Download & export → ]     │
└─────────────────────────────────────────────────────┘
```

**Behaviour:**
- Top metric cards: total income, total tax, net payable (green if refund, amber if payable)
- Full computation breakdown — every line labelled, zero-value lines shown (not hidden) for transparency
- Warnings section — all triggered warnings from Section 7 of requirements displayed here
- "Edit values" navigates back to S04 with current tab preserved
- "Download & export" navigates to S06

---

### S06 — Export

**Purpose:** Download the two output files. Final reminder to verify on portal.

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│  Your ITR-3 data is ready                          │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  📄 Tax Summary — PDF                       │  │
│  │  Full schedule-wise breakdown for records   │  │
│  │  [ Download PDF ]                           │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  📋 ITR-3 XML — AY 2026-27                  │  │
│  │  Upload this on incometax.gov.in to         │  │
│  │  pre-fill your ITR-3 return                 │  │
│  │  [ Download XML ]                           │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ── How to upload XML on the portal ─────────────  │
│  1. Go to incometax.gov.in → Login                 │
│  2. e-File → Income Tax Returns → File ITR         │
│  3. AY 2026-27 → ITR-3 → Upload XML               │
│  4. Select the downloaded .xml file                │
│  5. Review pre-filled values on portal             │
│  6. Verify against your AIS                        │
│  7. Submit and e-verify                            │
│                                                     │
│  ⚠ Review all values on the portal before         │
│  submitting. This tool is a preparation aid.       │
└─────────────────────────────────────────────────────┘
```

**Behaviour:**
- PDF generation runs client-side (jsPDF) on button click — no server call
- XML generation runs client-side on button click — validated against ITR-3 XSD before download
- If XML validation fails: show per-field errors, link back to S04 to fix
- Step-by-step portal instructions always visible — not collapsible

---

### S07 — AI Call Log

**Purpose:** Full transparency on every AI call made. Developer-facing but user-accessible.

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│  Settings → AI Call Log                            │
│                                                     │
│  Total AI calls this session: 1                    │
│  [ Export log as JSON ]                            │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │  Call #1  ·  2 Jun 2026 11:43:02            │  │
│  │  Type: form16_mapping                       │  │
│  │  Trigger: Label "Net Salary after Std Ded"  │  │
│  │           not matched by rule engine        │  │
│  │                                             │  │
│  │  Sent to AI: field label strings only       │  │
│  │  [ View anonymised payload ]                │  │
│  │                                             │  │
│  │  AI result: Mapped to → netTaxableSalary    │  │
│  │  Rule gap: Add "Net Salary after Std Ded"   │  │
│  │            as alias for netTaxableSalary    │  │
│  │                                             │  │
│  │  Was this helpful?  [ 👍 ]  [ 👎 ]          │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  [ ← Back to settings ]                            │
└─────────────────────────────────────────────────────┘
```

**Behaviour:**
- Each log entry is a card — expandable to show full anonymised payload in a code block
- Thumbs up/down sets `was_useful` field in the log entry in localStorage
- "Export log as JSON" downloads the full `itr_utility_ai_log` array
- Rule gap shown verbatim from AI response — this is the developer action item
- If zero AI calls: show "No AI calls were made this session. All parsing was handled locally."

---

### S08 — Settings

**Purpose:** Session management and preferences.

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│  Settings                                          │
│                                                     │
│  ── Session ─────────────────────────────────────  │
│  Last saved: 2 Jun 2026, 11:44                     │
│  Storage used: 42 KB (localStorage)                │
│  Auto-clear after: 31 July 2026                    │
│                                                     │
│  [ Clear session data ]                            │
│                                                     │
│  ── AI Usage ────────────────────────────────────  │
│  AI calls this session: 1                          │
│  [ View AI call log → ]                            │
│                                                     │
│  ── About ───────────────────────────────────────  │
│  ITR Filing Utility v1.0                           │
│  For FY 2025-26 (AY 2026-27)                      │
│  All processing is client-side.                    │
│  No financial data is stored on any server.        │
└─────────────────────────────────────────────────────┘
```

---

## 4. Component Breakdown

### 4.1 Shared / Layout Components

| Component | Description |
|---|---|
| `AppShell` | Top nav bar, progress stepper (steps 1–3), settings icon |
| `StepProgress` | Visual progress indicator — Upload → Review → Summary |
| `WarningBanner` | Reusable inline warning card — accepts severity (info / warn / error) and message |
| `AICallBanner` | Persistent banner shown when any AI call fires — links to S07 |
| `MetricCard` | Summary number card — label + large value + optional colour state |
| `EditableField` | Parsed value with ✎ edit toggle — shows amber underline when manually overridden |
| `ScheduleTab` | Tab component for Schedule S / BP / CG / OS / CYLA / CFL navigation |

### 4.2 Upload Components

| Component | Description |
|---|---|
| `FileDropZone` | Drag-and-drop + click-to-browse zone — accepts specific file types |
| `FileCard` | Displays uploaded file name, size, broker badge, validation state |
| `BrokerBadge` | Shows detected broker name after Excel is dropped |
| `ScannedPDFError` | Inline error shown when image-based PDF is detected |

### 4.3 Parsing Components

| Component | Description |
|---|---|
| `ParseProgressCard` | Per-document parsing status — progress bar + milestone checkmarks |
| `AIPayloadModal` | Modal showing anonymised AI payload — triggered from AICallBanner |
| `ParseErrorCard` | Inline error per document — shows specific failure reason + retry |

### 4.4 Review Components

| Component | Description |
|---|---|
| `ScheduleS` | Salary schedule — gross, deductions, net |
| `ScheduleBP` | Intraday speculative income — turnover, P&L, carry forward |
| `ScheduleCG` | Capital gains — STCG/LTCG per category, losses, exemptions |
| `ScheduleOS` | Other sources — dividends, interest |
| `ScheduleCYLA` | Loss set-off matrix — current year adjustment |
| `ScheduleCFL` | Carry forward loss table — by type and AY |
| `SourceTag` | Small tag showing which document + sheet a value came from |

### 4.5 Summary Components

| Component | Description |
|---|---|
| `TaxComputationTable` | Full line-by-line tax breakdown |
| `WarningList` | All triggered warnings rendered as a stacked list |
| `NetPayableCard` | Prominent net payable or refund — green for refund, amber for payable |

### 4.6 Export Components

| Component | Description |
|---|---|
| `PDFExportButton` | Triggers client-side jsPDF generation and download |
| `XMLExportButton` | Triggers XML build, validates against XSD, downloads or shows errors |
| `PortalSteps` | Static numbered instructions for portal upload |

---

## 5. State Model

All application state lives in a single React context (`AppContext`). No Redux needed for v1.0.

### 5.1 State Shape

```typescript
type AppState = {

  // Session
  sessionId: string                  // UUID, generated on first load
  savedAt: string | null             // ISO timestamp of last localStorage write
  step: 'upload' | 'parsing' | 'review' | 'summary' | 'export'

  // Uploaded files (File objects — not persisted to localStorage)
  files: {
    brokerPL: File | null
    form16: File | null
    mfStatement: File | null
  }

  // Parsed raw data (persisted)
  parsed: {
    broker: BrokerData | null        // normalised across Zerodha / Groww / Upstox
    form16: Form16Data | null
    mfStatement: MFData | null
    detectedBroker: 'zerodha' | 'groww' | 'upstox' | 'unknown' | null
  }

  // Computed schedules (derived — recomputed on any edit)
  schedules: {
    S: ScheduleS
    BP: ScheduleBP
    CG: ScheduleCG
    OS: ScheduleOS
    CYLA: ScheduleCYLA
    CFL: ScheduleCFL
  }

  // Tax computation output
  tax: TaxComputation

  // Manual overrides (persisted — keyed by field path)
  overrides: Record<string, number>

  // Warnings (derived — recomputed after each computation)
  warnings: Warning[]

  // AI call log (persisted)
  aiCallLog: AICallEntry[]

  // Parse state
  parseStatus: {
    brokerPL: 'idle' | 'parsing' | 'done' | 'error'
    form16: 'idle' | 'parsing' | 'done' | 'error'
    mfStatement: 'idle' | 'parsing' | 'done' | 'error'
    errors: Record<string, string>
  }

}
```

### 5.2 State Persistence Rules

| State slice | Persisted to localStorage | Notes |
|---|---|---|
| `step` | Yes | Resume lands user on correct step |
| `files` | No | File objects cannot be serialised — user re-uploads on resume |
| `parsed` | Yes | Core parsed data persisted |
| `schedules` | Yes | Avoid recomputing on resume |
| `tax` | Yes | Persisted for resume |
| `overrides` | Yes | Manual edits must survive resume |
| `warnings` | No | Recomputed from state on load |
| `aiCallLog` | Yes | Append-only, never cleared automatically until deadline |
| `parseStatus` | No | Resets on resume — user sees upload screen for files |

### 5.3 Recomputation Triggers

Tax engine (`computeTax()`) re-runs whenever:
- Any value in `parsed` changes
- Any value in `overrides` changes

Warnings (`computeWarnings()`) re-run whenever:
- `schedules` or `tax` changes

---

## 6. Data Flow

```
Files (browser memory)
        │
        ▼
┌───────────────────────────────────────────┐
│           CLIENT-SIDE PARSERS             │
│  SheetJS → BrokerParser                   │
│  PDF.js  → Form16Parser                   │
│  JSON    → MFStatementParser              │
└───────────────────────────────────────────┘
        │                    │
        │ parse success       │ parse ambiguous
        │                    ▼
        │         ┌─────────────────────┐
        │         │  AI FALLBACK        │
        │         │  (anonymised meta   │
        │         │   only — no values) │
        │         │  → logged to        │
        │         │    aiCallLog        │
        │         └─────────────────────┘
        │                    │
        ▼                    ▼
┌───────────────────────────────────────────┐
│           NORMALISED PARSED DATA          │
│  BrokerData / Form16Data / MFData         │
└───────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────┐
│           TAX ENGINE (pure JS)            │
│  computeSchedules() → computeTax()        │
│  computeWarnings()                        │
│  No AI. No network. Deterministic.        │
└───────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────┐
│           OUTPUT GENERATORS               │
│  generatePDF()  →  .pdf download          │
│  generateXML()  →  .xml download          │
│  (both client-side, no server)            │
└───────────────────────────────────────────┘
```

---

## 7. AI Call Boundary — Detailed Contract

This section is the authoritative definition of what may and may not cross the AI boundary.

### 7.1 Call Type 1 — Broker Format Detection

```typescript
// Payload sent to Anthropic API
type BrokerDetectionPayload = {
  sheetNames: string[]               // e.g. ["Sheet1", "Equity_Summary"]
  columnHeaders: Record<string, string[]>  // sheet name → headers only
  // Example:
  // { "Sheet1": ["Date", "Scrip", "Qty", "Trade Price", "Net P&L"] }
}

// What must NEVER be included
// - Any row data (trade values, prices, P&L figures)
// - Scrip / company names
// - Any numeric values whatsoever
```

### 7.2 Call Type 2 — Form 16 Field Mapping

```typescript
// Payload sent to Anthropic API
type Form16MappingPayload = {
  extractedLabels: string[]          // label strings only
  // Example:
  // ["Gross Remuneration", "Less: Exemptions u/s 10", "Net Salary after Std Ded"]
}

// What must NEVER be included
// - Any numeric value (salary amounts, TDS, deductions)
// - PAN, TAN, Aadhaar
// - Employer name, employee name
// - Any other personally identifiable information
```

### 7.3 AI Response Contract

The AI response for both call types must include a `rule_gap` field:

```json
{
  "result": { ... },
  "rule_gap": "Add 'Net Salary after Std Ded' as a recognised alias for the netTaxableSalary field in Form16Parser rule set"
}
```

The `rule_gap` value is stored verbatim in the AI call log entry and surfaced in S07 as a developer action item.

---

## 8. Parser Specifications

### 8.1 Broker Parser — Sheet Signatures

| Broker | Detection signal | Key sheets |
|---|---|---|
| Zerodha | Sheet named "Equity" + column "Scrip" + column "Trade Type" | Equity, Equity Intraday, Dividends |
| Groww | Sheet named "Capital Gains" + column "Transaction Type" | Capital Gains, Dividends |
| Upstox | Sheet named "Tradebook" + column "instrument_type" | Tradebook (delivery + intraday differentiated by column) |
| Unknown | No match → AI Call Type 1 | — |

### 8.2 Form 16 Parser — Known Field Aliases

Known label patterns (rule-based, no AI needed for these):

| Standard field | Recognised label patterns |
|---|---|
| `grossSalary` | "Gross Salary", "Total Salary", "Gross Remuneration" |
| `standardDeduction` | "Standard Deduction u/s 16(ia)", "Std Deduction" |
| `professionalTax` | "Professional Tax u/s 16(iii)", "Prof Tax" |
| `netTaxableSalary` | "Income chargeable under the head Salaries" |
| `tdsDeducted` | "Total Tax Deducted at Source", "TDS u/s 192" |
| `pan` | "PAN of Employee", "Employee PAN" |
| `tanEmployer` | "TAN of Employer", "Employer TAN" |

If extracted label does not match any pattern → AI Call Type 2.

### 8.3 MF Statement Parser — JSON Structure (CAMS / KFintech)

Both CAMS and KFintech produce JSON with this top-level structure:

```json
{
  "investor_info": { "name": "", "pan": "", "email": "" },
  "folios": [
    {
      "folio_number": "",
      "fund_house": "",
      "schemes": [
        {
          "scheme_name": "",
          "isin": "",
          "transactions": [
            {
              "date": "",
              "type": "purchase | redemption | switch_in | switch_out | stp",
              "units": 0,
              "nav": 0,
              "amount": 0
            }
          ]
        }
      ]
    }
  ]
}
```

Parser computes STCG / LTCG per redemption using FIFO unit matching against purchase transactions. Equity-oriented vs debt-oriented classification is based on scheme ISIN prefix lookup table (maintained in a static JSON file in the codebase).

---

## 9. XML Output Specification

### 9.1 ITR-3 XML Structure (AY 2026-27)

The generated XML must conform to the ITR-3 XSD published by the Income Tax Department for AY 2026-27. Key nodes populated by this utility:

```xml
<ITR>
  <ITR3>
    <PersonalInfo>
      <PAN><!-- from Form 16 --></PAN>
      <AssessmentYear>2026-27</AssessmentYear>
    </PersonalInfo>
    <FilingStatus>
      <ReturnFileSec>11</ReturnFileSec>        <!-- 139(1) on time -->
      <NewTaxRegime>Y</NewTaxRegime>
    </FilingStatus>
    <ScheduleS>
      <!-- salary schedule values -->
    </ScheduleS>
    <ScheduleBP>
      <!-- speculative business P&L -->
    </ScheduleBP>
    <ScheduleCG>
      <Schedule111A> <!-- STCG --> </Schedule111A>
      <Schedule112A> <!-- LTCG --> </Schedule112A>
    </ScheduleCG>
    <ScheduleOS>
      <!-- dividends, interest -->
    </ScheduleOS>
    <ScheduleCYLA>
      <!-- current year loss set-off -->
    </ScheduleCYLA>
    <ScheduleCFL>
      <!-- carry forward losses -->
    </ScheduleCFL>
    <ScheduleTaxPaid>
      <TDS1> <!-- employer TDS --> </TDS1>
    </ScheduleTaxPaid>
    <TaxComputation>
      <!-- final tax figures -->
    </TaxComputation>
  </ITR3>
</ITR>
```

### 9.2 XML Validation

Before download, the generated XML is validated against the AY 2026-27 ITR-3 XSD using a client-side XML validator. Validation errors are surfaced as field-level messages with links back to S04 for correction.

---

## 10. Error States

| Error | Screen | Handling |
|---|---|---|
| Scanned PDF uploaded | S02 | Inline error on file card — block progress |
| Unknown broker | S02 | Warning badge — AI fallback will be used |
| Excel parse failure | S03 | Error card — "Fix and retry" button |
| Form 16 parse failure | S03 | Error card with specific failure reason |
| MF statement parse failure | S03 | Error card — suggest switching to JSON |
| AI call failure (network) | S03 | Error card — "AI assist unavailable. Please select broker manually." |
| F&O detected | S04 / S05 | Warning banner — values excluded, user notified |
| XML validation failure | S06 | Per-field errors — link back to S04 |
| localStorage full | Any | Toast: "Storage full — session cannot be saved. Clear space and reload." |

---

## 11. Open Design Questions

| # | Question | Impact |
|---|---|---|
| D1 | Should S04 show scrip-level detail (each trade) or only schedule totals? | Significant — scrip detail helps verify against AIS but adds UI complexity |
| D2 | Should the PDF export mirror the ITR-3 schedule structure or be a simpler summary? | Medium — portal-mapped PDF is more useful but harder to generate |
| D3 | Should the user be able to add prior year carried-forward losses as manual input? | Medium — important for users with losses from AY 2025-26 |
| D4 | Should S05 show a comparison of tax under Old vs New Regime for reference? | Low — out of scope for v1.0 computation but useful display |

---

*End of Design Document v1.0*
