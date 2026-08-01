-- Récap quotidien : préférence globale (pas par catégorie) + heure
-- choisie par l'utilisateur + horodatage du dernier récap envoyé (sert de
-- fenêtre d'agrégation et évite un double envoi si le service cron
-- externe appelle deux fois trop proches l'une de l'autre).
alter table notif_prefs add column if not exists digest_mode boolean default false;
alter table notif_prefs add column if not exists digest_hour integer default 8;
alter table notif_prefs add column if not exists last_digest_sent_at timestamptz;
