'use server'

import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth'
import { scaleNutrients, sumNutrients, type Nutrients } from '@/lib/calculations/nutrition'
import { createGatewayCharge } from '@/lib/integrations/payments'
import { starterGuidance, starterRecipes, starterTemplates } from '@/lib/nutrition/starter-content'

const text = (value: FormDataEntryValue | null) => String(value ?? '').trim() || null
const number = (value: FormDataEntryValue | null) => { const parsed = Number(value); return value === null || value === '' || !Number.isFinite(parsed) ? null : parsed }
const money = (value: FormDataEntryValue | null) => Math.round(z.coerce.number().min(0).parse(value) * 100)
const go = (path: string, key: 'message' | 'error', value: string): never => redirect(`${path}?${key}=${encodeURIComponent(value)}`)

export async function installStarterLibrary() {
  const { supabase, organizationId, user } = await requirePermission('clinical.write')
  const [{ data: guidance }, { data: recipes }, { data: templates }] = await Promise.all([
    supabase.from('guidance_library').select('title').eq('organization_id', organizationId).is('deleted_at', null),
    supabase.from('recipes').select('title').eq('organization_id', organizationId).is('deleted_at', null),
    supabase.from('nutrition_plan_templates').select('name').eq('organization_id', organizationId).eq('owner_user_id', user.id),
  ])
  const knownGuidance = new Set(guidance?.map((item) => item.title)); const knownRecipes = new Set(recipes?.map((item) => item.title)); const knownTemplates = new Set(templates?.map((item) => item.name))
  const guidanceRows = starterGuidance.filter((item) => !knownGuidance.has(item.title)).map((item) => ({ ...item, organization_id: organizationId, created_by: user.id }))
  const recipeRows = starterRecipes.filter((item) => !knownRecipes.has(item.title)).map((item) => ({ ...item, organization_id: organizationId, created_by: user.id }))
  const templateRows = starterTemplates.filter(([name]) => !knownTemplates.has(name)).map(([name, description, meals]) => ({ organization_id: organizationId, owner_user_id: user.id, name, description, template_data: { version: 1, editable: true, meals: meals.map((title, sort_order) => ({ title, sort_order, items: [] })) } }))
  const results = await Promise.all([
    guidanceRows.length ? supabase.from('guidance_library').insert(guidanceRows) : Promise.resolve({ error: null }),
    recipeRows.length ? supabase.from('recipes').insert(recipeRows) : Promise.resolve({ error: null }),
    templateRows.length ? supabase.from('nutrition_plan_templates').insert(templateRows) : Promise.resolve({ error: null }),
  ])
  if (results.some((result) => result.error)) go('/app/planos', 'error', 'Parte da biblioteca não pôde ser instalada.')
  revalidatePath('/app/planos'); revalidatePath('/app/receitas'); revalidatePath('/app/orientacoes')
  go('/app/planos', 'message', 'Biblioteca inicial instalada: modelos, receitas e orientações editáveis.')
}

export async function createFood(formData: FormData) {
  const { supabase, organizationId } = await requirePermission('clinical.write')
  const name = z.string().trim().min(2).max(180).parse(formData.get('name'))
  const payload = {
    organization_id: organizationId, name, category: text(formData.get('category')),
    serving_description: text(formData.get('serving_description')), serving_quantity: number(formData.get('serving_quantity')),
    serving_unit: text(formData.get('serving_unit')), gram_weight: number(formData.get('gram_weight')),
    kcal: number(formData.get('kcal')), protein_g: number(formData.get('protein_g')), carbs_g: number(formData.get('carbs_g')),
    fat_g: number(formData.get('fat_g')), fiber_g: number(formData.get('fiber_g')), sodium_mg: number(formData.get('sodium_mg')),
    source: text(formData.get('source')), source_url: text(formData.get('source_url')), is_custom: true,
  }
  const { error } = await supabase.from('foods').insert(payload)
  if (error) go('/app/alimentos', 'error', 'Não foi possível salvar o alimento.')
  revalidatePath('/app/alimentos'); go('/app/alimentos', 'message', 'Alimento personalizado salvo. Valores não informados permaneceram ausentes.')
}

export async function createRecipe(formData: FormData) {
  const { supabase, organizationId, user } = await requirePermission('clinical.write')
  const title = z.string().trim().min(2).max(180).parse(formData.get('title'))
  const { data: recipe, error } = await supabase.from('recipes').insert({
    organization_id: organizationId, title, description: text(formData.get('description')),
    yield_text: text(formData.get('yield_text')), servings: number(formData.get('servings')),
    prep_minutes: number(formData.get('prep_minutes')), total_minutes: number(formData.get('total_minutes')),
    instructions: text(formData.get('instructions')), notes: text(formData.get('notes')), category: text(formData.get('category')),
    created_by: user.id,
  }).select('id').single()
  if (error) go('/app/receitas', 'error', 'Não foi possível salvar a receita.')
  const recipeId = recipe?.id
  if (!recipeId) redirect('/app/receitas?error=' + encodeURIComponent('Não foi possível identificar a receita salva.'))
  const ingredient = text(formData.get('ingredient'))
  if (ingredient) {
    const { error: ingredientError } = await supabase.from('recipe_ingredients').insert({
      organization_id: organizationId, recipe_id: recipeId, description: ingredient,
      quantity: number(formData.get('ingredient_quantity')), unit: text(formData.get('ingredient_unit')), sort_order: 0,
    })
    if (ingredientError) go('/app/receitas', 'error', 'A receita foi criada, mas o ingrediente não pôde ser salvo.')
  }
  revalidatePath('/app/receitas'); go('/app/receitas', 'message', 'Receita salva na biblioteca.')
}

export async function createGuidance(formData: FormData) {
  const { supabase, organizationId, user } = await requirePermission('clinical.write')
  const payload = { organization_id: organizationId, created_by: user.id,
    title: z.string().trim().min(2).max(180).parse(formData.get('title')),
    category: text(formData.get('category')), content: z.string().trim().min(1).max(20000).parse(formData.get('content')) }
  const { error } = await supabase.from('guidance_library').insert(payload)
  if (error) go('/app/orientacoes', 'error', 'Não foi possível salvar a orientação.')
  revalidatePath('/app/orientacoes'); go('/app/orientacoes', 'message', 'Orientação adicionada à biblioteca.')
}

export async function assignGuidance(formData: FormData) {
  const { supabase, organizationId, user } = await requirePermission('clinical.write')
  const patientId = z.string().uuid().parse(formData.get('patient_id'))
  const { error } = await supabase.from('patient_guidance').insert({
    organization_id: organizationId, patient_id: patientId,
    guidance_id: z.string().uuid().parse(formData.get('guidance_id')),
    nutrition_plan_id: text(formData.get('nutrition_plan_id')), assigned_by: user.id,
    released_to_patient: formData.get('released_to_patient') === 'on',
  })
  if (error) go('/app/orientacoes', 'error', 'Não foi possível vincular a orientação.')
  revalidatePath(`/app/pacientes/${patientId}/orientacoes`); go('/app/orientacoes', 'message', 'Orientação vinculada ao paciente.')
}

export async function addPlanMeal(planId: string, formData: FormData) {
  const { supabase, organizationId } = await requirePermission('clinical.write')
  const { count } = await supabase.from('meals').select('*', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('plan_id', planId)
  const { error } = await supabase.from('meals').insert({ organization_id: organizationId, plan_id: planId,
    title: z.string().trim().min(2).max(120).parse(formData.get('title')), meal_time: text(formData.get('meal_time')),
    day_of_week: number(formData.get('day_of_week')), notes: text(formData.get('notes')), sort_order: count ?? 0 })
  if (error) go(`/app/planos/${planId}`, 'error', 'Não foi possível adicionar a refeição.')
  revalidatePath(`/app/planos/${planId}`); go(`/app/planos/${planId}`, 'message', 'Refeição adicionada.')
}

export async function addMealItem(planId: string, mealId: string, formData: FormData) {
  const { supabase, organizationId } = await requirePermission('clinical.write')
  const { count } = await supabase.from('meal_items').select('*', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('meal_id', mealId)
  const { error } = await supabase.from('meal_items').insert({
    organization_id: organizationId, meal_id: mealId, food_id: text(formData.get('food_id')),
    recipe_id: text(formData.get('recipe_id')), description: z.string().trim().min(1).max(240).parse(formData.get('description')),
    quantity: number(formData.get('quantity')), unit: text(formData.get('unit')), gram_weight: number(formData.get('gram_weight')),
    notes: text(formData.get('notes')), sort_order: count ?? 0,
  })
  if (error) go(`/app/planos/${planId}`, 'error', 'Não foi possível adicionar o item.')
  revalidatePath(`/app/planos/${planId}`); go(`/app/planos/${planId}`, 'message', 'Item adicionado à refeição.')
}

export async function addSubstitution(planId: string, mealItemId: string, formData: FormData) {
  const { supabase, organizationId } = await requirePermission('clinical.write')
  const { error } = await supabase.from('substitutions').insert({
    organization_id: organizationId, meal_item_id: mealItemId, food_id: text(formData.get('food_id')),
    description: z.string().trim().min(1).max(240).parse(formData.get('description')),
    quantity: number(formData.get('quantity')), unit: text(formData.get('unit')), notes: text(formData.get('notes')),
  })
  if (error) go(`/app/planos/${planId}`, 'error', 'Não foi possível adicionar a substituição.')
  revalidatePath(`/app/planos/${planId}`); go(`/app/planos/${planId}`, 'message', 'Substituição adicionada.')
}

export async function duplicatePlanMeal(planId:string,mealId:string){
  const {supabase,organizationId}=await requirePermission('clinical.write')
  const {error}=await supabase.rpc('duplicate_plan_meal',{p_organization_id:organizationId,p_meal_id:mealId})
  if(error)go(`/app/planos/${planId}`,'error','Não foi possível duplicar a refeição.')
  revalidatePath(`/app/planos/${planId}`);go(`/app/planos/${planId}`,'message','Refeição, itens e substituições duplicados.')
}

export async function movePlanMeal(planId:string,mealId:string,direction:-1|1){
  const {supabase,organizationId}=await requirePermission('clinical.write')
  const {error}=await supabase.rpc('move_plan_meal',{p_organization_id:organizationId,p_meal_id:mealId,p_direction:direction})
  if(error)go(`/app/planos/${planId}`,'error','Não foi possível reordenar a refeição.')
  revalidatePath(`/app/planos/${planId}`)
}

export async function deletePlanMeal(planId:string,mealId:string){
  const {supabase,organizationId}=await requirePermission('clinical.write')
  const {error}=await supabase.from('meals').delete().eq('organization_id',organizationId).eq('plan_id',planId).eq('id',mealId)
  if(error)go(`/app/planos/${planId}`,'error','Não foi possível excluir a refeição.')
  revalidatePath(`/app/planos/${planId}`);go(`/app/planos/${planId}`,'message','Refeição removida do rascunho atual.')
}

export async function publishPlan(planId: string) {
  const { supabase, organizationId } = await requirePermission('clinical.write')
  const [{ data: plan }, { data: meals }] = await Promise.all([
    supabase.from('nutrition_plans').select('*').eq('organization_id', organizationId).eq('id', planId).maybeSingle(),
    supabase.from('meals').select('*').eq('organization_id', organizationId).eq('plan_id', planId).order('sort_order'),
  ])
  if (!plan) go(`/app/planos/${planId}`, 'error', 'Plano não encontrado.')
  const mealIds = meals?.map((meal) => meal.id) ?? []
  const { data: items } = mealIds.length ? await supabase.from('meal_items').select('*').eq('organization_id', organizationId).in('meal_id', mealIds).order('sort_order') : { data: [] }
  const foodIds = items?.map((item) => item.food_id).filter(Boolean) ?? []
  const { data: foods } = foodIds.length ? await supabase.from('foods').select('*').or(`organization_id.is.null,organization_id.eq.${organizationId}`).in('id', foodIds) : { data: [] }
  const itemIds = items?.map((item) => item.id) ?? []
  const { data: substitutions } = itemIds.length ? await supabase.from('substitutions').select('*').eq('organization_id', organizationId).in('meal_item_id', itemIds).order('sort_order') : { data: [] }
  const foodMap = new Map(foods?.map((food) => [food.id, food]) ?? [])
  const nutritionByItem = new Map<string, Nutrients>()
  for (const item of items ?? []) {
    const food = item.food_id ? foodMap.get(item.food_id) : null
    nutritionByItem.set(item.id, food ? scaleNutrients({ kcal: food.kcal, proteinG: food.protein_g, carbsG: food.carbs_g, fatG: food.fat_g, fiberG: food.fiber_g }, item.gram_weight, food.gram_weight) : { kcal: null, proteinG: null, carbsG: null, fatG: null, fiberG: null })
  }
  const snapshotMeals = (meals ?? []).map((meal) => {
    const mealItems = (items ?? []).filter((item) => item.meal_id === meal.id).map((item) => ({ ...item, nutrients: nutritionByItem.get(item.id), substitutions: (substitutions ?? []).filter((substitution) => substitution.meal_item_id === item.id) }))
    return { ...meal, items: mealItems, totals: sumNutrients(mealItems.map((item) => item.nutrients!)) }
  })
  const snapshot = { plan: { id: plan.id, title: plan.title, plan_type: plan.plan_type, patient_id: plan.patient_id, notes: plan.notes }, meals: snapshotMeals, totals: sumNutrients([...nutritionByItem.values()]) }
  const checksum = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex')
  const { data: version, error } = await supabase.rpc('publish_nutrition_plan', { p_organization_id: organizationId, p_plan_id: planId, p_snapshot: snapshot, p_checksum: checksum })
  if (error) go(`/app/planos/${planId}`, 'error', 'Não foi possível publicar o plano.')
  revalidatePath(`/app/planos/${planId}`); go(`/app/planos/${planId}`, 'message', `Plano publicado como versão ${version}.`)
}

export async function createQuestionnaire(formData: FormData) {
  const { supabase, organizationId, user } = await requirePermission('clinical.write')
  const { data: questionnaire, error } = await supabase.from('questionnaires').insert({
    organization_id: organizationId, title: z.string().trim().min(2).max(180).parse(formData.get('title')),
    description: text(formData.get('description')), created_by: user.id,
    published_at: formData.get('published') === 'on' ? new Date().toISOString() : null,
  }).select('id').single()
  if (error) go('/app/questionarios', 'error', 'Não foi possível criar o questionário.')
  const questionnaireId = questionnaire?.id
  if (!questionnaireId) redirect('/app/questionarios?error=' + encodeURIComponent('Não foi possível identificar o questionário salvo.'))
  const options = String(formData.get('options') ?? '').split(',').map((item) => item.trim()).filter(Boolean)
  const { error: fieldError } = await supabase.from('questionnaire_fields').insert({
    organization_id: organizationId, questionnaire_id: questionnaireId,
    label: z.string().trim().min(1).max(180).parse(formData.get('field_label')),
    field_type: formData.get('field_type'), required: formData.get('required') === 'on', options: options.length ? options : null,
  })
  if (fieldError) go('/app/questionarios', 'error', 'Questionário criado, mas o campo não pôde ser salvo.')
  revalidatePath('/app/questionarios'); go('/app/questionarios', 'message', 'Questionário e campo inicial salvos.')
}

export async function addQuestionnaireField(questionnaireId:string,formData:FormData){
  const {supabase,organizationId}=await requirePermission('clinical.write')
  const options=String(formData.get('options')??'').split(',').map(item=>item.trim()).filter(Boolean)
  const {count}=await supabase.from('questionnaire_fields').select('*',{count:'exact',head:true}).eq('organization_id',organizationId).eq('questionnaire_id',questionnaireId)
  const {error}=await supabase.from('questionnaire_fields').insert({organization_id:organizationId,questionnaire_id:questionnaireId,label:z.string().trim().min(1).max(180).parse(formData.get('label')),help_text:text(formData.get('help_text')),field_type:z.enum(['text','textarea','number','date','select','multiselect','boolean','scale','checkbox']).parse(formData.get('field_type')),required:formData.get('required')==='on',options:options.length?options:null,sort_order:count??0})
  if(error)go('/app/questionarios','error','Não foi possível adicionar o campo.')
  revalidatePath('/app/questionarios');go('/app/questionarios','message','Campo adicionado ao questionário.')
}

export async function setQuestionnairePublished(questionnaireId:string,published:boolean){
  const {supabase,organizationId}=await requirePermission('clinical.write')
  const {error}=await supabase.from('questionnaires').update({published_at:published?new Date().toISOString():null}).eq('organization_id',organizationId).eq('id',questionnaireId)
  if(error)go('/app/questionarios','error','Não foi possível alterar a publicação.')
  revalidatePath('/app/questionarios');go('/app/questionarios','message',published?'Questionário publicado.':'Questionário voltou para rascunho.')
}

export async function archiveQuestionnaire(questionnaireId:string){
  const {supabase,organizationId}=await requirePermission('clinical.write')
  const {error}=await supabase.from('questionnaires').update({deleted_at:new Date().toISOString()}).eq('organization_id',organizationId).eq('id',questionnaireId)
  if(error)go('/app/questionarios','error','Não foi possível arquivar o questionário.')
  revalidatePath('/app/questionarios');go('/app/questionarios','message','Questionário arquivado sem apagar o histórico.')
}

export async function assignQuestionnaire(formData: FormData) {
  const { supabase, organizationId, user } = await requirePermission('clinical.write')
  const { error } = await supabase.from('questionnaire_assignments').insert({ organization_id: organizationId,
    questionnaire_id: z.string().uuid().parse(formData.get('questionnaire_id')),
    patient_id: z.string().uuid().parse(formData.get('patient_id')), assigned_by: user.id,
    due_at: text(formData.get('due_at')) })
  if (error) go('/app/questionarios', 'error', 'Não foi possível atribuir o questionário.')
  revalidatePath('/app/questionarios'); go('/app/questionarios', 'message', 'Questionário atribuído.')
}

export async function createExpense(formData: FormData) {
  const { supabase, organizationId } = await requirePermission('finance.write')
  const { error } = await supabase.from('expenses').insert({ organization_id: organizationId,
    category: z.string().trim().min(1).max(120).parse(formData.get('category')),
    description: z.string().trim().min(2).max(240).parse(formData.get('description')),
    amount_cents: money(formData.get('amount_reais')), expense_date: formData.get('expense_date'),
    recurrence_interval: text(formData.get('recurrence_interval')) })
  if (error) go('/app/financeiro', 'error', 'Não foi possível salvar a despesa.')
  revalidatePath('/app/financeiro'); go('/app/financeiro', 'message', 'Despesa registrada.')
}

export async function createPayment(formData: FormData) {
  const { supabase, organizationId } = await requirePermission('finance.write')
  const status = formData.get('status') === 'paid' ? 'paid' : 'pending'
  const paymentMethod = text(formData.get('payment_method'))
  const now = new Date().toISOString()
  const { error } = await supabase.from('payments').insert({
    organization_id: organizationId,
    patient_id: z.string().uuid().parse(formData.get('patient_id')),
    description: z.string().trim().min(2).max(240).parse(formData.get('description')),
    amount_cents: money(formData.get('amount_reais')),
    due_date: text(formData.get('due_date')),
    status,
    payment_method: paymentMethod,
    method: paymentMethod,
    payment_date: status === 'paid' ? now.slice(0, 10) : null,
    paid_at: status === 'paid' ? now : null,
  })
  if (error) go('/app/financeiro', 'error', 'Não foi possível registrar o lançamento.')
  revalidatePath('/app/financeiro'); go('/app/financeiro', 'message', status === 'paid' ? 'Recebimento registrado.' : 'Cobrança registrada.')
}

export async function startOnlinePayment(paymentId:string){
  const {supabase,organizationId}=await requirePermission('finance.write')
  const [{data:payment},{data:config}]=await Promise.all([
    supabase.from('payments').select('id,description,amount_cents,status').eq('organization_id',organizationId).eq('id',paymentId).in('status',['pending','overdue']).maybeSingle(),
    supabase.from('integration_configs').select('provider,enabled,configured').eq('organization_id',organizationId).eq('kind','payments').maybeSingle(),
  ])
  if(!payment)return go('/app/financeiro','error','A cobrança não está disponível para pagamento online.')
  if(!config?.enabled||!config.configured||!config.provider)return go('/app/financeiro','error','Integração de pagamento não configurada.')
  const provider=config.provider
  const {data:existing}=await supabase.from('payment_intents').select('checkout_url,status').eq('organization_id',organizationId).eq('payment_id',paymentId).eq('provider',provider).in('status',['created','pending']).maybeSingle()
  if(existing?.checkout_url)redirect(existing.checkout_url)
  const baseUrl=process.env.NUTRIPRO_PAYMENT_GATEWAY_URL
  const apiKey=process.env.NUTRIPRO_PAYMENT_GATEWAY_API_KEY
  const appUrl=process.env.NEXT_PUBLIC_APP_URL
  if(!baseUrl||!apiKey||!appUrl)return go('/app/financeiro','error','Integração de pagamento não configurada no servidor.')
  const idempotencyKey=createHash('sha256').update(`${organizationId}:${paymentId}:${provider}`).digest('hex')
  let charge:Awaited<ReturnType<typeof createGatewayCharge>>
  try{charge=await createGatewayCharge({baseUrl,apiKey,provider,idempotencyKey,organizationId,paymentId,amountCents:Number(payment.amount_cents),description:payment.description,callbackUrl:`${appUrl}/api/webhooks/payments/${encodeURIComponent(provider)}`})}catch{return go('/app/financeiro','error','O gateway não aceitou a criação da cobrança. Nenhum pagamento foi confirmado.')}
  const {error}=await supabase.from('payment_intents').upsert({organization_id:organizationId,payment_id:paymentId,provider,provider_reference:charge.id,idempotency_key:idempotencyKey,amount_cents:Number(payment.amount_cents),status:'pending',checkout_url:charge.checkoutUrl},{onConflict:'organization_id,provider,idempotency_key'})
  if(error)go('/app/financeiro','error','A cobrança foi criada no gateway, mas a conciliação local falhou. Tente novamente com a mesma cobrança.')
  redirect(charge.checkoutUrl)
}

export async function updatePayment(paymentId: string, status: string, formData: FormData) {
  const { supabase, organizationId } = await requirePermission('finance.write')
  const allowed = ['pending','overdue','cancelled','partially_refunded','refunded']
  if (!allowed.includes(status)) return
  const patch: Record<string, unknown> = { status }
  if (status.includes('refunded')) patch.refunded_cents = money(formData.get('refunded_reais'))
  const { error } = await supabase.from('payments').update(patch).eq('organization_id', organizationId).eq('id', paymentId)
  if (error) go('/app/financeiro', 'error', 'Não foi possível atualizar o pagamento.')
  revalidatePath('/app/financeiro'); go('/app/financeiro', 'message', 'Pagamento atualizado.')
}

export async function createCrmLead(formData: FormData) {
  const { supabase, organizationId, user } = await requirePermission('patient.write')
  const { error } = await supabase.from('crm_leads').insert({ organization_id: organizationId, created_by: user.id,
    name: z.string().trim().min(2).max(180).parse(formData.get('name')), phone: text(formData.get('phone')),
    email: text(formData.get('email')), source: text(formData.get('source')), interest: text(formData.get('interest')),
    notes: text(formData.get('notes')), stage: formData.get('stage') ?? 'new', next_contact_at: text(formData.get('next_contact_at')) })
  if (error) go('/app/crm', 'error', 'Não foi possível salvar o lead.')
  revalidatePath('/app/crm'); go('/app/crm', 'message', 'Lead salvo no CRM.')
}

export async function createTask(formData: FormData) {
  const { supabase, organizationId, user } = await requirePermission('patient.read')
  const { error } = await supabase.from('tasks').insert({ organization_id: organizationId,
    title: z.string().trim().min(2).max(180).parse(formData.get('title')), description: text(formData.get('description')),
    patient_id: text(formData.get('patient_id')), assigned_user_id: text(formData.get('assigned_user_id')) || user.id,
    due_at: text(formData.get('due_at')), priority: formData.get('priority') ?? 'normal', status: 'open' })
  if (error) go('/app/tarefas', 'error', 'Não foi possível criar a tarefa.')
  revalidatePath('/app/tarefas'); go('/app/tarefas', 'message', 'Tarefa criada.')
}

export async function cancelTask(taskId:string){
  const {supabase,organizationId}=await requirePermission('patient.read')
  const {error}=await supabase.from('tasks').update({status:'cancelled',completed_at:new Date().toISOString()}).eq('organization_id',organizationId).eq('id',taskId)
  if(error)go('/app/tarefas','error','Não foi possível cancelar a tarefa.')
  revalidatePath('/app/tarefas');go('/app/tarefas','message','Tarefa cancelada.')
}

export async function updateTask(taskId:string,formData:FormData){
  const {supabase,organizationId}=await requirePermission('patient.read')
  const {error}=await supabase.from('tasks').update({title:z.string().trim().min(2).max(180).parse(formData.get('title')),description:text(formData.get('description')),due_at:text(formData.get('due_at')),priority:z.enum(['low','normal','high','urgent']).parse(formData.get('priority')),assigned_user_id:text(formData.get('assigned_user_id'))}).eq('organization_id',organizationId).eq('id',taskId)
  if(error)go('/app/tarefas','error','Não foi possível atualizar a tarefa.')
  revalidatePath('/app/tarefas');go('/app/tarefas','message','Tarefa atualizada.')
}

export async function completeTask(taskId: string) {
  const { supabase, organizationId } = await requirePermission('patient.read')
  const { error } = await supabase.from('tasks').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('organization_id', organizationId).eq('id', taskId)
  if (error) go('/app/tarefas', 'error', 'Não foi possível concluir a tarefa.')
  revalidatePath('/app/tarefas'); go('/app/tarefas', 'message', 'Tarefa concluída.')
}

export async function updateRecipe(recipeId:string,formData:FormData){
  const {supabase,organizationId}=await requirePermission('clinical.write')
  const {error}=await supabase.from('recipes').update({title:z.string().trim().min(2).max(180).parse(formData.get('title')),category:text(formData.get('category')),description:text(formData.get('description')),yield_text:text(formData.get('yield_text')),servings:number(formData.get('servings')),prep_minutes:number(formData.get('prep_minutes')),total_minutes:number(formData.get('total_minutes')),instructions:text(formData.get('instructions')),notes:text(formData.get('notes'))}).eq('organization_id',organizationId).eq('id',recipeId)
  if(error)go('/app/receitas','error','Não foi possível atualizar a receita.')
  revalidatePath('/app/receitas');go('/app/receitas','message','Receita atualizada.')
}

export async function archiveRecipe(recipeId:string){
  const {supabase,organizationId}=await requirePermission('clinical.write')
  const {error}=await supabase.from('recipes').update({deleted_at:new Date().toISOString()}).eq('organization_id',organizationId).eq('id',recipeId)
  if(error)go('/app/receitas','error','Não foi possível arquivar a receita.')
  revalidatePath('/app/receitas');go('/app/receitas','message','Receita arquivada.')
}

export async function updateGuidance(guidanceId:string,formData:FormData){
  const {supabase,organizationId}=await requirePermission('clinical.write')
  const {error}=await supabase.from('guidance_library').update({title:z.string().trim().min(2).max(180).parse(formData.get('title')),category:text(formData.get('category')),content:z.string().trim().min(1).max(20000).parse(formData.get('content'))}).eq('organization_id',organizationId).eq('id',guidanceId)
  if(error)go('/app/orientacoes','error','Não foi possível atualizar a orientação.')
  revalidatePath('/app/orientacoes');go('/app/orientacoes','message','Orientação atualizada.')
}

export async function archiveGuidance(guidanceId:string){
  const {supabase,organizationId}=await requirePermission('clinical.write')
  const {error}=await supabase.from('guidance_library').update({deleted_at:new Date().toISOString()}).eq('organization_id',organizationId).eq('id',guidanceId)
  if(error)go('/app/orientacoes','error','Não foi possível arquivar a orientação.')
  revalidatePath('/app/orientacoes');go('/app/orientacoes','message','Orientação arquivada.')
}
