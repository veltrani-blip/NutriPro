export type CalculatedMetric = {
  value: number
  formula: string
}

function positive(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function rounded(value: number, decimals = 2) {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

export function calculateBmi(
  weightKg: number | null | undefined,
  heightCm: number | null | undefined,
): CalculatedMetric | null {
  if (!positive(weightKg) || !positive(heightCm)) return null
  const heightM = heightCm! / 100
  return { value: rounded(weightKg! / heightM ** 2), formula: 'IMC = peso (kg) / altura (m)²' }
}

export function calculateWaistHipRatio(
  waistCm: number | null | undefined,
  hipCm: number | null | undefined,
): CalculatedMetric | null {
  if (!positive(waistCm) || !positive(hipCm)) return null
  return { value: rounded(waistCm! / hipCm!), formula: 'RCQ = cintura (cm) / quadril (cm)' }
}

export function calculateWaistHeightRatio(
  waistCm: number | null | undefined,
  heightCm: number | null | undefined,
): CalculatedMetric | null {
  if (!positive(waistCm) || !positive(heightCm)) return null
  return { value: rounded(waistCm! / heightCm!), formula: 'RCEst = cintura (cm) / altura (cm)' }
}
