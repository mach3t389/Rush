-- Client-contact invitations. Run once in the Supabase SQL editor.
--
-- The invited person opens /invitation/:token completely unauthenticated —
-- no account, no session. Two security-definer functions handle that case
-- safely: get_client_invitation() returns only the single matched
-- invitation's public-facing fields (never the whole table), and
-- resolve_client_invitation() performs the accept/decline side-effects
-- (updating or removing the client_contacts row) atomically, so there's no
-- window where the invitation is marked resolved but the contact's status
-- wasn't actually updated. Same pattern already used for team invitations
-- (studio_invitations / get_studio_invitation / accept_studio_invitation).

create table client_invitations (
  token text primary key,
  studio_id uuid not null references studios(id) on delete cascade,
  client_id text not null,
  contact_id text not null,
  outcome text not null default 'pending',
  created_at timestamptz not null default now()
);

alter table client_invitations enable row level security;

-- Studio members manage invitations for their own studio (create, list, resend).
create policy "studio members manage their own client invitations" on client_invitations
  for all
  using (studio_id in (select id from studios where owner_user_id = auth.uid()))
  with check (studio_id in (select id from studios where owner_user_id = auth.uid()));

grant select, insert, update, delete on client_invitations to authenticated;
-- Deliberately no anon grant on the table itself — anonymous access to a
-- specific invitation goes only through the two functions below, so an
-- anonymous visitor can never enumerate other studios' pending invitations.

create or replace function get_client_invitation(p_token text)
returns table (
  outcome text,
  client_id text,
  client_name text,
  contact_id text,
  contact_name text,
  portal_permissions jsonb,
  studio_name text
)
language sql security definer as $$
  select ci.outcome, ci.client_id, c.name, ci.contact_id, cc.name, cc.portal_permissions, s.name
  from client_invitations ci
  join clients c on c.id = ci.client_id
  join client_contacts cc on cc.id = ci.contact_id
  join studios s on s.id = ci.studio_id
  where ci.token = p_token;
$$;
grant execute on function get_client_invitation(text) to anon, authenticated;

create or replace function resolve_client_invitation(p_token text, p_outcome text)
returns void
language plpgsql security definer as $$
declare
  inv client_invitations%rowtype;
begin
  if p_outcome not in ('accepted', 'declined') then
    raise exception 'invalid_outcome';
  end if;

  select * into inv from client_invitations where token = p_token and outcome = 'pending';
  if not found then
    raise exception 'invalid_or_used_invitation';
  end if;

  if p_outcome = 'accepted' then
    update client_contacts set status = 'active' where id = inv.contact_id;
  else
    delete from client_contacts where id = inv.contact_id;
  end if;

  update client_invitations set outcome = p_outcome where token = p_token;
end;
$$;
grant execute on function resolve_client_invitation(text, text) to anon, authenticated;
