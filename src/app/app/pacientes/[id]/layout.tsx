import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requirePermission } from '@/lib/auth'

const administrative = [['','Visão geral'],['consultas','Consultas']] as const
const clinical = [['prontuario','Prontuário'],['anamnese','Anamnese'],['avaliacoes','Avaliações'],['antropometria','Antropometria'],['evolucao','Evolução'],['exames','Exames'],['plano-alimentar','Plano alimentar'],['receitas','Receitas'],['orientacoes','Orientações']] as const
const documents = [['documentos','Documentos'],['questionarios','Questionários'],['arquivos','Arquivos']] as const
const finance = [['financeiro','Financeiro']] as const
const history = [['historico','Histórico']] as const

export default async function PatientLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, organizationId } = await requirePermission('patient.read')
  const [{ data: patient }, { data: clinicalAllowed }, { data: documentsAllowed }, { data: financeAllowed }] = await Promise.all([
    supabase.from('patients').select('id,name,social_name,status').eq('organization_id', organizationId).eq('id', id).is('deleted_at', null).maybeSingle(),
    supabase.rpc('current_user_has_permission', { p_organization_id: organizationId, p_permission: 'clinical.read' }),
    supabase.rpc('current_user_has_permission', { p_organization_id: organizationId, p_permission: 'documents.read' }),
    supabase.rpc('current_user_has_permission', { p_organization_id: organizationId, p_permission: 'finance.read' }),
  ])
  if (!patient) notFound()
  const tabs = [...administrative, ...(clinicalAllowed.data === true ? clinical : []), ...(documentsAllowed.data === true ? documents : []), ...(financeAllowed.data === true ? finance : []), ...history]
  return <div className="mx-auto max-w-7xl pb-20"><header className="mb-6"><Link className="text-sm font-bold text-[#167451]" href="/app/pacientes">← Pacientes</Link><div className="mt-4 flex flex-wrap items-center gap-3"><h1 className="text-3xl font-black">{patient.social_name || patient.name}</h1><span className="np-badge">{patient.status}</span></div><nav className="mt-5 flex gap-2 overflow-x-auto pb-2" aria-label="Seções do paciente">{tabs.map(([path,label]) => <Link className="shrink-0 rounded-xl border border-[#dfe9e3] bg-white px-3 py-2 text-sm font-semibold hover:border-[#167451]" href={path ? `/app/pacientes/${id}/${path}` : `/app/pacientes/${id}`} key={path}>{label}</Link>)}</nav></header>{children}</div>
}
