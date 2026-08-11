import Link from 'next/link'
import { EmptyPanel, PageHeader } from '@/components/module-ui'
import { requirePermission } from '@/lib/auth'

export default async function PlansPage() {
  const { supabase, organizationId } = await requirePermission('clinical.read')
  const [{ data: plans }, { data: patients }] = await Promise.all([
    supabase.from('nutrition_plans').select('*').eq('organization_id', organizationId).is('deleted_at', null).order('created_at', { ascending: false }),
    supabase.from('patients').select('id,name,social_name').eq('organization_id', organizationId),
  ])
  const names = new Map((patients ?? []).map((patient) => [patient.id, patient.social_name || patient.name]))
  return <div className="mx-auto max-w-6xl pb-20"><PageHeader eyebrow="Conduta" title="Planos alimentares" description="Rascunhos editáveis e versões publicadas imutáveis. Novos planos são iniciados no hub do paciente."/><div className="mt-7 grid gap-4">{plans?.length ? plans.map((plan) => <Link className="np-card flex flex-wrap items-center justify-between gap-4 p-5 transition hover:border-[#88b9a5]" href={`/app/planos/${plan.id}`} key={plan.id}><div><h2 className="font-bold">{plan.title}</h2><p className="mt-1 text-sm text-[#607269]">{names.get(plan.patient_id) ?? 'Paciente'} · {plan.plan_type === 'weekly' ? 'Semanal' : 'Diário'}</p></div><div className="text-right"><span className="np-badge">{plan.status}</span><p className="mt-1 text-xs text-[#718179]">versão {plan.version}</p></div></Link>) : <EmptyPanel>Abra um paciente e use a aba Plano alimentar para criar o primeiro rascunho.</EmptyPanel>}</div></div>
}
