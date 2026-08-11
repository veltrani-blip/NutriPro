import Link from 'next/link'
import { ShieldX } from 'lucide-react'

export default function SemPermissao() {
  return (
    <main className="grid min-h-[65vh] place-items-center p-6">
      <section className="np-card max-w-lg p-8 text-center">
        <ShieldX className="mx-auto text-[#b42318]" size={36} aria-hidden="true" />
        <h1 className="mt-4 text-2xl font-black">Acesso não autorizado</h1>
        <p className="mt-2 text-sm leading-6 text-[#607269]">
          Seu perfil não possui a permissão necessária. A tentativa não revelou se o recurso existe.
        </p>
        <Link className="np-button mt-6" href="/app/dashboard">Voltar à visão geral</Link>
      </section>
    </main>
  )
}
