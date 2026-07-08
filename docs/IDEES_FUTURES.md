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

*(D'autres idées pourront être ajoutées ici au fil des discussions.)*
