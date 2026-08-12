import Link from 'next/link'
import { Sparkles, UserPlus } from 'lucide-react'
import { EmptyPanel, PageHeader } from '@/components/module-ui'
import { requirePermission } from '@/lib/auth'

export default async function NutriProAiPage() {
  const { supabase, organizationId } = await requirePermission('clinical.read')
  const { data: patients } = await supabase.from('patients').select('id,name,social_name,objective').eq('organization_id', organizationId).is('deleted_at', null).order('name')
  return <div className="mx-auto max-w-6xl pb-20"><PageHeader eyebrow="Assistente clínico" title="NutriPro IA" description="Escolha um paciente e gere uma sugestão completa de dieta a partir de idade, altura, peso, rotina, trabalho e treinos."/><section className="mt-7 rounded-3xl bg-[#10251d] p-6 text-white sm:p-8"><Sparkles size={28} className="text-emerald-300"/><h2 className="mt-5 text-2xl font-black">Da rotina ao rascunho em poucos minutos</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-white/70">A IA organiza horários, refeições, quantidades sugeridas, alternativas econômicas e substituições. O plano permanece editável e só é publicado depois da sua revisão.</p></section><div className="mt-6 grid gap-3">{patients?.length ? patients.map((patient) => <article className="np-card flex flex-wrap items-center justify-between gap-4 p-5" key={patient.id}><div><h2 className="font-bold">{patient.social_name || patient.name}</h2><p className="mt-1 text-sm text-[#607269]">{patient.objective || 'Objetivo ainda não informado'}</p></div><Link className="np-button" href={`/app/pacientes/${patient.id}/plano-alimentar`}><Sparkles size={17}/> Gerar dieta com IA</Link></article>) : <EmptyPanel><UserPlus className="mx-auto mb-3"/><p>Cadastre o primeiro paciente para gerar uma dieta.</p><Link className="np-button mt-4" href="/app/pacientes/novo">Cadastrar paciente</Link></EmptyPanel>}</div></div>
}
