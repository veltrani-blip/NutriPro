begin;
revoke all on function public.rls_auto_enable() from public, anon, authenticated, service_role;
commit;
