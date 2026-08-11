begin;

create schema if not exists extensions;
alter extension pgcrypto set schema extensions;

alter table public.recipes
  add column if not exists created_by uuid references auth.users(id) on delete set null;

create or replace function private.serialize_appointment_write()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text || new.professional_user_id::text, 0));
  if new.patient_id is not null then
    perform pg_advisory_xact_lock(hashtextextended('patient:' || new.organization_id::text || new.patient_id::text, 0));
  end if;
  return new;
end;
$$;

drop trigger if exists appointments_serialize_write on public.appointments;
create trigger appointments_serialize_write
before insert or update of organization_id, professional_user_id, patient_id, starts_at, ends_at
on public.appointments for each row execute function private.serialize_appointment_write();

create policy guidance_library_portal_select on public.guidance_library for select to authenticated using (
  deleted_at is null and exists (
    select 1 from public.patient_guidance assignment
    where assignment.organization_id = guidance_library.organization_id
      and assignment.guidance_id = guidance_library.id
      and assignment.released_to_patient
      and private.is_linked_patient(assignment.organization_id, assignment.patient_id)
  )
);

create or replace function private.submit_questionnaire_response(
  p_assignment_id uuid,
  p_answers jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_assignment public.questionnaire_assignments%rowtype; v_response uuid;
begin
  if jsonb_typeof(p_answers) <> 'object' then raise exception 'invalid answers'; end if;
  select * into v_assignment from public.questionnaire_assignments
    where id = p_assignment_id and status = 'pending' for update;
  if not found or not private.is_linked_patient(v_assignment.organization_id, v_assignment.patient_id) then
    raise exception 'not authorized';
  end if;
  if not exists (select 1 from public.questionnaires where id = v_assignment.questionnaire_id and published_at is not null and deleted_at is null) then
    raise exception 'questionnaire unavailable';
  end if;
  if exists (select 1 from public.questionnaire_responses where assignment_id = p_assignment_id) then
    raise exception 'already answered';
  end if;
  insert into public.questionnaire_responses(organization_id,questionnaire_id,patient_id,answers,assignment_id,assigned_at,assigned_by)
    values(v_assignment.organization_id,v_assignment.questionnaire_id,v_assignment.patient_id,p_answers,p_assignment_id,v_assignment.created_at,v_assignment.assigned_by)
    returning id into v_response;
  update public.questionnaire_assignments set status = 'answered' where id = p_assignment_id;
  return v_response;
end;
$$;
revoke all on function private.submit_questionnaire_response(uuid,jsonb) from public, anon;
grant execute on function private.submit_questionnaire_response(uuid,jsonb) to authenticated;

create or replace function public.submit_questionnaire_response(p_assignment_id uuid, p_answers jsonb)
returns uuid language sql volatile security invoker set search_path = '' as $$
  select private.submit_questionnaire_response(p_assignment_id,p_answers)
$$;
revoke all on function public.submit_questionnaire_response(uuid,jsonb) from public, anon;
grant execute on function public.submit_questionnaire_response(uuid,jsonb) to authenticated;

create or replace function private.team_invitation_details(p_token text)
returns table(organization_name text,email text,role public.member_role,expires_at timestamptz,valid boolean)
language sql stable security definer set search_path = '' as $$
  select organization.name, invitation.email, invitation.role, invitation.expires_at,
    invitation.accepted_at is null and invitation.revoked_at is null and invitation.expires_at > now()
  from public.team_invitations invitation
  join public.organizations organization on organization.id = invitation.organization_id
  where invitation.token_hash = encode(extensions.digest(p_token,'sha256'),'hex')
  limit 1
$$;
revoke all on function private.team_invitation_details(text) from public;
grant usage on schema private to anon;
grant execute on function private.team_invitation_details(text) to anon, authenticated;

create or replace function public.team_invitation_details(p_token text)
returns table(organization_name text,email text,role public.member_role,expires_at timestamptz,valid boolean)
language sql stable security invoker set search_path = '' as $$
  select * from private.team_invitation_details(p_token)
$$;
revoke all on function public.team_invitation_details(text) from public;
grant execute on function public.team_invitation_details(text) to anon, authenticated;

create or replace function private.accept_team_invitation(p_token text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_invitation public.team_invitations%rowtype; v_email text;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  v_email := lower(coalesce((select auth.jwt())->>'email',''));
  select * into v_invitation from public.team_invitations
    where token_hash = encode(extensions.digest(p_token,'sha256'),'hex') for update;
  if not found or v_invitation.accepted_at is not null or v_invitation.revoked_at is not null or v_invitation.expires_at <= now() then
    raise exception 'invalid invitation';
  end if;
  if lower(v_invitation.email) <> v_email then raise exception 'email mismatch'; end if;
  insert into public.organization_members(organization_id,user_id,role,active)
    values(v_invitation.organization_id,(select auth.uid()),v_invitation.role,true)
    on conflict(organization_id,user_id) do update set role=excluded.role,active=true;
  insert into public.professional_settings(organization_id,user_id)
    values(v_invitation.organization_id,(select auth.uid())) on conflict(organization_id,user_id) do nothing;
  update public.team_invitations set accepted_at=now() where id=v_invitation.id;
  insert into public.audit_logs(organization_id,actor_user_id,action,entity,entity_id)
    values(v_invitation.organization_id,(select auth.uid()),'team.invitation_accepted','organization_member',(select auth.uid()));
  return v_invitation.organization_id;
end;
$$;
revoke all on function private.accept_team_invitation(text) from public, anon;
grant execute on function private.accept_team_invitation(text) to authenticated;

create or replace function public.accept_team_invitation(p_token text)
returns uuid language sql volatile security invoker set search_path = '' as $$
  select private.accept_team_invitation(p_token)
$$;
revoke all on function public.accept_team_invitation(text) from public, anon;
grant execute on function public.accept_team_invitation(text) to authenticated;

create or replace function public.import_patients(
  p_organization_id uuid,
  p_file_name text,
  p_rows jsonb
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_import uuid; v_row jsonb; v_patient uuid; v_total integer := 0; v_valid integer := 0; v_invalid integer := 0; v_imported integer := 0;
begin
  if not private.has_permission(p_organization_id,'patient.write') then raise exception 'not authorized'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then raise exception 'invalid rows'; end if;
  insert into public.patient_imports(organization_id,file_name,column_mapping,status,total_rows,created_by)
    values(p_organization_id,left(p_file_name,255),'{}','importing',jsonb_array_length(p_rows),(select auth.uid())) returning id into v_import;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_total := v_total + 1; v_patient := null;
    if jsonb_array_length(coalesce(v_row->'validation_errors','[]'::jsonb)) = 0 then
      v_valid := v_valid + 1;
      insert into public.patients(organization_id,name,social_name,birth_date,cpf,phone,whatsapp,email,objective,status)
        values(p_organization_id,v_row#>>'{normalized_data,name}',nullif(v_row#>>'{normalized_data,social_name}',''),nullif(v_row#>>'{normalized_data,birth_date}','')::date,
          nullif(v_row#>>'{normalized_data,cpf}',''),nullif(v_row#>>'{normalized_data,phone}',''),nullif(v_row#>>'{normalized_data,whatsapp}',''),
          nullif(v_row#>>'{normalized_data,email}',''),nullif(v_row#>>'{normalized_data,objective}',''),coalesce(nullif(v_row#>>'{normalized_data,status}',''),'ativo')::public.patient_status)
        returning id into v_patient;
      v_imported := v_imported + 1;
    else v_invalid := v_invalid + 1;
    end if;
    insert into public.patient_import_rows(organization_id,import_id,row_number,raw_data,normalized_data,validation_errors,imported_patient_id)
      values(p_organization_id,v_import,coalesce((v_row->>'row_number')::integer,v_total),coalesce(v_row->'raw_data','{}'),v_row->'normalized_data',coalesce(v_row->'validation_errors','[]'),v_patient);
  end loop;
  update public.patient_imports set status='completed',total_rows=v_total,valid_rows=v_valid,invalid_rows=v_invalid,imported_rows=v_imported,completed_at=now() where id=v_import;
  return v_import;
end;
$$;
revoke all on function public.import_patients(uuid,text,jsonb) from public, anon;
grant execute on function public.import_patients(uuid,text,jsonb) to authenticated;

create policy organizations_superadmin_select on public.organizations for select to authenticated using (private.is_superadmin());
create policy saas_plans_superadmin_write on public.saas_plans for all to authenticated using (private.is_superadmin()) with check (private.is_superadmin());
create policy saas_plan_features_superadmin_write on public.saas_plan_features for all to authenticated using (private.is_superadmin()) with check (private.is_superadmin());

create table public.patient_portal_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  patient_id uuid not null,
  email text not null,
  token_hash text not null unique,
  invited_by uuid not null references auth.users(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (organization_id,patient_id) references public.patients(organization_id,id) on delete cascade
);
create unique index patient_portal_invitations_pending_idx on public.patient_portal_invitations(organization_id,patient_id,lower(email)) where accepted_at is null and revoked_at is null;
alter table public.patient_portal_invitations enable row level security;
create policy patient_portal_invitations_staff_select on public.patient_portal_invitations for select to authenticated using (private.has_permission(organization_id,'patient.read'));
create policy patient_portal_invitations_staff_write on public.patient_portal_invitations for all to authenticated using (private.has_permission(organization_id,'patient.write')) with check (private.has_permission(organization_id,'patient.write'));

create or replace function private.patient_portal_invitation_details(p_token text)
returns table(organization_name text,patient_name text,email text,expires_at timestamptz,valid boolean)
language sql stable security definer set search_path = '' as $$
  select organization.name,coalesce(patient.social_name,patient.name),invitation.email,invitation.expires_at,
    invitation.accepted_at is null and invitation.revoked_at is null and invitation.expires_at>now()
  from public.patient_portal_invitations invitation
  join public.organizations organization on organization.id=invitation.organization_id
  join public.patients patient on patient.id=invitation.patient_id and patient.organization_id=invitation.organization_id
  where invitation.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') limit 1
$$;
revoke all on function private.patient_portal_invitation_details(text) from public;
grant execute on function private.patient_portal_invitation_details(text) to anon,authenticated;
create or replace function public.patient_portal_invitation_details(p_token text)
returns table(organization_name text,patient_name text,email text,expires_at timestamptz,valid boolean)
language sql stable security invoker set search_path='' as $$ select * from private.patient_portal_invitation_details(p_token) $$;
revoke all on function public.patient_portal_invitation_details(text) from public;
grant execute on function public.patient_portal_invitation_details(text) to anon,authenticated;

create or replace function private.accept_patient_portal_invitation(p_token text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_invitation public.patient_portal_invitations%rowtype; v_email text;
begin
  if (select auth.uid()) is null then raise exception 'authentication required'; end if;
  v_email:=lower(coalesce((select auth.jwt())->>'email',''));
  select * into v_invitation from public.patient_portal_invitations where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') for update;
  if not found or v_invitation.accepted_at is not null or v_invitation.revoked_at is not null or v_invitation.expires_at<=now() then raise exception 'invalid invitation'; end if;
  if lower(v_invitation.email)<>v_email then raise exception 'email mismatch'; end if;
  insert into public.patient_user_links(organization_id,patient_id,user_id,invited_by,active)
    values(v_invitation.organization_id,v_invitation.patient_id,(select auth.uid()),v_invitation.invited_by,true)
    on conflict(organization_id,patient_id,user_id) do update set active=true,revoked_at=null;
  update public.patient_portal_invitations set accepted_at=now() where id=v_invitation.id;
  insert into public.audit_logs(organization_id,actor_user_id,action,entity,entity_id)
    values(v_invitation.organization_id,(select auth.uid()),'patient.portal_access_accepted','patient',v_invitation.patient_id);
  return v_invitation.patient_id;
end;
$$;
revoke all on function private.accept_patient_portal_invitation(text) from public,anon;
grant execute on function private.accept_patient_portal_invitation(text) to authenticated;
create or replace function public.accept_patient_portal_invitation(p_token text)
returns uuid language sql volatile security invoker set search_path='' as $$ select private.accept_patient_portal_invitation(p_token) $$;
revoke all on function public.accept_patient_portal_invitation(text) from public,anon;
grant execute on function public.accept_patient_portal_invitation(text) to authenticated;

create or replace function private.submit_checkin_response(p_request_id uuid,p_response jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_request public.checkin_requests%rowtype; v_response uuid;
begin
  if jsonb_typeof(p_response)<>'object' then raise exception 'invalid response'; end if;
  select * into v_request from public.checkin_requests where id=p_request_id and status='pending' for update;
  if not found or not private.is_linked_patient(v_request.organization_id,v_request.patient_id) then raise exception 'not authorized'; end if;
  insert into public.checkin_responses(organization_id,checkin_request_id,patient_id,weight_kg,hunger,satiety,energy,sleep,training,adherence,difficulties,comments)
  values(v_request.organization_id,v_request.id,v_request.patient_id,nullif(p_response->>'weight_kg','')::numeric,nullif(p_response->>'hunger','')::smallint,
    nullif(p_response->>'satiety','')::smallint,nullif(p_response->>'energy','')::smallint,nullif(p_response->>'sleep','')::smallint,
    nullif(trim(p_response->>'training'),''),nullif(trim(p_response->>'adherence'),''),nullif(trim(p_response->>'difficulties'),''),nullif(trim(p_response->>'comments'),'')) returning id into v_response;
  update public.checkin_requests set status='answered' where id=v_request.id;
  return v_response;
end;
$$;
revoke all on function private.submit_checkin_response(uuid,jsonb) from public,anon;
grant execute on function private.submit_checkin_response(uuid,jsonb) to authenticated;
create or replace function public.submit_checkin_response(p_request_id uuid,p_response jsonb)
returns uuid language sql volatile security invoker set search_path='' as $$ select private.submit_checkin_response(p_request_id,p_response) $$;
revoke all on function public.submit_checkin_response(uuid,jsonb) from public,anon;
grant execute on function public.submit_checkin_response(uuid,jsonb) to authenticated;

create or replace function public.record_assessment(
  p_organization_id uuid,
  p_patient_id uuid,
  p_assessed_at timestamptz,
  p_notes text,
  p_measurements jsonb,
  p_skinfolds jsonb
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_assessment uuid;
begin
  if not private.has_permission(p_organization_id, 'clinical.write') then raise exception 'not authorized'; end if;
  if jsonb_typeof(p_measurements) <> 'object' or jsonb_typeof(p_skinfolds) <> 'array' then raise exception 'invalid measurements'; end if;
  insert into public.assessments(organization_id,patient_id,professional_user_id,assessed_at,notes)
    values(p_organization_id,p_patient_id,(select auth.uid()),coalesce(p_assessed_at,now()),nullif(trim(p_notes),''))
    returning id into v_assessment;
  insert into public.measurements(
    organization_id,assessment_id,weight_kg,height_cm,waist_cm,abdomen_cm,hip_cm,arm_cm,thigh_cm,calf_cm,chest_cm,neck_cm,
    body_fat_pct,body_fat_mass_kg,lean_mass_kg,muscle_mass_kg,body_water_pct,visceral_fat_level,basal_metabolism_kcal,
    metabolic_age_years,bmi,waist_hip_ratio,waist_height_ratio,bmi_formula,waist_hip_formula,waist_height_formula
  ) values (
    p_organization_id,v_assessment,
    nullif(p_measurements->>'weight_kg','')::numeric,nullif(p_measurements->>'height_cm','')::numeric,
    nullif(p_measurements->>'waist_cm','')::numeric,nullif(p_measurements->>'abdomen_cm','')::numeric,
    nullif(p_measurements->>'hip_cm','')::numeric,nullif(p_measurements->>'arm_cm','')::numeric,
    nullif(p_measurements->>'thigh_cm','')::numeric,nullif(p_measurements->>'calf_cm','')::numeric,
    nullif(p_measurements->>'chest_cm','')::numeric,nullif(p_measurements->>'neck_cm','')::numeric,
    nullif(p_measurements->>'body_fat_pct','')::numeric,nullif(p_measurements->>'body_fat_mass_kg','')::numeric,
    nullif(p_measurements->>'lean_mass_kg','')::numeric,nullif(p_measurements->>'muscle_mass_kg','')::numeric,
    nullif(p_measurements->>'body_water_pct','')::numeric,nullif(p_measurements->>'visceral_fat_level','')::numeric,
    nullif(p_measurements->>'basal_metabolism_kcal','')::numeric,nullif(p_measurements->>'metabolic_age_years','')::integer,
    nullif(p_measurements->>'bmi','')::numeric,nullif(p_measurements->>'waist_hip_ratio','')::numeric,
    nullif(p_measurements->>'waist_height_ratio','')::numeric,p_measurements->>'bmi_formula',
    p_measurements->>'waist_hip_formula',p_measurements->>'waist_height_formula'
  );
  insert into public.skinfold_measurements(organization_id,assessment_id,site,millimeters,protocol)
    select p_organization_id,v_assessment,trim(item->>'site'),(item->>'millimeters')::numeric,nullif(trim(item->>'protocol'),'')
    from jsonb_array_elements(p_skinfolds) item
    where nullif(trim(item->>'site'),'') is not null and nullif(item->>'millimeters','')::numeric > 0;
  return v_assessment;
end;
$$;

create or replace function public.record_lab_exam(
  p_organization_id uuid,
  p_patient_id uuid,
  p_exam_date date,
  p_laboratory text,
  p_file_path text,
  p_file_mime_type text,
  p_notes text,
  p_marker jsonb
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_exam uuid;
begin
  if not private.has_permission(p_organization_id, 'clinical.write') then raise exception 'not authorized'; end if;
  insert into public.lab_exams(organization_id,patient_id,exam_date,laboratory,private_file_path,file_mime_type,source,notes)
    values(p_organization_id,p_patient_id,p_exam_date,nullif(trim(p_laboratory),''),p_file_path,p_file_mime_type,
      case when p_file_path is null then 'manual' else 'upload' end,nullif(trim(p_notes),''))
    returning id into v_exam;
  if nullif(trim(p_marker->>'name'),'') is not null then
    insert into public.lab_markers(organization_id,lab_exam_id,name,result,unit,reference_range,status,notes)
      values(p_organization_id,v_exam,trim(p_marker->>'name'),nullif(trim(p_marker->>'result'),''),
        nullif(trim(p_marker->>'unit'),''),nullif(trim(p_marker->>'reference_range'),''),
        nullif(trim(p_marker->>'status'),''),nullif(trim(p_marker->>'notes'),''));
  end if;
  return v_exam;
end;
$$;

create or replace function public.publish_nutrition_plan(
  p_organization_id uuid,
  p_plan_id uuid,
  p_snapshot jsonb,
  p_checksum text
) returns integer language plpgsql security invoker set search_path = '' as $$
declare v_plan public.nutrition_plans%rowtype; v_version integer;
begin
  if not private.has_permission(p_organization_id, 'clinical.write') then raise exception 'not authorized'; end if;
  if jsonb_typeof(p_snapshot) <> 'object' or nullif(trim(p_checksum),'') is null then raise exception 'invalid snapshot'; end if;
  select * into v_plan from public.nutrition_plans
    where organization_id = p_organization_id and id = p_plan_id and deleted_at is null
    for update;
  if not found then raise exception 'plan not found'; end if;
  v_version := v_plan.version;
  if exists(select 1 from public.nutrition_plan_versions where nutrition_plan_id = p_plan_id and version = v_version) then
    v_version := v_version + 1;
  end if;
  insert into public.nutrition_plan_versions(
    organization_id,nutrition_plan_id,patient_id,version,snapshot,published_by,checksum
  ) values(p_organization_id,p_plan_id,v_plan.patient_id,v_version,p_snapshot,(select auth.uid()),p_checksum);
  update public.nutrition_plans set status = 'published', published_at = now(), version = v_version
    where id = p_plan_id;
  return v_version;
end;
$$;

create or replace function public.issue_payment_receipt(
  p_organization_id uuid,
  p_payment_id uuid,
  p_payment_method text,
  p_paid_at timestamptz,
  p_file_path text,
  p_checksum text
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_payment public.payments%rowtype;
  v_patient public.patients%rowtype;
  v_profile public.profiles%rowtype;
  v_settings public.professional_settings%rowtype;
  v_receipt uuid;
begin
  if not private.has_permission(p_organization_id, 'finance.write') then raise exception 'not authorized'; end if;
  if p_payment_method not in ('pix','cash','card','transfer','other') then raise exception 'invalid payment method'; end if;
  select * into v_payment from public.payments
    where organization_id = p_organization_id and id = p_payment_id and deleted_at is null for update;
  if not found or v_payment.patient_id is null then raise exception 'payment not found'; end if;
  select * into v_patient from public.patients where organization_id = p_organization_id and id = v_payment.patient_id;
  select * into v_profile from public.profiles where id = (select auth.uid());
  select * into v_settings from public.professional_settings
    where organization_id = p_organization_id and user_id = (select auth.uid());
  update public.payments set status = 'paid', paid_at = coalesce(p_paid_at,now()), payment_date = coalesce(p_paid_at,now())::date,
    payment_method = p_payment_method, method = p_payment_method where id = p_payment_id;
  insert into public.receipts(
    organization_id,payment_id,patient_id,patient_name,patient_document,professional_name,professional_document,
    description,amount_cents,payment_method,paid_at,private_file_path,checksum,signature_applied,issued_by
  ) values(
    p_organization_id,p_payment_id,v_patient.id,v_patient.name,v_patient.cpf,
    coalesce(v_profile.professional_name,v_profile.full_name,'Profissional'),v_settings.crn,
    v_payment.description,v_payment.amount_cents,p_payment_method,coalesce(p_paid_at,now()),p_file_path,p_checksum,
    coalesce(v_settings.signature_enabled,false) and v_profile.signature_path is not null,(select auth.uid())
  ) returning id into v_receipt;
  return v_receipt;
end;
$$;

revoke all on function public.record_assessment(uuid,uuid,timestamptz,text,jsonb,jsonb) from public, anon;
revoke all on function public.record_lab_exam(uuid,uuid,date,text,text,text,text,jsonb) from public, anon;
revoke all on function public.publish_nutrition_plan(uuid,uuid,jsonb,text) from public, anon;
revoke all on function public.issue_payment_receipt(uuid,uuid,text,timestamptz,text,text) from public, anon;
grant execute on function public.record_assessment(uuid,uuid,timestamptz,text,jsonb,jsonb) to authenticated;
grant execute on function public.record_lab_exam(uuid,uuid,date,text,text,text,text,jsonb) to authenticated;
grant execute on function public.publish_nutrition_plan(uuid,uuid,jsonb,text) to authenticated;
grant execute on function public.issue_payment_receipt(uuid,uuid,text,timestamptz,text,text) to authenticated;

commit;
