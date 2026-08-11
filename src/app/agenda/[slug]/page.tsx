import { notFound } from 'next/navigation'
import { format } from 'date-fns'
import { Logo } from '@/components/logo'
import { PublicBookingForm } from '@/components/public-booking-form'
import { createClient } from '@/lib/supabase/server'
import { bookPublicAppointment } from './actions'

export default async function PublicAgenda({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ service?: string; date?: string }> }) {
  const { slug } = await params
  const query = await searchParams
  const supabase = await createClient()
  const { data: profile } = await supabase.from('public_booking_profiles').select('organization_id,slug,display_name,clinic_name,public_bio,public_location,timezone').eq('slug', slug).eq('enabled', true).maybeSingle()
  if (!profile) notFound()
  const { data: services } = await supabase.from('service_types').select('id,name,duration_minutes,price_cents,modality,instructions').eq('organization_id', profile.organization_id).eq('public_enabled', true).eq('active', true).is('deleted_at', null).order('name')
  const selectedService = services?.find((service) => service.id === query.service) ?? services?.[0]
  const date = /^\d{4}-\d{2}-\d{2}$/.test(query.date ?? '') ? query.date! : format(new Date(), 'yyyy-MM-dd')
  const { data: slots } = selectedService ? await supabase.rpc('list_public_slots', { p_slug: slug, p_service_type_id: selectedService.id, p_date: date }) : { data: [] }
  const action = bookPublicAppointment.bind(null, slug)
  return <main className="min-h-screen bg-[#f6f9f7] px-5 py-8"><div className="mx-auto max-w-3xl"><header className="flex items-center justify-between"><Logo /><span className="np-badge">Agendamento seguro</span></header><section className="mt-10"><p className="text-sm font-bold text-[#167451]">{profile.clinic_name || 'Atendimento nutricional'}</p><h1 className="mt-2 text-4xl font-black">Agende com {profile.display_name}</h1>{profile.public_bio && <p className="mt-3 max-w-2xl text-[#607269]">{profile.public_bio}</p>}{profile.public_location && <p className="mt-2 text-sm text-[#607269]">{profile.public_location}</p>}</section><div className="mt-8 grid gap-5 lg:grid-cols-[.75fr_1.25fr]"><aside className="np-card p-5"><form className="grid gap-4"><label><span className="np-label">Serviço</span><select className="np-input" name="service" defaultValue={selectedService?.id}>{services?.map((service) => <option value={service.id} key={service.id}>{service.name} · {service.duration_minutes} min</option>)}</select></label><label><span className="np-label">Data</span><input className="np-input" name="date" type="date" min={format(new Date(), 'yyyy-MM-dd')} defaultValue={date} /></label><button className="np-button np-button-secondary">Ver horários</button></form>{selectedService && <div className="mt-5 border-t border-[#edf2ef] pt-5 text-sm"><div className="font-bold">{selectedService.name}</div><div className="mt-1 text-[#607269]">{selectedService.modality} · {(selectedService.price_cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</div>{selectedService.instructions && <p className="mt-3 text-xs leading-5 text-[#607269]">{selectedService.instructions}</p>}</div>}</aside><section className="np-card p-6"><h2 className="text-lg font-bold">Escolha o horário</h2><div className="mt-5">{selectedService && slots?.length ? <PublicBookingForm action={action} serviceId={selectedService.id} slots={slots} /> : <div className="rounded-2xl bg-[#f7faf8] p-8 text-center text-sm text-[#607269]">Nenhum horário disponível para esta combinação.</div>}</div></section></div><p className="mt-6 text-center text-xs text-[#718179]">Seus dados são usados somente para organizar este atendimento e ficam protegidos pelo controle de acesso do consultório.</p></div></main>
}
