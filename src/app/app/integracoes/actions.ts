'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth'

export async function saveIntegration(formData:FormData){const {supabase,organizationId}=await requirePermission('team.manage');const kind=z.enum(['email','whatsapp','payments','teleconsultation','error_tracking','ai']).parse(formData.get('kind'));const provider=String(formData.get('provider')??'').trim()||null;const secretReference=String(formData.get('secret_reference')??'').trim()||null;const endpoint=String(formData.get('endpoint')??'').trim()||null;const enabled=formData.get('enabled')==='on';const configured=Boolean(provider&&(secretReference||endpoint));const {error}=await supabase.from('integration_configs').upsert({organization_id:organizationId,kind,provider,enabled:enabled&&configured,configured,public_settings:{endpoint},secret_reference:secretReference,last_test_status:null,last_tested_at:null},{onConflict:'organization_id,kind'});if(error)redirect('/app/integracoes?error='+encodeURIComponent('Não foi possível salvar a integração.'));revalidatePath('/app/integracoes');redirect('/app/integracoes?message='+encodeURIComponent(configured?'Configuração salva. O teste real deve ser feito com o provedor externo.':'Integração mantida como não configurada; nenhuma credencial foi inventada.'))}
