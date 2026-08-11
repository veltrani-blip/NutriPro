'use server'

import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

export type PublicBookingState = { ok: boolean; message: string }

export async function bookPublicAppointment(slug: string, _: PublicBookingState, formData: FormData): Promise<PublicBookingState> {
  try {
    const parsed = z.object({
      service: z.string().uuid(), starts: z.string().datetime({ offset: true }),
      name: z.string().trim().min(2).max(160), phone: z.string().trim().max(30),
      email: z.union([z.literal(''), z.string().email()]),
    }).refine((value) => value.phone || value.email, { message: 'Informe telefone ou e-mail.' }).parse({
      service: formData.get('service_type_id'), starts: formData.get('starts_at'), name: formData.get('name'),
      phone: formData.get('phone'), email: formData.get('email'),
    })
    const supabase = await createClient()
    const { error } = await supabase.rpc('book_public_appointment', {
      p_slug: slug, p_service_type_id: parsed.service, p_starts_at: parsed.starts,
      p_name: parsed.name, p_phone: parsed.phone, p_email: parsed.email,
    })
    if (error) return { ok: false, message: 'O horário ficou indisponível ou o limite de tentativas foi atingido. Atualize a página.' }
    return { ok: true, message: 'Solicitação registrada. O consultório poderá confirmar o atendimento pelos contatos informados.' }
  } catch (error) {
    return { ok: false, message: error instanceof z.ZodError ? error.issues[0]?.message ?? 'Revise os dados.' : 'Revise os dados.' }
  }
}
