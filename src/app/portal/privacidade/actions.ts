'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requirePatientPortal } from '@/lib/auth'
export async function createPrivacyRequest(formData:FormData){const {supabase,organizationId,patientId}=await requirePatientPortal();const requestType=z.enum(['access','export','correction','deletion','anonymization']).parse(formData.get('request_type'));const {error}=await supabase.from('privacy_requests').insert({organization_id:organizationId,patient_id:patientId,request_type:requestType,due_at:new Date(Date.now()+15*86400000).toISOString()});if(error)redirect('/portal/privacidade?error='+encodeURIComponent('Não foi possível registrar a solicitação.'));revalidatePath('/portal/privacidade');redirect('/portal/privacidade?message='+encodeURIComponent('Solicitação registrada. A equipe fará a análise antes de qualquer alteração.'))}
