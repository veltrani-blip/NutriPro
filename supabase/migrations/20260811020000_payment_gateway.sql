begin;

alter table public.payment_intents add column if not exists checkout_url text;

create or replace function public.payment_webhook_configuration(
  p_organization_id uuid,
  p_provider text
) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1 from public.integration_configs
    where organization_id=p_organization_id and kind='payments' and enabled and configured and provider=p_provider
  )
$$;
revoke all on function public.payment_webhook_configuration(uuid,text) from public,anon,authenticated;
grant execute on function public.payment_webhook_configuration(uuid,text) to service_role;

create or replace function public.process_payment_webhook(
  p_organization_id uuid,
  p_provider text,
  p_provider_event_id text,
  p_provider_reference text,
  p_event_type text,
  p_amount_cents bigint,
  p_payload_hash text
) returns text language plpgsql volatile security definer set search_path = '' as $$
declare
  v_event_id uuid;
  v_intent public.payment_intents%rowtype;
begin
  if p_event_type not in ('payment.paid','payment.failed','payment.refunded') then raise exception 'invalid event type'; end if;
  if p_amount_cents<0 or nullif(trim(p_provider_event_id),'') is null or nullif(trim(p_provider_reference),'') is null then raise exception 'invalid event'; end if;
  insert into public.payment_webhook_events(provider,provider_event_id,organization_id,signature_valid,payload_hash)
    values(p_provider,p_provider_event_id,p_organization_id,true,p_payload_hash)
    on conflict(provider,provider_event_id) do nothing returning id into v_event_id;
  if v_event_id is null then return 'duplicate'; end if;
  select * into v_intent from public.payment_intents
    where organization_id=p_organization_id and provider=p_provider and provider_reference=p_provider_reference for update;
  if not found then
    update public.payment_webhook_events set status='ignored',processed_at=now(),error_code='intent_not_found' where id=v_event_id;
    return 'ignored';
  end if;
  if v_intent.amount_cents<>p_amount_cents then
    update public.payment_webhook_events set status='failed',processed_at=now(),error_code='amount_mismatch' where id=v_event_id;
    return 'failed';
  end if;
  if p_event_type='payment.paid' then
    update public.payment_intents set status='paid',updated_at=now() where id=v_intent.id;
    update public.payments set status='paid',paid_at=coalesce(paid_at,now()),payment_date=coalesce(payment_date,current_date),updated_at=now()
      where organization_id=p_organization_id and id=v_intent.payment_id and status not in ('refunded','cancelled');
  elsif p_event_type='payment.failed' then
    update public.payment_intents set status='failed',updated_at=now() where id=v_intent.id;
  else
    update public.payment_intents set status='refunded',updated_at=now() where id=v_intent.id;
    update public.payments set status='refunded',refunded_cents=amount_cents,updated_at=now()
      where organization_id=p_organization_id and id=v_intent.payment_id and status='paid';
  end if;
  update public.payment_webhook_events set status='processed',processed_at=now() where id=v_event_id;
  insert into public.notifications(organization_id,user_id,title,body,kind,entity,entity_id,action_url)
    select p_organization_id,user_id,'Pagamento conciliado','Um evento assinado do gateway atualizou um pagamento.','payment','payment',v_intent.payment_id,'/app/financeiro'
    from public.organization_members where organization_id=p_organization_id and active;
  return 'processed';
end;
$$;
revoke all on function public.process_payment_webhook(uuid,text,text,text,text,bigint,text) from public,anon,authenticated;
grant execute on function public.process_payment_webhook(uuid,text,text,text,text,bigint,text) to service_role;

commit;
