import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { paymentWebhookSchema, verifyGatewaySignature } from '@/lib/integrations/payments'

export async function POST(request:Request,{params}:{params:Promise<{provider:string}>}){
  const {provider}=await params
  if(!/^[a-z0-9_-]{2,50}$/.test(provider))return NextResponse.json({error:'invalid_provider'},{status:400})
  const rawBody=await request.text()
  let payload
  try{payload=paymentWebhookSchema.parse(JSON.parse(rawBody))}catch{return NextResponse.json({error:'invalid_payload'},{status:400})}
  let admin
  try{admin=createAdminClient()}catch{return NextResponse.json({error:'integration_unavailable'},{status:503})}
  const {data:configured,error:configurationError}=await admin.rpc('payment_webhook_configuration',{p_organization_id:payload.organizationId,p_provider:provider})
  if(configurationError||configured!==true)return NextResponse.json({error:'integration_unavailable'},{status:503})
  const secret=process.env.NUTRIPRO_PAYMENT_WEBHOOK_SECRET??''
  const valid=verifyGatewaySignature(rawBody,request.headers.get('x-nutripro-timestamp'),request.headers.get('x-nutripro-signature'),secret)
  if(!valid)return NextResponse.json({error:'invalid_signature'},{status:401})
  const payloadHash=createHash('sha256').update(rawBody).digest('hex')
  const {data:status,error}=await admin.rpc('process_payment_webhook',{p_organization_id:payload.organizationId,p_provider:provider,p_provider_event_id:payload.eventId,p_provider_reference:payload.providerReference,p_event_type:payload.type,p_amount_cents:payload.amountCents,p_payload_hash:payloadHash})
  if(error)return NextResponse.json({error:'processing_failed'},{status:500})
  return NextResponse.json({received:true,status})
}
