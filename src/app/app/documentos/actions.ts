'use server'

import { createHash, randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { requirePermission } from '@/lib/auth'
import { buildClinicalPdf, buildReceiptPdf } from '@/lib/pdf'

const go = (path: string, key: 'message'|'error', message: string): never => redirect(`${path}?${key}=${encodeURIComponent(message)}`)

export async function issueDocument(formData: FormData) {
  const { supabase, organizationId, user } = await requirePermission('documents.write')
  const patientId = z.string().uuid().parse(formData.get('patient_id'))
  const title = z.string().trim().min(2).max(180).parse(formData.get('title'))
  const type = z.enum(['orientacao','plano_alimentar','relatorio','declaracao','outro']).parse(formData.get('type'))
  const content = z.string().trim().min(10).max(40000).parse(formData.get('content'))
  const [{ data: patient }, { data: organization }, { data: profile }, { data: settings }] = await Promise.all([
    supabase.from('patients').select('name,social_name').eq('organization_id', organizationId).eq('id', patientId).single(),
    supabase.from('organizations').select('name').eq('id', organizationId).single(),
    supabase.from('profiles').select('professional_name,full_name').eq('id', user.id).single(),
    supabase.from('professional_settings').select('crn,crn_region,document_footer').eq('organization_id', organizationId).eq('user_id', user.id).maybeSingle(),
  ])
  if (!patient || !organization) redirect('/app/documentos?error=' + encodeURIComponent('Paciente ou clínica não encontrado.'))
  const professionalName = profile?.professional_name || profile?.full_name || 'Profissional'
  const registration = settings?.crn ? `${settings.crn_region ? `${settings.crn_region} ` : ''}${settings.crn}` : null
  const bytes = await buildClinicalPdf({ organizationName: organization.name, professionalName, registration, patientName: patient.social_name || patient.name, title, documentType: type.replace('_',' '), content, footer: settings?.document_footer })
  const checksum = createHash('sha256').update(bytes).digest('hex')
  const filePath = `${organizationId}/${patientId}/${randomUUID()}.pdf`
  const { error: uploadError } = await supabase.storage.from('patient-documents').upload(filePath, bytes, { contentType: 'application/pdf', upsert: false })
  if (uploadError) go('/app/documentos','error','Não foi possível armazenar o PDF privado.')
  const { data: document, error } = await supabase.from('documents').insert({ organization_id: organizationId, patient_id: patientId, type, title, private_file_path: filePath, mime_type: 'application/pdf', checksum, source_version: 'nutripro-pdf-v1', signature_applied: false, created_by: user.id }).select('id').single()
  if (error || !document) { await supabase.storage.from('patient-documents').remove([filePath]); redirect('/app/documentos?error=' + encodeURIComponent('Não foi possível registrar o documento emitido.')) }
  if (formData.get('release_to_patient') === 'on') {
    const { error: releaseError } = await supabase.from('document_releases').insert({ organization_id: organizationId, document_id: document.id, patient_id: patientId, released_by: user.id })
    if (releaseError) go('/app/documentos','error','Documento emitido, mas a liberação ao portal falhou.')
  }
  revalidatePath('/app/documentos'); go('/app/documentos','message','PDF emitido e armazenado no bucket privado.')
}

export async function setDocumentRelease(documentId: string, patientId: string, release: boolean) {
  const { supabase, organizationId, user } = await requirePermission('documents.write')
  if (release) {
    const { error } = await supabase.from('document_releases').upsert({ organization_id: organizationId, document_id: documentId, patient_id: patientId, released_by: user.id, released_at: new Date().toISOString(), revoked_at: null }, { onConflict: 'organization_id,document_id,patient_id' })
    if (error) go('/app/documentos','error','Não foi possível liberar o documento.')
  } else {
    const { error } = await supabase.from('document_releases').update({ revoked_at: new Date().toISOString() }).eq('organization_id', organizationId).eq('document_id', documentId).eq('patient_id', patientId)
    if (error) go('/app/documentos','error','Não foi possível revogar o documento.')
  }
  revalidatePath('/app/documentos'); go('/app/documentos','message',release ? 'Documento liberado no portal.' : 'Acesso do portal revogado.')
}

export async function issueReceipt(paymentId: string) {
  const { supabase, organizationId, user } = await requirePermission('finance.write')
  const [{ data: payment }, { data: organization }, { data: profile }, { data: settings }, { data: existing }] = await Promise.all([
    supabase.from('payments').select('*').eq('organization_id', organizationId).eq('id', paymentId).eq('status','paid').single(),
    supabase.from('organizations').select('name').eq('id', organizationId).single(),
    supabase.from('profiles').select('professional_name,full_name').eq('id', user.id).single(),
    supabase.from('professional_settings').select('crn,crn_region,professional_document').eq('organization_id', organizationId).eq('user_id', user.id).maybeSingle(),
    supabase.from('receipts').select('id').eq('organization_id', organizationId).eq('payment_id', paymentId).maybeSingle(),
  ])
  if (existing) go('/app/financeiro','error','Este pagamento já possui recibo emitido.')
  if (!payment?.patient_id || !payment.paid_at || !organization) redirect('/app/financeiro?error=' + encodeURIComponent('O pagamento precisa estar quitado e vinculado a um paciente.'))
  const { data: patient } = await supabase.from('patients').select('name,social_name,cpf').eq('organization_id', organizationId).eq('id', payment.patient_id).single()
  if (!patient) redirect('/app/financeiro?error=' + encodeURIComponent('Paciente não encontrado.'))
  const professionalName = profile?.professional_name || profile?.full_name || 'Profissional'
  const professionalDocument = settings?.professional_document || (settings?.crn ? `${settings.crn_region ? `${settings.crn_region} ` : ''}${settings.crn}` : null)
  const method = payment.payment_method || payment.method
  if (!method || !['pix','cash','card','transfer','other'].includes(method)) {
    go('/app/financeiro','error','Informe um meio de pagamento válido antes de emitir o recibo.')
  }
  const bytes = await buildReceiptPdf({ organizationName: organization.name, professionalName, professionalDocument, patientName: patient.social_name || patient.name, patientDocument: patient.cpf, description: payment.description, amountCents: Number(payment.amount_cents), paymentMethod: method, paidAt: new Date(payment.paid_at) })
  const checksum = createHash('sha256').update(bytes).digest('hex')
  const filePath = `${organizationId}/${payment.patient_id}/recibo-${randomUUID()}.pdf`
  const { error: uploadError } = await supabase.storage.from('patient-documents').upload(filePath, bytes, { contentType: 'application/pdf', upsert: false })
  if (uploadError) go('/app/financeiro','error','Não foi possível armazenar o recibo privado.')
  const { error } = await supabase.rpc('issue_payment_receipt', {
    p_organization_id: organizationId,
    p_payment_id: paymentId,
    p_payment_method: method,
    p_paid_at: payment.paid_at,
    p_file_path: filePath,
    p_checksum: checksum,
  })
  if (error) { await supabase.storage.from('patient-documents').remove([filePath]); go('/app/financeiro','error','Não foi possível emitir o recibo.') }
  revalidatePath('/app/financeiro'); go('/app/financeiro','message','Recibo emitido e liberado ao paciente.')
}
