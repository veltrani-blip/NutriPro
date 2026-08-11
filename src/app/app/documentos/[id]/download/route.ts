import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, organizationId } = await requirePermission('documents.read')
  const { data: document } = await supabase.from('documents').select('private_file_path').eq('organization_id', organizationId).eq('id', id).maybeSingle()
  if (!document) return new NextResponse('Documento não encontrado.', { status: 404 })
  const { data, error } = await supabase.storage.from('patient-documents').createSignedUrl(document.private_file_path, 60, { download: true })
  if (error || !data?.signedUrl) return new NextResponse('Não foi possível preparar o download.', { status: 502 })
  return NextResponse.redirect(data.signedUrl)
}
