import { z } from 'zod'

const optional = (max: number) => z.string().trim().max(max).optional().transform((value) => value || null)

export const onboardingSchema = z.object({
  full_name: z.string().trim().min(2).max(180),
  professional_name: z.string().trim().min(2).max(180),
  organization_name: z.string().trim().min(2).max(180),
  crn: optional(40),
  crn_region: optional(40),
  cpf: optional(20),
  cnpj: optional(24),
  phone: optional(30),
  whatsapp: optional(30),
  email: z.union([z.literal(''), z.string().email()]).transform((value) => value || null),
  address_line1: optional(240),
  address_line2: optional(240),
  city: optional(120),
  state: optional(80),
  postal_code: optional(20),
  service_mode: z.enum(['presencial', 'online', 'hibrido']),
  specialties: z.string().trim().max(1000).transform((value) => value.split(',').map((item) => item.trim()).filter(Boolean)),
  default_duration_minutes: z.coerce.number().int().min(10).max(480),
  default_price_reais: z.union([z.literal(''), z.coerce.number().min(0).max(1_000_000)]).transform((value) => value === '' ? null : Math.round(value * 100)),
  timezone: z.string().trim().min(3).max(100),
  currency_code: z.string().trim().regex(/^[A-Z]{3}$/),
  business_start: z.string().regex(/^\d{2}:\d{2}$/),
  business_end: z.string().regex(/^\d{2}:\d{2}$/),
  weekdays: z.array(z.coerce.number().int().min(0).max(6)).min(1),
}).refine((value) => value.business_end > value.business_start, {
  path: ['business_end'], message: 'O horário final deve ser posterior ao inicial.',
})
