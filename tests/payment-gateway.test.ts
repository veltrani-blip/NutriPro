import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { paymentWebhookSchema, verifyGatewaySignature } from '@/lib/integrations/payments'

describe('gateway payment webhook',()=>{
  const body=JSON.stringify({organizationId:'10000000-0000-4000-8000-000000000001',eventId:'evt_1',type:'payment.paid',providerReference:'charge_1',amountCents:25000})
  const secret='segredo-de-teste'
  const now=1_800_000_000_000
  const timestamp=String(Math.floor(now/1000))
  const signature=createHmac('sha256',secret).update(`${timestamp}.${body}`).digest('hex')

  it('aceita assinatura íntegra dentro da janela de replay',()=>{
    expect(verifyGatewaySignature(body,timestamp,signature,secret,now)).toBe(true)
  })

  it('rejeita corpo alterado, assinatura malformada e evento antigo',()=>{
    expect(verifyGatewaySignature(`${body} `,timestamp,signature,secret,now)).toBe(false)
    expect(verifyGatewaySignature(body,timestamp,'invalida',secret,now)).toBe(false)
    expect(verifyGatewaySignature(body,String(Number(timestamp)-301),signature,secret,now)).toBe(false)
  })

  it('valida o contrato mínimo do evento',()=>{
    expect(paymentWebhookSchema.parse(JSON.parse(body)).amountCents).toBe(25000)
    expect(()=>paymentWebhookSchema.parse({...JSON.parse(body),amountCents:-1})).toThrow()
  })
})
