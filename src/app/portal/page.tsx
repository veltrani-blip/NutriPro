import Link from 'next/link'
import { PageHeader } from '@/components/module-ui'
import { requirePatientPortal } from '@/lib/auth'

export default async function PortalHome() {
  const { supabase, organizationId, patientId } = await requirePatientPortal()
  const [{ count: plans }, { count: documents }, { count: questionnaires }, { count: payments }] = await Promise.all([
    supabase.from('nutrition_plan_versions').select('*',{count:'exact',head:true}).eq('organization_id',organizationId).eq('patient_id',patientId),
    supabase.from('documents').select('*',{count:'exact',head:true}).eq('organization_id',organizationId).eq('patient_id',patientId),
    supabase.from('questionnaire_assignments').select('*',{count:'exact',head:true}).eq('organization_id',organizationId).eq('patient_id',patientId).eq('status','pending'),
    supabase.from('payments').select('*',{count:'exact',head:true}).eq('organization_id',organizationId).eq('patient_id',patientId).in('status',['pending','overdue']),
  ])
  return <div><PageHeader eyebrow="Área do paciente" title="Seu acompanhamento" description="Aqui aparecem apenas informações que sua equipe publicou ou liberou para você."/><div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><PortalCard href="/portal/planos" label="Planos publicados" value={plans ?? 0}/><PortalCard href="/portal/documentos" label="Documentos liberados" value={documents ?? 0}/><PortalCard href="/portal/questionarios" label="Questionários pendentes" value={questionnaires ?? 0}/><PortalCard href="/portal/financeiro" label="Pagamentos em aberto" value={payments ?? 0}/></div><div className="np-card mt-7 p-6"><h2 className="font-bold">Privacidade do portal</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-[#607269]">Seu acesso é individual. Dados internos do prontuário, observações administrativas e registros de outros pacientes não são disponibilizados aqui. Em caso de dúvida sobre um conteúdo, fale com sua equipe de nutrição.</p></div></div>
}
function PortalCard({href,label,value}:{href:string;label:string;value:number}){return <Link className="np-card p-5 transition hover:border-[#88b9a5]" href={href}><div className="text-3xl font-black">{value}</div><div className="mt-2 text-sm text-[#607269]">{label}</div></Link>}
