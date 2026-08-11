'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { calculateBmi, calculateWaistHeightRatio, calculateWaistHipRatio } from '@/lib/calculations/anthropometry'
import { requirePermission } from '@/lib/auth'
import { uploadPrivateFile, validatePrivateFile } from '@/lib/storage'

const optional = (value: FormDataEntryValue | null) => String(value ?? '').trim() || null
const num = (value: FormDataEntryValue | null) => { const parsed = Number(value); return value === null || value === '' || !Number.isFinite(parsed) ? null : parsed }
const modulePath = (patientId: string, module: string, key: 'message' | 'error', message: string) => `/app/pacientes/${patientId}/${module}?${key}=${encodeURIComponent(message)}`

export async function saveClinicalRecord(patientId: string, formData: FormData) {
  const { user, supabase, organizationId } = await requirePermission('clinical.write')
  const recordId = String(formData.get('record_id') ?? '')
  const payload = {
    reason: optional(formData.get('reason')), report: optional(formData.get('report')),
    evolution: optional(formData.get('evolution')), signs_symptoms: optional(formData.get('signs_symptoms')),
    conduct: optional(formData.get('conduct')), nutrition_diagnosis: optional(formData.get('nutrition_diagnosis')),
    strategy: optional(formData.get('strategy')), guidance: optional(formData.get('guidance')),
    goals: optional(formData.get('goals')), objectives: optional(formData.get('objectives')),
    private_notes: optional(formData.get('private_notes')),
    recommended_return: optional(formData.get('recommended_return')),
    revision_reason: optional(formData.get('revision_reason')),
  }
  const operation = recordId
    ? supabase.from('clinical_records').update(payload).eq('organization_id', organizationId).eq('patient_id', patientId).eq('id', recordId)
    : supabase.from('clinical_records').insert({ ...payload, organization_id: organizationId, patient_id: patientId, professional_user_id: user.id })
  const { error } = await operation
  if (error) redirect(modulePath(patientId, 'prontuario', 'error', error.message.includes('immutable') ? 'Registro finalizado: use um adendo.' : 'Não foi possível salvar o prontuário.'))
  revalidatePath(`/app/pacientes/${patientId}/prontuario`)
  redirect(modulePath(patientId, 'prontuario', 'message', 'Prontuário salvo e versionado.'))
}

export async function finalizeClinicalRecord(patientId: string, recordId: string) {
  const { supabase, organizationId } = await requirePermission('clinical.write')
  const { error } = await supabase.from('clinical_records').update({ finalized_at: new Date().toISOString() }).eq('organization_id', organizationId).eq('patient_id', patientId).eq('id', recordId).is('finalized_at', null)
  if (error) redirect(modulePath(patientId, 'prontuario', 'error', 'Não foi possível finalizar o registro.'))
  revalidatePath(`/app/pacientes/${patientId}/prontuario`)
  redirect(modulePath(patientId, 'prontuario', 'message', 'Registro finalizado e imutável.'))
}

export async function addClinicalAddendum(patientId: string, recordId: string, formData: FormData) {
  const { user, supabase, organizationId } = await requirePermission('clinical.write')
  const reason = z.string().trim().min(3).max(500).parse(formData.get('reason'))
  const content = z.string().trim().min(1).max(10000).parse(formData.get('content'))
  const { error } = await supabase.from('clinical_addenda').insert({ organization_id: organizationId, clinical_record_id: recordId, author_user_id: user.id, reason, content })
  if (error) redirect(modulePath(patientId, 'prontuario', 'error', 'Não foi possível registrar o adendo.'))
  revalidatePath(`/app/pacientes/${patientId}/prontuario`)
  redirect(modulePath(patientId, 'prontuario', 'message', 'Adendo registrado sem alterar o documento original.'))
}

export async function saveAnamnesis(patientId: string, formData: FormData) {
  const { user, supabase, organizationId } = await requirePermission('clinical.write')
  const fields = ['objective','weight_history','previous_diets','medications','supplements','surgeries','diagnosed_conditions','family_history','signs_symptoms','gastrointestinal','sleep','hydration','physical_activity','eating_habits','daily_routine','recall_24h','preferences','allergies','intolerances','restrictions','budget_notes','regional_availability']
  const payload = Object.fromEntries(fields.map((field) => [field, optional(formData.get(field))]))
  const { error } = await supabase.from('anamneses').insert({ ...payload, organization_id: organizationId, patient_id: patientId, professional_user_id: user.id })
  if (error) redirect(modulePath(patientId, 'anamnese', 'error', 'Não foi possível salvar a anamnese.'))
  revalidatePath(`/app/pacientes/${patientId}/anamnese`)
  redirect(modulePath(patientId, 'anamnese', 'message', 'Nova versão da anamnese registrada.'))
}

export async function addAssessment(patientId: string, formData: FormData) {
  const { supabase, organizationId } = await requirePermission('clinical.write')
  const weight = num(formData.get('weight_kg')), height = num(formData.get('height_cm'))
  const waist = num(formData.get('waist_cm')), hip = num(formData.get('hip_cm'))
  const bmi = calculateBmi(weight, height), whr = calculateWaistHipRatio(waist, hip), whtr = calculateWaistHeightRatio(waist, height)
  const measurementFields = ['waist_cm','abdomen_cm','hip_cm','arm_cm','thigh_cm','calf_cm','chest_cm','neck_cm','body_fat_pct','body_fat_mass_kg','lean_mass_kg','muscle_mass_kg','body_water_pct','visceral_fat_level','basal_metabolism_kcal','metabolic_age_years']
  const measurements = Object.fromEntries(measurementFields.map((field) => [field, num(formData.get(field))]))
  const assessmentDate = optional(formData.get('assessed_at'))
  const skinfolds = [['triceps','Tricipital'],['biceps','Bicipital'],['subscapular','Subescapular'],['suprailiac','Supra-ilíaca'],['abdominal','Abdominal'],['thigh','Coxa'],['calf','Panturrilha']]
    .map(([key,site]) => ({ site, millimeters: num(formData.get(`skinfold_${key}`)), protocol: optional(formData.get('skinfold_protocol')) }))
    .filter((item) => item.millimeters !== null)
  const { error } = await supabase.rpc('record_assessment', {
    p_organization_id: organizationId, p_patient_id: patientId,
    p_assessed_at: assessmentDate ? new Date(`${assessmentDate}T12:00:00Z`).toISOString() : new Date().toISOString(),
    p_notes: optional(formData.get('notes')),
    p_measurements: { ...measurements, weight_kg: weight, height_cm: height,
    bmi: bmi?.value ?? null, bmi_formula: bmi?.formula ?? null, waist_hip_ratio: whr?.value ?? null,
    waist_hip_formula: whr?.formula ?? null, waist_height_ratio: whtr?.value ?? null,
    waist_height_formula: whtr?.formula ?? null }, p_skinfolds: skinfolds,
  })
  if (error) redirect(modulePath(patientId, 'avaliacoes', 'error', 'Não foi possível registrar avaliação e medidas.'))
  revalidatePath(`/app/pacientes/${patientId}/avaliacoes`); revalidatePath(`/app/pacientes/${patientId}/antropometria`)
  redirect(modulePath(patientId, 'avaliacoes', 'message', 'Avaliação e medidas registradas.'))
}

export async function uploadEvolutionPhoto(patientId: string, formData: FormData) {
  const { user, supabase, organizationId } = await requirePermission('clinical.write')
  const file = formData.get('file')
  if (!(file instanceof File)) redirect(modulePath(patientId, 'evolucao', 'error', 'Selecione uma imagem.'))
  let path: string
  try {
    const valid = await validatePrivateFile(file, { maxBytes: 10 * 1024 * 1024, allowedTypes: ['image/jpeg','image/png','image/webp'] })
    if (!valid) throw new Error('empty')
    path = await uploadPrivateFile(supabase, 'evolution-photos', organizationId, patientId, valid)
  } catch { redirect(modulePath(patientId, 'evolucao', 'error', 'Arquivo inválido. Use JPG, PNG ou WebP de até 10 MB.')) }
  const share = formData.get('share_with_patient') === 'on'
  const { error } = await supabase.from('evolution_photos').insert({ organization_id: organizationId, patient_id: patientId, angle: formData.get('angle'), private_file_path: path!, share_with_patient: share, consent_recorded_at: share ? new Date().toISOString() : null, created_by: user.id })
  if (error) redirect(modulePath(patientId, 'evolucao', 'error', 'Não foi possível registrar a foto.'))
  revalidatePath(`/app/pacientes/${patientId}/evolucao`)
  redirect(modulePath(patientId, 'evolucao', 'message', 'Foto privada armazenada.'))
}

export async function addLabExam(patientId: string, formData: FormData) {
  const { supabase, organizationId } = await requirePermission('clinical.write')
  const file = formData.get('file')
  let path: string | null = null
  if (file instanceof File && file.size) {
    try {
      const valid = await validatePrivateFile(file, { maxBytes: 25 * 1024 * 1024, allowedTypes: ['application/pdf','image/jpeg','image/png','image/webp'] })
      if (valid) path = await uploadPrivateFile(supabase, 'lab-exams', organizationId, patientId, valid)
    } catch { redirect(modulePath(patientId, 'exames', 'error', 'Arquivo de exame inválido.')) }
  }
  const { error } = await supabase.rpc('record_lab_exam', {
    p_organization_id: organizationId, p_patient_id: patientId, p_exam_date: optional(formData.get('exam_date')),
    p_laboratory: optional(formData.get('laboratory')), p_file_path: path,
    p_file_mime_type: file instanceof File && file.size ? file.type : null, p_notes: optional(formData.get('notes')),
    p_marker: { name: optional(formData.get('marker_name')), result: optional(formData.get('marker_result')),
      unit: optional(formData.get('marker_unit')), reference_range: optional(formData.get('marker_reference')),
      status: optional(formData.get('marker_status')), notes: optional(formData.get('marker_notes')) },
  })
  if (error) redirect(modulePath(patientId, 'exames', 'error', 'Não foi possível registrar o exame.'))
  revalidatePath(`/app/pacientes/${patientId}/exames`)
  redirect(modulePath(patientId, 'exames', 'message', 'Exame registrado sem interpretação automática.'))
}

export async function createNutritionPlan(patientId: string, formData: FormData) {
  const { user, supabase, organizationId } = await requirePermission('clinical.write')
  const title = z.string().trim().min(2).max(180).parse(formData.get('title'))
  const { error } = await supabase.from('nutrition_plans').insert({ organization_id: organizationId, patient_id: patientId, professional_user_id: user.id, title, plan_type: formData.get('plan_type') === 'weekly' ? 'weekly' : 'daily', notes: optional(formData.get('notes')), status: 'draft' })
  if (error) redirect(modulePath(patientId, 'plano-alimentar', 'error', 'Não foi possível criar o plano.'))
  revalidatePath(`/app/pacientes/${patientId}/plano-alimentar`)
  redirect(modulePath(patientId, 'plano-alimentar', 'message', 'Rascunho criado. Abra-o no editor de planos.'))
}

export async function createPatientPayment(patientId: string, formData: FormData) {
  const { supabase, organizationId } = await requirePermission('finance.write')
  const amount = Math.round(z.coerce.number().min(0).parse(formData.get('amount_reais')) * 100)
  const { error } = await supabase.from('payments').insert({ organization_id: organizationId, patient_id: patientId, description: z.string().trim().min(2).max(240).parse(formData.get('description')), amount_cents: amount, due_date: optional(formData.get('due_date')), status: 'pending' })
  if (error) redirect(modulePath(patientId, 'financeiro', 'error', 'Não foi possível criar a cobrança.'))
  revalidatePath(`/app/pacientes/${patientId}/financeiro`)
  redirect(modulePath(patientId, 'financeiro', 'message', 'Cobrança manual criada.'))
}
