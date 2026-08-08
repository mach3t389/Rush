# Modules de projet optionnels — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre le sélecteur de modules de projet (Calendrier/Fichiers/Finance) visuellement clair et cohérent partout, retirer la dépendance de Finance à la présence d'un client (projet ET facture), et prévenir l'utilisateur avant de masquer un module qui contient des données.

**Architecture:** Extraire le style de bouton déjà correct de `ProjectsListView.tsx` (bordure/fond accent à l'état coché) dans un composant partagé `ModuleToggleList`, réutilisé par `ProjectCard.tsx`. Retirer la contrainte `!!p.clientId` sur `financeEnabled` à 3 endroits (toggle projet, gating d'onglet, gating de sauvegarde). Élargir `Invoice.clientId` en optionnel côté type/DB/formulaire.

**Tech Stack:** React 19 + TypeScript, Supabase (migration SQL manuelle), i18next.

## Global Constraints

- Pas de suite de tests automatisée dans ce projet (voir CLAUDE.md) — la vérification se fait par `npx tsc --noEmit -p tsconfig.app.json` (depuis `app/`) après chaque tâche, et par vérification manuelle dans le navigateur pour les changements visuels/interactifs. Ne pas inventer de framework de test.
- Tous les styles sont en `style={}` inline avec les tokens CSS de `app/src/index.css` (`--accent`, `--border`, `--surface-2`, etc.) — jamais de classes Tailwind pour ces composants.
- Tout texte utilisateur doit passer par `t('namespace.key')` — ajouter les clés dans `app/src/locales/fr.json` ET `app/src/locales/en.json` avant de les utiliser.
- Les migrations Supabase (`docs/superpowers/specs/*.sql`) ne s'exécutent jamais automatiquement — écrire le fichier, puis explicitement demander à l'utilisateur de le coller dans Supabase → SQL Editor (ou l'exécuter soi-même si un accès admin est disponible dans la session).
- Toujours `git fetch && git pull origin master --no-rebase --no-edit` avant de committer/pousser (plusieurs sessions concurrentes poussent sur `master` dans ce repo), et re-typechecker après chaque merge.

---

### Task 1: Composant partagé `ModuleToggleList` + retrait de la dépendance client pour Finance

**Files:**
- Create: `app/src/components/ui/ModuleToggleList.tsx`
- Modify: `app/src/components/ui/index.ts` (export)
- Modify: `app/src/components/ProjectCard.tsx:92-118, 303-332` (ProjectEditPanel)
- Modify: `app/src/components/ProjectsListView.tsx:706-754` (assistant de création)
- Modify: `app/src/components/ProjectHeaderBar.tsx:69`

**Interfaces:**
- Produces: `ModuleToggleList` — props `{ modules: { key: 'calendar'|'files'|'finance'; label: string; checked: boolean; onToggle: () => void; locked?: boolean; onLockedClick?: () => void; helperText?: string }[] }`. Rendu identique au bloc existant de `ProjectsListView.tsx:709-748` (bouton pilule, cercle à coche, bordure/fond accent à l'état coché), mais générique — ne connaît rien de la logique métier (plan, client) au-delà des props reçues.

- [ ] **Step 1: Créer le composant partagé**

```tsx
// app/src/components/ui/ModuleToggleList.tsx
import { SFIcon } from './SFIcon';

export interface ModuleToggleItem {
  key: string;
  label: string;
  checked: boolean;
  onToggle: () => void;
  /** Verrouillé par le plan tarifaire — affiche un cadenas au lieu de la coche. */
  locked?: boolean;
  /** Appelé au clic quand locked est vrai (ex: ouvrir la modale d'upgrade). */
  onLockedClick?: () => void;
  /** Texte d'aide affiché sous la liste quand cet item est actif (ex: exigence de plan). */
  helperText?: string;
}

export function ModuleToggleList({ modules }: { modules: ModuleToggleItem[] }) {
  const activeHelper = modules.find(m => m.helperText)?.helperText;
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {modules.map(m => (
          <button
            key={m.key}
            type="button"
            onClick={() => { if (m.locked) { m.onLockedClick?.(); return; } m.onToggle(); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px', borderRadius: 9,
              cursor: 'pointer',
              border: `1.5px solid ${m.checked ? 'var(--accent)' : 'var(--border)'}`,
              background: m.checked ? 'rgba(249,255,0,0.08)' : 'var(--surface-2)',
            }}
          >
            <div style={{
              width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `1.5px solid ${m.checked ? 'var(--accent)' : 'var(--border-2)'}`,
              background: m.checked ? 'var(--accent)' : 'transparent',
            }}>
              {m.locked
                ? <SFIcon name="lock" size={11} color="var(--text-3)" />
                : m.checked && <SFIcon name="check" size={11} color="var(--on-accent)" />}
            </div>
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-2)' }}>{m.label}</span>
          </button>
        ))}
      </div>
      {activeHelper && <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 6 }}>{activeHelper}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Exporter depuis le barrel**

Ajouter dans `app/src/components/ui/index.ts` : `export { ModuleToggleList } from './ModuleToggleList';` (ajouter aussi `export type { ModuleToggleItem } from './ModuleToggleList';` si le barrel exporte déjà d'autres types du même fichier — sinon suivre le style existant du fichier).

- [ ] **Step 3: Remplacer le bloc dans `ProjectEditPanel` (ProjectCard.tsx)**

Ajouter les imports nécessaires en haut du fichier :
```tsx
import { usePlan } from '../data/planStore';
import { canUseFeature } from '../data/planFeatures';
import { requestUpgrade } from '../data/upgradePromptStore';
import { ModuleToggleList } from './ui';
```
(si `ProjectCard.tsx` importe déjà certains de ces modules ou un sous-ensemble du barrel `./ui`, fusionner avec les imports existants plutôt que dupliquer la ligne).

Remplacer les lignes 92-94 :
```tsx
  const [lCalendarEnabled, setLCalendarEnabled] = useState(p.calendarEnabled);
  const [lFilesEnabled, setLFilesEnabled]       = useState(p.filesEnabled);
  const [lFinanceEnabled, setLFinanceEnabled]   = useState(p.financeEnabled);
```
reste identique (pas de changement ici) — mais la ligne 118 :
```tsx
      financeEnabled: lFinanceEnabled && !!p.clientId,
```
devient :
```tsx
      financeEnabled: lFinanceEnabled,
```

Remplacer le bloc JSX lignes 303-332 (`{/* Modules */}` ... jusqu'à la fermeture du `</div>` correspondant) par :
```tsx
          {/* Modules */}
          <div>
            <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 8 }}>{t('projects.featuresLabel')}</label>
            <ModuleToggleList modules={[
              { key: 'calendar', label: t('projects.moduleCalendar'), checked: lCalendarEnabled, onToggle: () => setLCalendarEnabled(v => !v) },
              { key: 'files',    label: t('projects.moduleFiles'),    checked: lFilesEnabled,    onToggle: () => setLFilesEnabled(v => !v) },
              {
                key: 'finance', label: t('projects.moduleFinance'), checked: lFinanceEnabled,
                onToggle: () => setLFinanceEnabled(v => !v),
                locked: !canUseFeature(plan, 'finances'),
                onLockedClick: () => requestUpgrade({ feature: 'finances' }),
                helperText: !canUseFeature(plan, 'finances') && lFinanceEnabled ? t('projects.moduleFinanceRequiresPlan') : undefined,
              },
            ]} />
          </div>
```
Ajouter `const plan = usePlan();` près des autres hooks en haut du composant `ProjectEditPanel`.

Note : ceci corrige aussi un bug distinct — `ProjectEditPanel` n'appliquait avant cette tâche **aucun** verrouillage de plan sur Finance (seul le manque de client le bloquait), donc un compte plan Gratuit pouvait activer Finance depuis l'édition alors que l'assistant de création le bloque. Après cette tâche, les deux endroits appliquent la même règle.

- [ ] **Step 4: Remplacer le bloc dans l'assistant de création (`ProjectsListView.tsx`)**

Remplacer les lignes 706-754 (le bloc `<div>` du label + boutons + messages d'aide) par :
```tsx
              <div>
                <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 8 }}>{t('projects.featuresLabel')}</label>
                <ModuleToggleList modules={[
                  { key: 'calendar', label: t('projects.moduleCalendar'), checked: calendarEnabled, onToggle: () => setCalendarEnabled(v => !v) },
                  { key: 'files',    label: t('projects.moduleFiles'),    checked: filesEnabled,    onToggle: () => setFilesEnabled(v => !v) },
                  {
                    key: 'finance', label: t('projects.moduleFinance'), checked: financeEnabled,
                    onToggle: () => setFinanceEnabled(v => !v),
                    locked: !canUseFeature(plan, 'finances'),
                    onLockedClick: () => requestUpgrade({ feature: 'finances' }),
                    helperText: !canUseFeature(plan, 'finances') && financeEnabled ? t('projects.moduleFinanceRequiresPlan') : undefined,
                  },
                ]} />
              </div>
```
`usePlan`/`canUseFeature`/`requestUpgrade` sont déjà importés dans ce fichier (lignes 21-23) — ajouter seulement `ModuleToggleList` à l'import existant du barrel `./ui`.

Retirer aussi toute logique désormais inutile liée à `isPersonalProject`/`clientId`/`newClientName` dans le calcul de `disabled` de Finance — chercher `setFinanceEnabled(!!hasClient && canUseFeature(plan, 'finances'))` (ligne ~103) et le remplacer par `setFinanceEnabled(canUseFeature(plan, 'finances'))` (l'auto-cochage à la création d'un projet ne dépend plus d'avoir un client).

- [ ] **Step 5: Retirer le gating client sur l'onglet Finance**

Dans `app/src/components/ProjectHeaderBar.tsx:69`, remplacer :
```tsx
        if (tb.key === 'finance')  return project.financeEnabled && !!project.clientId;
```
par :
```tsx
        if (tb.key === 'finance')  return project.financeEnabled;
```

- [ ] **Step 6: Nettoyer la clé i18n devenue inutile**

Chercher toutes les occurrences de `moduleFinanceRequiresClient` (`grep -rn moduleFinanceRequiresClient app/src`). Si le seul usage restant après les steps 3-4 est dans les fichiers de locale eux-mêmes, retirer la clé de `app/src/locales/fr.json` et `app/src/locales/en.json`. Si un usage subsiste ailleurs (peu probable), le signaler dans le rapport au lieu de supprimer la clé.

- [ ] **Step 7: Vérification**

Depuis `app/` : `npx tsc --noEmit -p tsconfig.app.json` — doit être propre. Vérification manuelle dans le navigateur (preview) : ouvrir l'assistant de création d'un projet sans client → cocher Finance doit maintenant être possible ; ouvrir un projet existant sans client → "Modifier le projet" → cocher Finance → l'onglet Finance doit apparaître dans la barre du projet.

- [ ] **Step 8: Commit**

```bash
git add app/src/components/ui/ModuleToggleList.tsx app/src/components/ui/index.ts app/src/components/ProjectCard.tsx app/src/components/ProjectsListView.tsx app/src/components/ProjectHeaderBar.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat(projets): sélecteur de modules unifié, Finance ne nécessite plus de client"
```

---

### Task 2: Confirmation avant de désactiver un module contenant des données

**Files:**
- Create: `app/src/data/projectModuleUsage.ts`
- Modify: `app/src/components/ProjectCard.tsx` (fonction `save` de `ProjectEditPanel`)

**Interfaces:**
- Consumes: `getEvents()` (`app/src/data/eventStore.ts`), `getFiles()`/`getFolders()` (`app/src/data/fileStore.ts`), `getInvoicesByProject(pid)` (`app/src/data/financeStore.ts`), `confirmDialog(message, opts?)` (`app/src/data/confirmStore.ts`, retourne `Promise<boolean>`).
- Produces: `getProjectModuleItemCount(projectId: string, moduleKey: 'calendar' | 'files' | 'finance'): number`

- [ ] **Step 1: Écrire le helper de comptage**

```tsx
// app/src/data/projectModuleUsage.ts
import { getEvents } from './eventStore';
import { getFiles, getFolders } from './fileStore';
import { getInvoicesByProject } from './financeStore';

export type ProjectModuleKey = 'calendar' | 'files' | 'finance';

export function getProjectModuleItemCount(projectId: string, moduleKey: ProjectModuleKey): number {
  if (moduleKey === 'calendar') {
    return getEvents().filter(ev => ev.projectId === projectId).length;
  }
  if (moduleKey === 'files') {
    return getFiles().filter(f => f.projectId === projectId).length
      + getFolders().filter(fo => fo.projectId === projectId).length;
  }
  return getInvoicesByProject(projectId).length;
}
```

- [ ] **Step 2: Vérifier les noms de champs réels avant de committer**

`CalendarEvent`/`FileItem`/`FileFolder` doivent exposer un champ `projectId` — confirmer avec `grep -n "projectId" app/src/data/eventStore.ts app/src/data/fileStore.ts` (le type exact peut être `projectId?: string` ou différent ; ajuster le filtre si le nom diffère, par ex. si c'est imbriqué différemment pour les dossiers racine vs enfants).

- [ ] **Step 3: Brancher la confirmation dans `ProjectEditPanel`**

Dans `app/src/components/ProjectCard.tsx`, la fonction `save` est actuellement synchrone (`const save = () => { ... onSave(...); onClose(); }`), appelée depuis `onClose={save}` du `SFModal` et depuis un bouton Enregistrer. La rendre asynchrone et insérer la vérification juste avant `onSave(...)` :

```tsx
  const save = async () => {
    const budgetNum = Number(String(lBudget).replace(/[^\d.]/g, ''));
    const moduleChecks: { key: 'calendar' | 'files' | 'finance'; before: boolean; after: boolean; labelKey: string }[] = [
      { key: 'calendar', before: p.calendarEnabled, after: lCalendarEnabled, labelKey: 'projects.moduleCalendar' },
      { key: 'files',    before: p.filesEnabled,    after: lFilesEnabled,    labelKey: 'projects.moduleFiles' },
      { key: 'finance',  before: p.financeEnabled,  after: lFinanceEnabled,  labelKey: 'projects.moduleFinance' },
    ];
    for (const check of moduleChecks) {
      if (check.before && !check.after) {
        const count = getProjectModuleItemCount(p.id, check.key);
        if (count > 0) {
          const ok = await confirmDialog(
            t('projects.moduleDisableWithDataWarning', { module: t(check.labelKey), count }),
            { confirmLabel: t('common.continue'), cancelLabel: t('common.cancel') }
          );
          if (!ok) return;
        }
      }
    }
    onSave({
      name: lName.trim() || name,
      color: lColor,
      status: lStatus,
      statusLabel: lStatusLabel,
      phase,
      phaseLabel,
      deliveryDate: deliveryOut,
      budget: Number.isFinite(budgetNum) && budgetNum > 0 ? budgetNum : undefined,
      description: lDescription.trim() || undefined,
      calendarEnabled: lCalendarEnabled,
      filesEnabled: lFilesEnabled,
      financeEnabled: lFinanceEnabled,
    });
    onClose();
  };
```

Ajouter les imports : `import { getProjectModuleItemCount } from '../data/projectModuleUsage';` et `import { confirmDialog } from '../data/confirmStore';`.

Vérifier avant d'écrire ceci que `SFModal`'s prop `onClose` et le bouton Enregistrer acceptent bien une fonction qui retourne `Promise<void>` sans erreur de type (chercher la signature de `onClose` dans `app/src/components/ui/SFModal.tsx` — si elle est typée `() => void` strictement, TypeScript acceptera quand même une fonction `async () => {}` passée là où `() => void` est attendu, car une `Promise<void>` est assignable à `void` en position de retour ignoré ; pas de changement de type nécessaire côté `SFModal`).

Vérifier aussi que le bouton "Enregistrer" du panneau (chercher `onClick={save}` dans le même fichier) reste compatible avec un handler async — pas de changement nécessaire pour un `onClick` React.

- [ ] **Step 4: Clés i18n**

Ajouter dans `app/src/locales/fr.json` (section `projects`) :
```json
"moduleDisableWithDataWarning": "Ce module contient {{count}} élément(s) ({{module}}) — ils resteront enregistrés mais l'onglet disparaîtra. Continuer ?"
```
et dans `app/src/locales/en.json` :
```json
"moduleDisableWithDataWarning": "This module has {{count}} item(s) ({{module}}) — they'll stay saved but the tab will disappear. Continue?"
```
Vérifier si des clés génériques `common.continue`/`common.cancel` existent déjà (`grep -n '"continue"\|"cancel"' app/src/locales/fr.json`) avant d'en créer de nouvelles — réutiliser si elles existent, sinon les ajouter dans une section `common` existante du fichier.

- [ ] **Step 5: Vérification**

`npx tsc --noEmit -p tsconfig.app.json` depuis `app/`. Vérification manuelle : ouvrir un projet démo qui a des fichiers (ex. celui visible dans le screenshot du chantier, "Rush"), "Modifier le projet", décocher Fichiers, cliquer Enregistrer → une confirmation doit apparaître avant que le changement s'applique ; Annuler doit laisser le module coché.

- [ ] **Step 6: Commit**

```bash
git add app/src/data/projectModuleUsage.ts app/src/components/ProjectCard.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat(projets): confirmation avant de désactiver un module contenant des données"
```

---

### Task 3: Rendre `Invoice.clientId` optionnel (type, DB, formulaire)

**Files:**
- Modify: `app/src/data/financeStore.ts:83-86, 256-311`
- Create: `docs/superpowers/specs/2026-08-08-invoices-nullable-client-migration.sql`
- Modify: `app/src/screens/Finances.tsx:629-757, 697`

**Interfaces:**
- Produces: `Invoice.clientId: string | null` (était `string`).

- [ ] **Step 1: Élargir le type**

Dans `app/src/data/financeStore.ts:86`, remplacer :
```tsx
  clientId: string;
```
par :
```tsx
  clientId: string | null;
```
(dans `interface Invoice`).

- [ ] **Step 2: Ajuster le mapping DB ↔ objet**

Dans `interface InvoiceRow` (ligne ~233), `client_id: string;` devient `client_id: string | null;`. Dans `toInvoice` (ligne ~260), `clientId: row.client_id,` reste identique (le type s'élargit automatiquement). Dans `toInvoiceRow` (ligne ~289), `client_id: inv.clientId,` reste identique.

- [ ] **Step 3: Écrire la migration Supabase**

```sql
-- docs/superpowers/specs/2026-08-08-invoices-nullable-client-migration.sql
-- À coller et exécuter manuellement dans Supabase → SQL Editor.
-- Permet à une facture d'exister sans client (projets financés sans client,
-- ex. subventions) — voir docs/superpowers/specs/2026-08-08-project-modules-optional-design.md
alter table public.invoices alter column client_id drop not null;
```

Note dans le rapport de tâche que cette migration doit être exécutée manuellement avant que la sauvegarde d'une facture sans client fonctionne en session réelle (sinon Supabase renverra une erreur de contrainte NOT NULL) — comportement attendu du projet, pas une régression (voir CLAUDE.md, section migrations).

- [ ] **Step 4: Rendre le champ Client non obligatoire dans `InvoiceFormPanel`**

Dans `app/src/screens/Finances.tsx`, ligne 650 :
```tsx
  const effectiveClientId  = lockedClientId  ?? defaultClientId  ?? (allClients[0]?.id ?? '');
```
devient (ne plus imposer le premier client de la liste par défaut) :
```tsx
  const effectiveClientId  = lockedClientId  ?? defaultClientId  ?? '';
```

Ligne 697 :
```tsx
  const clientProjects = allProjects.filter(p => p.clientId === clientId && p.financeEnabled);
```
devient (quand aucun client n'est sélectionné, proposer les projets qui n'ont eux-mêmes pas de client, en plus du filtrage normal par client) :
```tsx
  const clientProjects = clientId
    ? allProjects.filter(p => p.clientId === clientId && p.financeEnabled)
    : allProjects.filter(p => !p.clientId && p.financeEnabled);
```

Ligne 729, la validation de sauvegarde :
```tsx
    if (!title.trim() || !clientId || !amount) return;
```
devient :
```tsx
    if (!title.trim() || !amount) return;
```

Ligne 733, la construction de l'objet `Invoice` — `clientId` est déjà lu depuis le state `clientId` (chaîne, potentiellement vide) ; remplacer par `clientId: clientId || null,` pour stocker `null` plutôt qu'une chaîne vide :
```tsx
    const inv: Invoice = {
      id, number, title: title.trim(), clientId: clientId || null,
      projectId: projectId || undefined,
      ...
```

Ligne 786-794, le `<select>` Client — ajouter une option explicite "Aucun client" en tête (actuellement l'option vide dit "Sélectionner un client" ce qui suggère un état incomplet plutôt qu'un choix volontaire) :
```tsx
              <select value={clientId} onChange={e => { setClientId(e.target.value); setProjectId(''); }} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="">{t('finance.noClientOption')}</option>
                {allClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
```
Retirer aussi l'astérisque de champ requis s'il y en avait un sur le label Client (vérifier avec `grep -n "finance.clientLabel" app/src/screens/Finances.tsx` — le label lu en Step précédent, ligne 786, n'a pas d'astérisque contrairement à Intitulé donc rien à retirer ; confirmer avant de toucher).

- [ ] **Step 5: Clé i18n**

Ajouter dans `app/src/locales/fr.json` (section `finance`, à côté de `selectClient`) :
```json
"noClientOption": "Aucun client"
```
et dans `app/src/locales/en.json` :
```json
"noClientOption": "No client"
```

- [ ] **Step 6: Vérification**

`npx tsc --noEmit -p tsconfig.app.json` depuis `app/`. Vérification manuelle : créer un projet sans client avec Finance coché (Task 1) → aller dans son onglet Finance → créer une facture sans sélectionner de client → doit s'enregistrer sans erreur en session démo (avant exécution de la migration, tester uniquement en session démo — le localStorage n'a pas de contrainte NOT NULL). Vérifier aussi que les factures existantes avec client s'affichent toujours correctement dans la liste (`clientMap[inv.clientId]` continue de résoudre normalement).

- [ ] **Step 7: Commit**

```bash
git add app/src/data/financeStore.ts docs/superpowers/specs/2026-08-08-invoices-nullable-client-migration.sql app/src/screens/Finances.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat(finances): le client d'une facture devient optionnel"
```

**Note pour l'utilisateur (à rappeler à la fin de cette tâche, pas seulement dans le commit) :** la migration SQL doit être exécutée manuellement dans Supabase avant que la création de facture sans client fonctionne pour les vrais comptes (pas les sessions démo).

---

### Task 4: Revue finale et vérification bout-en-bout

**Files:** aucun fichier propre à cette tâche — revue transversale des tâches 1-3.

- [ ] **Step 1: Typecheck complet**

Depuis `app/` : `npx tsc --noEmit -p tsconfig.app.json`. Doit être propre.

- [ ] **Step 2: Vérification manuelle bout-en-bout dans le navigateur**

En session démo (`preview_start` sur le serveur de dev), sur un projet existant :
1. "Modifier le projet" → les 3 boutons de module ont maintenant un état visuel clairement différent coché/non coché (bordure + fond accent), identique au style des pastilles de Statut plus haut dans le même panneau.
2. Décocher Fichiers sur un projet qui a des fichiers → confirmation affichée avant application ; Annuler préserve l'état ; Confirmer masque l'onglet Fichiers sans supprimer les fichiers (réactiver le module les fait réapparaître).
3. Sur un projet sans client, cocher Finance → l'onglet Finance apparaît dans la barre du projet.
4. Dans l'onglet Finance de ce projet sans client, créer une facture sans choisir de client → elle s'enregistre et apparaît dans la liste (avec un tiret ou "Aucun client" à la colonne Client, pas de crash).
5. Créer un nouveau projet via l'assistant, sans client, avec Finance coché dès le départ → même vérification qu'au point 3.

- [ ] **Step 3: Rapport**

Résumer dans le message final à l'utilisateur : ce qui a été vérifié en direct, et le rappel explicite que la migration SQL de la Task 3 doit être exécutée manuellement dans Supabase pour que "facture sans client" fonctionne en session réelle (pas seulement en démo).
