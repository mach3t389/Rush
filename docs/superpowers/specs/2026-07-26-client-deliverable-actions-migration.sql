-- Lets a real client account (client_contacts, not a studio member) approve
-- or request corrections on a shared deliverable, without granting a
-- blanket UPDATE policy on `tasks` (which would let a client rewrite any
-- field — title, assignee, everything — not just approval state).
-- SECURITY DEFINER, mirrors the is_client_contact_for_project() precedent
-- already granted in 2026-07-15-client-access-migration.sql.
--
-- Run once in the Supabase SQL Editor.

create or replace function client_deliverable_action(p_task_id text, p_action text)
returns void
language plpgsql security definer as $$
declare
  v_project_id text;
  v_data jsonb;
begin
  if p_action not in ('approve', 'request_corrections') then
    raise exception 'invalid action: %', p_action;
  end if;

  select project_id, data into v_project_id, v_data from tasks where id = p_task_id;
  if v_project_id is null then
    raise exception 'task not found';
  end if;

  if not is_client_contact_for_project(v_project_id) then
    raise exception 'not authorized for this project';
  end if;

  if coalesce((v_data->>'deliverable')::boolean, false) is not true
     or coalesce((v_data->>'sharedWithClient')::boolean, true) is not true then
    raise exception 'task is not a shared deliverable';
  end if;

  if p_action = 'approve' then
    v_data := jsonb_set(jsonb_set(v_data, '{status}', '"ok"'), '{correctionsRequested}', 'false');
  else
    v_data := jsonb_set(v_data, '{correctionsRequested}', 'true');
  end if;

  update tasks set data = v_data where id = p_task_id;
end;
$$;

grant execute on function client_deliverable_action(text, text) to authenticated;
