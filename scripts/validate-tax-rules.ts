#!/usr/bin/env node
/**
 * Tax Rules Validator CLI
 * Usage: tsx scripts/validate-tax-rules.ts public/config/tax-rules.json
 *
 * Validates:
 * - All required fields present per AY block
 * - Slab arrays contiguous (no gaps/overlaps)
 * - Rates in range 0–1
 * - Deadlines are valid ISO dates
 * - specialRates keys all present
 * - carryForward values are positive integers
 * - Old Regime: three slab arrays present and internally contiguous
 * - Senior nil slab > general nil slab upper bound
 * - Super-senior nil slab > senior nil slab upper bound
 */

import { readFileSync } from 'fs'
import { resolve } from 'path'

interface SlabEntry {
  from: number
  to: number | null
  rate: number
}

interface ValidationResult {
  ay: string
  pass: boolean
  errors: string[]
}

function isValidISODate(s: string): boolean {
  const d = new Date(s)
  return !isNaN(d.getTime()) && /^\d{4}-\d{2}-\d{2}$/.test(s)
}

function validateSlabArray(slabs: SlabEntry[], label: string): string[] {
  const errors: string[] = []
  if (!Array.isArray(slabs) || slabs.length === 0) {
    errors.push(`${label}: must be a non-empty array`)
    return errors
  }

  // Check first slab starts at 0
  if (slabs[0].from !== 0) {
    errors.push(`${label}: first slab must start at 0, got ${slabs[0].from}`)
  }

  for (let i = 0; i < slabs.length; i++) {
    const s = slabs[i]
    // Rate range check
    if (typeof s.rate !== 'number' || s.rate < 0 || s.rate > 1) {
      errors.push(`${label}[${i}]: rate ${s.rate} out of range [0, 1]`)
    }
    // Contiguity check
    if (i < slabs.length - 1) {
      const next = slabs[i + 1]
      if (s.to === null) {
        errors.push(`${label}[${i}]: only the last slab can have null 'to'`)
      } else if (s.to !== next.from) {
        errors.push(`${label}[${i}]: gap/overlap — slab ends at ${s.to} but next starts at ${next.from}`)
      }
    } else {
      // Last slab must have null to
      if (s.to !== null) {
        errors.push(`${label}[${slabs.length - 1}]: last slab 'to' should be null (unbounded), got ${s.to}`)
      }
    }
  }

  return errors
}

function getNilSlabUpperBound(slabs: SlabEntry[]): number {
  const nilSlab = slabs.find(s => s.rate === 0)
  return nilSlab?.to ?? 0
}

function validateAYBlock(ay: string, block: Record<string, unknown>): ValidationResult {
  const errors: string[] = []

  // Check regime exists
  const regime = block['regime'] as Record<string, unknown> | undefined
  if (!regime) {
    errors.push('Missing "regime" key')
    return { ay, pass: false, errors }
  }

  // ── New Regime ────────────────────────────────────────────────────────────
  const newRegime = regime['new'] as Record<string, unknown> | undefined
  if (!newRegime) {
    errors.push('Missing regime.new')
  } else {
    errors.push(...validateSlabArray(newRegime['slabs'] as SlabEntry[], 'regime.new.slabs'))

    if (typeof newRegime['standardDeductionSalary'] !== 'number') {
      errors.push('regime.new.standardDeductionSalary must be a number')
    }

    const s87A = newRegime['section87A'] as Record<string, unknown> | undefined
    if (!s87A || typeof s87A['limit'] !== 'number') {
      errors.push('regime.new.section87A.limit must be a number')
    }

    const surcharge = newRegime['surcharge'] as SlabEntry[] | undefined
    if (!Array.isArray(surcharge) || surcharge.length === 0) {
      errors.push('regime.new.surcharge must be a non-empty array')
    }
  }

  // ── Old Regime ────────────────────────────────────────────────────────────
  const oldRegime = regime['old'] as Record<string, unknown> | undefined
  if (!oldRegime) {
    errors.push('Missing regime.old')
  } else {
    // All three slab arrays required
    const generalSlabs = oldRegime['slabs'] as SlabEntry[] | undefined
    const seniorSlabs = oldRegime['slabs_senior'] as SlabEntry[] | undefined
    const superSeniorSlabs = oldRegime['slabs_super_senior'] as SlabEntry[] | undefined

    if (!generalSlabs) errors.push('regime.old.slabs is required')
    else errors.push(...validateSlabArray(generalSlabs, 'regime.old.slabs'))

    if (!seniorSlabs) errors.push('regime.old.slabs_senior is required')
    else errors.push(...validateSlabArray(seniorSlabs, 'regime.old.slabs_senior'))

    if (!superSeniorSlabs) errors.push('regime.old.slabs_super_senior is required')
    else errors.push(...validateSlabArray(superSeniorSlabs, 'regime.old.slabs_super_senior'))

    // Nil slab ordering check
    if (generalSlabs && seniorSlabs && superSeniorSlabs) {
      const generalNil = getNilSlabUpperBound(generalSlabs)
      const seniorNil = getNilSlabUpperBound(seniorSlabs)
      const superSeniorNil = getNilSlabUpperBound(superSeniorSlabs)

      if (seniorNil <= generalNil) {
        errors.push(`Senior nil slab upper bound (${seniorNil}) must be > general (${generalNil})`)
      }
      if (superSeniorNil <= seniorNil) {
        errors.push(`Super-senior nil slab upper bound (${superSeniorNil}) must be > senior (${seniorNil})`)
      }
    }

    // deductionCaps required for Old Regime
    const caps = oldRegime['deductionCaps'] as Record<string, unknown> | undefined
    if (!caps) {
      errors.push('regime.old.deductionCaps is required')
    } else {
      const requiredCaps = ['80C', '80TTA', '80TTB', '24b_selfOccupied', 'familyPensionStdDed']
      for (const cap of requiredCaps) {
        if (typeof caps[cap] !== 'number') {
          errors.push(`regime.old.deductionCaps.${cap} must be a number`)
        }
      }
    }
  }

  // ── specialRates ──────────────────────────────────────────────────────────
  const specialRates = block['specialRates'] as Record<string, unknown> | undefined
  if (!specialRates) {
    errors.push('Missing "specialRates" key')
  } else {
    const requiredRates = ['stcg_111A', 'ltcg_112A', 'ltcg_112A_exemption', 'lottery', 'casualIncome']
    for (const key of requiredRates) {
      if (typeof specialRates[key] !== 'number') {
        errors.push(`specialRates.${key} must be a number`)
      }
    }
    if (typeof specialRates['stcg_111A'] === 'number') {
      const r = specialRates['stcg_111A'] as number
      if (r < 0 || r > 1) errors.push(`specialRates.stcg_111A rate ${r} out of range [0, 1]`)
    }
  }

  // ── cess ──────────────────────────────────────────────────────────────────
  const cess = block['cess'] as number | undefined
  if (typeof cess !== 'number' || cess < 0 || cess > 1) {
    errors.push('cess must be a number in range [0, 1]')
  }

  // ── carryForward ──────────────────────────────────────────────────────────
  const cf = block['carryForward'] as Record<string, unknown> | undefined
  if (!cf) {
    errors.push('Missing "carryForward" key')
  } else {
    for (const [k, v] of Object.entries(cf)) {
      if (typeof v !== 'number' || !Number.isInteger(v) || v <= 0) {
        errors.push(`carryForward.${k} must be a positive integer, got ${v}`)
      }
    }
  }

  // ── deadlines ─────────────────────────────────────────────────────────────
  const dl = block['deadlines'] as Record<string, unknown> | undefined
  if (!dl) {
    errors.push('Missing "deadlines" key')
  } else {
    for (const [k, v] of Object.entries(dl)) {
      if (typeof v !== 'string' || !isValidISODate(v)) {
        errors.push(`deadlines.${k} must be a valid ISO date (YYYY-MM-DD), got ${v}`)
      }
    }
  }

  // ── surchargeThresholds ───────────────────────────────────────────────────
  const st = block['surchargeThresholds'] as Record<string, unknown> | undefined
  if (!st || typeof st['scheduleALRequired'] !== 'number') {
    errors.push('surchargeThresholds.scheduleALRequired must be a number')
  }

  // ── itrForms ──────────────────────────────────────────────────────────────
  const itrForms = block['itrForms'] as Record<string, unknown> | undefined
  if (!itrForms) {
    errors.push('Missing "itrForms" key')
  } else {
    for (const form of ['ITR1', 'ITR2', 'ITR3', 'ITR4']) {
      if (typeof itrForms[form] !== 'string') {
        errors.push(`itrForms.${form} must be a string description`)
      }
    }
  }

  return { ay, pass: errors.length === 0, errors }
}

function validateTaxRules(filePath: string): boolean {
  console.log(`\nValidating: ${filePath}\n`)

  let raw: string
  try {
    raw = readFileSync(resolve(filePath), 'utf-8')
  } catch (err) {
    console.error(`ERROR: Cannot read file: ${(err as Error).message}`)
    return false
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    console.error(`ERROR: Invalid JSON: ${(err as Error).message}`)
    return false
  }

  // Top-level structure
  if (!parsed['schemaVersion']) {
    console.error('ERROR: Missing schemaVersion')
    return false
  }
  if (!parsed['defaultAY']) {
    console.error('ERROR: Missing defaultAY')
    return false
  }
  const rules = parsed['rules'] as Record<string, unknown> | undefined
  if (!rules || typeof rules !== 'object') {
    console.error('ERROR: Missing or invalid "rules" key')
    return false
  }

  const ayBlocks = Object.entries(rules)
  if (ayBlocks.length === 0) {
    console.error('ERROR: No AY blocks found in rules')
    return false
  }

  // Validate each AY block
  const results: ValidationResult[] = []
  for (const [ay, block] of ayBlocks) {
    const result = validateAYBlock(ay, block as Record<string, unknown>)
    results.push(result)
  }

  // Print results
  let allPass = true
  for (const result of results) {
    if (result.pass) {
      console.log(`  ✓  AY ${result.ay}  PASS`)
    } else {
      console.log(`  ✗  AY ${result.ay}  FAIL`)
      for (const err of result.errors) {
        console.log(`        • ${err}`)
      }
      allPass = false
    }
  }

  console.log()
  if (allPass) {
    console.log(`✓ All ${results.length} AY block(s) PASSED\n`)
  } else {
    const failed = results.filter(r => !r.pass).length
    console.log(`✗ ${failed} of ${results.length} AY block(s) FAILED\n`)
  }

  return allPass
}

// ── CLI entry ─────────────────────────────────────────────────────────────────
const filePath = process.argv[2]
if (!filePath) {
  console.error('Usage: tsx scripts/validate-tax-rules.ts <path-to-tax-rules.json>')
  process.exit(1)
}

const pass = validateTaxRules(filePath)
process.exit(pass ? 0 : 1)
