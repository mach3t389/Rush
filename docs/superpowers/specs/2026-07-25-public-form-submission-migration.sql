-- Real backing for the "Formulaire" resource type (ResourceDetail.tsx's
-- FormView): a public, unauthenticated link (/f/:resourceId) that anyone
-- can open to fill out a form, with the answers actually recorded and shown
-- in the resource's "Réponses" tab. Before this migration the whole feature
-- was cosmetic — the "Partager" button copied a hardcoded fake URL and the
-- Réponses tab showed fixed mock data (MOCK_RESPONSES in ResourceDetail.tsx).
--
-- MANUAL STEP REQUIRED: paste this whole file into Supabase → SQL Editor
-- and run it. Nothing in this project applies migrations automatically —
-- see CLAUDE.md's "Migrations Supabase" section.
--
-- Same shape as the client_invitations / studio_invitations "public token"
-- pattern (docs/superpowers/specs/2026-07-10-client-invitations-supabase-migration.sql):
-- an anonymous visitor has no auth.uid(), so reading the form's questions
-- and submitting an answer both go through security-definer functions
-- rather than direct table grants. Studio members read submissions
-- directly (RLS-scoped via studio_members), matching the read-only pattern
-- used by ai_usage (2026-07-13-ai-usage-migration.sql).

create table form_submissions (
  id uuid primary key default gen_random_uuid(),
  resource_id text not null,
  studio_id uuid not null references studios(id) on delete cascade,
  answers jsonb not null,
  respondent_name text,
  respondent_email text,
  submitted_at timestamptz not null default now()
);

alter table form_submissions enable row level security;

create policy "studio members read their own form submissions" on form_submissions
  for select
  using (studio_id in (select studio_id from studio_members where user_id = auth.uid()));

grant select on form_submissions to authenticated;
-- Deliberately no insert/update/delete grant for authenticated or anon on
-- the table itself — all writes go through submit_public_form below, which
-- resolves studio_id server-side from the resource row, so an anonymous
-- caller can never forge a studio_id and write into someone else's data.

-- Returns the public-facing fields of a form resource (title, description,
-- questions, whether to collect the respondent's name/email) or null if the
-- resource doesn't exist or isn't a form. resource_content.content is the
-- same JSON blob FormView persists via setResourceContent — see
-- app/src/screens/ResourceDetail.tsx's FormView for the shape
-- ({ questions, formTitle, formDesc, collectIdentity }).
create or replace function get_public_form(p_resource_id text)
returns jsonb
language sql security definer as $$
  select jsonb_build_object(
    'resourceId', r.id,
    'title', coalesce(rc.content->>'formTitle', r.title),
    'description', coalesce(rc.content->>'formDesc', ''),
    'collectIdentity', coalesce((rc.content->>'collectIdentity')::boolean, true),
    'questions', coalesce(rc.content->'questions', '[]'::jsonb)
  )
  from resources r
  left join resource_content rc on rc.resource_id = r.id
  where r.id = p_resource_id and r.type = 'form';
$$;

grant execute on function get_public_form(text) to anon, authenticated;

-- Records one submission. studio_id is resolved server-side from the
-- resource (never trusted from the client) — see comment on the table
-- grants above.
create or replace function submit_public_form(
  p_resource_id text,
  p_answers jsonb,
  p_respondent_name text default null,
  p_respondent_email text default null
)
returns void
language plpgsql security definer as $$
declare
  v_studio_id uuid;
begin
  select studio_id into v_studio_id from resources where id = p_resource_id and type = 'form';
  if v_studio_id is null then
    raise exception 'form_not_found';
  end if;

  insert into form_submissions (resource_id, studio_id, answers, respondent_name, respondent_email)
  values (p_resource_id, v_studio_id, p_answers, p_respondent_name, p_respondent_email);
end;
$$;

grant execute on function submit_public_form(text, jsonb, text, text) to anon, authenticated;
