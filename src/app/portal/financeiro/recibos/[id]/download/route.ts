import { NextResponse } from 'next/server'
import { requirePatientPortal } from '@/lib/auth'

export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;const {supabase,organizationId,patientId}=await requirePatientPortal();const {data:receipt}=await supabase.from('receipts').select('private_file_path').eq('organization_id',organizationId).eq('patient_id',patientId).eq('id',id).maybeSingle();if(!receipt)return new NextResponse('Recibo não encontrado.',{status:404});const {data,error}=await supabase.storage.from('patient-documents').createSignedUrl(receipt.private_file_path,60,{download:true});if(error||!data?.signedUrl)return new NextResponse('Não foi possível preparar o download.',{status:502});return NextResponse.redirect(data.signedUrl)}
