'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { calculateBmi, calculateWaistHeightRatio, calculateWaistHipRatio } from '@/lib/calculations/anthropometry'
import { requirePermission } from '@/lib/auth'
import { uploadPrivateFile, validatePrivateFile } from '@/lib/storage'
import { GeminiGenerationError, generateNutritionPlanDraft } from '@/lib/ai/gemini'

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

export async function generateNutritionPlanWithAi(patientId: string, formData: FormData) {
  const { user, supabase, organizationId } = await requirePermission('clinical.write')
  if (formData.get('professional_review') !== 'on') redirect(modulePath(patientId, 'plano-alimentar', 'error', 'Confirme a revisão profissional obrigatória.'))
  const routine = z.string().trim().min(10).max(4000).parse(formData.get('routine'))
  const goal = z.string().trim().min(3).max(1000).parse(formData.get('goal'))
  const mealsCount = z.coerce.number().int().min(2).max(8).parse(formData.get('meals_count'))
  const age = z.coerce.number().int().min(12).max(100).parse(formData.get('age'))
  const heightCm = z.coerce.number().min(100).max(230).parse(formData.get('height_cm'))
  const weightKg = z.coerce.number().min(25).max(350).parse(formData.get('weight_kg'))
  const trainingDays = z.coerce.number().int().min(0).max(7).parse(formData.get('training_days'))
  const workDays = z.coerce.number().int().min(0).max(7).parse(formData.get('work_days'))
  const [{ data: patient }, { data: anamnesis }] = await Promise.all([
    supabase.from('patients').select('objective,birth_date').eq('organization_id', organizationId).eq('id', patientId).single(),
    supabase.from('anamneses').select('objective,diagnosed_conditions,medications,allergies,intolerances,restrictions,preferences,budget_notes,regional_availability,physical_activity,hydration,sleep').eq('organization_id', organizationId).eq('patient_id', patientId).is('deleted_at', null).order('recorded_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  if (!patient) redirect(modulePath(patientId, 'plano-alimentar', 'error', 'Paciente não encontrado.'))
  const bmi = Number((weightKg / ((heightCm / 100) ** 2)).toFixed(1))
  const input = {
    purpose: 'Gerar rascunho de plano alimentar para revisão por nutricionista', goal,
    anthropometry: { ageYears: age, heightCm, weightKg, bmi },
    weeklySchedule: { trainingDays, workDays },
    routine, desiredMeals: mealsCount, budget: optional(formData.get('budget')) || anamnesis?.budget_notes,
    cookingAccess: optional(formData.get('cooking_access')), professionalNotes: optional(formData.get('professional_notes')),
    clinicalContext: { objective: anamnesis?.objective || patient.objective, diagnosedConditions: anamnesis?.diagnosed_conditions,
      medications: anamnesis?.medications, allergies: anamnesis?.allergies, intolerances: anamnesis?.intolerances,
      restrictions: anamnesis?.restrictions, preferences: anamnesis?.preferences, regionalAvailability: anamnesis?.regional_availability,
      physicalActivity: anamnesis?.physical_activity, hydration: anamnesis?.hydration, sleep: anamnesis?.sleep },
  }
  let generated: Awaited<ReturnType<typeof generateNutritionPlanDraft>>
  try { generated = await generateNutritionPlanDraft(input) }
  catch (error) {
    console.error('[nutrition-plan:ai] generation failed', { patientId, error: error instanceof Error ? error.message : String(error) })
    const messages: Record<string,string> = {
      missing_key: 'A GEMINI_API_KEY não está disponível. Salve-a no .env.local e reinicie o servidor.',
      invalid_key: 'O Gemini recusou a chave. Confirme se a chave nova está correta e se a API Gemini está ativada.',
      quota: 'A cota gratuita do Gemini foi atingida. Aguarde a renovação da cota ou use outra chave com saldo.',
      model: 'Nenhum modelo de texto do Gemini foi liberado para esta chave. Verifique o projeto no Google AI Studio.',
      invalid_request: 'O Gemini recusou o formato da solicitação. Veja o detalhe seguro no terminal do servidor.',
      empty: 'O Gemini respondeu sem gerar conteúdo. Tente novamente em alguns instantes.',
      invalid_response: 'O Gemini gerou uma resposta incompleta. Tente novamente; nenhum plano parcial foi salvo.',
    }
    const message = error instanceof GeminiGenerationError ? messages[error.code] || 'O serviço Gemini está indisponível no momento.' : 'A IA não conseguiu gerar o rascunho agora. Nenhum plano incompleto foi salvo.'
    redirect(modulePath(patientId, 'plano-alimentar', 'error', message))
  }
  const notes = [`RASCUNHO GERADO POR IA — revisão profissional obrigatória.`, `Justificativa: ${generated.plan.rationale}`,
    generated.plan.assumptions.length ? `Premissas:\n- ${generated.plan.assumptions.join('\n- ')}` : '',
    generated.plan.safetyFlags.length ? `Alertas:\n- ${generated.plan.safetyFlags.join('\n- ')}` : '',
    `Checklist de revisão:\n- ${generated.plan.reviewChecklist.join('\n- ')}`].filter(Boolean).join('\n\n')
  const { data: plan, error: planError } = await supabase.from('nutrition_plans').insert({ organization_id: organizationId, patient_id: patientId,
    professional_user_id: user.id, title: generated.plan.title, plan_type: 'daily', notes, status: 'draft', template_name: `IA · ${generated.model}` }).select('id').single()
  if (planError || !plan) redirect(modulePath(patientId, 'plano-alimentar', 'error', 'O rascunho foi gerado, mas não pôde ser salvo.'))
  try {
    for (const [mealIndex, meal] of generated.plan.meals.entries()) {
      const { data: savedMeal, error: mealError } = await supabase.from('meals').insert({ organization_id: organizationId, plan_id: plan.id,
        title: meal.title, meal_time: meal.time, notes: meal.notes, sort_order: mealIndex }).select('id').single()
      if (mealError || !savedMeal) throw new Error('meal')
      for (const [itemIndex, item] of meal.items.entries()) {
        const { data: savedItem, error: itemError } = await supabase.from('meal_items').insert({ organization_id: organizationId, meal_id: savedMeal.id,
          description: item.description, quantity: item.quantity, unit: item.unit, notes: item.notes, sort_order: itemIndex }).select('id').single()
        if (itemError || !savedItem) throw new Error('item')
        if (item.substitutions.length) {
          const { error: substitutionError } = await supabase.from('substitutions').insert(item.substitutions.map((replacement, index) => ({
            organization_id: organizationId, meal_item_id: savedItem.id, description: replacement.description,
            quantity: replacement.quantity, unit: replacement.unit, notes: replacement.notes, sort_order: index,
          })))
          if (substitutionError) throw new Error('substitution')
        }
      }
    }
  } catch {
    await supabase.from('nutrition_plans').delete().eq('organization_id', organizationId).eq('id', plan.id)
    redirect(modulePath(patientId, 'plano-alimentar', 'error', 'Não foi possível salvar todas as refeições; o rascunho parcial foi descartado.'))
  }
  await supabase.from('audit_logs').insert({ organization_id: organizationId, actor_user_id: user.id, action: 'ai.plan_draft_generated', entity: 'nutrition_plan', entity_id: plan.id,
    metadata: { patient_id: patientId, model: generated.model, prompt_version: 'nutripro-plan-v1', meal_count: generated.plan.meals.length, deidentified: true } })
  revalidatePath(`/app/pacientes/${patientId}/plano-alimentar`); revalidatePath(`/app/planos/${plan.id}`)
  redirect(`/app/planos/${plan.id}?message=${encodeURIComponent('Rascunho criado pela IA. Revise alertas, quantidades e substituições antes de publicar.')}`)
}

export async function createPatientPayment(patientId: string, formData: FormData) {
  const { supabase, organizationId } = await requirePermission('finance.write')
  const amount = Math.round(z.coerce.number().min(0).parse(formData.get('amount_reais')) * 100)
  const { error } = await supabase.from('payments').insert({ organization_id: organizationId, patient_id: patientId, description: z.string().trim().min(2).max(240).parse(formData.get('description')), amount_cents: amount, due_date: optional(formData.get('due_date')), status: 'pending' })
  if (error) redirect(modulePath(patientId, 'financeiro', 'error', 'Não foi possível criar a cobrança.'))
  revalidatePath(`/app/pacientes/${patientId}/financeiro`)
  redirect(modulePath(patientId, 'financeiro', 'message', 'Cobrança manual criada.'))
}
