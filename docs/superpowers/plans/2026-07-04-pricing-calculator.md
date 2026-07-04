# Calculateur de prix par sièges + stockage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le modèle "membres illimités" de `Pricing.tsx` par un modèle 2-sièges-inclus-partout + surplus payant sur Studio/Agence, avec un calculateur interactif (palier + sièges + stockage → prix en direct) et une barre fixe en bas d'écran qui affiche ce prix en permanence.

**Architecture:** Tout dans `app/src/screens/Pricing.tsx` — fichier écran autonome existant, pas de nouveau composant séparé (conforme à la convention "larges fichiers .tsx autonomes" du projet). Le state du calculateur (`calcPlan`, `calcSeats`, `calcStorageIdx`) est déclaré au niveau du composant `Pricing` pour être partagé entre la section calculateur et la barre fixe.

**Tech Stack:** React 19 + TypeScript, `react-i18next` pour tous les textes, `<input type="range">` natif stylé avec `accentColor: 'var(--accent)'` (pattern déjà utilisé dans `ResourceDetail.tsx`), aucune nouvelle dépendance.

## Global Constraints

- Aucun texte utilisateur hard-codé — toute nouvelle chaîne passe par `t('pricing.xxx')`, ajoutée dans `app/src/locales/fr.json` ET `app/src/locales/en.json` (les deux fichiers, toujours en parallèle).
- Ce projet n'a pas de suite de tests automatisés (confirmé dans `CLAUDE.md`) — la vérification de chaque tâche se fait via `npx tsc --noEmit -p tsconfig.app.json` (depuis `app/`) pour la correction de types, puis via le serveur de preview pour le comportement visuel/interactif. Ne pas inventer de framework de test.
- Polices : `var(--ff-text)` pour les boutons/labels UI, `var(--ff-mono)` pour les valeurs numériques/techniques (prix, compteurs), `var(--ff-display)` pour les titres et le total final — cohérent avec le reste du fichier.
- Invités/clients du portail : toujours illimités et gratuits sur les 3 paliers, ne font jamais partie du calcul de sièges — doit rester visible/explicite dans la copie UI (tableau comparatif + calculateur).
- Sièges inclus : 2 sur les 3 paliers (Gratuit, Studio, Agence) — jamais moins que 2 nulle part dans l'UI.
- Spec source : `docs/superpowers/specs/2026-07-04-pricing-calculator-design.md`.

---

### Task 1: Modèle de données — sièges inclus + tableau comparatif

**Files:**
- Modify: `app/src/screens/Pricing.tsx:8-12` (PLANS), `app/src/screens/Pricing.tsx:48-56` (COMPARE_SECTIONS, section `sectionProjects`), `app/src/screens/Pricing.tsx:295-313` (ajout d'une note sous le tableau comparatif)
- Modify: `app/src/locales/fr.json:2154-2223` (namespace `pricing`)
- Modify: `app/src/locales/en.json:2141-2210` (namespace `pricing`)

**Interfaces:**
- Produces: chaque entrée de `PLANS` a désormais les champs `includedSeats: number`, `seatPriceM: number`, `seatPriceY: number` — consommés par Task 2 et Task 3.

- [ ] **Step 1: Ajouter les champs de sièges à `PLANS`**

Remplacer (lignes 8-12 de `app/src/screens/Pricing.tsx`) :

```tsx
const PLANS = [
  { key: 'gratuit', nameKey: 'settings.planSolo',   descKey: 'settings.planSoloDesc',   priceM: 0,  priceY: 0,   storage: '5 Go',   cta: 'pricing.startFree',   link: '/register', popular: false },
  { key: 'studio',  nameKey: 'settings.planStudio',  descKey: 'settings.planStudioDesc', priceM: 19, priceY: 182, storage: '50 Go',  cta: 'pricing.choosePlan',  link: '/register', popular: true  },
  { key: 'agence',  nameKey: 'settings.planAgence',  descKey: 'settings.planAgenceDesc', priceM: 49, priceY: 470, storage: '50 Go', cta: 'pricing.chooseAgency',link: '/register', popular: false },
];
```

par :

```tsx
const PLANS = [
  { key: 'gratuit', nameKey: 'settings.planSolo',   descKey: 'settings.planSoloDesc',   priceM: 0,  priceY: 0,   storage: '5 Go',   cta: 'pricing.startFree',   link: '/register', popular: false, includedSeats: 2, seatPriceM: 0, seatPriceY: 0 },
  { key: 'studio',  nameKey: 'settings.planStudio',  descKey: 'settings.planStudioDesc', priceM: 19, priceY: 182, storage: '50 Go',  cta: 'pricing.choosePlan',  link: '/register', popular: true,  includedSeats: 2, seatPriceM: 3, seatPriceY: 29 },
  { key: 'agence',  nameKey: 'settings.planAgence',  descKey: 'settings.planAgenceDesc', priceM: 49, priceY: 470, storage: '50 Go', cta: 'pricing.chooseAgency',link: '/register', popular: false, includedSeats: 2, seatPriceM: 2, seatPriceY: 19 },
];
```

- [ ] **Step 2: Ajouter les 3 nouvelles clés i18n utilisées par le tableau comparatif**

Dans `app/src/locales/fr.json`, dans l'objet `"pricing"` (après la ligne `"featStorage": "Stockage inclus",`), ajouter :

```json
    "featGuests": "Invités / clients",
    "included2": "2 inclus",
    "membersNote": "Studio : +3 $ CA/mois par membre d'équipe additionnel (dès le 3e). Agence : +2 $ CA/mois (dès le 3e). Les invités et clients sur le portail restent toujours illimités et gratuits, sur tous les paliers.",
```

Dans `app/src/locales/en.json`, dans l'objet `"pricing"` (après la ligne `"featStorage": "Included storage",`), ajouter :

```json
    "featGuests": "Guests / clients",
    "included2": "2 included",
    "membersNote": "Studio: +$3 CA/month per additional team member (from the 3rd on). Agency: +$2 CA/month (from the 3rd on). Guests and clients on the portal always remain unlimited and free, on every plan.",
```

- [ ] **Step 3: Mettre à jour la ligne "Membres" et ajouter la ligne "Invités / clients" dans `COMPARE_SECTIONS`**

Remplacer (lignes 48-56) :

```tsx
    {
      title: t('pricing.sectionProjects'),
      rows: [
        { label: t('pricing.featProjects'), values: ['3', t('pricing.unlimited'), t('pricing.unlimited')] as [string|boolean, string|boolean, string|boolean] },
        { label: t('pricing.featMembers'),  values: [t('pricing.upTo5'), t('pricing.unlimited'), t('pricing.unlimited')] as [string|boolean, string|boolean, string|boolean] },
        { label: t('pricing.featStorage'),  values: ['5 Go', '50 Go', '50 Go'] as [string|boolean, string|boolean, string|boolean] },
      ],
    },
```

par :

```tsx
    {
      title: t('pricing.sectionProjects'),
      rows: [
        { label: t('pricing.featProjects'), values: ['3', t('pricing.unlimited'), t('pricing.unlimited')] as [string|boolean, string|boolean, string|boolean] },
        { label: t('pricing.featMembers'),  values: [t('pricing.included2'), t('pricing.included2'), t('pricing.included2')] as [string|boolean, string|boolean, string|boolean] },
        { label: t('pricing.featGuests'),   values: [t('pricing.unlimited'), t('pricing.unlimited'), t('pricing.unlimited')] as [string|boolean, string|boolean, string|boolean] },
        { label: t('pricing.featStorage'),  values: ['5 Go', '50 Go', '50 Go'] as [string|boolean, string|boolean, string|boolean] },
      ],
    },
```

- [ ] **Step 4: Ajouter la note sur le prix des sièges additionnels sous le tableau comparatif**

Dans `app/src/screens/Pricing.tsx`, la section "Tableau comparatif" se termine ainsi (lignes 310-313) :

```tsx
              ))}
            </div>
          </div>
        </div>
```

Remplacer par (ajout d'un `<p>` entre la fermeture de la boîte bordée et la fermeture du wrapper) :

```tsx
              ))}
            </div>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', marginTop: 16 }}>
            {t('pricing.membersNote')}
          </p>
        </div>
```

- [ ] **Step 5: Vérifier les types**

Run: `cd "D:\Vibe Coding\Rush\app" && npx tsc --noEmit -p tsconfig.app.json`
Expected: aucune erreur (`PLANS` a maintenant un type uniforme à 3 entrées, toutes avec les mêmes champs — pas d'erreur de forme).

- [ ] **Step 6: Vérification visuelle**

Démarrer le serveur de dev (`npm run dev` depuis `app/`, ou via l'outil de preview) et naviguer vers `/pricing`. Vérifier dans le tableau comparatif :
- La ligne "Membres d'équipe" affiche "2 inclus" sur les 3 colonnes.
- Une nouvelle ligne "Invités / clients" affiche "Illimités" sur les 3 colonnes.
- Une phrase apparaît sous le tableau, mentionnant le prix des sièges additionnels Studio/Agence et le fait que les invités restent illimités.
- Basculer la langue (paramètre langue ou `i18n.changeLanguage('en')` via la console) et confirmer que le texte anglais s'affiche correctement (pas de clé brute du type `pricing.featGuests` affichée à l'écran).

- [ ] **Step 7: Commit**

```bash
git add app/src/screens/Pricing.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat(pricing): switch to 2-seats-included model across all plans"
```

---

### Task 2: Section calculateur interactive (remplace la section "Stockage")

**Files:**
- Modify: `app/src/screens/Pricing.tsx` (ajout de state après la ligne `const [openFaq, setOpenFaq] = useState<number | null>(null);`, ajout de valeurs calculées après `FAQS`, remplacement de la section "Stockage" lignes 315-338)
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json` (namespace `pricing`)

**Interfaces:**
- Consumes: `PLANS[].includedSeats/seatPriceM/seatPriceY` (Task 1), `STORAGE_BLOCKS` (existant, inchangé), `billing` (state existant du composant).
- Produces: state `calcPlan: 'studio' | 'agence'`, `calcSeats: number`, `calcStorageIdx: number`, et valeurs dérivées `calcPlanData`, `calcBasePrice: number`, `calcSeatsCost: number`, `calcStorageCost: number`, `calcTotal: number`, `calcStorageLabel: string` — tous consommés par Task 3 (barre fixe).

- [ ] **Step 1: Ajouter les clés i18n du calculateur**

Dans `app/src/locales/fr.json`, dans l'objet `"pricing"`, remplacer les deux lignes :

```json
    "storageTitle": "Stockage supplémentaire",
    "storageDesc": "Chaque plan inclut un quota de base. Ajoutez des blocs indépendamment de votre formule.",
```

par :

```json
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
```

Dans `app/src/locales/en.json`, dans l'objet `"pricing"`, remplacer les deux lignes :

```json
    "storageTitle": "Extra storage",
    "storageDesc": "Each plan includes a base quota. Add blocks independently of your feature plan.",
```

par :

```json
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
```

- [ ] **Step 2: Ajouter le state du calculateur**

Dans `app/src/screens/Pricing.tsx`, remplacer :

```tsx
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');
  const [openFaq, setOpenFaq]  = useState<number | null>(null);
```

par :

```tsx
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly');
  const [openFaq, setOpenFaq]  = useState<number | null>(null);
  const [calcPlan, setCalcPlan] = useState<'studio' | 'agence'>('studio');
  const [calcSeats, setCalcSeats] = useState(2);
  const [calcStorageIdx, setCalcStorageIdx] = useState(0);
```

- [ ] **Step 3: Ajouter les valeurs calculées**

Dans `app/src/screens/Pricing.tsx`, juste après la déclaration de `FAQS` (le tableau se termine par `];` après les 4 entrées `{ q: ..., a: ... }`), ajouter :

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

- [ ] **Step 4: Remplacer la section "Stockage" par la section calculateur**

Remplacer entièrement le bloc (lignes 315-338 de `app/src/screens/Pricing.tsx`) :

```tsx
        {/* ── Stockage ─────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 80 }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <h2 style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--ff-display)', letterSpacing: '-0.4px', marginBottom: 8 }}>{t('pricing.storageTitle')}</h2>
            <p style={{ fontSize: 14, color: 'var(--text-3)', maxWidth: 480, margin: '0 auto' }}>{t('pricing.storageDesc')}</p>
          </div>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            {STORAGE_BLOCKS.map(block => {
              const price = billing === 'monthly' ? block.priceM : block.priceY;
              return (
                <div key={block.label} style={{
                  borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)',
                  padding: '16px 22px', textAlign: 'center', minWidth: 110,
                }}>
                  <SFIcon name="hard-drive" size={20} color="var(--text-3)" />
                  <p style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--ff-display)', marginTop: 8, marginBottom: 4 }}>{block.label}</p>
                  <p style={{ fontSize: 11, fontFamily: 'var(--ff-mono)', color: 'var(--accent)', fontWeight: 600 }}>
                    {price === 0 ? t('pricing.storageIncluded') : `+${price} $ CA${billing === 'monthly' ? '/mois' : '/an'}`}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
```

par :

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
                <span>{calcTotal} $ {t(billing === 'monthly' ? 'pricing.monthly' : 'pricing.yearly')}</span>
              </div>
            </div>
          </div>
        </div>
```

Note : `SFIcon` reste utilisé ailleurs dans le fichier (badges de plan, FAQ, etc.) — ne pas retirer l'import même si ce bloc spécifique ne l'utilise plus.

- [ ] **Step 5: Vérifier les types**

Run: `cd "D:\Vibe Coding\Rush\app" && npx tsc --noEmit -p tsconfig.app.json`
Expected: aucune erreur.

- [ ] **Step 6: Vérification visuelle et interactive**

Démarrer le serveur de dev et naviguer vers `/pricing`. Vérifier :
- La section "Stockage" a disparu, remplacée par "Calculez votre prix exact" au même endroit (après le tableau comparatif, avant "Vous préférez héberger vous-même ?").
- Cliquer sur "Studio" puis "Agence" dans le sélecteur change le prix de base affiché dans le détail (19 $ vs 49 $ en mensuel).
- Déplacer le slider "Membres d'équipe" de 2 à 50 : en dessous ou à 2, "Membres additionnels" affiche `0 $` ; au-dessus, le montant augmente de 3 $ (Studio) ou 2 $ (Agence) par siège.
- Déplacer le slider stockage : à la position 0, le label affiche "Aucun ajout" et le coût est `0 $` ; aux positions suivantes, le label et le prix correspondent à `STORAGE_BLOCKS` (+50 Go, +200 Go, etc.).
- Le total en bas du bloc est bien la somme des trois lignes.
- Basculer le toggle mensuel/annuel en haut de la page : les montants du calculateur changent en conséquence (pas seulement les cartes de palier).

- [ ] **Step 7: Commit**

```bash
git add app/src/screens/Pricing.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat(pricing): add interactive seats + storage price calculator"
```

---

### Task 3: Barre fixe en bas d'écran avec le prix en direct

**Files:**
- Modify: `app/src/screens/Pricing.tsx` (ajout de la barre fixe avant la fermeture du composant, ajustement du padding du contenu)
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json` (namespace `pricing`)

**Interfaces:**
- Consumes: `calcPlanData`, `calcSeats`, `calcStorageLabel`, `calcTotal`, `billing` (Task 2).

- [ ] **Step 1: Ajouter les clés i18n de la barre fixe**

Dans `app/src/locales/fr.json`, dans l'objet `"pricing"`, ajouter (par exemple juste après `"calcBreakdownTotal": "Total",`) :

```json
    "calcBarSummary": "{{plan}} · {{seats}} membres · {{storage}}",
    "calcBarCta": "Commencer",
```

Dans `app/src/locales/en.json`, dans l'objet `"pricing"`, ajouter (juste après `"calcBreakdownTotal": "Total",`) :

```json
    "calcBarSummary": "{{plan}} · {{seats}} members · {{storage}}",
    "calcBarCta": "Get started",
```

- [ ] **Step 2: Réserver de l'espace pour la barre fixe**

Dans `app/src/screens/Pricing.tsx`, remplacer :

```tsx
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 24px' }}>
```

par :

```tsx
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 24px 96px' }}>
```

- [ ] **Step 3: Ajouter la barre fixe**

Dans `app/src/screens/Pricing.tsx`, la fin du composant ressemble à :

```tsx
        {/* ── CTA final ────────────────────────────────────────────────── */}
        <div style={{
          textAlign: 'center', padding: '60px 40px', marginBottom: 60,
          borderRadius: 20, border: '1px solid var(--border)',
          background: 'linear-gradient(135deg, rgba(249,255,0,0.05) 0%, transparent 100%)',
        }}>
          <h2 style={{ fontSize: 32, fontWeight: 900, fontFamily: 'var(--ff-display)', letterSpacing: '-0.8px', marginBottom: 12 }}>{t('pricing.ctaTitle')}</h2>
          <p style={{ fontSize: 14, color: 'var(--text-3)', marginBottom: 28 }}>{t('pricing.ctaDesc')}</p>
          <Link to="/register" style={{
            display: 'inline-block', padding: '14px 32px', borderRadius: 12,
            background: 'var(--accent)', color: 'var(--on-accent)',
            fontSize: 15, fontWeight: 700, fontFamily: 'var(--ff-text)', textDecoration: 'none',
          }}>
            {t('pricing.ctaButton')}
          </Link>
        </div>

      </div>
    </div>
  );
}
```

Remplacer les 3 dernières lignes (`      </div>\n    </div>\n  );\n}`) par :

```tsx
      </div>

      {/* ── Barre de prix fixe ───────────────────────────────────────── */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 60,
        borderTop: '1px solid var(--border)', background: 'rgba(10,10,10,0.92)', backdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, flexWrap: 'wrap', rowGap: 8,
        padding: '14px 24px',
      }}>
        <span style={{ fontSize: 13, color: 'var(--text-2)', fontFamily: 'var(--ff-mono)' }}>
          {t('pricing.calcBarSummary', { plan: t(calcPlanData.nameKey), seats: calcSeats, storage: calcStorageLabel })}
          {' → '}
          <strong style={{ color: 'var(--accent)', fontSize: 15 }}>{calcTotal} $</strong>
          {' '}{t(billing === 'monthly' ? 'pricing.monthly' : 'pricing.yearly')}
        </span>
        <Link to="/register" style={{
          padding: '8px 20px', borderRadius: 9, background: 'var(--accent)', color: 'var(--on-accent)',
          fontSize: 13, fontWeight: 700, fontFamily: 'var(--ff-text)', textDecoration: 'none', whiteSpace: 'nowrap',
        }}>
          {t('pricing.calcBarCta')}
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Vérifier les types**

Run: `cd "D:\Vibe Coding\Rush\app" && npx tsc --noEmit -p tsconfig.app.json`
Expected: aucune erreur.

- [ ] **Step 5: Vérification visuelle et interactive**

Démarrer le serveur de dev et naviguer vers `/pricing`. Vérifier :
- Une barre apparaît en permanence collée au bas de la fenêtre, peu importe l'endroit du scroll (hero, tableau comparatif, FAQ, tout en bas).
- Le texte de la barre correspond à la sélection courante du calculateur (ex. `Studio · 2 membres · Aucun ajout → 19 $ / mois`).
- Modifier un slider dans la section calculateur (sièges ou stockage) met à jour le texte de la barre immédiatement, sans devoir scroller jusqu'à la section.
- Le bouton "Commencer" dans la barre mène bien vers `/register`.
- Le contenu de la page (section CTA finale en particulier) n'est pas caché derrière la barre fixe — il doit rester un espace visible entre le dernier bloc de contenu et la barre.

- [ ] **Step 6: Commit**

```bash
git add app/src/screens/Pricing.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat(pricing): add sticky bottom bar with live calculated price"
```

---

### Task 4: Vérification complète de bout en bout

**Files:** aucun changement de code — validation uniquement.

- [ ] **Step 1: Build complet**

Run: `cd "D:\Vibe Coding\Rush\app" && npm run build`
Expected: build réussi sans erreur TypeScript ni erreur de build Vite.

- [ ] **Step 2: Parcours manuel complet en français**

Démarrer le serveur de dev, naviguer vers `/pricing` avec la langue réglée sur français :
- Vérifier les 3 cartes de palier, le tableau comparatif (lignes "Membres d'équipe" et "Invités / clients"), la note sous le tableau, la section calculateur, la barre fixe, la section Auto-hébergement, la FAQ et le CTA final s'affichent tous correctement, sans texte manquant ni clé i18n brute affichée à l'écran.
- Basculer mensuel/annuel : tous les prix affichés (cartes, tableau, calculateur, barre fixe) changent de façon cohérente.

- [ ] **Step 3: Parcours manuel complet en anglais**

Basculer la langue vers l'anglais (`i18n.changeLanguage('en')` ou via Paramètres → Personnalisation → Langue) et refaire le même parcours que l'étape 2. Vérifier qu'aucun texte français ne subsiste et qu'aucune clé brute ne s'affiche.

- [ ] **Step 4: Vérifier les cas limites du calculateur**

- Sièges au minimum (2) : coût additionnel sièges = 0 $, total = prix de base + stockage seulement.
- Sièges au maximum (50) : total = prix de base + 48 × prix/siège + stockage — vérifier que le nombre affiché est cohérent (pas de `NaN`, pas de valeur négative).
- Stockage à l'index 0 : coût additionnel stockage = 0 $, label = "Aucun ajout" / "No add-on".
- Changer de palier (Studio ↔ Agence) alors qu'un nombre de sièges > 2 est déjà sélectionné : le nombre de sièges ne doit pas se réinitialiser (reste à la valeur choisie), seul le prix par siège et le prix de base changent.

- [ ] **Step 5: Commit final si des ajustements ont été faits pendant la vérification**

```bash
git add -A
git commit -m "fix(pricing): address issues found during end-to-end verification"
```

(Ne committer que s'il y a eu des changements réels à cette étape — sinon, passer directement à la fin.)
