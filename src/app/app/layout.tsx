import { AppShell } from '@/components/app-shell'
import { requireOrganization, type Permission } from '@/lib/auth'

const navigationPermissions: Permission[] = ['agenda.read','patient.read','clinical.read','documents.read','finance.read','reports.read']

export default async function ProtectedLayout({children}:{children:React.ReactNode}){
  const {user,supabase,organizationId}=await requireOrganization()
  const [{data:profile},{data:org},...permissionResults]=await Promise.all([
    supabase.from('profiles').select('professional_name,full_name').eq('id',user.id).single(),
    supabase.from('organizations').select('name').eq('id',organizationId).single(),
    ...navigationPermissions.map((permission)=>supabase.rpc('current_user_has_permission',{p_organization_id:organizationId,p_permission:permission})),
  ])
  const allowedPermissions=navigationPermissions.filter((_,index)=>permissionResults[index]?.data===true)
  return <AppShell professionalName={profile?.professional_name||profile?.full_name||'Profissional'} organizationName={org?.name||'NutriPro'} allowedPermissions={allowedPermissions}>{children}</AppShell>
}
