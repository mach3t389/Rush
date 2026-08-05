-- Northbook accounting integration foundation.
-- All secrets are stored as SHA-256 hashes. Only the service-role API can read
-- the integration tables; Rush users authorize through the versioned API.

alter table studios
  add column if not exists accounting_mode text not null default 'native'
    check (accounting_mode in ('native', 'northbook')),
  add column if not exists accounting_currency text not null default 'CAD'
    check (accounting_currency ~ '^[A-Z]{3}$'),
  add column if not exists northbook_integration_enabled boolean not null default false;

create table if not exists northbook_integration_connections (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,
  installation_name text not null check (char_length(installation_name) between 1 and 100),
  created_by_user_id uuid not null references auth.users(id),
  scopes text[] not null,
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz,
  constraint northbook_connection_scopes check (
    scopes <@ array[
      'entities:read', 'billing_requests:read', 'billing_requests:write',
      'accounting:write', 'documents:write', 'delivery:write'
    ]::text[]
  )
);
create index if not exists northbook_connections_studio_idx
  on northbook_integration_connections(studio_id, status);

create table if not exists northbook_authorization_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  studio_id uuid not null references studios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  installation_name text not null,
  scopes text[] not null,
  code_challenge text not null,
  redirect_uri text not null check (redirect_uri = 'northbook://rush/callback'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists northbook_access_tokens (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references northbook_integration_connections(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists northbook_access_tokens_connection_idx
  on northbook_access_tokens(connection_id, expires_at);

create table if not exists northbook_refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references northbook_integration_connections(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  replaced_by_id uuid references northbook_refresh_tokens(id),
  created_at timestamptz not null default now()
);

create table if not exists northbook_billing_requests (
  id text primary key,
  studio_id uuid not null references studios(id) on delete cascade,
  client_id text not null,
  project_id text,
  title text not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  lines jsonb not null default '[]'::jsonb check (jsonb_typeof(lines) = 'array'),
  notes text,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'accepted', 'fulfilled', 'rejected', 'cancelled')),
  northbook_invoice_id text,
  rejection_reason text,
  created_by_user_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists northbook_billing_requests_studio_status_idx
  on northbook_billing_requests(studio_id, status, updated_at);

create table if not exists northbook_accounting_documents (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,
  northbook_invoice_id text not null,
  revision integer not null check (revision > 0),
  billing_request_id text references northbook_billing_requests(id),
  rush_client_id text not null,
  rush_project_id text,
  number text not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  issued_at timestamptz not null,
  due_at timestamptz,
  status text not null check (status in ('issued', 'paid', 'void')),
  void_reason text,
  line_items jsonb not null,
  subtotal_minor bigint not null check (subtotal_minor >= 0),
  taxes jsonb not null,
  total_minor bigint not null check (total_minor >= 0),
  paid_minor bigint not null check (paid_minor >= 0),
  pdf_object_key text,
  delivered_at timestamptz,
  viewed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (studio_id, northbook_invoice_id)
);
create index if not exists northbook_documents_project_idx
  on northbook_accounting_documents(studio_id, rush_project_id, issued_at desc);

create table if not exists northbook_accounting_document_revisions (
  studio_id uuid not null references studios(id) on delete cascade,
  northbook_invoice_id text not null,
  revision integer not null,
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  primary key (studio_id, northbook_invoice_id, revision)
);

create table if not exists northbook_project_summaries (
  studio_id uuid not null references studios(id) on delete cascade,
  project_id text not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  invoiced_minor bigint not null,
  collected_minor bigint not null,
  outstanding_minor bigint not null,
  expenses_minor bigint not null,
  margin_minor bigint not null,
  calculated_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (studio_id, project_id)
);

create table if not exists northbook_idempotency_keys (
  connection_id uuid not null references northbook_integration_connections(id) on delete cascade,
  idempotency_key text not null,
  request_hash text not null,
  status_code integer not null,
  response_body jsonb not null,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now(),
  primary key (connection_id, idempotency_key)
);

create table if not exists northbook_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  studio_id uuid not null references studios(id) on delete cascade,
  northbook_invoice_id text not null,
  idempotency_key text not null,
  recipient_email text,
  status text not null check (status in ('pending', 'delivered', 'failed')),
  provider_message_id text,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (studio_id, idempotency_key)
);

create table if not exists northbook_integration_audit_log (
  id bigint generated always as identity primary key,
  studio_id uuid not null references studios(id) on delete cascade,
  connection_id uuid references northbook_integration_connections(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists northbook_change_log (
  sequence bigint generated always as identity primary key,
  studio_id uuid not null references studios(id) on delete cascade,
  entity_type text not null check (entity_type in ('client', 'project', 'billing_request', 'invoice_delivery')),
  entity_id text not null,
  operation text not null check (operation in ('upsert', 'archive', 'delete')),
  payload jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists northbook_change_log_studio_sequence_idx
  on northbook_change_log(studio_id, sequence);
create index if not exists northbook_change_log_retention_idx
  on northbook_change_log(occurred_at);

create or replace function northbook_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists northbook_billing_requests_touch on northbook_billing_requests;
create trigger northbook_billing_requests_touch before update on northbook_billing_requests
for each row execute function northbook_touch_updated_at();

create or replace function northbook_capture_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  record_json jsonb;
  record_id text;
  record_studio uuid;
  change_operation text;
begin
  if tg_op = 'DELETE' then
    record_json := to_jsonb(old);
    record_id := old.id::text;
    record_studio := old.studio_id;
    change_operation := 'delete';
  else
    record_json := to_jsonb(new);
    record_id := new.id::text;
    record_studio := new.studio_id;
    change_operation := 'upsert';
  end if;
  insert into northbook_change_log(studio_id, entity_type, entity_id, operation, payload)
  values (record_studio, tg_argv[0], record_id, change_operation, record_json);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists northbook_clients_changes on clients;
create trigger northbook_clients_changes after insert or update or delete on clients
for each row execute function northbook_capture_change('client');

drop trigger if exists northbook_projects_changes on projects;
create trigger northbook_projects_changes after insert or update or delete on projects
for each row execute function northbook_capture_change('project');

drop trigger if exists northbook_billing_request_changes on northbook_billing_requests;
create trigger northbook_billing_request_changes after insert or update or delete on northbook_billing_requests
for each row execute function northbook_capture_change('billing_request');

alter table northbook_integration_connections enable row level security;
alter table northbook_authorization_codes enable row level security;
alter table northbook_access_tokens enable row level security;
alter table northbook_refresh_tokens enable row level security;
alter table northbook_billing_requests enable row level security;
alter table northbook_accounting_documents enable row level security;
alter table northbook_accounting_document_revisions enable row level security;
alter table northbook_project_summaries enable row level security;
alter table northbook_idempotency_keys enable row level security;
alter table northbook_delivery_attempts enable row level security;
alter table northbook_integration_audit_log enable row level security;
alter table northbook_change_log enable row level security;

create policy "studio members read billing requests" on northbook_billing_requests
  for select using (studio_id in (select my_studio_ids()));
create policy "studio members create billing requests" on northbook_billing_requests
  for insert with check (studio_id in (select my_studio_ids()));
create policy "studio members update draft billing requests" on northbook_billing_requests
  for update using (studio_id in (select my_studio_ids()) and status in ('draft', 'submitted'))
  with check (studio_id in (select my_studio_ids()));
grant select, insert, update on northbook_billing_requests to authenticated;

create policy "studio members read northbook documents" on northbook_accounting_documents
  for select using (studio_id in (select my_studio_ids()));
create policy "client contacts read northbook project documents" on northbook_accounting_documents
  for select using (rush_project_id is not null and is_client_contact_for_project(rush_project_id));
create policy "studio members read northbook summaries" on northbook_project_summaries
  for select using (studio_id in (select my_studio_ids()));
grant select on northbook_accounting_documents, northbook_project_summaries to authenticated;

create or replace function public.mark_northbook_document_viewed(p_invoice_id text)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_project_id text;
begin
  select rush_project_id into v_project_id
  from northbook_accounting_documents
  where northbook_invoice_id = p_invoice_id;
  if v_project_id is null or not is_client_contact_for_project(v_project_id) then
    raise exception 'forbidden';
  end if;
  update northbook_accounting_documents
  set viewed_at = coalesce(viewed_at, now()), updated_at = updated_at
  where northbook_invoice_id = p_invoice_id;
end;
$function$;
grant execute on function public.mark_northbook_document_viewed(text) to authenticated;

-- Token and audit tables intentionally have no authenticated-role policies.
-- The service role bypasses RLS and the API performs organisation/scope checks.
