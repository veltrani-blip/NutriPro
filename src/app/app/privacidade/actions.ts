'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth'
export async function reviewPrivacyRequest(id:string,formData:FormData){const {supabase,organizationId,user}=await requirePermission('patient.write');const status=z.enum(['reviewing','approved','rejected','completed']).parse(formData.get('status'));const notes=z.string().trim().min(3).max(2000).parse(formData.get('review_notes'));const patch:Record<string,unknown>={status,reviewed_by:user.id,review_notes:notes};if(status==='completed')patch.completed_at=new Date().toISOString();const {error}=await supabase.from('privacy_requests').update(patch).eq('organization_id',organizationId).eq('id',id);if(error)redirect('/app/privacidade?error='+encodeURIComponent('Não foi possível atualizar a solicitação.'));revalidatePath('/app/privacidade');redirect('/app/privacidade?message='+encodeURIComponent('Solicitação atualizada com justificativa.'))}
