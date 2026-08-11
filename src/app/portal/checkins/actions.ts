'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requirePatientPortal } from '@/lib/auth'
const value=(formData:FormData,key:string)=>String(formData.get(key)??'').trim()
export async function submitCheckin(requestId:string,formData:FormData){const {supabase}=await requirePatientPortal();const response={weight_kg:value(formData,'weight_kg'),hunger:value(formData,'hunger'),satiety:value(formData,'satiety'),energy:value(formData,'energy'),sleep:value(formData,'sleep'),training:value(formData,'training'),adherence:value(formData,'adherence'),difficulties:value(formData,'difficulties'),comments:value(formData,'comments')};const {error}=await supabase.rpc('submit_checkin_response',{p_request_id:requestId,p_response:response});if(error)redirect('/portal/checkins?error='+encodeURIComponent('Não foi possível enviar o check-in. Verifique os campos.'));revalidatePath('/portal/checkins');redirect('/portal/checkins?message='+encodeURIComponent('Check-in enviado.'))}
