import { signOut } from '@/app/actions'
import { Logo } from '@/components/logo'
import { requireUser } from '@/lib/auth'
export default async function SuspendedPage(){await requireUser();return <main className="grid min-h-screen place-items-center px-5"><section className="np-card max-w-lg p-8 text-center"><div className="mb-6 flex justify-center"><Logo/></div><h1 className="text-2xl font-black">Workspace suspenso</h1><p className="mt-3 text-sm leading-6 text-[#607269]">O acesso operacional foi suspenso pela administração da plataforma. Os dados permanecem preservados; entre em contato com o suporte responsável pelo contrato.</p><form action={signOut} className="mt-6"><button className="np-button">Sair</button></form></section></main>}
