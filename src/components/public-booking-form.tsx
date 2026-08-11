'use client'

import { useActionState } from 'react'
import type { PublicBookingState } from '@/app/agenda/[slug]/actions'

const initial: PublicBookingState = { ok: false, message: '' }

export function PublicBookingForm({ action, serviceId, slots }: { action: (state: PublicBookingState, formData: FormData) => Promise<PublicBookingState>; serviceId: string; slots: { starts_at: string; ends_at: string }[] }) {
  const [state, formAction, pending] = useActionState(action, initial)
  if (state.ok) return <div className="rounded-2xl bg-emerald-50 p-6 text-emerald-900" role="status"><h2 className="font-bold">Agendamento recebido</h2><p className="mt-2 text-sm leading-6">{state.message}</p></div>
  return <form action={formAction} className="grid gap-4"><input type="hidden" name="service_type_id" value={serviceId} /><fieldset><legend className="np-label">Horário disponível</legend><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{slots.map((slot) => <label className="cursor-pointer rounded-xl border border-[#dfe9e3] p-3 text-center text-sm has-[:checked]:border-[#167451] has-[:checked]:bg-[#e6f5ee]" key={slot.starts_at}><input className="sr-only" type="radio" name="starts_at" value={slot.starts_at} required />{new Date(slot.starts_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</label>)}</div></fieldset><label><span className="np-label">Nome completo</span><input className="np-input" name="name" required minLength={2} /></label><div className="grid gap-4 sm:grid-cols-2"><label><span className="np-label">Telefone</span><input className="np-input" name="phone" inputMode="tel" /></label><label><span className="np-label">E-mail</span><input className="np-input" name="email" type="email" /></label></div>{state.message && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700" role="alert">{state.message}</p>}<button className="np-button" disabled={pending}>{pending ? 'Reservando…' : 'Solicitar agendamento'}</button></form>
}
