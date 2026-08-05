-- Add Rush task synchronization to the stable Northbook v1 contract.
-- Task data remains Rush-owned; Northbook may only change its status.

alter table public.northbook_integration_connections
  drop constraint if exists northbook_connection_scopes;
alter table public.northbook_integration_connections
  add constraint northbook_connection_scopes check (
    scopes <@ array[
      'entities:read', 'tasks:write', 'billing_requests:read', 'billing_requests:write',
      'accounting:write', 'documents:write', 'delivery:write'
    ]::text[]
  );

alter table public.northbook_change_log
  drop constraint if exists northbook_change_log_entity_type_check;
alter table public.northbook_change_log
  add constraint northbook_change_log_entity_type_check
  check (entity_type in ('client', 'project', 'task', 'billing_request', 'invoice_delivery'));

drop trigger if exists northbook_tasks_changes on public.tasks;
create trigger northbook_tasks_changes
after insert or update or delete on public.tasks
for each row execute function public.northbook_capture_change('task');

create or replace function public.northbook_update_task_status(
  p_studio_id uuid,
  p_task_id text,
  p_status text
)
returns setof public.tasks
language sql
security definer
set search_path = public
as $function$
  update public.tasks
  set data = jsonb_set(
    jsonb_set(
      jsonb_set(coalesce(data, '{}'::jsonb), '{status}', to_jsonb(p_status), true),
      '{statusLabel}',
      to_jsonb(case p_status
        when 'warn' then 'À faire'
        when 'info' then 'En cours'
        when 'review' then 'En révision'
        when 'danger' then 'En retard'
        when 'ok' then 'Terminée'
        else 'Sans statut'
      end),
      true
    ),
    '{checked}',
    to_jsonb(p_status = 'ok'),
    true
  )
  where studio_id = p_studio_id
    and id = p_task_id
    and p_status = any(array['', 'warn', 'info', 'review', 'danger', 'ok']::text[])
  returning *;
$function$;

revoke all on function public.northbook_update_task_status(uuid, text, text) from public, anon, authenticated;
grant execute on function public.northbook_update_task_status(uuid, text, text) to service_role;

grant select on table public.tasks to service_role;
