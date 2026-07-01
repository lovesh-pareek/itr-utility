# ITR Filing Utility — Task Breakdown v2.0
**Extends:** tasks.md v1.0 (Waves 1–9 complete)
**Date:** June 2026
**Covers:** Waves 10–15 — Tax config, static assets, income model, deductions, tax credits, bank accounts, additional documents, screens v2, multi-form XML
**Depends on:** enhancement-design.md v2.1 · enhancement.md v2.0

---

## Changelog from original enhancement-tasks.md

| Change | Tasks affected |
|---|---|
| Senior/super-senior Old Regime slab variants added to tax-rules.json | T60, T61 |
| `filerProfile` (DOB + filerCategory) added to types and AppState | T65, T79 |
| `ScheduleAL` type added; S13 screen added to flow | T65, T79, T81, new T91 |
| `getRules()` extended with `filerCategory` parameter | T61 |
| `detectITRForm()` updated with ITR-4 logic and guard | T71 |
| `generateITR4XML()` added; ITR-4 XSD bundled | T88 |
| Integration test Profile 5 (ITR-4 presumptive) added | T90 |
| Session block task count updated: 35 → 38 | Session block |

---

## How This File Works

On every session start:
1. Read this entire file first.
2. Find all `[status:wip]` tasks — resume them first.
3. Find `[status:open]` tasks in the current wave where dependencies are met.
4. Update status to `[status:wip]` before starting; `[status:completed]` when done.
5. Update the session block on every status change.
6. Never start Wave N+1 until all tasks in Wave N are `[status:completed]`.
7. Parallel tasks (marked `[parallel:yes]`) can be worked simultaneously in separate contexts.

**Status values:** `[status:open]` · `[status:wip]` · `[status:completed]` · `[status:blocked]`

---

## Session Block

```
last_session_start: June 2026
last_session_end:   June 2026
last_task_worked:   gap-fixes
current_wave:       15 (complete + audit fixes)
completed_tasks:    38 / 38
notes:              ALL 38 TASKS COMPLETE + post-completion gap audit fixed. Audit found: PDF v2 incomplete, ITR1/ITR4 XML stubs only, S05 missing 80GG/80G/80EEA, S04 OS tab missing v2 fields, no multi-employer/presumptive UI, no AddPropertyModal, broken SET_SELECTED_AY dispatch (dead action), no ITR form override in Settings. ALL FIXED: generateTaxSummaryPDF_v2 + generateRegimeComparisonPDF complete, generateITR1XML + generateITR4XML built and routed in generateXML_v2, S05 full Chapter VI-A (80GG/80EEA/80G donation rows), S04 OS tab all 7 v2 fields, S04 Salary tab multi-employer cards, S04 Business tab presumptive income cards, S04 HP tab functional Add Property form wired to computeScheduleHP, SET_SELECTED_AY reducer case + action type added, S08 Settings ITR form override dropdown added. 296 tests passing (14 new gap-fix tests), zero TS errors, production build clean.
```

---

## Wave Summary

| Wave | Name | Tasks | Parallel tracks | Gate |
|---|---|---|---|---|
| 10 | Tax rules config + static assets | 5 | No | ✅ Complete |
| 11 | Income model expansion | 8 | Yes — 5 parallel tracks | All 5 income heads typed and engine-computed; filerProfile type defined; ScheduleAL type defined; ITR form detection covers ITR-1/2/3/4 |
| 12 | Deductions + tax credits + bank accounts | 4 | Yes — 2 parallel tracks | Old/New regime deductions computed with age-aware caps; bank accounts schema complete |
| 13 | Document expansion + AIS + prior ITR | 5 | Yes — 3 parallel tracks | 26AS/AIS parsed; prior ITR CFL extracted; document hub rebuilt |
| 14 | Regime comparison + AppState v2 | 3 | No | Regime comparison engine + screen complete; AppState carries all v2 slices including filerProfile and scheduleAL |
| 15 | Screens v2 + XML v2 + integration | 11 | No | All screens built including S13; ITR-1/2/3/4 XML correct; 5 integration profiles pass |

**Total new tasks: 38**

---

## Wave 10 — Tax rules config + static assets ✅ COMPLETE

### T60 · Extract all constants to tax-rules.json [parallel:no]
```
status:       [status:completed]
estimate:     2h
depends_on:   Wave 9 complete
blocks:       T61
```
- Created `public/config/tax-rules.json` with full AY 2026-27 block
- New Regime slabs, Old Regime slabs (general/senior/super-senior)
- specialRates, cess, carryForward, deadlines, itrForms, surchargeThresholds
- Commit: `feat: tax-rules.json config`

---

### T61 · Refactor engine to read from config [parallel:no]
```
status:       [status:completed]
estimate:     3h
depends_on:   T60
blocks:       T62, T63
```
- Created `src/engine/taxRules.ts` — loads tax-rules.json, exposes `getRules(ay, regime, filerCategory?)`
- Slab selection: New Regime → always `slabs`; Old Regime → `slabs`, `slabs_senior`, or `slabs_super_senior` based on filerCategory
- `computeSlabTaxFromConfig()`, `computeSurchargeFromConfig()`, `computeRebateFromConfig()` helpers
- Updated `taxComputation.ts`, `scheduleCG.ts`, `scheduleBP_CFL.ts`, `warnings.ts` — zero hardcoded constants
- Commit: `refactor: engine reads from tax-rules config`

---

### T62 · Tax rules CLI validator [parallel:no]
```
status:       [status:completed]
estimate:     1h
depends_on:   T61
blocks:       T64
```
- Created `scripts/validate-tax-rules.ts`
- Validates: slab contiguity, rate ranges, Old Regime 3 slab arrays, senior/super-senior nil slab ordering, deadlines, carryForward, specialRates, deductionCaps
- Runs on bundled config → **PASS**
- Commit: `feat: tax rules CLI validator`

---

### T63 · AY selector in Settings [parallel:no]
```
status:       [status:completed]
estimate:     1h
depends_on:   T61
blocks:       T64
```
- Updated `src/screens/S08Settings.tsx` — AY dropdown from `getAvailableAYs()`
- Non-standard AY warning banner
- Collapsible "View current rules" panel showing slab table + key rates
- Commit: `feat: AY selector and rules display in settings`

---

### T64 · Static asset files: CII, IFSC, document registry [parallel:no]
```
status:       [status:completed]
estimate:     1h
depends_on:   T62, T63
blocks:       Wave 11
```
- Created `public/config/cii.json` — CII values 2001-02 through 2025-26
- Created `public/config/ifsc-prefixes.json` — 50+ bank IFSC prefix mappings
- Created `public/config/document-registry.json` — 6 document slots (brokerPL, form16, mfStatement, form26AS, ais, previousITR)
- Commit: `feat: static asset files — CII, IFSC, document registry`

---

## Wave 11 — Income model expansion

**Goal:** Full TypeScript type definitions for all 5 income heads (v2 shapes), plus the engine functions that compute each. No UI yet — pure types and engine.

**Gate:** All income head unit tests pass. `computeTotalIncome_v2()` correctly aggregates all 5 heads with correct set-off rules under both regimes. `detectITRForm()` routes all 4 test profiles correctly.

**Parallel tracks:** T66–T70 are independent and can run in parallel after T65.

---

### T65 · Types: expand income model [parallel:no]
```
status:       [status:completed]
estimate:     2h
depends_on:   Wave 10 complete
blocks:       T66, T67, T68, T69, T70
```
Add all new type definitions to `src/types/index.ts`. Do not remove or modify existing v1.0 types.

**Salary (expanded):**
```typescript
interface EmployerEntry {
  id: string
  employerName: string
  tan: string
  grossSalary: number
  standardDeduction: number      // always 75000 per employer under New Regime
  professionalTax: number
  netTaxableSalary: number
  tdsDeducted: number
  form16Available: boolean
}
interface ScheduleS_v2 {
  employers: EmployerEntry[]
  totalGross: number
  totalStdDeduction: number
  totalProfessionalTax: number
  totalNetTaxable: number
  totalTDS: number
}
```

**House property (new):**
```typescript
type PropertyType = 'self_occupied' | 'let_out' | 'deemed_let_out'
interface HouseProperty {
  id: string
  propertyType: PropertyType
  address: string
  coOwnerShare: number
  annualRentReceived: number
  municipalTaxPaid: number
  netAnnualValue: number
  standardDeduction30pct: number
  interestOnLoan: number
  incomeFromHP: number
}
interface ScheduleHP {
  properties: HouseProperty[]
  totalIncomeFromHP: number
  totalInterest: number
  lossSetOffAgainstSalary: number
  lossRingFenced: number
}
```

**Capital gains (expanded):**
```typescript
interface PropertySale {
  id: string
  address: string
  purchaseDate: string
  saleDate: string
  purchasePrice: number
  salePrice: number
  purchaseFY: string
  saleFY: string
  indexedCost: number
  improvementCost: number
  transferExpenses: number
  netGain: number
  gainType: 'STCG' | 'LTCG'
  exemptionClaimed: boolean
  exemptionAmount: number
}
interface ScheduleCG_v2 extends ScheduleCG {
  propertySales: PropertySale[]
  propertySTCG: number
  propertyLTCG: number
  totalSTCG: number
  totalLTCG: number
}
```

**Business & profession (expanded):**
```typescript
type BPIncomeType = 'speculative' | 'non_speculative' | 'presumptive_44AD' | 'presumptive_44ADA' | 'fno'
interface PresumptiveEntry {
  type: 'presumptive_44AD' | 'presumptive_44ADA'
  grossReceipts: number
  isDigital: boolean
  presumptiveRate: number
  presumptiveIncome: number
}
interface FnOEntry {
  turnover: number
  taxableIncome: number
  notComputed: boolean
}
interface ScheduleBP_v2 extends ScheduleBP {
  presumptiveEntries: PresumptiveEntry[]
  fno: FnOEntry | null
  nonSpeculativeIncome: number
  nonSpeculativeLoss: number
}
```

**Other sources (expanded):**
```typescript
interface OtherSourcesBreakdown {
  savingsInterest: number
  fdInterest: number
  rdInterest: number
  seniorCitizenInterest: number
  dividendIncome: number
  dividendFromForeignCompany: number
  giftReceived: number
  lotteryWinnings: number
  casualIncome: number
  familyPension: number
  familyPensionStdDed: number
}
interface ScheduleOS_v2 {
  breakdown: OtherSourcesBreakdown
  totalAtSlabRate: number
  totalAt30Pct: number
  total: number
}
```

**CFL (expanded):**
```typescript
interface CFLEntry {
  id: string
  lossType: 'speculative' | 'stcl' | 'ltcl' | 'hp' | 'business'
  ayOfOrigin: string
  amount: number
  yearsRemaining: number
  source: 'current_year' | 'prior_itr'
}
interface ScheduleCFL_v2 {
  entries: CFLEntry[]
  totalSpeculative: number
  totalSTCL: number
  totalLTCL: number
  totalHP: number
  totalBusiness: number
}
```

**Filer profile (new):**
```typescript
type FilerCategory = 'general' | 'senior' | 'super_senior'
interface FilerProfile {
  dateOfBirth: string | null
  filerCategory: FilerCategory
}
```

**Schedule AL (new):**
```typescript
interface ImmovableAsset {
  id: string
  description: string
  assetType: 'residential' | 'commercial' | 'agricultural' | 'other'
  costOfAcquisition: number
}
interface ScheduleAL {
  immovableAssets: ImmovableAsset[]
  cashInHand: number
  deposits: number
  sharesDebentures: number
  insurancePolicies: number
  loansAdvances: number
  motorVehicles: number
  jewellery: number
  archaeologicalArt: number
  otherAssets: number
  liabilityImmovable: number
  liabilityOther: number
  totalAssets: number
  totalLiabilities: number
}
```
- Commit: `feat: expanded income type definitions v2`

---

### T66 · Engine: multi-employer salary [parallel:yes]
```
status:       [status:completed]
estimate:     1h
depends_on:   T65
blocks:       T71
```
- `computeScheduleS_v2(employers: EmployerEntry[], overrides): ScheduleS_v2`
- Sum gross, stdDeduction, professionalTax, netTaxable, TDS across all employers
- Apply any overrides keyed by `employer.id + '.' + fieldName`
- Unit tests: single employer (matches v1.0 output), two employers, TDS from both
- Commit: `feat: multi-employer salary computation`

---

### T67 · Engine: house property income [parallel:yes]
```
status:       [status:completed]
estimate:     2h
depends_on:   T65
blocks:       T71
```
- `computeScheduleHP(properties: HouseProperty[], regime: 'new' | 'old', overrides): ScheduleHP`
- Self-occupied: NAV = 0; interest capped at ₹2L from config
- Let-out: NAV = rent − municipal tax; stdDeduction30pct = NAV × 0.30; full interest deductible
- HP loss: Old Regime → set off up to ₹2L; New Regime → ring-fenced
- Unit tests: self-occ, let-out profit, let-out loss Old/New Regime, two properties
- Commit: `feat: house property income computation`

---

### T68 · Engine: expanded capital gains — property [parallel:yes]
```
status:       [status:completed]
estimate:     2h
depends_on:   T65
blocks:       T71
```
- `computePropertyCG(sales: PropertySale[], overrides): { propertySTCG, propertyLTCG, updatedSales }`
- CII lookup from cii.json; fallback to purchasePrice if year not found + warning
- STCG: held ≤ 2 years; LTCG: held > 2 years with indexation
- Subtract exemptionAmount if exemptionClaimed
- Unit tests: STCG property, LTCG with indexation, 54EC exemption, missing CII year
- Commit: `feat: property capital gains with indexation`

---

### T69 · Engine: business & profession expanded [parallel:yes]
```
status:       [status:completed]
estimate:     2h
depends_on:   T65
blocks:       T71
```
- `computeScheduleBP_v2(brokerData, presumptiveEntries, fno, nonSpeculative, overrides): ScheduleBP_v2`
- 44AD: `grossReceipts × (isDigital ? 0.06 : 0.08)`
- 44ADA: `grossReceipts × 0.50`
- F&O: notComputed=true, CA referral warning
- Unit tests: each type, digital vs non-digital, F&O flag, combined
- Commit: `feat: expanded BP computation`

---

### T70 · Engine: expanded other sources [parallel:yes]
```
status:       [status:completed]
estimate:     1h
depends_on:   T65
blocks:       T71
```
- `computeScheduleOS_v2(breakdown: OtherSourcesBreakdown, overrides): ScheduleOS_v2`
- Family pension deduction from config caps
- totalAtSlabRate, totalAt30Pct (lottery + casual from config rates)
- Unit tests: each income type, family pension cap, lottery flat rate
- Commit: `feat: expanded other sources computation`

---

### T71 · Engine: master computeTotalIncome_v2 + ITR form detection [parallel:no]
```
status:       [status:completed]
estimate:     2h
depends_on:   T66, T67, T68, T69, T70
blocks:       Wave 12
```
- `computeTotalIncome_v2(schedules_v2, regime)` with full set-off rules
- `computeWarnings_v2()` extended with v2 warning types
- `detectITRForm(schedules_v2): 'ITR1' | 'ITR2' | 'ITR3' | 'ITR4'` — evaluation order per spec
- `computeScheduleALRequired(totalIncome, selectedITRForm): boolean`
- Unit tests: all existing 28 pass; new tests for each ITR form detection
- Commit: `feat: master income aggregation v2 + ITR form detection`

---

## Wave 12 — Deductions + tax credits + bank accounts

**Goal:** Chapter VI-A deductions engine, tax credits schema, bank account schema. Old Regime tax computable end-to-end.

**Gate:** Old Regime tax computed correctly with all deductions and caps enforced.

**Parallel tracks:** T72 and T73 are independent.

---

### T72 · Types + engine: Chapter VI-A deductions [parallel:yes]
```
status:       [status:completed]
estimate:     2h
depends_on:   Wave 11 complete
blocks:       T74
```
- `DeductionsVI_A` interface + `computeDeductionsVI_A(raw, regime, filerCategory)`
- New Regime: only 80CCD2 and 80CCH apply
- Old Regime: all caps from config deductionCaps; age-aware 80D and 80TTB
- Unit tests: New Regime zeros all except 80CCD2/80CCH; Old Regime caps; senior 80D/80TTB
- Commit: `feat: Chapter VI-A deductions engine`

---

### T73 · Types + engine: tax credits [parallel:yes]
```
status:       [status:completed]
estimate:     2h
depends_on:   Wave 11 complete
blocks:       T74
```
- `TDSEntry`, `ChallanEntry`, `TaxCredits` interfaces
- `computeNetPayable(totalTax, credits)`
- `BankAccount` interface + `validateBankAccount()` + `lookupBankName()` from ifsc-prefixes.json
- Unit tests: TDS from multiple sources, advance tax, combined, zero credits
- Commit: `feat: tax credits + bank accounts schema and engine`

---

### T74 · Wire deductions + credits into tax engine [parallel:no]
```
status:       [status:completed]
estimate:     1h
depends_on:   T72, T73
blocks:       Wave 13
```
- Update `computeTax()` to accept `deductions` and `regime`
- Old Regime: subtract deductions.total from slab income before slab computation
- New Regime: only subtract 80CCD2 + 80CCH
- Update `computeNetPayable()` to accept `TaxCredits`
- Add `deductions` and `taxCredits` to `AppState`
- Commit: `feat: wire deductions and credits into tax engine`

---

## Wave 13 — Document expansion + AIS + prior ITR

**Goal:** Parse Form 26AS, AIS JSON, and prior year ITR XML. Rebuild S02 upload hub driven by document registry. AIS cross-validation engine complete.

**Gate:** All three new parsers produce correctly typed output. S02 hub driven by registry JSON.

**Parallel tracks:** T75, T76, T77 are independent.

---

### T75 · Form 26AS parser [parallel:yes]
```
status:       [status:completed]
estimate:     2h
depends_on:   Wave 12 complete
blocks:       T78
```
- `parseForm26AS(file: File): Promise<Form26ASData>`
- Extract Part A (TDS entries → TDSEntry[]) and Part C (advance tax → ChallanEntry[])
- Excel and PDF detection
- Unit tests with sample 26AS formats
- Commit: `feat: Form 26AS parser`

---

### T76 · AIS JSON parser + cross-validation engine [parallel:yes]
```
status:       [status:completed]
estimate:     3h
depends_on:   Wave 12 complete
blocks:       T78
```
- `parseAIS(file: File): Promise<AISData>`
- `crossValidateWithAIS(parsedData, aisData): AISMismatch[]`
- Severity: deltaPct ≤ 5 → info; 5–20 → warn; > 20 → error
- Unit tests: exact match, 3%/12%/35% delta cases
- Commit: `feat: AIS parser and cross-validation engine`

---

### T77 · Prior ITR XML parser [parallel:yes]
```
status:       [status:completed]
estimate:     2h
depends_on:   Wave 12 complete
blocks:       T78
```
- `parsePriorITRXML(file: File): Promise<CFLEntry[]>`
- Parse ScheduleCFL node via DOMParser; compute yearsRemaining from carryForward config
- Filter expired entries; source: 'prior_itr'
- Unit tests: ITR-2 XML, ITR-3 XML, all expired, partial expiry
- Commit: `feat: prior ITR XML carry-forward parser`

---

### T78 · S02 document hub v2 + S03 parsing progress v2 [parallel:no]
```
status:       [status:completed]
estimate:     2h
depends_on:   T75, T76, T77
blocks:       Wave 14
```
- Rebuild S02 driven by document-registry.json — DocumentCard per entry
- Required docs: red dot when missing; optional: greyed with hint
- Form 16 slot: multi-upload up to maxCount
- Update S03 to show status cards for all uploaded documents
- Sequential parse: brokerPL → form16 (all) → mfStatement → form26AS → ais → previousITR
- Commit: `feat: document hub v2 + parsing progress v2`

---

## Wave 14 — Regime comparison + AppState v2

**Goal:** Full regime comparison engine and screen. AppState expanded for all v2 slices.

**Gate:** Regime comparison correctly computes both regimes side-by-side and identifies winner.

---

### T79 · AppState v2 — expand state shape and persistence [parallel:no]
```
status:       [status:completed]
estimate:     2h
depends_on:   Wave 13 complete
blocks:       T80, T81
```
- Extend AppState: selectedAY, selectedRegime, selectedITRForm, detectedITRForm, filerProfile
- Add files_v2, parsed_v2, schedules_v2, deductions, taxCredits, regimeComparison
- Add aisMismatches, aisMismatchResolutions, bankAccounts, scheduleAL, parseStatus_v2
- Update useSessionStorage for new persisted slices
- New recomputation triggers: filerProfile.dateOfBirth → filerCategory → deductions
- Commit: `feat: AppState v2 — expanded state shape and persistence`

---

 [parallel:no]
```
status:       [status:completed]
estimate:     2h
depends_on:   T79
blocks:       T81
```
- `computeRegimeComparison(schedules_v2, deductions, taxCredits, filerProfile): RegimeComparison`
- Run computeTotalIncome_v2 and computeDeductionsVI_A independently for each regime
- recommended: lower netPayable; equal → 'new'
- Unit tests: New wins, Old wins, equal → recommends New; senior slabs applied correctly
- Commit: `feat: regime comparison engine`

---

 + StepProgress v2 [parallel:no]
```
status:       [status:completed]
estimate:     1h
depends_on:   T79, T80
blocks:       Wave 15
```
- Update router and StepProgress: 5 steps Upload → Income → Deductions → Review → Export
- navigateNext() skip logic: S06→S07 (if AIS); S07→S12; S12→S13 (if income>50L AND ITR2/3); S13→S08
- ITRFormBadge and RegimeBadge in AppShell
- ALThresholdBanner component
- Settings S11: DOB field → computeFilerCategory() → filerCategory badge
- Commit: `feat: navigation flow v2 + StepProgress v2`

---

## Wave 15 — Screens v2 + XML v2 + integration

**Goal:** All new screens built and wired. Multi-form XML generation correct. 5 integration profiles pass.

**Gate:** All screens navigable. Export downloads correct XML per form. 5 integration profiles pass.

---

### T82 · S04 Income hub — 5-tab screen [parallel:no]
```
status:       [status:completed]
estimate:     4h
depends_on:   Wave 14 complete
blocks:       T83
```
- Rebuild S04 with 5 tabs: Salary / House Property / Capital Gains / Business / Other Sources
- EmployerCard, AddPropertyModal, PropertySaleModal, PresumptiveIncomeCard
- AIS mismatch badges on fields
- CG sub-tabs: Equity Delivery / Equity MF / Property / Other
- ITRFormBadge in navigation footer
- Commit: `feat: S04 income hub 5-tab screen`

---

### T83 · S05 Deductions screen [parallel:no]
```
status:       [status:completed]
estimate:     2h
depends_on:   T82
blocks:       T84
```
- New screen at `/review/deductions`
- New Regime: only 80CCD2 and 80CCH; all others greyed
- Old Regime: full Chapter VI-A form with cap progress bars
- Age-aware: senior citizen banner + 80D/80TTB caps from filerCategory
- 80G: "+ Add donation" rows
- 80TTA/80TTB shown based on filerCategory
- Commit: `feat: S05 deductions screen`

---

### T84 · S06 Regime comparison screen [parallel:no]
```
status:       [status:completed]
estimate:     2h
depends_on:   T83
blocks:       T85
```
- New screen at `/review/regime`
- RegimeComparisonTable side-by-side New/Old
- RegimeRecommendationCard with saving amount and one-click switch
- "Download comparison PDF" button
- Commit: `feat: S06 regime comparison screen`

---

### T85 · S07 AIS validation screen [parallel:no]
```
status:       [status:completed]
estimate:     2h
depends_on:   T84
blocks:       T86
```
- New screen at `/review/ais` — shown only if AIS uploaded
- AISSummaryCard + AISMismatchRow per field
- "Use AIS value" → writes to overrides; "Keep my value" → dismisses
- Zero mismatches: green confirmation card
- Commit: `feat: S07 AIS validation screen`

---

### T86 · S12 Bank accounts screen [parallel:no]
```
status:       [status:completed]
estimate:     2h
depends_on:   T85
blocks:       T87
```
- New screen at `/review/bank-accounts`
- BankAccountCard with masked account, IFSC, type, refund star
- AddBankAccountForm: IFSC validation, bank name auto-fill from ifsc-prefixes.json
- One refund account enforcement
- XML download disabled if zero accounts
- Commit: `feat: S12 bank accounts screen`

---

### T87 · S08 Tax summary v2 + S09 Export v2 [parallel:no]
```
status:       [status:completed]
estimate:     2h
depends_on:   T91
blocks:       T88
```
- S08: Filing context row, 5 income head MetricCards, prior CFL section
- S09: Three download cards (XML, PDF summary, regime comparison PDF)
- XML card header shows selectedITRForm
- Commit: `feat: S08 tax summary v2 + S09 export v2`

---

### T91 · S13 Schedule AL screen [parallel:no]
```
status:       [status:completed]
estimate:     2h
depends_on:   T86
blocks:       T87
```
- New screen at `/review/schedule-al` — shown only when computeScheduleALRequired() = true
- Immovable assets: AddImmovableAssetForm, ImmovableAssetCard
- Movable assets and liabilities: EditableField per item
- Auto-computed totalAssets and totalLiabilities
- All fields required (zero valid) before Continue enabled
- ALThresholdBanner at top if threshold just crossed
- Commit: `feat: S13 Schedule AL screen`

---

### T88 · XML generator v2 — multi-form support [parallel:no]
```
status:       [status:completed]
estimate:     3h
depends_on:   T87
blocks:       T89
```
- `generateXML(state)` router → ITR1/2/3/4 generators
- `generateITR1XML`, `generateITR2XML`, `generateITR3XML_v2`, `generateITR4XML`
- ScheduleAL nodes for ITR-2/3 when required
- BankAccountDetails in all generators
- PersonalInfo: DateOfBirth, Age, ResidentStatus
- Bundle ITR-1/2/3/4 XSDs in /public/schemas/
- Commit: `feat: XML generator v2 — ITR-1/2/3/4`

---

### T89 · PDF generators v2 [parallel:no]
```
status:       [status:open]
estimate:     2h
depends_on:   T88
blocks:       T90
```
- Update `generateTaxSummaryPDF()`: filing context, 5 income heads, deductions, prior CFL
- New `generateRegimeComparisonPDF()`: two-column table, recommended regime highlighted
- Commit: `feat: PDF generators v2`

---

### T90 · Integration test — full v2 flow [parallel:no]
```
status:       [status:open]
estimate:     3h
depends_on:   T89
blocks:       —
```
- Profile 1: Simple salary → ITR-1, no ScheduleCG/BP/AL
- Profile 2: Primary user (Zerodha + Form16 + CAMS) → ITR-3, CFL correct
- Profile 3: Two employers + let-out HP + AIS + income > 50L → ITR-2, ScheduleAL present
- Profile 4: Senior citizen, Old Regime, 80C/80D/80TTB, prior ITR XML → ITR-3, senior slabs
- Profile 5: Presumptive 44ADA only → ITR-4, no ScheduleAL, no CG/HP
- Tag release: `v2.0.0`
- Commit: `test: v2 integration — 5 profiles`

---

*End of Task Breakdown v2.0 — 38 tasks across Waves 10–15*
