# Tests manuels à faire par l'utilisateur

Liste vivante des vérifications qui nécessitent que **toi** (pas Claude) les fasses, avec la raison à chaque fois. Mise à jour à chaque nouveau chantier.

## Pourquoi certaines choses ne peuvent pas être testées par Claude

Par règle de sécurité, Claude ne peut jamais créer de compte ni entrer un mot de passe — même dans un contexte de test, même si tu le demandes explicitement. Concrètement, ça veut dire :

- **Testable par Claude** : parcours en mode démo (comptes fictifs déjà connectés), lecture directe des données réelles dans Supabase, vérification du code, compilation, revue par des agents indépendants.
- **Nécessite toi** : toute inscription réelle (client ou membre d'équipe), tout ce qui touche à un mot de passe, et tout jugement visuel/subjectif (« est-ce que ça a l'air bien ? »).

---

## Résumé — ce qu'il te reste à faire

Liste condensée de tout ce qui attend une action de ta part en ce moment (détails et « pourquoi » dans les sections ci-dessous) :

- [ ] Parcours client réel complet (Étape B/C) — inviter, accepter, vérifier `/mon-espace`. Exécuter d'abord la migration `2026-07-25-client-dashboard-events-rls-migration.sql`.
  - Note : à ne pas confondre avec « Voir en tant que » (Étape D) — ce dernier est une simulation admin déjà testée par Claude ; ce test-ci exige une vraie connexion client séparée (mot de passe réel), atteinte via `/mon-espace` après acceptation d'une invitation.
- [ ] Logo du studio sur les écrans d'invitation (nécessite un vrai logo uploadé).
- [ ] Chapitres vidéo — jamais testé avec un vrai fichier ayant des chapitres.
- [ ] Partage calendrier Google — refaire le test avec une adresse différente de la tienne.
- [ ] Formulaire public — parcours complet avec un vrai compte (fonction `file-storage` redéployée le 2026-08-03).

Tout le reste (Étapes A et D) a été testé par Claude en mode démo, rien en attente.

---

## Étape A — Niveaux d'accès (rôles internes)

- [x] Testé en direct par Claude (mode démo) — dropdown niveau d'accès, protection du propriétaire, formulaire d'invitation. Rien en attente de ta part.

## Étape B — Comptes clients réels

- [ ] **À refaire par toi, avec les 3 correctifs en place** : parcours complet client réel — inviter un contact client → accepter l'invitation (créer un compte) → confirmer l'atterrissage sur `/mon-espace` (pas dans l'espace studio) → confirmer que le bon projet apparaît → le retirer du projet côté studio → confirmer que l'accès disparaît vraiment.
  - Pourquoi : un premier test avait révélé de vrais bugs (déjà corrigés) — pas encore reconfirmé que tout fonctionne du premier coup avec les correctifs.
  - Astuce : utilise un e-mail différent de ton compte studio pour éviter la confusion des deux identités (déjà rencontrée une fois).

## Chantier de nettoyage (logo, mise en page, autorisations)

- [ ] **Logo du studio sur les écrans d'invitation** : uploader un logo (Paramètres → Personnalisation), générer un lien d'invitation (client ou équipe), l'ouvrir en navigation privée, confirmer que ton logo apparaît à la place de la marque Rush.
  - Pourquoi : ne peut pas être simulé en mode démo (nécessite une vraie session + un vrai logo uploadé).
- [x] Mise en page de la fiche membre — testé par Claude (mode démo, structure DOM confirmée).
- [x] Sélecteur d'autorisations en double — testé par Claude (mode démo, comportement confirmé).

## Étape C — Tableau de bord client

- [ ] **Parcours client complet** : connecte-toi avec un compte client réel (voir Étape B) → confirme que « Mes projets » affiche de vraies cartes (nom, progression, date) au lieu d'ID bruts → ouvre un projet → parcours les 4 onglets (Aperçu, Fichiers, Calendrier, Factures) → confirme qu'aucune action d'écriture n'est possible (pas de bouton créer/supprimer/modifier visible nulle part, y compris dans la vue Stockage des Fichiers et la liste des types d'événements du Calendrier) → invite un nouveau contact pour ce client → confirme qu'il voit immédiatement tous les projets existants du client sans intervention manuelle → crée un nouveau projet pour ce client → confirme que les contacts existants y ont accès automatiquement.
  - Pourquoi : nécessite un vrai compte client (mot de passe réel) — Claude ne peut jamais créer de compte ni entrer de mot de passe, même pour tester.
  - Rappel : exécute d'abord les deux migrations `docs/superpowers/specs/2026-07-25-client-dashboard-events-rls-migration.sql` (accès calendrier + types d'événements) dans Supabase → SQL Editor, sinon l'onglet Calendrier restera vide même avec des événements existants.

## Étape D — Bascule admin « voir comme »

- [x] Testé en direct par Claude (mode démo) — parcours complet des deux cas :
  - Membre interne (Julie Bernard, sans permission Finances/Clients) : bandeau affiché, liens masqués dans la barre latérale, **et** tentative d'atteindre `/finances`/`/clients` directement (simulant une URL tapée) → redirection automatique confirmée vers le tableau de bord. Sortie via « Quitter » → accès complet restauré.
  - Contact client (Sophie Blanc) : atterrit sur `/apercu-client/c1` avec de vraies cartes de projet, parcours des 4 onglets (Aperçu/Fichiers/Calendrier/Factures) avec les vraies données du studio, bandeau « Vous visualisez en tant que » visible sur toutes les pages (bug trouvé et corrigé en cours de route : le bandeau ne s'affichait pas du tout sur ces routes autonomes avant le correctif), sortie via « Quitter » fonctionnelle.
  - Rien en attente de ta part.

---

## Autres fonctionnalités déjà livrées, en attente de test

- [ ] **Chapitres vidéo (extraction automatique depuis un fichier réel)** : livré le 2026-07-17 — marqueurs de chapitres sur la barre de lecture, boutons précédent/suivant, saisie manuelle du temps. Tout a été testé en direct SAUF l'extraction automatique elle-même, jamais essayée avec un vrai fichier exporté avec des chapitres (Premiere/Final Cut/DaVinci).
  - Pourquoi : aucun fichier de ce type n'était disponible pendant le développement. Le code ne plante jamais (repli propre sur « aucun chapitre trouvé » en cas de problème), mais la détection réelle n'est pas confirmée.
  - Comment tester : dépose un fichier vidéo avec chapitres dans une ressource vidéo (écran `VideoReview.tsx`), confirme que les chapitres apparaissent bien comme marqueurs/arrêts de navigation.

## Partage de calendrier Google par projet

- [ ] **Confirmer la réception réelle de l'invitation Google Calendar** : ajoute un contact client avec une adresse courriel **différente** de ton compte Google connecté (un vrai client, ou un deuxième compte Gmail à toi), associe-le à un projet, active le partage du calendrier de ce projet, puis vérifie que **cette adresse-là** reçoit bien le courriel d'invitation de Google et peut ajouter le calendrier.
  - Pourquoi : le premier test (2026-07-25) utilisait un contact dont l'adresse était la même que le compte Google connecté — Google n'envoie jamais d'invitation au propriétaire du calendrier lui-même, donc ce cas ne prouve rien sur le vrai parcours d'un client externe.
  - Vérifie aussi, une fois le contact ajouté : le bouton calendrier (barre du haut de l'onglet Calendrier du projet) montre bien ce contact avec le statut « Partagé » (pas « En attente »).

## Formulaire — lien public réel

- [x] **Migration Supabase exécutée** (confirmé par toi le 2026-07-25) : table `form_submissions` + fonctions `get_public_form`/`submit_public_form`.
- [x] **Redéployer la fonction Supabase `file-storage`** : fait le 2026-08-03 (`supabase functions deploy file-storage`) — actions `form-sign-put`/`form-sign-get` maintenant en place pour l'upload de fichier depuis le formulaire public.
- [ ] **Parcours complet avec un vrai compte (pas démo)** : ouvre une ressource Formulaire → onglet Partager, copie le lien → ouvre ce lien dans une fenêtre de navigation privée (simulate un vrai visiteur externe, sans session) → remplis et soumets le formulaire, y compris une question « Upload de fichier » avec un vrai fichier → reviens dans l'app, confirme que la réponse apparaît bien dans l'onglet Réponses avec le bon nom/courriel/réponses, et que le fichier uploadé s'ouvre/télécharge correctement en cliquant dessus.
  - Pourquoi : vérifié en mode démo seulement (le lien public utilise alors le stockage local du même navigateur, ce qui simule mais ne prouve pas le vrai chemin Supabase RPC/Edge Function anonyme). Nécessite un vrai compte + la fonction redéployée ci-dessus.
  - Ce qui a déjà été testé par Claude (mode démo, en direct) : le lien public affiche le vrai titre/questions, la soumission s'enregistre (y compris un vrai fichier uploadé), et apparaît immédiatement dans l'onglet Réponses avec les bonnes réponses, le résumé statistique, et un lien de téléchargement fonctionnel pour le fichier joint.

---

## Stripe — passage en mode Live (paiement réel)

- [ ] **Parcours de paiement réel complet** : Paramètres → Plan et abonnement → choisir le plan Studio → aller jusqu'au bout sur la page Stripe Checkout (entrer une vraie carte et confirmer, pas juste ouvrir la page) → confirmer que l'app affiche bien "Studio" comme plan actif après redirection.
  - Pourquoi : le compte Stripe vient d'être basculé en mode Live (2026-08-04) — le circuit complet (clé secrète live, catalogue de prix live, webhook live) a été mis en place et vérifié techniquement, mais jamais éprouvé avec un vrai paiement de bout en bout.
  - Vérifier ensuite dans Stripe → Developers → Webhooks → destination "Rush production" → onglet "Event deliveries" : un événement `checkout.session.completed` doit apparaître avec un statut de succès (200).
- [ ] **Portail "Gérer mon abonnement"** : Paramètres → Facturation → confirmer que le bouton ouvre bien le portail Stripe hébergé et affiche le nouvel abonnement.
- [ ] **Annulation d'abonnement** : annuler depuis le portail Stripe → confirmer que l'app repasse bien en plan Gratuit après réception du webhook `customer.subscription.deleted`.
- [ ] **Remboursement du test** : une fois les tests ci-dessus validés, rembourser la transaction de test dans Stripe → Customers (Refund) pour ne pas rester facturé pour de vrai.
  - Rappel : l'organisation Meshwork a été remise à zéro le 2026-08-04 (plan Gratuit, aucun abonnement Stripe enregistré) suite à un ancien abonnement créé en mode Test devenu invalide après le passage en Live — voir mémoire `stripe-live-mode-migration-done`.

## Server-side plan gating (RLS backstop)

- [x] **Exécuter la migration** : exécutée avec succès le 2026-08-04 (deux corrections de type texte/uuid en cours de route, voir historique git).
- [x] **Spot-check normal (plan Gratuit)** : confirmé par toi le 2026-08-04 — tout fonctionne normalement en plan Gratuit après la migration.
- [ ] **Spot-check plan payant** : avec un studio réel en plan Studio/Agence, confirmer que créer une facture, un modèle, un projet, ou inviter un membre (dans la limite de sièges achetés) fonctionne toujours normalement.
  - Pourquoi : cette migration ajoute une protection invisible en usage normal (elle ne bloque que les tentatives de contournement de l'interface) — le vrai risque à tester est qu'elle bloque *aussi* par erreur un usage légitime.

## Modèle Client/Membre/Projet (chantier 2026-08-04)

- [ ] **Parcours complet réel** : avec un compte réel, créer un client, l'ouvrir, cliquer "Nouveau projet" (bouton déjà existant, vérifié fonctionnel), confirmer le client est pré-rempli. Ajouter des membres via la nouvelle recherche à l'étape "Membres" du même assistant, confirmer le bouton "Ajouter tous les contacts de [client]" fonctionne.
- [ ] **Transfert de client** : sur un projet réel ayant des membres qui sont aussi des contacts du client actuel, changer son client — confirmer que la question de confirmation apparaît et que les deux choix (retirer/garder l'accès) fonctionnent comme attendu.
- [ ] **Notification d'approbation réelle** : avec un compte réel, demander une approbation sur un projet où un seul des contacts du client a été ajouté comme membre — confirmer qu'un seul courriel part (pas tout le carnet du client).
- [ ] **Activité client réelle** : confirmer que l'onglet Activité d'une fiche client réelle montre maintenant de vrais événements (ou un état vide propre), pas un flux inventé.
- [ ] **Accès multi-clients sur un même projet** : dans l'assistant de création, choisir un client A pour la facturation, puis utiliser le raccourci "ajouter tous les contacts" d'un client B différent (via les puces de groupe). Confirmer que les contacts de B ont vraiment accès au projet dans leur portail — et que modifier ensuite l'équipe du projet (ajouter/retirer un membre) ne leur retire pas silencieusement cet accès.

## Prochains chantiers (à compléter au fur et à mesure)

- Étape C — Tableau de bord client : implémentée (2026-07-25), en attente de ton test réel ci-dessus.
- Étape D — Bascule admin « voir comme » : implémentée et testée en direct par Claude (2026-07-25). Rien en attente.
