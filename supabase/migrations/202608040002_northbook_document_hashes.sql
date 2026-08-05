alter table northbook_accounting_documents
  add column if not exists snapshot_hash text;

alter table northbook_accounting_document_revisions
  add column if not exists snapshot_hash text;

alter table northbook_accounting_documents
  add constraint northbook_documents_snapshot_hash_format
  check (snapshot_hash is null or snapshot_hash ~ '^[a-f0-9]{64}$');

alter table northbook_accounting_document_revisions
  add constraint northbook_document_revisions_snapshot_hash_format
  check (snapshot_hash is null or snapshot_hash ~ '^[a-f0-9]{64}$');

create or replace function public.northbook_enforce_billing_currency()
returns trigger
language plpgsql
set search_path = public
as $function$
declare
  v_currency text;
begin
  select accounting_currency into v_currency from studios where id = new.studio_id;
  if v_currency is null or new.currency <> v_currency then
    raise exception using errcode = 'P0001', message = 'currency_mismatch';
  end if;
  return new;
end;
$function$;

drop trigger if exists northbook_billing_currency on northbook_billing_requests;
create trigger northbook_billing_currency
before insert or update of currency, studio_id on northbook_billing_requests
for each row execute function public.northbook_enforce_billing_currency();

drop policy if exists "studio members update draft billing requests" on northbook_billing_requests;
create policy "studio members update draft billing requests" on northbook_billing_requests
  for update using (studio_id in (select my_studio_ids()) and status in ('draft', 'submitted'))
  with check (studio_id in (select my_studio_ids()) and status in ('draft', 'submitted'));
