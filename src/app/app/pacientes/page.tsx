import Link from 'next/link'
import { Plus, Search } from 'lucide-react'
import { requireOrganization } from '@/lib/auth'
import { EmptyState } from '@/components/empty-state'

const labels={lead:'Lead',ativo:'Ativo',acompanhamento:'Acompanhamento',inativo:'Inativo',alta:'Alta'} as const

export default async function Pacientes({searchParams}:{searchParams:Promise<{q?:string;status?:string;page?:string}>}){
  const sp=await searchParams
  const {supabase,organizationId}=await requireOrganization()
  const page=Math.max(1,Number(sp.page)||1)
  const size=20
  const from=(page-1)*size
  let query=supabase.from('patients').select('id,name,social_name,phone,whatsapp,email,status,created_at',{count:'exact'}).eq('organization_id',organizationId).is('deleted_at',null).order('name').range(from,from+size-1)
  if(sp.q)query=query.ilike('name',`%${sp.q.replaceAll('%','')}%`)
  if(sp.status&&Object.keys(labels).includes(sp.status))query=query.eq('status',sp.status as keyof typeof labels)
  const {data,count,error}=await query
  const totalPages=Math.max(1,Math.ceil((count??0)/size))
  const pageHref=(target:number)=>{const params=new URLSearchParams();if(sp.q)params.set('q',sp.q);if(sp.status)params.set('status',sp.status);params.set('page',String(target));return `/app/pacientes?${params}`}

  return <div className="mx-auto max-w-7xl pb-20"><div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-bold text-[#167451]">Relacionamento</p><h1 className="mt-1 text-3xl font-black tracking-tight">Pacientes</h1><p className="mt-2 text-sm text-[#607269]">{count??0} registro(s) no seu workspace.</p></div><Link className="np-button" href="/app/pacientes/novo"><Plus size={17}/>Novo paciente</Link></div><form className="np-card mt-7 grid gap-3 p-4 md:grid-cols-[1fr_220px_auto]"><label className="flex items-center gap-2 rounded-xl border border-[#dfe9e3] px-3"><Search size={16}/><input name="q" defaultValue={sp.q} placeholder="Buscar por nome" className="w-full border-0 bg-transparent py-2.5 outline-none"/></label><select name="status" defaultValue={sp.status??''} className="np-input"><option value="">Todos os status</option>{Object.entries(labels).map(([v,l])=><option key={v} value={v}>{l}</option>)}</select><button className="np-button np-button-secondary">Filtrar</button></form>{error?<div className="np-card mt-5 p-6 text-sm text-red-700">Não foi possível carregar pacientes. Tente novamente.</div>:data?.length?<><div className="np-card mt-5 overflow-hidden"><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-[#f7faf8] text-xs uppercase tracking-wide text-[#718179]"><tr><th className="px-5 py-3">Paciente</th><th className="px-5 py-3">Contato</th><th className="px-5 py-3">Status</th><th className="px-5 py-3"></th></tr></thead><tbody>{data.map(p=><tr key={p.id} className="border-t border-[#edf2ef]"><td className="px-5 py-4"><div className="font-bold">{p.social_name||p.name}</div>{p.social_name&&<div className="text-xs text-[#718179]">Cadastro: {p.name}</div>}</td><td className="px-5 py-4 text-[#607269]">{p.whatsapp||p.phone||p.email||'—'}</td><td className="px-5 py-4"><span className="np-badge">{labels[p.status as keyof typeof labels]??String(p.status)}</span></td><td className="px-5 py-4 text-right"><Link className="font-bold text-[#167451]" href={`/app/pacientes/${p.id}`}>Abrir</Link></td></tr>)}</tbody></table></div></div>{totalPages>1&&<nav className="mt-4 flex items-center justify-between" aria-label="Paginação de pacientes"><span className="text-sm text-[#607269]">Página {page} de {totalPages}</span><div className="flex gap-2">{page>1&&<Link className="np-button np-button-secondary" href={pageHref(page-1)}>Anterior</Link>}{page<totalPages&&<Link className="np-button np-button-secondary" href={pageHref(page+1)}>Próxima</Link>}</div></nav>}</>:<div className="mt-5"><EmptyState title="Sua base de pacientes começa aqui" description="Cadastre o primeiro paciente real. O registro ficará isolado no workspace da sua clínica e protegido pelas políticas do banco." actionHref="/app/pacientes/novo" actionLabel="Cadastrar paciente"/></div>}</div>
}
