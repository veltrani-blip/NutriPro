begin;
create table public.appointments (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), patient_id uuid not null references public.patients(id), professional_user_id uuid not null references auth.users(id),
 starts_at timestamptz not null, ends_at timestamptz not null, status text not null default 'scheduled' check(status in('scheduled','confirmed','completed','cancelled','no_show')),
 modality text not null default 'presencial' check(modality in('presencial','online')), notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint appointment_time_valid check(ends_at>starts_at)
);
create index appointments_org_start_idx on public.appointments(organization_id,starts_at);

create table public.clinical_records (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), patient_id uuid not null references public.patients(id), appointment_id uuid references public.appointments(id), professional_user_id uuid not null references auth.users(id),
 reason text, report text, evolution text, signs_symptoms text, conduct text, nutrition_diagnosis text, strategy text, guidance text, goals text, private_notes text, recommended_return date,
 version int not null default 1, finalized_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.anamneses (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), patient_id uuid not null references public.patients(id), professional_user_id uuid not null references auth.users(id),
 objective text, weight_history text, previous_diets text, medications text, supplements text, surgeries text, diagnosed_conditions text, family_history text,
 gi_notes text, sleep_notes text, hydration_notes text, activity_notes text, habits_notes text, routine_notes text, preferences text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.assessments (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), patient_id uuid not null references public.patients(id), assessed_at timestamptz not null default now(), professional_user_id uuid not null references auth.users(id), notes text, created_at timestamptz not null default now()
);
create table public.measurements (
 id uuid primary key default gen_random_uuid(), assessment_id uuid not null references public.assessments(id) on delete cascade, organization_id uuid not null references public.organizations(id),
 weight_kg numeric(7,3), height_cm numeric(6,2), waist_cm numeric(6,2), abdomen_cm numeric(6,2), hip_cm numeric(6,2), arm_cm numeric(6,2), thigh_cm numeric(6,2), calf_cm numeric(6,2), chest_cm numeric(6,2), neck_cm numeric(6,2), body_fat_pct numeric(5,2), muscle_mass_kg numeric(7,3), created_at timestamptz not null default now()
);
create table public.lab_exams (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), patient_id uuid not null references public.patients(id), exam_date date, laboratory text, private_file_path text, notes text, created_at timestamptz not null default now()
);
create table public.lab_markers (
 id uuid primary key default gen_random_uuid(), lab_exam_id uuid not null references public.lab_exams(id) on delete cascade, name text not null, result text, unit text, reference_range text, status text, notes text
);
create table public.foods (
 id uuid primary key default gen_random_uuid(), organization_id uuid references public.organizations(id), name text not null, category text, serving_description text, gram_weight numeric(9,3), kcal numeric(10,3), protein_g numeric(10,3), carbs_g numeric(10,3), fat_g numeric(10,3), fiber_g numeric(10,3), sodium_mg numeric(10,3), source text, is_custom boolean not null default true, created_at timestamptz not null default now()
);
create table public.nutrition_plans (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), patient_id uuid not null references public.patients(id), professional_user_id uuid not null references auth.users(id), title text not null, status text not null default 'draft' check(status in('draft','published','archived')), published_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.meals (
 id uuid primary key default gen_random_uuid(), plan_id uuid not null references public.nutrition_plans(id) on delete cascade, organization_id uuid not null references public.organizations(id), title text not null, meal_time time, sort_order int not null default 0, notes text
);
create table public.meal_items (
 id uuid primary key default gen_random_uuid(), meal_id uuid not null references public.meals(id) on delete cascade, organization_id uuid not null references public.organizations(id), food_id uuid references public.foods(id), description text not null, quantity numeric(10,3), unit text, gram_weight numeric(10,3), notes text, sort_order int not null default 0
);
create table public.substitutions (
 id uuid primary key default gen_random_uuid(), meal_item_id uuid not null references public.meal_items(id) on delete cascade, organization_id uuid not null references public.organizations(id), food_id uuid references public.foods(id), description text not null, quantity numeric(10,3), unit text, notes text
);
create table public.recipes (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), title text not null, description text, yield_text text, prep_minutes int, instructions text, photo_path text, category text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.recipe_ingredients (
 id uuid primary key default gen_random_uuid(), recipe_id uuid not null references public.recipes(id) on delete cascade, organization_id uuid not null references public.organizations(id), food_id uuid references public.foods(id), description text not null, quantity numeric(10,3), unit text, sort_order int not null default 0
);
create table public.documents (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), patient_id uuid references public.patients(id), type text not null, title text not null, private_file_path text not null, released_to_patient boolean not null default false, issued_at timestamptz not null default now(), created_by uuid not null references auth.users(id)
);
create table public.questionnaires (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), title text not null, description text, active boolean not null default true, created_at timestamptz not null default now()
);
create table public.questionnaire_fields (
 id uuid primary key default gen_random_uuid(), questionnaire_id uuid not null references public.questionnaires(id) on delete cascade, label text not null, field_type text not null, required boolean not null default false, sort_order int not null default 0, options jsonb
);
create table public.questionnaire_responses (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), questionnaire_id uuid not null references public.questionnaires(id), patient_id uuid not null references public.patients(id), answers jsonb not null, submitted_at timestamptz not null default now()
);
create table public.payments (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), patient_id uuid references public.patients(id), appointment_id uuid references public.appointments(id), description text not null, amount_cents bigint not null check(amount_cents>=0), due_date date, paid_at timestamptz, method text, status text not null default 'pending' check(status in('pending','paid','overdue','cancelled','partially_refunded','refunded')), gateway_reference text, created_at timestamptz not null default now()
);
create table public.expenses (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), category text not null, description text not null, amount_cents bigint not null check(amount_cents>=0), expense_date date not null, recurrence text, created_at timestamptz not null default now()
);
create table public.tasks (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), patient_id uuid references public.patients(id), assigned_user_id uuid references auth.users(id), title text not null, due_at timestamptz, priority text not null default 'normal', status text not null default 'open', created_at timestamptz not null default now()
);
create table public.notifications (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id), user_id uuid not null references auth.users(id), title text not null, body text, kind text not null, read_at timestamptz, created_at timestamptz not null default now()
);
create table public.feature_flags (
 id uuid primary key default gen_random_uuid(), key text not null unique, description text, enabled_by_default boolean not null default false, created_at timestamptz not null default now()
);

-- Clinical information is not readable by assistants by default.
do $$ declare t text; begin
  foreach t in array array['appointments','clinical_records','anamneses','assessments','measurements','lab_exams','lab_markers','foods','nutrition_plans','meals','meal_items','substitutions','recipes','recipe_ingredients','documents','questionnaires','questionnaire_fields','questionnaire_responses','payments','expenses','tasks','notifications','feature_flags'] loop
    execute format('alter table public.%I enable row level security',t);
  end loop;
end; $$;

create policy appointments_member on public.appointments for all to authenticated using(public.is_org_member(organization_id)) with check(public.is_org_member(organization_id));
create policy clinical_records_clinical on public.clinical_records for all to authenticated using(public.has_org_role(organization_id,array['owner','nutritionist']::public.member_role[])) with check(public.has_org_role(organization_id,array['owner','nutritionist']::public.member_role[]));
create policy anamneses_clinical on public.anamneses for all to authenticated using(public.has_org_role(organization_id,array['owner','nutritionist']::public.member_role[])) with check(public.has_org_role(organization_id,array['owner','nutritionist']::public.member_role[]));
create policy assessments_clinical on public.assessments for all to authenticated using(public.has_org_role(organization_id,array['owner','nutritionist']::public.member_role[])) with check(public.has_org_role(organization_id,array['owner','nutritionist']::public.member_role[]));
create policy measurements_clinical on public.measurements for all to authenticated using(public.has_org_role(organization_id,array['owner','nutritionist']::public.member_role[])) with check(public.has_org_role(organization_id,array['owner','nutritionist']::public.member_role[]));
create policy lab_exams_clinical on public.lab_exams for all to authenticated using(public.has_org_role(organization_id,array['owner','nutritionist']::public.member_role[])) with check(public.has_org_role(organization_id,array['owner','nutritionist']::public.member_role[]));

create policy lab_markers_clinical on public.lab_markers for all to authenticated using(exists(select 1 from public.lab_exams e where e.id=lab_exam_id and public.has_org_role(e.organization_id,array['owner','nutritionist']::public.member_role[]))) with check(exists(select 1 from public.lab_exams e where e.id=lab_exam_id and public.has_org_role(e.organization_id,array['owner','nutritionist']::public.member_role[])));
create policy foods_read on public.foods for select to authenticated using(organization_id is null or public.is_org_member(organization_id));
create policy foods_write_clinical on public.foods for insert to authenticated with check(organization_id is not null and public.has_org_role(organization_id,array['owner','nutritionist']::public.member_role[]));
create policy foods_update_clinical on public.foods for update to authenticated using(organization_id is not null and public.has_org_role(organization_id,array['owner','nutritionist']::public.member_role[])) with check(organization_id is not null and public.has_org_role(organization_id,array['owner','nutritionist']::public.member_role[]));
create policy nutrition_plans_clinical on public.nutrition_plans for all to authenticated using(public.has_org_role(organization_id,array['owner','nutritionist']::public.member_role[])) with check(public.has_org_role(organization_id,array['owner','nutritionist']::public.member_role[]));
create policy meals_clinical on public.meals for all to authenticated using(public.has_org_role(organization_id,array['owner','nutritionist']::public.member_role[])) with check(public.has_org_role(organization_id,array['owner','nutritionist']::public.member_role[]));
create policy meal_items_clinical on public.meal_items for all to authenticated using(public.has_org_role(organization_id,array['owner','nutritionist']::public.member_role[])) with check(public.has_org_role(organization_id,array['owner','nutritionist']::public.member_role[]));
create policy substitutions_clinical on public.substitutions for all to authenticated using(public.has_org_role(organization_id,array['owner','nutritionist']::public.member_role[])) with check(public.has_org_role(organization_id,array['owner','nutritionist']::public.member_role[]));
create policy recipes_member on public.recipes for all to authenticated using(public.is_org_member(organization_id)) with check(public.is_org_member(organization_id));
create policy recipe_ingredients_member on public.recipe_ingredients for all to authenticated using(public.is_org_member(organization_id)) with check(public.is_org_member(organization_id));
create policy documents_clinical on public.documents for all to authenticated using(public.has_org_role(organization_id,array['owner','nutritionist']::public.member_role[])) with check(public.has_org_role(organization_id,array['owner','nutritionist']::public.member_role[]));
create policy questionnaires_clinical on public.questionnaires for all to authenticated using(public.has_org_role(organization_id,array['owner','nutritionist']::public.member_role[])) with check(public.has_org_role(organization_id,array['owner','nutritionist']::public.member_role[]));

create policy questionnaire_fields_clinical on public.questionnaire_fields for all to authenticated using(exists(select 1 from public.questionnaires q where q.id=questionnaire_id and public.has_org_role(q.organization_id,array['owner','nutritionist']::public.member_role[]))) with check(exists(select 1 from public.questionnaires q where q.id=questionnaire_id and public.has_org_role(q.organization_id,array['owner','nutritionist']::public.member_role[])));
create policy questionnaire_responses_clinical on public.questionnaire_responses for all to authenticated using(public.has_org_role(organization_id,array['owner','nutritionist']::public.member_role[])) with check(public.has_org_role(organization_id,array['owner','nutritionist']::public.member_role[]));
create policy payments_finance on public.payments for all to authenticated using(public.has_org_role(organization_id,array['owner','nutritionist','assistant']::public.member_role[])) with check(public.has_org_role(organization_id,array['owner','nutritionist','assistant']::public.member_role[]));
create policy expenses_finance on public.expenses for all to authenticated using(public.has_org_role(organization_id,array['owner','nutritionist']::public.member_role[])) with check(public.has_org_role(organization_id,array['owner','nutritionist']::public.member_role[]));
create policy tasks_member on public.tasks for all to authenticated using(public.is_org_member(organization_id)) with check(public.is_org_member(organization_id));
create policy feature_flags_read on public.feature_flags for select to authenticated using(true);
create policy notifications_self on public.notifications for select to authenticated using(user_id=auth.uid());
create policy notifications_self_update on public.notifications for update to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
commit;
