# Idées de développement futur

Ce document regroupe des idées à long terme pour Rush — des choses à considérer **une fois le développement principal terminé et la commercialisation lancée**, pas des chantiers à court terme. Rien ici n'est planifié ni engagé.

---

## Messagerie unifiée + IA assistante (2026-07-08)

**L'idée de départ :** centraliser toutes les communications d'un studio à un seul endroit dans Rush, au lieu d'être éparpillées entre courriel, réseaux sociaux et appels vidéo.

### 1. Boîte de réception unifiée

Connecter dans Rush les canaux de communication utilisés par le studio :
- Courriel (Gmail, Outlook, etc.)
- Messenger
- Instagram (messages directs)
- Potentiellement d'autres plateformes selon la demande

Toutes les conversations arriveraient dans une seule vue, plutôt que de devoir ouvrir 4-5 applications différentes pour suivre les échanges avec les clients.

### 2. Création automatique de tâches à partir des conversations

Une fois les conversations centralisées, une IA analyserait leur contenu pour :
- Repérer quand une conversation fait référence à un projet ou un membre de l'équipe en particulier
- Créer automatiquement une tâche correspondante dans le bon projet, sans intervention manuelle

Exemple : un client écrit sur Instagram "est-ce qu'on peut avancer la date de livraison du montage ?" → l'IA détecte le projet concerné et crée une tâche de suivi pour l'équipe.

### 3. Transcription et conversion des appels vidéo

Étendre la même logique aux conférences vidéo générées depuis le calendrier des projets (actuellement via Jitsi, voir mémoire `online-meetings-jitsi`) :
- Générer automatiquement une transcription de chaque appel
- Laisser l'IA analyser cette transcription pour en extraire les tâches à faire, les décisions prises, les échéances mentionnées
- Créer les tâches correspondantes automatiquement, comme pour les messages

### Vision d'ensemble

L'objectif final : une IA qui accompagne toute la gestion de projet et les communications du studio — pas juste un chatbot ponctuel (comme l'assistant IA actuel), mais un véritable filet de sécurité qui lit tout ce qui se passe (messages, appels) et transforme ça en actions concrètes dans l'outil. Essentiellement, une secrétaire virtuelle intégrée à la plateforme.

**Pourquoi plus tard :** ça touche à plusieurs intégrations tierces complexes (API de messagerie, transcription audio, permissions/vie privée des clients), et ça n'a de sens qu'une fois que le cœur de la plateforme (gestion de projets, fichiers, finances) est stable et utilisé par de vrais studios — sinon on construit une fonctionnalité avancée sur des fondations encore mouvantes.

---

## Adaptation mobile, applications natives et desktop (2026-07-10)

**L'idée de départ :** Rush est aujourd'hui pensé pour un écran d'ordinateur — l'expérience sur téléphone ou tablette n'a pas été travaillée, et il n'existe aucune application native (mobile ou desktop).

### 1. Version web adaptative (responsive)

Adapter l'interface web actuelle pour qu'elle reste utilisable sur toutes les tailles d'écran :
- Téléphone (portrait et paysage)
- Tablette
- Ordinateur (déjà couvert aujourd'hui)

Ça touche potentiellement chaque écran de l'app (sidebar, tableaux de tâches, calendriers, éditeurs de fichiers) — un chantier large, à découper par section plutôt qu'à faire d'un coup.

### 2. Application mobile native (Android, potentiellement iOS)

Une fois la base web adaptative en place, envisager une vraie application mobile (Android en priorité, mentionné explicitement) — soit via un wrapper (ex. Capacitor) réutilisant le code web existant, soit une app native si les besoins de performance/notifications le justifient.

### 3. Application desktop

Envisager aussi une application desktop (ex. via Electron ou Tauri) pour une expérience installée, avec les avantages habituels (notifications système, accès hors-ligne partiel, raccourcis clavier natifs).

**Pourquoi plus tard :** c'est un chantier transversal qui touche tout l'app plutôt qu'une fonctionnalité isolée, et il est plus efficace de le faire une fois l'ensemble des écrans et flux stabilisés — adapter une interface qui bouge encore beaucoup signifierait refaire le travail plusieurs fois.

### 4. Vue tâches mobile épurée (style Rappels iOS)

Sur mobile spécifiquement, la vue des tâches ne devrait **pas** ressembler à Asana (formulaire de création avec dix champs visibles). Plutôt s'inspirer de l'app Rappels d'iPhone :
- Liste simple, ajout rapide en une ligne de texte
- Un petit bouton "i" (info) sur chaque tâche pour accéder aux détails complets (assigné, priorité, statut, date…) sans les afficher tous par défaut
- Priorité à la rapidité de saisie plutôt qu'à l'exhaustivité des champs visibles

---

## Nom de domaine personnalisé (2026-07-10)

**L'idée de départ :** acheter une URL personnalisée (ex. `rush.studio` ou équivalent) et la connecter à Vercel, au lieu de rester sur le domaine par défaut fourni par Vercel.

Concrètement :
- Acheter le domaine chez un registraire (ex. Namecheap, Google Domains, OVH)
- Le connecter au projet Vercel (configuration DNS + certificat SSL, gérés automatiquement par Vercel une fois les enregistrements pointés)

**Pourquoi plus tard :** c'est une étape de commercialisation/lancement plutôt qu'un chantier de développement — plus logique une fois l'app prête à être présentée publiquement sous son nom final.

---

## Projets personnels vs "Client" (2026-07-10)

**Le problème identifié :** l'app suppose que tout projet appartient à un "Client" (secteur d'activité, portail, facturation…). Pour des projets purement personnels, l'utilisateur a dû créer un faux client nommé "Projets personnels" comme contournement — ce n'est pas une fonctionnalité prévue, juste un bricolage qui fonctionne parce que rien n'empêche de créer un client fictif.

**Piste envisagée et rejetée :** renommer "Client" en "Équipe" pour couvrir aussi bien les vrais clients que les espaces personnels. **Rejetée** parce que "Équipe" désigne déjà deux choses différentes dans l'app (les membres internes du studio via `MonEquipe`, et les contacts d'un client via l'onglet "Équipe" d'une fiche client) — réutiliser le mot pour une troisième notion créerait de la confusion.

**Recommandation :** ne pas renommer l'entité — la **typer**. Garder "Client" comme terme par défaut (facturation, portail — le cas d'usage principal), mais permettre un type `Personnel`/`Interne` distinct :
- Permettre de créer un projet sans client réel, rattaché à un espace marqué comme personnel plutôt qu'à un faux client.
- Adapter l'UI selon le type : un espace personnel n'a pas besoin d'onglet Finances/Facturation, de portail client, ni de secteur d'activité — ces champs concernent uniquement la relation client réelle.
- Permettre de **basculer le type après coup** (Personnel ↔ Client) — un projet perso peut devenir un mandat facturé, et l'inverse arrive aussi. Ne pas supprimer les données propres au type client (secteur, contacts, factures) en repassant en Personnel : les garder en mémoire mais les cacher, pour ne rien perdre si l'utilisateur rebascule plus tard.

**Pourquoi plus tard :** ça touche la structure de données `Client`/`Project` et plusieurs écrans (fiche client, création de projet, filtres) — un chantier de fond à faire une fois le reste stabilisé, pas une retouche ponctuelle.

---

## Capture par photo + création automatique de tâches par l'IA (2026-07-12)

**L'idée de départ :** pouvoir prendre une photo de n'importe quel document ou information (note manuscrite, tableau blanc, document papier, etc.) et laisser l'IA en extraire le contenu pour :
- Créer automatiquement des tâches correspondantes
- Ajouter certaines informations dans les bons dossiers/projets

**Vérification avec l'utilisateur avant d'agir :** plutôt que de créer les tâches à l'aveugle, l'IA poserait des questions de clarification à l'utilisateur (à quel projet ça appartient, quelle priorité, etc.) puis présenterait un **récapitulatif** des tâches/informations qu'elle propose de créer, pour confirmation avant exécution — évite les erreurs de classement ou des tâches créées au mauvais endroit.

**Pourquoi plus tard :** ça demande une capacité de vision/OCR fiable côté IA, une logique de clarification interactive (pas juste un chatbot ponctuel), et n'a de sens qu'une fois que la gestion de tâches/dossiers de base est stable — comme les autres idées IA déjà notées plus haut (messagerie unifiée), c'est une couche avancée à construire sur des fondations solides, pas en parallèle.

---

*(D'autres idées pourront être ajoutées ici au fil des discussions.)*
