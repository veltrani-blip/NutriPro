'use server'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth'
export async function acceptInvitation(token:string){const {supabase}=await requireUser();const {error}=await supabase.rpc('accept_team_invitation',{p_token:token});if(error)redirect(`/convites/equipe/${encodeURIComponent(token)}?error=${encodeURIComponent('O convite não pôde ser aceito. Confirme o e-mail da conta e a validade do link.')}`);redirect('/app/dashboard')}
