# PRD — Plateforme de gestion de production vidéo
## Version 1.6 — Document de référence pour Claude Code

---

## 1. Vision du produit

Une plateforme SaaS qui remplace Asana + Google Docs + Frame.io + Pinterest + dossiers partagés pour les agences vidéo et studios de production. Tout est centralisé en un seul endroit : gestion des tâches, documents créatifs, révisions vidéo, et communication client.

**Problème central résolu** : Les équipes vidéo utilisent 4-6 outils différents, paient plusieurs abonnements, et perdent du temps à dupliquer les informations entre les plateformes.

**Utilisateurs cibles** : Agences vidéo, studios de production, agences marketing, équipes contenu interne.

**Inspirations** : Asana (tâches), Notion (documents), Frame.io (révisions vidéo).

---

## 2. Architecture produit

### 2.1 Hiérarchie des entités

```
Organisation
└── Équipes
    └── Clients
        └── Projets
            ├── Sections (phases de travail)
            │   └── Tâches
            │       └── Sous-tâches
            └── Ressources (livrables créatifs)
                └── Versions
                    └── Commentaires
```

### 2.2 Principe dual-axe

Chaque projet a deux univers parallèles :

- **Univers Travail** : sections, tâches, sous-tâches — ce qu'on doit *faire*
- **Univers Ressources** : livrables créatifs avec versionnage — ce qu'on *produit*

Les deux univers sont liés : un commentaire vidéo peut être converti en tâche, une tâche peut référencer une ressource.

---

## 3. Entités de données

### 3.1 Organisation
```
id, name, slug, logo_url, accent_color,
plan_id, storage_used_bytes, storage_limit_bytes,
created_at, updated_at
```

### 3.2 User
```
id, email, password_hash (Argon2id), name, avatar_url,
role (owner|admin|manager|collaborator|client),
locale, timezone, date_format, time_format,
two_factor_enabled, last_login_at,
created_at, updated_at
```

### 3.3 Team
```
id, organization_id, name, color, description,
created_at, updated_at
```

### 3.4 TeamMember
```
id, team_id, user_id, role, joined_at
```

### 3.5 Client
```
id, organization_id, name, industry, city, country,
logo_url, status (active|paused|archived),
created_at, updated_at
```

### 3.6 ClientUser
```
id, client_id, user_id, is_primary_contact
```

### 3.7 Project
```
id, organization_id, client_id, team_id,
name, description, status (active|completed|archived),
current_phase (preproduction|production|postproduction|delivery),
progress_percent, due_date, template_id,
created_by, created_at, updated_at
```

### 3.8 ProjectPermission (remplace ProjectMember)
```
id, project_id, user_id,
role (project_lead|contributor|viewer),
role_override (nullable — écrase le rôle global),
invited_by, created_at
```

### 3.9 Section
```
id, project_id, name, phase,
position (fractional index), is_collapsed,
created_at, updated_at
```

### 3.10 Task
```
id, project_id, section_id, parent_task_id (nullable),
title, description, status (todo|in_progress|in_review|done),
priority (urgent|high|normal|low),
assigned_to (user_id nullable),
due_date, completed_at,
position (fractional index),
created_by, created_at, updated_at
```

### 3.11 Tag / TaskTag
```
Tag: id, organization_id, name, color
TaskTag: id, task_id, tag_id
```

### 3.12 Resource
```
id, project_id, module_type (document|script|moodboard|inspiration|checklist|video_review),
title, status (draft|in_review|approved|rejected),
created_by, created_at, updated_at
```

### 3.13 ResourceVersion
```
id, resource_id, version_number,
file_url, file_size_bytes, mime_type,
status (draft|in_review|approved|rejected),
uploaded_by, created_at
```

### 3.14 Comment
```
id, resource_id, version_id, user_id,
comment_type (temporal|general|review_summary),
body, timestamp_marker (secondes, nullable),
is_resolved, converted_task_id (nullable),
created_at, updated_at
```

### 3.15 ReviewSession
```
id, resource_id, version_id,
started_by, started_at, closed_at
```

### 3.16 CorrectionItem
```
id, comment_id, task_id,
status (derived from Task.status),
created_at
```

### 3.17 Approval
```
id, resource_id, version_id, requested_by,
approver_id, status (pending|approved|rejected),
notes, decided_at, created_at
```

### 3.18 Notification
```
id, user_id, type, title, body,
related_entity_type, related_entity_id,
is_read, group_key, grouped_count, last_event_at,
created_at
```

### 3.19 SubscriptionPlan
```
id, organization_id, plan_name (free|solo|team|agency),
billing_cycle (monthly|yearly),
price_cents, member_limit, storage_limit_bytes,
stripe_subscription_id, status (active|trialing|past_due|canceled),
trial_ends_at, current_period_end
```

### 3.20 ModuleRegistry
```
id, module_type, display_name, icon,
schema_definition (JSON), supported_actions (JSON),
schema_version, is_active
```

### 3.21 LocalePreference
```
id, user_id, locale (fr|en), date_format, time_format, timezone
```

---

## 4. Rôles et permissions

### 4.1 Rôles globaux (organisation)

| Rôle | Description |
|------|-------------|
| `owner` | Propriétaire — accès total, gestion facturation |
| `admin` | Administration complète sauf facturation |
| `manager` | Gestion projets et équipes |
| `collaborator` | Travail sur les projets assignés |
| `client` | Accès portail client uniquement |

### 4.2 Rôles contextuels (projet)

| Rôle | Description |
|------|-------------|
| `project_lead` | Chef de projet — gestion complète du projet |
| `contributor` | Contribution aux tâches et ressources |
| `viewer` | Lecture seule |

### 4.3 Système de permissions à 3 niveaux

La résolution des permissions suit cet ordre (du plus spécifique au plus général) :

1. `ResourcePermission` — permission sur une ressource spécifique (avec `expires_at` pour accès temporaires)
2. `ProjectPermission.role_override` — override de rôle au niveau projet
3. Rôle global de l'organisation (défaut)

### 4.4 Matrice des permissions

| Action | Owner | Admin | Manager | Collaborator | Viewer | Client |
|--------|-------|-------|---------|--------------|--------|--------|
| Gérer organisation | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Créer projet | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Modifier projet | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Créer tâche | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Modifier tâche assignée | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Uploader ressource | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Commenter ressource | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Approuver ressource | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ |
| Voir portail client | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## 5. Modules de ressources

### 5.1 Modules MVP (V1)

| Module | Description | Ordre développement |
|--------|-------------|---------------------|
| `video_review` | Player vidéo + commentaires temporels + corrections | 1 |
| `document` | Éditeur de document riche | 2 |
| `script` | Éditeur de scénario structuré | 3 |
| `checklist` | Liste de vérification avec progression | 4 |
| `inspirations` | Galerie de références avec liens | 5 |
| `moodboard` | Canvas libre pour direction artistique | 6 |

### 5.2 Modules V2

- `storyboard` — Séquençage visuel de scènes
- `shot_list` — Liste des plans à tourner
- `call_sheet` — Feuille de service tournage
- `production_calendar` — Calendrier de production

### 5.3 Modules V3

- `budget` — Gestion budgétaire projet
- `equipment` — Gestion équipements (scope organisation)
- `locations` — Gestion lieux de tournage (scope organisation)

### 5.4 Architecture registre de modules

Chaque module est un plugin avec :
- `schema_definition` — structure JSON des données
- `supported_actions` — actions disponibles (comment, version, approve, etc.)
- Héritage automatique : versionnage, permissions, commentaires généraux

---

## 6. Fonctionnalités clés

### 6.1 Vue Travail

- Sections repliables par phase (Préproduction / Production / Postproduction / Livraison)
- Tâches avec assignation, statut, priorité, dates
- Sous-tâches (1 niveau d'imbrication)
- Drag & drop avec fractional indexing (pas de réindexation globale)
- Phase Stepper en haut de page

### 6.2 Vue Mes tâches

- Agrège toutes les tâches assignées à l'utilisateur, tous projets confondus
- Groupées par priorité (Urgente / Élevée / Normale / Basse)
- Filtres : Aujourd'hui / Cette semaine / En retard / Tout
- Badge projet cliquable sur chaque tâche

### 6.3 Module Vidéo Review

- Player vidéo avec timeline
- Commentaires temporels (timestamp) et généraux
- Marqueurs visuels sur la timeline
- Conversion commentaire → tâche (CorrectionItem)
- Gestion des versions (V1, V2, V3…)
- Workflow approbation : demande → approbation client
- Portail client : voir corrections avec statut temps réel

### 6.4 Portail client

- Interface simplifiée, sans sidebar interne
- Voir les livrables partagés
- Laisser des commentaires
- Approuver ou demander des corrections
- Voir le statut des corrections en temps réel

### 6.5 Notifications intelligentes

- Regroupement par `group_key` — fenêtre de 30 minutes
- Types à diffusion immédiate (bypass regroupement) :
  - `approval_received`
  - `review_summary_added`
  - `mention`
- Tous les autres types : regroupés

---

## 7. Modèle d'affaires

### 7.1 Plans tarifaires

| Plan | Prix | Membres | Projets | Stockage |
|------|------|---------|---------|----------|
| **Gratuit permanent** | 0$ | 1 | 2 | 2 Go |
| **Essai 14 jours** | 0$ | Illimité | Illimité | Illimité |
| **Solo** | 19$/mois | 1 | 10 | 20 Go |
| **Équipe** | 49$/mois | 10 (+5$/membre) | Illimité | 100 Go (+10$/50 Go) |
| **Agence** | 99$/mois | 25 (+4$/membre) | Illimité | 500 Go (+10$/100 Go) |

### 7.2 Restrictions plan gratuit permanent

- Modules disponibles : Document, Checklist, Vidéo Review uniquement
- Modules Script, Moodboard, Inspirations → plan payant uniquement
- Stockage supplémentaire : payant à la demande

### 7.3 Processeur de paiement

Stripe — avec `stripe_subscription_id` stocké dans `SubscriptionPlan`.

### 7.4 Stockage

- Limite enforce côté serveur avant tout upload
- URLs signées avec expiration : 1h pour vidéos, 15min pour documents
- Scan antivirus ClamAV à l'upload
- Validation MIME réelle (pas seulement l'extension)

---

## 8. Architecture technique

### 8.1 Stack recommandé

**Frontend** : React + TypeScript + Tailwind CSS + React Router

**Backend** : Node.js (à définir selon préférence) ou autre selon compétences

**Base de données** : PostgreSQL avec Row-Level Security (RLS)

**Stockage fichiers** : AWS S3 (ou compatible)

**Hébergement** : AWS Canada `ca-central-1` (Montréal) — conformité Loi 25 Québec

**Sauvegardes** : AWS `ca-west-1` (Calgary)

### 8.2 Sécurité

- **Hachage mots de passe** : Argon2id
- **Authentification** : JWT 15 min + refresh token 30 jours (révocables en BDD)
- **2FA** : TOTP (V1), SMS + FIDO2/WebAuthn (V2)
- **Verrouillage** : après 5 tentatives échouées, CAPTCHA après 10
- **Chiffrement** : TLS 1.3 + HSTS, AES-256 au repos
- **Tokens sensibles** : chiffrement applicatif via AWS KMS
- **Isolation multi-tenant** : Row-Level Security PostgreSQL + middleware injection `organization_id`
- **Headers** : CSP strict, X-Frame-Options DENY, HSTS, Referrer-Policy

### 8.3 Conformité

- **Loi 25 (Québec)** + **RGPD**
- Notification CAI dans 72h en cas de violation
- Droits utilisateurs : accès, rectification, effacement, portabilité

---

## 9. Intégrations

### 9.1 V1 (MVP)

- **Stripe** — facturation et abonnements
- **Email** (SPF/DKIM/DMARC configurés) — notifications et invitations

### 9.2 V2

- **Google Calendar** — sync unidirectionnelle produit → GCal (tâches et jalons)

### 9.3 V3

- **Premiere Pro** — plugin révision vidéo (corrections temps réel)
- **DaVinci Resolve** — plugin révision vidéo
- **Google Calendar bidirectionnel**

---

## 10. Internationalisation

- Langues supportées : Français (fr), Anglais (en)
- Fichiers de traduction : `locales/fr/`, `locales/en/`
- Langue par défaut : définie au niveau organisation
- Préférence personnelle : par membre (écrase le défaut organisation)
- Emails : envoyés dans la langue du destinataire
- Entité `LocalePreference` par utilisateur : locale, date_format, time_format, timezone

---

## 11. Plan de développement

### Phase 0 — Fondations (3-4 semaines)
- Setup projet + CI/CD
- Authentification (Argon2id, JWT, refresh tokens, 2FA TOTP)
- Row-Level Security PostgreSQL
- Pipeline upload fichiers + scan antivirus
- Intégration Stripe (plans, webhooks)
- Configuration email (SPF/DKIM/DMARC)

### Phase 1 — Squelette produit (4-5 semaines)
- Navigation complète (sidebar + routing)
- Organisations, équipes, clients
- Création et liste de projets
- Squelettes Mes tâches et Notifications

### Phase 2 — Module Travail (4-5 semaines)
- Sections + tâches + sous-tâches
- Drag & drop (fractional indexing)
- Vue Mes tâches complète
- Templates système

### Phase 3 — Ressources + Portail client (5-6 semaines)
- Registre de modules
- Module Document
- Module Checklist
- Module Vidéo Review complet (player, commentaires temporels, corrections, approbation)
- Portail client

### Phase 4 — Modules créatifs + Polish (4-5 semaines)
- Module Script
- Module Inspirations
- Module Moodboard (canvas)
- Calendrier simplifié
- Limites de stockage enforced
- Onboarding utilisateur

### Phase 5 — Beta fermée (6-8 semaines)
- 5-10 agences vidéo beta testeurs
- Validation terrain
- Itérations selon retours
- Préparation lancement public

---

## 12. Risques d'architecture

| ID | Risque | Mitigation |
|----|--------|------------|
| R-01 | Performance canvas Moodboard sur mobile | Lazy loading, virtualisation |
| R-02 | Sync Task → CorrectionItem temps réel | WebSockets ou SSE |
| R-03 | Formats vidéo / transcodage | FFmpeg serverside, formats limités V1 |
| R-04 | Latence regroupement notifications | Queue Redis avec TTL 30min |
| R-05 | Dérive schémas JSON modules | `schema_version` + migrations backward-compatible |
| R-06 | Compromission JWT | Révocation en BDD + courte durée de vie 15min |
| R-07 | Énumération utilisateurs | Messages d'erreur génériques |
| R-08 | Dépendance services tiers | Circuit breakers, fallbacks |
| R-09 | Fractional indexing collisions | Algorithme de rééquilibrage automatique |
| R-10 | Stockage dépassé silencieusement | Vérification pré-upload + alertes à 80%/95% |

---

## 13. Templates système (V1)

Templates non-éditables fournis par la plateforme :

- Publicité courte (4 phases, 12 tâches types, checklist tournage)
- Documentaire
- Clip musical
- Film institutionnel
- Motion design
- Projet vide

Templates personnalisés → V2.

---

## 14. Décisions techniques confirmées

- **Drag & drop** : Fractional indexing (pas de réindexation globale)
- **Stockage** : AWS S3 compatible, URLs signées
- **Plugins NLE** : V3 uniquement (Premiere Pro + DaVinci Resolve)
- **Google Calendar** : V2 unidirectionnel, V3 bidirectionnel
- **Nom produit** : "Rush" (nom du dossier projet actuel — à valider légalement)
- **Hébergement** : AWS Canada pour conformité Loi 25 Québec

---

*PRD v1.6 — Reconstitué depuis les sessions de conception*
*Stack frontend : React + TypeScript + Tailwind CSS*
*À utiliser comme référence pour Claude Code avec DESIGN_SYSTEM.md et les BRIEFS_ECRANS*
