import Link from 'next/link'
import { Feedback, PageHeader } from '@/components/module-ui'
import { requireOrganization } from '@/lib/auth'
import { markAllNotificationsRead, markNotificationRead } from './actions'

export default async function NotificationsPage({searchParams}:{searchParams:Promise<{message?:string;error?:string}>}){
  const sp=await searchParams
  const {supabase,organizationId,user}=await requireOrganization()
  const {data,error}=await supabase.from('notifications').select('*').eq('organization_id',organizationId).eq('user_id',user.id).order('created_at',{ascending:false}).limit(100)
  const unread=(data??[]).filter(item=>!item.read_at).length
  return <div className="mx-auto max-w-5xl pb-20"><PageHeader eyebrow="Central interna" title="Notificações" description="Eventos reais do workspace; nenhum alerta é criado apenas para preencher a tela."/><Feedback {...sp}/><div className="mt-6 flex items-center justify-between gap-3"><p className="text-sm text-[#607269]">{unread} não lida(s)</p>{unread>0&&<form action={markAllNotificationsRead}><button className="np-button np-button-secondary">Marcar todas como lidas</button></form>}</div>{error?<div className="np-card mt-5 p-5 text-sm text-red-700">Não foi possível carregar as notificações.</div>:data?.length?<div className="np-card mt-5 divide-y divide-[#edf2ef]">{data.map(item=><article className={`p-5 ${item.read_at?'opacity-65':''}`} key={item.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="font-bold">{item.title}</h2>{!item.read_at&&<span className="np-badge">Nova</span>}</div>{item.body&&<p className="mt-2 text-sm text-[#607269]">{item.body}</p>}<time className="mt-2 block text-xs text-[#718179]">{new Date(item.created_at).toLocaleString('pt-BR')}</time></div><div className="flex gap-3">{item.action_url&&<Link className="text-sm font-bold text-[#167451]" href={item.action_url}>Abrir</Link>}{!item.read_at&&<form action={markNotificationRead.bind(null,item.id)}><button className="text-sm font-bold text-[#607269]">Marcar como lida</button></form>}</div></div></article>)}</div>:<div className="np-card mt-5 p-10 text-center text-sm text-[#607269]">Nenhuma notificação real foi registrada.</div>}</div>
}
