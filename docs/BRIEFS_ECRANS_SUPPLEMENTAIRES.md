# Briefs supplémentaires — Écrans structurels
## À ajouter à la session Claude Design existante

---

## Note importante — Sidebar complète

Dans TOUS les écrans suivants, la sidebar doit être identique et complète. Voici sa structure exacte à respecter :

```
Sidebar (#141413, ~220px de large, hauteur pleine page)
│
├── LOGO (haut, padding 16px)
│   └── Carré jaune #F9FF00 (26px, radius 7px) + texte "StudioFlow" Montserrat 900
│
├── NAVIGATION PRINCIPALE (padding 8px, gap 2px entre items)
│   ├── 🏠 Accueil          ← item nav standard
│   ├── ✓  Mes tâches       ← item nav standard
│   ├── ⭐ Favoris          ← item nav avec sous-items dépliés
│   │   ├──  · Nova Films   ← sous-item indenté, point coloré
│   │   └──  · Studio Bleu  ← sous-item indenté, point coloré
│   ├── 👥 Clients          ← item nav standard
│   ├── 📁 Projets          ← item nav standard
│   └── 📅 Calendrier       ← item nav standard
│
├── SÉPARATEUR fin (rgba(255,255,255,0.09))
│
├── SECTION "PROJETS RÉCENTS" (label IBM Plex Mono uppercase 10px texte-3)
│   ├── Campagne Été 2025   ← lien projet récent, texte-2 13px
│   ├── Clip Automne        ← lien projet récent
│   └── Docu Fondation      ← lien projet récent
│
├── SÉPARATEUR fin
│
└── BAS DE SIDEBAR (collé en bas)
    ├── 🔔 Notifications    ← avec badge compteur rond jaune "3"
    ├── ⚙️  Paramètres
    └── Avatar + Nom utilisateur + "Léa Marchand" texte-2 petit
```

**Style des items de navigation :**
- Icône 16px + texte 13px Montserrat 500
- Couleur repos : texte-2 (#aeaea6), fond transparent
- Couleur hover : texte (#f3f3ee), fond #1b1b19
- Couleur actif : texte (#f3f3ee), fond #232320, fine bordure gauche 2px accent jaune
- Radius 9px sur chaque item
- Padding 8px 12px

---

## Écran 7 — Accueil / Dashboard Studio

### Brief à coller dans Claude Design :

> Crée une maquette desktop de l'écran d'accueil du studio — la première vue après connexion. C'est une vue d'ensemble de l'activité en cours.
>
> **Layout général :**
> - Sidebar gauche complète (voir structure détaillée ci-dessus), "Accueil" est l'item actif
> - Zone principale sur fond #0c0c0b
>
> **Topbar :**
> - Titre "Bonjour, Léa 👋" Montserrat 700 grand
> - Sous-titre "Mardi 10 juin · 3 tâches urgentes aujourd'hui" en IBM Plex Mono texte-3
> - Bouton "+ Nouveau projet" jaune primaire à droite
>
> **Contenu — disposition en 3 colonnes :**
>
> Colonne gauche (40%) — Activité récente :
>
> Widget "Mes tâches du jour" (carte #141413, radius 14px) :
> - Header : titre "Aujourd'hui" + compteur "(5)"
> - 3 lignes de tâches compactes : checkbox + titre + badge projet pill neutre + statut
> - Lien "Voir toutes mes tâches →" en accent dim texte-2
>
> Widget "Activité récente" (carte #141413) :
> - Fil d'événements compact :
>   * Avatar + "Marie a approuvé V4 — Nova Films" + "il y a 12min" IBM Plex Mono texte-3
>   * Avatar + "Thomas a uploadé une nouvelle version" + "il y a 1h"
>   * Avatar + "Léa a créé 3 tâches — Clip Automne" + "il y a 2h"
>   * Avatar + "Client a laissé 2 commentaires" + "il y a 3h"
>
> Colonne centrale (35%) — Projets actifs :
>
> Widget "Projets en cours" (carte #141413) :
> - Header : "Projets actifs" + compteur "(6)"
> - 4 cartes projet compactes empilées, chacune :
>   * Nom projet + nom client en texte-3
>   * Barre de progression fine accent jaune (% avancement)
>   * Pills : phase actuelle (IBM Plex Mono) + statut
>   * Date livraison en IBM Plex Mono texte-3
> - Lien "Voir tous les projets →"
>
> Colonne droite (25%) — Indicateurs :
>
> 3 petits widgets empilés (fond #141413, radius 14px) :
>
> Widget 1 — Chiffre clé :
> - Grand chiffre "6" Montserrat 900 accent jaune
> - Label "Projets actifs" texte-2
>
> Widget 2 — Chiffre clé :
> - Grand chiffre "3" Montserrat 900 couleur danger
> - Label "En retard" texte-2
>
> Widget 3 — Chiffre clé :
> - Grand chiffre "12" Montserrat 900 texte
> - Label "Tâches cette semaine" texte-2
>
> Widget "Livrables en attente d'approbation" :
> - 2 items avec miniature vidéo placeholder + nom + "En attente depuis 2j" rouge

---

## Écran 8 — Liste des clients

### Brief à coller dans Claude Design :

> Crée une maquette desktop de la page "Clients" — liste de tous les clients du studio.
>
> **Layout général :**
> - Sidebar complète, "Clients" est l'item actif
> - Zone principale sur fond #0c0c0b
>
> **Topbar :**
> - Titre "Clients" Montserrat 700
> - Sous-titre "8 clients actifs" IBM Plex Mono texte-3
> - Bouton "+ Nouveau client" jaune primaire à droite
>
> **Barre de recherche + filtres :**
> - Input recherche large (fond #1b1b19, bordure rgba(255,255,255,0.09), radius 9px, icône loupe) : "Rechercher un client..."
> - Filtres pills à droite : "Tous" (actif, fond #232320) | "Actifs" | "Archivés"
>
> **Grille de cartes clients (3 colonnes) :**
>
> Chaque carte client (fond #141413, bordure rgba(255,255,255,0.09), radius 14px, padding 20px) :
>
> Carte 1 — Nova Films :
> - Avatar carré 40px avec initiales "NF" (fond coloré unique au client) + nom "Nova Films" Montserrat 600
> - Secteur : eyebrow IBM Plex Mono "PUBLICITÉ · PARIS"
> - Séparateur fin
> - Métriques en ligne : "4 projets actifs" · "2 livrables en attente" · "Depuis 2023"
> - Barre de progression fine : avancement global des projets
> - Footer : tag statut pill "Actif" vert + date "Dernière activité il y a 2h" texte-3
>
> Carte 2 — Studio Bleu :
> - Même structure, métriques différentes, pill "Actif"
>
> Carte 3 — Fondation Lumière :
> - Même structure, pill "En pause" ambre
>
> Cartes 4, 5, 6 similaires avec variations de statuts
>
> **Ligne d'action au survol d'une carte :**
> - 2 boutons fantômes apparaissent : "Voir les projets" | "Contacter"

---

## Écran 9 — Fiche Client

### Brief à coller dans Claude Design :

> Crée une maquette desktop de la fiche détaillée d'un client — vue après avoir cliqué sur un client dans la liste.
>
> **Layout général :**
> - Sidebar complète, "Clients" reste actif dans la nav
> - Breadcrumb topbar : "Clients → Nova Films"
> - Zone principale sur fond #0c0c0b
>
> **Header client (bandeau plein largeur, fond #141413, padding 24px) :**
> - Avatar grand (60px) avec initiales "NF" + fond coloré
> - Nom "Nova Films" Montserrat 700 grand
> - Eyebrow IBM Plex Mono "CLIENT · PUBLICITÉ · PARIS"
> - 3 métriques côte à côte : "6 projets" | "4 actifs" | "Client depuis Jan 2023"
> - Boutons à droite : "Modifier" (secondaire) + "Nouveau projet" (jaune primaire)
>
> **Onglets sous le header :**
> - Projets (actif, souligné accent jaune) | Contacts | Activité | Documents
>
> **Contenu — onglet Projets :**
>
> Filtres projets : "Tous | En cours | Complétés | Archivés"
>
> Liste de projets (pas grille — liste verticale) :
>
> Chaque ligne projet (fond #141413, radius 14px, padding 16px, gap 16px entre lignes) :
> - Titre projet Montserrat 600 + phase actuelle pill IBM Plex Mono
> - Barre de progression fine accent jaune (avancement %)
> - Métriques : "8 tâches" · "3 livrables" · "2 membres"
> - Rangée d'avatars (membres assignés, empilés)
> - Date livraison IBM Plex Mono texte-3 + pill statut
> - Flèche "→" à droite (action naviguer vers le projet)
>
> 4-5 projets visibles avec statuts variés

---

## Écran 10 — Liste des projets

### Brief à coller dans Claude Design :

> Crée une maquette desktop de la page "Projets" — vue globale de tous les projets du studio, tous clients confondus.
>
> **Layout général :**
> - Sidebar complète, "Projets" est l'item actif
> - Zone principale sur fond #0c0c0b
>
> **Topbar :**
> - Titre "Projets" Montserrat 700
> - Sous-titre "14 projets · 6 actifs · 3 en retard" IBM Plex Mono texte-3
> - Bouton "+ Nouveau projet" jaune primaire à droite
>
> **Barre de filtres :**
> - Input recherche + filtres pills : "Tous | En cours | En retard | Complétés"
> - Toggle vue à droite : icône grille (actif) | icône liste
>
> **Vue grille (3 colonnes) :**
>
> Chaque carte projet (fond #141413, bordure rgba(255,255,255,0.09), radius 14px) :
>
> - Header carte : eyebrow IBM Plex Mono "NOVA FILMS" texte-3 + pill phase "PRODUCTION"
> - Titre projet Montserrat 600 : "Campagne Été 2025"
> - Barre de progression accent jaune (65%)
> - Métriques compactes : "8 tâches restantes" · "Livraison 15 juin"
> - Rangée d'avatars membres (3 max + "+2" si plus)
> - Footer : pill statut + date "Modifié il y a 1h" IBM Plex Mono texte-3
>
> 6 cartes visibles avec statuts variés :
> - 2 en cours normaux
> - 1 avec pill "En retard" rouge visible
> - 1 avec pill "En attente client" ambre
> - 1 complété (légèrement désaturé)
> - 1 en préproduction

---

## Écran 11 — Notifications

### Brief à coller dans Claude Design :

> Crée une maquette desktop de la page Notifications — centre de notifications de l'utilisateur.
>
> **Layout général :**
> - Sidebar complète, "Notifications" est l'item actif (avec badge "3" jaune)
> - Zone principale sur fond #0c0c0b
>
> **Topbar :**
> - Titre "Notifications" Montserrat 700
> - Bouton "Tout marquer comme lu" fantôme à droite
>
> **Filtres :**
> - Pills horizontaux : "Toutes (12)" | "Non lues (3)" (actif) | "Mentions" | "Approbations" | "Commentaires"
>
> **Liste de notifications groupées par date :**
>
> Groupe "Aujourd'hui" (label IBM Plex Mono uppercase texte-3) :
>
> Notification 1 (non lue — fond légèrement plus clair #1b1b19, bordure gauche 2px accent jaune) :
> - Point bleu indicateur non-lu à gauche
> - Avatar Marie + texte : "Marie Dupont a approuvé la V4 de **Rough Cut — Nova Films**"
> - Timestamp "il y a 12 min" IBM Plex Mono texte-3
> - Pill type "APPROBATION" vert IBM Plex Mono
> - Bouton action "Voir le livrable →" fantôme
>
> Notification 2 (non lue) :
> - Avatar Thomas + "Thomas a uploadé une nouvelle version de **Clip Automne**"
> - Pill "NOUVELLE VERSION" bleu
>
> Notification 3 (non lue) :
> - Icône client + "Le client Nova Films a laissé 2 commentaires sur **V4 Rough Cut**"
> - Pill "COMMENTAIRE" mauve
>
> Groupe "Hier" :
> - 3-4 notifications lues (fond normal, pas de bordure gauche, texte légèrement plus pâle)
>
> Groupe "Cette semaine" :
> - 2-3 notifications lues supplémentaires

---

## Écran 12 — Paramètres

### Brief à coller dans Claude Design :

> Crée une maquette desktop de la page Paramètres — configuration du studio et du compte.
>
> **Layout général :**
> - Sidebar complète, "Paramètres" est l'item actif
> - Zone principale divisée : sous-navigation paramètres à gauche + contenu à droite
>
> **Sous-navigation paramètres (colonne ~200px, fond #141413) :**
> - Groupe "Studio" :
>   * Informations studio (actif, fond #232320)
>   * Équipe et membres
>   * Portail client (branding)
> - Groupe "Compte" :
>   * Profil
>   * Notifications
>   * Sécurité
> - Groupe "Facturation" :
>   * Plan & abonnement
>   * Historique
>
> **Contenu principal — "Informations studio" (actif) :**
>
> Titre de section "Informations studio" Montserrat 700 + description texte-2
>
> Formulaire (fond #141413, radius 14px, padding 24px) :
>
> - Champ "Nom du studio" : label IBM Plex Mono uppercase 10px texte-3 + input (fond #232320, bordure rgba(255,255,255,0.09), radius 9px) pré-rempli "StudioFlow Production"
> - Champ "Secteur d'activité" : dropdown même style
> - Champ "Site web" : input
> - Champ "Adresse" : textarea 3 lignes
>
> Section "Logo du studio" :
> - Zone upload rectangle pointillé (bordure rgba(255,255,255,0.16) pointillée, fond #1b1b19)
> - Icône upload + texte "Glissez votre logo ou cliquez pour parcourir" texte-2
> - Formats acceptés IBM Plex Mono texte-3 : "PNG, JPG · Max 2 Mo"
>
> Section "Couleur accent portail client" :
> - 6 swatches de couleur circulaires + swatch actif avec bordure blanche
>
> Bouton "Enregistrer les modifications" jaune primaire en bas à droite

---

## Rappel — Note d'utilisation

Si Claude Design s'éloigne des valeurs du design system, rappelle-lui :
- Fond de page : **#0c0c0b** (pas noir pur #000000, pas gris #111)
- Fond sidebar et cartes : **#141413**
- Éléments interactifs hover : **#1b1b19**
- États actifs : **#232320**
- Accent **uniquement** #F9FF00 pour les actions primaires et indicateurs clés
- Typographie corps : **Montserrat**, badges/statuts/timestamps : **IBM Plex Mono**
- Bordures en mode sombre : **rgba(255,255,255,0.09)** — jamais opaques
- Radius cartes : **14px**, boutons/pills : **9px–10px**
