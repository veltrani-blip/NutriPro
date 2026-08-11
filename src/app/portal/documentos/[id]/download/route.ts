import { NextResponse } from 'next/server'
import { requirePatientPortal } from '@/lib/auth'

export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;const {supabase,organizationId,patientId}=await requirePatientPortal();const {data:document}=await supabase.from('documents').select('private_file_path').eq('organization_id',organizationId).eq('patient_id',patientId).eq('id',id).maybeSingle();if(!document)return new NextResponse('Documento não encontrado.',{status:404});const {data,error}=await supabase.storage.from('patient-documents').createSignedUrl(document.private_file_path,60,{download:true});if(error||!data?.signedUrl)return new NextResponse('Não foi possível preparar o download.',{status:502});return NextResponse.redirect(data.signedUrl)}
