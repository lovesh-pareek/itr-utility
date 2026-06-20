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

Same agent protocol as tasks.md v1.0. On every session start:
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

> AI agent: update this block at the start and end of every session.

```
last_session_start: —
last_session_end:   —
last_task_worked:   —
current_wave:       10 (open)
completed_tasks:    0 / 38
notes:              v1.0 complete (74 tasks, Waves 1–9). Starting v2.0 enhancements. v2.1 adds 3 tasks: T91 (Schedule AL screen), ITR-4 XML (T88 expanded), Profile 5 integration test (T90 expanded).
```

---

## Wave Summary

| Wave | Name | Tasks | Parallel tracks | Gate |
|---|---|---|---|---|
| 10 | Tax rules config + static assets | 5 | No | Engine reads zero hardcoded values; CII + IFSC tables bundled; senior/super-senior slabs in config; new AY = JSON drop-in |
| 11 | Income model expansion | 8 | Yes — 5 parallel tracks | All 5 income heads typed and engine-computed; filerProfile type defined; ScheduleAL type defined; ITR form detection covers ITR-1/2/3/4 |
| 12 | Deductions + tax credits + bank accounts | 4 | Yes — 2 parallel tracks | Old/New regime deductions computed with age-aware caps; bank accounts schema complete |
| 13 | Document expansion + AIS + prior ITR | 5 | Yes — 3 parallel tracks | 26AS/AIS parsed; prior ITR CFL extracted; document hub rebuilt |
| 14 | Regime comparison + AppState v2 | 3 | No | Regime comparison engine + screen complete; AppState carries all v2 slices including filerProfile and scheduleAL |
| 15 | Screens v2 + XML v2 + integration | 11 | No | All screens built including S13; ITR-1/2/3/4 XML correct; 5 integration profiles pass |

**Total new tasks: 38**

---

## Wave 10 — Tax rules config + static assets

**Goal:** Extract every hardcoded tax constant from the engine into a versioned
`public/config/tax-rules.json`. Create CII, IFSC, and document registry static assets.
Engine reads `rules[selectedAY]`. Budget changes = JSON edit only, zero code change.

**Gate:** Engine passes all existing 28 unit tests reading from config, not code.
CLI validator passes on the bundled config. CII, IFSC, and document registry files
exist and are correctly shaped. A `"2027-28"` block can be added to `tax-rules.json`
and validated without touching engine code.

---

### T60 · Extract all constants to tax-rules.json [parallel:no]
```
status:       [status:open]
estimate:     2h
depends_on:   Wave 9 complete
blocks:       T61
```
Create `public/config/tax-rules.json` with this exact shape:
```json
{
  "schemaVersion": "1.0",
  "defaultAY": "2026-27",
  "rules": {
    "2026-27": {
      "regime": {
        "new": {
          "slabs": [
            { "from": 0, "to": 400000, "rate": 0 },
            { "from": 400000, "to": 800000, "rate": 0.05 },
            { "from": 800000, "to": 1200000, "rate": 0.10 },
            { "from": 1200000, "to": 1600000, "rate": 0.15 },
            { "from": 1600000, "to": 2000000, "rate": 0.20 },
            { "from": 2000000, "to": 2400000, "rate": 0.25 },
            { "from": 2400000, "to": null, "rate": 0.30 }
          ],
          "standardDeductionSalary": 75000,
          "section87A": { "limit": 1200000, "appliesToCG": false },
          "surcharge": [
            { "from": 5000000, "to": 10000000, "rate": 0.10 },
            { "from": 10000000, "to": 20000000, "rate": 0.15 },
            { "from": 20000000, "to": null, "rate": 0.25 }
          ],
          "surchargeCapForCG": 0.15
        },
        "old": {
          "slabs": [
            { "from": 0, "to": 250000, "rate": 0 },
            { "from": 250000, "to": 500000, "rate": 0.05 },
            { "from": 500000, "to": 1000000, "rate": 0.20 },
            { "from": 1000000, "to": null, "rate": 0.30 }
          ],
          "slabs_senior": [
            { "from": 0, "to": 300000, "rate": 0 },
            { "from": 300000, "to": 500000, "rate": 0.05 },
            { "from": 500000, "to": 1000000, "rate": 0.20 },
            { "from": 1000000, "to": null, "rate": 0.30 }
          ],
          "slabs_super_senior": [
            { "from": 0, "to": 500000, "rate": 0 },
            { "from": 500000, "to": 1000000, "rate": 0.20 },
            { "from": 1000000, "to": null, "rate": 0.30 }
          ],
          "standardDeductionSalary": 75000,
          "section87A": { "limit": 500000, "maxRebate": 12500, "appliesToCG": false },
          "surcharge": [
            { "from": 5000000, "to": 10000000, "rate": 0.10 },
            { "from": 10000000, "to": 20000000, "rate": 0.15 },
            { "from": 20000000, "to": 50000000, "rate": 0.25 },
            { "from": 50000000, "to": null, "rate": 0.37 }
          ],
          "deductionCaps": {
            "80C": 150000,
            "80CCD1B": 50000,
            "80D_self": 25000,
            "80D_parents": 25000,
            "80D_senior_self": 50000,
            "80D_senior_parents": 50000,
            "80G_cash_limit": 2000,
            "80GG_monthly": 5000,
            "80TTA": 10000,
            "80TTB": 50000,
            "24b_selfOccupied": 200000,
            "familyPensionStdDed": 15000,
            "familyPensionStdDedPct": 0.333
          }
        }
      },
      "specialRates": {
        "stcg_111A": 0.20,
        "ltcg_112A": 0.125,
        "ltcg_112A_exemption": 125000,
        "lottery": 0.30,
        "casualIncome": 0.30,
        "debt_mf": "slab",
        "dividends": "slab"
      },
      "cess": 0.04,
      "carryForward": {
        "speculativeLoss": 4,
        "capitalLoss": 8,
        "hpLoss": 8,
        "businessLoss": 8
      },
      "deadlines": {
        "original": "2026-07-31",
        "revised": "2026-12-31",
        "belated": "2026-12-31"
      },
      "itrForms": {
        "ITR1": "Salary + up to 1 HP + OS, total income ≤ 50L, no CG, no business",
        "ITR2": "CG + multiple HP + foreign income, no business",
        "ITR3": "Business/profession including speculative intraday or F&O",
        "ITR4": "Presumptive taxation u/s 44AD/44ADA/44AE only"
      },
      "surchargeThresholds": {
        "scheduleALRequired": 5000000
      }
    }
  }
}
```
- `null` in slab `to` means "unbounded top slab"
- Old Regime has three slab keys: `slabs` (general, age < 60), `slabs_senior` (60–79), `slabs_super_senior` (80+). New Regime has no age differentiation — single `slabs` key only.
- Lottery and casualIncome flat rates now included (used by OS engine)
- Family pension deduction constants included
- `scheduleALRequired` threshold: Schedule AL required when total income exceeds this; not applicable for ITR-1 and ITR-4
- CLI validator (T62) must also validate: all three Old Regime slab arrays are present and internally contiguous
- Commit: `feat: tax-rules.json config`

---

### T61 · Refactor engine to read from config [parallel:no]
```
status:       [status:open]
estimate:     3h
depends_on:   T60
blocks:       T62, T63
```
- Create `src/engine/taxRules.ts` — loads `tax-rules.json`, exposes `getRules(ay: string, regime: 'new' | 'old', filerCategory?: 'general' | 'senior' | 'super_senior')`
- `getRules()` slab selection logic:
  - New Regime: always returns `slabs` (no age differentiation)
  - Old Regime + `'general'` or undefined: returns `slabs`
  - Old Regime + `'senior'`: returns `slabs_senior`
  - Old Regime + `'super_senior'`: returns `slabs_super_senior`
- Replace every hardcoded constant in `taxComputation.ts`, `scheduleCG.ts`, `scheduleBP_CFL.ts`, `warnings.ts` with `getRules()` lookups
- `computeSlabTax(income, slabs)` — takes slab array from config, not hardcoded
- `computeSurcharge(income, tax, surchargeConfig)` — takes surcharge array from config
- `computeRebate(slabTax, totalIncome, rebateConfig)` — takes rebate config
- All 28 existing engine unit tests must pass unchanged after refactor
- Add test: inject fake AY with different rates → engine output matches fake rates, not production values
- Add test: Old Regime, senior filer → `slabs_senior` used, ₹3L basic exemption applied correctly
- Add test: Old Regime, super-senior filer → `slabs_super_senior` used, ₹5L basic exemption applied
- Commit: `refactor: engine reads from tax-rules config`

---

### T62 · Tax rules CLI validator [parallel:no]
```
status:       [status:open]
estimate:     1h
depends_on:   T61
blocks:       T64
```
- Create `scripts/validate-tax-rules.ts` — run with `tsx scripts/validate-tax-rules.ts public/config/tax-rules.json`
- Validates per AY block: all required fields present, slab arrays contiguous (no gaps/overlaps), rates in range 0–1, deadlines valid ISO dates, `specialRates` keys present, `carryForward` values positive integers
- Old Regime specific: validates that `slabs`, `slabs_senior`, and `slabs_super_senior` are all present and each internally contiguous; checks that senior nil slab upper bound > general nil slab upper bound; checks that super-senior nil slab upper bound > senior nil slab upper bound
- Outputs: PASS / FAIL per AY block + specific field path and error description
- Add to `package.json`: `"validate-rules": "tsx scripts/validate-tax-rules.ts public/config/tax-rules.json"`
- Confirm: running validator on the bundled config outputs PASS
- Commit: `feat: tax rules CLI validator`

---

### T63 · AY selector in Settings [parallel:no]
```
status:       [status:open]
estimate:     1h
depends_on:   T61
blocks:       T64
```
- Settings screen (S11): add AY dropdown populated from keys in `tax-rules.json`
- Default to `defaultAY` from config
- Selected AY stored in `AppState.selectedAY`, passed to all engine calls
- "Current rules" collapsible panel in settings — shows loaded config for selected AY as formatted read-only display
- Show warning banner if selected AY ≠ `"2026-27"`: "Non-standard AY selected. Results may not apply to your filing."
- Commit: `feat: AY selector and rules display in settings`

---

### T64 · Static asset files: CII, IFSC, document registry [parallel:no]
```
status:       [status:open]
estimate:     1h
depends_on:   T62, T63
blocks:       Wave 11
```
Create three new static files:

**`public/config/cii.json`** — Cost Inflation Index for property LTCG:
```json
{
  "base_year": "2001-02",
  "values": {
    "2001-02": 100, "2002-03": 105, "2003-04": 109,
    "2004-05": 113, "2005-06": 117, "2006-07": 122,
    "2007-08": 129, "2008-09": 137, "2009-10": 148,
    "2010-11": 167, "2011-12": 184, "2012-13": 200,
    "2013-14": 220, "2014-15": 240, "2015-16": 254,
    "2016-17": 264, "2017-18": 272, "2018-19": 280,
    "2019-20": 289, "2020-21": 301, "2021-22": 317,
    "2022-23": 331, "2023-24": 348, "2024-25": 363,
    "2025-26": 381
  }
}
```

**`public/config/ifsc-prefixes.json`** — Bank name lookup from IFSC prefix (first 4 chars):
Include at minimum: SBIN, HDFC, ICIC, KKBK, UTIB, YESB, PUNB, BKID, UBIN, CNRB, BARB, IOBA, VIJB, IDIB, ALLA, CBIN, ANDB, CORP, DENA, ORBC, INDB, FDRL, TMBL, KVBL, DCBL, EQUB, IDFC, RATN, AUBL, NKGS — map each to full bank name string.

**`public/config/document-registry.json`** — Upload hub document definitions (see enhancement-design.md Section 9):
```json
{
  "documents": [
    { "id": "brokerPL", "label": "Broker Tax P&L", "required": true, "multiple": false, "maxCount": 1, "formats": [".xlsx"], "hint": "Zerodha / Groww / Upstox → Console → Tax P&L", "parsedBadge": "broker_name_detected", "errorOnMissing": "Required to compute capital gains and intraday income" },
    { "id": "form16", "label": "Form 16", "required": true, "multiple": true, "maxCount": 5, "formats": [".pdf"], "hint": "From employer — text-based only. Add one per employer.", "parsedBadge": "employer_name_detected", "addMoreLabel": "Add another Form 16" },
    { "id": "mfStatement", "label": "MF Capital Gains Statement", "required": false, "multiple": false, "maxCount": 1, "formats": [".json", ".pdf"], "hint": "CAMS / KFintech — JSON format preferred", "parsedBadge": "scheme_count_detected" },
    { "id": "form26AS", "label": "Form 26AS", "required": false, "multiple": false, "maxCount": 1, "formats": [".pdf", ".xlsx"], "hint": "TRACES → View 26AS → Download", "parsedBadge": "tds_entry_count" },
    { "id": "ais", "label": "AIS / TIS", "required": false, "multiple": false, "maxCount": 1, "formats": [".json", ".pdf"], "hint": "IT portal → AIS → Download JSON", "parsedBadge": "ais_salary_detected" },
    { "id": "previousITR", "label": "Previous Year ITR XML", "required": false, "multiple": false, "maxCount": 1, "formats": [".xml"], "hint": "Your AY 2025-26 filed ITR XML — for carry-forward losses", "parsedBadge": "cfl_entry_count" }
  ]
}
```
- Commit: `feat: static asset files — CII, IFSC, document registry`

---

## Wave 11 — Income model expansion

**Goal:** Full TypeScript type definitions for all 5 income heads (v2 shapes), plus the engine functions that compute each. No UI yet — pure types and engine.

**Gate:** All income head unit tests pass. `computeTotalIncome_v2()` correctly aggregates all 5 heads with correct set-off rules under both regimes. `detectITRForm()` routes all 4 test profiles correctly.

**Parallel tracks:** T66–T70 are independent and can run in parallel after T65.

---

### T65 · Types: expand income model [parallel:no]
```
status:       [status:open]
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
  netAnnualValue: number          // rent - municipal tax (0 for self-occ)
  standardDeduction30pct: number  // 30% of NAV — auto-computed
  interestOnLoan: number          // capped at ₹2L for self-occ under both regimes
  incomeFromHP: number            // NAV - 30% - interest (can be negative)
}
interface ScheduleHP {
  properties: HouseProperty[]
  totalIncomeFromHP: number
  totalInterest: number
  lossSetOffAgainstSalary: number  // Old Regime only, up to ₹2L
  lossRingFenced: number           // New Regime: ring-fenced, cannot set off
}
```

**Capital gains (expanded):**
```typescript
interface PropertySale {
  id: string
  address: string
  purchaseDate: string            // ISO date
  saleDate: string
  purchasePrice: number
  salePrice: number
  purchaseFY: string              // e.g. "2015-16" — for CII lookup
  saleFY: string                  // e.g. "2025-26"
  indexedCost: number             // auto-computed: purchasePrice × (CII_sale / CII_purchase)
  improvementCost: number
  transferExpenses: number
  netGain: number                 // salePrice - indexedCost - improvement - transfer
  gainType: 'STCG' | 'LTCG'      // STCG if held ≤ 2 years, LTCG otherwise
  exemptionClaimed: boolean       // Sec 54 / 54EC / 54F
  exemptionAmount: number
}
interface ScheduleCG_v2 extends ScheduleCG {
  propertySales: PropertySale[]
  propertySTCG: number
  propertyLTCG: number
  totalSTCG: number               // equity + mf + property
  totalLTCG: number
}
```

**Business & profession (expanded):**
```typescript
type BPIncomeType = 'speculative' | 'non_speculative' | 'presumptive_44AD' | 'presumptive_44ADA' | 'fno'
interface PresumptiveEntry {
  type: 'presumptive_44AD' | 'presumptive_44ADA'
  grossReceipts: number
  isDigital: boolean              // 44AD: 6% if digital, 8% if not
  presumptiveRate: number         // auto-set from type + isDigital
  presumptiveIncome: number       // auto-computed
}
interface FnOEntry {
  turnover: number
  taxableIncome: number
  notComputed: boolean            // always true in v2.0 — user referred to CA
}
interface ScheduleBP_v2 extends ScheduleBP {
  presumptiveEntries: PresumptiveEntry[]
  fno: FnOEntry | null
  nonSpeculativeIncome: number    // manual entry
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
  familyPensionStdDed: number     // auto-computed: min(pension/3, 15000)
}
interface ScheduleOS_v2 {
  breakdown: OtherSourcesBreakdown
  totalAtSlabRate: number
  totalAt30Pct: number            // lottery + casual
  total: number
}
```

**CFL (expanded for prior year entries):**
```typescript
interface CFLEntry {
  id: string
  lossType: 'speculative' | 'stcl' | 'ltcl' | 'hp' | 'business'
  ayOfOrigin: string              // e.g. "2024-25"
  amount: number
  yearsRemaining: number          // carry-forward years remaining
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

**Filer profile (new) — drives senior slab and 80TTB selection:**
```typescript
type FilerCategory = 'general' | 'senior' | 'super_senior'
// general: age < 60 as of 1 Apr of the previous FY year
// senior:  age 60–79
// super_senior: age ≥ 80
// Age reference date for AY 2026-27: 1 Apr 2025

interface FilerProfile {
  dateOfBirth: string | null      // ISO date e.g. "1960-06-15"
  filerCategory: FilerCategory    // computed from DOB; defaults to 'general' if DOB null
}

// Helper: computeFilerCategory(dob: string, ay: string): FilerCategory
// Compute age as of 1 Apr of (AY year - 1): for AY "2026-27" → 1 Apr 2025
// age < 60 → 'general'; 60–79 → 'senior'; ≥ 80 → 'super_senior'
```

**Schedule AL (new) — assets & liabilities for income > ₹50L:**
```typescript
interface ImmovableAsset {
  id: string
  description: string             // address or plot number
  assetType: 'residential' | 'commercial' | 'agricultural' | 'other'
  costOfAcquisition: number
}
interface ScheduleAL {
  immovableAssets: ImmovableAsset[]
  cashInHand: number
  deposits: number                // FD + RD + savings combined
  sharesDebentures: number        // market value as of 31 Mar
  insurancePolicies: number       // surrender value
  loansAdvances: number
  motorVehicles: number
  jewellery: number
  archaeologicalArt: number
  otherAssets: number
  liabilityImmovable: number
  liabilityOther: number
  totalAssets: number             // auto-computed sum of all asset fields
  totalLiabilities: number        // auto-computed sum of liability fields
}
```
- Commit: `feat: expanded income type definitions v2`

---

### T66 · Engine: multi-employer salary [parallel:yes]
```
status:       [status:open]
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
status:       [status:open]
estimate:     2h
depends_on:   T65
blocks:       T71
```
- `computeScheduleHP(properties: HouseProperty[], regime: 'new' | 'old', overrides): ScheduleHP`
- Self-occupied: NAV = 0; interest capped at ₹2L (`getRules().deductionCaps['24b_selfOccupied']`)
- Let-out: NAV = annualRentReceived − municipalTaxPaid; stdDeduction30pct = NAV × 0.30; full interest deductible
- HP loss under Old Regime: can set off against other income up to ₹2L. Ring-fenced under New Regime.
- `lossSetOffAgainstSalary`: min(abs(totalIncomeFromHP), 200000) if Old Regime and totalIncomeFromHP < 0; else 0
- `lossRingFenced`: abs(totalIncomeFromHP) if New Regime and totalIncomeFromHP < 0; else 0
- Unit tests: self-occ no income, let-out profit, let-out loss Old Regime, let-out loss New Regime, two properties
- Commit: `feat: house property income computation`

---

### T68 · Engine: expanded capital gains — property [parallel:yes]
```
status:       [status:open]
estimate:     2h
depends_on:   T65
blocks:       T71
```
- `computePropertyCG(sales: PropertySale[], overrides): { propertySTCG: number, propertyLTCG: number, updatedSales: PropertySale[] }`
- CII lookup: load `cii.json`, compute `indexedCost = purchasePrice × (CII[saleFY] / CII[purchaseFY])`
- If CII year not found: set `indexedCost = purchasePrice` and add a warning "CII for [FY] not found — using purchase price as cost"
- STCG: held ≤ 2 years (compare purchaseDate to saleDate)
- LTCG: held > 2 years, apply indexation
- Subtract `exemptionAmount` from LTCG if `exemptionClaimed`
- Merge property STCG/LTCG into existing `ScheduleCG_v2` totals
- Unit tests: STCG property, LTCG with indexation, 54EC exemption applied, missing CII year fallback
- Commit: `feat: property capital gains with indexation`

---

### T69 · Engine: business & profession expanded [parallel:yes]
```
status:       [status:open]
estimate:     2h
depends_on:   T65
blocks:       T71
```
- `computeScheduleBP_v2(brokerData, presumptiveEntries, fno, nonSpeculative, overrides): ScheduleBP_v2`
- Speculative (intraday): same as v1.0 — from brokerData
- Presumptive 44AD: `presumptiveIncome = grossReceipts × (isDigital ? 0.06 : 0.08)`
- Presumptive 44ADA: `presumptiveIncome = grossReceipts × 0.50`
- F&O: if fno provided → set `notComputed: true`, include `turnover` for audit flag, add CA referral warning
- Non-speculative: `nonSpeculativeIncome − nonSpeculativeLoss` — loss can offset any non-salary head
- Unit tests: each income type separately, presumptive digital vs non-digital, F&O flag, combined
- Commit: `feat: expanded BP computation`

---

### T70 · Engine: expanded other sources [parallel:yes]
```
status:       [status:open]
estimate:     1h
depends_on:   T65
blocks:       T71
```
- `computeScheduleOS_v2(breakdown: OtherSourcesBreakdown, overrides): ScheduleOS_v2`
- Family pension deduction: `min(breakdown.familyPension × getRules().deductionCaps['familyPensionStdDedPct'], getRules().deductionCaps['familyPensionStdDed'])`
- `totalAtSlabRate`: savings + FD + RD + senior + dividend + foreignDividend + taxableGifts (above 50k from non-relatives) + familyPension − familyPensionStdDed
- `totalAt30Pct`: lottery + casual (flat rate from `getRules().specialRates.lottery`)
- `total`: totalAtSlabRate + totalAt30Pct
- Unit tests: each income type, family pension deduction cap, lottery flat rate
- Commit: `feat: expanded other sources computation`

---

### T71 · Engine: master computeTotalIncome_v2 + ITR form detection [parallel:no]
```
status:       [status:open]
estimate:     2h
depends_on:   T66, T67, T68, T69, T70
blocks:       Wave 12
```
- `computeTotalIncome_v2(schedules_v2, regime: 'new' | 'old'): { total, heads, cylaAdjusted }`
- Apply set-off rules in order:
  1. HP loss → salary (Old Regime only, cap `24b_selfOccupied` per rules)
  2. Non-speculative business loss → all non-salary heads
  3. STCL → STCG first, then LTCG
  4. LTCL → LTCG only
  5. Speculative loss → speculative income only (ring-fenced)
  6. HP loss (New Regime) → ring-fenced, no set-off
- `computeWarnings_v2()`: extend v1.0 warnings with:
  - HP loss ring-fenced under New Regime
  - F&O detected (if `fno.notComputed`)
  - Property CII year not found
  - Old Regime selected with zero deductions entered
  - Schedule AL required (income > `surchargeThresholds.scheduleALRequired`) — fires as error, not info
  - Senior citizen with no 80TTB entry under Old Regime (info)
  - DOB not entered and Old Regime selected (soft warning)
  - ITR-4 selected but filer has salary or CG income (error)
- `detectITRForm(schedules_v2): 'ITR1' | 'ITR2' | 'ITR3' | 'ITR4'`
  - Evaluation order matters — check from most complex to simplest:
  1. Has non-presumptive business, speculative intraday, or F&O → **ITR-3**
  2. Has presumptive income (44AD/44ADA) AND also has salary, CG, or HP → **ITR-3** (mixed profile; ITR-4 is only for pure presumptive filers)
  3. Has presumptive income (44AD/44ADA) ONLY, no other complex income → **ITR-4**
  4. Has CG (equity/MF/property) OR multiple HP OR foreign income, no business → **ITR-2**
  5. Salary + ≤1 HP + OS only, total income ≤ ₹50L, no CG, no business → **ITR-1**
  6. Fallback: **ITR-2** (catch-all for anything not matched above)
- `computeScheduleALRequired(totalIncome, selectedITRForm): boolean`
  - Returns true if totalIncome > 5000000 AND selectedITRForm is 'ITR2' or 'ITR3'
  - ITR-1 and ITR-4 never require Schedule AL
- Unit tests: all 28 existing pass; new tests cover each income combo; each ITR form detected correctly including ITR-4 pure presumptive, ITR-3 mixed presumptive+salary
- Commit: `feat: master income aggregation v2 + ITR form detection`

---

## Wave 12 — Deductions + tax credits + bank accounts

**Goal:** Chapter VI-A deductions engine, tax credits schema, bank account schema. Old Regime tax computable end-to-end.

**Gate:** Old Regime tax computed correctly with all deductions and caps enforced.
`computeNetPayable()` uses `TaxCredits` for TDS, advance tax, self-assessment.
Bank account schema is complete and validatable.

**Parallel tracks:** T72 and T73 are independent and can run in parallel.

---

### T72 · Types + engine: Chapter VI-A deductions [parallel:yes]
```
status:       [status:open]
estimate:     2h
depends_on:   Wave 11 complete
blocks:       T74
```
Add to `src/types/index.ts`:
```typescript
interface DonationEntry {
  institution: string
  amount: number
  deductiblePct: 0.50 | 1.00
  cashAmount: number              // must not exceed ₹2,000
}
interface DeductionsVI_A {
  sec80C: number
  sec80CCC: number                // within 80C cap
  sec80CCD1: number               // within 80C cap
  sec80CCD1B: number              // extra ₹50k beyond 80C
  sec80CCD2: number               // employer NPS — New Regime allowed
  sec80CCH: number                // Agnipath — New Regime allowed
  sec80D_self: number
  sec80D_parents: number
  sec80E: number
  sec80EEA: number
  sec80G: DonationEntry[]
  sec80GG: number
  sec80TTA: number                // auto-populated from OS breakdown
  sec80TTB: number                // senior citizen — replaces 80TTA
  total: number                   // computed by engine
}
```
Engine `computeDeductionsVI_A(raw: DeductionsVI_A, regime: 'new' | 'old', filerCategory: FilerCategory): DeductionsVI_A`:
- New Regime: only `sec80CCD2` and `sec80CCH` apply — zero all others regardless of age
- Old Regime: apply caps from `getRules().deductionCaps`:
  - `sec80C + sec80CCC + sec80CCD1` capped at `80C` (150000)
  - `sec80CCD1B` capped at `80CCD1B` (50000) — separate from 80C cap
  - `sec80D_self` cap: if `filerCategory === 'general'` → `80D_self` (25000); if senior/super-senior → `80D_senior_self` (50000)
  - `sec80D_parents` cap: if parents are senior (toggle on screen) → `80D_senior_parents` (50000); else `80D_parents` (25000)
  - `sec80G` cash amounts: each cash donation ≤ 2000; otherwise zero that donation's cash portion
  - `sec80GG` capped at `80GG_monthly × 12`
  - `sec80TTA` / `sec80TTB`: if `filerCategory === 'general'` → `sec80TTA` capped at 10000, `sec80TTB` = 0; if `filerCategory === 'senior'` or `'super_senior'` → `sec80TTB` capped at 50000, `sec80TTA` = 0 (80TTB replaces 80TTA for seniors)
- Unit tests: New Regime zeroes all except 80CCD2/80CCH; Old Regime general cap enforcement; Old Regime senior 80D cap (₹50k); Old Regime super-senior same as senior for 80D; 80TTB replaces 80TTA for senior; parents senior toggle
- Commit: `feat: Chapter VI-A deductions engine`

---

### T73 · Types + engine: tax credits [parallel:yes]
```
status:       [status:open]
estimate:     2h
depends_on:   Wave 11 complete
blocks:       T74
```
Add to `src/types/index.ts`:
```typescript
interface TDSEntry {
  id: string
  tanDeductor: string
  deductorName: string
  grossAmount: number
  tdsAmount: number
  section: string                 // '192' salary, '194' dividend, '194A' interest
  source: 'form16' | 'form26AS' | 'ais' | 'manual'
}
interface ChallanEntry {
  id: string
  bsrCode: string
  challanDate: string             // ISO date
  serialNumber: string
  amount: number
  assessmentYear: string
  type: 'advance_tax' | 'self_assessment'
}
interface TaxCredits {
  tdsEntries: TDSEntry[]
  advanceTaxPaid: ChallanEntry[]
  selfAssessmentTax: ChallanEntry[]
  tcsCredits: number              // manual entry
  totalTDSDeducted: number        // sum of tdsEntries
  totalAdvanceTax: number         // sum of advanceTaxPaid
  totalSelfAssessment: number     // sum of selfAssessmentTax
  totalCredits: number            // all three totals summed
}
```
Engine `computeNetPayable(totalTax: number, credits: TaxCredits): number`:
- `netPayable = totalTax - credits.totalCredits`
- `computeCredits(credits: TaxCredits): TaxCredits` — recomputes all three sums
- Unit tests: TDS from multiple sources, advance tax across installments, combined, zero credits
- Bank account schema (in same task for compactness):
```typescript
interface BankAccount {
  id: string
  ifscCode: string
  accountNumber: string           // stored full, displayed masked (last 4)
  bankName: string                // auto-filled from ifsc-prefixes.json
  accountType: 'savings' | 'current' | 'overdraft'
  isRefundAccount: boolean
  isForeign: boolean
  swiftCode?: string
  bankCountry?: string
}
```
- `validateBankAccount(account: BankAccount): string[]` — returns array of validation error strings:
  - IFSC format: must match `/^[A-Z]{4}0[A-Z0-9]{6}$/`
  - Account number: numeric, 9–18 digits
  - If `isForeign`: SWIFT code required
  - If `isRefundAccount` and `isForeign`: allowed but add info warning
- `lookupBankName(ifsc: string): string | null` — reads first 4 chars, looks up in `ifsc-prefixes.json`
- Unit tests: valid IFSC, invalid format, duplicate account check, refund account validation
- Commit: `feat: tax credits + bank accounts schema and engine`

---

### T74 · Wire deductions + credits into tax engine [parallel:no]
```
status:       [status:open]
estimate:     1h
depends_on:   T72, T73
blocks:       Wave 13
```
- Update `computeTax()` to accept `deductions: DeductionsVI_A` and `regime`
- Old Regime: subtract `deductions.total` from slab-taxable income before slab computation
- New Regime: only subtract `sec80CCD2 + sec80CCH`
- Update `computeNetPayable()` to accept `TaxCredits` instead of bare TDS figure
- Add `deductions` and `taxCredits` to `AppState`
- Recomputation trigger: any change to `deductions` or `taxCredits` fires `computeTax()` for both regimes
- All 28 existing tests still pass
- Commit: `feat: wire deductions and credits into tax engine`

---

## Wave 13 — Document expansion + AIS + prior ITR

**Goal:** Parse Form 26AS, AIS JSON, and prior year ITR XML. Rebuild S02 upload hub
driven by document registry. AIS cross-validation engine complete.

**Gate:** All three new parsers produce correctly typed output. AIS cross-validation detects the 3 severity levels correctly. Prior ITR CFL entries load into `AppState` and expired entries are filtered. S02 hub is driven by registry JSON with no hardcoded document slots.

**Parallel tracks:** T75, T76, T77 are independent and can run in parallel.

---

### T75 · Form 26AS parser [parallel:yes]
```
status:       [status:open]
estimate:     2h
depends_on:   Wave 12 complete
blocks:       T78
```
- `parseForm26AS(file: File): Promise<Form26ASData>`
- Detection: Excel → check for "26AS" in sheet name or cell A1. PDF → check first 200 chars of extracted text.
- Extract Part A (TDS deducted by deductors):
  - Per row: TAN, deductor name, section code, paid/credited amount, TDS amount
  - Map to `TDSEntry[]` with `source: 'form26AS'`
- Extract Part C (advance tax/self-assessment):
  - Per row: BSR code, challan date, serial number, amount, type (advance/self-assessment)
  - Map to `ChallanEntry[]`
- Set `parseStatus_v2.form26AS = 'done' | 'error'`
- Show metadata badge on S02: "26AS: {N} TDS entries found"
- Unit tests with sample Excel 26AS, sample PDF 26AS
- Commit: `feat: Form 26AS parser`

---

### T76 · AIS JSON parser + cross-validation engine [parallel:yes]
```
status:       [status:open]
estimate:     3h
depends_on:   Wave 12 complete
blocks:       T78
```
Parser `parseAIS(file: File): Promise<AISData>`:
- Handle JSON format from IT portal `compliance.gov.in`
- Extract: salary (per employer), dividends (per company), interest (per payer + type), securities transactions, MF transactions, TDS credits, advance tax challans
- Set `parseStatus_v2.ais = 'done' | 'error'`
- Show metadata badge on S02: "AIS: salary ₹{amount} detected"
- Unit tests with sample AIS JSON

Cross-validation engine `crossValidateWithAIS(parsedData, aisData): AISMismatch[]`:
```typescript
interface AISMismatch {
  field: string                   // e.g. 'grossSalary', 'dividendIncome'
  fieldLabel: string              // Human-readable label for display
  parsedValue: number
  aisValue: number
  delta: number                   // abs(parsed - ais)
  deltaPct: number                // delta / aisValue × 100
  severity: 'info' | 'warn' | 'error'
  description: string             // explanation of likely cause
}
```
- Fields to compare: grossSalary, tdsDeducted, dividendIncome, savingsInterest, fdInterest, equitySTCG, equityLTCG, mfSTCG, mfLTCG
- Severity: delta = 0 → no entry; deltaPct ≤ 5 → 'info'; 5 < deltaPct ≤ 20 → 'warn'; deltaPct > 20 → 'error'
- `description` is canned text per field (e.g. for fdInterest 'error': "Large FD interest mismatch. Check if all bank FD accounts are included.")
- Unit tests: exact match no entry, 3% delta → info, 12% → warn, 35% → error
- Commit: `feat: AIS parser and cross-validation engine`

---

### T77 · Prior ITR XML parser [parallel:yes]
```
status:       [status:open]
estimate:     2h
depends_on:   Wave 12 complete
blocks:       T78
```
- `parsePriorITRXML(file: File): Promise<CFLEntry[]>`
- Parse XML using `DOMParser` (client-side, no server)
- Target node: `<ScheduleCFL>` — extract per-type, per-AY entries
- Loss types to extract: speculative, STCL, LTCL, HP loss, business loss
- For each entry: `ayOfOrigin` from XML, compute `yearsRemaining` against `carryForward` limits from tax-rules config
  - Speculative: 4 years. Capital + HP + Business: 8 years.
  - If AY of origin is AY 2022-23 and it's now AY 2026-27 → 4 years elapsed → speculative expired (filter out), capital has 4 remaining
- Set `source: 'prior_itr'` on all extracted entries
- Filter out expired entries (yearsRemaining ≤ 0), log them as info warnings
- Show badge on S02: "Prior ITR: {N} carry-forward entries found"
- Unit tests: ITR-2 XML, ITR-3 XML, all expired (filter all), partial expiry
- Commit: `feat: prior ITR XML carry-forward parser`

---

### T78 · S02 document hub v2 + S03 parsing progress v2 [parallel:no]
```
status:       [status:open]
estimate:     2h
depends_on:   T75, T76, T77
blocks:       Wave 14
```
Rebuild S02 to be registry-driven:
- Load `document-registry.json` on mount — render one `DocumentCard` per entry
- `DocumentCard` component reads: id, label, required, multiple, maxCount, formats, hint, parsedBadge, addMoreLabel from registry
- Required documents: red dot indicator when missing; green checkmark when valid
- Optional documents: greyed with "Add for better accuracy" hint when empty; metadata badge after successful upload
- Form 16 slot: shows "+ Add another Form 16" when `multiple: true`; stacks uploaded files as separate FileCard items up to `maxCount`
- Parse button: enabled only when all `required` documents are valid
- AY validation on Form 16 upload: surface error immediately if AY ≠ 2026-27

Update S03 parsing progress to show status cards for all 6 possible documents:
- Only show cards for documents that were actually uploaded
- Sequential parse order: brokerPL → form16 (all) → mfStatement → form26AS → ais → previousITR
- Each new document type gets its own `ParseProgressCard` with relevant milestone labels
- Commit: `feat: document hub v2 + parsing progress v2`

---

## Wave 14 — Regime comparison + AppState v2

**Goal:** Full regime comparison engine and screen. AppState expanded to carry all
v2 slices. Navigation flow updated for new screens.

**Gate:** Regime comparison correctly computes both regimes side-by-side and identifies the winner. Switching regime updates AppState and triggers full recompute. All v2 state slices initialise correctly and persist correctly per rules in enhancement-design.md Section 6.

---

### T79 · AppState v2 — expand state shape and persistence [parallel:no]
```
status:       [status:open]
estimate:     2h
depends_on:   Wave 13 complete
blocks:       T80, T81
```
Extend `AppState` (do not replace — add new fields alongside v1.0 fields):
- `selectedAY: string` — defaults to `defaultAY` from config (persisted)
- `selectedRegime: 'new' | 'old'` — defaults to `'new'` (persisted)
- `selectedITRForm: 'ITR1' | 'ITR2' | 'ITR3' | 'ITR4'` — from auto-detect, overridable (persisted)
- `detectedITRForm` — always from `detectITRForm()`, not persisted (recomputed)
- `filerProfile: FilerProfile` — DOB + computed filerCategory; defaults to `{ dateOfBirth: null, filerCategory: 'general' }` (persisted)
- `files_v2` — File[] for form16, File for others — not persisted
- `parsed_v2` — Form16Data[], AISData | null, Form26ASData | null, CFLEntry[] — persisted
- `schedules_v2` — ScheduleS_v2, ScheduleHP, ScheduleCG_v2, ScheduleBP_v2, ScheduleOS_v2, ScheduleCYLA, ScheduleCFL_v2 — persisted
- `deductions: DeductionsVI_A` — persisted
- `taxCredits: TaxCredits` — persisted
- `regimeComparison` — persisted (both computations)
- `aisMismatches: AISMismatch[]` — not persisted (recomputed from AIS + parsed data)
- `aisMismatchResolutions: Record<string, 'use_ais' | 'keep_parsed'>` — persisted
- `bankAccounts: BankAccount[]` — persisted
- `scheduleAL: ScheduleAL | null` — persisted; null until user enters data; only relevant when `computeScheduleALRequired()` returns true
- `parseStatus_v2` — not persisted

**New recomputation triggers (additions to enhancement-design.md Section 6.3):**
- `computeFilerCategory()` re-runs when `filerProfile.dateOfBirth` changes → updates `filerProfile.filerCategory`
- `computeDeductionsVI_A()` re-runs when `filerProfile.filerCategory` changes (different caps for senior)
- `computeScheduleALRequired()` re-runs when `tax.totalIncome` or `selectedITRForm` changes
- `scheduleAL` field in AppState initialises to `null`; set to a blank `ScheduleAL` object (all zeros) when `computeScheduleALRequired()` first returns true mid-session and show `ALThresholdBanner`

Update `useSessionStorage` hook to serialise/deserialise new persisted slices.
All existing v1.0 state slices and persistence behaviour unchanged.
- Commit: `feat: AppState v2 — expanded state shape and persistence`

---

### T80 · Engine: regime comparison [parallel:no]
```
status:       [status:open]
estimate:     2h
depends_on:   T79
blocks:       T81
```
- `computeRegimeComparison(schedules_v2, deductions, taxCredits, filerProfile): RegimeComparison`:
  ```typescript
  interface RegimeComparison {
    new: TaxComputation
    old: TaxComputation
    recommended: 'new' | 'old'
    saving: number                // abs(new.netPayable - old.netPayable)
  }
  ```
- Run `computeTotalIncome_v2(schedules_v2, 'new')` and `computeTotalIncome_v2(schedules_v2, 'old')` independently
- Run `computeDeductionsVI_A(deductions, 'new', filerProfile.filerCategory)` and `computeDeductionsVI_A(deductions, 'old', filerProfile.filerCategory)` — passes age category so senior caps apply correctly
- Run `computeTax()` for each regime using `getRules(selectedAY, regime, filerProfile.filerCategory)` — selects correct slab array
- `recommended`: whichever regime has lower `netPayable`; if equal → `'new'` (simpler regime)
- `saving`: absolute difference in `netPayable`
- Store result in `AppState.regimeComparison`
- Trigger: recompute whenever any income, deduction, credit, or `filerProfile.filerCategory` value changes
- Unit tests: New Regime wins (high income, no deductions), Old Regime wins (high 80C/80D), equal → recommends New; senior filer → correct slab applied in Old Regime computation; super-senior filer → ₹5L nil slab applied
- Commit: `feat: regime comparison engine`

---

### T81 · Navigation flow update + StepProgress v2 [parallel:no]
```
status:       [status:open]
estimate:     1h
depends_on:   T79, T80
blocks:       Wave 15
```
Update router and `StepProgress` component for the new flow:
```
S01 → S02 → S03 → S04 → S05 → S06 → [S07 if AIS uploaded] → S12 → [S13 if income > ₹50L AND ITR-2 or ITR-3] → S08 → S09
```
- `StepProgress` now shows 5 steps: Upload → Income → Deductions → Review → Export
  - "Review" step covers S06, S07 (optional), S12, S13 (conditional) as a group
- `navigateNext()` skip logic:
  - From S06: if `parsed_v2.aisData !== null` → S07; else → S12
  - From S07: always → S12
  - From S12: if `computeScheduleALRequired(tax.totalIncome, selectedITRForm)` → S13; else → S08
  - From S13: always → S08
- `ITRFormBadge` and `RegimeBadge` components: small pill badges shown in AppShell next to app name on screens S04–S09
- `ALThresholdBanner` component: shown on S04/S08 when total income crosses ₹50L threshold mid-session — "Schedule AL is now required. It has been added to your review flow."
- Adaptive tab visibility in S04: `IncomeHubTabs` reads `schedules_v2` to determine which tabs have data; tabs with all-zero values are greyed but clickable (user may want to add manual data)
- **Settings screen (S11) — add DOB field:**
  - New "Personal details" section: date of birth input (date picker)
  - On DOB entry: `computeFilerCategory()` runs, updates `filerProfile`, shows computed category as badge ("Senior citizen (60–79)" or "Super senior citizen (80+)" or "General")
  - Soft prompt shown on S11 if DOB not entered and Old Regime selected: "Enter your date of birth to apply the correct tax slab."
- Commit: `feat: navigation flow v2 + StepProgress v2`

---

## Wave 15 — Screens v2 + XML v2 + integration

**Goal:** All new screens built and wired. Multi-form XML generation correct for ITR-1/2/3/4.
Full end-to-end integration test across 5 income profiles.

**Gate:** All screens navigable including S13 (Schedule AL, conditional). Income hub 5 tabs correct for all profiles. Deductions screen shows senior-specific caps when filerCategory is senior/super-senior. Regime comparison uses correct slab array per filerCategory. AIS validation screen shows mismatches and resolves them. Bank accounts screen validates and persists. Schedule AL screen appears for income > ₹50L on ITR-2/ITR-3, absent for ITR-1/ITR-4. Tax summary shows income breakdown. Export downloads correct XML per form (ITR-1/2/3/4). 5 integration profiles pass.

**Screens must be built in dependency order** — no parallel tracks in this wave.

---

### T82 · S04 Income hub — 5-tab screen [parallel:no]
```
status:       [status:open]
estimate:     4h
depends_on:   Wave 14 complete
blocks:       T83
```
Rebuild S04. All tabs read from `schedules_v2` in AppContext via `EditableField` components.

**Salary tab:**
- One `EmployerCard` per `schedules_v2.S.employers` entry — collapsible, expanded if only one
- Fields per card: Gross, Std deduction (fixed label, no edit), Prof tax, Net taxable, TDS — all editable
- AIS mismatch badge on Gross and TDS fields if `aisMismatches` contains a match for that field
- "+ Add employer" button → opens inline blank `EmployerCard` in edit mode; saving it adds to `employers` array

**House property tab:**
- "+ Add property" button → opens `AddPropertyModal`
- `AddPropertyModal`: address field, property type dropdown (self-occ / let-out / deemed), annual rent (disabled if self-occ), municipal tax, loan interest; Save computes NAV and income/loss
- Each property renders as a card: NAV calculation shown step-by-step, income/loss in red if negative
- Regime note inline if HP loss: "Under New Regime, this loss is ring-fenced and cannot be set off."

**Capital gains tab:**
- 4 sub-tabs: Equity Delivery / Equity MF / Property / Other
- Equity and MF: read from `schedules_v2.CG`, EditableField for STCG/LTCG, SourceTag showing parser source
- Property sub-tab: "No property sales" placeholder with "+ Add property sale" → opens `PropertySaleModal`
- `PropertySaleModal`: address, purchase date, sale date, purchase price, sale price, improvement, transfer expenses; on save — auto-compute indexed cost via CII lookup and show computed gain
- CYLA section below sub-tabs: shows which losses are being set off against which gains (read-only derived display)

**Business tab:**
- Speculative card: auto-populated from broker data (same as v1.0 ScheduleBP but in new tab)
- F&O card: always shown if `schedules_v2.BP.fno !== null`; turnover and taxable income fields editable; CA referral warning
- "+ Add presumptive income" → expands inline card: type (44AD / 44ADA), gross receipts, digital toggle, computed income shown
- "+ Add non-speculative income" → revenue and expenses fields

**Other sources tab:**
- All fields from `OtherSourcesBreakdown` as `EditableField` items
- 80TTA cap indicator shown next to savings interest field (Old Regime only)
- Tax rate note next to each field: "(slab rate)" or "(30% flat)" or "(exempt below ₹50,000)"

**Navigation footer on all tabs:**
- `ITRFormBadge` showing detected form
- "Continue to Deductions →" button
- Commit: `feat: S04 income hub 5-tab screen`

---

### T83 · S05 Deductions screen [parallel:no]
```
status:       [status:open]
estimate:     2h
depends_on:   T82
blocks:       T84
```
- New screen at `/review/deductions`
- New Regime view: show only 80CCD2 and 80CCH fields; all other sections greyed with "Not applicable under New Regime"; "Compare Old vs New Regime →" link at bottom
- Old Regime view: full Chapter VI-A form
  - Section 80C group: LIC, PPF, ELSS, home loan principal, tuition fees — individual fields; cap progress bar below showing `(sec80C + sec80CCC + sec80CCD1) / 150000`
  - Section 80CCD1B: separate field with note "Extra ₹50,000 beyond 80C cap"
  - Section 80D: self+family field with cap shown dynamically based on `filerCategory` (₹25,000 general / ₹50,000 senior/super-senior); parents field with "Parents are senior citizens" toggle that switches cap to ₹50,000
  - Section 80E, 80EEA: individual fields
  - Section 80G: "+ Add donation" creates a row with institution name, amount, deductible % dropdown, cash amount field + ₹2,000 warning
  - Section 80TTA/80TTB: shown based on `filerCategory`:
    - General filer: shows 80TTA field (cap ₹10,000), auto-populated from `schedules_v2.OS.breakdown.savingsInterest`, read-only with note "Capped at ₹10,000"
    - Senior / super-senior filer: shows 80TTB field (cap ₹50,000) instead of 80TTA; auto-populated from `savingsInterest + fdInterest + rdInterest`; note "80TTB replaces 80TTA for senior citizens (cap ₹50,000)"
  - If `filerProfile.filerCategory` is 'senior' or 'super_senior': show info banner at top of deductions screen — "You are a senior citizen. Higher deduction caps apply for 80D (₹50,000) and 80TTB (₹50,000)."
- Live total at bottom updates on any edit
- All deduction edits write to `AppState.deductions` → trigger `computeRegimeComparison()` recompute
- Commit: `feat: S05 deductions screen`

---

### T84 · S06 Regime comparison screen [parallel:no]
```
status:       [status:open]
estimate:     2h
depends_on:   T83
blocks:       T85
```
- New screen at `/review/regime`
- Read from `AppState.regimeComparison`
- `RegimeComparisonTable`: rows per enhancement-design.md S06 layout; columns New / Old; value formatting: ₹ with commas; negative values in red
- `RegimeRecommendationCard`: highlighted in green (recommended regime saves money) or neutral (equal); shows saving amount; "Switch to [regime]" button
- Switch button: updates `AppState.selectedRegime`, triggers full engine recompute for both regimes, persists to localStorage
- "Download comparison PDF" button: generates two-column jsPDF with same table layout
- If regimes equal: "Both regimes produce the same net payable. New Regime is recommended as it requires fewer deduction proofs."
- Navigation: "Continue to AIS Validation →" (if AIS uploaded) or "Continue to Bank Accounts →"
- Commit: `feat: S06 regime comparison screen`

---

### T85 · S07 AIS validation screen [parallel:no]
```
status:       [status:open]
estimate:     2h
depends_on:   T84
blocks:       T86
```
- New screen at `/review/ais`
- Shown only if `AppState.parsed_v2.aisData !== null` — if no AIS, this route redirects to S12
- `AISSummaryCard`: counts of match / warn / error mismatches at top
- Per-mismatch `AISMismatchRow`:
  - Shows: field label, your parsed value, AIS value, delta (₹ and %), severity badge
  - "Use AIS value" button: writes AIS value to `AppState.overrides` keyed by field path, writes `'use_ais'` to `aisMismatchResolutions`, triggers recompute
  - "Keep my value" button: writes `'keep_parsed'` to `aisMismatchResolutions`, dismisses the mismatch row
- Already-resolved rows: show collapsed with resolution label ("Using AIS value" / "Kept your value") + "Undo" link
- Zero mismatches: full green card "✓ All values match AIS — no discrepancies found"
- If AIS not uploaded: prompt card with link to IT portal AIS download instructions; "Skip →" button
- Commit: `feat: S07 AIS validation screen`

---

### T86 · S12 Bank accounts screen [parallel:no]
```
status:       [status:open]
estimate:     2h
depends_on:   T85
blocks:       T87
```
- New screen at `/review/bank-accounts`
- Reads/writes `AppState.bankAccounts`
- Each existing account: `BankAccountCard` showing masked account (●●●●last4), IFSC, bank name, type, refund star; "Edit" and "Remove" buttons
- "+ Add bank account" button: expands `AddBankAccountForm` inline
  - IFSC field: validates format on blur; auto-fills bank name from `ifsc-prefixes.json` on valid entry; shows "Bank not found in lookup — enter manually" if not in table
  - Account number: numeric only; masked to last 4 on blur
  - Account type dropdown: savings / current / overdraft
  - "Mark as refund account" checkbox: selecting it deselects previous refund account with a toast
  - Foreign bank toggle: reveals SWIFT + country fields
  - Save: runs `validateBankAccount()` — shows inline validation errors; on success adds to `bankAccounts` array
- Validation gate: "Continue to Summary →" button disabled if zero accounts; tooltip "Add at least one bank account to continue"
- Exactly one refund account enforcement: remove warning if user tries to remove the only account or the refund account
- Commit: `feat: S12 bank accounts screen`

---

### T87 · S08 Tax summary v2 + S09 Export v2 [parallel:no]
```
status:       [status:open]
estimate:     2h
depends_on:   T91
blocks:       T88
```
**Tax Summary v2 (S08 at `/summary`):**
- Add filing context row at top: "Filing ITR-3 · New Regime · AY 2026-27" — reads `selectedITRForm` + `selectedRegime` + `selectedAY`
- Add 5 income head `MetricCard` row below context: Salary / HP / CG / Business / Other — values from `schedules_v2`; negative values red
- Add "Prior year losses used" section below computation table: shown only if `schedules_v2.CFL.entries.some(e => e.source === 'prior_itr' && setOffThisYear > 0)`; each entry shows loss type, AY of origin, amount used, remaining carry-forward years
- Existing computation table and warnings unchanged
- Warnings list updated to include v2 warning types from `computeWarnings_v2()`

**Export v2 (S09 at `/export`):**
- Three download cards: ITR XML / Tax Summary PDF / Regime Comparison PDF
- XML card header shows `selectedITRForm`: "ITR-3 XML — AY 2026-27" or "ITR-1 XML — AY 2026-27"
- Regime Comparison PDF card: shown only if `AppState.regimeComparison !== null`
- Portal instructions: updated per form — ITR-1 has a simpler upload path note
- Commit: `feat: S08 tax summary v2 + S09 export v2`

---

### T91 · S13 Schedule AL screen [parallel:no]
```
status:       [status:open]
estimate:     2h
depends_on:   T86
blocks:       T87
```
- New screen at `/review/schedule-al`
- Shown only when `computeScheduleALRequired(AppState.tax.totalIncome, AppState.selectedITRForm)` returns true — otherwise route from S12 skips directly to S08
- On mount: if `AppState.scheduleAL` is null, initialise with blank `ScheduleAL` object (all numeric fields = 0, `immovableAssets: []`)
- **Immovable assets section:**
  - "+ Add property" button → `AddImmovableAssetForm` inline: description field, type dropdown (residential / commercial / agricultural / other), cost of acquisition field
  - Each saved property renders as `ImmovableAssetCard`: description, type badge, cost; Edit and Remove buttons
- **Movable assets section:** `EditableField` for each field — cash, deposits, shares/debentures, insurance, loans given, vehicles, jewellery, archaeological/art, other
- **Liabilities section:** `EditableField` for liabilityImmovable and liabilityOther
- Auto-computed totals: `totalAssets` and `totalLiabilities` update live on any field change
- Context note below each field group: "Values as of 31 March 2026. Report cost of acquisition for immovable assets; market/surrender value for movable assets."
- Validation: all numeric fields must be filled (zero is valid) before "Continue" is enabled — no blank fields allowed in XML
- "Continue to Summary →" button: navigates to S08
- Warning at top if user arrives here mid-session via income edit that pushed total over ₹50L: shows `ALThresholdBanner`
- Unit tests: blank initialisation, add/remove immovable asset, totals computed correctly
- Commit: `feat: S13 Schedule AL screen`

---

### T88 · XML generator v2 — multi-form support [parallel:no]
```
status:       [status:open]
estimate:     3h
depends_on:   T87
blocks:       T89
```
- `generateXML(state)` — router function: calls correct generator based on `state.selectedITRForm`
- `generateITR1XML(state)`: PersonalInfo (includes DOB from `filerProfile.dateOfBirth`), ScheduleTCS (salary), ScheduleOS, ScheduleTaxPaid (TDS), TaxComputation, BankAccountDetails — no CG, no HP, no BP nodes
- `generateITR2XML(state)`: all ITR-1 nodes + ScheduleHP, ScheduleCG (111A + 112A + property), ScheduleCFL; if `computeScheduleALRequired()` → append ScheduleAL nodes from `state.scheduleAL`
- `generateITR3XML_v2(state)`: all ITR-2 nodes + ScheduleBP (speculative + F&O + presumptive); if `computeScheduleALRequired()` → append ScheduleAL nodes
- `generateITR4XML(state)`: PersonalInfo (includes DOB), ScheduleBP (presumptive sections only — Sec44AD and Sec44ADA nodes), ScheduleS (if salary exists), ScheduleOS (if other sources exist), ScheduleTaxPaid, TaxComputation, BankAccountDetails — no CG, no HP, no ScheduleAL (ITR-4 never requires AL)
- **ScheduleAL XML population** (ITR-2 and ITR-3 only, when required):
  - Loop over `state.scheduleAL.immovableAssets` → emit `<LandBuilding>` nodes
  - Emit all movable asset fields
  - Emit liability fields
  - Validate: no null values in any node (enforce all-filled rule from T91)
- **PersonalInfo** in all generators: include `<DateOfBirth>` from `filerProfile.dateOfBirth` if set; include `<Age>` and `<ResidentStatus>` nodes
- All generators: populate `<BankAccountDetails>` from `state.bankAccounts`; populate `<NewTaxRegime>` from `state.selectedRegime`; carry-forward entries from `state.schedules_v2.CFL`
- Each generator validates against its AY-specific XSD before returning
- Fetch and bundle ITR-1, ITR-2, ITR-3, and ITR-4 XSD files in `/public/schemas/`:
  - `itr1_ay2026_27.xsd`
  - `itr2_ay2026_27.xsd`
  - `itr3_ay2026_27.xsd` (existing)
  - `itr4_ay2026_27.xsd` (new)
- Commit: `feat: XML generator v2 — ITR-1/2/3/4`

---

### T89 · PDF generators v2 [parallel:no]
```
status:       [status:open]
estimate:     2h
depends_on:   T88
blocks:       T90
```
Update `generateTaxSummaryPDF()`:
- Add filing context page header: form, regime, AY
- Add income head summary section (5 heads with amounts)
- Add deductions section (Old Regime: full VI-A breakdown; New Regime: 80CCD2 only)
- Add prior year CFL section if applicable
- Existing computation table and warnings section unchanged

New `generateRegimeComparisonPDF()`:
- Two-column jsPDF table: rows per S06 design, columns New / Old
- Recommended regime highlighted row at bottom
- Footer: "Prepared by ITR Filing Utility v2.0 — verify on portal before filing"
- Triggered by "Download comparison PDF" on S06 and the third export card on S09
- Commit: `feat: PDF generators v2`

---

### T90 · Integration test — full v2 flow [parallel:no]
```
status:       [status:open]
estimate:     3h
depends_on:   T89
blocks:       —
```
Run 5 complete profiles end-to-end. For each: upload → parse → review all screens → verify summary → download XML and PDF → confirm outputs.

**Profile 1 — Simple salary (ITR-1):**
- Input: single Form 16 only (no broker, no MF, no AIS, no prior ITR)
- Verify: S04 shows only Salary tab active; HP, BP, CG, OS greyed
- Verify: `detectITRForm()` returns 'ITR1'
- Verify: ITR-1 XML validates against ITR-1 XSD, contains no ScheduleCG, ScheduleBP, or ScheduleAL nodes

**Profile 2 — Primary user profile (ITR-3):**
- Input: Zerodha P&L (intraday loss + STCG/LTCG) + Form 16 + CAMS JSON
- Verify: intraday loss ring-fenced, carry forward in ScheduleCFL
- Verify: `detectITRForm()` returns 'ITR3'
- Verify: ITR-3 XML validates, carry-forward AY labelled correctly
- Verify: ScheduleAL NOT present in XML (income assumed ≤ ₹50L for this profile)

**Profile 3 — Salary + HP + two employers + AIS (ITR-2):**
- Input: two Form 16 PDFs (two employers) + let-out property manually added + AIS JSON; total income set to > ₹50L via employer gross values
- Verify: S04 Salary tab shows two employer cards with correct totals
- Verify: HP tab shows NAV calculation for let-out property; loss shown in red
- Verify: AIS screen shows at least one mismatch; "Use AIS value" updates override and recomputes
- Verify: S13 (Schedule AL) appears in flow because total income > ₹50L
- Verify: `detectITRForm()` returns 'ITR2'
- Verify: ITR-2 XML validates, ScheduleHP populated, ScheduleAL populated with entered values

**Profile 4 — Senior citizen, Old Regime with deductions (ITR-3):**
- Input: Zerodha P&L + Form 16 + MF statement + prior year ITR XML
- Set DOB in Settings to a date making filer 65 years old (senior citizen) — verify `filerCategory` badge shows "Senior citizen (60–79)"
- Enter: 80C = ₹1,20,000; 80D self = ₹45,000 (verify cap is ₹50,000 for senior, not ₹25,000); 80TTB = ₹48,000 (verify 80TTA field is hidden, 80TTB shown instead with ₹50,000 cap)
- Verify: S06 shows Old Regime wins with correct saving amount using senior slabs (₹3L basic exemption, not ₹2.5L)
- Switch to Old Regime → verify engine recomputes with `slabs_senior`, Tax Summary shows Old Regime badge
- Verify: prior year CFL entries loaded and displayed in ScheduleCFL section
- Verify: ITR-3 XML validates, prior year CFL in `<ScheduleCFL>` node, `<DateOfBirth>` in PersonalInfo

**Profile 5 — Presumptive income only (ITR-4):**
- Input: Form 16 (optional salary) + manual presumptive income entry on S04 Business tab (44ADA professional, gross receipts ₹18,00,000 → computed income ₹9,00,000)
- No broker file, no MF statement
- Verify: S04 Business tab shows 44ADA card with computed income ₹9,00,000 (50% of receipts)
- Verify: `detectITRForm()` returns 'ITR4' (pure presumptive, no other complex income)
- Verify: S13 (Schedule AL) does NOT appear — ITR-4 is exempt from Schedule AL requirement
- Verify: ITR-4 XML validates against ITR-4 XSD; contains `<Sec44ADA>` node with correct values; contains no ScheduleCG, ScheduleHP, or ScheduleAL nodes
- Verify: warning fires if CG income is manually added to Profile 5 mid-session — "ITR-4 cannot include capital gains. Switch to ITR-3."

Tag release: `v2.0.0`
- Commit: `test: v2 integration — 5 profiles`

---

*End of Task Breakdown v2.0 — 35 tasks across Waves 10–15*
