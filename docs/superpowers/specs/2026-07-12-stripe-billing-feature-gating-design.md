# Chantier B — Restriction des fonctionnalités par plan (design)

Date : 2026-07-12
Statut : approuvé pour planification

## Contexte

Le chantier A (plomberie Stripe de base) est livré et vérifié en direct. Les plans (Gratuit/Studio/Agence) annoncent déjà des fonctionnalités incluses/exclues sur la page de tarification (`Pricing.tsx`) et dans `Parametres.tsx` (`PLATFORM_PLANS`), mais rien n'est réellement appliqué dans le produit — un studio sur Gratuit peut aujourd'hui utiliser l'assistant IA, les finances, créer des modèles personnalisés, etc. sans restriction.

Ce chantier ajoute l'application réelle de ces limites.

## Fonctionnalités verrouillées

| Fonctionnalité | Gratuit | Studio | Agence |
|---|---|---|---|
| Assistant IA (AIChat) | ❌ | ✅ | ✅ |
| Finances & facturation | ❌ | ✅ | ✅ |
| Modèles personnalisés (création) | ❌ | ✅ | ✅ |
| Projets actifs | max 3 | illimité | illimité |
| Membres d'équipe (invitations) | max 2 | max `billing_seats` (plafond plan 10) | max `billing_seats` (plafond plan 50) |
| Logo personnalisé (app interne) | ❌ | ✅ | ✅ |

**Décisions prises pendant le brainstorming :**
- Toutes les fonctionnalités listées sont verrouillées dans ce chantier (pas de découpage en sous-lot).
- Comportement de blocage : la fonctionnalité reste **visible** dans l'interface, mais son utilisation ouvre une fenêtre d'invitation à upgrader plutôt que de la cacher.
- La limite de membres pour Gratuit est **2** (pas 5 — la fiche tarifaire existante disait 5, c'était une erreur ; elle sera corrigée pour dire "jusqu'à 2 membres").
- Pour Studio/Agence, la limite d'invitation n'est pas le plafond du plan (10/50) mais le nombre de **sièges déjà achetés** (`studios.billing_seats`, géré par le chantier A) — un studio doit acheter un siège avant de pouvoir inviter la personne correspondante.
- "Portail marque blanche" est retiré de la liste des fonctionnalités officielles de la fiche tarifaire — cette fonctionnalité n'existe pas dans le portail client actuellement. À la place, on verrouille la fonctionnalité **logo personnalisé** existante (upload de logo dans Paramètres, affiché dans la barre latérale de l'app interne), qui est un proxy raisonnable et déjà construit.

## Architecture

### 1. `app/src/data/planFeatures.ts` (nouveau — source unique de vérité)

Remplace les tableaux de fonctionnalités dupliqués et parfois contradictoires entre `Pricing.tsx` et `Parametres.tsx`. Exporte :

```ts
export type PlanKey = 'gratuit' | 'studio' | 'agence';
export type GatedFeature = 'ai' | 'finances' | 'customTemplates' | 'customLogo';

export const PLAN_FEATURES: Record<PlanKey, Record<GatedFeature, boolean>>;
export const PLAN_LIMITS: Record<PlanKey, { maxProjects: number | null; maxSeats: number }>;

export function canUseFeature(plan: PlanKey, feature: GatedFeature): boolean;
```

`Pricing.tsx` et `Parametres.tsx` (`PLATFORM_PLANS`) sont mis à jour pour consommer ces mêmes constantes plutôt que de garder leurs propres copies des flags `included`.

### 2. `app/src/data/planStore.ts` (nouveau)

Même pattern que les autres stores du projet (`studioStore.ts`, `projectStore.ts`) : lit `studios.plan` et `studios.billing_seats` depuis Supabase, garde un cache réactif.

```ts
export function getCurrentPlan(): PlanKey;
export function getCurrentBillingSeats(): number;
export function subscribePlan(fn: () => void): () => void;
```

Se synchronise sur les mêmes données que `Parametres.tsx` lit déjà (évite une deuxième requête ad hoc — `Parametres.tsx` sera mis à jour pour consommer ce store au lieu de son fetch local).

### 3. `app/src/data/upgradePromptStore.ts` + `app/src/components/UpgradePromptModal.tsx` (nouveau)

Même pattern singleton que `toastStore.ts` / `ToastBar.tsx` :

```ts
export function requestUpgrade(feature: GatedFeature): void;
```

`UpgradePromptModal` est monté une fois dans `AppShell.tsx` (comme `ToastBar`), affiche le nom de la fonctionnalité et un lien direct vers `Paramètres → Plan`.

Pour le cas "membres" avec sièges insuffisants (plan valide mais pas assez de sièges achetés), le modal a une variante de texte ("achète un siège de plus" plutôt que "passe à un plan supérieur") — même composant, contenu différent selon le motif de blocage transmis à `requestUpgrade`.

## Points d'application

| Fonctionnalité | Fichier(s) | Comportement |
|---|---|---|
| IA | `AppShell.tsx` (déclencheur du raccourci "I" + bouton toggle) | Vérifie `canUseFeature(plan, 'ai')` avant d'ouvrir le panneau ; sinon `requestUpgrade('ai')`. |
| Finances | `Sidebar.tsx` (nav "Finances"), `Finances.tsx` (garde en second niveau) | Nav reste visible ; clic vérifie le plan et ouvre soit la page soit le modal. La page elle-même vérifie aussi le plan au montage (accès direct par URL). |
| Modèles personnalisés | `Modeles.tsx` (bouton(s) de création de modèle custom) | Vérifie le plan avant de créer ; modèles déjà existants restent accessibles même après un downgrade (pas de suppression rétroactive). |
| Projets actifs | Point(s) d'appel de `addProject()` (`ProjectsListView.tsx` et équivalents) | Compte les projets actifs du studio avant création ; bloque au 4e sur Gratuit. |
| Membres | `MonEquipe.tsx` (flux d'invitation) | Compte les `studio_members` actifs avant d'inviter ; compare à `getCurrentBillingSeats()` (Studio/Agence) ou 2 (Gratuit). |
| Logo personnalisé | `Parametres.tsx` (contrôle d'upload de logo) | Champ visible mais désactivé si Gratuit, avec bouton menant au modal. |

## Edge cases

- **Downgrade avec des modèles personnalisés existants** : restent visibles/utilisables en lecture, mais la création de nouveaux modèles est bloquée. Pas de suppression de données.
- **Downgrade avec plus de projets actifs que la nouvelle limite (ex. Studio → Gratuit avec 5 projets actifs)** : les projets existants restent accessibles ; seule la création d'un nouveau projet est bloquée tant que le nombre actif dépasse la limite.
- **Downgrade avec plus de membres que la nouvelle limite** : pareil — les membres existants restent dans l'équipe ; seules les nouvelles invitations sont bloquées.
- **Race condition sur la limite de projets/membres** : la vérification se fait côté client au moment de l'action (pas de contrainte DB stricte) — acceptable pour ce chantier vu l'échelle actuelle de l'app (pas de trafic concurrent élevé attendu) ; documenté comme limite connue plutôt que résolu avec une contrainte SQL, pour rester simple.

## Hors scope (explicitement)

- Portail client marque blanche (n'existe pas encore — voir mémoire `agence-custom-domain-idea.md` pour les idées de personnalisation portail à plus long terme).
- Application de limites via contraintes base de données (RLS/triggers) — vérification client uniquement pour ce chantier.
- Chantier C (self-service, codes promo, octrois manuels) — reste un chantier séparé.
