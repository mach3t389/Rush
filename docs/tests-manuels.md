# Tests manuels à faire par l'utilisateur

Liste vivante des vérifications qui nécessitent que **toi** (pas Claude) les fasses, avec la raison à chaque fois. Mise à jour à chaque nouveau chantier.

## Pourquoi certaines choses ne peuvent pas être testées par Claude

Par règle de sécurité, Claude ne peut jamais créer de compte ni entrer un mot de passe — même dans un contexte de test, même si tu le demandes explicitement. Concrètement, ça veut dire :

- **Testable par Claude** : parcours en mode démo (comptes fictifs déjà connectés), lecture directe des données réelles dans Supabase, vérification du code, compilation, revue par des agents indépendants.
- **Nécessite toi** : toute inscription réelle (client ou membre d'équipe), tout ce qui touche à un mot de passe, et tout jugement visuel/subjectif (« est-ce que ça a l'air bien ? »).

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

---

## Autres fonctionnalités déjà livrées, en attente de test

- [ ] **Chapitres vidéo (extraction automatique depuis un fichier réel)** : livré le 2026-07-17 — marqueurs de chapitres sur la barre de lecture, boutons précédent/suivant, saisie manuelle du temps. Tout a été testé en direct SAUF l'extraction automatique elle-même, jamais essayée avec un vrai fichier exporté avec des chapitres (Premiere/Final Cut/DaVinci).
  - Pourquoi : aucun fichier de ce type n'était disponible pendant le développement. Le code ne plante jamais (repli propre sur « aucun chapitre trouvé » en cas de problème), mais la détection réelle n'est pas confirmée.
  - Comment tester : dépose un fichier vidéo avec chapitres dans une ressource vidéo (écran `VideoReview.tsx`), confirme que les chapitres apparaissent bien comme marqueurs/arrêts de navigation.

---

## Prochains chantiers (à compléter au fur et à mesure)

- Étape C — Tableau de bord client : pas encore commencée.
- Étape D — Bascule admin « voir comme » : pas encore commencée.
