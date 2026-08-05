-- À exécuter manuellement dans Supabase → SQL Editor. Remplace la fonction
-- accept_studio_invitation existante (spec 2026-07-15-access-level-migration.sql)
-- par une version à 4 arguments (les 3 derniers optionnels, compatibles avec
-- tout appel existant à 1 argument tant que le front n'est pas encore mis à
-- jour par la tâche suivante).

-- app/src/utils/initials.ts's algorithm, ported to SQL: first letter of each
-- whitespace-separated word, uppercased, max 2 characters. Replaces the old
-- `upper(left(name, 2))` (first two characters — wrong for any two-word name).
create or replace function public.compute_initials(p_name text)
returns text
language sql
immutable
as $function$
  select coalesce(
    upper(
      substr(split_part(trim(p_name), ' ', 1), 1, 1) ||
      case
        when split_part(trim(p_name), ' ', 2) <> ''
          then substr(split_part(trim(p_name), ' ', 2), 1, 1)
        else ''
      end
    ),
    '??'
  );
$function$;

create or replace function accept_studio_invitation(
  p_token text,
  p_name text default null,
  p_phone text default null,
  p_photo_url text default null
)
returns void
language plpgsql security definer as $$
declare
  inv studio_invitations%rowtype;
  u auth.users%rowtype;
  v_name text;
begin
  select * into inv from studio_invitations where token = p_token and status = 'pending';
  if not found then
    raise exception 'invalid_or_used_invitation';
  end if;

  select * into u from auth.users where id = auth.uid();

  if u.email is null or lower(u.email) <> lower(inv.email) then
    raise exception 'invitation_email_mismatch';
  end if;

  v_name := coalesce(nullif(trim(p_name), ''), u.raw_user_meta_data->>'full_name', inv.email);

  insert into studio_members (studio_id, user_id, name, email, role, initials, avatar_color, is_owner, permissions, access_level, phone, photo_url)
  values (
    inv.studio_id,
    auth.uid(),
    v_name,
    inv.email,
    inv.role,
    compute_initials(v_name),
    '#5c3d8f',
    false,
    inv.permissions,
    coalesce(inv.access_level, 'member'),
    nullif(trim(p_phone), ''),
    nullif(trim(p_photo_url), '')
  );

  update studio_invitations set status = 'accepted' where token = p_token;
end;
$$;
grant execute on function accept_studio_invitation(text, text, text, text) to authenticated;
