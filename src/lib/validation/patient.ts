import { z } from 'zod'

const optionalText = z.string().trim().max(500).optional().transform((v) => v || null)
export const patientSchema = z.object({
  name: z.string().trim().min(2, 'Informe o nome do paciente').max(160),
  social_name: optionalText,
  birth_date: z.string().optional().transform((v) => v || null),
  cpf: z.string().trim().max(14).optional().transform((v) => v || null),
  phone: z.string().trim().max(30).optional().transform((v) => v || null),
  whatsapp: z.string().trim().max(30).optional().transform((v) => v || null),
  email: z.union([z.literal(''), z.string().email('E-mail inválido')]).optional().transform((v) => v || null),
  profession: optionalText,
  objective: optionalText,
  source: optionalText,
  referral: optionalText,
  admin_notes: z.string().trim().max(3000).optional().transform((v) => v || null),
  status: z.enum(['lead', 'ativo', 'acompanhamento', 'inativo', 'alta']),
  emergency_name: optionalText,
  emergency_relation: optionalText,
  emergency_phone: optionalText,
})
