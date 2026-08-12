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
  if (!apiKey) throw new Error('GEMINI_API_KEY_NOT_CONFIGURED')
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite'
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST', signal: AbortSignal.timeout(45_000),
    headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: `Você apoia nutricionistas brasileiros. Gere apenas um RASCUNHO educacional para revisão humana obrigatória. Não diagnostique, não prescreva medicamentos ou suplementos e não substitua julgamento clínico. Respeite integralmente alergias, intolerâncias, restrições e condições informadas. Quando faltar dado crítico, registre em safetyFlags; não invente. Prefira alimentos brasileiros acessíveis, medidas caseiras claras e alternativas equivalentes. Não declare calorias ou macronutrientes exatos sem base nutricional fornecida. Nunca inclua nome, contato ou identificadores do paciente. Responda somente no JSON solicitado.` }] },
      contents: [{ role: 'user', parts: [{ text: JSON.stringify(input) }] }],
      generationConfig: { temperature: 0.35, responseMimeType: 'application/json', responseJsonSchema: responseSchema },
    }),
  })
  if (!response.ok) throw new Error(`GEMINI_REQUEST_FAILED_${response.status}`)
  const payload = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  const json = payload.candidates?.[0]?.content?.parts?.[0]?.text
  if (!json) throw new Error('GEMINI_EMPTY_RESPONSE')
  return { plan: generatedPlanSchema.parse(JSON.parse(json)), model }
}
