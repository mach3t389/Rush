# Récap quotidien de notifications — design

## Constat

Depuis les chantiers 1 et 2, chaque commentaire/mention/demande
d'approbation envoie un courriel individuel (regroupé en un seul si
plusieurs événements rapprochés touchent le même item, mais un courriel
par groupe reste envoyé). Certains utilisateurs préfèrent ne recevoir
qu'un seul résumé par jour plutôt que des courriels au fil de l'eau. Ce
chantier ajoute cette option, sans construire de système de notification
parallèle — le récap se contente d'agréger ce que le système actuel
produit déjà.

**Contrainte de plateforme (vérifiée dans le code) :** le plan Vercel
gratuit est plafonné à 12 fonctions serverless, et `app/api/` en compte
déjà 12. Aucune nouvelle fonction n'est ajoutée par ce chantier — le mode
récap est une branche supplémentaire dans `app/api/send-email.ts`
existant, sélectionnée par son en-tête d'autorisation, exactement comme
`app/api/google-calendar-sync.ts` distingue déjà son appel cron
quotidien de ses appels utilisateur via `Authorization: Bearer
${CRON_SECRET}` (réutilise la même variable d'environnement, déjà
configurée).

## Design retenu

### Préférence utilisateur

Une nouvelle section dans Paramètres → Notifications, sous les 3
catégories existantes :

- Une case à cocher globale : **"Recevoir un récap quotidien plutôt que
  des courriels individuels"** — s'applique aux 3 catégories
  (commentaire/mention/approbation) en bloc, pas de réglage fin par
  catégorie pour cette option.
- Un sélecteur d'heure (0-23h, heure locale du studio) quand la case est
  cochée.

Deux nouvelles colonnes sur la table `notif_prefs` (actuellement
`user_id`, `prefs jsonb`) : `digest_mode boolean default false`,
`digest_hour integer default 8`. Champs globaux, pas de jsonb imbriqué —
cohérent avec le fait que ce sont des réglages de compte, pas des
préférences par type d'événement comme le reste de la table.

### Effet sur les courriels individuels

Quand `digest_mode` est activé pour un destinataire, **tous** ses
courriels individuels (commentaire/mention/approbation) sont coupés —
la vérification déjà en place dans `app/api/send-email.ts` (gate par
`eventKey`/`recipientUserId` contre `notif_prefs`, chantier 1) est
étendue : avant de vérifier `prefs[eventKey]?.email`, vérifier d'abord
`digest_mode` — s'il est vrai, sauter l'envoi inconditionnellement,
peu importe le réglage par catégorie. Les notifications en-app restent
inchangées (toujours en temps réel, seul le canal courriel est concerné).

### Déclenchement du récap

`app/api/send-email.ts` gagne une branche : si l'en-tête
`Authorization` correspond à `Bearer ${CRON_SECRET}`, la requête est
traitée comme un déclenchement de récap plutôt qu'un envoi de courriel
unique. Un service externe gratuit (cron-job.org — même mécanisme déjà
en place pour `google-calendar-sync.ts`, contournant la limite d'une
exécution par jour du cron natif Vercel Hobby) appelle cette route
**toutes les heures**. À chaque appel :

1. Résoudre l'heure actuelle (arrondie à l'heure).
2. Chercher tous les utilisateurs avec `digest_mode = true` et
   `digest_hour` égal à l'heure courante.
3. Pour chacun, agréger ses notifications (`comment`/`mention`/
   `approval`) depuis le dernier récap envoyé (nouveau champ
   `last_digest_sent_at` sur `notif_prefs`, mis à jour à chaque envoi —
   sert à la fois de fenêtre d'agrégation et de garde-fou contre un
   double envoi si le service externe appelle deux fois trop proches
   l'une de l'autre).
4. Envoyer un seul courriel condensé (voir gabarit ci-dessous), puis
   mettre à jour `last_digest_sent_at`.

### Contenu du courriel

Résumé condensé, pas une liste détaillée événement par événement :

> **Votre récap Rush**
> Depuis votre dernier récap : **5 commentaires**, **2 mentions**,
> **1 demande d'approbation**.
> [Voir le détail dans Rush →]

Si aucune activité depuis le dernier récap, aucun courriel n'est envoyé
pour cet utilisateur ce jour-là (pas de "récap vide").

## Hors scope

- Pas de réglage par catégorie pour le mode récap (tout ou rien, comme
  confirmé) — une évolution future pourrait le permettre, pas ce
  chantier.
- Pas de récap pour les factures (les commentaires de facture ne sont
  déjà pas ciblés par observateurs de façon aussi fine — cohérent avec
  la limitation déjà actée au chantier 1).
- Pas de nouvelle fonction Vercel — budget déjà plein, solution conçue
  spécifiquement pour rester dans les 12 fonctions existantes.
