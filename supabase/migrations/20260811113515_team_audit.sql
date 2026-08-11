begin;

create or replace function private.audit_member_permission_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_logs(organization_id,actor_user_id,action,entity,entity_id,metadata)
  values(new.organization_id,(select auth.uid()),'team.permission.changed','organization_member',new.member_user_id,
    jsonb_build_object('permission',new.permission_key,'allowed',new.allowed));
  return new;
end;
$$;
revoke all on function private.audit_member_permission_change() from public,anon,authenticated;
create trigger member_permission_override_audit after insert or update on public.member_permission_overrides
for each row execute function private.audit_member_permission_change();

create or replace function private.audit_member_role_or_status_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.role is distinct from new.role or old.active is distinct from new.active then
    insert into public.audit_logs(organization_id,actor_user_id,action,entity,entity_id,metadata)
    values(new.organization_id,(select auth.uid()),'team.member.changed','organization_member',new.user_id,
      jsonb_build_object('role_before',old.role,'role_after',new.role,'active_before',old.active,'active_after',new.active));
  end if;
  return new;
end;
$$;
revoke all on function private.audit_member_role_or_status_change() from public,anon,authenticated;
create trigger organization_member_change_audit after update on public.organization_members
for each row execute function private.audit_member_role_or_status_change();

commit;
