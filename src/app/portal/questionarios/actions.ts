'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requirePatientPortal } from '@/lib/auth'

export async function submitQuestionnaire(assignmentId: string, formData: FormData) {
  const { supabase, organizationId, patientId } = await requirePatientPortal()
  const { data: assignment } = await supabase.from('questionnaire_assignments').select('questionnaire_id,status').eq('organization_id',organizationId).eq('patient_id',patientId).eq('id',assignmentId).eq('status','pending').maybeSingle()
  if (!assignment) redirect('/portal/questionarios?error=' + encodeURIComponent('Questionário indisponível ou já respondido.'))
  const { data: fields } = await supabase.from('questionnaire_fields').select('*').eq('organization_id',organizationId).eq('questionnaire_id',assignment.questionnaire_id).order('sort_order')
  const answers: Record<string,unknown> = {}
  for (const field of fields ?? []) {
    const key = `field_${field.id}`
    const raw = field.field_type === 'multiselect' ? formData.getAll(key).map(String) : String(formData.get(key) ?? '').trim()
    const missing = Array.isArray(raw) ? raw.length === 0 : raw === ''
    if (field.required && missing) redirect(`/portal/questionarios?error=${encodeURIComponent(`Responda: ${field.label}`)}`)
    if (missing) { answers[field.id] = null; continue }
    if (field.field_type === 'number' || field.field_type === 'scale') answers[field.id] = z.coerce.number().finite().parse(raw)
    else if (field.field_type === 'boolean' || field.field_type === 'checkbox') answers[field.id] = raw === 'true' || raw === 'on'
    else answers[field.id] = raw
  }
  const { error } = await supabase.rpc('submit_questionnaire_response',{p_assignment_id:assignmentId,p_answers:answers})
  if (error) redirect('/portal/questionarios?error=' + encodeURIComponent('Não foi possível enviar as respostas. Tente novamente.'))
  revalidatePath('/portal/questionarios')
  redirect('/portal/questionarios?message=' + encodeURIComponent('Respostas enviadas com segurança.'))
}
