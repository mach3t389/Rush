# Bloc IA en haut de l'accueil (Dashboard)

## Contexte

L'accueil (`Dashboard.tsx`) affiche actuellement un en-tête (« Bonjour [Prénom] », date, mini-stats) suivi de sections récapitulatives (tâches, échéances, événements, projets actifs, approbations, activité). L'app dispose déjà d'un assistant IA (Claude Haiku via `/api/ai-chat`, panneau flottant `AIChat.tsx`, gating par plan, quota mensuel par studio).

Objectif : ajouter une nouvelle section en haut de l'accueil qui met l'IA en avant comme point d'entrée principal — un peu comme la page d'accueil de ChatGPT — sans remplacer l'en-tête existant.

## Placement

Nouveau bloc ajouté **au-dessus** de l'en-tête actuel (`PageHeader` avec « Bonjour [Prénom] »). L'en-tête et toutes les sections existantes de l'accueil restent inchangés en dessous.

## Contenu du bloc

1. **Titre accrocheur** — ex. « Qu'est-ce qu'on fait aujourd'hui ? » (clé i18n, `fr`/`en`)
2. **Ligne de résumé** — une phrase calculée localement à partir des données déjà chargées sur l'accueil (tâches en retard, tâches à faire cette semaine, projets actifs) — pas d'appel réseau, pas de coût de quota. Réutilise les mêmes valeurs que les mini-stats de l'en-tête actuel (`activeProjects.length`, `myTasks.length`, `lateProjects`, `urgentToday`) pour rester cohérent.
3. **Barre de saisie** — grande, proéminente, placeholder du type « Demandez-moi n'importe quoi… »
4. **Suggestions fixes** — 3-4 chips cliquables, texte pré-écrit (i18n), qui pré-remplissent la barre de saisie au clic sans l'envoyer automatiquement :
   - « Créer une tâche »
   - « Résumer mes projets actifs »
   - « Que dois-je prioriser aujourd'hui ? »
   - « Créer un événement »

## Interaction

Envoyer un message (Entrée ou bouton) fait passer le bloc en mode conversation : il s'agrandit **sur place**, sous la barre de saisie, pour afficher l'échange (question de l'utilisateur, réponse de l'assistant, historique de la session). Pas de navigation, pas de changement de page.

Le bloc appelle le **même backend** que le panneau flottant (`/api/ai-chat`, mêmes outils `list_projects`, `list_clients`, `list_tasks`, `create_project`, `create_event`, `create_resource`, `navigate`) et partage le **même quota mensuel** par studio (table `ai_usage`). Aucune duplication de logique serveur — uniquement une deuxième interface cliente qui parle au même endpoint, avec sa propre boucle agentique locale (reprend le pattern déjà utilisé dans `AIChat.tsx` : appel → si `tool_calls` → exécution locale → reboucle → réponse texte).

Le bloc garde son propre état de conversation local (pas partagé avec le panneau flottant — ce sont deux fils de discussion indépendants, comme deux onglets). Il se réinitialise à chaque re-montage de la page (pas de persistance de l'historique entre visites, cohérent avec le comportement actuel du panneau IA sur `DocumentView`).

## Gating

- **Plan Gratuit (vrai compte, sans accès IA)** — le bloc est **complètement absent** de l'accueil. Aucun résidu visuel, aucune invite à upgrader ici (le panneau flottant gère déjà ce cas ailleurs). Réutilise `canUseFeature(plan, 'ai')`.
- **Session démo** (`isDemoSession()`) — le bloc est **visible** (fait partie de la démo produit). Écrire dedans et envoyer affiche le même message explicatif statique que le panneau flottant (`ai.demoNotice`), sans appel réseau réel.
- **Plan payant avec accès IA** — comportement complet décrit ci-dessus.

## Composants et fichiers touchés

- `app/src/screens/Dashboard.tsx` — nouveau bloc `DashboardAIHero` (ou composant dédié dans le même fichier, cohérent avec le style « gros fichiers autonomes » du reste du projet), inséré avant `PageHeader`.
- Réutilise la logique d'appel déjà écrite dans `AIChat.tsx` (boucle agentique, exécution des tool_calls contre les stores) — factoriser la boucle d'appel réseau + exécution d'outils dans un helper partagé si l'extraction reste simple, sinon dupliquer le strict nécessaire plutôt que de complexifier `AIChat.tsx` avec une prop de mode.
- `app/src/locales/fr.json` / `en.json` — nouvelles clés (titre, placeholder, suggestions, résumé).
- `app/src/data/planFeatures.ts` (`canUseFeature`) — réutilisé tel quel, pas de nouvelle règle de plan.

## Hors scope

- Pas de résumé généré par IA au chargement (calculé localement uniquement).
- Pas de suggestions dynamiques basées sur les données (fixes pour cette itération).
- Pas de persistance de l'historique de conversation du bloc entre les visites.
- Le panneau IA flottant (bouton en haut à droite) n'est pas modifié et reste disponible sur toutes les pages, y compris l'accueil.
