-- Ajoute un flag "modèles de départ déjà semés" par studio, pour ne jamais
-- reseeder après que l'utilisateur ait supprimé ses modèles.
alter table studios add column if not exists templates_seeded boolean not null default false;

-- Backfill : marquer comme "déjà semés" tout studio qui a DÉJÀ au moins un
-- modèle de projet personnalisé (signe qu'il utilise le système, pas la peine
-- de rien lui ajouter) — évite d'insérer les modèles de départ dans des
-- comptes actifs qui ont leur propre contenu depuis longtemps.
update studios s
set templates_seeded = true
where exists (
  select 1 from custom_project_templates t where t.studio_id = s.id
) or exists (
  select 1 from custom_resource_templates t where t.studio_id = s.id
);
