-- Regroupement des notifications de commentaires : une notification non
-- lue peut désormais représenter plusieurs événements fusionnés plutôt
-- qu'un seul — ces 3 colonnes portent l'état nécessaire pour reconstruire
-- le texte affiché ("Sarah et 2 autres ont commenté « X »") à chaque fusion.
alter table notifications add column if not exists item_label text;
alter table notifications add column if not exists actor_names text[] default '{}';
alter table notifications add column if not exists count integer default 1;

-- Fusionner une nouvelle activité dans une notification déjà lue doit la
-- refaire apparaître comme non lue pour tous ses destinataires — mais le
-- client ne peut effacer que SES PROPRES lignes notification_reads (RLS
-- user_id = auth.uid()), jamais celles des autres. Cette fonction
-- contourne ça de façon contrôlée : elle ne fait qu'une chose (effacer les
-- lectures d'UNE notification précise) et vérifie que l'appelant appartient
-- bien au studio propriétaire avant d'agir, pour ne pas devenir un moyen
-- détourné d'effacer les lectures de n'importe qui.
create or replace function reset_notification_reads(notif_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from notification_reads
  where notification_id = notif_id
    and notification_id in (
      select id from notifications
      where studio_id in (
        select studio_id from studio_members where user_id = auth.uid()
      )
    );
end;
$$;

grant execute on function reset_notification_reads(text) to authenticated;
