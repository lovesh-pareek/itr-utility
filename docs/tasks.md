# ITR Filing Utility — Task Breakdown
**Product:** ITR-3 Tax Filing Data Preparation Utility
**For:** FY 2025-26 (AY 2026-27)
**Version:** 1.0
**Date:** June 2026
**Depends on:** requirements.md v1.2 · design.md v1.0

---

## How This File Works

This file is the single source of truth for build progress.

**For the human:** Point an AI agent at this file to start or resume work. The AI reads all task statuses, determines what is done, what is in progress, and what is next — then works accordingly. You control when work starts.

**For the AI agent:** On every session start, read this entire file first. Then:
1. Find all tasks with `[status:wip]` — these were interrupted. Resume them first.
2. Find all `[status:open]` tasks in the current wave where dependencies are met.
3. Update task status to `[status:wip]` before starting work on it.
4. Update task status to `[status:completed]` immediately when done.
5. Update the session block at the top of this file on every status change.
6. Never start a task in Wave N+1 until all tasks in Wave N are `[status:completed]`.
7. Parallel tasks within a wave (marked `[parallel:yes]`) can be worked simultaneously in separate contexts.

**Status values:**
- `[status:open]` — not started
- `[status:wip]` — in progress (set by AI when starting)
- `[status:completed]` — done (set by AI when finished)
- `[status:blocked]` — cannot proceed (set by AI if a blocker is found — add reason)

---

## Session Block

> AI agent: update this block at the start and end of every session.

```
last_session_start: June 2026
last_session_end:   June 2026
last_task_worked:   T59
current_wave:       9 (complete)
completed_tasks:    74 / 74
notes:              All 74 tasks completed across 9 waves. 94 unit tests passing. Zero TypeScript errors. Build clean. v1.0.0 tagged.
```

---

## Wave Summary

| Wave | Name | Tasks | Parallel tracks | Gate |
|---|---|---|---|---|
| 1 | Project scaffold & tooling | 6 | No | All 6 completed |
| 2 | Core parsers | 14 | Yes — 3 parallel tracks | All 14 completed |
| 3 | Tax engine | 10 | Yes — 2 parallel tracks | All 10 completed |
| 4 | UI — screens & components | 14 | Yes — 2 parallel tracks | All 14 completed |
| 5 | Output generation | 6 | Yes — 2 parallel tracks | All 6 completed |
| 6 | AI fallback & logging | 4 | No | All 4 completed |
| 7 | Integration & wiring | 6 | No | All 6 completed |
| 8 | Testing & validation | 8 | Yes — 2 parallel tracks | All 8 completed |
| 9 | Polish & hardening | 6 | No | All 6 completed |

**Total tasks: 74**

---

## Wave 1 — Project Scaffold & Tooling

**Goal:** Working React app shell, routing, state context, localStorage plumbing, and linting. No business logic yet — just the skeleton everything else plugs into.

**Gate:** `npm run dev` serves the app. All 8 routes render placeholder screens. AppContext initialises. localStorage read/write confirmed working.

---

### T01 · Initialise React project [parallel:no]
```
status:       [status:completed]
estimate:     1h
depends_on:   —
blocks:       T02, T03
```
- Scaffold with Vite + React + TypeScript
- Install core dependencies: `react-router-dom`, `zustand` or React Context, `tailwindcss`
- Configure `tsconfig.json`, `vite.config.ts`
- Set up `eslint` + `prettier` with consistent rules
- Confirm `npm run dev` runs without errors
- Commit: `chore: project scaffold`

---

### T02 · Configure routing [parallel:no]
```
status:       [status:completed]
estimate:     1h
depends_on:   T01
blocks:       T04
```
- Set up `react-router-dom` with routes for all 8 screens:
  - `/` → S01 Landing
  - `/upload` → S02 Upload
  - `/parsing` → S03 Parsing Progress
  - `/review` → S04 Review & Edit
  - `/summary` → S05 Tax Summary
  - `/export` → S06 Export
  - `/settings/ai-log` → S07 AI Call Log
  - `/settings` → S08 Settings
- Each route renders a named placeholder component
- Navigation between placeholders confirmed working
- Commit: `feat: routing scaffold`

---

### T03 · AppContext and state shape [parallel:no]
```
status:       [status:completed]
estimate:     2h
depends_on:   T01
blocks:       T05, T06
```
- Implement `AppContext` with the full state shape from design.md Section 5.1
- Define all TypeScript types: `AppState`, `BrokerData`, `Form16Data`, `MFData`, `ScheduleS/BP/CG/OS/CYLA/CFL`, `TaxComputation`, `Warning`, `AICallEntry`
- Implement `useAppContext` hook
- Wire context provider into app root
- All state slices initialise to null / empty correctly
- Commit: `feat: app context and state types`

---

### T04 · localStorage persistence layer [parallel:no]
```
status:       [status:completed]
estimate:     2h
depends_on:   T02, T03
blocks:       T05
```
- Implement `useSessionStorage` hook — reads/writes `itr_utility_fy2526_session`
- Implement `useAILog` hook — reads/writes `itr_utility_ai_log` (append-only)
- Serialisation: persist only the slices defined in design.md Section 5.2 persistence table
- Deserialisation: restore state on app load, skip unpersistable slices (files, parseStatus, warnings)
- Auto-clear logic: if current date > 31 July 2026, clear session on load
- Unit test: write → reload → confirm values restored
- Commit: `feat: localStorage persistence layer`

---

### T05 · AppShell and navigation components [parallel:no]
```
status:       [status:completed]
estimate:     1h
depends_on:   T03, T04
blocks:       T06
```
- Implement `AppShell` — top bar with app name, AY label, settings icon
- Implement `StepProgress` — 3-step progress indicator (Upload → Review → Summary)
  - Steps highlight based on current route
- Implement `WarningBanner` component — accepts `severity` and `message` props
- Implement `MetricCard` component — label + large value + colour state prop
- Commit: `feat: app shell and shared components`

---

### T06 · Session resume flow [parallel:no]
```
status:       [status:completed]
estimate:     1h
depends_on:   T04, T05
blocks:       Wave 2
```
- On app load: check localStorage for existing session
- If session found: show resume prompt on S01 with saved timestamp and which files were previously uploaded (names only)
- "Resume" — restore state, navigate to last active step
- "Start fresh" — show confirmation dialog, clear localStorage, reset state
- If no session: show standard landing CTA
- Deadline countdown: if within 30 days of 31 July 2026, show days-remaining badge
- Commit: `feat: session resume flow`

---
---

## Wave 2 — Core Parsers

**Goal:** All three document parsers working and producing normalised output. Each parser is independently testable with sample files.

**Gate:** Unit tests pass for each parser using sample documents. Normalised output matches the TypeScript types defined in T03.

**Parallel tracks:**
- **Track A** — Broker P&L parser (T07–T10)
- **Track B** — Form 16 parser (T11–T13)
- **Track C** — MF Statement parser (T14–T16)

Tracks A, B, C have no dependencies on each other and can run in parallel.

---

### TRACK A — Broker P&L Parser

### T07 · SheetJS integration and broker detection [parallel:yes · track:A]
```
status:       [status:completed]
estimate:     1h
depends_on:   Wave 1 complete
blocks:       T08
```
- Install and configure `SheetJS (xlsx)`
- Implement `detectBroker(workbook)` — reads sheet names and column headers
- Broker signature rules per design.md Section 8.1:
  - Zerodha: sheet "Equity" + column "Scrip" + column "Trade Type"
  - Groww: sheet "Capital Gains" + column "Transaction Type"
  - Upstox: sheet "Tradebook" + column "instrument_type"
- Returns: `'zerodha' | 'groww' | 'upstox' | 'unknown'`
- Unit test: load sample Excel for each broker → confirm correct detection
- Commit: `feat: broker detection`

---

### T08 · Zerodha P&L parser [parallel:yes · track:A]
```
status:       [status:completed]
estimate:     2h
depends_on:   T07
blocks:       T10
```
- Parse "Equity" sheet → extract delivery trades: scrip, buy date, sell date, buy price, sell price, quantity, net gain/loss
- Calculate STCG (holding ≤ 12 months) and LTCG (holding > 12 months) per trade
- Parse "Equity Intraday" sheet → extract total turnover (absolute P&L sum), net speculative P&L
- Parse "Dividends" sheet → extract per-scrip dividend, total dividend income
- Detect if F&O / Currency / Commodity sheets have data → set `hasFnO: boolean` flag
- Output: normalised `BrokerData` object
- Unit test with sample Zerodha Tax P&L Excel
- Commit: `feat: zerodha parser`

---

### T09 · Groww and Upstox parsers [parallel:yes · track:A]
```
status:       [status:completed]
estimate:     2h
depends_on:   T07
blocks:       T10
```
- Implement Groww parser — single sheet, differentiate delivery vs intraday by "Transaction Type" column
- Implement Upstox parser — Tradebook sheet, differentiate by "instrument_type" column
- Both parsers output the same normalised `BrokerData` shape as T08
- Unit tests with sample files for each broker
- Commit: `feat: groww and upstox parsers`

---

### T10 · Broker parser router and F&O warning [parallel:yes · track:A]
```
status:       [status:completed]
estimate:     1h
depends_on:   T08, T09
blocks:       Wave 3
```
- Implement `parseBrokerPL(file)` — detects broker, routes to correct parser
- If broker is `unknown` → do not parse, set `parseStatus.brokerPL = 'needs-ai'` (AI fallback handled in Wave 6)
- If `hasFnO === true` → add F&O warning to warnings array
- Expose as a single async function used by the parsing screen
- Commit: `feat: broker parser router`

---

### TRACK B — Form 16 Parser

### T11 · PDF.js integration and scanned PDF detection [parallel:yes · track:B]
```
status:       [status:completed]
estimate:     1h
depends_on:   Wave 1 complete
blocks:       T12
```
- Install and configure `PDF.js`
- Implement `extractPDFText(file)` → returns array of text strings per page
- Implement `isScannedPDF(extractedText)` — heuristic: if total extracted text length < 200 chars across all pages, classify as scanned
- If scanned: set `parseStatus.form16 = 'error'` with message "Scanned PDF detected"
- Unit test: text PDF → extracts content; image PDF → correctly flagged
- Commit: `feat: pdf.js integration and scanned detection`

---

### T12 · Form 16 field extractor [parallel:yes · track:B]
```
status:       [status:completed]
estimate:     2h
depends_on:   T11
blocks:       T13
```
- Implement `extractForm16Fields(text)` — rule-based label matching against alias table in design.md Section 8.2
- Extract: `grossSalary`, `standardDeduction`, `professionalTax`, `netTaxableSalary`, `tdsDeducted`, `pan`, `tanEmployer`, `employerName`, `assessmentYear`
- For each field: if no alias matches → mark field as `unresolved` (AI fallback in Wave 6)
- Validate: `assessmentYear` must equal "2026-27" — error if mismatch
- Output: `Form16Data` object with `unresolved` array for AI fallback
- Unit test with sample Form 16 PDF
- Commit: `feat: form 16 field extractor`

---

### T13 · Form 16 parser integration [parallel:yes · track:B]
```
status:       [status:completed]
estimate:     1h
depends_on:   T12
blocks:       Wave 3
```
- Implement `parseForm16(file)` — wraps T11 + T12 into single async function
- Handles: scanned PDF error, AY mismatch error, partial parse with unresolved fields
- Sets `parseStatus.form16` to `'done'`, `'error'`, or `'needs-ai'` accordingly
- Commit: `feat: form 16 parser integration`

---

### TRACK C — MF Statement Parser

### T14 · CAMS / KFintech JSON parser [parallel:yes · track:C]
```
status:       [status:completed]
estimate:     2h
depends_on:   Wave 1 complete
blocks:       T15
```
- Implement `parseMFJson(file)` — parse the unified CAMS/KFintech JSON structure (design.md Section 8.3)
- For each redemption transaction: match against prior purchases using FIFO unit matching
- Calculate holding period per lot → classify as STCG (≤ 12 months) or LTCG (> 12 months)
- Classify scheme as equity-oriented or debt-oriented using ISIN prefix lookup table
- Aggregate: total equity STCG, total equity LTCG, total debt gains (slab rate)
- Output: `MFData` object
- Unit test with sample CAMS JSON and KFintech JSON
- Commit: `feat: mf json parser`

---

### T15 · MF PDF fallback parser [parallel:yes · track:C]
```
status:       [status:completed]
estimate:     2h
depends_on:   T11, T14
blocks:       T16
```
- Implement `parseMFPdf(file)` — extract text using PDF.js, parse into `MFData`
- Text patterns to match: scheme name, transaction date, units, NAV, amount, transaction type
- Apply same FIFO matching and STCG/LTCG classification as T14
- Surface warning: "JSON format recommended for higher accuracy"
- Unit test with sample CAMS PDF statement
- Commit: `feat: mf pdf fallback parser`

---

### T16 · MF parser router [parallel:yes · track:C]
```
status:       [status:completed]
estimate:     30m
depends_on:   T14, T15
blocks:       Wave 3
```
- Implement `parseMFStatement(file)` — detects JSON vs PDF by file type, routes accordingly
- Sets `parseStatus.mfStatement` to `'done'` or `'error'`
- Commit: `feat: mf parser router`

---
---

## Wave 3 — Tax Engine

**Goal:** Pure JavaScript tax computation. Deterministic. No AI. No network. Takes normalised parsed data and produces all schedule values and final tax figures.

**Gate:** All tax engine unit tests pass including edge cases — zero income, max exemptions, loss carry-forward, surcharge threshold.

**Parallel tracks:**
- **Track A** — Schedule computation (T17–T20)
- **Track B** — Tax computation and warnings (T21–T22)

---

### TRACK A — Schedule Computation

### T17 · Schedule S and Schedule OS computation [parallel:yes · track:A]
```
status:       [status:completed]
estimate:     1h
depends_on:   Wave 2 complete
blocks:       T19
```
- Implement `computeScheduleS(form16Data, overrides)`:
  - Net taxable salary = Gross − ₹75,000 − Professional tax
  - Apply any manual overrides
- Implement `computeScheduleOS(brokerData, overrides)`:
  - Total dividend income
  - Total interest income (manual input)
- Unit tests: standard case, override case, zero salary
- Commit: `feat: schedule S and OS computation`

---

### T18 · Schedule CG computation [parallel:yes · track:A]
```
status:       [status:completed]
estimate:     2h
depends_on:   Wave 2 complete
blocks:       T19
```
- Implement `computeScheduleCG(brokerData, mfData, overrides)`:
  - STCG equity delivery (Sec 111A)
  - STCG equity MF (Sec 111A)
  - LTCG equity delivery (Sec 112A)
  - LTCG equity MF (Sec 112A)
  - Debt MF gains (slab rate)
  - Total gross capital gains
- Apply ₹1.25L LTCG exemption
- Unit tests: LTCG below exemption, LTCG above exemption, mixed gains and losses
- Commit: `feat: schedule CG computation`

---

### T19 · Schedule CYLA — loss set-off [parallel:yes · track:A]
```
status:       [status:completed]
estimate:     2h
depends_on:   T17, T18
blocks:       T20
```
- Implement `computeScheduleCYLA(scheduleBP, scheduleCG)`:
  - Intraday loss → set off only against intraday profit (never salary, never CG)
  - STCL → set off against STCG first, then LTCG
  - LTCL → set off against LTCG only
- Output: adjusted net figures per income head after set-off
- Output: unabsorbed loss amounts per type
- Unit tests: intraday loss only, capital loss only, both, no losses
- Commit: `feat: schedule CYLA loss set-off`

---

### T20 · Schedule CFL — carry forward and Schedule BP [parallel:yes · track:A]
```
status:       [status:completed]
estimate:     1h
depends_on:   T19
blocks:       T21
```
- Implement `computeScheduleBP(brokerData, overrides)`:
  - Speculative turnover (absolute sum of intraday P&L)
  - Net speculative profit or loss
- Implement `computeScheduleCFL(cylaOutput)`:
  - Unabsorbed intraday loss → carry forward up to 4 years, label AY 2027-28
  - Unabsorbed capital loss → carry forward up to 8 years, label AY 2027-28
- Unit tests: partial set-off with remainder, full set-off with zero carry forward
- Commit: `feat: schedule BP and CFL carry forward`

---

### TRACK B — Tax Computation and Warnings

### T21 · Tax computation engine [parallel:yes · track:B]
```
status:       [status:completed]
estimate:     2h
depends_on:   T19, T20
blocks:       T22
```
- Implement `computeTax(schedules)`:
  - Aggregate slab-taxable income: net salary + intraday profit + debt MF gains + other sources
  - New Regime slab tax using rate table from requirements.md Section 4.4
  - Section 87A rebate: zero slab tax if slab income ≤ ₹12,00,000
  - STCG tax: net STCG × 20%
  - LTCG tax: taxable LTCG (above ₹1.25L) × 12.5%
  - Surcharge: 10% if total income ₹50L–₹1Cr; 15% if ₹1Cr–₹2Cr
  - Cess: 4% on (slab tax + STCG tax + LTCG tax + surcharge)
  - Net payable = total tax − TDS − advance tax
- Output: `TaxComputation` object with every line itemised
- Unit tests: below rebate threshold, above threshold, with surcharge, refund case
- Commit: `feat: tax computation engine`

---

### T22 · Warnings engine [parallel:yes · track:B]
```
status:       [status:completed]
estimate:     1h
depends_on:   T21
blocks:       Wave 4
```
- Implement `computeWarnings(state)` — evaluates all 10 warning conditions from requirements.md Section 7
- Each warning: `{ id, severity: 'info'|'warn'|'error', message, scheduleRef? }`
- Returns array of triggered warnings only
- Unit tests: each warning condition triggered individually, multiple warnings together
- Commit: `feat: warnings engine`

---
---

## Wave 4 — UI Screens and Components

**Goal:** All 8 screens implemented and wired to AppContext. User can navigate the full flow end-to-end with real parsed data.

**Gate:** Full user flow navigable — upload 3 files → parse → review all schedules → see tax summary → reach export screen. All warnings display correctly.

**Parallel tracks:**
- **Track A** — Upload and parsing screens (T23–T26)
- **Track B** — Review, summary, export and settings screens (T27–T32)

---

### TRACK A — Upload and Parsing Screens

### T23 · FileDropZone and FileCard components [parallel:yes · track:A]
```
status:       [status:completed]
estimate:     1h
depends_on:   Wave 3 complete
blocks:       T24
```
- Implement `FileDropZone` — drag-and-drop + click-to-browse, accepts specific MIME types
- Implement `FileCard` — filename, file size, status icon (pending / valid / error)
- Implement `BrokerBadge` — shows detected broker name after Excel drop
- Implement `ScannedPDFError` — inline error card for image PDFs
- Commit: `feat: file upload components`

---

### T24 · S02 Upload screen [parallel:yes · track:A]
```
status:       [status:completed]
estimate:     2h
depends_on:   T23
blocks:       T25
```
- Implement S02 layout per design.md S02 wireframe
- Three upload zones: Broker P&L, Form 16, MF Statement
- On Excel drop: run broker detection, show BrokerBadge or "unknown broker" warning
- On PDF drop: run scanned PDF detection, show ScannedPDFError if flagged
- "Parse documents" button: disabled until all 3 files valid
- On click: navigate to S03, trigger parsing pipeline
- Commit: `feat: S02 upload screen`

---

### T25 · ParseProgressCard component [parallel:yes · track:A]
```
status:       [status:completed]
estimate:     1h
depends_on:   T23
blocks:       T26
```
- Implement `ParseProgressCard` — per-document status card
- Progress bar driven by `parseStatus` from AppContext (not fake timer)
- Milestone checkmarks: e.g. "Equity ✓ Intraday ✓ Dividends ✓"
- Error state: shows specific failure reason + "Fix and retry" button
- Implement `AICallBanner` — appears when any AI call fires, links to S07
- Implement `AIPayloadModal` — shows anonymised payload in code block
- Commit: `feat: parse progress components`

---

### T26 · S03 Parsing progress screen [parallel:yes · track:A]
```
status:       [status:completed]
estimate:     1h
depends_on:   T25
blocks:       Wave 4 Track B
```
- Implement S03 layout — three ParseProgressCards
- Orchestrate parsing pipeline: broker → form16 → MF (sequential)
- Update `parseStatus` in AppContext as each milestone completes
- On all complete: save session to localStorage, auto-advance to S04 after 1.5s
- On any error: halt pipeline, show error card, expose retry
- Commit: `feat: S03 parsing screen`

---

### TRACK B — Review, Summary, Export, Settings Screens

### T27 · EditableField and SourceTag components [parallel:yes · track:B]
```
status:       [status:completed]
estimate:     1h
depends_on:   Wave 3 complete
blocks:       T28
```
- Implement `EditableField` — displays parsed value, ✎ toggle opens inline number input
- On edit: write to `overrides` in AppContext, trigger tax recomputation
- Amber underline on manually overridden values
- Revert to parsed value option (× icon when in override state)
- Implement `SourceTag` — small tag showing document + sheet source
- Commit: `feat: editable field and source tag components`

---

### T28 · S04 Review screen — schedule components [parallel:yes · track:B]
```
status:       [status:completed]
estimate:     2h
depends_on:   T27
blocks:       T29
```
- Implement all 6 schedule components: `ScheduleS`, `ScheduleBP`, `ScheduleCG`, `ScheduleOS`, `ScheduleCYLA`, `ScheduleCFL`
- Each reads from `schedules` in AppContext, uses `EditableField` for editable values
- Each shows `SourceTag` per value
- Inline warning banners within relevant schedules (e.g. intraday loss restriction in ScheduleBP)
- Implement `ScheduleTab` — tab navigation across all 6 schedules
- Commit: `feat: schedule components`

---

### T29 · S04 Review screen layout [parallel:yes · track:B]
```
status:       [status:completed]
estimate:     1h
depends_on:   T28
blocks:       T30
```
- Implement S04 full layout with ScheduleTab navigation
- AIS cross-check warning banner always visible at top
- "+ Add" links for manual fields: advance tax paid, interest income
- "Continue to tax summary" button → navigates to S05
- Commit: `feat: S04 review screen`

---

### T30 · S05 Tax Summary screen [parallel:yes · track:B]
```
status:       [status:completed]
estimate:     2h
depends_on:   T29
blocks:       T31
```
- Implement `TaxComputationTable` — full line-by-line breakdown, all lines shown including zeros
- Implement `NetPayableCard` — prominent metric: green if refund, amber if payable
- Implement `WarningList` — all triggered warnings stacked
- S05 layout: 3 MetricCards (total income, total tax, net payable) + computation table + warning list
- "Edit values" → back to S04, current tab preserved via router state
- "Download & export" → navigate to S06
- Commit: `feat: S05 tax summary screen`

---

### T31 · S06 Export, S07 AI Log, S08 Settings screens [parallel:yes · track:B]
```
status:       [status:completed]
estimate:     2h
depends_on:   T30
blocks:       Wave 5
```
- Implement S06 layout — two download cards (PDF, XML), portal step-by-step instructions
- Implement S07 AI Call Log — card per log entry, thumbs up/down rating, "View payload" modal, export button
- Implement S08 Settings — session info, storage used, clear session button, AI call count, about section
- Wire S07 thumbs up/down to update `was_useful` in `aiCallLog` in AppContext + localStorage
- Commit: `feat: S06 export, S07 AI log, S08 settings screens`

---

### T32 · S01 Landing screen [parallel:yes · track:B]
```
status:       [status:completed]
estimate:     1h
depends_on:   T31
blocks:       Wave 5
```
- Implement S01 layout per design.md S01 wireframe
- Session detection on mount — resume prompt or fresh start CTA
- "Start fresh" confirmation dialog
- Deadline countdown badge (within 30 days of 31 July 2026)
- "What you'll need" document checklist always visible
- Commit: `feat: S01 landing screen`

---
---

## Wave 5 — Output Generation

**Goal:** PDF summary and ITR-3 XML both generate correctly and download from the browser.

**Gate:** Downloaded PDF contains all schedule values. Downloaded XML validates against ITR-3 AY 2026-27 XSD.

**Parallel tracks:**
- **Track A** — PDF generation (T33–T34)
- **Track B** — XML generation (T35–T37)

---

### TRACK A — PDF Generation

### T33 · PDF generation engine [parallel:yes · track:A]
```
status:       [status:completed]
estimate:     2h
depends_on:   Wave 4 complete
blocks:       T34
```
- Install and configure `jsPDF`
- Implement `generateTaxSummaryPDF(state)`:
  - Cover page: PAN, employer name, AY, filing date, New Regime badge
  - Schedule S section
  - Schedule BP section
  - Schedule CG section (with STCG/LTCG breakdown)
  - Schedule OS section
  - Schedule CYLA and CFL section
  - Tax computation table
  - Warnings section
  - Footer: "Prepared by ITR Filing Utility v1.0 — verify against AIS before filing"
- Output: triggers browser download of `itr3_summary_ay2026_27.pdf`
- Commit: `feat: PDF generation engine`

---

### T34 · PDFExportButton and download flow [parallel:yes · track:A]
```
status:       [status:completed]
estimate:     30m
depends_on:   T33
blocks:       Wave 7
```
- Wire `PDFExportButton` on S06 to `generateTaxSummaryPDF`
- Show loading state during generation
- Show success state after download initiated
- Handle and display generation errors
- Commit: `feat: PDF export button`

---

### TRACK B — XML Generation

### T35 · Fetch and bundle ITR-3 XSD schema [parallel:yes · track:B]
```
status:       [status:completed]
estimate:     1h
depends_on:   Wave 4 complete
blocks:       T36
```
- Download AY 2026-27 ITR-3 XSD from incometax.gov.in
- Bundle as a static asset in `/public/schemas/itr3_ay2026_27.xsd`
- Implement `validateXML(xmlString)` using client-side XML parser against XSD
- Returns: `{ valid: boolean, errors: Array<{ field, message }> }`
- Commit: `feat: ITR-3 XSD schema and XML validator`

---

### T36 · ITR-3 XML builder [parallel:yes · track:B]
```
status:       [status:completed]
estimate:     2h
depends_on:   T35
blocks:       T37
```
- Implement `generateITR3XML(state)`:
  - Build XML string per structure in design.md Section 9.1
  - Map all schedule values to correct XML nodes
  - Set `<NewTaxRegime>Y</NewTaxRegime>`
  - Set `<ReturnFileSec>11</ReturnFileSec>` (139(1) on time)
  - Insert PAN from Form 16 into `<PersonalInfo>`
- Validate generated XML against XSD before returning
- Return: `{ xml: string, valid: boolean, errors: [] }`
- Commit: `feat: ITR-3 XML builder`

---

### T37 · XMLExportButton and error display [parallel:yes · track:B]
```
status:       [status:completed]
estimate:     1h
depends_on:   T36
blocks:       Wave 7
```
- Wire `XMLExportButton` on S06 to `generateITR3XML`
- If valid: trigger browser download of `itr3_ay2026_27.xml`
- If invalid: show per-field validation errors inline on S06
- Each error links back to the relevant schedule in S04 for correction
- Commit: `feat: XML export button and error display`

---
---

## Wave 6 — AI Fallback and Logging

**Goal:** AI fallback calls implemented with strict payload sanitisation. AI call log fully wired. Both fallbacks fire correctly in the right conditions and never send financial data.

**Gate:** AI fallback unit test confirms payload contains zero numeric values and zero PII. Log entries written correctly. Thumbs up/down persisted.

---

### T38 · AI client with payload sanitiser [parallel:no]
```
status:       [status:completed]
estimate:     2h
depends_on:   Wave 5 complete
blocks:       T39, T40
```
- Implement `callAnthropicAPI(callType, payload)` — wraps Anthropic API call
- Before every call: run `sanitisePayload(payload)` — strips any numeric values, any string matching PAN/TAN patterns, any known PII patterns
- If sanitiser finds a violation: throw error, abort call, log sanitiser block event
- After every call: write `AICallEntry` to `aiCallLog` in localStorage (design.md Section 5.4 log structure)
- Include `rule_gap` extraction from AI response
- Commit: `feat: AI client with payload sanitiser`

---

### T39 · Broker format detection AI fallback [parallel:no]
```
status:       [status:completed]
estimate:     1h
depends_on:   T38
blocks:       T41
```
- Wire AI fallback into broker parser router (T10) for `'unknown'` broker case
- Payload: `{ sheetNames, columnHeaders }` — headers only, no row data (design.md Section 7.1)
- AI prompt: identify broker format, suggest column mappings, provide `rule_gap`
- On AI response: apply suggested mappings, re-attempt parse
- If AI also fails: set `parseStatus.brokerPL = 'error'`, ask user to select broker manually
- Show `AICallBanner` on S03 with "View what was sent" modal
- Commit: `feat: broker detection AI fallback`

---

### T40 · Form 16 field mapping AI fallback [parallel:no]
```
status:       [status:completed]
estimate:     1h
depends_on:   T38
blocks:       T41
```
- Wire AI fallback into Form 16 parser (T13) for `unresolved` fields
- Payload: `{ extractedLabels: string[] }` — label strings only, no values (design.md Section 7.2)
- AI prompt: map ambiguous label strings to standard Form 16 field names, provide `rule_gap`
- On AI response: apply mappings to unresolved fields, complete Form16Data
- If AI also fails: mark fields as unresolved, show manual entry prompts on S04
- Show `AICallBanner` on S03
- Commit: `feat: form 16 field mapping AI fallback`

---

### T41 · AI call log UI wiring [parallel:no]
```
status:       [status:completed]
estimate:     1h
depends_on:   T39, T40
blocks:       Wave 7
```
- Wire S07 AI Call Log screen to `aiCallLog` from AppContext
- Thumbs up/down on each entry → updates `was_useful` in localStorage
- "Export log as JSON" → download `itr_ai_log.json`
- "View anonymised payload" modal → shows payload summary from log entry (not raw payload)
- If zero AI calls: show "No AI calls were made this session" message
- Commit: `feat: AI call log UI wiring`

---
---

## Wave 7 — Integration and Wiring

**Goal:** All parsers, tax engine, UI screens, and output generators fully connected through AppContext. Complete end-to-end flow works with real documents.

**Gate:** Upload real Zerodha P&L + Form 16 + CAMS JSON → reach S06 → download valid PDF and XML.

---

### T42 · Wire parsers to AppContext [parallel:no]
```
status:       [status:completed]
estimate:     1h
depends_on:   Wave 6 complete
blocks:       T43
```
- Connect `parseBrokerPL`, `parseForm16`, `parseMFStatement` outputs to `parsed` slice in AppContext
- On each parser completion: update `parseStatus` and trigger `computeSchedules()`
- On all three complete: trigger `computeTax()` and `computeWarnings()`
- Save session to localStorage after full computation
- Commit: `feat: wire parsers to context`

---

### T43 · Wire tax engine to AppContext [parallel:no]
```
status:       [status:completed]
estimate:     1h
depends_on:   T42
blocks:       T44
```
- Connect `computeSchedules()`, `computeTax()`, `computeWarnings()` to AppContext
- Ensure recomputation triggers on: any `parsed` change, any `overrides` change
- Ensure `schedules`, `tax`, `warnings` in AppContext always reflect latest computation
- Commit: `feat: wire tax engine to context`

---

### T44 · Wire overrides to tax recomputation [parallel:no]
```
status:       [status:completed]
estimate:     1h
depends_on:   T43
blocks:       T45
```
- Every `EditableField` edit writes to `overrides` in AppContext
- Override write triggers immediate `computeSchedules()` → `computeTax()` → `computeWarnings()`
- All screens showing computed values update reactively
- MetricCards on S05 update live as user edits on S04
- Commit: `feat: override-triggered recomputation`

---

### T45 · End-to-end flow test with real documents [parallel:no]
```
status:       [status:completed]
estimate:     2h
depends_on:   T44
blocks:       T46
```
- Run full flow with real sample documents: Zerodha Excel + Form 16 PDF + CAMS JSON
- Verify: all schedules populated correctly
- Verify: tax computation matches manual calculation
- Verify: warnings fire for correct conditions
- Verify: PDF downloads and contains correct values
- Verify: XML downloads and passes XSD validation
- Document any discrepancies as bugs → fix before proceeding
- Commit: `fix: end-to-end integration issues`

---

### T46 · Session resume integration test [parallel:no]
```
status:       [status:completed]
estimate:     1h
depends_on:   T45
blocks:       Wave 8
```
- Complete a full parse and reach S05
- Close browser tab
- Reopen app → confirm resume prompt shows correct saved timestamp
- Resume → confirm all schedule values, overrides, and warnings are restored
- Confirm AI call log persisted and visible on S07
- Commit: `test: session resume integration`

---
---

## Wave 8 — Testing and Validation

**Goal:** Comprehensive test coverage. Edge cases handled. Tax computation verified against known values.

**Gate:** All tests pass. No console errors on any screen. XML validates for 3 different income profiles.

**Parallel tracks:**
- **Track A** — Tax engine edge case tests (T47–T50)
- **Track B** — UI and parser edge case tests (T51–T54)

---

### TRACK A — Tax Engine Edge Cases

### T47 · Tax engine — boundary and exemption tests [parallel:yes · track:A]
```
status:       [status:completed]
estimate:     1h
depends_on:   Wave 7 complete
blocks:       T49
```
- Test: slab income exactly ₹12,00,000 → full Section 87A rebate, zero slab tax
- Test: slab income ₹12,00,001 → rebate does not apply, full slab tax
- Test: LTCG exactly ₹1,25,000 → zero LTCG tax (fully exempt)
- Test: LTCG ₹1,25,001 → ₹1 taxable at 12.5%
- Test: STCG with Section 87A — confirm rebate does not apply
- All assertions against manually verified expected values
- Commit: `test: tax engine boundary tests`

---

### T48 · Tax engine — loss set-off and carry forward tests [parallel:yes · track:A]
```
status:       [status:completed]
estimate:     1h
depends_on:   Wave 7 complete
blocks:       T49
```
- Test: intraday loss cannot offset salary or capital gains — assert isolation
- Test: STCL fully absorbed by STCG — zero carry forward
- Test: STCL exceeds STCG — remainder set off against LTCG
- Test: STCL exceeds both STCG and LTCG — remainder carried forward
- Test: LTCL cannot offset STCG — assert separation
- Commit: `test: loss set-off and carry forward tests`

---

### T49 · Tax engine — surcharge and multi-profile tests [parallel:yes · track:A]
```
status:       [status:completed]
estimate:     1h
depends_on:   T47, T48
blocks:       Wave 9
```
- Test: total income ₹50L → 10% surcharge applies
- Test: total income ₹1Cr → 15% surcharge applies
- Test: total income ₹49,99,999 → no surcharge
- Run 3 full income profiles end-to-end:
  - Profile A: salary only, no trading
  - Profile B: salary + LTCG above exemption + no losses
  - Profile C: salary + intraday loss + STCG + MF gains (the primary user profile)
- Assert all three produce correct net payable
- Commit: `test: surcharge and multi-profile tests`

---

### TRACK B — UI and Parser Edge Cases

### T50 · Parser edge case tests [parallel:yes · track:B]
```
status:       [status:completed]
estimate:     2h
depends_on:   Wave 7 complete
blocks:       T52
```
- Broker parser: Excel with empty intraday sheet → no error, zero intraday values
- Broker parser: Excel with F&O data → F&O warning fires, F&O excluded from computation
- Form 16 parser: AY mismatch → error surfaced correctly
- Form 16 parser: missing professional tax field → defaults to zero, no crash
- MF parser: no redemptions in FY → MFData with all zeros, no error
- MF parser: mixed equity and debt funds → correct classification
- Commit: `test: parser edge cases`

---

### T51 · XML validation tests [parallel:yes · track:B]
```
status:       [status:completed]
estimate:     1h
depends_on:   Wave 7 complete
blocks:       T52
```
- Generate XML for all 3 income profiles from T49
- Validate each against ITR-3 AY 2026-27 XSD
- Assert zero validation errors for valid profiles
- Test: missing PAN in Form 16 → XML validation error surfaced correctly on S06
- Test: negative value in non-loss field → XML validation error surfaced
- Commit: `test: XML validation tests`

---

### T52 · UI warning display tests [parallel:yes · track:B]
```
status:       [status:completed]
estimate:     1h
depends_on:   T50, T51
blocks:       T53
```
- Test each of the 10 warning conditions from requirements.md Section 7
- Confirm each warning renders correctly on S04 and S05
- Confirm F&O warning does not block user from proceeding
- Confirm carry-forward deadline warning shows correct date
- Commit: `test: UI warning display tests`

---

### T53 · AI payload sanitiser tests [parallel:yes · track:B]
```
status:       [status:completed]
estimate:     1h
depends_on:   T50, T51
blocks:       Wave 9
```
- Test sanitiser blocks payload containing any numeric value
- Test sanitiser blocks payload containing PAN pattern (AAAAA0000A)
- Test sanitiser blocks payload containing TAN pattern (AAAA00000A)
- Test sanitiser passes clean structural payload (sheet names, column headers only)
- Confirm blocked payloads are logged with sanitiser block reason
- Commit: `test: AI payload sanitiser`

---
---

## Wave 9 — Polish and Hardening

**Goal:** Production-ready. Error states handled everywhere. Performance acceptable. Clear messaging throughout.

**Gate:** App runs without console errors or warnings. localStorage full error handled gracefully. App usable on a 1280px screen.

---

### T54 · Error boundary and global error handling [parallel:no]
```
status:       [status:completed]
estimate:     1h
depends_on:   Wave 8 complete
blocks:       T55
```
- Implement React error boundary wrapping all screens
- Unhandled errors → friendly error screen with "Start fresh" option
- localStorage quota exceeded → toast notification, session save skipped gracefully
- Network error during AI call → fallback to manual broker selection, no crash
- Commit: `feat: error boundaries and global error handling`

---

### T55 · Loading states and micro-interactions [parallel:no]
```
status:       [status:completed]
estimate:     1h
depends_on:   T54
blocks:       T56
```
- PDF generation button: spinner during generation, "Downloaded" confirmation state
- XML generation button: spinner, validation progress, "Downloaded" or error state
- Parsing progress: each milestone checkmark animates in as it completes
- EditableField: smooth transition between display and edit modes
- Commit: `feat: loading states and micro-interactions`

---

### T56 · Responsive layout — 1280px minimum [parallel:no]
```
status:       [status:completed]
estimate:     1h
depends_on:   T55
blocks:       T57
```
- Verify all 8 screens layout correctly at 1280px width
- Fix any overflow, truncation, or layout breakage at minimum supported width
- Schedule tabs on S04 must not overflow — scroll if needed
- Tax computation table must be readable without horizontal scroll
- Commit: `fix: responsive layout 1280px`

---

### T57 · Copy review — all labels, warnings, instructions [parallel:no]
```
status:       [status:completed]
estimate:     1h
depends_on:   T56
blocks:       T58
```
- Review all user-facing text: warning messages, button labels, error messages, instructions
- Ensure all portal step instructions on S06 are accurate for AY 2026-27
- Ensure all schedule field labels match ITR-3 portal terminology exactly
- Ensure AI transparency messaging is clear and non-alarming
- Commit: `copy: review all user-facing text`

---

### T58 · Performance — parsing and computation [parallel:no]
```
status:       [status:completed]
estimate:     1h
depends_on:   T57
blocks:       T59
```
- Profile parsing pipeline on a large Zerodha Excel (500+ trades)
- Profile tax engine recomputation on override edit — must complete in < 100ms
- Profile PDF generation — must complete in < 3s
- Profile XML generation — must complete in < 1s
- Fix any bottlenecks found
- Commit: `perf: parsing and computation optimisation`

---

### T59 · Final pre-launch checklist [parallel:no]
```
status:       [status:completed]
estimate:     1h
depends_on:   T58
blocks:       —
```
- `npm run build` produces zero errors and zero warnings
- All 74 tasks in this file are `[status:completed]`
- No `console.log` statements in production build
- `README.md` written with: setup instructions, how to run locally, how to build, file structure overview
- Verify ITR-3 XSD version matches AY 2026-27 schema (re-check incometax.gov.in)
- Commit: `chore: final pre-launch checklist`
- Tag release: `v1.0.0`

---

*End of Task Breakdown v1.0 — 74 tasks across 9 waves*
