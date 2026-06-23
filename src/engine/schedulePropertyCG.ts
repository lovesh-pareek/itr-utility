import type { PropertySale, ScheduleCG_v2, ScheduleCG } from '../types'
import ciiData from '../../public/config/cii.json'

interface CIIData {
  base_year: string
  values: Record<string, number>
}

const cii = ciiData as CIIData

/**
 * Look up CII value for a given financial year (e.g. "2015-16").
 * Returns null if not found — caller should add a warning.
 */
export function getCII(fy: string): number | null {
  return cii.values[fy] ?? null
}

/**
 * Compute indexed cost for a property sale.
 * Indexed cost = purchasePrice × (CII_sale / CII_purchase)
 * If either CII year is missing, falls back to purchasePrice.
 */
export function computeIndexedCost(
  purchasePrice: number,
  purchaseFY: string,
  saleFY: string
): { indexedCost: number; ciiMissing: boolean; missingFY?: string } {
  const purchaseCII = getCII(purchaseFY)
  const saleCII = getCII(saleFY)

  if (purchaseCII === null) {
    return { indexedCost: purchasePrice, ciiMissing: true, missingFY: purchaseFY }
  }
  if (saleCII === null) {
    return { indexedCost: purchasePrice, ciiMissing: true, missingFY: saleFY }
  }

  const indexedCost = Math.round(purchasePrice * (saleCII / purchaseCII))
  return { indexedCost, ciiMissing: false }
}

/**
 * Determine if a property is STCG (held ≤ 2 years) or LTCG (held > 2 years).
 */
function getPropertyGainType(purchaseDate: string, saleDate: string): 'STCG' | 'LTCG' {
  const purchase = new Date(purchaseDate)
  const sale = new Date(saleDate)
  if (isNaN(purchase.getTime()) || isNaN(sale.getTime())) return 'STCG'

  const diffMs = sale.getTime() - purchase.getTime()
  const diffYears = diffMs / (1000 * 60 * 60 * 24 * 365.25)
  return diffYears > 2 ? 'LTCG' : 'STCG'
}

/**
 * Compute capital gains for property sales with CII indexation.
 * Returns updated sales array, aggregated STCG/LTCG, and any warnings.
 */
export function computePropertyCG(
  sales: PropertySale[],
  overrides: Record<string, number>
): {
  propertySTCG: number
  propertyLTCG: number
  updatedSales: PropertySale[]
  warnings: string[]
} {
  const warnings: string[] = []
  let propertySTCG = 0
  let propertyLTCG = 0

  const updatedSales: PropertySale[] = sales.map(sale => {
    const prefix = `CG_prop.${sale.id}`

    const purchasePrice = overrides[`${prefix}.purchasePrice`] ?? sale.purchasePrice
    const salePrice = overrides[`${prefix}.salePrice`] ?? sale.salePrice
    const improvementCost = overrides[`${prefix}.improvementCost`] ?? sale.improvementCost
    const transferExpenses = overrides[`${prefix}.transferExpenses`] ?? sale.transferExpenses
    const exemptionAmount = overrides[`${prefix}.exemptionAmount`] ?? sale.exemptionAmount

    const gainType = getPropertyGainType(sale.purchaseDate, sale.saleDate)

    let indexedCost = purchasePrice
    if (gainType === 'LTCG') {
      const result = computeIndexedCost(purchasePrice, sale.purchaseFY, sale.saleFY)
      indexedCost = result.indexedCost
      if (result.ciiMissing) {
        warnings.push(`CII for ${result.missingFY} not found — using purchase price as cost for property at ${sale.address}`)
      }
    }

    const grossGain = salePrice - indexedCost - improvementCost - transferExpenses
    const netGain = sale.exemptionClaimed
      ? Math.max(0, grossGain - exemptionAmount)
      : grossGain

    const updated: PropertySale = {
      ...sale,
      purchasePrice,
      salePrice,
      indexedCost,
      improvementCost,
      transferExpenses,
      netGain,
      gainType,
      exemptionAmount,
    }

    if (gainType === 'STCG') {
      propertySTCG += Math.max(0, netGain)
    } else {
      propertyLTCG += Math.max(0, netGain)
    }

    return updated
  })

  return { propertySTCG, propertyLTCG, updatedSales, warnings }
}

/**
 * Merge property CG into an existing ScheduleCG to produce ScheduleCG_v2.
 */
export function mergePropertyCGIntoSchedule(
  base: ScheduleCG,
  propertySales: PropertySale[],
  overrides: Record<string, number>
): ScheduleCG_v2 {
  const { propertySTCG, propertyLTCG, updatedSales } = computePropertyCG(propertySales, overrides)

  return {
    ...base,
    propertySales: updatedSales,
    propertySTCG,
    propertyLTCG,
    totalSTCG: base.netSTCG + propertySTCG,
    totalLTCG: base.netLTCG + propertyLTCG,
  }
}
