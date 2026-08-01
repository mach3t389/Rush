-- Regroupement des notifications de commentaires : une notification non
-- lue peut désormais représenter plusieurs événements fusionnés plutôt
-- qu'un seul — ces 3 colonnes portent l'état nécessaire pour reconstruire
-- le texte affiché ("Sarah et 2 autres ont commenté « X »") à chaque fusion.
alter table notifications add column if not exists item_label text;
alter table notifications add column if not exists actor_names text[] default '{}';
alter table notifications add column if not exists count integer default 1;
