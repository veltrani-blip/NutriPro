'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireOrganization } from '@/lib/auth'

export async function markNotificationRead(id:string){
  const {supabase,organizationId,user}=await requireOrganization()
  const {error}=await supabase.from('notifications').update({read_at:new Date().toISOString()}).eq('organization_id',organizationId).eq('user_id',user.id).eq('id',id)
  if(error)redirect('/app/notificacoes?error='+encodeURIComponent('Não foi possível marcar a notificação como lida.'))
  revalidatePath('/app/notificacoes')
}

export async function markAllNotificationsRead(){
  const {supabase,organizationId,user}=await requireOrganization()
  const {error}=await supabase.from('notifications').update({read_at:new Date().toISOString()}).eq('organization_id',organizationId).eq('user_id',user.id).is('read_at',null)
  if(error)redirect('/app/notificacoes?error='+encodeURIComponent('Não foi possível atualizar as notificações.'))
  revalidatePath('/app/notificacoes')
  redirect('/app/notificacoes?message='+encodeURIComponent('Notificações marcadas como lidas.'))
}
