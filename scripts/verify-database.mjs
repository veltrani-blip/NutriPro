import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import EmbeddedPostgres from 'embedded-postgres'

const workspace = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(workspace, 'supabase', 'migrations')
const tempRoot = await mkdtemp(path.join(tmpdir(), 'nutripro-postgres-'))
const databaseDir = path.join(tempRoot, 'data')
const port = 55432
const password = 'nutripro-local-verification'

const supabaseBootstrap = `
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end; $$;

create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  raw_app_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create or replace function auth.uid() returns uuid language sql stable set search_path = '' as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create or replace function auth.jwt() returns jsonb language sql stable set search_path = '' as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;
grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated;

create schema storage;
create table storage.buckets (
  id text primary key,
  name text not null unique,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null references storage.buckets(id) on delete cascade,
  name text not null,
  owner_id text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;
create or replace function storage.foldername(name text) returns text[] language sql immutable set search_path = '' as $$
  select string_to_array(name, '/')
$$;
grant usage on schema storage to anon, authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
grant execute on function storage.foldername(text) to anon, authenticated;
`

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function migrationFiles() {
  return (await readdir(migrationsDir))
    .filter((file) => file.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right))
}

async function applyMigrations(client, databaseName) {
  await client.query(supabaseBootstrap)
  for (const file of await migrationFiles()) {
    const sql = await readFile(path.join(migrationsDir, file), 'utf8')
    try {
      await client.query(sql)
      console.log(`[database:${databaseName}] migration ${file}: ok`)
    } catch (error) {
      error.message = `${file}: ${error.message}`
      throw error
    }
  }
}

async function asUser(client, userId, sql, params = [], claims = {}, commit = false) {
  await client.query('begin')
  try {
    await client.query('set local role authenticated')
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [userId])
    await client.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, ...claims })])
    const result = await client.query(sql, params)
    await client.query(commit ? 'commit' : 'rollback')
    return result
  } catch (error) {
    await client.query('rollback')
    throw error
  }
}

async function seedAndVerify(pg, databaseName) {
  const client = pg.getPgClient(databaseName, '127.0.0.1')
  await client.connect()
  const ids = {
    orgA: '10000000-0000-4000-8000-000000000001',
    orgB: '10000000-0000-4000-8000-000000000002',
    ownerA: '20000000-0000-4000-8000-000000000001',
    ownerB: '20000000-0000-4000-8000-000000000002',
    assistantA: '20000000-0000-4000-8000-000000000003',
    portalUser: '20000000-0000-4000-8000-000000000004',
    teamInvitee: '20000000-0000-4000-8000-000000000005',
    portalInvitee: '20000000-0000-4000-8000-000000000006',
    patientA: '30000000-0000-4000-8000-000000000001',
    patientA2: '30000000-0000-4000-8000-000000000002',
    patientB: '30000000-0000-4000-8000-000000000003',
    serviceA: '40000000-0000-4000-8000-000000000001',
    recordA: '50000000-0000-4000-8000-000000000001',
    documentA: '60000000-0000-4000-8000-000000000001',
    questionnaireA: '70000000-0000-4000-8000-000000000001',
    assignmentA: '70000000-0000-4000-8000-000000000002',
    checkinTemplateA: '80000000-0000-4000-8000-000000000001',
    checkinRequestA: '80000000-0000-4000-8000-000000000002',
    planA: '90000000-0000-4000-8000-000000000001',
    mealA: '90000000-0000-4000-8000-000000000002',
    mealItemA: '90000000-0000-4000-8000-000000000003',
    paymentA: 'a0000000-0000-4000-8000-000000000001',
  }

  await client.query(`
    insert into auth.users(id,email) values
      ('${ids.ownerA}','owner-a@example.test'),('${ids.ownerB}','owner-b@example.test'),
      ('${ids.assistantA}','assistant-a@example.test'),('${ids.portalUser}','patient@example.test'),
      ('${ids.teamInvitee}','nutritionist-invited@example.test'),('${ids.portalInvitee}','portal-invited@example.test');
    insert into public.organizations(id,name) values
      ('${ids.orgA}','Organização A'),('${ids.orgB}','Organização B');
    insert into public.organization_members(organization_id,user_id,role) values
      ('${ids.orgA}','${ids.ownerA}','owner'),('${ids.orgB}','${ids.ownerB}','owner'),
      ('${ids.orgA}','${ids.assistantA}','assistant');
    insert into public.patients(id,organization_id,responsible_user_id,name,status) values
      ('${ids.patientA}','${ids.orgA}','${ids.ownerA}','Paciente A','ativo'),
      ('${ids.patientA2}','${ids.orgA}','${ids.ownerA}','Paciente A2','ativo'),
      ('${ids.patientB}','${ids.orgB}','${ids.ownerB}','Paciente B','ativo');
    insert into public.patient_user_links(organization_id,patient_id,user_id)
      values ('${ids.orgA}','${ids.patientA}','${ids.portalUser}');
    insert into public.service_types(id,organization_id,name,duration_minutes,price_cents,modality)
      values ('${ids.serviceA}','${ids.orgA}','Consulta teste',60,20000,'hibrido');
    insert into public.clinical_records(id,organization_id,patient_id,professional_user_id,reason)
      values ('${ids.recordA}','${ids.orgA}','${ids.patientA}','${ids.ownerA}','Registro protegido');
    insert into public.documents(id,organization_id,patient_id,type,title,private_file_path,created_by,checksum)
      values ('${ids.documentA}','${ids.orgA}','${ids.patientA}','plan','Plano liberado','${ids.orgA}/${ids.patientA}/plano.pdf','${ids.ownerA}','checksum');
    insert into public.document_releases(organization_id,document_id,patient_id,released_by)
      values ('${ids.orgA}','${ids.documentA}','${ids.patientA}','${ids.ownerA}');
    insert into storage.objects(bucket_id,name)
      values ('patient-documents','${ids.orgA}/${ids.patientA}/plano.pdf');
    insert into public.questionnaires(id,organization_id,title,published_at,created_by)
      values ('${ids.questionnaireA}','${ids.orgA}','Questionário de acompanhamento',now(),'${ids.ownerA}');
    insert into public.questionnaire_fields(organization_id,questionnaire_id,label,field_type,required)
      values ('${ids.orgA}','${ids.questionnaireA}','Como você está?','text',true);
    insert into public.questionnaire_assignments(id,organization_id,questionnaire_id,patient_id,assigned_by,due_at)
      values ('${ids.assignmentA}','${ids.orgA}','${ids.questionnaireA}','${ids.patientA}','${ids.ownerA}',now()+interval '7 days');
    insert into public.checkin_templates(id,organization_id,name,frequency)
      values ('${ids.checkinTemplateA}','${ids.orgA}','Semanal','weekly');
    insert into public.checkin_requests(id,organization_id,patient_id,template_id,due_at)
      values ('${ids.checkinRequestA}','${ids.orgA}','${ids.patientA}','${ids.checkinTemplateA}',now()+interval '7 days');
    insert into public.professional_settings(organization_id,user_id,crn,crn_region)
      values ('${ids.orgA}','${ids.ownerA}','12345','CRN-3');
    insert into public.nutrition_plans(id,organization_id,patient_id,professional_user_id,title)
      values ('${ids.planA}','${ids.orgA}','${ids.patientA}','${ids.ownerA}','Plano transacional');
    insert into public.meals(id,organization_id,plan_id,title,sort_order)
      values ('${ids.mealA}','${ids.orgA}','${ids.planA}','Café da manhã',0);
    insert into public.meal_items(id,organization_id,meal_id,description,quantity,unit,sort_order)
      values ('${ids.mealItemA}','${ids.orgA}','${ids.mealA}','Banana',1,'unidade',0);
    insert into public.substitutions(organization_id,meal_item_id,description,quantity,unit,sort_order)
      values ('${ids.orgA}','${ids.mealItemA}','Mamão',1,'porção',0);
    insert into public.payments(id,organization_id,patient_id,description,amount_cents,due_date,status,payment_method,method,paid_at)
      values ('${ids.paymentA}','${ids.orgA}','${ids.patientA}','Consulta nutricional',25000,current_date,'paid','pix','pix',now());
    insert into public.integration_configs(organization_id,kind,provider,enabled,configured,secret_reference)
      values ('${ids.orgA}','payments','contract_gateway',true,true,'NUTRIPRO_PAYMENT_GATEWAY_API_KEY');
    insert into public.payment_intents(organization_id,payment_id,provider,provider_reference,idempotency_key,amount_cents,status)
      values ('${ids.orgA}','${ids.paymentA}','contract_gateway','charge-1','idempotency-1',25000,'pending');
  `)

  const allTablesRls = await client.query(`
    select count(*)::int as count
    from pg_class relation join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public' and relation.relkind = 'r' and not relation.relrowsecurity
  `)
  assert(allTablesRls.rows[0].count === 0, 'Há tabela pública sem RLS.')

  const unsafeMetadata = await client.query(`
    select count(*)::int as count from pg_policies
    where schemaname = 'public' and (coalesce(qual,'') || coalesce(with_check,'')) ilike '%user_metadata%'
  `)
  assert(unsafeMetadata.rows[0].count === 0, 'Policy usa user_metadata editável.')

  const publicDefiners = await client.query(`
    select proname from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public' and procedure.prosecdef
    order by proname
  `)
  assert(
    publicDefiners.rows.every(({ proname }) => ['book_public_appointment', 'bootstrap_organization', 'list_public_slots', 'payment_webhook_configuration', 'process_payment_webhook'].includes(proname)),
    `SECURITY DEFINER inesperada no schema public: ${publicDefiners.rows.map((row) => row.proname).join(', ')}`,
  )

  const unsafeDefinerPaths = await client.query(`
    select namespace.nspname, procedure.proname from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where procedure.prosecdef and not ('search_path=""' = any(coalesce(procedure.proconfig,'{}'::text[])))
  `)
  assert(unsafeDefinerPaths.rowCount === 0, `SECURITY DEFINER sem search_path vazio: ${unsafeDefinerPaths.rows.map((row) => `${row.nspname}.${row.proname}`).join(', ')}`)

  const ownPatient = await asUser(client, ids.ownerA, 'select id from public.patients where id = $1', [ids.patientA])
  assert(ownPatient.rowCount === 1, 'Nutricionista não acessou paciente da própria organização.')
  const crossTenant = await asUser(client, ids.ownerB, 'select id from public.patients where id = $1', [ids.patientA])
  assert(crossTenant.rowCount === 0, 'RLS permitiu leitura cross-tenant de paciente.')
  const crossTenantUpdate = await asUser(client, ids.ownerB, "update public.patients set name = 'violação' where id = $1 returning id", [ids.patientA])
  assert(crossTenantUpdate.rowCount === 0, 'RLS permitiu atualização cross-tenant por ID conhecido.')

  const assistantClinical = await asUser(client, ids.assistantA, 'select id from public.clinical_records where id = $1', [ids.recordA])
  assert(assistantClinical.rowCount === 0, 'Assistente acessou prontuário clínico.')
  let assistantWriteDenied = false
  try {
    await asUser(
      client,
      ids.assistantA,
      `insert into public.clinical_records(organization_id,patient_id,professional_user_id,reason)
       values ($1,$2,$3,'tentativa')`,
      [ids.orgA, ids.patientA, ids.assistantA],
    )
  } catch (error) {
    assistantWriteDenied = error.code === '42501'
  }
  assert(assistantWriteDenied, 'Assistente conseguiu gravar prontuário clínico.')
  await asUser(client,ids.ownerA,`insert into public.member_permission_overrides(organization_id,member_user_id,permission_key,allowed,granted_by)
    values($1,$2,'finance.read',true,$3)`,[ids.orgA,ids.assistantA,ids.ownerA],{},true)
  const permissionAudit=await client.query("select count(*)::int as count from public.audit_logs where organization_id=$1 and action='team.permission.changed' and entity_id=$2",[ids.orgA,ids.assistantA])
  assert(permissionAudit.rows[0]?.count===1,'Alteração de permissão não foi auditada pelo banco.')

  const portalOwn = await asUser(client, ids.portalUser, 'select id from public.patients where id = $1', [ids.patientA])
  const portalOther = await asUser(client, ids.portalUser, 'select id from public.patients where id = $1', [ids.patientA2])
  assert(portalOwn.rowCount === 1 && portalOther.rowCount === 0, 'Portal do paciente violou isolamento por paciente.')
  const portalDocument = await asUser(client, ids.portalUser, 'select id from public.documents where id = $1', [ids.documentA])
  assert(portalDocument.rowCount === 1, 'Portal não acessou documento explicitamente liberado.')
  const crossTenantStorage = await asUser(client, ids.ownerB, 'select id from storage.objects where name = $1', [`${ids.orgA}/${ids.patientA}/plano.pdf`])
  assert(crossTenantStorage.rowCount === 0, 'Storage permitiu leitura cross-tenant.')
  const portalStorage = await asUser(client, ids.portalUser, 'select id from storage.objects where name = $1', [`${ids.orgA}/${ids.patientA}/plano.pdf`])
  assert(portalStorage.rowCount === 1, 'Paciente não acessou arquivo explicitamente liberado.')

  const questionnaireSubmission = await asUser(
    client, ids.portalUser,
    'select public.submit_questionnaire_response($1,$2::jsonb) as id',
    [ids.assignmentA, JSON.stringify({ answer: 'Bem' })],
    { email: 'patient@example.test' }, true,
  )
  assert(questionnaireSubmission.rows[0]?.id, 'Portal não submeteu questionário atribuído.')
  const questionnaireState = await client.query('select status from public.questionnaire_assignments where id=$1', [ids.assignmentA])
  assert(questionnaireState.rows[0]?.status === 'answered', 'Questionário não foi finalizado atomicamente.')

  const checkinSubmission = await asUser(
    client, ids.portalUser,
    'select public.submit_checkin_response($1,$2::jsonb) as id',
    [ids.checkinRequestA, JSON.stringify({ weight_kg: '70.5', hunger: '5', satiety: '7', energy: '8', sleep: '6', comments: 'Tudo bem' })],
    { email: 'patient@example.test' }, true,
  )
  assert(checkinSubmission.rows[0]?.id, 'Portal não submeteu check-in atribuído.')
  const checkinState = await client.query('select status from public.checkin_requests where id=$1', [ids.checkinRequestA])
  assert(checkinState.rows[0]?.status === 'answered', 'Check-in não foi finalizado atomicamente.')

  await client.query(`
    insert into public.team_invitations(organization_id,email,role,token_hash,invited_by,expires_at)
      values ('${ids.orgA}','nutritionist-invited@example.test','nutritionist',encode(extensions.digest('team-token','sha256'),'hex'),'${ids.ownerA}',now()+interval '1 day');
    insert into public.patient_portal_invitations(organization_id,patient_id,email,token_hash,invited_by,expires_at)
      values ('${ids.orgA}','${ids.patientA2}','portal-invited@example.test',encode(extensions.digest('portal-token','sha256'),'hex'),'${ids.ownerA}',now()+interval '1 day');
  `)
  const acceptedTeam = await asUser(client, ids.teamInvitee, "select public.accept_team_invitation('team-token') as organization_id", [], { email: 'nutritionist-invited@example.test' }, true)
  assert(acceptedTeam.rows[0]?.organization_id === ids.orgA, 'Convite da equipe não foi aceito.')
  const teamMembership = await client.query('select role,active from public.organization_members where organization_id=$1 and user_id=$2', [ids.orgA,ids.teamInvitee])
  assert(teamMembership.rows[0]?.role === 'nutritionist' && teamMembership.rows[0]?.active, 'Aceite de equipe não criou membro correto.')
  const acceptedPortal = await asUser(client, ids.portalInvitee, "select public.accept_patient_portal_invitation('portal-token') as patient_id", [], { email: 'portal-invited@example.test' }, true)
  assert(acceptedPortal.rows[0]?.patient_id === ids.patientA2, 'Convite do portal não foi aceito.')
  const portalLink = await client.query('select active from public.patient_user_links where organization_id=$1 and patient_id=$2 and user_id=$3', [ids.orgA,ids.patientA2,ids.portalInvitee])
  assert(portalLink.rows[0]?.active, 'Aceite do portal não criou vínculo ativo.')

  const imported = await asUser(
    client, ids.ownerA,
    'select public.import_patients($1,$2,$3::jsonb) as id',
    [ids.orgA,'pacientes.csv',JSON.stringify([{row_number:2,raw_data:{nome:'Paciente Importado'},normalized_data:{name:'Paciente Importado',status:'ativo'},validation_errors:[]}])],
    { email: 'owner-a@example.test' }, true,
  )
  const importState = await client.query('select status,imported_rows from public.patient_imports where id=$1', [imported.rows[0]?.id])
  assert(importState.rows[0]?.status === 'completed' && importState.rows[0]?.imported_rows === 1, 'Importação transacional não concluiu corretamente.')

  const assessment = await asUser(
    client, ids.ownerA,
    'select public.record_assessment($1,$2,now(),$3,$4::jsonb,$5::jsonb) as id',
    [ids.orgA,ids.patientA,'Avaliação transacional',JSON.stringify({weight_kg:70,height_cm:170,bmi:24.22,bmi_formula:'peso / altura²'}),JSON.stringify([{site:'Tricipital',millimeters:12.5,protocol:'7 dobras'}])],
    {}, true,
  )
  const assessmentState = await client.query(`
    select
      (select count(*)::int from public.measurements where assessment_id=$1) as measurements,
      (select count(*)::int from public.skinfold_measurements where assessment_id=$1) as skinfolds
  `, [assessment.rows[0]?.id])
  assert(assessmentState.rows[0]?.measurements === 1 && assessmentState.rows[0]?.skinfolds === 1, 'Avaliação, medidas e dobras não foram gravadas atomicamente.')

  const labExam = await asUser(
    client, ids.ownerA,
    'select public.record_lab_exam($1,$2,current_date,$3,null,null,$4,$5::jsonb) as id',
    [ids.orgA,ids.patientA,'Laboratório teste','Sem interpretação automática',JSON.stringify({name:'Ferritina',result:'80',unit:'ng/mL',reference_range:'30-400',status:'normal'})],
    {}, true,
  )
  const labState = await client.query('select count(*)::int as markers from public.lab_markers where lab_exam_id=$1', [labExam.rows[0]?.id])
  assert(labState.rows[0]?.markers === 1, 'Exame e marcador não foram gravados atomicamente.')

  const planVersion = await asUser(
    client, ids.ownerA,
    'select public.publish_nutrition_plan($1,$2,$3::jsonb,$4) as version',
    [ids.orgA,ids.planA,JSON.stringify({plan:{id:ids.planA,title:'Plano transacional'},meals:[],totals:{}}),'checksum-plano'],
    {}, true,
  )
  const planState = await client.query('select status,version from public.nutrition_plans where id=$1', [ids.planA])
  assert(planVersion.rows[0]?.version === 1 && planState.rows[0]?.status === 'published', 'Publicação versionada do plano falhou.')
  const duplicatedMeal=await asUser(client,ids.ownerA,'select public.duplicate_plan_meal($1,$2) as id',[ids.orgA,ids.mealA],{},true)
  const duplicateState=await client.query(`select
    (select count(*)::int from public.meal_items where meal_id=$1) as items,
    (select count(*)::int from public.substitutions where meal_item_id in (select id from public.meal_items where meal_id=$1)) as substitutions`,[duplicatedMeal.rows[0]?.id])
  assert(duplicateState.rows[0]?.items===1&&duplicateState.rows[0]?.substitutions===1,'Duplicação transacional da refeição perdeu itens ou substituições.')

  const receipt = await asUser(
    client, ids.ownerA,
    'select public.issue_payment_receipt($1,$2,$3,now(),$4,$5) as id',
    [ids.orgA,ids.paymentA,'pix',`${ids.orgA}/${ids.patientA}/recibo.pdf`,'checksum-recibo'],
    {}, true,
  )
  const receiptState = await client.query('select payment_method,amount_cents from public.receipts where id=$1', [receipt.rows[0]?.id])
  assert(receiptState.rows[0]?.payment_method === 'pix' && Number(receiptState.rows[0]?.amount_cents) === 25000, 'Emissão transacional do recibo falhou.')

  const webhookConfigured=await client.query('select public.payment_webhook_configuration($1,$2) as enabled',[ids.orgA,'contract_gateway'])
  assert(webhookConfigured.rows[0]?.enabled===true,'Configuração do webhook não foi reconhecida.')
  const webhook=await client.query("select public.process_payment_webhook($1,$2,$3,$4,'payment.paid',$5,$6) as status",[ids.orgA,'contract_gateway','event-1','charge-1',25000,'payload-hash'])
  const webhookReplay=await client.query("select public.process_payment_webhook($1,$2,$3,$4,'payment.paid',$5,$6) as status",[ids.orgA,'contract_gateway','event-1','charge-1',25000,'payload-hash'])
  const webhookState=await client.query("select (select count(*)::int from public.payment_webhook_events where provider='contract_gateway' and provider_event_id='event-1') as events,(select count(*)::int from public.notifications where organization_id=$1 and kind='payment') as notifications",[ids.orgA])
  assert(webhook.rows[0]?.status==='processed'&&webhookReplay.rows[0]?.status==='duplicate'&&webhookState.rows[0]?.events===1&&webhookState.rows[0]?.notifications===3,'Webhook idempotente não conciliou ou notificou corretamente.')

  let staffDocumentDenied = false
  try { const result = await asUser(client,ids.ownerA,"update public.documents set title='Alterado' where id=$1 returning id",[ids.documentA]); staffDocumentDenied = result.rowCount === 0 } catch (error) { staffDocumentDenied = error.code === '42501' }
  assert(staffDocumentDenied,'Equipe conseguiu alterar documento emitido.')
  let immutableDocument = false
  try { await client.query("update public.documents set title='Alterado' where id=$1",[ids.documentA]) } catch (error) { immutableDocument = error.message.includes('immutable') }
  assert(immutableDocument,'Trigger não protegeu documento emitido contra acesso privilegiado.')

  const insertSql = `insert into public.appointments(
      organization_id,patient_id,professional_user_id,service_type_id,starts_at,ends_at,status,modality,entry_type,title
    ) values ($1,$2,$3,$4,'2030-01-10T13:00:00Z','2030-01-10T14:00:00Z','scheduled','online','appointment','Concorrência') returning id`
  const first = pg.getPgClient(databaseName, '127.0.0.1')
  const second = pg.getPgClient(databaseName, '127.0.0.1')
  await Promise.all([first.connect(), second.connect()])
  const attempts = await Promise.allSettled([
    first.query(insertSql, [ids.orgA, ids.patientA, ids.ownerA, ids.serviceA]),
    second.query(insertSql, [ids.orgA, ids.patientA2, ids.ownerA, ids.serviceA]),
  ])
  await Promise.all([first.end(), second.end()])
  assert(attempts.filter(({ status }) => status === 'fulfilled').length === 1, 'Double booking concorrente confirmou mais de uma reserva.')
  const rejected = attempts.find(({ status }) => status === 'rejected')
  const rejectionCode = rejected?.status === 'rejected' ? rejected.reason?.code : undefined
  const rejectionMessage = rejected?.status === 'rejected' ? rejected.reason?.message : undefined
  console.log(`[database] concorrência rejeitada com ${rejectionCode}: ${rejectionMessage}`)
  assert(rejectionCode === '23P01', 'Conflito concorrente não foi rejeitado pela exclusion constraint.')

  const criticalConstraints = await client.query(`
    select count(*)::int as count from pg_constraint
    where conname in ('appointments_no_professional_overlap','appointments_no_patient_overlap','appointments_patient_org_fk')
  `)
  assert(criticalConstraints.rows[0].count === 3, 'Constraints críticas de agenda/tenant ausentes.')

  await client.end()
  console.log('[database] RLS, RBAC, portal, convites, fluxos atômicos, storage e concorrência: ok')
}

const pg = new EmbeddedPostgres({
  databaseDir,
  user: 'postgres',
  password,
  port,
  persistent: false,
  onLog: () => {},
  onError: (message) => console.error('[postgres]', message),
})

try {
  await pg.initialise()
  await pg.start()
  for (const databaseName of ['nutripro_reset_1', 'nutripro_reset_2']) {
    await pg.createDatabase(databaseName)
    const client = pg.getPgClient(databaseName, '127.0.0.1')
    await client.connect()
    await applyMigrations(client, databaseName)
    await client.end()
    if (databaseName === 'nutripro_reset_1') await pg.dropDatabase(databaseName)
  }
  await seedAndVerify(pg, 'nutripro_reset_2')
  await pg.dropDatabase('nutripro_reset_2')
  console.log('[database] duas aplicações limpas de migrations: ok')
} finally {
  await pg.stop().catch(() => {})
  await rm(tempRoot, { recursive: true, force: true }).catch(() => {})
}
