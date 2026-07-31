-- Colonne de ciblage des notifications — remplace le flux partagé
-- studio-wide par une livraison par observateur. NULL/tableau vide =
-- aucun destinataire ciblé (ne devrait plus arriver une fois la Tâche 4
-- en place, mais reste lisible sans erreur en attendant).
alter table notifications add column if not exists recipient_ids text[] default '{}';

-- Index GIN pour accélérer le filtre "recipient_ids @> ARRAY[mon_id]"
-- utilisé à chaque lecture du flux de notifications par utilisateur.
create index if not exists notifications_recipient_ids_idx on notifications using gin (recipient_ids);
