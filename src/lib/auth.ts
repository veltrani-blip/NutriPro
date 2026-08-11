import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type Permission =
  | 'agenda.read'
  | 'agenda.write'
  | 'patient.read'
  | 'patient.write'
  | 'clinical.read'
  | 'clinical.write'
  | 'finance.read'
  | 'finance.write'
  | 'documents.read'
  | 'documents.write'
  | 'team.manage'
  | 'reports.read'

export async function requireUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/login')
  return { user, supabase }
}

export async function requireOrganization() {
  const { user, supabase } = await requireUser()
  const { data: membership } = await supabase.from('organization_members')
    .select('organization_id, role, active')
    .eq('user_id', user.id).eq('active', true).limit(1).maybeSingle()
  if (!membership) {
    const { data: patientLink } = await supabase.from('patient_user_links').select('id').eq('user_id', user.id).eq('active', true).limit(1).maybeSingle()
    if (patientLink) redirect('/portal')
    redirect('/onboarding')
  }
  const { data: subscription } = await supabase.from('organization_subscriptions').select('status').eq('organization_id', membership.organization_id).maybeSingle()
  if (subscription?.status === 'suspended') redirect('/suspenso')
  return { user, supabase, organizationId: membership.organization_id, role: membership.role }
}

export async function requirePermission(permission: Permission) {
  const context = await requireOrganization()
  const { data, error } = await context.supabase.rpc('current_user_has_permission', {
    p_organization_id: context.organizationId,
    p_permission: permission,
  })
  if (error || data !== true) redirect('/app/sem-permissao')
  return context
}

export async function requirePatientPortal() {
  const { user, supabase } = await requireUser()
  const { data: link } = await supabase
    .from('patient_user_links')
    .select('organization_id,patient_id,active')
    .eq('user_id', user.id)
    .eq('active', true)
    .limit(1)
    .maybeSingle()
  if (!link) redirect('/login?error=' + encodeURIComponent('Esta conta não possui acesso ao portal do paciente.'))
  return { user, supabase, organizationId: link.organization_id, patientId: link.patient_id }
}

export async function requireSuperadmin() {
  const { user, supabase } = await requireUser()
  const { data: administrator } = await supabase
    .from('superadmins')
    .select('user_id,active')
    .eq('user_id', user.id)
    .eq('active', true)
    .maybeSingle()
  if (!administrator) redirect('/app/sem-permissao')
  return { user, supabase }
}
