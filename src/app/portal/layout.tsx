import Link from 'next/link'
import { signOut } from '@/app/actions'
import { Logo } from '@/components/logo'
import { requirePatientPortal } from '@/lib/auth'

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const { supabase, organizationId, patientId } = await requirePatientPortal()
  const [{ data: patient }, { data: organization }] = await Promise.all([
    supabase.from('patients').select('name,social_name').eq('organization_id', organizationId).eq('id', patientId).single(),
    supabase.from('organizations').select('name').eq('id', organizationId).single(),
  ])
  return <div className="min-h-screen"><header className="border-b border-[#dfe9e3] bg-white"><div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4"><Logo/><nav className="flex flex-wrap items-center gap-4 text-sm font-bold text-[#40564b]"><Link href="/portal">Início</Link><Link href="/portal/planos">Planos</Link><Link href="/portal/documentos">Documentos</Link><Link href="/portal/questionarios">Questionários</Link><Link href="/portal/checkins">Check-ins</Link><Link href="/portal/financeiro">Financeiro</Link><Link href="/portal/privacidade">Privacidade</Link><form action={signOut}><button>Sair</button></form></nav></div></header><main className="mx-auto max-w-6xl px-5 py-8 pb-20"><div className="mb-6 text-sm text-[#607269]">{patient?.social_name || patient?.name || 'Paciente'} · {organization?.name || 'NutriPro'}</div>{children}</main></div>
}
