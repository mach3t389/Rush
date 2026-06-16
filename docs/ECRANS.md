# Spécifications des écrans — Rush
## Plateforme de gestion de production vidéo

Référence de conception pour chaque écran de l'application. Se base sur [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) pour les tokens et composants.

---

## Sidebar — Structure commune à tous les écrans

Colonne fixe `~220px`, fond `#141413`, hauteur pleine page.

```
├── LOGO (padding 16px)
│   └── Carré jaune #F9FF00 (26px, radius 7px) + texte "Rush" Montserrat 900
│
├── NAVIGATION PRINCIPALE (padding 8px, gap 2px)
│   ├── Accueil
│   ├── Mes tâches
│   ├── Favoris (avec sous-items projets favoris)
│   ├── Clients
│   ├── Projets
│   └── Calendrier
│
├── SÉPARATEUR
│
├── PROJETS RÉCENTS (label IBM Plex Mono uppercase 10px texte-3)
│   └── Liste des projets récemment consultés
│
├── SÉPARATEUR
│
└── BAS DE SIDEBAR
    ├── Notifications (avec badge compteur jaune)
    ├── Paramètres
    └── Avatar + nom utilisateur
```

**Style des items nav :** icône 16px + texte 13px Montserrat 500 · repos `texte-2` fond transparent · hover `texte` fond `#1b1b19` · actif `texte` fond `#232320` bordure gauche 2px accent · radius 9px · padding `8px 12px`.

---

## Écran 1 — Vue Travail (projet)

Vue principale d'un projet — onglet "Travail". **Implémenté.**

**Topbar :**
- Breadcrumb : `Clients → [Client] → [Projet]`
- Onglets : Travail (actif, souligné accent) | Ressources | Activité
- Bouton primaire "+ Nouvelle tâche" jaune à droite

**Phase Stepper :**
- 4 phases en ligne : Préproduction | Production | Postproduction | Livraison
- Phase active : fond accent jaune, texte noir
- Phases inactives : fond `#1b1b19`
- Texte IBM Plex Mono uppercase 10px

**Sections de tâches (accordéon) :**
- Header section : flèche repliage + titre Montserrat 600 + compteur `(N tâches)` texte-3 + barre progression fine accent
- Ligne de tâche : checkbox rond | titre | avatar assigné | pill statut | pill priorité | date IBM Plex Mono
- Sous-tâches indentées 24px, même structure, taille réduite
- Statuts : Complété (ok) · En cours (info) · En attente (warn) · En retard (danger)

---

## Écran 2 — Vue Ressources (projet)

Onglet "Ressources" d'un projet — grille de fichiers et livrables. **Implémenté.**

**Filtres :**
- Tous | Script | Document | Vidéo | Moodboard | Inspirations (IBM Plex Mono uppercase 10px, actif texte blanc)
- Bouton "+ Nouvelle ressource" jaune à gauche

**Grille 2 colonnes de cartes ressources** (fond `#141413`, bordure `rgba(255,255,255,0.09)`, radius 14px) :

| Type | Visuel | Footer |
|------|--------|--------|
| Script | Label IBM Plex Mono centré | Pill statut + date modif |
| Vidéo | Placeholder rayé diagonal + label version | Pill statut + nb commentaires + avatars |
| Moodboard | Grille 4 miniatures | Pill statut + nb références |
| Document | Icône document centré | Pill statut + poids fichier |
| Checklist | Barre progression accent en haut | Fraction complétée + date |
| Inspirations | Grille 3×2 miniatures | Nb références + avatar auteur |

---

## Écran 3 — Module Vidéo Review

Vue de révision d'un livrable vidéo. **Implémenté.**

**Layout :**
- Zone principale divisée verticalement : player 60% / commentaires 40%
- Colonne droite `~280px` : informations de version

**Player vidéo :**
- Placeholder 16:9 avec label version IBM Plex Mono uppercase
- Contrôles : bouton play (rond accent jaune) + barre progression avec marqueurs de commentaires + timecode IBM Plex Mono

**Barre de versions :**
- Pills horizontales : V1 / V2 / V3 / V4 (active, jaune) + bouton "+ Nouvelle version"
- Statut de chaque version affiché en texte-3 sous sa pill

**Panneau commentaires :**
- Onglets : Commentaires (N) | Corrections (N)
- Ligne commentaire : avatar + nom + timecode IBM Plex Mono jaune + texte + bouton "Créer une tâche" fantôme
- Commentaire résolu : désaturé + icône check ok
- Input en bas : "Ajouter un commentaire..." + bouton send jaune

**Colonne droite :**
- Titre version + date upload + uploadé par
- Pill statut actuel
- Bouton "Demander approbation" jaune (pleine largeur)
- Bouton "Envoyer au client" secondaire (pleine largeur)
- Section "Approbateurs" : avatars + statut (en attente / approuvé)

---

## Écran 4 — Portail Client

Vue que voit le client (pas l'équipe studio). Navigation simplifiée, sans sidebar interne. **Implémenté.**

**Header fixe :**
- Logo studio à gauche + nom du projet au centre + nom client à droite

**Colonne principale (70%) :**

Section "Livrable en attente d'approbation" :
- Fond `#141413`, bordure accent fine
- Player 16:9 avec bouton play
- Titre + date de partage IBM Plex Mono texte-3
- Boutons : "Approuver" (jaune primaire) | "Demander des corrections" (secondaire)

Section "Historique des livrables" :
- Cards versions précédentes avec pills statut (Corrections demandées / Approuvé)

**Colonne droite (30%) :**
- Section "Corrections en cours" : liste numérotée avec pills statut (Intégré / En cours / À faire)
- Section "Contact studio" : avatar chef de projet + bouton "Envoyer un message"

---

## Écran 5 — Mes Tâches

Vue personnelle agrégeant toutes les tâches assignées à l'utilisateur, tous projets confondus. **Implémenté.**

**Topbar :**
- Titre "Mes tâches" + sous-titre "N tâches assignées · N en retard" IBM Plex Mono texte-3
- Filtres : Aujourd'hui | Cette semaine | En retard | Tout (actif souligné accent)

**Groupes par priorité :**

| Groupe | Indicateur couleur | Tâche affiche |
|--------|-------------------|---------------|
| Urgente | Danger rouge | Checkbox + titre + badge projet + pill statut + date IBM Plex Mono |
| Élevée | Warn ambre | Même structure |
| Normale | Neutre | Même structure, "Voir N de plus" si liste longue |

**Style lignes :** fond transparent · hover fond `#1b1b19` · séparateur fin entre tâches · checkbox rond bordure `rgba(255,255,255,0.16)` · badge projet cliquable.

---

## Écran 6 — Création de projet (modal)

Modal affiché après "+ Nouveau projet". **Partiellement implémenté** — la création depuis un template n'instancie pas encore les tâches.

**Container** : `~800px`, fond `#141413`, radius 20px, overlay sombre.

**Section 1 — Choix du template (grille 3 colonnes) :**
- 6 cartes template (fond `#1b1b19`, radius 14px)
- Template sélectionné : bordure accent jaune + fond légèrement plus clair
- Chaque carte : icône + titre + description courte (nb phases, nb tâches)
- Template "Projet vide" disponible pour partir de zéro

**Section 2 — Informations :**
- Champ "Nom du projet" (input fond `#232320`)
- Champ "Client" (dropdown avec recherche)
- Champ "Date de livraison prévue" (date picker)
- Toggle "Inviter le client au portail dès la création"

**Labels de champs** : IBM Plex Mono uppercase 10px texte-3.

**Footer :** Annuler (secondaire) | Créer le projet (jaune, désactivé si nom vide).

---

## Écran 7 — Accueil / Dashboard Studio

Première vue après connexion — vue d'ensemble de l'activité. **Implémenté.**

**Topbar :**
- Titre "Bonjour, [Prénom] 👋" Montserrat 700
- Sous-titre "Mardi 10 juin · 3 tâches urgentes aujourd'hui" IBM Plex Mono texte-3
- Bouton "+ Nouveau projet" jaune à droite

**Disposition 3 colonnes :**

Colonne gauche (40%) :
- Widget "Mes tâches du jour" : liste compacte de tâches du jour + lien "Voir toutes"
- Widget "Activité récente" : fil d'événements (avatar + description + timestamp IBM Plex Mono)

Colonne centrale (35%) :
- Widget "Projets en cours" : cartes projet compactes avec barres progression + phases + dates livraison

Colonne droite (25%) :
- 3 widgets chiffres clés : "Projets actifs" (accent jaune) · "En retard" (danger) · "Tâches cette semaine"
- Widget "Livrables en attente d'approbation" : miniatures vidéo + délai en rouge

---

## Écran 8 — Liste des clients

Vue globale de tous les clients du studio. **Implémenté.**

**Topbar :** Titre "Clients" + sous-titre "N clients actifs" + bouton "+ Nouveau client" jaune.

**Barre de recherche + filtres :** input large + pills Tous | Actifs | Archivés.

**Grille 3 colonnes de cartes clients** :
- Avatar 40px initiales (fond couleur unique au client) + nom Montserrat 600
- Eyebrow IBM Plex Mono : secteur · ville
- Métriques : nb projets actifs · nb livrables en attente · ancienneté
- Barre progression globale des projets
- Footer : pill statut (Actif / En pause) + date dernière activité
- Hover : boutons fantômes "Voir les projets" | "Contacter"

---

## Écran 9 — Fiche Client

Vue détaillée d'un client. **Implémenté.**

**Header bandeau :**
- Avatar grand 60px + nom Montserrat 700 + eyebrow IBM Plex Mono
- 3 métriques en ligne + boutons "Modifier" (secondaire) | "+ Nouveau projet" (jaune)

**Onglets :** Projets (actif) | Contacts | Activité | Documents.

**Contenu — onglet Projets :**
- Filtres : Tous | En cours | Complétés | Archivés
- Liste verticale de projets (pas grille) :
  - Titre + pill phase + barre progression + métriques (tâches, livrables, membres) + avatars + date livraison + pill statut + flèche navigation

---

## Écran 10 — Liste des projets

Vue globale de tous les projets, tous clients confondus. **Implémenté.**

**Topbar :** Titre "Projets" + sous-titre "N projets · N actifs · N en retard" + bouton "+ Nouveau projet" jaune.

**Barre de filtres :** recherche + pills (Tous / En cours / En retard / Complétés) + toggle vue grille / liste.

**Vue grille 3 colonnes :**
- Eyebrow IBM Plex Mono : nom client + phase
- Titre projet Montserrat 600
- Barre progression accent
- Métriques compactes + date livraison
- Avatars membres (3 max + "+N")
- Footer : pill statut + date modification IBM Plex Mono

**Statuts illustrés :** En cours · En retard (pill danger) · En attente client (warn) · Complété (désaturé) · Préproduction.

---

## Écran 11 — Notifications

Centre de notifications de l'utilisateur. **Implémenté.**

**Topbar :** Titre "Notifications" + bouton "Tout marquer comme lu" fantôme.

**Filtres :** Toutes | Non lues (actif) | Mentions | Approbations | Commentaires.

**Liste groupée par date** (Aujourd'hui / Hier / Cette semaine) :

Notification non lue : fond `#1b1b19` + bordure gauche 2px accent + point indicateur.
- Avatar + texte descriptif avec **nom de livrable en gras** + timestamp IBM Plex Mono
- Pill type (APPROBATION / NOUVELLE VERSION / COMMENTAIRE) + bouton action fantôme

Notification lue : fond normal, texte légèrement désaturé, pas de bordure gauche.

---

## Écran 12 — Paramètres

Configuration du studio et du compte. **Implémenté.**

**Sous-navigation paramètres (~200px, fond `#141413`) :**
- Groupe Studio : Informations studio (actif) · Équipe et membres · Portail client
- Groupe Compte : Profil · Notifications · Sécurité
- Groupe Facturation : Plan & abonnement · Historique

**Section "Informations studio" :**
- Formulaire : Nom du studio · Secteur d'activité · Site web · Adresse
- Labels IBM Plex Mono uppercase 10px texte-3
- Zone upload logo (bordure pointillée `rgba(255,255,255,0.16)`)
- Sélecteur "Couleur accent portail client" : input color natif + input hex manuel
- Bouton "Enregistrer les modifications" jaune

---

## Règles de cohérence transversale

- **Fond de page :** `#0c0c0b` — jamais noir pur ni gris
- **Fond sidebar et cartes :** `#141413`
- **Hover éléments interactifs :** `#1b1b19`
- **État actif :** `#232320`
- **Accent :** `#F9FF00` — uniquement actions primaires et indicateurs clés
- **Typographie corps :** Montserrat — **Badges/statuts/timestamps :** IBM Plex Mono
- **Bordures en mode sombre :** `rgba(255,255,255,0.09)` — jamais opaques
- **Radius cartes :** 14px — **Boutons/pills :** 9px–10px
- **Pas de box-shadow** sur les cartes ordinaires
