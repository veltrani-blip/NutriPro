'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { requireOrganization, requireUser } from '@/lib/auth'
import { patientSchema } from '@/lib/validation/patient'
import { onboardingSchema } from '@/lib/validation/onboarding'
import { uploadPrivateFile, validatePrivateFile } from '@/lib/storage'

function safeMessage(error: unknown) { return error instanceof z.ZodError ? error.issues[0]?.message ?? 'Revise os dados informados.' : 'Não foi possível concluir a operação.' }
function safeNext(value: FormDataEntryValue | null) { const path=String(value??''); return path.startsWith('/')&&!path.startsWith('//')?path:null }

export async function signIn(formData: FormData) {
  const supabase = await createClient()
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const next = safeNext(formData.get('next'))
  const { data: signInData, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error || !signInData.user) redirect('/login?error=' + encodeURIComponent('E-mail ou senha inválidos.'))
  const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (assurance?.nextLevel === 'aal2' && assurance.currentLevel !== 'aal2') redirect(next?`/mfa?next=${encodeURIComponent(next)}`:'/mfa')
  if (next) redirect(next)
  const [{ data: membership }, { data: patientLink }] = await Promise.all([
    supabase.from('organization_members').select('id').eq('user_id', signInData.user.id).eq('active', true).limit(1).maybeSingle(),
    supabase.from('patient_user_links').select('id').eq('user_id', signInData.user.id).eq('active', true).limit(1).maybeSingle(),
  ])
  if (membership) redirect('/app/dashboard')
  if (patientLink) redirect('/portal')
  redirect('/onboarding')
}

export async function signUp(formData: FormData) {
  const supabase = await createClient()
  const fullName = String(formData.get('full_name') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim()
  const password = String(formData.get('password') ?? '')
  const next = safeNext(formData.get('next'))
  if (password.length < 10) redirect('/cadastro?error=' + encodeURIComponent('Use uma senha com pelo menos 10 caracteres.'))
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName }, emailRedirectTo: `${origin}/auth/callback${next?`?next=${encodeURIComponent(next)}`:''}` } })
  if (error) redirect('/cadastro?error=' + encodeURIComponent('Não foi possível criar a conta. Verifique os dados.'))
  redirect(`/login?message=${encodeURIComponent('Conta criada. Confirme seu e-mail para continuar.')}${next?`&next=${encodeURIComponent(next)}`:''}`)
}

export async function resetPassword(formData: FormData) {
  const supabase = await createClient(); const email = String(formData.get('email') ?? '').trim()
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/auth/callback?next=/redefinir-senha` })
  redirect('/login?message=' + encodeURIComponent('Se o e-mail estiver cadastrado, você receberá as instruções.'))
}

export async function changePassword(formData: FormData) {
  const { user, supabase, organizationId } = await requireOrganization()
  const password = String(formData.get('password') ?? '')
  const confirmation = String(formData.get('password_confirmation') ?? '')
  if (password.length < 10 || password !== confirmation) {
    redirect('/app/configuracoes?section=security&error=' + encodeURIComponent('As senhas devem coincidir e ter ao menos 10 caracteres.'))
  }
  const { error } = await supabase.auth.updateUser({ password })
  if (error) redirect('/app/configuracoes?section=security&error=' + encodeURIComponent('Não foi possível trocar a senha.'))
  await supabase.auth.signOut({ scope: 'others' })
  await supabase.from('profiles').update({ security_updated_at: new Date().toISOString() }).eq('id', user.id)
  await supabase.from('audit_logs').insert({
    organization_id: organizationId,
    actor_user_id: user.id,
    action: 'security.password_changed',
    entity: 'profile',
    entity_id: user.id,
  })
  redirect('/app/configuracoes?section=security&message=' + encodeURIComponent('Senha atualizada e outras sessões invalidadas.'))
}

export async function setRecoveryPassword(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?error=' + encodeURIComponent('O link expirou. Solicite uma nova recuperação.'))
  const password = String(formData.get('password') ?? '')
  const confirmation = String(formData.get('password_confirmation') ?? '')
  if (password.length < 10 || password !== confirmation) {
    redirect('/redefinir-senha?error=' + encodeURIComponent('As senhas devem coincidir e ter ao menos 10 caracteres.'))
  }
  const { error } = await supabase.auth.updateUser({ password })
  if (error) redirect('/redefinir-senha?error=' + encodeURIComponent('Não foi possível redefinir a senha.'))
  await supabase.auth.signOut({ scope: 'others' })
  redirect('/app/dashboard?message=' + encodeURIComponent('Senha redefinida com segurança.'))
}

export async function signOut() { const supabase = await createClient(); await supabase.auth.signOut(); redirect('/login') }

export async function completeOnboarding(formData: FormData) {
  try {
    const { user, supabase } = await requireUser()
    const parsed = onboardingSchema.parse({
      ...Object.fromEntries([
        'full_name','professional_name','organization_name','crn','crn_region','cpf','cnpj','phone','whatsapp','email',
        'address_line1','address_line2','city','state','postal_code','service_mode','specialties','default_duration_minutes',
        'default_price_reais','timezone','currency_code','business_start','business_end',
      ].map((key) => [key, String(formData.get(key) ?? '')])),
      weekdays: formData.getAll('weekdays').map(String),
    })
    const { data: existing } = await supabase.from('organization_members').select('organization_id').eq('user_id', user.id).eq('active', true).limit(1).maybeSingle()
    let organizationId = existing?.organization_id as string | undefined
    if (!organizationId) {
      const { data, error } = await supabase.rpc('bootstrap_organization', {
        p_organization_name: parsed.organization_name,
        p_professional_name: parsed.professional_name,
      })
      if (error || !data) throw new Error('Não foi possível criar a organização.')
      organizationId = String(data)
    }

    const imageOptions = { maxBytes: 5 * 1024 * 1024, allowedTypes: ['image/jpeg','image/png','image/webp'] }
    const avatar = formData.get('avatar') instanceof File ? await validatePrivateFile(formData.get('avatar') as File, imageOptions) : null
    const logo = formData.get('logo') instanceof File ? await validatePrivateFile(formData.get('logo') as File, imageOptions) : null
    const signature = formData.get('signature') instanceof File ? await validatePrivateFile(formData.get('signature') as File, imageOptions) : null
    const [avatarPath, logoPath, signaturePath] = await Promise.all([
      avatar ? uploadPrivateFile(supabase, 'professional-avatars', organizationId, user.id, avatar) : null,
      logo ? uploadPrivateFile(supabase, 'organization-logos', organizationId, user.id, logo) : null,
      signature ? uploadPrivateFile(supabase, 'professional-signatures', organizationId, user.id, signature) : null,
    ])

    const { error: organizationError } = await supabase.from('organizations').update({
      name: parsed.organization_name, cnpj: parsed.cnpj, phone: parsed.phone, whatsapp: parsed.whatsapp,
      email: parsed.email, address_line1: parsed.address_line1, address_line2: parsed.address_line2,
      city: parsed.city, state: parsed.state, postal_code: parsed.postal_code,
      timezone: parsed.timezone, currency_code: parsed.currency_code,
      ...(logoPath ? { logo_path: logoPath } : {}),
    }).eq('id', organizationId)
    if (organizationError) throw organizationError
    const { error: profileError } = await supabase.from('profiles').update({
      full_name: parsed.full_name, professional_name: parsed.professional_name, cpf: parsed.cpf,
      phone: parsed.phone, whatsapp: parsed.whatsapp, email: parsed.email,
      ...(avatarPath ? { avatar_path: avatarPath } : {}),
      ...(signaturePath ? { signature_path: signaturePath } : {}),
    }).eq('id', user.id)
    if (profileError) throw profileError
    const { error: settingsError } = await supabase.from('professional_settings').upsert({
      organization_id: organizationId, user_id: user.id, crn: parsed.crn, crn_region: parsed.crn_region,
      specialties: parsed.specialties, service_mode: parsed.service_mode,
      default_duration_minutes: parsed.default_duration_minutes, default_price_cents: parsed.default_price_reais,
      signature_enabled: false, completed_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,user_id' })
    if (settingsError) throw settingsError
    await supabase.from('organization_settings').upsert({ organization_id: organizationId }, { onConflict: 'organization_id' })
    const { error: deleteHoursError } = await supabase.from('business_hours').delete().eq('organization_id', organizationId).eq('professional_user_id', user.id)
    if (deleteHoursError) throw deleteHoursError
    const { error: hoursError } = await supabase.from('business_hours').insert(parsed.weekdays.map((weekday) => ({
      organization_id: organizationId, professional_user_id: user.id, weekday,
      starts_at: parsed.business_start, ends_at: parsed.business_end,
    })))
    if (hoursError) throw hoursError
    await supabase.from('audit_logs').insert({ organization_id: organizationId, actor_user_id: user.id, action: 'onboarding.completed', entity: 'organization', entity_id: organizationId })
  } catch (error) {
    redirect('/onboarding?error=' + encodeURIComponent(safeMessage(error)))
  }
  redirect('/app/dashboard')
}

function patientPayload(formData: FormData) {
  return patientSchema.parse(Object.fromEntries([
    'name','social_name','birth_date','cpf','phone','whatsapp','email','profession','objective','source','referral','admin_notes','status','emergency_name','emergency_relation','emergency_phone'
  ].map((k) => [k, String(formData.get(k) ?? '')])))
}

export async function createPatient(formData: FormData) {
  let patientId = ''
  try {
    const { user, supabase, organizationId } = await requireOrganization()
    const payload = patientPayload(formData)
    const { data, error } = await supabase.from('patients').insert({ ...payload, organization_id: organizationId, responsible_user_id: user.id }).select('id').single()
    if (error) throw error
    await supabase.from('audit_logs').insert({ organization_id: organizationId, actor_user_id: user.id, action: 'patient.created', entity: 'patient', entity_id: data.id })
    patientId = data.id
  } catch (error) { redirect('/app/pacientes/novo?error=' + encodeURIComponent(safeMessage(error))) }
  revalidatePath('/app/pacientes')
  redirect(`/app/pacientes/${patientId}`)
}

export async function updatePatient(id: string, formData: FormData) {
  try {
    const { user, supabase, organizationId } = await requireOrganization(); const payload = patientPayload(formData)
    const { error } = await supabase.from('patients').update(payload).eq('id', id).eq('organization_id', organizationId).is('deleted_at', null)
    if (error) throw error
    await supabase.from('audit_logs').insert({ organization_id: organizationId, actor_user_id: user.id, action: 'patient.updated', entity: 'patient', entity_id: id })
  } catch (error) { redirect(`/app/pacientes/${id}/editar?error=` + encodeURIComponent(safeMessage(error))) }
  revalidatePath('/app/pacientes')
  revalidatePath(`/app/pacientes/${id}`)
  redirect(`/app/pacientes/${id}`)
}

export async function archivePatient(id: string) {
  const { user, supabase, organizationId } = await requireOrganization()
  const { error } = await supabase.from('patients').update({ deleted_at: new Date().toISOString() }).eq('id', id).eq('organization_id', organizationId)
  if (error) redirect(`/app/pacientes/${id}?error=` + encodeURIComponent('Não foi possível arquivar o paciente.'))
  await supabase.from('audit_logs').insert({ organization_id: organizationId, actor_user_id: user.id, action: 'patient.archived', entity: 'patient', entity_id: id })
  revalidatePath('/app/pacientes'); redirect('/app/pacientes')
}
