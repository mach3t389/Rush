# Briefs d'écrans — Claude Design
## Plateforme de gestion de production vidéo
### À utiliser avec le DESIGN_SYSTEM.md comme référence de style

---

## Instructions générales à donner à Claude Design en début de session

> "Je travaille sur une plateforme SaaS de gestion de production vidéo pour agences. Je vais te demander de créer plusieurs maquettes. Pour toutes les maquettes, applique le design system suivant : [coller ici le contenu de DESIGN_SYSTEM.md]. Thème sombre cinématographique, accent jaune #F9FF00, typographie Montserrat + IBM Plex Mono, surfaces en couches (#0c0c0b → #141413 → #1b1b19 → #232320)."

---

## Écran 1 — Vue Travail (sections + tâches)

### Brief à coller dans Claude Design :

> Crée une maquette desktop de la vue principale d'un projet vidéo — l'onglet "Travail".
>
> **Layout général :**
> - Sidebar gauche fixe (~220px) en #141413 avec : logo en haut, navigation principale (Mes tâches, Favoris, Clients, Projets récents, Calendrier, Notifications, Paramètres), éléments de nav en texte 13px Montserrat
> - Zone principale à droite sur fond #0c0c0b
>
> **Topbar de la zone principale :**
> - Breadcrumb : "Clients → Nova Films → Campagne Été 2025"
> - Onglets : Travail (actif, souligné accent jaune) | Ressources | Activité
> - Bouton primaire "Nouvelle tâche" en jaune #F9FF00 à droite
>
> **Phase Stepper sous la topbar :**
> - 4 phases en ligne : Préproduction (active, fond jaune #F9FF00, texte noir) | Production (inactive, fond #1b1b19) | Postproduction (inactive) | Livraison (inactive)
> - Chaque phase en badge rectangulaire arrondi, texte IBM Plex Mono uppercase 10px
>
> **Contenu principal — 3 sections verticales :**
>
> Section 1 "Préproduction" (dépliée) :
> - Header de section : flèche repliage + titre "Préproduction" Montserrat 600 + compteur "(4 tâches)" en texte-3 + barre de progression fine accent jaune à 75%
> - 3 lignes de tâches avec : checkbox rond | titre tâche | points de suspension (…) | avatar initiales | pill statut (une "Complété" vert, une "En cours" bleu, une "En attente" ambre) | pill priorité | date échéance en IBM Plex Mono
> - 1 sous-tâche indentée 24px sous la 2e tâche, même structure mais plus petite
>
> Section 2 "Production" (dépliée) :
> - 2 tâches visibles, dont une avec pill "En retard" rouge
>
> Section 3 "Postproduction" (repliée) :
> - Seulement le header visible
>
> **Style général :**
> - Fond de page #0c0c0b, cartes/sections sur #141413
> - Bordures rgba(255,255,255,0.09)
> - Rayons 14px pour les cartes, 9px pour les pills
> - Densité élevée mais aérée, pas de box-shadow sur les sections

---

## Écran 2 — Vue Ressources

### Brief à coller dans Claude Design :

> Crée une maquette desktop de l'onglet "Ressources" d'un projet vidéo.
>
> **Layout général :**
> - Même sidebar gauche que l'écran Travail
> - Même topbar avec onglets (Ressources actif cette fois)
>
> **Contenu principal — grille de ressources :**
>
> Rangée de filtres/actions en haut :
> - Bouton primaire "+ Nouvelle ressource" jaune à gauche
> - Filtres texte à droite : "Tous | Script | Document | Vidéo | Moodboard | Inspirations" en IBM Plex Mono uppercase 10px, celui actif en texte blanc
>
> Grille 2 colonnes de cartes de ressources (fond #141413, bordure rgba(255,255,255,0.09), radius 14px) :
>
> Carte 1 — Script :
> - Eyebrow IBM Plex Mono uppercase : "SCRIPT"
> - Titre : "Scénario Campagne Été — V3"
> - Séparateur fin
> - Footer : pill "Approuvé" vert + "Modifié il y a 2h" en texte-3 IBM Plex Mono + icône téléchargement
>
> Carte 2 — Vidéo Review :
> - Placeholder vidéo rayé (diagonales subtiles) avec label "VIDEO — V4" au centre en IBM Plex Mono
> - Titre : "Rough Cut — Séquence 1"
> - Footer : pill "En révision" mauve + "3 commentaires" + avatar 3 personnes empilés
>
> Carte 3 — Moodboard :
> - Miniature grille de 4 images placeholder en mosaïque
> - Titre : "Direction artistique"
> - Footer : pill "En cours" bleu + "12 références"
>
> Carte 4 — Document :
> - Icône document centré sur fond surface-2
> - Titre : "Brief créatif client"
> - Footer : pill "Validé" vert + "PDF · 2.4 Mo"
>
> Carte 5 — Checklist :
> - Barre de progression accent jaune à 60% en haut de la carte
> - Titre : "Checklist tournage"
> - Footer : "6/10 complétés" en texte-2 + date
>
> Carte 6 — Inspirations :
> - Grille 3×2 de petits placeholders image
> - Titre : "Références visuelles"
> - Footer : "8 références" + avatar auteur

---

## Écran 3 — Module Vidéo Review

### Brief à coller dans Claude Design :

> Crée une maquette desktop du module de révision vidéo. C'est la vue la plus importante et la plus dense de l'application.
>
> **Layout général :**
> - Sidebar gauche identique aux autres écrans
> - Zone principale divisée verticalement en deux parties
>
> **Partie haute (60% de hauteur) — Player vidéo :**
> - Grand placeholder vidéo 16:9 avec texture rayée diagonale subtile (#1b1b19)
> - Label "V4 — ROUGH CUT" en IBM Plex Mono uppercase centré
> - Contrôles player en bas : bouton play (rond, accent jaune), barre de progression avec quelques marqueurs de commentaires (petits triangles jaunes sur la timeline), temps actuel / durée totale en IBM Plex Mono
>
> **Barre de versions sous le player :**
> - Rangée horizontale de pills versions : "V1" (gris) | "V2" (gris) | "V3" (gris) | "V4" (jaune, actif) + bouton "+ Nouvelle version"
> - Chaque version avec son statut en dessous en texte-3
>
> **Partie basse (40% de hauteur) — Panneau commentaires :**
> - Onglets : "Commentaires (8)" | "Corrections (5)"
> - Liste de commentaires (onglet actif) :
>   * Commentaire 1 : avatar + nom + timestamp "00:42" en IBM Plex Mono jaune + texte commentaire + bouton "Créer une tâche" fantôme
>   * Commentaire 2 : même structure, timestamp "01:15"
>   * Commentaire 3 résolu : même structure mais légèrement désaturé + icône check vert
> - Zone de saisie en bas : input "Ajouter un commentaire..." + bouton send jaune
>
> **Colonne droite (~280px) — Informations de version :**
> - Titre de la version, date upload, uploadé par (avatar + nom)
> - Statut actuel : pill "En révision" mauve
> - Bouton "Demander approbation" primaire jaune (pleine largeur)
> - Bouton "Envoyer au client" secondaire (pleine largeur)
> - Séparateur
> - Section "Approbateurs" : 2-3 avatars avec statut (en attente / approuvé)

---

## Écran 4 — Portail Client

### Brief à coller dans Claude Design :

> Crée une maquette desktop du portail client — la vue que voit le client (pas l'équipe studio). Interface plus simple, sans sidebar de navigation interne.
>
> **Header fixe :**
> - Logo studio à gauche (carré jaune #F9FF00 + texte "StudioFlow" ou nom fictif)
> - Nom du projet au centre : "Campagne Été 2025 — Nova Films"
> - Nom du client connecté à droite + avatar initiales
>
> **Contenu principal — disposition en colonnes :**
>
> Colonne principale (70%) :
>
> Section "Livrable en attente de votre approbation" :
> - Fond légèrement différent (#141413), bordure accent jaune fine
> - Placeholder vidéo 16:9 avec bouton play
> - Titre : "Rough Cut Final — V4"
> - Date de partage en IBM Plex Mono texte-3
> - 2 boutons en bas côte à côte : "Approuver" (jaune primaire) + "Demander des corrections" (secondaire)
>
> Section "Historique des livrables" :
> - Liste de cartes précédentes versions avec statut :
>   * V3 — pill "Corrections demandées" rouge
>   * V2 — pill "Approuvé" vert
>   * V1 — pill "Approuvé" vert
>
> Colonne droite (30%) :
>
> Section "Corrections en cours" :
> - Liste de 3-4 corrections avec :
>   * Numéro (#1, #2, #3)
>   * Description courte de la correction
>   * Pill statut : "Intégré" vert | "En cours" bleu | "À faire" ambre
>
> Section "Contact studio" :
> - Avatar + nom chef de projet
> - Bouton "Envoyer un message"
>
> **Style général :**
> - Même thème sombre que le reste de l'app
> - Mais navigation simplifiée, pas de sidebar
> - Hiérarchie très claire : le liverable actif est dominant visuellement

---

## Écran 5 — Mes Tâches

### Brief à coller dans Claude Design :

> Crée une maquette desktop de la vue "Mes Tâches" — vue personnelle agrégant toutes les tâches assignées à l'utilisateur, tous projets confondus.
>
> **Layout général :**
> - Même sidebar gauche, "Mes tâches" est l'élément actif dans la nav (fond #1b1b19, texte blanc)
> - Zone principale sur fond #0c0c0b
>
> **Topbar de la vue :**
> - Titre "Mes tâches" Montserrat 700 grand
> - Sous-titre discret : "12 tâches assignées · 3 en retard" en IBM Plex Mono texte-3
> - Filtres à droite : "Aujourd'hui | Cette semaine | En retard | Tout" — filtre "Cette semaine" actif souligné accent jaune
>
> **Contenu — groupes de tâches par priorité :**
>
> Groupe "Urgente" (rouge) :
> - Header : petit carré rouge + "URGENTE" IBM Plex Mono uppercase + compteur "(2)"
> - 2 tâches :
>   * Ligne tâche : checkbox | titre tâche | badge projet "Nova Films" en pill neutre | pill statut "En retard" rouge | date "Hier" IBM Plex Mono rouge
>   * Ligne tâche : checkbox | titre | badge projet "Studio Intern" | pill "En cours" bleu | date "Aujourd'hui"
>
> Groupe "Élevée" (orange/warn) :
> - Header : carré ambre + "ÉLEVÉE" + compteur "(4)"
> - 3-4 tâches visibles avec mix de statuts et projets différents
>
> Groupe "Normale" :
> - Header : carré neutre + "NORMALE" + compteur "(6)"
> - 3 tâches visibles, le reste masqué par "Voir 3 de plus"
>
> **Style lignes de tâches :**
> - Fond transparent au repos, fond #1b1b19 au hover
> - Séparateur fin entre les tâches
> - Le badge projet est cliquable (aspect lien discret)
> - Checkbox rond avec bordure rgba(255,255,255,0.16)

---

## Écran 6 — Onboarding (Nouveau projet)

### Brief à coller dans Claude Design :

> Crée une maquette desktop de la modal/page de création d'un nouveau projet depuis un template. C'est le premier écran qu'un utilisateur voit après avoir cliqué "+ Nouveau projet".
>
> **Structure — modal large ou page dédiée :**
> - Fond semi-transparent derrière si modal (overlay sombre)
> - Container central (~800px de large, fond #141413, radius 20px, ombre importante)
>
> **En-tête du container :**
> - Titre "Nouveau projet" Montserrat 700
> - Sous-titre "Choisissez un template pour démarrer" texte-2
> - Bouton fermeture (×) en haut à droite
>
> **Section 1 — Choix du template (grille 3 colonnes) :**
>
> 6 cartes template (fond #1b1b19, radius 14px, bordure rgba(255,255,255,0.09)) :
>
> - Template 1 "Publicité courte" (sélectionné — bordure accent jaune + fond légèrement plus clair) : icône film + titre + description courte "4 phases · 12 tâches types · Checklist tournage"
> - Template 2 "Documentaire" : icône caméra + titre + description
> - Template 3 "Clip musical" : icône musique + titre + description
> - Template 4 "Film institutionnel" : icône bâtiment + titre + description
> - Template 5 "Motion design" : icône layers + titre + description
> - Template 6 "Projet vide" : icône plus + titre "Partir de zéro" + description "Aucun template"
>
> **Section 2 — Informations du projet :**
> - Champ "Nom du projet" (input standard fond #232320, bordure rgba(255,255,255,0.16), radius 9px)
> - Champ "Client" (dropdown avec recherche, même style)
> - Champ "Date de livraison prévue" (date picker, même style)
> - Toggle "Inviter le client au portail dès la création" (off par défaut)
>
> **Footer du container :**
> - Bouton secondaire "Annuler" à gauche
> - Bouton primaire "Créer le projet" jaune à droite (désactivé si aucun nom saisi)
>
> **Style général :**
> - Formulaire dense mais lisible
> - Labels en IBM Plex Mono uppercase 10px texte-3 au-dessus de chaque champ
> - États de focus : bordure rgba(255,255,255,0.26) + légère lueur

---

## Note d'utilisation

Pour chaque écran, si Claude Design s'éloigne du design system, rappelle-lui :
- Fond de page : #0c0c0b (pas noir pur, pas gris)
- Accent : #F9FF00 uniquement pour les actions primaires
- Texte corps : Montserrat, badges/statuts : IBM Plex Mono
- Pas de box-shadow sur les cartes ordinaires
- Bordures semi-transparentes rgba, jamais de bordures opaques en mode sombre
