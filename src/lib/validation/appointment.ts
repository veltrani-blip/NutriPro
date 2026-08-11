import { z } from 'zod'

export const serviceTypeSchema = z.object({
  name: z.string().trim().min(2).max(120),
  duration_minutes: z.coerce.number().int().min(10).max(480),
  price_cents: z.coerce.number().int().min(0).max(100_000_000),
  modality: z.enum(['presencial', 'online', 'hibrido']),
  instructions: z.string().trim().max(3000).optional().transform((value) => value || null),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
})

export const appointmentSchema = z.object({
  patient_id: z.string().uuid().nullable(),
  professional_user_id: z.string().uuid(),
  service_type_id: z.string().uuid().nullable(),
  starts_at: z.string().datetime({ offset: true }),
  ends_at: z.string().datetime({ offset: true }),
  entry_type: z.enum(['appointment', 'block', 'vacation', 'lunch', 'personal', 'unavailable']),
  status: z.enum(['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show', 'blocked']),
  modality: z.enum(['presencial', 'online']),
  title: z.string().trim().min(2).max(160),
  notes: z.string().trim().max(3000).optional().transform((value) => value || null),
}).superRefine((value, context) => {
  if (new Date(value.ends_at) <= new Date(value.starts_at)) {
    context.addIssue({ code: 'custom', path: ['ends_at'], message: 'O término deve ser posterior ao início.' })
  }
  if (value.entry_type === 'appointment' && !value.patient_id) {
    context.addIssue({ code: 'custom', path: ['patient_id'], message: 'Selecione o paciente.' })
  }
  if (value.entry_type !== 'appointment' && value.status !== 'blocked') {
    context.addIssue({ code: 'custom', path: ['status'], message: 'Bloqueios devem usar status bloqueado.' })
  }
})
