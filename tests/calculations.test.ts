import { describe, expect, it } from 'vitest'
import { calculateBmi, calculateWaistHeightRatio, calculateWaistHipRatio } from '@/lib/calculations/anthropometry'
import { gramsPerKg, scaleNutrients, sumNutrients } from '@/lib/calculations/nutrition'

describe('cálculos antropométricos', () => {
  it('calcula e identifica as fórmulas suportadas', () => {
    expect(calculateBmi(80, 180)).toEqual({ value: 24.69, formula: 'IMC = peso (kg) / altura (m)²' })
    expect(calculateWaistHipRatio(80, 100)?.value).toBe(0.8)
    expect(calculateWaistHeightRatio(80, 180)?.value).toBe(0.44)
  })

  it('não inventa cálculo quando falta medida válida', () => {
    expect(calculateBmi(null, 180)).toBeNull()
    expect(calculateWaistHipRatio(80, 0)).toBeNull()
  })
})

describe('cálculos nutricionais', () => {
  const base = { kcal: 100, proteinG: 10, carbsG: 15, fatG: 2, fiberG: null }

  it('escala por peso e preserva nutrientes ausentes', () => {
    expect(scaleNutrients(base, 50, 100)).toEqual({ kcal: 50, proteinG: 5, carbsG: 7.5, fatG: 1, fiberG: null })
  })

  it('não totaliza um nutriente se algum item não possui o valor', () => {
    expect(sumNutrients([base, { ...base, kcal: 50 }])).toEqual({
      kcal: 150,
      proteinG: 20,
      carbsG: 30,
      fatG: 4,
      fiberG: null,
    })
    expect(gramsPerKg(120, 80)).toBe(1.5)
    expect(gramsPerKg(120, null)).toBeNull()
  })
})
