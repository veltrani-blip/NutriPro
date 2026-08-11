export type Nutrients = {
  kcal: number | null
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
  fiberG: number | null
}

export const emptyNutrients: Nutrients = {
  kcal: null,
  proteinG: null,
  carbsG: null,
  fatG: null,
  fiberG: null,
}

function valid(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

export function scaleNutrients(
  nutrients: Nutrients,
  consumedGrams: number | null | undefined,
  referenceGrams: number | null | undefined,
): Nutrients {
  if (!valid(consumedGrams) || !valid(referenceGrams) || referenceGrams === 0) return emptyNutrients
  const factor = consumedGrams! / referenceGrams!
  return Object.fromEntries(
    Object.entries(nutrients).map(([key, value]) => [key, valid(value) ? value! * factor : null]),
  ) as Nutrients
}

export function sumNutrients(items: Nutrients[]): Nutrients {
  if (!items.length) return emptyNutrients
  const keys = Object.keys(emptyNutrients) as (keyof Nutrients)[]
  return Object.fromEntries(
    keys.map((key) => {
      const values = items.map((item) => item[key])
      return [key, values.every(valid) ? values.reduce<number>((sum, value) => sum + value!, 0) : null]
    }),
  ) as Nutrients
}

export function gramsPerKg(
  nutrientGrams: number | null | undefined,
  weightKg: number | null | undefined,
) {
  if (!valid(nutrientGrams) || !valid(weightKg) || weightKg === 0) return null
  return Math.round((nutrientGrams! / weightKg!) * 100) / 100
}
