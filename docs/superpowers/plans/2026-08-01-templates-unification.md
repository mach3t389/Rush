# Unification des modèles (retrait du concept « officiel ») — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retirer le concept « modèle officiel / intégré » pour les modèles de **Projet** et de **Ressource** (Document/Scénario/Revue vidéo/Moodboard) — ce ne sont plus des objets codés en dur, non supprimables, à copier avant édition. Chaque studio reçoit un jeu de départ ordinaire (modifiable/supprimable comme n'importe quel modèle personnalisé) une seule fois, à la création du studio ou via une migration pour les studios existants.

**Architecture:** Les tableaux `BUILT_IN_TEMPLATES`/`BUILT_IN_RESOURCE_TEMPLATES` deviennent des constantes de **semence** (`SEED_*`), utilisées une seule fois pour peupler `custom_project_templates`/`custom_resource_templates` (via les fonctions `saveCustomTemplates`/`saveCustomResourceTemplates` déjà existantes — aucune nouvelle logique d'écriture Supabase nécessaire), plutôt que d'être concaténées à chaque lecture. Un flag `templates_seeded` sur `studios` évite de reseeder après suppression. Les modèles de **Formulaire** ne sont PAS concernés — ils gardent leur mécanisme actuel (officiel + masquage), hors scope de ce chantier.

**Tech Stack:** React 19 + TypeScript, Supabase (Postgres), pas de tests automatisés — vérification par `npx tsc --noEmit -p tsconfig.app.json` (depuis `app/`) et preview navigateur.

## Global Constraints

- **Hors scope, ne pas toucher** : `BUILT_IN_FORM_TEMPLATES`, `hideTemplate`/`unhideTemplate`/`getHiddenTemplateIds`/`subscribeHiddenTemplates`/`isTemplateHidden` (mécanisme partagé — reste utilisé par les formulaires), le bouton « Réafficher » côté formulaires, l'« OFFICIEL » badge côté formulaires.
- **Jeu de départ Projet (4)** : Projet vierge, Séance photo, Film institutionnel, Motion design. Retirer « Campagne vidéo sociale » du jeu de départ (chevauche les 2 autres formats vidéo).
- **Jeu de départ Ressource** : garder le contenu existant tel quel (Document ×2, Scénario ×1, Revue vidéo ×1, Moodboard ×1) — ne pas fabriquer de contenu supplémentaire artificiel pour atteindre un chiffre rond.
- **Idempotence obligatoire** : une fois un studio semé (`templates_seeded = true`), ne plus jamais reseeder — même si l'utilisateur supprime tous ses modèles. C'est le point de rupture le plus dangereux de ce chantier ; toute implémentation qui reseed après suppression est un bug bloquant.
- **Sessions démo** : même logique, flag local (`persist.ts`, pas Supabase) — les sessions démo n'ont pas de ligne `studios`.
- **Migration Supabase manuelle** : comme toujours dans ce projet, aucune migration SQL ne s'exécute automatiquement — l'utilisateur doit la coller dans Supabase → SQL Editor. Le prévenir explicitement à la fin.
- **`ProjectTemplate.builtIn?`/`ResourceTemplate.builtIn?`** restent sur le type (compat lecture des vieux objets), mais plus aucun nouveau code ne les traite comme vrais pour Projet/Ressource — après ce chantier, `builtIn` sur ces deux types ne devrait plus jamais valoir `true` pour un objet créé après le déploiement.

---

## File Structure

- **Créer `docs/superpowers/specs/2026-08-01-templates-seeded-migration.sql`** — migration Supabase (colonne `templates_seeded` sur `studios`, backfill pour les studios existants).
- **Modifier `app/src/data/templates.ts`** — `BUILT_IN_TEMPLATES`/`BUILT_IN_RESOURCE_TEMPLATES` → `SEED_TEMPLATES`/`SEED_RESOURCE_TEMPLATES` (contenu réduit), `loadAllTemplates`/`loadAllResourceTemplates` simplifiés, nouvelle fonction `ensureDefaultTemplatesSeeded()`.
- **Modifier `app/src/data/studioStore.ts`** — appelle le seed à la création d'un nouveau studio (`provisionNewStudio`), suit le pattern déjà utilisé par `seedBuiltInEventTypes`.
- **Modifier `app/src/screens/Modeles.tsx`** — retire toutes les branches `tpl.builtIn`/`.builtIn` pour Projet et Ressource (badge, séparation de nav, `deleteTpl`/`deleteRes`, `onEdit`, bouton eye-off, `resetHiddenTemplates`) ; garde intact l'équivalent pour Formulaire.
- **Modifier `app/src/components/ProjectsListView.tsx`** — retire le badge OFFICIEL, simplifie `sortedTemplates`.

---

### Task 1 : Migration Supabase — colonne `templates_seeded`

**Files:**
- Create: `docs/superpowers/specs/2026-08-01-templates-seeded-migration.sql`

- [ ] **Step 1 : Écrire la migration**

```sql
-- Ajoute un flag "modèles de départ déjà semés" par studio, pour ne jamais
-- reseeder après que l'utilisateur ait supprimé ses modèles.
alter table studios add column if not exists templates_seeded boolean not null default false;

-- Backfill : marquer comme "déjà semés" tout studio qui a DÉJÀ au moins un
-- modèle de projet personnalisé (signe qu'il utilise le système, pas la peine
-- de rien lui ajouter) — évite d'insérer les modèles de départ dans des
-- comptes actifs qui ont leur propre contenu depuis longtemps.
update studios s
set templates_seeded = true
where exists (
  select 1 from custom_project_templates t where t.studio_id = s.id
) or exists (
  select 1 from custom_resource_templates t where t.studio_id = s.id
);
```

Vérifier les noms exacts des tables `custom_project_templates`/`custom_resource_templates` et de leur colonne de portée (`studio_id`) en lisant `app/src/data/templates.ts` (fonctions `replaceSupabaseProjectTemplates`/équivalent ressource) avant d'écrire la migration finale — ajuster si les noms diffèrent de ceux indiqués ici.

- [ ] **Step 2 : Commit**

```bash
git add docs/superpowers/specs/2026-08-01-templates-seeded-migration.sql
git commit -m "docs: migration SQL — colonne templates_seeded sur studios"
```

(Cette migration devra être collée manuellement dans Supabase → SQL Editor par l'utilisateur — ne pas essayer de l'exécuter automatiquement.)

---

### Task 2 : `templates.ts` — jeux de semence + logique de seed

**Files:**
- Modify: `app/src/data/templates.ts` (`BUILT_IN_TEMPLATES` lignes 135-356, `BUILT_IN_RESOURCE_TEMPLATES` lignes 790-943, `loadAllTemplates` ligne 662, `loadAllResourceTemplates` ligne 1028)

**Interfaces:**
- Produces: `export async function ensureDefaultTemplatesSeeded(): Promise<void>` — à appeler au montage de `Modeles.tsx` (et, pour les nouveaux studios, depuis `provisionNewStudio` en Task 3) ; idempotent, ne fait rien si déjà semé.

- [ ] **Step 1 : Renommer et réduire `BUILT_IN_TEMPLATES` → `SEED_TEMPLATES`**

Garder exactement 4 entrées, dans cet ordre (l'ordre d'insertion sert de tri naturel plus tard — donner à chacune un `createdAt` distinct, quelques millisecondes d'écart, dans cet ordre précis) : `tpl-vierge` (Projet vierge), `tpl-shoot-photo` (Séance photo), `tpl-film-institutionnel` (Film institutionnel), `tpl-motion-design` (Motion design). Retirer `tpl-video-sociale`. Retirer `builtIn: true` de chaque entrée (elles ne sont plus des objets « officiels » — ce sont des modèles personnalisés ordinaires dès leur insertion). Garder tous les autres champs (contenu, `sections`, `folderStructure`) identiques.

- [ ] **Step 2 : Renommer `BUILT_IN_RESOURCE_TEMPLATES` → `SEED_RESOURCE_TEMPLATES`, ne garder que Document/Scénario/Revue vidéo/Moodboard**

Retirer `res-file-structure`, `res-overview-base` (types `file`/`overview`, plus jamais affichés dans la nav ni utilisés comme modèle « visible » — mais **vérifier avant de les retirer entièrement** que `LEGACY_TASKS_RESOURCE_TO_BUILTIN_PROJECT`/`migrateLegacyProjectTemplate` n'en a plus besoin : cette fonction résout `defaultFolderStructureId` en cherchant `res-file-structure` dans `loadAllResourceTemplates()` — si `loadAllResourceTemplates()` ne renvoie plus les seeds après Step 3, cette résolution casserait silencieusement pour d'anciens modèles personnalisés migrés. Solution : garder `res-file-structure`/`res-overview-base` comme entrées internes séparées, non exposées via `SEED_RESOURCE_TEMPLATES`/le seed, mais toujours consultables par `migrateLegacyProjectTemplate` directement — par exemple une petite constante `LEGACY_MIGRATION_LOOKUP` séparée contenant ces deux entrées, non semée, jamais affichée nulle part).

`SEED_RESOURCE_TEMPLATES` garde donc : `res-doc-contrat`, `res-doc-brief` (document), `res-screenplay-3actes` (screenplay), `res-review-3rounds` (video_review), `res-moodboard-corporate` (moodboard) — 5 entrées, `builtIn: true` retiré de chacune.

- [ ] **Step 3 : Simplifier `loadAllTemplates`/`loadAllResourceTemplates`**

```ts
export function loadAllTemplates(): ProjectTemplate[] {
  return loadCustomTemplates().map(migrateLegacyProjectTemplate);
}

export function loadAllResourceTemplates(): ResourceTemplate[] {
  return loadCustomResourceTemplates();
}
```

Plus de concaténation avec des built-ins — puisque le seed écrit désormais les modèles de départ directement dans le stockage personnalisé (via `saveCustomTemplates`/`saveCustomResourceTemplates`), ils sont naturellement inclus dans `loadCustomTemplates()`/`loadCustomResourceTemplates()`. `getVisibleBuiltInTemplates`/`getVisibleBuiltInResourceTemplates` (les versions filtrées par `isTemplateHidden`) deviennent inutiles pour Projet/Ressource — les retirer, mais **garder `getVisibleBuiltInFormTemplates`** (formulaires, hors scope).

- [ ] **Step 4 : Écrire `ensureDefaultTemplatesSeeded()`**

```ts
const DEMO_TEMPLATES_SEEDED_KEY = 'sf_demo_templates_seeded';

export async function ensureDefaultTemplatesSeeded(): Promise<void> {
  if (isDemoSession()) {
    if (loadPersisted(DEMO_TEMPLATES_SEEDED_KEY, false)) return;
    if (loadCustomTemplates().length === 0) saveCustomTemplates([...SEED_TEMPLATES]);
    if (loadCustomResourceTemplates().length === 0) saveCustomResourceTemplates([...SEED_RESOURCE_TEMPLATES]);
    savePersisted(DEMO_TEMPLATES_SEEDED_KEY, true);
    return;
  }
  const studioId = getStudioId();
  if (!studioId) return;
  const { data, error } = await supabase.from('studios').select('templates_seeded').eq('id', studioId).single();
  if (error || !data || data.templates_seeded) return;
  await Promise.all([
    saveCustomTemplatesAsync([...SEED_TEMPLATES]),
    saveCustomResourceTemplatesAsync([...SEED_RESOURCE_TEMPLATES]),
  ]);
  await supabase.from('studios').update({ templates_seeded: true }).eq('id', studioId);
}
```

Adapter les noms exacts (`saveCustomTemplates`/`saveCustomResourceTemplates` sont-ils déjà awaitable côté réel, ou fire-and-forget comme documenté dans le rapport de recherche — `void replaceSupabaseProjectTemplates(...)` ? Si fire-and-forget, il faut soit les rendre awaitable pour cette fonction précise, soit accepter un léger délai avant que les modèles semés apparaissent — lire le corps exact de `saveCustomTemplates`/`saveCustomResourceTemplates` avant d'écrire cette étape, et choisir l'approche la plus simple qui garantit que `templates_seeded` n'est marqué `true` qu'APRÈS que l'écriture ait réellement été tentée, pour éviter de marquer "semé" alors que l'insertion a échoué silencieusement). Importer `supabase` depuis `./supabaseClient`, `getStudioId` depuis `./studioStore`.

- [ ] **Step 5 : Compiler**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

- [ ] **Step 6 : Commit**

```bash
git add app/src/data/templates.ts
git commit -m "refactor(templates): retire le concept officiel pour Projet/Ressource, ajoute le seed par studio"
```

---

### Task 3 : Déclencher le seed — nouveaux studios et studios existants

**Files:**
- Modify: `app/src/data/studioStore.ts` (`provisionNewStudio`, lignes ~53-66)
- Modify: `app/src/screens/Modeles.tsx` (appel au montage)

**Interfaces:**
- Consumes: `ensureDefaultTemplatesSeeded()` (Task 2).

- [ ] **Step 1 : Nouveaux studios — appeler le seed dans `provisionNewStudio`**

Après `await seedBuiltInEventTypes(created.id);` (ligne ~64), ajouter :
```ts
const { ensureDefaultTemplatesSeeded } = await import('./templates');
await ensureDefaultTemplatesSeeded();
```
(Import dynamique pour éviter une dépendance circulaire potentielle entre `studioStore.ts` et `templates.ts` — suivre exactement le même pattern que l'import dynamique déjà utilisé pour `seedBuiltInEventTypes` juste au-dessus.)

- [ ] **Step 2 : Studios existants — appeler le seed au montage de la page Modèles**

Dans `Modeles.tsx`, ajouter un `useEffect(() => { void ensureDefaultTemplatesSeeded(); }, []);` près des autres effets d'initialisation en haut du composant principal. C'est le point d'entrée le plus fiable pour couvrir les comptes déjà existants (n'importe quel studio qui ouvre la page Modèles après ce déploiement se fait semer une fois, silencieusement, si son flag `templates_seeded` est encore `false`).

- [ ] **Step 3 : Compiler**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

- [ ] **Step 4 : Commit**

```bash
git add app/src/data/studioStore.ts app/src/screens/Modeles.tsx
git commit -m "feat(templates): déclenche le seed des modèles de départ (nouveaux studios + existants)"
```

---

### Task 4 : `Modeles.tsx` — retirer les branches « officiel » pour Projet/Ressource

**Files:**
- Modify: `app/src/screens/Modeles.tsx` — badge OFFICIEL (lignes ~335, ~1049 — **pas** ligne ~540 qui est Formulaire, à garder), nav split (lignes ~1742-1770 projets, ~1804-1832 ressources — **pas** ~1773-1801 formulaires, à garder), `deleteTpl` (~1436-1449), `deleteRes` (~1563-1574), `onEdit` de `TemplateDetail`/`ResourceTemplateDetail`, bouton eye-off + `hideBuiltInConfirm`/`editCopy`, `resetHiddenTemplates` (~1389-1394, ~1635-1639), `TemplateResourceView`'s copy-before-save logic (~1965-1972, ~190), `ResourceTemplateDetail`'s chaînes FR codées en dur (~1126-1139)

- [ ] **Step 1 : Badges OFFICIEL — Projet et Ressource seulement**

Retirer `{tpl.builtIn && <span>{t('models.builtIn')}</span>}` dans `TemplateDetail` (ligne ~335) et `ResourceTemplateDetail` (ligne ~1049). **Ne pas toucher** l'équivalent dans `FormTemplateDetail` (ligne ~540).

- [ ] **Step 2 : Nav — retirer la séparation « Intégrés » pour Projet et Ressource**

Dans les 2 blocs de nav concernés (~1742-1770 projets, ~1804-1832 ressources), retirer le filtre `!t.builtIn`/collapsible « Intégrés (N) » — afficher directement `filteredTpl` (toute la liste) sans séparation. **Ne pas toucher** le bloc formulaires (~1773-1801).

- [ ] **Step 3 : `deleteTpl`/`deleteRes` — toujours une vraie suppression**

```ts
const deleteTpl = (tpl: ProjectTemplate) => {
  const custom = templates.filter(t => t.id !== tpl.id);
  saveCustomTemplates(custom);
  setTemplates(custom);
  setSelectedTpl(custom[0] ?? null);
};
```
Même simplification pour `deleteRes` (retirer la branche `if (tpl.builtIn) { hideTemplate(...); ... return; }`, ne garder que le chemin de suppression réelle). **Ne pas toucher** `deleteForm`.

- [ ] **Step 4 : `onEdit` — toujours éditer en place, jamais copier avant**

`TemplateDetail`'s `onEdit` (ProjectTemplate) :
```ts
onEdit={() => void openProjectTemplateDraft(selectedTpl)}
```
(retire toute la logique de copie conditionnelle). Pour `TemplateResourceView`'s `onSave` (~1965-1972), retirer la branche `if (updated.builtIn) { saveRes({ ...updated, builtIn: false }); }` — ne garder que `saveRes(updated)`. Pour le bouton copie inline dans le viewer de document (~190, `icon="copy"` avec label `t('models.saveCopy')`) — **vérifier son rôle exact avant de le retirer** : s'il sert uniquement au cas « built-in », le retirer ; s'il a un autre usage (dupliquer un modèle personnalisé existant volontairement), le garder mais retirer la condition `tpl.builtIn ? ... : ...` autour de lui pour qu'il soit toujours disponible de la même façon.

- [ ] **Step 5 : Bouton eye-off → toujours « Supprimer »**

Dans les boutons d'action de `TemplateDetail`/`ResourceTemplateDetail` :
```tsx
<SFButton variant="ghost" size="sm" icon="trash-2" onClick={() => { if (!confirm(t('models.deleteConfirm'))) return; onDelete(); }} style={{ color: 'var(--danger)' }} />
```
Retirer toute référence à `tpl.builtIn`, `'eye-off'`, `t('models.hideBuiltInConfirm')`, `t('models.editCopy')` pour ces deux types (utiliser systématiquement `t('models.edit')` pour le libellé Modifier). Ajouter la clé `models.deleteConfirm` (`"Supprimer ce modèle ? Cette action est irréversible."` / `"Delete this template? This action is irreversible."`) dans `fr.json`/`en.json` si elle n'existe pas déjà sous une forme réutilisable.

- [ ] **Step 6 : `resetHiddenTemplates` — ne garder que la partie Formulaire**

```ts
const resetHiddenTemplates = () => {
  getHiddenTemplateIds().forEach(id => unhideTemplate(id));
  setFormTemplates(loadAllFormTemplates());
};
```
Retirer `setTemplates(loadAllTemplates())`/`setResourceTemplates(loadAllResourceTemplates())` de cette fonction (plus rien à « réafficher » côté Projet/Ressource — il n'y a plus de masquage possible pour ces deux types). Le bouton « X modèles masqués — Réafficher » (~1635-1639) ne doit alors plus compter que les formulaires masqués dans son `hiddenCount` — vérifier si `hiddenCount` (ligne ~1341) doit être recalculé pour ne compter que les ids de formulaires masqués (probablement oui, sinon le compteur resterait faussé par d'anciens ids de projets/ressources masqués avant ce chantier — filtrer `getHiddenTemplateIds()` sur les ids qui existent encore dans `BUILT_IN_FORM_TEMPLATES` pour ce compte).

- [ ] **Step 7 : `ResourceTemplateDetail` — chaînes FR codées en dur**

Lignes ~1126-1139 : retirer les ternaires `tpl.builtIn ? '...' : '...'`, garder uniquement la branche non-builtin (`'Ouvrir / modifier le contenu'`, `'Dupliquer'`).

- [ ] **Step 8 : Compiler**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

- [ ] **Step 9 : Commit**

```bash
git add app/src/screens/Modeles.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "refactor(modeles): retire le concept officiel pour Projet/Ressource, garde le mécanisme pour Formulaire"
```

---

### Task 5 : `ProjectsListView.tsx` — nettoyage du wizard

**Files:**
- Modify: `app/src/components/ProjectsListView.tsx` (badge OFFICIEL ligne ~264-266, `sortedTemplates` lignes ~96-105)

- [ ] **Step 1 : Retirer le badge OFFICIEL**

Supprimer le bloc `{tpl.builtIn && <span>...</span>}` (lignes ~264-266) dans le rendu de chaque carte modèle.

- [ ] **Step 2 : Simplifier `sortedTemplates`**

```ts
const allTemplates = loadAllTemplates();
// Tri chronologique : les modèles de départ (semés à la création du studio,
// donc les plus anciens) apparaissent naturellement en premier, dans leur
// ordre de semis ; les modèles créés ensuite par l'utilisateur suivent.
const sortedTemplates = [...allTemplates].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
```
Retirer toute référence à `t.builtIn`/`t.id === 'tpl-vierge'` dans ce tri.

- [ ] **Step 3 : Compiler**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

- [ ] **Step 4 : Commit**

```bash
git add app/src/components/ProjectsListView.tsx
git commit -m "refactor(nouveauProjet): retire le badge officiel, simplifie le tri des modèles"
```

---

### Task 6 : Revue finale et vérification bout-en-bout

- [ ] **Step 1 : Typecheck complet**

```bash
npx tsc --noEmit -p tsconfig.app.json
```

- [ ] **Step 2 : Grep de contrôle**

```bash
grep -rn "BUILT_IN_TEMPLATES\|BUILT_IN_RESOURCE_TEMPLATES" app/src
```
Attendu : plus aucune référence (renommées en `SEED_TEMPLATES`/`SEED_RESOURCE_TEMPLATES`).
```bash
grep -n "tpl.builtIn\|selectedTpl.builtIn\|selectedRes.builtIn" app/src/screens/Modeles.tsx app/src/components/ProjectsListView.tsx
```
Attendu : vide.

- [ ] **Step 3 : Parcours de vérification en preview (session démo d'abord, plus rapide à réinitialiser)**

1. Ouvrir la page Modèles pour la première fois (session démo fraîche, ou vider `localStorage` puis recharger) → confirmer que 4 modèles de projet apparaissent (Projet vierge, Séance photo, Film institutionnel, Motion design), plus de section « Intégrés » séparée, plus de badge OFFICIEL.
2. Supprimer un des 4 modèles → confirmer qu'il disparaît réellement (pas juste masqué), et recharger la page → confirmer qu'il ne revient PAS (le point le plus critique à vérifier).
3. Cliquer « Modifier » sur un des modèles restants → confirmer qu'aucune copie « (copie) » n'apparaît, que ça ouvre directement un brouillon sur CE modèle.
4. Vérifier les modèles de ressource (Document/Scénario/Revue vidéo/Moodboard) : mêmes vérifications (suppression réelle, pas de badge, pas de copie silencieuse à l'édition).
5. Assistant Nouveau projet : confirmer que les 4 modèles de départ apparaissent, plus de badge OFFICIEL, l'ordre reste cohérent (Projet vierge en premier).
6. Formulaires : confirmer qu'ils fonctionnent exactement comme avant (badge OFFICIEL toujours présent, masquage toujours possible, bouton Réafficher toujours fonctionnel) — ce chantier ne doit rien y changer.

- [ ] **Step 4 : Rappel migration Supabase**

Rappeler explicitement à l'utilisateur, à la fin du chantier, qu'il doit coller la migration SQL (Task 1) dans Supabase → SQL Editor pour que le seed fonctionne sur son compte réel — sans cette étape manuelle, `templates_seeded` n'existe pas encore comme colonne et `ensureDefaultTemplatesSeeded()` échouera silencieusement (à vérifier : la fonction doit échouer proprement — pas planter l'app — si la colonne n'existe pas encore, le temps que l'utilisateur applique la migration).

- [ ] **Step 5 : Dispatcher la revue finale de branche**

Utiliser `superpowers:requesting-code-review`, puis `superpowers:finishing-a-development-branch`.

## Self-Review

**Couverture :** retrait du concept officiel pour Projet (Task 4-5) et Ressource (Task 4), jeu de départ 4 modèles projet incluant Projet vierge (Task 2), contenu ressource inchangé sans fabrication artificielle (Task 2), seed une fois par studio avec idempotence (Task 2-3), migration Supabase manuelle documentée (Task 1), Formulaires explicitement hors scope et vérifiés intacts (Task 4 Step 1/2/6, Task 6 Step 3.6).

**Point de risque le plus élevé, à surveiller en priorité pendant l'implémentation et la revue :** l'idempotence du seed (ne jamais reseeder après suppression) et l'ordre écriture-avant-flag (ne marquer `templates_seeded = true` qu'après une écriture réellement tentée, pas avant) — Task 2 Step 4 le signale explicitement comme point à vérifier avec soin contre le code réel de `saveCustomTemplates`/`saveCustomResourceTemplates`.
