'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth'
import { appointmentSchema, serviceTypeSchema } from '@/lib/validation/appointment'

export type AgendaActionState = { ok: boolean; message: string }
const initialError: AgendaActionState = { ok: false, message: 'Não foi possível concluir a operação.' }

export async function createServiceType(_: AgendaActionState, formData: FormData): Promise<AgendaActionState> {
  try {
    const { supabase, organizationId } = await requirePermission('agenda.write')
    const parsed = serviceTypeSchema.parse({
      name: formData.get('name'), duration_minutes: formData.get('duration_minutes'),
      price_cents: Math.round(Number(formData.get('price_reais') ?? 0) * 100),
      modality: formData.get('modality'), instructions: formData.get('instructions'), color: formData.get('color'),
    })
    const { error } = await supabase.from('service_types').insert({ ...parsed, organization_id: organizationId, kind: formData.get('kind') ?? 'custom', public_enabled: formData.get('public_enabled') === 'on' })
    if (error) return { ok: false, message: error.code === '23505' ? 'Já existe um tipo de consulta com esse nome.' : initialError.message }
    revalidatePath('/app/agenda')
    return { ok: true, message: 'Tipo de consulta salvo.' }
  } catch { return initialError }
}

export async function createCalendarEntry(_: AgendaActionState, formData: FormData): Promise<AgendaActionState> {
  try {
    const { supabase, organizationId } = await requirePermission('agenda.write')
    const entryType = String(formData.get('entry_type') ?? 'appointment')
    const startsAt = String(formData.get('starts_at') ?? '')
    let endsAt = String(formData.get('ends_at') ?? '')
    let title = String(formData.get('title') ?? '').trim()
    let priceCents: number | null = null
    let instructions: string | null = null
    let serviceTypeId = String(formData.get('service_type_id') ?? '') || null
    let modality = String(formData.get('modality') ?? 'presencial')
    const patientId = String(formData.get('patient_id') ?? '') || null

    if (entryType === 'appointment') {
      const { data: service } = await supabase.from('service_types').select('*').eq('organization_id', organizationId).eq('id', serviceTypeId).eq('active', true).is('deleted_at', null).maybeSingle()
      if (!service) return { ok: false, message: 'Selecione um tipo de consulta ativo.' }
      endsAt = new Date(new Date(startsAt).getTime() + service.duration_minutes * 60_000).toISOString()
      title = service.name
      priceCents = service.price_cents
      instructions = service.instructions
      modality = service.modality === 'online' ? 'online' : modality
    } else {
      serviceTypeId = null
    }

    const parsed = appointmentSchema.parse({
      patient_id: patientId, professional_user_id: String(formData.get('professional_user_id') ?? ''),
      service_type_id: serviceTypeId, starts_at: startsAt, ends_at: endsAt, entry_type: entryType,
      status: entryType === 'appointment' ? 'scheduled' : 'blocked', modality,
      title: title || 'Bloqueio', notes: formData.get('notes'),
    })
    const { error } = await supabase.from('appointments').insert({
      ...parsed, organization_id: organizationId, price_cents: priceCents, instructions, source: 'internal',
    })
    if (error) return { ok: false, message: ['23P01', '40P01'].includes(error.code ?? '') ? 'O profissional ou paciente já possui um compromisso nesse horário.' : initialError.message }
    revalidatePath('/app/agenda'); revalidatePath('/app/dashboard')
    return { ok: true, message: entryType === 'appointment' ? 'Consulta agendada.' : 'Bloqueio criado.' }
  } catch (error) {
    return { ok: false, message: error instanceof z.ZodError ? error.issues[0]?.message ?? initialError.message : initialError.message }
  }
}

const allowedStatuses = ['scheduled','confirmed','completed','cancelled','no_show'] as const
export async function updateAppointmentStatus(id: string, status: typeof allowedStatuses[number], formData: FormData) {
  const { supabase, organizationId } = await requirePermission('agenda.write')
  if (!allowedStatuses.includes(status)) redirect('/app/agenda?error=' + encodeURIComponent('Situação de consulta inválida.'))
  const now = new Date().toISOString()
  const patch: Record<string, string | null> = { status }
  if (status === 'confirmed') patch.confirmed_at = now
  if (status === 'completed') patch.completed_at = now
  if (status === 'cancelled') patch.cancellation_reason = String(formData.get('cancellation_reason') ?? '').trim() || 'Não informado'
  const { error } = await supabase.from('appointments').update(patch).eq('organization_id', organizationId).eq('id', id).eq('entry_type', 'appointment')
  if (error) redirect('/app/agenda?error=' + encodeURIComponent('Não foi possível atualizar a consulta.'))
  revalidatePath('/app/agenda'); revalidatePath('/app/dashboard')
  redirect('/app/agenda?message=' + encodeURIComponent('Consulta atualizada.'))
}

export async function rescheduleAppointment(_: AgendaActionState, formData: FormData): Promise<AgendaActionState> {
  try {
    const { supabase, organizationId } = await requirePermission('agenda.write')
    const id = z.string().uuid().parse(formData.get('id'))
    const startsAt = z.string().datetime({ offset: true }).parse(formData.get('starts_at'))
    const { data: current } = await supabase.from('appointments').select('starts_at,ends_at').eq('organization_id', organizationId).eq('id', id).maybeSingle()
    if (!current) return initialError
    const duration = new Date(current.ends_at).getTime() - new Date(current.starts_at).getTime()
    const endsAt = new Date(new Date(startsAt).getTime() + duration).toISOString()
    const { error } = await supabase.from('appointments').update({ starts_at: startsAt, ends_at: endsAt, status: 'scheduled', confirmed_at: null }).eq('organization_id', organizationId).eq('id', id)
    if (error) return { ok: false, message: ['23P01', '40P01'].includes(error.code ?? '') ? 'O novo horário conflita com outro compromisso.' : initialError.message }
    revalidatePath('/app/agenda'); revalidatePath('/app/dashboard')
    return { ok: true, message: 'Compromisso reagendado.' }
  } catch { return initialError }
}

export async function savePublicBookingProfile(_: AgendaActionState, formData: FormData): Promise<AgendaActionState> {
  try {
    const { user, supabase, organizationId } = await requirePermission('agenda.write')
    const slug = z.string().trim().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).parse(formData.get('slug'))
    const displayName = z.string().trim().min(2).max(160).parse(formData.get('display_name'))
    const { error } = await supabase.from('public_booking_profiles').upsert({
      organization_id: organizationId, professional_user_id: user.id, slug, display_name: displayName,
      clinic_name: String(formData.get('clinic_name') ?? '').trim() || null,
      public_bio: String(formData.get('public_bio') ?? '').trim() || null,
      public_location: String(formData.get('public_location') ?? '').trim() || null,
      timezone: String(formData.get('timezone') ?? 'America/Sao_Paulo'),
      enabled: formData.get('enabled') === 'on',
    }, { onConflict: 'organization_id,professional_user_id' })
    if (error) return { ok: false, message: error.code === '23505' ? 'Este endereço público já está em uso.' : initialError.message }
    revalidatePath('/app/agenda')
    return { ok: true, message: 'Página pública atualizada.' }
  } catch { return { ok: false, message: 'Use um endereço com letras minúsculas, números e hífens.' } }
}
