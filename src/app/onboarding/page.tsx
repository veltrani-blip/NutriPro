import { completeOnboarding } from '@/app/actions'
import { Logo } from '@/components/logo'
import { OnboardingForm } from '@/components/onboarding-form'
import { requireUser } from '@/lib/auth'

export default async function Onboarding({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireUser()
  const query = await searchParams
  return <main className="min-h-screen px-5 py-10"><div className="mx-auto max-w-4xl"><Logo /><div className="mt-10"><span className="np-badge">Configuração profissional</span><h1 className="mt-4 text-4xl font-black tracking-tight">Prepare seu espaço de atendimento.</h1><p className="mt-3 text-[#607269]">Somente os campos marcados são obrigatórios. Os demais podem ser completados agora ou nas configurações.</p></div>{query.error && <p className="mt-6 rounded-xl bg-red-50 p-3 text-sm text-red-700">{query.error}</p>}<div className="mt-8"><OnboardingForm action={completeOnboarding} /></div></div></main>
}
