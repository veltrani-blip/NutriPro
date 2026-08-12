import 'server-only'
import { z } from 'zod'

const substitutionSchema = z.object({
  description: z.string().min(1).max(180),
  quantity: z.number().positive().nullable(),
  unit: z.string().max(40).nullable(),
  notes: z.string().max(240).nullable(),
})

const itemSchema = z.object({
  description: z.string().min(1).max(180),
  quantity: z.number().positive().nullable(),
  unit: z.string().max(40).nullable(),
  notes: z.string().max(240).nullable(),
  substitutions: z.array(substitutionSchema).max(3),
})

const mealSchema = z.object({
  title: z.string().min(1).max(100),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  notes: z.string().max(500).nullable(),
  items: z.array(itemSchema).min(1).max(10),
})

export const generatedPlanSchema = z.object({
  title: z.string().min(2).max(180),
  rationale: z.string().min(1).max(2000),
  assumptions: z.array(z.string().max(300)).max(12),
  safetyFlags: z.array(z.string().max(300)).max(12),
  reviewChecklist: z.array(z.string().max(300)).min(1).max(15),
  meals: z.array(mealSchema).min(2).max(12),
})

export type GeneratedPlan = z.infer<typeof generatedPlanSchema>

export class GeminiGenerationError extends Error {
  constructor(public readonly code: 'missing_key'|'invalid_request'|'invalid_key'|'quota'|'model'|'provider'|'empty'|'invalid_response', message: string) {
    super(message)
    this.name = 'GeminiGenerationError'
  }
}

async function resolveAvailableModel(apiKey: string, configuredModel?: string) {
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100', {
    headers: { 'x-goog-api-key': apiKey }, signal: AbortSignal.timeout(15_000), cache: 'no-store',
  })
  if (!response.ok) {
    const code = response.status === 401 || response.status === 403 ? 'invalid_key' : response.status === 429 ? 'quota' : 'provider'
    throw new GeminiGenerationError(code, `Não foi possível consultar os modelos Gemini (${response.status}).`)
  }
  const payload = await response.json() as { models?: { name?: string; supportedGenerationMethods?: string[] }[] }
  const available = new Set((payload.models ?? []).filter((model) => model.supportedGenerationMethods?.includes('generateContent')).map((model) => model.name?.replace(/^models\//, '')).filter((name): name is string => Boolean(name)))
  if (configuredModel && available.has(configuredModel)) return configuredModel
  const preferred = ['gemini-3.5-flash-lite','gemini-3.1-flash-lite','gemini-2.5-flash-lite','gemini-3.5-flash','gemini-2.5-flash','gemini-3-flash-preview']
  const selected = preferred.find((model) => available.has(model)) || [...available].find((model) => /gemini.*flash/i.test(model))
  if (!selected) throw new GeminiGenerationError('model', 'Nenhum modelo Gemini com generateContent está disponível para esta chave.')
  return selected
}

const responseSchema = {
  type: 'object', required: ['title','rationale','assumptions','safetyFlags','reviewChecklist','meals'],
  properties: {
    title: { type: 'string' }, rationale: { type: 'string' },
    assumptions: { type: 'array', items: { type: 'string' } },
    safetyFlags: { type: 'array', items: { type: 'string' } },
    reviewChecklist: { type: 'array', items: { type: 'string' } },
    meals: { type: 'array', items: { type: 'object', required: ['title','time','notes','items'], properties: {
      title: { type: 'string' }, time: { type: ['string','null'] }, notes: { type: ['string','null'] },
      items: { type: 'array', items: { type: 'object', required: ['description','quantity','unit','notes','substitutions'], properties: {
        description: { type: 'string' }, quantity: { type: ['number','null'] }, unit: { type: ['string','null'] }, notes: { type: ['string','null'] },
        substitutions: { type: 'array', items: { type: 'object', required: ['description','quantity','unit','notes'], properties: {
          description: { type: 'string' }, quantity: { type: ['number','null'] }, unit: { type: ['string','null'] }, notes: { type: ['string','null'] },
        } } },
      } } },
    } } },
  },
} as const

export async function generateNutritionPlanDraft(input: Record<string, unknown>) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new GeminiGenerationError('missing_key', 'GEMINI_API_KEY não configurada no servidor.')
  const model = await resolveAvailableModel(apiKey, process.env.GEMINI_MODEL)
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST', signal: AbortSignal.timeout(45_000),
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: `Você apoia nutricionistas brasileiros. Gere apenas um RASCUNHO educacional para revisão humana obrigatória. Não diagnostique, não prescreva medicamentos ou suplementos e não substitua julgamento clínico. Respeite integralmente alergias, intolerâncias, restrições e condições informadas. Quando faltar dado crítico, registre em safetyFlags; não invente. Prefira alimentos brasileiros acessíveis, medidas caseiras claras e alternativas equivalentes. Não declare calorias ou macronutrientes exatos sem base nutricional fornecida. Nunca inclua nome, contato ou identificadores do paciente. Responda somente no JSON solicitado.` }] },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify(input) }] }],
      generationConfig: { temperature: 0.35, responseMimeType: 'application/json', responseJsonSchema: responseSchema },
    }),
  })
  if (!response.ok) {
    const providerBody = (await response.text()).slice(0, 1200).replaceAll(apiKey, '[redacted]')
    console.error('[gemini:generate-plan] provider rejected request', { status: response.status, model, body: providerBody })
    const code = response.status === 400 ? 'invalid_request' : response.status === 401 || response.status === 403 ? 'invalid_key' : response.status === 404 ? 'model' : response.status === 429 ? 'quota' : 'provider'
    throw new GeminiGenerationError(code, `Gemini recusou a solicitação (${response.status}).`)
  }
  const payload = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  const json = payload.candidates?.[0]?.content?.parts?.[0]?.text
  if (!json) throw new GeminiGenerationError('empty', 'O Gemini respondeu sem conteúdo.')
  try { return { plan: generatedPlanSchema.parse(JSON.parse(json)), model } }
  catch (error) {
    console.error('[gemini:generate-plan] invalid structured response', { model, error: error instanceof Error ? error.message : String(error) })
    throw new GeminiGenerationError('invalid_response', 'O Gemini respondeu fora do formato esperado.')
  }
}
