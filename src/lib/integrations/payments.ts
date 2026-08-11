import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

export const paymentWebhookSchema=z.object({
  organizationId:z.string().uuid(),
  eventId:z.string().trim().min(1).max(200),
  type:z.enum(['payment.paid','payment.failed','payment.refunded']),
  providerReference:z.string().trim().min(1).max(240),
  amountCents:z.number().int().nonnegative(),
})

const chargeResponseSchema=z.object({id:z.string().min(1),checkoutUrl:z.string().url(),status:z.enum(['created','pending'])})

export function verifyGatewaySignature(rawBody:string,timestamp:string|null,signature:string|null,secret:string,nowMs=Date.now()){
  const timestampSeconds=Number(timestamp)
  if(!Number.isInteger(timestampSeconds)||Math.abs(Math.floor(nowMs/1000)-timestampSeconds)>300||!signature||!secret)return false
  const expected=createHmac('sha256',secret).update(`${timestampSeconds}.${rawBody}`).digest('hex')
  if(!/^[a-f0-9]{64}$/i.test(signature))return false
  return timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(signature,'hex'))
}

export async function createGatewayCharge(input:{baseUrl:string;apiKey:string;provider:string;idempotencyKey:string;organizationId:string;paymentId:string;amountCents:number;description:string;callbackUrl:string}){
  const endpoint=new URL('/charges',input.baseUrl)
  if(endpoint.protocol!=='https:'&&endpoint.hostname!=='127.0.0.1'&&endpoint.hostname!=='localhost')throw new Error('Gateway endpoint must use HTTPS')
  const response=await fetch(endpoint,{method:'POST',headers:{authorization:`Bearer ${input.apiKey}`,'content-type':'application/json','idempotency-key':input.idempotencyKey},body:JSON.stringify({externalId:input.paymentId,organizationId:input.organizationId,amountCents:input.amountCents,description:input.description,callbackUrl:input.callbackUrl,metadata:{provider:input.provider}}),cache:'no-store',signal:AbortSignal.timeout(15000)})
  if(!response.ok)throw new Error(`Gateway request failed: ${response.status}`)
  const parsed=chargeResponseSchema.parse(await response.json())
  const checkout=new URL(parsed.checkoutUrl)
  if(checkout.protocol!=='https:'&&checkout.hostname!=='127.0.0.1'&&checkout.hostname!=='localhost')throw new Error('Invalid checkout URL')
  return parsed
}
