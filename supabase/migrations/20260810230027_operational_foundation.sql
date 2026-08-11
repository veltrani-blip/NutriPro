begin;

create extension if not exists btree_gist;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- Organization identity and onboarding data.
alter table public.organizations
  add column if not exists legal_name text,
  add column if not exists cnpj text,
  add column if not exists phone text,
  add column if not exists whatsapp text,
  add column if not exists email text,
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists postal_code text,
  add column if not exists country_code text not null default 'BR' check (country_code ~ '^[A-Z]{2}$'),
  add column if not exists timezone text not null default 'America/Sao_Paulo',
  add column if not exists currency_code text not null default 'BRL' check (currency_code ~ '^[A-Z]{3}$'),
  add column if not exists logo_path text,
  add column if not exists booking_enabled boolean not null default false,
  add column if not exists deleted_at timestamptz;

alter table public.profiles
  add column if not exists cpf text,
  add column if not exists email text,
  add column if not exists whatsapp text,
  add column if not exists signature_path text,
  add column if not exists mfa_required boolean not null default false,
  add column if not exists security_updated_at timestamptz;

create table public.professional_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  crn text,
  crn_region text,
  professional_document text,
  specialties text[] not null default '{}',
  service_mode text not null default 'hibrido' check (service_mode in ('presencial','online','hibrido')),
  default_duration_minutes integer not null default 60 check (default_duration_minutes between 10 and 480),
  default_price_cents bigint check (default_price_cents is null or default_price_cents >= 0),
  document_header text,
  document_footer text,
  signature_enabled boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id),
  foreign key (organization_id, user_id)
    references public.organization_members(organization_id, user_id) on delete cascade
);

create table public.business_hours (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  professional_user_id uuid not null references auth.users(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (organization_id, professional_user_id, weekday, starts_at, ends_at),
  foreign key (organization_id, professional_user_id)
    references public.organization_members(organization_id, user_id) on delete cascade
);

-- Granular RBAC. Organization owner remains an administrative nutritionist.
create table public.permissions (
  key text primary key,
  description text not null,
  sensitive boolean not null default false,
  created_at timestamptz not null default now()
);

insert into public.permissions(key, description, sensitive) values
  ('agenda.read','Visualizar agenda',false),
  ('agenda.write','Gerenciar agenda',false),
  ('patient.read','Visualizar cadastro administrativo de pacientes',false),
  ('patient.write','Gerenciar cadastro administrativo de pacientes',false),
  ('clinical.read','Visualizar informação clínica sensível',true),
  ('clinical.write','Registrar informação clínica sensível',true),
  ('finance.read','Visualizar dados financeiros',true),
  ('finance.write','Gerenciar dados financeiros',true),
  ('documents.read','Visualizar documentos',true),
  ('documents.write','Emitir e liberar documentos',true),
  ('team.manage','Gerenciar equipe e permissões',true),
  ('reports.read','Visualizar e exportar relatórios',true)
on conflict (key) do nothing;

create table public.role_permissions (
  role public.member_role not null,
  permission_key text not null references public.permissions(key) on delete cascade,
  allowed boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (role, permission_key)
);

insert into public.role_permissions(role, permission_key)
select role_value, permission_value
from (values
  ('owner'::public.member_role, 'agenda.read'),
  ('owner'::public.member_role, 'agenda.write'),
  ('owner'::public.member_role, 'patient.read'),
  ('owner'::public.member_role, 'patient.write'),
  ('owner'::public.member_role, 'clinical.read'),
  ('owner'::public.member_role, 'clinical.write'),
  ('owner'::public.member_role, 'finance.read'),
  ('owner'::public.member_role, 'finance.write'),
  ('owner'::public.member_role, 'documents.read'),
  ('owner'::public.member_role, 'documents.write'),
  ('owner'::public.member_role, 'team.manage'),
  ('owner'::public.member_role, 'reports.read'),
  ('nutritionist'::public.member_role, 'agenda.read'),
  ('nutritionist'::public.member_role, 'agenda.write'),
  ('nutritionist'::public.member_role, 'patient.read'),
  ('nutritionist'::public.member_role, 'patient.write'),
  ('nutritionist'::public.member_role, 'clinical.read'),
  ('nutritionist'::public.member_role, 'clinical.write'),
  ('nutritionist'::public.member_role, 'finance.read'),
  ('nutritionist'::public.member_role, 'finance.write'),
  ('nutritionist'::public.member_role, 'documents.read'),
  ('nutritionist'::public.member_role, 'documents.write'),
  ('nutritionist'::public.member_role, 'reports.read'),
  ('assistant'::public.member_role, 'agenda.read'),
  ('assistant'::public.member_role, 'agenda.write'),
  ('assistant'::public.member_role, 'patient.read'),
  ('assistant'::public.member_role, 'patient.write')
) defaults(role_value, permission_value)
on conflict do nothing;

create table public.member_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  member_user_id uuid not null references auth.users(id) on delete cascade,
  permission_key text not null references public.permissions(key) on delete cascade,
  allowed boolean not null,
  granted_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, member_user_id, permission_key),
  foreign key (organization_id, member_user_id)
    references public.organization_members(organization_id, user_id) on delete cascade,
  foreign key (organization_id, granted_by)
    references public.organization_members(organization_id, user_id)
);

create table public.patient_user_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  patient_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  invited_by uuid references auth.users(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (organization_id, patient_id, user_id)
);

create table public.superadmins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create or replace function private.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org and m.user_id = (select auth.uid()) and m.active
  )
$$;

create or replace function private.has_org_role(p_org uuid, p_roles public.member_role[])
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org and m.user_id = (select auth.uid()) and m.active and m.role = any(p_roles)
  )
$$;

create or replace function private.has_permission(p_org uuid, p_permission text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    (
      select override.allowed
      from public.member_permission_overrides override
      join public.organization_members member
        on member.organization_id = override.organization_id and member.user_id = override.member_user_id
      where override.organization_id = p_org
        and override.member_user_id = (select auth.uid())
        and override.permission_key = p_permission
        and member.active
    ),
    (
      select role_permission.allowed
      from public.organization_members member
      join public.role_permissions role_permission on role_permission.role = member.role
      where member.organization_id = p_org
        and member.user_id = (select auth.uid())
        and member.active
        and role_permission.permission_key = p_permission
    ),
    false
  )
$$;

create or replace function private.is_linked_patient(p_org uuid, p_patient uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.patient_user_links link
    where link.organization_id = p_org and link.patient_id = p_patient
      and link.user_id = (select auth.uid()) and link.active
  )
$$;

create or replace function private.is_superadmin()
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.superadmins administrator
    where administrator.user_id = (select auth.uid()) and administrator.active
  )
$$;

revoke all on all functions in schema private from public, anon;
grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.has_org_role(uuid, public.member_role[]) to authenticated;
grant execute on function private.has_permission(uuid, text) to authenticated;
grant execute on function private.is_linked_patient(uuid, uuid) to authenticated;
grant execute on function private.is_superadmin() to authenticated;

create or replace function public.current_user_has_permission(
  p_organization_id uuid,
  p_permission text
) returns boolean language sql stable security invoker set search_path = '' as $$
  select private.has_permission(p_organization_id, p_permission)
$$;
revoke all on function public.current_user_has_permission(uuid, text) from public, anon;
grant execute on function public.current_user_has_permission(uuid, text) to authenticated;

-- Harden legacy helper functions by replacing exposed security-definer lookups.
do $$
declare policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname from pg_policies where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on %I.%I', policy_record.policyname, policy_record.schemaname, policy_record.tablename);
  end loop;
end; $$;

drop function if exists public.is_org_member(uuid);
drop function if exists public.has_org_role(uuid, public.member_role[]);

drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, full_name, email)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.email)
  on conflict(id) do update set email = excluded.email;
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
for each row execute function private.handle_new_user();

create or replace function public.bootstrap_organization(
  p_organization_name text,
  p_professional_name text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  if char_length(trim(p_organization_name)) not between 2 and 180 then raise exception 'invalid organization'; end if;
  if char_length(trim(p_professional_name)) not between 2 and 180 then raise exception 'invalid professional'; end if;
  if exists(select 1 from public.organization_members where user_id = (select auth.uid()) and active) then
    raise exception 'user already belongs to an active organization';
  end if;
  insert into public.organizations(name) values(trim(p_organization_name)) returning id into v_org;
  insert into public.organization_members(organization_id, user_id, role)
    values(v_org, (select auth.uid()), 'owner');
  update public.profiles set professional_name = trim(p_professional_name) where id = (select auth.uid());
  insert into public.professional_settings(organization_id, user_id)
    values(v_org, (select auth.uid()));
  insert into public.audit_logs(organization_id, actor_user_id, action, entity, entity_id)
    values(v_org, (select auth.uid()), 'organization.created', 'organization', v_org);
  return v_org;
end;
$$;
revoke all on function public.bootstrap_organization(text, text) from public, anon;
grant execute on function public.bootstrap_organization(text, text) to authenticated;

-- Tenant-consistent references.
alter table public.patients add constraint patients_org_id_unique unique (organization_id, id);
alter table public.patient_user_links add constraint patient_user_links_patient_fk
  foreign key (organization_id, patient_id) references public.patients(organization_id, id) on delete cascade;

create table public.patient_tags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  color text not null default '#167451' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  unique (organization_id, name),
  unique (organization_id, id)
);

create table public.patient_tag_links (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  patient_id uuid not null,
  tag_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, patient_id, tag_id),
  foreign key (organization_id, patient_id) references public.patients(organization_id, id) on delete cascade,
  foreign key (organization_id, tag_id) references public.patient_tags(organization_id, id) on delete cascade
);

alter table public.patients
  add column if not exists photo_path text,
  add column if not exists guardian_name text,
  add column if not exists guardian_document text,
  add column if not exists guardian_phone text,
  add column if not exists address_line1 text,
  add column if not exists address_line2 text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists postal_code text,
  add column if not exists country_code text not null default 'BR';

-- Unified agenda: appointments and blocks share one exclusion constraint.
create table public.service_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  kind text not null default 'custom' check (kind in ('first_visit','return','follow_up','custom')),
  duration_minutes integer not null check (duration_minutes between 10 and 480),
  price_cents bigint not null default 0 check (price_cents >= 0),
  modality text not null default 'hibrido' check (modality in ('presencial','online','hibrido')),
  instructions text,
  color text not null default '#167451' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  public_enabled boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, name),
  unique (organization_id, id)
);

alter table public.appointments alter column patient_id drop not null;
alter table public.appointments drop constraint if exists appointments_status_check;
alter table public.appointments drop constraint if exists appointments_modality_check;
alter table public.appointments
  add column if not exists service_type_id uuid,
  add column if not exists entry_type text not null default 'appointment',
  add column if not exists title text not null default 'Consulta',
  add column if not exists price_cents bigint check (price_cents is null or price_cents >= 0),
  add column if not exists instructions text,
  add column if not exists cancellation_reason text,
  add column if not exists confirmed_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists source text not null default 'internal' check (source in ('internal','public_booking','import')),
  add column if not exists deleted_at timestamptz,
  add constraint appointments_status_check check (status in ('scheduled','confirmed','completed','cancelled','no_show','blocked')),
  add constraint appointments_modality_check check (modality in ('presencial','online')),
  add constraint appointments_entry_type_check check (entry_type in ('appointment','block','vacation','lunch','personal','unavailable')),
  add constraint appointments_patient_for_consultation_check check (
    (entry_type = 'appointment' and patient_id is not null and status <> 'blocked') or
    (entry_type <> 'appointment' and patient_id is null and status = 'blocked')
  ),
  add constraint appointments_org_id_unique unique (organization_id, id),
  add constraint appointments_patient_org_fk foreign key (organization_id, patient_id)
    references public.patients(organization_id, id),
  add constraint appointments_professional_org_fk foreign key (organization_id, professional_user_id)
    references public.organization_members(organization_id, user_id),
  add constraint appointments_service_org_fk foreign key (organization_id, service_type_id)
    references public.service_types(organization_id, id);

alter table public.appointments add constraint appointments_no_professional_overlap
  exclude using gist (
    organization_id with =,
    professional_user_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('scheduled','confirmed','blocked') and deleted_at is null);

alter table public.appointments add constraint appointments_no_patient_overlap
  exclude using gist (
    organization_id with =,
    patient_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (patient_id is not null and status in ('scheduled','confirmed') and deleted_at is null);

create index appointments_org_professional_range_idx
  on public.appointments using gist (organization_id, professional_user_id, tstzrange(starts_at, ends_at, '[)'))
  where deleted_at is null;

create table public.public_booking_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  professional_user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  display_name text not null,
  clinic_name text,
  public_bio text,
  public_location text,
  timezone text not null default 'America/Sao_Paulo',
  enabled boolean not null default false,
  min_notice_minutes integer not null default 120 check (min_notice_minutes between 0 and 43200),
  max_advance_days integer not null default 90 check (max_advance_days between 1 and 365),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, professional_user_id),
  foreign key (organization_id, professional_user_id)
    references public.organization_members(organization_id, user_id) on delete cascade
);

create table public.booking_rate_limits (
  id bigint generated always as identity primary key,
  booking_profile_id uuid not null references public.public_booking_profiles(id) on delete cascade,
  requester_hash text not null,
  attempted_at timestamptz not null default now()
);
create index booking_rate_limits_lookup_idx
  on public.booking_rate_limits(booking_profile_id, requester_hash, attempted_at desc);
revoke all on public.booking_rate_limits from public, anon, authenticated;

create or replace function public.list_public_slots(
  p_slug text,
  p_service_type_id uuid,
  p_date date
) returns table(starts_at timestamptz, ends_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_profile public.public_booking_profiles%rowtype;
  v_service public.service_types%rowtype;
begin
  select * into v_profile from public.public_booking_profiles
    where slug = p_slug and enabled;
  if not found then return; end if;
  select * into v_service from public.service_types
    where id = p_service_type_id and organization_id = v_profile.organization_id
      and public_enabled and active and deleted_at is null;
  if not found or p_date < current_date or p_date > current_date + v_profile.max_advance_days then return; end if;
  return query
  select slot_start, slot_start + make_interval(mins => v_service.duration_minutes)
  from public.business_hours hours
  cross join lateral generate_series(
    (p_date + hours.starts_at) at time zone v_profile.timezone,
    ((p_date + hours.ends_at) at time zone v_profile.timezone) - make_interval(mins => v_service.duration_minutes),
    interval '15 minutes'
  ) slot_start
  where hours.organization_id = v_profile.organization_id
    and hours.professional_user_id = v_profile.professional_user_id
    and hours.weekday = extract(dow from p_date)::smallint
    and slot_start >= now() + make_interval(mins => v_profile.min_notice_minutes)
    and not exists (
      select 1 from public.appointments appointment
      where appointment.organization_id = v_profile.organization_id
        and appointment.professional_user_id = v_profile.professional_user_id
        and appointment.status in ('scheduled','confirmed','blocked')
        and appointment.deleted_at is null
        and tstzrange(appointment.starts_at, appointment.ends_at, '[)') &&
          tstzrange(slot_start, slot_start + make_interval(mins => v_service.duration_minutes), '[)')
    )
  order by slot_start;
end;
$$;
revoke all on function public.list_public_slots(text, uuid, date) from public;
grant execute on function public.list_public_slots(text, uuid, date) to anon, authenticated;

create or replace function public.book_public_appointment(
  p_slug text,
  p_service_type_id uuid,
  p_starts_at timestamptz,
  p_name text,
  p_phone text,
  p_email text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_profile public.public_booking_profiles%rowtype;
  v_service public.service_types%rowtype;
  v_patient uuid;
  v_appointment uuid;
  v_ends_at timestamptz;
  v_requester_hash text;
  v_local_start timestamp;
begin
  if char_length(trim(p_name)) not between 2 and 160 then raise exception 'invalid booking data'; end if;
  if nullif(trim(p_phone), '') is null and nullif(trim(p_email), '') is null then raise exception 'invalid booking data'; end if;
  select * into v_profile from public.public_booking_profiles where slug = p_slug and enabled;
  if not found then raise exception 'schedule unavailable'; end if;
  select * into v_service from public.service_types
    where id = p_service_type_id and organization_id = v_profile.organization_id
      and public_enabled and active and deleted_at is null;
  if not found then raise exception 'schedule unavailable'; end if;
  if p_starts_at < now() + make_interval(mins => v_profile.min_notice_minutes)
     or p_starts_at > now() + make_interval(days => v_profile.max_advance_days) then
    raise exception 'schedule unavailable';
  end if;
  v_ends_at := p_starts_at + make_interval(mins => v_service.duration_minutes);
  v_local_start := p_starts_at at time zone v_profile.timezone;
  if not exists (
    select 1 from public.business_hours hours
    where hours.organization_id = v_profile.organization_id
      and hours.professional_user_id = v_profile.professional_user_id
      and hours.weekday = extract(dow from v_local_start)::smallint
      and v_local_start::time >= hours.starts_at
      and (v_ends_at at time zone v_profile.timezone)::time <= hours.ends_at
  ) then raise exception 'schedule unavailable'; end if;
  v_requester_hash := md5(lower(trim(coalesce(p_email,''))) || '|' || regexp_replace(coalesce(p_phone,''),'\D','','g'));
  delete from public.booking_rate_limits where attempted_at < now() - interval '24 hours';
  if (select count(*) from public.booking_rate_limits
      where booking_profile_id = v_profile.id and requester_hash = v_requester_hash
        and attempted_at > now() - interval '1 hour') >= 5 then
    raise exception 'rate limit exceeded';
  end if;
  insert into public.booking_rate_limits(booking_profile_id, requester_hash)
    values(v_profile.id, v_requester_hash);
  perform pg_advisory_xact_lock(hashtextextended(v_profile.organization_id::text || v_profile.professional_user_id::text, 0));
  select id into v_patient from public.patients
    where organization_id = v_profile.organization_id and deleted_at is null
      and ((nullif(trim(p_email),'') is not null and lower(email) = lower(trim(p_email)))
        or (nullif(trim(p_phone),'') is not null and regexp_replace(coalesce(phone,whatsapp,''),'\D','','g') = regexp_replace(p_phone,'\D','','g')))
    order by created_at limit 1;
  if v_patient is null then
    insert into public.patients(organization_id, responsible_user_id, name, phone, email, status, source)
      values(v_profile.organization_id, v_profile.professional_user_id, trim(p_name), nullif(trim(p_phone),''), nullif(lower(trim(p_email)),''), 'lead', 'Agendamento público')
      returning id into v_patient;
  end if;
  begin
    insert into public.appointments(
      organization_id, patient_id, professional_user_id, service_type_id, starts_at, ends_at,
      status, modality, entry_type, title, price_cents, instructions, source
    ) values (
      v_profile.organization_id, v_patient, v_profile.professional_user_id, v_service.id, p_starts_at, v_ends_at,
      'scheduled', case when v_service.modality = 'online' then 'online' else 'presencial' end,
      'appointment', v_service.name, v_service.price_cents, v_service.instructions, 'public_booking'
    ) returning id into v_appointment;
  exception when exclusion_violation then
    raise exception 'schedule unavailable';
  end;
  insert into public.audit_logs(organization_id, actor_user_id, action, entity, entity_id, metadata)
    values(v_profile.organization_id, null, 'appointment.public_booked', 'appointment', v_appointment, jsonb_build_object('source','public_booking'));
  return v_appointment;
end;
$$;
revoke all on function public.book_public_appointment(text, uuid, timestamptz, text, text, text) from public;
grant execute on function public.book_public_appointment(text, uuid, timestamptz, text, text, text) to anon, authenticated;

-- Clinical record lifecycle and immutable versions.
alter table public.clinical_records
  add column if not exists symptoms text,
  add column if not exists objectives text,
  add column if not exists revision_reason text,
  add column if not exists deleted_at timestamptz,
  add constraint clinical_records_org_id_unique unique (organization_id, id),
  add constraint clinical_records_patient_org_fk foreign key (organization_id, patient_id)
    references public.patients(organization_id, id),
  add constraint clinical_records_appointment_org_fk foreign key (organization_id, appointment_id)
    references public.appointments(organization_id, id),
  add constraint clinical_records_professional_org_fk foreign key (organization_id, professional_user_id)
    references public.organization_members(organization_id, user_id);

create table public.clinical_record_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  clinical_record_id uuid not null,
  patient_id uuid not null,
  professional_user_id uuid not null references auth.users(id),
  version integer not null check (version > 0),
  reason text,
  report text,
  evolution text,
  signs_symptoms text,
  symptoms text,
  conduct text,
  nutrition_diagnosis text,
  strategy text,
  guidance text,
  goals text,
  objectives text,
  private_notes text,
  recommended_return date,
  revision_reason text,
  finalized_at timestamptz,
  recorded_at timestamptz not null default now(),
  recorded_by uuid references auth.users(id),
  unique (clinical_record_id, version),
  unique (organization_id, clinical_record_id, version),
  foreign key (organization_id, clinical_record_id)
    references public.clinical_records(organization_id, id) on delete restrict,
  foreign key (organization_id, patient_id)
    references public.patients(organization_id, id) on delete restrict
);
create index clinical_record_versions_record_idx
  on public.clinical_record_versions(organization_id, clinical_record_id, version desc);

create table public.clinical_addenda (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  clinical_record_id uuid not null,
  author_user_id uuid not null references auth.users(id),
  reason text not null check (char_length(reason) between 3 and 500),
  content text not null check (char_length(content) between 1 and 10000),
  created_at timestamptz not null default now(),
  foreign key (organization_id, clinical_record_id)
    references public.clinical_records(organization_id, id) on delete restrict,
  foreign key (organization_id, author_user_id)
    references public.organization_members(organization_id, user_id)
);

create or replace function private.version_clinical_record()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.finalized_at is not null then
    raise exception 'finalized clinical records are immutable; create an addendum';
  end if;
  if new.organization_id <> old.organization_id or new.patient_id <> old.patient_id
     or new.professional_user_id <> old.professional_user_id then
    raise exception 'clinical record ownership cannot change';
  end if;
  if row(
    new.reason,new.report,new.evolution,new.signs_symptoms,new.symptoms,new.conduct,
    new.nutrition_diagnosis,new.strategy,new.guidance,new.goals,new.objectives,
    new.private_notes,new.recommended_return
  ) is distinct from row(
    old.reason,old.report,old.evolution,old.signs_symptoms,old.symptoms,old.conduct,
    old.nutrition_diagnosis,old.strategy,old.guidance,old.goals,old.objectives,
    old.private_notes,old.recommended_return
  ) then
    insert into public.clinical_record_versions(
      organization_id,clinical_record_id,patient_id,professional_user_id,version,
      reason,report,evolution,signs_symptoms,symptoms,conduct,nutrition_diagnosis,
      strategy,guidance,goals,objectives,private_notes,recommended_return,
      revision_reason,finalized_at,recorded_by
    ) values (
      old.organization_id,old.id,old.patient_id,old.professional_user_id,old.version,
      old.reason,old.report,old.evolution,old.signs_symptoms,old.symptoms,old.conduct,
      old.nutrition_diagnosis,old.strategy,old.guidance,old.goals,old.objectives,
      old.private_notes,old.recommended_return,old.revision_reason,old.finalized_at,(select auth.uid())
    ) on conflict (clinical_record_id, version) do nothing;
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;
revoke all on function private.version_clinical_record() from public, anon, authenticated;
drop trigger if exists clinical_record_version_before_update on public.clinical_records;
create trigger clinical_record_version_before_update before update on public.clinical_records
for each row execute function private.version_clinical_record();

create or replace function private.capture_final_clinical_version()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.finalized_at is null and new.finalized_at is not null then
    insert into public.clinical_record_versions(
      organization_id,clinical_record_id,patient_id,professional_user_id,version,
      reason,report,evolution,signs_symptoms,symptoms,conduct,nutrition_diagnosis,
      strategy,guidance,goals,objectives,private_notes,recommended_return,
      revision_reason,finalized_at,recorded_by
    ) values (
      new.organization_id,new.id,new.patient_id,new.professional_user_id,new.version,
      new.reason,new.report,new.evolution,new.signs_symptoms,new.symptoms,new.conduct,
      new.nutrition_diagnosis,new.strategy,new.guidance,new.goals,new.objectives,
      new.private_notes,new.recommended_return,new.revision_reason,new.finalized_at,(select auth.uid())
    ) on conflict (clinical_record_id, version) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.capture_final_clinical_version() from public, anon, authenticated;
create trigger clinical_record_final_version after update on public.clinical_records
for each row execute function private.capture_final_clinical_version();

create or replace function private.prevent_clinical_delete()
returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'clinical records cannot be deleted'; end;
$$;
revoke all on function private.prevent_clinical_delete() from public, anon, authenticated;
create trigger clinical_record_no_delete before delete on public.clinical_records
for each row execute function private.prevent_clinical_delete();
create trigger clinical_version_no_update before update or delete on public.clinical_record_versions
for each row execute function private.prevent_clinical_delete();
create trigger clinical_addendum_no_update before update or delete on public.clinical_addenda
for each row execute function private.prevent_clinical_delete();

-- Complete anamnesis, with JSON only for genuinely dynamic custom fields.
alter table public.anamneses
  add column if not exists signs_symptoms text,
  add column if not exists gastrointestinal text,
  add column if not exists sleep text,
  add column if not exists hydration text,
  add column if not exists physical_activity text,
  add column if not exists eating_habits text,
  add column if not exists daily_routine text,
  add column if not exists recall_24h text,
  add column if not exists allergies text,
  add column if not exists intolerances text,
  add column if not exists restrictions text,
  add column if not exists budget_notes text,
  add column if not exists regional_availability text,
  add column if not exists custom_fields jsonb not null default '{}'::jsonb,
  add column if not exists recorded_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz,
  add constraint anamneses_org_id_unique unique (organization_id, id),
  add constraint anamneses_patient_org_fk foreign key (organization_id, patient_id)
    references public.patients(organization_id, id),
  add constraint anamneses_professional_org_fk foreign key (organization_id, professional_user_id)
    references public.organization_members(organization_id, user_id),
  add constraint anamneses_custom_fields_object_check check (jsonb_typeof(custom_fields) = 'object');

create table public.patient_dietary_conditions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  patient_id uuid not null,
  kind text not null check (kind in ('allergy','intolerance','restriction','preference')),
  name text not null check (char_length(name) between 1 and 160),
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, patient_id, kind, name),
  foreign key (organization_id, patient_id)
    references public.patients(organization_id, id) on delete restrict
);

-- Assessments, anthropometry and bioimpedance retain formula provenance.
alter table public.assessments
  add column if not exists assessment_type text not null default 'anthropometry',
  add column if not exists formula_notes text,
  add column if not exists deleted_at timestamptz,
  add constraint assessments_org_id_unique unique (organization_id, id),
  add constraint assessments_patient_org_fk foreign key (organization_id, patient_id)
    references public.patients(organization_id, id),
  add constraint assessments_professional_org_fk foreign key (organization_id, professional_user_id)
    references public.organization_members(organization_id, user_id);

alter table public.measurements
  add column if not exists hip_cm numeric(6,2),
  add column if not exists calf_cm numeric(6,2),
  add column if not exists body_fat_mass_kg numeric(7,3),
  add column if not exists lean_mass_kg numeric(7,3),
  add column if not exists body_water_pct numeric(5,2),
  add column if not exists visceral_fat_level numeric(6,2),
  add column if not exists basal_metabolism_kcal numeric(9,2),
  add column if not exists metabolic_age_years integer,
  add column if not exists bmi numeric(6,2),
  add column if not exists waist_hip_ratio numeric(6,3),
  add column if not exists waist_height_ratio numeric(6,3),
  add column if not exists bmi_formula text,
  add column if not exists waist_hip_formula text,
  add column if not exists waist_height_formula text,
  add column if not exists extra_fields jsonb not null default '{}'::jsonb,
  add constraint measurements_org_id_unique unique (organization_id, id),
  add constraint measurements_assessment_org_fk foreign key (organization_id, assessment_id)
    references public.assessments(organization_id, id) on delete cascade,
  add constraint measurements_positive_values check (
    (weight_kg is null or weight_kg > 0) and (height_cm is null or height_cm > 0) and
    (waist_cm is null or waist_cm > 0) and (hip_cm is null or hip_cm > 0) and
    (body_fat_pct is null or body_fat_pct between 0 and 100) and
    (body_water_pct is null or body_water_pct between 0 and 100)
  ),
  add constraint measurements_extra_fields_object check (jsonb_typeof(extra_fields) = 'object');

create table public.skinfold_measurements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  assessment_id uuid not null,
  site text not null,
  millimeters numeric(6,2) not null check (millimeters > 0),
  protocol text,
  created_at timestamptz not null default now(),
  unique (organization_id, assessment_id, site),
  foreign key (organization_id, assessment_id)
    references public.assessments(organization_id, id) on delete cascade
);

create table public.evolution_photos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  patient_id uuid not null,
  assessment_id uuid,
  angle text not null check (angle in ('front','side','back','custom')),
  private_file_path text not null,
  taken_at timestamptz not null default now(),
  share_with_patient boolean not null default false,
  consent_recorded_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, patient_id)
    references public.patients(organization_id, id) on delete restrict,
  foreign key (organization_id, assessment_id)
    references public.assessments(organization_id, id),
  check (not share_with_patient or consent_recorded_at is not null)
);

-- Lab exams and normalized markers.
alter table public.lab_exams
  add column if not exists file_mime_type text,
  add column if not exists source text not null default 'upload' check (source in ('upload','manual')),
  add column if not exists deleted_at timestamptz,
  add constraint lab_exams_org_id_unique unique (organization_id, id),
  add constraint lab_exams_patient_org_fk foreign key (organization_id, patient_id)
    references public.patients(organization_id, id);

alter table public.lab_markers add column if not exists organization_id uuid;
update public.lab_markers marker set organization_id = exam.organization_id
from public.lab_exams exam where exam.id = marker.lab_exam_id and marker.organization_id is null;
alter table public.lab_markers alter column organization_id set not null;
alter table public.lab_markers
  add column if not exists result_numeric numeric,
  add column if not exists reference_low numeric,
  add column if not exists reference_high numeric,
  add column if not exists sort_order integer not null default 0,
  add constraint lab_markers_exam_org_fk foreign key (organization_id, lab_exam_id)
    references public.lab_exams(organization_id, id) on delete cascade;

-- Food database, source traceability and CSV imports.
alter table public.foods
  add column if not exists serving_quantity numeric(10,3),
  add column if not exists serving_unit text,
  add column if not exists source_url text,
  add column if not exists source_version text,
  add column if not exists imported_at timestamptz,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz,
  add constraint foods_org_id_unique unique (organization_id, id),
  add constraint foods_nonnegative_nutrients check (
    (gram_weight is null or gram_weight > 0) and (kcal is null or kcal >= 0) and
    (protein_g is null or protein_g >= 0) and (carbs_g is null or carbs_g >= 0) and
    (fat_g is null or fat_g >= 0) and (fiber_g is null or fiber_g >= 0) and
    (sodium_mg is null or sodium_mg >= 0)
  );

create table public.food_nutrients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  food_id uuid not null,
  nutrient_name text not null,
  amount numeric(12,4) not null check (amount >= 0),
  unit text not null,
  source text,
  created_at timestamptz not null default now(),
  unique nulls not distinct (organization_id, food_id, nutrient_name, unit),
  foreign key (organization_id, food_id) references public.foods(organization_id, id) on delete cascade
);

create table public.food_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_name text not null,
  source_version text,
  file_path text,
  status text not null default 'pending' check (status in ('pending','validating','completed','failed')),
  total_rows integer not null default 0,
  imported_rows integer not null default 0,
  rejected_rows integer not null default 0,
  error_report jsonb not null default '[]'::jsonb,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check (jsonb_typeof(error_report) = 'array')
);

-- Nutrition plans, days, substitutions, recipes and immutable publications.
alter table public.nutrition_plans
  add column if not exists plan_type text not null default 'daily' check (plan_type in ('daily','weekly')),
  add column if not exists version integer not null default 1 check (version > 0),
  add column if not exists valid_from date,
  add column if not exists valid_until date,
  add column if not exists notes text,
  add column if not exists template_name text,
  add column if not exists deleted_at timestamptz,
  add constraint nutrition_plans_org_id_unique unique (organization_id, id),
  add constraint nutrition_plans_patient_org_fk foreign key (organization_id, patient_id)
    references public.patients(organization_id, id),
  add constraint nutrition_plans_professional_org_fk foreign key (organization_id, professional_user_id)
    references public.organization_members(organization_id, user_id),
  add constraint nutrition_plans_valid_dates check (valid_until is null or valid_from is null or valid_until >= valid_from);

alter table public.meals
  add column if not exists day_of_week smallint check (day_of_week between 0 and 6),
  add column if not exists alternative_group integer,
  add constraint meals_org_id_unique unique (organization_id, id),
  add constraint meals_plan_org_fk foreign key (organization_id, plan_id)
    references public.nutrition_plans(organization_id, id) on delete cascade;

alter table public.meal_items
  add column if not exists recipe_id uuid,
  add constraint meal_items_org_id_unique unique (organization_id, id),
  add constraint meal_items_meal_org_fk foreign key (organization_id, meal_id)
    references public.meals(organization_id, id) on delete cascade,
  add constraint meal_items_food_org_fk foreign key (organization_id, food_id)
    references public.foods(organization_id, id);

alter table public.substitutions
  add column if not exists sort_order integer not null default 0,
  add constraint substitutions_item_org_fk foreign key (organization_id, meal_item_id)
    references public.meal_items(organization_id, id) on delete cascade,
  add constraint substitutions_food_org_fk foreign key (organization_id, food_id)
    references public.foods(organization_id, id);

alter table public.recipes
  add column if not exists servings numeric(8,2),
  add column if not exists total_minutes integer,
  add column if not exists notes text,
  add column if not exists deleted_at timestamptz,
  add constraint recipes_org_id_unique unique (organization_id, id),
  add constraint recipes_times_positive check (
    (prep_minutes is null or prep_minutes >= 0) and (total_minutes is null or total_minutes >= 0)
  );

alter table public.recipe_ingredients
  add constraint recipe_ingredients_recipe_org_fk foreign key (organization_id, recipe_id)
    references public.recipes(organization_id, id) on delete cascade,
  add constraint recipe_ingredients_food_org_fk foreign key (organization_id, food_id)
    references public.foods(organization_id, id);

alter table public.meal_items add constraint meal_items_recipe_org_fk
  foreign key (organization_id, recipe_id) references public.recipes(organization_id, id);

create table public.recipe_tags (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recipe_id uuid not null,
  tag text not null,
  primary key (organization_id, recipe_id, tag),
  foreign key (organization_id, recipe_id) references public.recipes(organization_id, id) on delete cascade
);

create table public.nutrition_plan_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  nutrition_plan_id uuid not null,
  patient_id uuid not null,
  version integer not null check (version > 0),
  snapshot jsonb not null,
  published_at timestamptz not null default now(),
  published_by uuid not null references auth.users(id),
  checksum text not null,
  unique (nutrition_plan_id, version),
  foreign key (organization_id, nutrition_plan_id)
    references public.nutrition_plans(organization_id, id) on delete restrict,
  foreign key (organization_id, patient_id)
    references public.patients(organization_id, id) on delete restrict,
  check (jsonb_typeof(snapshot) = 'object')
);

create table public.nutrition_plan_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id),
  name text not null,
  description text,
  template_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, owner_user_id, name),
  foreign key (organization_id, owner_user_id)
    references public.organization_members(organization_id, user_id),
  check (jsonb_typeof(template_data) = 'object')
);

create table public.guidance_library (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  category text,
  content text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, id)
);

create table public.patient_guidance (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  patient_id uuid not null,
  guidance_id uuid not null,
  nutrition_plan_id uuid,
  released_to_patient boolean not null default false,
  assigned_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id, patient_id, guidance_id, nutrition_plan_id),
  foreign key (organization_id, patient_id) references public.patients(organization_id, id),
  foreign key (organization_id, guidance_id) references public.guidance_library(organization_id, id),
  foreign key (organization_id, nutrition_plan_id) references public.nutrition_plans(organization_id, id)
);

-- Immutable generated documents and explicit patient releases.
alter table public.documents
  add column if not exists document_number bigint generated always as identity,
  add column if not exists mime_type text not null default 'application/pdf',
  add column if not exists checksum text,
  add column if not exists source_version text,
  add column if not exists signature_applied boolean not null default false,
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add constraint documents_org_id_unique unique (organization_id, id),
  add constraint documents_org_number_unique unique (organization_id, document_number),
  add constraint documents_patient_org_fk foreign key (organization_id, patient_id)
    references public.patients(organization_id, id),
  add constraint documents_metadata_object check (jsonb_typeof(metadata) = 'object');

create table public.document_releases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  document_id uuid not null,
  patient_id uuid not null,
  released_by uuid not null references auth.users(id),
  released_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (organization_id, document_id, patient_id),
  foreign key (organization_id, document_id)
    references public.documents(organization_id, id) on delete restrict,
  foreign key (organization_id, patient_id)
    references public.patients(organization_id, id) on delete restrict
);

create or replace function private.prevent_immutable_document_change()
returns trigger language plpgsql set search_path = '' as $$
begin raise exception 'issued documents are immutable'; end;
$$;
revoke all on function private.prevent_immutable_document_change() from public, anon, authenticated;
create trigger issued_document_immutable before update or delete on public.documents
for each row execute function private.prevent_immutable_document_change();

-- Questionnaires and patient check-ins.
alter table public.questionnaires
  add column if not exists published_at timestamptz,
  add column if not exists created_by uuid references auth.users(id),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz,
  add constraint questionnaires_org_id_unique unique (organization_id, id);

alter table public.questionnaire_fields add column if not exists organization_id uuid;
update public.questionnaire_fields field set organization_id = questionnaire.organization_id
from public.questionnaires questionnaire
where questionnaire.id = field.questionnaire_id and field.organization_id is null;
alter table public.questionnaire_fields alter column organization_id set not null;
alter table public.questionnaire_fields
  add column if not exists help_text text,
  add constraint questionnaire_fields_type_check check (
    field_type in ('text','textarea','number','date','select','multiselect','boolean','scale','checkbox')
  ),
  add constraint questionnaire_fields_org_fk foreign key (organization_id, questionnaire_id)
    references public.questionnaires(organization_id, id) on delete cascade,
  add constraint questionnaire_options_array_check check (options is null or jsonb_typeof(options) = 'array');

alter table public.questionnaire_responses
  add column if not exists assigned_at timestamptz,
  add column if not exists assigned_by uuid references auth.users(id),
  add column if not exists clinical_record_id uuid,
  add constraint questionnaire_responses_patient_org_fk foreign key (organization_id, patient_id)
    references public.patients(organization_id, id),
  add constraint questionnaire_responses_questionnaire_org_fk foreign key (organization_id, questionnaire_id)
    references public.questionnaires(organization_id, id),
  add constraint questionnaire_answers_object check (jsonb_typeof(answers) = 'object'),
  add constraint questionnaire_responses_clinical_org_fk foreign key (organization_id, clinical_record_id)
    references public.clinical_records(organization_id, id);

create table public.checkin_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  frequency text not null check (frequency in ('weekly','biweekly','custom')),
  interval_days integer check (interval_days is null or interval_days between 1 and 365),
  include_weight boolean not null default true,
  include_hunger boolean not null default true,
  include_satiety boolean not null default true,
  include_energy boolean not null default true,
  include_sleep boolean not null default true,
  include_training boolean not null default true,
  include_adherence boolean not null default true,
  include_difficulties boolean not null default true,
  include_comments boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

create table public.checkin_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  patient_id uuid not null,
  template_id uuid not null,
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending','answered','expired','cancelled')),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, patient_id) references public.patients(organization_id, id),
  foreign key (organization_id, template_id) references public.checkin_templates(organization_id, id)
);

create table public.checkin_responses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  checkin_request_id uuid not null,
  patient_id uuid not null,
  weight_kg numeric(7,3) check (weight_kg is null or weight_kg > 0),
  hunger smallint check (hunger is null or hunger between 1 and 10),
  satiety smallint check (satiety is null or satiety between 1 and 10),
  energy smallint check (energy is null or energy between 1 and 10),
  sleep smallint check (sleep is null or sleep between 1 and 10),
  training text,
  adherence text,
  difficulties text,
  comments text,
  submitted_at timestamptz not null default now(),
  unique (organization_id, checkin_request_id),
  foreign key (organization_id, checkin_request_id) references public.checkin_requests(organization_id, id),
  foreign key (organization_id, patient_id) references public.patients(organization_id, id)
);

-- Complete finance, receipts and provider-neutral online payments.
alter table public.payments
  add column if not exists payment_date date,
  add column if not exists payment_method text check (payment_method is null or payment_method in ('pix','cash','card','transfer','other')),
  add column if not exists refunded_cents bigint not null default 0 check (refunded_cents >= 0),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz,
  add constraint payments_org_id_unique unique (organization_id, id),
  add constraint payments_patient_org_fk foreign key (organization_id, patient_id)
    references public.patients(organization_id, id),
  add constraint payments_appointment_org_fk foreign key (organization_id, appointment_id)
    references public.appointments(organization_id, id),
  add constraint payments_refund_limit check (refunded_cents <= amount_cents);

alter table public.expenses
  add column if not exists recurrence_interval text check (recurrence_interval is null or recurrence_interval in ('weekly','monthly','yearly')),
  add column if not exists recurrence_ends_at date,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz,
  add constraint expenses_org_id_unique unique (organization_id, id);

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  receipt_number bigint generated always as identity,
  payment_id uuid not null,
  patient_id uuid not null,
  patient_name text not null,
  patient_document text,
  professional_name text not null,
  professional_document text,
  description text not null,
  amount_cents bigint not null check (amount_cents >= 0),
  payment_method text not null,
  paid_at timestamptz not null,
  private_file_path text not null,
  checksum text not null,
  signature_applied boolean not null default false,
  issued_by uuid not null references auth.users(id),
  issued_at timestamptz not null default now(),
  unique (organization_id, receipt_number),
  unique (organization_id, payment_id),
  unique (organization_id, id),
  foreign key (organization_id, payment_id) references public.payments(organization_id, id) on delete restrict,
  foreign key (organization_id, patient_id) references public.patients(organization_id, id) on delete restrict
);
create trigger receipts_immutable before update or delete on public.receipts
for each row execute function private.prevent_immutable_document_change();

create table public.payment_gateway_configs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null,
  enabled boolean not null default false,
  public_configuration jsonb not null default '{}'::jsonb,
  secret_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider),
  check (jsonb_typeof(public_configuration) = 'object')
);

create table public.payment_intents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  payment_id uuid not null,
  provider text not null,
  provider_reference text,
  idempotency_key text not null,
  amount_cents bigint not null check (amount_cents >= 0),
  status text not null default 'created' check (status in ('created','pending','paid','failed','cancelled','refunded')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider, idempotency_key),
  unique (provider, provider_reference),
  foreign key (organization_id, payment_id) references public.payments(organization_id, id)
);

create table public.payment_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  organization_id uuid references public.organizations(id) on delete restrict,
  signature_valid boolean not null,
  payload_hash text not null,
  status text not null default 'received' check (status in ('received','processed','ignored','failed')),
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error_code text,
  unique (provider, provider_event_id)
);
revoke all on public.payment_webhook_events from public, anon, authenticated;

-- CRM, tasks and global-search source data.
create table public.crm_leads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  source text,
  interest text,
  notes text,
  stage text not null default 'new' check (stage in ('new','contacted','scheduled','converted','lost')),
  next_contact_at timestamptz,
  converted_patient_id uuid,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, id),
  foreign key (organization_id, converted_patient_id) references public.patients(organization_id, id)
);

alter table public.tasks
  add column if not exists description text,
  add column if not exists completed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz,
  add constraint tasks_priority_check check (priority in ('low','normal','high','urgent')),
  add constraint tasks_status_check check (status in ('open','in_progress','completed','cancelled')),
  add constraint tasks_org_id_unique unique (organization_id, id),
  add constraint tasks_patient_org_fk foreign key (organization_id, patient_id)
    references public.patients(organization_id, id),
  add constraint tasks_assignee_org_fk foreign key (organization_id, assigned_user_id)
    references public.organization_members(organization_id, user_id);

-- Internal notifications and provider-neutral transactional outboxes.
alter table public.notifications
  add column if not exists entity text,
  add column if not exists entity_id uuid,
  add column if not exists action_url text,
  add constraint notifications_user_org_fk foreign key (organization_id, user_id)
    references public.organization_members(organization_id, user_id) on delete cascade;

create table public.integration_configs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('email','whatsapp','payments','teleconsultation','error_tracking','ai')),
  provider text,
  enabled boolean not null default false,
  configured boolean not null default false,
  public_settings jsonb not null default '{}'::jsonb,
  secret_reference text,
  last_tested_at timestamptz,
  last_test_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, kind),
  check (jsonb_typeof(public_settings) = 'object')
);

create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('confirmation','appointment_tomorrow','reminder','billing','return','questionnaire')),
  channel text not null check (channel in ('email','whatsapp')),
  subject text,
  body text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, kind, channel)
);

create table public.message_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  patient_id uuid,
  channel text not null check (channel in ('email','whatsapp')),
  recipient text not null,
  template_kind text not null,
  variables jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending','sending','sent','failed','not_configured','cancelled')),
  provider_reference text,
  scheduled_at timestamptz not null default now(),
  sent_at timestamptz,
  attempt_count integer not null default 0,
  last_error_code text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key),
  foreign key (organization_id, patient_id) references public.patients(organization_id, id),
  check (jsonb_typeof(variables) = 'object')
);

-- Team invitations and persisted settings.
create table public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role public.member_role not null,
  token_hash text not null unique,
  invited_by uuid not null references auth.users(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (organization_id, invited_by)
    references public.organization_members(organization_id, user_id)
);
create unique index team_invitations_pending_email_idx
  on public.team_invitations(organization_id, lower(email))
  where accepted_at is null and revoked_at is null;

create table public.organization_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  appointment_reminder_hours integer[] not null default '{24}',
  default_payment_due_days integer not null default 0 check (default_payment_due_days between 0 and 365),
  document_header text,
  document_footer text,
  notification_preferences jsonb not null default '{}'::jsonb,
  retention_months integer not null default 60 check (retention_months between 1 and 1200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(notification_preferences) = 'object')
);

-- Patient CSV imports retain mapping, validation errors and final counts.
create table public.patient_imports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  file_name text not null,
  file_path text,
  column_mapping jsonb not null default '{}'::jsonb,
  status text not null default 'uploaded' check (status in ('uploaded','mapped','validated','importing','completed','failed')),
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  invalid_rows integer not null default 0,
  imported_rows integer not null default 0,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check (jsonb_typeof(column_mapping) = 'object')
);

create table public.patient_import_rows (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  import_id uuid not null references public.patient_imports(id) on delete cascade,
  row_number integer not null check (row_number > 0),
  raw_data jsonb not null,
  normalized_data jsonb,
  validation_errors jsonb not null default '[]'::jsonb,
  imported_patient_id uuid,
  created_at timestamptz not null default now(),
  unique (import_id, row_number),
  foreign key (organization_id, imported_patient_id) references public.patients(organization_id, id),
  check (jsonb_typeof(raw_data) = 'object'),
  check (normalized_data is null or jsonb_typeof(normalized_data) = 'object'),
  check (jsonb_typeof(validation_errors) = 'array')
);

-- LGPD records. Legal rules and retention decisions still require Brazilian counsel review.
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  patient_id uuid not null,
  purpose text not null,
  legal_basis text,
  version text not null,
  granted boolean not null,
  recorded_at timestamptz not null default now(),
  revoked_at timestamptz,
  evidence text,
  recorded_by uuid references auth.users(id),
  foreign key (organization_id, patient_id) references public.patients(organization_id, id)
);

create table public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  patient_id uuid not null,
  request_type text not null check (request_type in ('access','export','correction','deletion','anonymization')),
  status text not null default 'received' check (status in ('received','reviewing','approved','rejected','completed')),
  requested_at timestamptz not null default now(),
  due_at timestamptz,
  reviewed_by uuid references auth.users(id),
  review_notes text,
  completed_at timestamptz,
  export_document_id uuid,
  foreign key (organization_id, patient_id) references public.patients(organization_id, id),
  foreign key (organization_id, export_document_id) references public.documents(organization_id, id)
);

-- SaaS administration is intentionally non-clinical.
create table public.saas_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  price_cents bigint check (price_cents is null or price_cents >= 0),
  currency_code text not null default 'BRL',
  billing_interval text check (billing_interval is null or billing_interval in ('monthly','yearly')),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.saas_plans(code, name, active) values
  ('starter','Starter',false),('pro','Pro',false),('clinic','Clínica',false)
on conflict (code) do nothing;

create table public.saas_plan_features (
  plan_id uuid not null references public.saas_plans(id) on delete cascade,
  feature_key text not null,
  enabled boolean not null default true,
  limit_value bigint,
  primary key (plan_id, feature_key)
);

create table public.organization_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete restrict,
  plan_id uuid not null references public.saas_plans(id),
  status text not null check (status in ('trialing','active','past_due','cancelled','suspended')),
  provider text,
  provider_reference text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.admin_account_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id),
  action text not null,
  reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (jsonb_typeof(metadata) = 'object')
);

alter table public.feature_flags
  add column if not exists admin_only boolean not null default true;
insert into public.feature_flags(key, description, enabled_by_default) values
  ('ai','Recursos assistivos com revisão humana',false),
  ('whatsapp','Integração externa de WhatsApp',false),
  ('payments','Pagamentos online',false),
  ('teleconsultation','Teleconsulta',false),
  ('integrations','Integrações externas',false)
on conflict (key) do update set description = excluded.description;

create table public.organization_feature_flags (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  feature_flag_id uuid not null references public.feature_flags(id) on delete cascade,
  enabled boolean not null,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (organization_id, feature_flag_id)
);

create table public.patient_clinical_releases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  patient_id uuid not null,
  clinical_record_id uuid not null,
  clinical_version integer not null check (clinical_version > 0),
  released_by uuid not null references auth.users(id),
  released_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (organization_id, clinical_record_id, clinical_version),
  foreign key (organization_id, patient_id) references public.patients(organization_id, id),
  foreign key (organization_id, clinical_record_id, clinical_version)
    references public.clinical_record_versions(organization_id, clinical_record_id, version)
);

create table public.questionnaire_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  questionnaire_id uuid not null,
  patient_id uuid not null,
  assigned_by uuid not null references auth.users(id),
  due_at timestamptz,
  status text not null default 'pending' check (status in ('pending','answered','expired','cancelled')),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, questionnaire_id) references public.questionnaires(organization_id, id),
  foreign key (organization_id, patient_id) references public.patients(organization_id, id)
);

alter table public.questionnaire_responses add column if not exists assignment_id uuid;
alter table public.questionnaire_responses add constraint questionnaire_response_assignment_org_fk
  foreign key (organization_id, assignment_id)
  references public.questionnaire_assignments(organization_id, id);

-- RLS on every table in the exposed public schema.
do $$
declare table_record record;
begin
  for table_record in
    select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', table_record.tablename);
  end loop;
end; $$;

create policy organizations_member_select on public.organizations for select to authenticated
  using (private.is_org_member(id));
create policy organizations_owner_update on public.organizations for update to authenticated
  using (private.has_org_role(id, array['owner']::public.member_role[]))
  with check (private.has_org_role(id, array['owner']::public.member_role[]));

create policy profiles_self_or_peer_select on public.profiles for select to authenticated using (
  id = (select auth.uid()) or exists (
    select 1 from public.organization_members mine
    join public.organization_members peer on peer.organization_id = mine.organization_id
    where mine.user_id = (select auth.uid()) and mine.active and peer.user_id = profiles.id and peer.active
  )
);
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy members_same_org_select on public.organization_members for select to authenticated
  using (private.is_org_member(organization_id));
create policy members_team_manage_insert on public.organization_members for insert to authenticated
  with check (private.has_permission(organization_id, 'team.manage'));
create policy members_team_manage_update on public.organization_members for update to authenticated
  using (private.has_permission(organization_id, 'team.manage'))
  with check (private.has_permission(organization_id, 'team.manage'));

create policy professional_settings_member_select on public.professional_settings for select to authenticated
  using (private.is_org_member(organization_id));
create policy professional_settings_self_update on public.professional_settings for update to authenticated
  using (user_id = (select auth.uid()) or private.has_permission(organization_id, 'team.manage'))
  with check (user_id = (select auth.uid()) or private.has_permission(organization_id, 'team.manage'));
create policy professional_settings_member_insert on public.professional_settings for insert to authenticated
  with check (user_id = (select auth.uid()) or private.has_permission(organization_id, 'team.manage'));

create policy business_hours_agenda_select on public.business_hours for select to authenticated
  using (private.has_permission(organization_id, 'agenda.read'));
create policy business_hours_agenda_write on public.business_hours for all to authenticated
  using (private.has_permission(organization_id, 'agenda.write'))
  with check (private.has_permission(organization_id, 'agenda.write'));

create policy permissions_authenticated_select on public.permissions for select to authenticated using (true);
create policy role_permissions_authenticated_select on public.role_permissions for select to authenticated using (true);
create policy overrides_team_select on public.member_permission_overrides for select to authenticated
  using (private.has_permission(organization_id, 'team.manage') or member_user_id = (select auth.uid()));
create policy overrides_team_write on public.member_permission_overrides for all to authenticated
  using (private.has_permission(organization_id, 'team.manage'))
  with check (private.has_permission(organization_id, 'team.manage') and granted_by = (select auth.uid()));

create policy patient_links_staff_select on public.patient_user_links for select to authenticated
  using (private.has_permission(organization_id, 'patient.read') or user_id = (select auth.uid()));
create policy patient_links_staff_write on public.patient_user_links for all to authenticated
  using (private.has_permission(organization_id, 'patient.write'))
  with check (private.has_permission(organization_id, 'patient.write'));
create policy superadmins_self_select on public.superadmins for select to authenticated
  using (user_id = (select auth.uid()));

create policy patients_authorized_select on public.patients for select to authenticated using (
  private.has_permission(organization_id, 'patient.read') or private.is_linked_patient(organization_id, id)
);
create policy patients_staff_insert on public.patients for insert to authenticated
  with check (private.has_permission(organization_id, 'patient.write'));
create policy patients_staff_update on public.patients for update to authenticated
  using (private.has_permission(organization_id, 'patient.write'))
  with check (private.has_permission(organization_id, 'patient.write'));
create policy patient_tags_staff_select on public.patient_tags for select to authenticated
  using (private.has_permission(organization_id, 'patient.read'));
create policy patient_tags_staff_write on public.patient_tags for all to authenticated
  using (private.has_permission(organization_id, 'patient.write'))
  with check (private.has_permission(organization_id, 'patient.write'));
create policy patient_tag_links_staff_select on public.patient_tag_links for select to authenticated
  using (private.has_permission(organization_id, 'patient.read'));
create policy patient_tag_links_staff_write on public.patient_tag_links for all to authenticated
  using (private.has_permission(organization_id, 'patient.write'))
  with check (private.has_permission(organization_id, 'patient.write'));

create policy service_types_staff_select on public.service_types for select to authenticated
  using (private.has_permission(organization_id, 'agenda.read'));
create policy service_types_public_select on public.service_types for select to anon using (
  public_enabled and active and deleted_at is null and exists (
    select 1 from public.public_booking_profiles profile
    where profile.organization_id = service_types.organization_id and profile.enabled
  )
);
create policy service_types_staff_write on public.service_types for all to authenticated
  using (private.has_permission(organization_id, 'agenda.write'))
  with check (private.has_permission(organization_id, 'agenda.write'));
create policy appointments_authorized_select on public.appointments for select to authenticated using (
  private.has_permission(organization_id, 'agenda.read') or
  (patient_id is not null and private.is_linked_patient(organization_id, patient_id))
);
create policy appointments_staff_insert on public.appointments for insert to authenticated
  with check (private.has_permission(organization_id, 'agenda.write'));
create policy appointments_staff_update on public.appointments for update to authenticated
  using (private.has_permission(organization_id, 'agenda.write'))
  with check (private.has_permission(organization_id, 'agenda.write'));
create policy public_booking_profiles_public_select on public.public_booking_profiles for select to anon, authenticated
  using (enabled);
create policy public_booking_profiles_staff_select on public.public_booking_profiles for select to authenticated
  using (private.has_permission(organization_id, 'agenda.read'));
create policy public_booking_profiles_staff_write on public.public_booking_profiles for all to authenticated
  using (private.has_permission(organization_id, 'agenda.write'))
  with check (private.has_permission(organization_id, 'agenda.write'));

-- Clinical staff tables share strict read/write policies.
do $$
declare table_name text;
begin
  foreach table_name in array array[
    'clinical_records','clinical_addenda','anamneses','patient_dietary_conditions','assessments',
    'measurements','skinfold_measurements','evolution_photos','lab_exams','lab_markers',
    'nutrition_plans','meals','meal_items','substitutions','recipes','recipe_ingredients',
    'recipe_tags','nutrition_plan_templates','guidance_library','patient_guidance',
    'food_imports','patient_clinical_releases'
  ] loop
    execute format('create policy %I on public.%I for select to authenticated using (private.has_permission(organization_id, ''clinical.read''))', table_name || '_clinical_select', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (private.has_permission(organization_id, ''clinical.write''))', table_name || '_clinical_insert', table_name);
    execute format('create policy %I on public.%I for update to authenticated using (private.has_permission(organization_id, ''clinical.write'')) with check (private.has_permission(organization_id, ''clinical.write''))', table_name || '_clinical_update', table_name);
    execute format('create policy %I on public.%I for delete to authenticated using (private.has_permission(organization_id, ''clinical.write''))', table_name || '_clinical_delete', table_name);
  end loop;
end; $$;

create policy clinical_versions_staff_select on public.clinical_record_versions for select to authenticated
  using (private.has_permission(organization_id, 'clinical.read'));
create policy clinical_versions_patient_released_select on public.clinical_record_versions for select to authenticated using (
  private.is_linked_patient(organization_id, patient_id) and exists (
    select 1 from public.patient_clinical_releases release
    where release.organization_id = clinical_record_versions.organization_id
      and release.clinical_record_id = clinical_record_versions.clinical_record_id
      and release.clinical_version = clinical_record_versions.version
      and release.revoked_at is null
  )
);
create policy clinical_addenda_patient_no_access on public.clinical_addenda for select to authenticated using (false);

create policy foods_read on public.foods for select to authenticated using (
  (organization_id is null) or private.has_permission(organization_id, 'clinical.read')
);
create policy foods_write on public.foods for all to authenticated
  using (organization_id is not null and private.has_permission(organization_id, 'clinical.write'))
  with check (organization_id is not null and private.has_permission(organization_id, 'clinical.write'));
create policy food_nutrients_read on public.food_nutrients for select to authenticated using (
  organization_id is null or private.has_permission(organization_id, 'clinical.read')
);
create policy food_nutrients_write on public.food_nutrients for all to authenticated
  using (organization_id is not null and private.has_permission(organization_id, 'clinical.write'))
  with check (organization_id is not null and private.has_permission(organization_id, 'clinical.write'));
create policy plan_versions_staff_select on public.nutrition_plan_versions for select to authenticated
  using (private.has_permission(organization_id, 'clinical.read'));
create policy plan_versions_patient_select on public.nutrition_plan_versions for select to authenticated
  using (private.is_linked_patient(organization_id, patient_id));
create policy plan_versions_staff_insert on public.nutrition_plan_versions for insert to authenticated
  with check (private.has_permission(organization_id, 'clinical.write'));
create policy patient_guidance_portal_select on public.patient_guidance for select to authenticated
  using (released_to_patient and private.is_linked_patient(organization_id, patient_id));

-- Documents and releases.
create policy documents_staff_select on public.documents for select to authenticated
  using (private.has_permission(organization_id, 'documents.read'));
create policy documents_staff_insert on public.documents for insert to authenticated
  with check (private.has_permission(organization_id, 'documents.write'));
create policy documents_patient_released_select on public.documents for select to authenticated using (
  patient_id is not null and private.is_linked_patient(organization_id, patient_id) and exists (
    select 1 from public.document_releases release
    where release.organization_id = documents.organization_id and release.document_id = documents.id
      and release.patient_id = documents.patient_id and release.revoked_at is null
  )
);
create policy document_releases_staff_select on public.document_releases for select to authenticated
  using (private.has_permission(organization_id, 'documents.read'));
create policy document_releases_staff_write on public.document_releases for all to authenticated
  using (private.has_permission(organization_id, 'documents.write'))
  with check (private.has_permission(organization_id, 'documents.write'));
create policy document_releases_patient_select on public.document_releases for select to authenticated
  using (revoked_at is null and private.is_linked_patient(organization_id, patient_id));

-- Questionnaire/check-in staff and patient policies.
do $$
declare table_name text;
begin
  foreach table_name in array array['questionnaires','questionnaire_fields','questionnaire_assignments','questionnaire_responses','checkin_templates','checkin_requests','checkin_responses'] loop
    execute format('create policy %I on public.%I for select to authenticated using (private.has_permission(organization_id, ''clinical.read''))', table_name || '_staff_select', table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (private.has_permission(organization_id, ''clinical.write''))', table_name || '_staff_insert', table_name);
    execute format('create policy %I on public.%I for update to authenticated using (private.has_permission(organization_id, ''clinical.write'')) with check (private.has_permission(organization_id, ''clinical.write''))', table_name || '_staff_update', table_name);
  end loop;
end; $$;
create policy questionnaire_assignments_patient_select on public.questionnaire_assignments for select to authenticated
  using (private.is_linked_patient(organization_id, patient_id));
create policy questionnaire_responses_patient_select on public.questionnaire_responses for select to authenticated
  using (private.is_linked_patient(organization_id, patient_id));
create policy questionnaire_responses_patient_insert on public.questionnaire_responses for insert to authenticated
  with check (private.is_linked_patient(organization_id, patient_id));
create policy questionnaires_patient_assigned_select on public.questionnaires for select to authenticated using (
  published_at is not null and exists (
    select 1 from public.questionnaire_assignments assignment
    where assignment.organization_id = questionnaires.organization_id
      and assignment.questionnaire_id = questionnaires.id
      and private.is_linked_patient(assignment.organization_id, assignment.patient_id)
  )
);
create policy questionnaire_fields_patient_assigned_select on public.questionnaire_fields for select to authenticated using (
  exists (
    select 1 from public.questionnaire_assignments assignment
    where assignment.organization_id = questionnaire_fields.organization_id
      and assignment.questionnaire_id = questionnaire_fields.questionnaire_id
      and private.is_linked_patient(assignment.organization_id, assignment.patient_id)
  )
);
create policy checkin_requests_patient_select on public.checkin_requests for select to authenticated
  using (private.is_linked_patient(organization_id, patient_id));
create policy checkin_responses_patient_select on public.checkin_responses for select to authenticated
  using (private.is_linked_patient(organization_id, patient_id));
create policy checkin_responses_patient_insert on public.checkin_responses for insert to authenticated
  with check (private.is_linked_patient(organization_id, patient_id));

-- Finance policies and patient-visible charges/receipts.
create policy payments_staff_select on public.payments for select to authenticated
  using (private.has_permission(organization_id, 'finance.read'));
create policy payments_staff_write on public.payments for all to authenticated
  using (private.has_permission(organization_id, 'finance.write'))
  with check (private.has_permission(organization_id, 'finance.write'));
create policy payments_patient_select on public.payments for select to authenticated
  using (patient_id is not null and private.is_linked_patient(organization_id, patient_id));
create policy expenses_staff_select on public.expenses for select to authenticated
  using (private.has_permission(organization_id, 'finance.read'));
create policy expenses_staff_write on public.expenses for all to authenticated
  using (private.has_permission(organization_id, 'finance.write'))
  with check (private.has_permission(organization_id, 'finance.write'));
create policy receipts_staff_select on public.receipts for select to authenticated
  using (private.has_permission(organization_id, 'finance.read'));
create policy receipts_staff_insert on public.receipts for insert to authenticated
  with check (private.has_permission(organization_id, 'finance.write'));
create policy receipts_patient_select on public.receipts for select to authenticated
  using (private.is_linked_patient(organization_id, patient_id));
do $$
declare table_name text;
begin
  foreach table_name in array array['payment_gateway_configs','payment_intents'] loop
    execute format('create policy %I on public.%I for select to authenticated using (private.has_permission(organization_id, ''finance.read''))', table_name || '_finance_select', table_name);
    execute format('create policy %I on public.%I for all to authenticated using (private.has_permission(organization_id, ''finance.write'')) with check (private.has_permission(organization_id, ''finance.write''))', table_name || '_finance_write', table_name);
  end loop;
end; $$;

-- Administrative/operational tables.
create policy crm_staff_select on public.crm_leads for select to authenticated
  using (private.has_permission(organization_id, 'patient.read'));
create policy crm_staff_write on public.crm_leads for all to authenticated
  using (private.has_permission(organization_id, 'patient.write'))
  with check (private.has_permission(organization_id, 'patient.write'));
create policy tasks_member_select on public.tasks for select to authenticated
  using (private.is_org_member(organization_id));
create policy tasks_member_write on public.tasks for all to authenticated
  using (private.is_org_member(organization_id)) with check (private.is_org_member(organization_id));
create policy notifications_self_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));
create policy notifications_self_update on public.notifications for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

do $$
declare table_name text;
begin
  foreach table_name in array array['integration_configs','message_templates','message_outbox','organization_settings'] loop
    execute format('create policy %I on public.%I for select to authenticated using (private.has_permission(organization_id, ''team.manage''))', table_name || '_manager_select', table_name);
    execute format('create policy %I on public.%I for all to authenticated using (private.has_permission(organization_id, ''team.manage'')) with check (private.has_permission(organization_id, ''team.manage''))', table_name || '_manager_write', table_name);
  end loop;
end; $$;
create policy team_invitations_manager_select on public.team_invitations for select to authenticated
  using (private.has_permission(organization_id, 'team.manage'));
create policy team_invitations_manager_write on public.team_invitations for all to authenticated
  using (private.has_permission(organization_id, 'team.manage'))
  with check (private.has_permission(organization_id, 'team.manage'));

do $$
declare table_name text;
begin
  foreach table_name in array array['patient_imports','patient_import_rows','consents','privacy_requests'] loop
    execute format('create policy %I on public.%I for select to authenticated using (private.has_permission(organization_id, ''patient.read''))', table_name || '_patient_select', table_name);
    execute format('create policy %I on public.%I for all to authenticated using (private.has_permission(organization_id, ''patient.write'')) with check (private.has_permission(organization_id, ''patient.write''))', table_name || '_patient_write', table_name);
  end loop;
end; $$;
create policy consents_portal_select on public.consents for select to authenticated
  using (private.is_linked_patient(organization_id, patient_id));
create policy privacy_requests_portal_select on public.privacy_requests for select to authenticated
  using (private.is_linked_patient(organization_id, patient_id));
create policy privacy_requests_portal_insert on public.privacy_requests for insert to authenticated
  with check (private.is_linked_patient(organization_id, patient_id));

create policy audit_logs_staff_select on public.audit_logs for select to authenticated
  using (private.has_permission(organization_id, 'reports.read') or private.has_permission(organization_id, 'team.manage'));
create policy audit_logs_member_insert on public.audit_logs for insert to authenticated
  with check (private.is_org_member(organization_id) and (actor_user_id = (select auth.uid()) or actor_user_id is null));

create policy feature_flags_authenticated_select on public.feature_flags for select to authenticated using (true);
create policy organization_flags_member_select on public.organization_feature_flags for select to authenticated
  using (private.is_org_member(organization_id));
create policy organization_flags_superadmin_write on public.organization_feature_flags for all to authenticated
  using (private.is_superadmin()) with check (private.is_superadmin());
create policy saas_plans_public_select on public.saas_plans for select to anon, authenticated using (active);
create policy saas_plans_superadmin_select on public.saas_plans for select to authenticated using (private.is_superadmin());
create policy saas_plan_features_public_select on public.saas_plan_features for select to anon, authenticated using (
  exists(select 1 from public.saas_plans plan where plan.id = saas_plan_features.plan_id and plan.active)
);
create policy saas_plan_features_superadmin_select on public.saas_plan_features for select to authenticated
  using (private.is_superadmin());
create policy subscriptions_member_select on public.organization_subscriptions for select to authenticated
  using (private.is_org_member(organization_id) or private.is_superadmin());
create policy subscriptions_superadmin_write on public.organization_subscriptions for all to authenticated
  using (private.is_superadmin()) with check (private.is_superadmin());
create policy admin_events_superadmin on public.admin_account_events for all to authenticated
  using (private.is_superadmin()) with check (private.is_superadmin() and actor_user_id = (select auth.uid()));

-- Updated-at and safe audit triggers.
create or replace function private.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end
$$;
revoke all on function private.set_updated_at() from public, anon, authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'organizations','profiles','patients','professional_settings','member_permission_overrides',
    'service_types','public_booking_profiles','clinical_records','anamneses',
    'patient_dietary_conditions','foods','nutrition_plans','recipes','nutrition_plan_templates',
    'guidance_library','questionnaires','checkin_templates','payments','expenses',
    'payment_gateway_configs','payment_intents','crm_leads','tasks','integration_configs',
    'message_templates','organization_settings','saas_plans','organization_subscriptions'
  ] loop
    execute format('drop trigger if exists %I on public.%I', table_name || '_touch', table_name);
    execute format('create trigger %I before update on public.%I for each row execute function private.set_updated_at()', table_name || '_touch', table_name);
  end loop;
end; $$;

drop function if exists public.touch_updated_at();

create or replace function private.audit_row_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  v_org uuid;
  v_entity_id uuid;
  v_changed jsonb := '[]'::jsonb;
begin
  v_org := coalesce(nullif(v_new ->> 'organization_id',''), nullif(v_old ->> 'organization_id',''))::uuid;
  v_entity_id := coalesce(nullif(v_new ->> 'id',''), nullif(v_old ->> 'id',''))::uuid;
  if tg_op = 'UPDATE' then
    select coalesce(jsonb_agg(key order by key), '[]'::jsonb) into v_changed
    from (
      select key from jsonb_object_keys(v_new || v_old) key
      where key not in ('private_notes','report','evolution','signs_symptoms','symptoms','conduct','nutrition_diagnosis','strategy','guidance','goals','objectives','answers','raw_data','normalized_data','variables','metadata')
        and v_new -> key is distinct from v_old -> key
    ) changed;
  end if;
  if v_org is not null then
    insert into public.audit_logs(organization_id, actor_user_id, action, entity, entity_id, metadata)
    values(
      v_org,
      (select auth.uid()),
      lower(tg_table_name) || '.' || lower(tg_op),
      tg_table_name,
      v_entity_id,
      jsonb_build_object('operation', tg_op, 'changed_fields', v_changed)
    );
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function private.audit_row_change() from public, anon, authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'patients','organization_members','member_permission_overrides','appointments','clinical_records',
    'clinical_addenda','nutrition_plans','nutrition_plan_versions','documents','document_releases',
    'payments','expenses','receipts','privacy_requests','integration_configs'
  ] loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.audit_row_change()', table_name || '_audit', table_name);
  end loop;
end; $$;

-- Permission-aware global search. The function is security-invoker, so RLS remains authoritative.
create or replace function public.search_workspace(p_organization_id uuid, p_query text)
returns table(entity text, entity_id uuid, label text, subtitle text, href text)
language plpgsql stable security invoker set search_path = '' as $$
declare v_query text := '%' || replace(replace(trim(p_query), '%', '\%'), '_', '\_') || '%';
begin
  if char_length(trim(p_query)) < 2 then return; end if;
  if private.has_permission(p_organization_id, 'patient.read') then
    return query
      select 'patient', patient.id, coalesce(patient.social_name, patient.name),
        coalesce(patient.phone, patient.email, ''), '/app/pacientes/' || patient.id::text
      from public.patients patient
      where patient.organization_id = p_organization_id and patient.deleted_at is null
        and (patient.name ilike v_query escape '\' or patient.social_name ilike v_query escape '\'
          or patient.phone ilike v_query escape '\' or patient.email ilike v_query escape '\')
      order by patient.name limit 20;
  end if;
  if private.has_permission(p_organization_id, 'agenda.read') then
    return query
      select 'appointment', appointment.id, appointment.title,
        to_char(appointment.starts_at, 'DD/MM/YYYY HH24:MI'), '/app/agenda?appointment=' || appointment.id::text
      from public.appointments appointment
      where appointment.organization_id = p_organization_id and appointment.deleted_at is null
        and appointment.title ilike v_query escape '\'
      order by appointment.starts_at desc limit 10;
  end if;
  if private.has_permission(p_organization_id, 'documents.read') then
    return query
      select 'document', document.id, document.title, document.type,
        '/app/documentos?document=' || document.id::text
      from public.documents document
      where document.organization_id = p_organization_id and document.title ilike v_query escape '\'
      order by document.issued_at desc limit 10;
  end if;
end;
$$;
revoke all on function public.search_workspace(uuid, text) from public, anon;
grant execute on function public.search_workspace(uuid, text) to authenticated;

-- Data API grants: RLS still decides which rows are visible and writable.
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant select on public.public_booking_profiles, public.service_types, public.saas_plans, public.saas_plan_features to anon;
revoke insert, update, delete on public.permissions, public.role_permissions, public.superadmins,
  public.clinical_record_versions, public.nutrition_plan_versions, public.documents, public.receipts,
  public.booking_rate_limits, public.payment_webhook_events, public.saas_plans, public.saas_plan_features,
  public.audit_logs from authenticated;
grant insert on public.clinical_record_versions, public.nutrition_plan_versions, public.documents, public.receipts, public.audit_logs to authenticated;

-- Storage paths always begin with organization UUID. All buckets are private.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types) values
  ('professional-avatars','professional-avatars',false,5242880,array['image/jpeg','image/png','image/webp']),
  ('organization-logos','organization-logos',false,5242880,array['image/jpeg','image/png','image/webp']),
  ('professional-signatures','professional-signatures',false,5242880,array['image/jpeg','image/png','image/webp']),
  ('patient-photos','patient-photos',false,10485760,array['image/jpeg','image/png','image/webp']),
  ('evolution-photos','evolution-photos',false,10485760,array['image/jpeg','image/png','image/webp']),
  ('lab-exams','lab-exams',false,26214400,array['application/pdf','image/jpeg','image/png','image/webp']),
  ('patient-documents','patient-documents',false,26214400,array['application/pdf']),
  ('recipe-photos','recipe-photos',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.storage_org_id(p_name text)
returns uuid language plpgsql immutable set search_path = '' as $$
begin return split_part(p_name, '/', 1)::uuid;
exception when invalid_text_representation then return null;
end;
$$;
revoke all on function private.storage_org_id(text) from public, anon;
grant execute on function private.storage_org_id(text) to authenticated;

drop policy if exists nutripro_storage_staff_select on storage.objects;
drop policy if exists nutripro_storage_staff_insert on storage.objects;
drop policy if exists nutripro_storage_staff_update on storage.objects;
drop policy if exists nutripro_storage_staff_delete on storage.objects;
drop policy if exists nutripro_storage_patient_select on storage.objects;

create policy nutripro_storage_staff_select on storage.objects for select to authenticated using (
  bucket_id in ('professional-avatars','organization-logos','professional-signatures','patient-photos','evolution-photos','lab-exams','patient-documents','recipe-photos')
  and (
    private.has_permission(private.storage_org_id(name), 'documents.read') or
    private.has_permission(private.storage_org_id(name), 'clinical.read') or
    private.has_permission(private.storage_org_id(name), 'patient.read')
  )
);
create policy nutripro_storage_staff_insert on storage.objects for insert to authenticated with check (
  private.storage_org_id(name) is not null and (
    (bucket_id in ('professional-avatars','professional-signatures') and
      ((storage.foldername(name))[2] = (select auth.uid())::text or private.has_permission(private.storage_org_id(name), 'team.manage'))) or
    (bucket_id = 'organization-logos' and private.has_permission(private.storage_org_id(name), 'team.manage')) or
    (bucket_id = 'patient-photos' and private.has_permission(private.storage_org_id(name), 'patient.write')) or
    (bucket_id in ('evolution-photos','lab-exams','recipe-photos') and private.has_permission(private.storage_org_id(name), 'clinical.write')) or
    (bucket_id = 'patient-documents' and private.has_permission(private.storage_org_id(name), 'documents.write'))
  )
);
create policy nutripro_storage_staff_update on storage.objects for update to authenticated
  using (
    (bucket_id in ('professional-avatars','professional-signatures') and
      ((storage.foldername(name))[2] = (select auth.uid())::text or private.has_permission(private.storage_org_id(name), 'team.manage'))) or
    (bucket_id = 'organization-logos' and private.has_permission(private.storage_org_id(name), 'team.manage')) or
    (bucket_id = 'patient-photos' and private.has_permission(private.storage_org_id(name), 'patient.write')) or
    (bucket_id in ('evolution-photos','lab-exams','recipe-photos') and private.has_permission(private.storage_org_id(name), 'clinical.write')) or
    (bucket_id = 'patient-documents' and private.has_permission(private.storage_org_id(name), 'documents.write'))
  )
  with check (
    (bucket_id in ('professional-avatars','professional-signatures') and
      ((storage.foldername(name))[2] = (select auth.uid())::text or private.has_permission(private.storage_org_id(name), 'team.manage'))) or
    (bucket_id = 'organization-logos' and private.has_permission(private.storage_org_id(name), 'team.manage')) or
    (bucket_id = 'patient-photos' and private.has_permission(private.storage_org_id(name), 'patient.write')) or
    (bucket_id in ('evolution-photos','lab-exams','recipe-photos') and private.has_permission(private.storage_org_id(name), 'clinical.write')) or
    (bucket_id = 'patient-documents' and private.has_permission(private.storage_org_id(name), 'documents.write'))
  );
create policy nutripro_storage_staff_delete on storage.objects for delete to authenticated using (
  (bucket_id in ('professional-avatars','professional-signatures') and
    ((storage.foldername(name))[2] = (select auth.uid())::text or private.has_permission(private.storage_org_id(name), 'team.manage'))) or
  (bucket_id = 'organization-logos' and private.has_permission(private.storage_org_id(name), 'team.manage')) or
  (bucket_id = 'patient-photos' and private.has_permission(private.storage_org_id(name), 'patient.write')) or
  (bucket_id in ('evolution-photos','lab-exams','recipe-photos') and private.has_permission(private.storage_org_id(name), 'clinical.write'))
);
create policy nutripro_storage_patient_select on storage.objects for select to authenticated using (
  (bucket_id = 'patient-documents' and (
    exists (
      select 1 from public.documents document
      join public.document_releases release
        on release.organization_id = document.organization_id and release.document_id = document.id
      where document.private_file_path = storage.objects.name and release.revoked_at is null
        and private.is_linked_patient(document.organization_id, release.patient_id)
    ) or exists (
      select 1 from public.receipts receipt
      where receipt.private_file_path = storage.objects.name
        and private.is_linked_patient(receipt.organization_id, receipt.patient_id)
    )
  )) or
  (bucket_id = 'evolution-photos' and exists (
    select 1 from public.evolution_photos photo
    where photo.private_file_path = storage.objects.name and photo.share_with_patient
      and photo.consent_recorded_at is not null and photo.deleted_at is null
      and private.is_linked_patient(photo.organization_id, photo.patient_id)
  )) or
  (bucket_id = 'patient-photos' and exists (
    select 1 from public.patients patient
    where patient.photo_path = storage.objects.name and patient.deleted_at is null
      and private.is_linked_patient(patient.organization_id, patient.id)
  ))
);

commit;
