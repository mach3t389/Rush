-- 2026-07-16 — Fix found during Step B's live manual verification: accepting
-- a client invitation never carried the name the person actually typed at
-- registration through to their client_contacts row — it stayed whatever
-- the studio admin originally entered when creating the contact. This
-- mirrors accept_studio_invitation's own name handling (which DOES use
-- coalesce(u.raw_user_meta_data->>'full_name', ...)) — applying the same
-- pattern here.
--
-- MANUAL STEP REQUIRED: paste this into Supabase → SQL Editor and run it.
-- Same return type (void) as the existing function, so create or replace is
-- safe to run more than once.

create or replace function accept_client_invitation(p_token text)
returns void
language plpgsql security definer as $$
declare
  inv client_invitations%rowtype;
  contact_email text;
  u auth.users%rowtype;
begin
  select * into inv from client_invitations where token = p_token and outcome = 'pending';
  if not found then
    raise exception 'invalid_or_used_invitation';
  end if;

  select * into u from auth.users where id = auth.uid();
  if u.email is null then
    raise exception 'not_authenticated';
  end if;

  select email into contact_email from client_contacts where id = inv.contact_id;
  if contact_email is null or lower(u.email) <> lower(contact_email) then
    raise exception 'invitation_email_mismatch';
  end if;

  update client_contacts
    set user_id = auth.uid(),
        status = 'active',
        name = coalesce(u.raw_user_meta_data->>'full_name', name)
    where id = inv.contact_id;
  update client_invitations set outcome = 'accepted' where token = p_token;
end;
$$;
grant execute on function accept_client_invitation(text) to authenticated;
