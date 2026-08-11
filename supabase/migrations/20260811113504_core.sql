begin;
create extension if not exists pgcrypto;

create type public.member_role as enum ('owner','nutritionist','assistant');
create type public.patient_status as enum ('lead','ativo','acompanhamento','inativo','alta');

create table public.organizations (
  id uuid primary key default gen_random_uuid(), name text not null check (char_length(name) between 2 and 180),
  slug text not null unique default encode(gen_random_bytes(8),'hex'), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade, full_name text, professional_name text, phone text, avatar_path text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.organization_members (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, role public.member_role not null, active boolean not null default true,
  created_at timestamptz not null default now(), unique(organization_id,user_id)
);
create index organization_members_user_idx on public.organization_members(user_id) where active;

create table public.patients (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
  responsible_user_id uuid references auth.users(id) on delete set null, name text not null check(char_length(name) between 2 and 160), social_name text,
  birth_date date, cpf text, phone text, whatsapp text, email text, profession text, objective text, source text, referral text,
  admin_notes text, status public.patient_status not null default 'ativo', emergency_name text, emergency_relation text, emergency_phone text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create index patients_org_name_idx on public.patients(organization_id, lower(name)) where deleted_at is null;
create index patients_org_status_idx on public.patients(organization_id,status) where deleted_at is null;
create unique index patients_org_cpf_unique on public.patients(organization_id,cpf) where cpf is not null and deleted_at is null;

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null, action text not null, entity text not null, entity_id uuid,
  metadata jsonb not null default '{}'::jsonb, ip inet, user_agent text, created_at timestamptz not null default now()
);
create index audit_logs_org_created_idx on public.audit_logs(organization_id,created_at desc);

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$;
create trigger organizations_touch before update on public.organizations for each row execute function public.touch_updated_at();
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger patients_touch before update on public.patients for each row execute function public.touch_updated_at();

create or replace function public.is_org_member(p_org uuid) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.organization_members m where m.organization_id=p_org and m.user_id=auth.uid() and m.active)
$$;
create or replace function public.has_org_role(p_org uuid, p_roles public.member_role[]) returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.organization_members m where m.organization_id=p_org and m.user_id=auth.uid() and m.active and m.role=any(p_roles))
$$;
revoke all on function public.is_org_member(uuid) from public; grant execute on function public.is_org_member(uuid) to authenticated;
revoke all on function public.has_org_role(uuid,public.member_role[]) from public; grant execute on function public.has_org_role(uuid,public.member_role[]) to authenticated;

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$
begin insert into public.profiles(id,full_name) values(new.id,new.raw_user_meta_data->>'full_name') on conflict(id) do nothing; return new; end; $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.bootstrap_organization(p_organization_name text,p_professional_name text) returns uuid language plpgsql security definer set search_path=public as $$
declare v_org uuid; begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if exists(select 1 from public.organization_members where user_id=auth.uid() and active) then raise exception 'user already belongs to an active organization'; end if;
  insert into public.organizations(name) values(trim(p_organization_name)) returning id into v_org;
  insert into public.organization_members(organization_id,user_id,role) values(v_org,auth.uid(),'owner');
  update public.profiles set professional_name=trim(p_professional_name) where id=auth.uid();
  insert into public.audit_logs(organization_id,actor_user_id,action,entity,entity_id) values(v_org,auth.uid(),'organization.created','organization',v_org);
  return v_org;
end; $$;
revoke all on function public.bootstrap_organization(text,text) from public; grant execute on function public.bootstrap_organization(text,text) to authenticated;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.patients enable row level security;
alter table public.audit_logs enable row level security;

create policy organizations_select_member on public.organizations for select to authenticated using(public.is_org_member(id));
create policy organizations_update_owner on public.organizations for update to authenticated using(public.has_org_role(id,array['owner']::public.member_role[])) with check(public.has_org_role(id,array['owner']::public.member_role[]));
create policy profiles_self_select on public.profiles for select to authenticated using(id=auth.uid());
create policy profiles_self_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy members_select_same_org on public.organization_members for select to authenticated using(public.is_org_member(organization_id));
create policy members_owner_write on public.organization_members for all to authenticated using(public.has_org_role(organization_id,array['owner']::public.member_role[])) with check(public.has_org_role(organization_id,array['owner']::public.member_role[]));
create policy patients_read_member on public.patients for select to authenticated using(public.is_org_member(organization_id));
create policy patients_insert_staff on public.patients for insert to authenticated with check(public.has_org_role(organization_id,array['owner','nutritionist','assistant']::public.member_role[]));
create policy patients_update_staff on public.patients for update to authenticated using(public.has_org_role(organization_id,array['owner','nutritionist','assistant']::public.member_role[])) with check(public.has_org_role(organization_id,array['owner','nutritionist','assistant']::public.member_role[]));
create policy audit_insert_member on public.audit_logs for insert to authenticated with check(public.is_org_member(organization_id) and (actor_user_id=auth.uid() or actor_user_id is null));
create policy audit_select_clinical on public.audit_logs for select to authenticated using(public.has_org_role(organization_id,array['owner','nutritionist']::public.member_role[]));
commit;
