begin;

create or replace function public.duplicate_plan_meal(
  p_organization_id uuid,
  p_meal_id uuid
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_source public.meals%rowtype;
  v_new_meal uuid;
  v_item record;
  v_new_item uuid;
begin
  if not private.has_permission(p_organization_id, 'clinical.write') then raise exception 'not authorized'; end if;
  select * into v_source from public.meals
    where organization_id=p_organization_id and id=p_meal_id for share;
  if not found then raise exception 'meal not found'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_source.plan_id::text,0));
  insert into public.meals(organization_id,plan_id,title,meal_time,sort_order,notes,day_of_week,alternative_group)
    values(p_organization_id,v_source.plan_id,v_source.title||' (cópia)',v_source.meal_time,
      (select coalesce(max(sort_order),-1)+1 from public.meals where organization_id=p_organization_id and plan_id=v_source.plan_id),
      v_source.notes,v_source.day_of_week,v_source.alternative_group)
    returning id into v_new_meal;
  for v_item in select * from public.meal_items where organization_id=p_organization_id and meal_id=p_meal_id order by sort_order,id loop
    insert into public.meal_items(organization_id,meal_id,food_id,recipe_id,description,quantity,unit,gram_weight,notes,sort_order)
      values(p_organization_id,v_new_meal,v_item.food_id,v_item.recipe_id,v_item.description,v_item.quantity,v_item.unit,v_item.gram_weight,v_item.notes,v_item.sort_order)
      returning id into v_new_item;
    insert into public.substitutions(organization_id,meal_item_id,food_id,description,quantity,unit,notes,sort_order)
      select p_organization_id,v_new_item,food_id,description,quantity,unit,notes,sort_order
      from public.substitutions where organization_id=p_organization_id and meal_item_id=v_item.id;
  end loop;
  return v_new_meal;
end;
$$;

create or replace function public.move_plan_meal(
  p_organization_id uuid,
  p_meal_id uuid,
  p_direction integer
) returns boolean language plpgsql security invoker set search_path = '' as $$
declare
  v_current public.meals%rowtype;
  v_neighbor public.meals%rowtype;
begin
  if not private.has_permission(p_organization_id, 'clinical.write') then raise exception 'not authorized'; end if;
  if p_direction not in (-1,1) then raise exception 'invalid direction'; end if;
  select * into v_current from public.meals where organization_id=p_organization_id and id=p_meal_id;
  if not found then raise exception 'meal not found'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_current.plan_id::text,0));
  if p_direction=-1 then
    select * into v_neighbor from public.meals where organization_id=p_organization_id and plan_id=v_current.plan_id
      and (day_of_week is not distinct from v_current.day_of_week)
      and (sort_order<v_current.sort_order or (sort_order=v_current.sort_order and id<v_current.id))
      order by sort_order desc,id desc limit 1;
  else
    select * into v_neighbor from public.meals where organization_id=p_organization_id and plan_id=v_current.plan_id
      and (day_of_week is not distinct from v_current.day_of_week)
      and (sort_order>v_current.sort_order or (sort_order=v_current.sort_order and id>v_current.id))
      order by sort_order,id limit 1;
  end if;
  if not found then return false; end if;
  update public.meals set sort_order=case when id=v_current.id then v_neighbor.sort_order else v_current.sort_order end
    where organization_id=p_organization_id and id in (v_current.id,v_neighbor.id);
  return true;
end;
$$;

revoke all on function public.duplicate_plan_meal(uuid,uuid) from public,anon;
revoke all on function public.move_plan_meal(uuid,uuid,integer) from public,anon;
grant execute on function public.duplicate_plan_meal(uuid,uuid) to authenticated;
grant execute on function public.move_plan_meal(uuid,uuid,integer) to authenticated;

commit;
