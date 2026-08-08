-- À exécuter manuellement dans Supabase → SQL Editor.
--
-- Le trigger northbook_capture_change() journalisait un instantané complet
-- (to_jsonb) de chaque client/projet à chaque insert/update/delete, pour
-- TOUS les studios — même ceux qui n'ont jamais connecté Northbook. Résultat :
-- northbook_change_log.payload (jsonb) grossissait sans fin avec l'usage
-- normal de l'app, sans aucune purge (aucune tâche planifiée n'existe pour
-- ça). Diagnostiqué le 2026-08-08 : 760 Mo de TOAST pour 22k lignes en 3,5
-- jours, alors qu'un seul studio avait une connexion Northbook "active".
--
-- Cette migration ajoute une garde : on ne journalise plus que pour les
-- studios ayant une connexion Northbook au statut 'active'. Zéro changement
-- côté app (le trigger et la table restent les mêmes, seule sa fonction est
-- redéfinie) — voir aussi la purge immédiate (TRUNCATE) exécutée séparément
-- pour libérer l'espace déjà accumulé.
create or replace function northbook_capture_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  record_json jsonb;
  record_id text;
  record_studio uuid;
  change_operation text;
begin
  if tg_op = 'DELETE' then
    record_studio := old.studio_id;
  else
    record_studio := new.studio_id;
  end if;

  -- Ne journaliser que pour les studios ayant réellement Northbook actif —
  -- sinon on paie le coût de stockage d'une intégration jamais utilisée.
  if not exists (
    select 1 from northbook_integration_connections
    where studio_id = record_studio and status = 'active'
  ) then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    record_json := to_jsonb(old);
    record_id := old.id::text;
    change_operation := 'delete';
  else
    record_json := to_jsonb(new);
    record_id := new.id::text;
    change_operation := 'upsert';
  end if;
  insert into northbook_change_log(studio_id, entity_type, entity_id, operation, payload)
  values (record_studio, tg_argv[0], record_id, change_operation, record_json);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
