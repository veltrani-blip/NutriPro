'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/browser'

type Factor = { id: string; friendly_name?: string; status: string }
type Enrollment = { id: string; qr: string; secret: string }

export function MfaManager({ challengeOnly = false }: { challengeOnly?: boolean }) {
  const router = useRouter()
  const [factors, setFactors] = useState<Factor[]>([])
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function loadFactors() {
    const supabase = createClient()
    const { data, error } = await supabase.auth.mfa.listFactors()
    if (error) return setMessage('Não foi possível carregar os fatores de segurança.')
    setFactors(data.totp)
  }

  useEffect(() => {
    let active = true
    void createClient().auth.mfa.listFactors().then(({ data, error }) => {
      if (!active) return
      if (error) setMessage('Não foi possível carregar os fatores de segurança.')
      else setFactors(data.totp)
    })
    return () => { active = false }
  }, [])

  async function enroll() {
    setBusy(true); setMessage('')
    const { data, error } = await createClient().auth.mfa.enroll({ factorType: 'totp', friendlyName: 'NutriPro' })
    setBusy(false)
    if (error) return setMessage('Não foi possível iniciar o MFA. Verifique a configuração do Supabase Auth.')
    setEnrollment({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
  }

  async function verify(factorId: string) {
    if (!/^\d{6}$/.test(code)) return setMessage('Informe o código de seis dígitos do autenticador.')
    setBusy(true); setMessage('')
    const supabase = createClient()
    const challenge = await supabase.auth.mfa.challenge({ factorId })
    if (challenge.error) { setBusy(false); return setMessage('Não foi possível criar o desafio MFA.') }
    const verification = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.data.id, code })
    setBusy(false)
    if (verification.error) return setMessage('Código inválido ou expirado. Tente novamente.')
    setEnrollment(null); setCode(''); setMessage('Autenticação em dois fatores confirmada.')
    await loadFactors(); router.refresh()
  }

  async function remove(factorId: string) {
    if (!window.confirm('Remover este autenticador?')) return
    const { error } = await createClient().auth.mfa.unenroll({ factorId })
    setMessage(error ? 'Não foi possível remover o autenticador.' : 'Autenticador removido.')
    await loadFactors()
  }

  const verified = factors.filter((factor) => factor.status === 'verified')
  if (challengeOnly) return <section className="np-card p-7"><h1 className="text-2xl font-black">Confirme seu segundo fator</h1><p className="mt-2 text-sm text-[#607269]">Digite o código atual do aplicativo autenticador.</p>{message && <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{message}</p>}<div className="mt-5 grid gap-3"><label><span className="np-label">Código de 6 dígitos</span><input className="np-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} /></label><button className="np-button" disabled={busy || !verified[0]} onClick={() => verified[0] && verify(verified[0].id)}>{busy ? 'Verificando…' : 'Confirmar acesso'}</button></div></section>

  return <section className="np-card p-6"><h2 className="text-lg font-bold">Autenticação em dois fatores</h2><p className="mt-2 text-sm text-[#607269]">Use um aplicativo TOTP. Depois de ativado, o segundo fator será exigido nas próximas sessões.</p>{message && <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{message}</p>}<div className="mt-5 grid gap-3">{verified.map((factor) => <div className="flex items-center justify-between rounded-xl border border-[#dfe9e3] p-3" key={factor.id}><div><div className="text-sm font-bold">{factor.friendly_name || 'Aplicativo autenticador'}</div><div className="text-xs text-[#607269]">Ativo</div></div><button className="text-sm font-bold text-red-700" type="button" onClick={() => remove(factor.id)}>Remover</button></div>)}{!enrollment && <button className="np-button np-button-secondary" type="button" disabled={busy} onClick={enroll}>Adicionar autenticador</button>}{enrollment && <div className="rounded-2xl border border-[#dfe9e3] p-4"><p className="text-sm font-bold">Escaneie o QR code</p><Image className="mt-3 rounded-lg" src={enrollment.qr} alt="QR code para cadastrar o autenticador" width={192} height={192} unoptimized/><p className="mt-3 break-all text-xs text-[#607269]">Chave manual: {enrollment.secret}</p><div className="mt-4 flex gap-2"><input className="np-input" aria-label="Código de verificação" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))} /><button className="np-button" type="button" disabled={busy} onClick={() => verify(enrollment.id)}>Ativar</button></div></div>}</div></section>
}
