# Fusion du calculateur dans le tableau comparatif — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retirer la section calculateur autonome de `Pricing.tsx` et rendre les lignes "Membres d'équipe" / "Stockage inclus" du tableau comparatif interactives (compteurs `−/+` + saisie manuelle pour les sièges) pour Studio/Agence, avec des totaux absolus et un prix d'en-tête qui se recalcule en direct.

**Architecture:** Tout reste dans `app/src/screens/Pricing.tsx` (fichier écran autonome, convention du projet). Suppression d'abord (calculateur), puis reconstruction du tableau en un seul mouvement cohérent (state + helpers + JSX doivent atterrir ensemble pour éviter toute variable inutilisée intermédiaire, `tsconfig.app.json` ayant `noUnusedLocals` actif).

**Tech Stack:** React 19 + TypeScript, `react-i18next`, aucune nouvelle dépendance.

## Global Constraints

- Aucun texte utilisateur hard-codé — toute nouvelle chaîne passe par `t('pricing.xxx')`, ajoutée dans `app/src/locales/fr.json` ET `app/src/locales/en.json`.
- Pas de suite de tests automatisés dans ce projet — vérification via `npx tsc --noEmit -p tsconfig.app.json` (depuis `app/`) et vérification manuelle/visuelle. Le typecheck de ce fichier doit rester à **zéro erreur** avant et après chaque tâche (des erreurs pré-existantes dans d'autres fichiers du dépôt sont normales et hors scope — seul `Pricing.tsx` doit rester propre).
- `SFIcon` retourne `null` silencieusement si le nom d'icône est invalide (piège connu du projet) — toujours vérifier visuellement que les icônes `minus`/`plus` s'affichent réellement, pas juste que le code compile.
- Invités/clients : toujours illimités et gratuits sur les 3 paliers — ne jamais faire partie du calcul de sièges.
- Sièges inclus : 2 sur les 3 paliers. Studio : +3 $ CA/mois par siège additionnel (dès le 3e), Agence : +2 $ CA/mois.
- Stockage total affiché (pas de delta) : `STORAGE_TOTALS = ['50 Go', '100 Go', '250 Go', '550 Go', '1 050 Go']`, index-aligné avec `STORAGE_BLOCKS` existant (prix source, non modifié).
- Studio et Agence ont chacun leur propre état (sièges + stockage), configurable indépendamment.
- Spec source : `docs/superpowers/specs/2026-07-04-pricing-table-calculator-merge-design.md`.

---

### Task 1: Retirer la section calculateur autonome

**Files:**
- Modify: `app/src/screens/Pricing.tsx` (state, valeurs dérivées, section JSX)
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json` (retrait de 11 clés)

**Interfaces:** Aucune — tâche de suppression pure, ne produit rien de nouveau pour Task 2.

- [ ] **Step 1: Retirer le state du calculateur**

Dans `app/src/screens/Pricing.tsx`, remplacer :

```tsx
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');
  const [openFaq, setOpenFaq]  = useState<number | null>(null);
  const [calcPlan, setCalcPlan] = useState<'studio' | 'agence'>('studio');
  const [calcSeats, setCalcSeats] = useState(2);
  const [calcStorageIdx, setCalcStorageIdx] = useState(0);
```

par :

```tsx
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');
  const [openFaq, setOpenFaq]  = useState<number | null>(null);
```

- [ ] **Step 2: Retirer les valeurs dérivées du calculateur**

Dans le même fichier, juste après la déclaration de `FAQS` (`];`), supprimer entièrement ce bloc :

```tsx
  const calcPlanData = PLANS.find(p => p.key === calcPlan)!;
  const calcBasePrice = billing === 'monthly' ? calcPlanData.priceM : calcPlanData.priceY;
  const calcSeatPrice = billing === 'monthly' ? calcPlanData.seatPriceM : calcPlanData.seatPriceY;
  const calcExtraSeats = Math.max(0, calcSeats - calcPlanData.includedSeats);
  const calcSeatsCost = calcExtraSeats * calcSeatPrice;
  const calcStorageBlock = STORAGE_BLOCKS[calcStorageIdx];
  const calcStorageCost = billing === 'monthly' ? calcStorageBlock.priceM : calcStorageBlock.priceY;
  const calcTotal = calcBasePrice + calcSeatsCost + calcStorageCost;
  const calcStorageLabel = calcStorageIdx === 0 ? t('pricing.calcNoStorage') : calcStorageBlock.label;
```

(La ligne `const FAQS = [...]` juste au-dessus reste intacte ; seul ce bloc de valeurs dérivées disparaît. La ligne suivante après suppression redevient directement `const colStyle = (i: number): React.CSSProperties => ({`.)

- [ ] **Step 3: Retirer la section JSX "Calculateur"**

Toujours dans `Pricing.tsx`, la section calculateur se trouve entre la section "Tableau comparatif" et la section "Auto-hébergement". Remplacer ce bloc complet :

```tsx
        {/* ── Calculateur ──────────────────────────────────────────────── */}
        <div style={{ marginBottom: 80 }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <h2 style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--ff-display)', letterSpacing: '-0.4px', marginBottom: 8 }}>{t('pricing.calcTitle')}</h2>
            <p style={{ fontSize: 14, color: 'var(--text-3)', maxWidth: 480, margin: '0 auto' }}>{t('pricing.calcSubtitle')}</p>
          </div>

          <div style={{ maxWidth: 560, margin: '0 auto', border: '1px solid var(--border)', borderRadius: 18, padding: 32, background: 'var(--surface)' }}>
            <div style={{ display: 'inline-flex', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', marginBottom: 28 }}>
              {(['studio', 'agence'] as const).map(key => {
                const plan = PLANS.find(p => p.key === key)!;
                return (
                  <button key={key} onClick={() => setCalcPlan(key)} style={{
                    padding: '8px 20px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                    fontFamily: 'var(--ff-text)', borderRadius: key === 'studio' ? '9px 0 0 9px' : '0 9px 9px 0',
                    background: calcPlan === key ? 'var(--accent)' : 'transparent',
                    color: calcPlan === key ? 'var(--on-accent)' : 'var(--text-2)',
                  }}>
                    {t(plan.nameKey)}
                  </button>
                );
              })}
            </div>

            <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 24, lineHeight: 1.5 }}>{t('pricing.calcGuestsNote')}</p>

            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--ff-text)' }}>{t('pricing.calcSeatsLabel')}</span>
                <span style={{ fontSize: 13, fontFamily: 'var(--ff-mono)', color: 'var(--accent)', fontWeight: 700 }}>{calcSeats}</span>
              </div>
              <input type="range" min={2} max={50} value={calcSeats}
                onChange={e => setCalcSeats(parseInt(e.target.value))}
                style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--accent)' }} />
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>{t('pricing.calcSeatsIncludedNote')}</p>
            </div>

            <div style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, fontFamily: 'var(--ff-text)' }}>{t('pricing.calcStorageLabel')}</span>
                <span style={{ fontSize: 13, fontFamily: 'var(--ff-mono)', color: 'var(--accent)', fontWeight: 700 }}>{calcStorageLabel}</span>
              </div>
              <input type="range" min={0} max={STORAGE_BLOCKS.length - 1} step={1} value={calcStorageIdx}
                onChange={e => setCalcStorageIdx(parseInt(e.target.value))}
                style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--accent)' }} />
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-3)' }}>
                <span>{t('pricing.calcBreakdownBase')}</span>
                <span>{calcBasePrice} $</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-3)' }}>
                <span>{t('pricing.calcBreakdownSeats')}</span>
                <span>{calcSeatsCost} $</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--text-3)' }}>
                <span>{t('pricing.calcBreakdownStorage')}</span>
                <span>{calcStorageCost} $</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, fontWeight: 800, fontFamily: 'var(--ff-display)', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                <span>{t('pricing.calcBreakdownTotal')}</span>
                <span>{calcTotal} $ {t(billing === 'monthly' ? 'pricing.monthly' : 'pricing.yearly')} CA</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Auto-hébergement ────────────────────────────────────────────── */}
```

par simplement :

```tsx
        {/* ── Auto-hébergement ────────────────────────────────────────────── */}
```

- [ ] **Step 4: Retirer les 11 clés i18n devenues inutilisées**

Dans `app/src/locales/fr.json`, remplacer :

```json
    "supportPriority": "Prioritaire",
    "calcTitle": "Calculez votre prix exact",
    "calcSubtitle": "Ajustez le nombre de membres d'équipe et le stockage — le prix se met à jour en direct.",
    "calcGuestsNote": "Les invités et clients sur le portail sont toujours illimités et gratuits, peu importe le palier.",
    "calcSeatsLabel": "Membres d'équipe",
    "calcSeatsIncludedNote": "2 membres inclus dans le prix de base",
    "calcStorageLabel": "Stockage additionnel",
    "calcNoStorage": "Aucun ajout",
    "calcBreakdownBase": "Prix de base",
    "calcBreakdownSeats": "Membres additionnels",
    "calcBreakdownStorage": "Stockage additionnel",
    "calcBreakdownTotal": "Total",
    "selfHostTitle": "Vous préférez héberger vous-même ?",
```

par :

```json
    "supportPriority": "Prioritaire",
    "selfHostTitle": "Vous préférez héberger vous-même ?",
```

Dans `app/src/locales/en.json`, remplacer :

```json
    "supportPriority": "Priority",
    "calcTitle": "Calculate your exact price",
    "calcSubtitle": "Adjust the number of team members and storage — the price updates live.",
    "calcGuestsNote": "Guests and clients on the portal are always unlimited and free, regardless of plan.",
    "calcSeatsLabel": "Team members",
    "calcSeatsIncludedNote": "2 members included in the base price",
    "calcStorageLabel": "Extra storage",
    "calcNoStorage": "No add-on",
    "calcBreakdownBase": "Base price",
    "calcBreakdownSeats": "Extra members",
    "calcBreakdownStorage": "Extra storage",
    "calcBreakdownTotal": "Total",
    "selfHostTitle": "Prefer to self-host?",
```

par :

```json
    "supportPriority": "Priority",
    "selfHostTitle": "Prefer to self-host?",
```

- [ ] **Step 5: Vérifier les types**

Run: `cd "D:\Vibe Coding\Rush\app" && npx tsc --noEmit -p tsconfig.app.json`
Expected: zéro erreur sur `Pricing.tsx` (des erreurs pré-existantes dans d'autres fichiers du dépôt sont normales, hors scope).

- [ ] **Step 6: Vérification visuelle**

Démarrer le serveur de dev et naviguer vers `/pricing`. Vérifier :
- La section "Calculez votre prix exact" a disparu — après le tableau comparatif vient directement "Vous préférez héberger vous-même ?".
- Le tableau comparatif, les cartes de palier, la FAQ et le CTA final s'affichent normalement, sans erreur console.
- Aucune clé i18n brute (type `pricing.calcXxx`) ne s'affiche à l'écran, en français et en anglais.

- [ ] **Step 7: Commit**

```bash
git add app/src/screens/Pricing.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "refactor(pricing): remove standalone price calculator section"
```

---

### Task 2: Rendre le tableau comparatif interactif (sièges + stockage)

**Files:**
- Modify: `app/src/screens/Pricing.tsx` (données, helpers, state, restructuration du tableau)
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json` (texte de `membersNote`)

**Interfaces:**
- Consumes : `PLANS[].includedSeats/seatPriceM/seatPriceY/priceM/priceY` (existant), `STORAGE_BLOCKS[].priceM/priceY` (existant).
- Produces : `STORAGE_TOTALS: string[]`, `planTotal(plan, seats, storageIdx, billing): number`, composant `Stepper`, state `studioSeats/studioStorageIdx/agenceSeats/agenceStorageIdx`.

- [ ] **Step 1: Ajouter `STORAGE_TOTALS` et `planTotal`**

Dans `app/src/screens/Pricing.tsx`, juste après la déclaration de `STORAGE_BLOCKS` (`];`), ajouter :

```tsx
const STORAGE_TOTALS = ['50 Go', '100 Go', '250 Go', '550 Go', '1 050 Go']; // aligné index-à-index avec STORAGE_BLOCKS

function planTotal(plan: typeof PLANS[number], seats: number, storageIdx: number, billing: 'monthly' | 'yearly') {
  const base = billing === 'monthly' ? plan.priceM : plan.priceY;
  const seatPrice = billing === 'monthly' ? plan.seatPriceM : plan.seatPriceY;
  const extraSeats = Math.max(0, seats - plan.includedSeats);
  const storagePrice = billing === 'monthly' ? STORAGE_BLOCKS[storageIdx].priceM : STORAGE_BLOCKS[storageIdx].priceY;
  return base + extraSeats * seatPrice + storagePrice;
}
```

- [ ] **Step 2: Ajouter le composant `Stepper`**

Dans le même fichier, juste après la fonction `CellValue` (avant le commentaire `// ── Component ──`), ajouter :

```tsx
function Stepper({ label, onDec, onInc, disableDec, disableInc, editable, value, min, max, onChangeValue }: {
  label: string; onDec: () => void; onInc: () => void; disableDec: boolean; disableInc: boolean;
  editable?: boolean; value?: number; min?: number; max?: number; onChangeValue?: (n: number) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button onClick={onDec} disabled={disableDec} style={{
        width: 20, height: 20, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)',
        cursor: disableDec ? 'default' : 'pointer', opacity: disableDec ? 0.4 : 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
      }}>
        <SFIcon name="minus" size={10} color="var(--text-2)" />
      </button>
      {editable ? (
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={e => {
            const parsed = parseInt(e.target.value, 10);
            if (Number.isNaN(parsed)) return;
            onChangeValue?.(Math.min(max ?? parsed, Math.max(min ?? parsed, parsed)));
          }}
          style={{
            width: 44, textAlign: 'center', fontSize: 12, fontWeight: 700, fontFamily: 'var(--ff-mono)',
            color: 'var(--text)', background: 'transparent', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 0',
          }}
        />
      ) : (
        <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--ff-mono)', color: 'var(--text)', minWidth: 52, textAlign: 'center' }}>{label}</span>
      )}
      <button onClick={onInc} disabled={disableInc} style={{
        width: 20, height: 20, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)',
        cursor: disableInc ? 'default' : 'pointer', opacity: disableInc ? 0.4 : 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
      }}>
        <SFIcon name="plus" size={10} color="var(--text-2)" />
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Ajouter le state par colonne et la fonction d'en-tête de prix**

Remplacer :

```tsx
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');
  const [openFaq, setOpenFaq]  = useState<number | null>(null);
```

par :

```tsx
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');
  const [openFaq, setOpenFaq]  = useState<number | null>(null);
  const [studioSeats, setStudioSeats] = useState(2);
  const [studioStorageIdx, setStudioStorageIdx] = useState(0);
  const [agenceSeats, setAgenceSeats] = useState(2);
  const [agenceStorageIdx, setAgenceStorageIdx] = useState(0);

  function headerPriceLabel(plan: typeof PLANS[number]) {
    if (plan.key === 'gratuit') return t('settings.planFree');
    const seats = plan.key === 'studio' ? studioSeats : agenceSeats;
    const storageIdx = plan.key === 'studio' ? studioStorageIdx : agenceStorageIdx;
    const total = planTotal(plan, seats, storageIdx, billing);
    return `${total} $/${billing === 'monthly' ? 'mois' : 'an'}`;
  }
```

- [ ] **Step 4: Retirer `sectionProjects` de `COMPARE_SECTIONS` (renommé `OTHER_SECTIONS`)**

Remplacer :

```tsx
  const COMPARE_SECTIONS = [
    {
      title: t('pricing.sectionProjects'),
      rows: [
        { label: t('pricing.featProjects'), values: ['3', t('pricing.unlimited'), t('pricing.unlimited')] as [string|boolean, string|boolean, string|boolean] },
        { label: t('pricing.featMembers'),  values: [t('pricing.included2'), t('pricing.included2'), t('pricing.included2')] as [string|boolean, string|boolean, string|boolean] },
        { label: t('pricing.featGuests'),   values: [t('pricing.unlimited'), t('pricing.unlimited'), t('pricing.unlimited')] as [string|boolean, string|boolean, string|boolean] },
        { label: t('pricing.featStorage'),  values: ['5 Go', '50 Go', '50 Go'] as [string|boolean, string|boolean, string|boolean] },
      ],
    },
    {
      title: t('pricing.sectionPortal'),
```

par :

```tsx
  const OTHER_SECTIONS = [
    {
      title: t('pricing.sectionPortal'),
```

(Le reste du tableau — sections Fonctionnalités, Intégrations, Support — ne change pas, seule l'entrée `sectionProjects` disparaît et le nom de la variable change.)

Puis, plus bas dans le même bloc, remplacer la ligne de fermeture du tableau `];` — elle reste identique, seule la variable qu'elle ferme a changé de nom (`OTHER_SECTIONS` au lieu de `COMPARE_SECTIONS`), aucune autre modification requise à cet endroit.

- [ ] **Step 5: Mettre à jour toutes les références à `COMPARE_SECTIONS` restantes**

Dans le JSX du tableau, remplacer chaque occurrence de `COMPARE_SECTIONS` par `OTHER_SECTIONS` :

```tsx
            {/* Sections + rows */}
            {COMPARE_SECTIONS.map((section, si) => (
```
→
```tsx
            {/* Sections + rows */}
            {OTHER_SECTIONS.map((section, si) => (
```

et

```tsx
                    borderBottom: ri < section.rows.length - 1 || si < COMPARE_SECTIONS.length - 1 ? '1px solid var(--border)' : 'none',
```
→
```tsx
                    borderBottom: ri < section.rows.length - 1 || si < OTHER_SECTIONS.length - 1 ? '1px solid var(--border)' : 'none',
```

**Important** — dans ce même bloc, le premier `<div>` de chaque section (la barre de titre type "PORTAIL CLIENT") a un `borderTop` conditionnel :

```tsx
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', borderTop: si > 0 ? '1px solid var(--border)' : 'none' }}>
```

Comme `OTHER_SECTIONS` ne contient plus jamais la première section du tableau (elle est désormais rendue à la main avant cette boucle, voir Step 7), la condition `si > 0 ? ... : 'none'` est maintenant incorrecte pour `si === 0` (ce serait le cas de la section "Portail client", qui suit toujours la section "Projets & équipe" rendue avant elle et a donc toujours besoin d'un `borderTop`). Remplacer par une valeur constante :

```tsx
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', borderTop: '1px solid var(--border)' }}>
```

- [ ] **Step 6: Mettre à jour l'en-tête du tableau pour afficher le prix en direct**

Remplacer :

```tsx
                  <p style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--ff-display)', color: plan.popular ? 'var(--accent)' : 'var(--text)', marginBottom: 2 }}>{t(plan.nameKey)}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>
                    {billing === 'monthly' ? plan.priceM === 0 ? t('settings.planFree') : `${plan.priceM} $/mois` : plan.priceY === 0 ? t('settings.planFree') : `${plan.priceY} $/an`}
                  </p>
```

par :

```tsx
                  <p style={{ fontSize: 13, fontWeight: 800, fontFamily: 'var(--ff-display)', color: plan.popular ? 'var(--accent)' : 'var(--text)', marginBottom: 2 }}>{t(plan.nameKey)}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>
                    {headerPriceLabel(plan)}
                  </p>
```

- [ ] **Step 7: Insérer la section "Projets & équipe" interactive avant la boucle `OTHER_SECTIONS.map`**

Juste avant la ligne :

```tsx
            {/* Sections + rows */}
            {OTHER_SECTIONS.map((section, si) => (
```

insérer ce bloc (juste après la fermeture de la "Header row", c'est-à-dire après le `</div>` qui suit le `{PLANS.map((plan, i) => (...))}` de l'en-tête) :

```tsx
            {/* Section Projets & équipe (interactive) */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
              <div style={{ padding: '9px 20px' }}>
                <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--ff-mono)', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent)' }}>{t('pricing.sectionProjects')}</span>
              </div>
              {[0, 1, 2].map(i => <div key={i} style={{ ...colStyle(i), padding: '9px 8px' }} />)}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', borderBottom: '1px solid var(--border)' }}>
              <div style={{ padding: '13px 20px', display: 'flex', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{t('pricing.featProjects')}</span>
              </div>
              {['3', t('pricing.unlimited'), t('pricing.unlimited')].map((v, i) => (
                <div key={i} style={{ ...colStyle(i), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CellValue v={v} />
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', borderBottom: '1px solid var(--border)' }}>
              <div style={{ padding: '13px 20px', display: 'flex', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{t('pricing.featMembers')}</span>
              </div>
              <div style={{ ...colStyle(0), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CellValue v={t('pricing.included2')} />
              </div>
              <div style={{ ...colStyle(1), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Stepper
                  editable value={studioSeats} min={2} max={50}
                  label={String(studioSeats)}
                  onChangeValue={setStudioSeats}
                  onDec={() => setStudioSeats(s => Math.max(2, s - 1))}
                  onInc={() => setStudioSeats(s => Math.min(50, s + 1))}
                  disableDec={studioSeats <= 2}
                  disableInc={studioSeats >= 50}
                />
              </div>
              <div style={{ ...colStyle(2), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Stepper
                  editable value={agenceSeats} min={2} max={50}
                  label={String(agenceSeats)}
                  onChangeValue={setAgenceSeats}
                  onDec={() => setAgenceSeats(s => Math.max(2, s - 1))}
                  onInc={() => setAgenceSeats(s => Math.min(50, s + 1))}
                  disableDec={agenceSeats <= 2}
                  disableInc={agenceSeats >= 50}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', borderBottom: '1px solid var(--border)' }}>
              <div style={{ padding: '13px 20px', display: 'flex', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{t('pricing.featGuests')}</span>
              </div>
              {[t('pricing.unlimited'), t('pricing.unlimited'), t('pricing.unlimited')].map((v, i) => (
                <div key={i} style={{ ...colStyle(i), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <CellValue v={v} />
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', borderBottom: '1px solid var(--border)' }}>
              <div style={{ padding: '13px 20px', display: 'flex', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{t('pricing.featStorage')}</span>
              </div>
              <div style={{ ...colStyle(0), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CellValue v="5 Go" />
              </div>
              <div style={{ ...colStyle(1), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Stepper
                  label={STORAGE_TOTALS[studioStorageIdx]}
                  onDec={() => setStudioStorageIdx(i => Math.max(0, i - 1))}
                  onInc={() => setStudioStorageIdx(i => Math.min(STORAGE_TOTALS.length - 1, i + 1))}
                  disableDec={studioStorageIdx <= 0}
                  disableInc={studioStorageIdx >= STORAGE_TOTALS.length - 1}
                />
              </div>
              <div style={{ ...colStyle(2), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Stepper
                  label={STORAGE_TOTALS[agenceStorageIdx]}
                  onDec={() => setAgenceStorageIdx(i => Math.max(0, i - 1))}
                  onInc={() => setAgenceStorageIdx(i => Math.min(STORAGE_TOTALS.length - 1, i + 1))}
                  disableDec={agenceStorageIdx <= 0}
                  disableInc={agenceStorageIdx >= STORAGE_TOTALS.length - 1}
                />
              </div>
            </div>

```

- [ ] **Step 8: Mettre à jour le texte de `membersNote`**

Dans `app/src/locales/fr.json`, remplacer :

```json
    "membersNote": "Studio : +3 $ CA/mois par membre d'équipe additionnel (dès le 3e). Agence : +2 $ CA/mois (dès le 3e). Les invités et clients sur le portail restent toujours illimités et gratuits, sur tous les paliers.",
```

par :

```json
    "membersNote": "Studio : +3 $ CA/mois par membre d'équipe additionnel (dès le 3e). Agence : +2 $ CA/mois (dès le 3e).",
```

Dans `app/src/locales/en.json`, remplacer :

```json
    "membersNote": "Studio: +$3 CA/month per additional team member (from the 3rd on). Agency: +$2 CA/month (from the 3rd on). Guests and clients on the portal always remain unlimited and free, on every plan.",
```

par :

```json
    "membersNote": "Studio: +$3 CA/month per additional team member (from the 3rd on). Agency: +$2 CA/month (from the 3rd on).",
```

- [ ] **Step 9: Vérifier les types**

Run: `cd "D:\Vibe Coding\Rush\app" && npx tsc --noEmit -p tsconfig.app.json`
Expected: zéro erreur sur `Pricing.tsx` (aucune variable inutilisée — `studioSeats`, `agenceSeats`, `studioStorageIdx`, `agenceStorageIdx`, `STORAGE_TOTALS`, `planTotal`, `Stepper` doivent tous être consommés par ce que ce Step a ajouté).

- [ ] **Step 10: Vérification visuelle et interactive**

Démarrer le serveur de dev et naviguer vers `/pricing`. Vérifier :
- Les icônes `−`/`+` s'affichent réellement dans les compteurs (pas de bouton vide — `SFIcon` retourne `null` silencieusement si le nom d'icône est invalide).
- Ligne "Membres d'équipe" : Gratuit affiche "2 inclus" (texte statique) ; Studio et Agence affichent chacun un champ numérique éditable avec boutons `−`/`+`.
- Taper directement un chiffre dans le champ des sièges Studio (ex. effacer et taper "12") met à jour la valeur.
- Utiliser les flèches haut/bas du clavier dans ce champ (focus dessus) incrémente/décrémente par 1.
- Cliquer les boutons `−`/`+` fonctionne aussi ; désactivés à 2 (min) et 50 (max).
- Ligne "Stockage inclus" : Gratuit affiche "5 Go" (texte statique) ; Studio/Agence affichent un compteur qui avance par paliers absolus (50 Go → 100 Go → 250 Go → 550 Go → 1 050 Go), boutons désactivés aux extrémités.
- Modifier les réglages de la colonne Studio ne change PAS ceux de la colonne Agence (état indépendant) — vérifier en réglant Studio à 20 sièges et Agence à 5, les deux valeurs doivent rester distinctes.
- Le prix affiché en en-tête de la colonne Studio change en direct quand on ajuste ses sièges/stockage ; idem pour Agence ; Gratuit reste "Gratuit" fixe.
- Basculer le toggle mensuel/annuel recalcule les prix d'en-tête de Studio/Agence selon leurs réglages courants.
- La section "Portail client" (juste après) a bien une bordure de séparation au-dessus d'elle (pas de bordure manquante entre "Projets & équipe" et "Portail client").
- Vérifier en français ET en anglais qu'aucune clé i18n brute ne s'affiche.

- [ ] **Step 11: Commit**

```bash
git add app/src/screens/Pricing.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat(pricing): merge seat/storage calculator into comparison table"
```

---

### Task 3: Vérification complète de bout en bout

**Files:** aucun changement de code — validation uniquement.

- [ ] **Step 1: Build**

Run: `cd "D:\Vibe Coding\Rush\app" && npx tsc --noEmit -p tsconfig.app.json`
Expected: zéro erreur sur `Pricing.tsx` (erreurs pré-existantes dans d'autres fichiers du dépôt acceptables, hors scope de ce chantier).

- [ ] **Step 2: Parcours manuel complet en français**

Démarrer le serveur de dev, naviguer vers `/pricing` en français :
- Cartes de palier (haut de page) : prix fixes inchangés (Gratuit/19 $/49 $), aucun lien avec les réglages du tableau plus bas.
- Tableau comparatif : en-têtes de prix, ligne "Membres d'équipe" (statique + 2 compteurs), ligne "Invités / clients" (statique "Illimités" ×3), ligne "Stockage inclus" (statique + 2 compteurs), sections Fonctionnalités/Intégrations/Support inchangées.
- Note sous le tableau mentionne le prix par siège Studio/Agence (sans répéter la phrase sur les invités).
- Section Auto-hébergement, FAQ, CTA final inchangés.

- [ ] **Step 3: Parcours manuel complet en anglais**

Basculer la langue vers l'anglais et refaire le même parcours que l'étape 2. Vérifier qu'aucun texte français ne subsiste et qu'aucune clé brute ne s'affiche.

- [ ] **Step 4: Cas limites**

- Sièges Studio à 2 (minimum) : bouton `−` désactivé, coût additionnel nul, prix d'en-tête = prix de base.
- Sièges Agence à 50 (maximum, atteint via saisie manuelle d'un grand nombre puis clampé) : bouton `+` désactivé.
- Taper une valeur hors bornes dans le champ des sièges (ex. "999") : la valeur appliquée est clampée à 50, pas de `NaN` affiché nulle part.
- Stockage à l'index 0 ("50 Go") et à l'index 4 ("1 050 Go") : boutons `−`/`+` désactivés aux extrémités respectives.
- Configurer Studio et Agence différemment simultanément (ex. Studio 30 sièges + 250 Go, Agence 4 sièges + 50 Go) et confirmer que les deux prix d'en-tête sont corrects et distincts en même temps.

- [ ] **Step 5: Commit final si des ajustements ont été faits pendant la vérification**

```bash
git add -A
git commit -m "fix(pricing): address issues found during end-to-end verification"
```

(Ne committer que s'il y a eu des changements réels à cette étape — sinon, passer directement à la fin.)
