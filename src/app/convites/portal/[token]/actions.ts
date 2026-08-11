'use server'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
export async function acceptPortalInvitation(token:string){const {supabase}=await requireUser();const {error}=await supabase.rpc('accept_patient_portal_invitation',{p_token:token});if(error)redirect(`/convites/portal/${encodeURIComponent(token)}?error=${encodeURIComponent('O convite não pôde ser aceito. Confirme o e-mail da conta e a validade do link.')}`);redirect('/portal')}
