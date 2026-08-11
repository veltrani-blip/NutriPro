import { setRecoveryPassword } from '@/app/actions'
import { InputField } from '@/components/field'
import { Logo } from '@/components/logo'
import { requireUser } from '@/lib/auth'

export default async function RedefinirSenha({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  await requireUser()
  const query = await searchParams
  return <main className="grid min-h-screen place-items-center px-5"><div className="w-full max-w-md"><div className="mb-8 flex justify-center"><Logo /></div><section className="np-card p-7"><h1 className="text-2xl font-black">Defina uma nova senha</h1><p className="mt-2 text-sm text-[#607269]">O link de recuperação abriu uma sessão temporária protegida.</p>{query.error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{query.error}</p>}<form action={setRecoveryPassword} className="mt-6 grid gap-4"><InputField label="Nova senha" name="password" type="password" minLength={10} autoComplete="new-password" required /><InputField label="Confirmar nova senha" name="password_confirmation" type="password" minLength={10} autoComplete="new-password" required /><button className="np-button" type="submit">Redefinir senha</button></form></section></div></main>
}
