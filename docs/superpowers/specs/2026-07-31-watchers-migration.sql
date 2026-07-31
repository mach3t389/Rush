-- Colonne de ciblage des notifications — remplace le flux partagé
-- studio-wide par une livraison par observateur. NULL/tableau vide =
-- aucun destinataire ciblé (ne devrait plus arriver une fois la Tâche 4
-- en place, mais reste lisible sans erreur en attendant).
alter table notifications add column if not exists recipient_ids text[] default '{}';

-- Index GIN pour accélérer le filtre "recipient_ids @> ARRAY[mon_id]"
-- utilisé à chaque lecture du flux de notifications par utilisateur.
create index if not exists notifications_recipient_ids_idx on notifications using gin (recipient_ids);

-- resources.watchers / invoices.watchers — ces deux tables mappent leurs
-- champs colonne par colonne (contrairement à tasks, qui stocke l'objet
-- entier dans une colonne jsonb `data`), donc Resource.watchers et
-- Invoice.watchers n'étaient jamais réellement persistés en session réelle :
-- la mise à jour optimiste du cache local masquait l'absence de colonne
-- jusqu'au prochain rechargement (même classe d'incident que sidebar_prefs,
-- 2026-07-12).
alter table resources add column if not exists watchers text[] default '{}';
alter table invoices  add column if not exists watchers text[] default '{}';
