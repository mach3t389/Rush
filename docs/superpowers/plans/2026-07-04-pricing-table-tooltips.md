# Info-bulles au survol du tableau comparatif — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher une info-bulle descriptive au survol du libellé de chacune des 13 lignes du tableau comparatif de `Pricing.tsx`, avec un délai d'affichage et un positionnement qui échappe au `overflow: hidden` du tableau.

**Architecture:** Tout dans `app/src/screens/Pricing.tsx` (fichier écran autonome). Deux nouveaux composants locaux (`InfoTooltip`, `RowLabel`) remplacent le balisage de libellé de ligne dupliqué à deux endroits (les 4 lignes codées à la main de la section "Projets & équipe", et la boucle générique `OTHER_SECTIONS.map`).

**Tech Stack:** React 19 + TypeScript, `react-i18next`, aucune nouvelle dépendance.

## Global Constraints

- Aucun texte utilisateur hard-codé — les 13 nouvelles descriptions passent par `t('pricing.descXxx')`, ajoutées dans `app/src/locales/fr.json` ET `app/src/locales/en.json`.
- Pas de suite de tests automatisés — vérification via `npx tsc --noEmit -p tsconfig.app.json` (depuis `app/`) et vérification manuelle/visuelle. `Pricing.tsx` doit rester à zéro erreur avant et après la tâche.
- Le survol se déclenche uniquement sur le libellé de la ligne (colonne de gauche), jamais sur les cellules de valeurs (coches, "Illimités", compteurs `−/+`).
- S'applique aux 13 lignes existantes, pas seulement certaines — cohérence visuelle totale.
- Positionnement en `position: fixed` (pas `absolute`) — le conteneur du tableau a `overflow: hidden`, ce qui couperait une info-bulle positionnée normalement.
- Délai d'affichage ~300 ms, disparition immédiate à la sortie.
- Spec source : `docs/superpowers/specs/2026-07-04-pricing-table-tooltips-design.md`.

---

### Task 1: Composants `InfoTooltip`/`RowLabel` + contenu i18n + câblage dans le tableau

**Files:**
- Modify: `app/src/screens/Pricing.tsx` (import, nouveaux composants, données `OTHER_SECTIONS`, 5 sites de rendu de libellé de ligne)
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json` (13 nouvelles clés `descXxx`)

**Interfaces:**
- Produces: composant `RowLabel({ label: string; desc: string })`, composant `InfoTooltip({ text: string; children: React.ReactNode })`.

- [ ] **Step 1: Ajouter `useRef` à l'import React**

Dans `app/src/screens/Pricing.tsx`, remplacer :

```tsx
import { useState } from 'react';
```

par :

```tsx
import { useState, useRef } from 'react';
```

- [ ] **Step 2: Ajouter les 13 clés `descXxx` dans `fr.json`**

Dans `app/src/locales/fr.json`, remplacer :

```json
    "featAPI": "Accès API",
    "unlimited": "Illimités",
```

par :

```json
    "featAPI": "Accès API",
    "descProjects": "Nombre de projets que vous pouvez avoir en cours simultanément. Les projets terminés ou archivés ne comptent pas dans cette limite.",
    "descMembers": "Comptes internes à votre studio (designers, monteurs, chargés de projet). N'inclut pas les invités/clients sur le portail.",
    "descGuests": "Personnes externes invitées à consulter ou commenter un projet via le portail client. Toujours gratuit et illimité.",
    "descStorage": "Espace de stockage inclus dans le prix de base pour vos fichiers, vidéos et ressources de projet.",
    "descPortal": "Espace dédié où vos clients consultent l'avancement, donnent leurs commentaires et approuvent les livrables.",
    "descTemplatesPreset": "Modèles de projet prêts à l'emploi fournis par Rush pour démarrer rapidement.",
    "descTemplatesCustom": "Créez et enregistrez vos propres modèles de projet réutilisables, adaptés à votre flux de travail.",
    "descAI": "Assistant intelligent intégré pour créer des projets, résumer du contenu et répondre à vos questions.",
    "descFinances": "Suivi du budget par projet et génération de factures directement dans Rush.",
    "descGoogleCalendar": "Synchronisation bidirectionnelle de vos événements avec Google Calendar.",
    "descCreativeIntegrations": "Recevez et répondez aux commentaires de révision directement depuis votre logiciel de montage.",
    "descSupport": "Niveau d'assistance offert par l'équipe Rush en cas de question ou de problème.",
    "descAPI": "Accès programmatique à vos données Rush pour connecter vos propres outils ou automatisations.",
    "unlimited": "Illimités",
```

- [ ] **Step 3: Ajouter les 13 clés `descXxx` dans `en.json`**

Dans `app/src/locales/en.json`, remplacer :

```json
    "featAPI": "API access",
    "unlimited": "Unlimited",
```

par :

```json
    "featAPI": "API access",
    "descProjects": "Number of projects you can have active at once. Completed or archived projects don't count toward this limit.",
    "descMembers": "Internal accounts on your studio's team (designers, editors, project managers). Does not include guests/clients on the portal.",
    "descGuests": "External people invited to view or comment on a project via the client portal. Always free and unlimited.",
    "descStorage": "Storage space included in the base price for your files, videos, and project resources.",
    "descPortal": "Dedicated space where your clients review progress, leave feedback, and approve deliverables.",
    "descTemplatesPreset": "Ready-to-use project templates provided by Rush to get started quickly.",
    "descTemplatesCustom": "Create and save your own reusable project templates, tailored to your workflow.",
    "descAI": "Built-in AI assistant to create projects, summarize content, and answer your questions.",
    "descFinances": "Track project budgets and generate invoices directly within Rush.",
    "descGoogleCalendar": "Two-way sync of your events with Google Calendar.",
    "descCreativeIntegrations": "Receive and respond to review comments directly from your editing software.",
    "descSupport": "Level of assistance provided by the Rush team for questions or issues.",
    "descAPI": "Programmatic access to your Rush data to connect your own tools or automations.",
    "unlimited": "Unlimited",
```

- [ ] **Step 4: Ajouter les composants `InfoTooltip` et `RowLabel`**

Dans `app/src/screens/Pricing.tsx`, juste après la fonction `Stepper` (avant le commentaire `// ── Component ──`), ajouter :

```tsx
function InfoTooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const timerRef = useRef<number | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  const show = () => {
    timerRef.current = window.setTimeout(() => {
      if (ref.current) setRect(ref.current.getBoundingClientRect());
    }, 300);
  };
  const hide = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setRect(null);
  };

  return (
    <span ref={ref} onMouseEnter={show} onMouseLeave={hide} style={{ display: 'inline-flex', cursor: 'help' }}>
      {children}
      {rect && (
        <div style={{
          position: 'fixed', top: rect.bottom + 8, left: rect.left, zIndex: 500,
          maxWidth: 260, padding: '10px 12px', borderRadius: 10,
          background: 'var(--surface-3)', border: '1px solid var(--border-2)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5, fontFamily: 'var(--ff-text)',
          pointerEvents: 'none',
        }}>
          {text}
        </div>
      )}
    </span>
  );
}

function RowLabel({ label, desc }: { label: string; desc: string }) {
  return (
    <div style={{ padding: '13px 20px', display: 'flex', alignItems: 'center' }}>
      <InfoTooltip text={desc}>
        <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{label}</span>
      </InfoTooltip>
    </div>
  );
}
```

- [ ] **Step 5: Ajouter un champ `desc` à chaque ligne de `OTHER_SECTIONS`**

Dans `app/src/screens/Pricing.tsx`, remplacer :

```tsx
  const OTHER_SECTIONS = [
    {
      title: t('pricing.sectionPortal'),
      rows: [
        { label: t('pricing.featPortal'),   values: [t('pricing.brandedPortal'), t('pricing.whiteLabel'), t('pricing.whiteLabel')] as [string|boolean, string|boolean, string|boolean] },
      ],
    },
    {
      title: t('pricing.sectionFeatures'),
      rows: [
        { label: t('pricing.featTemplatesPreset'), values: [true, true, true] as [boolean, boolean, boolean] },
        { label: t('pricing.featTemplatesCustom'), values: [false, true, true] as [boolean, boolean, boolean] },
        { label: t('pricing.featAI'),              values: [false, true, true] as [boolean, boolean, boolean] },
        { label: t('pricing.featFinances'),        values: [false, true, true] as [boolean, boolean, boolean] },
      ],
    },
    {
      title: t('pricing.sectionIntegrations'),
      rows: [
        { label: t('pricing.featGoogleCalendar'),        values: [t('pricing.comingSoon'), t('pricing.comingSoon'), t('pricing.comingSoon')] as [string|boolean, string|boolean, string|boolean] },
        { label: t('pricing.featCreativeIntegrations'),  values: [false, t('pricing.comingSoon'), t('pricing.comingSoon')] as [string|boolean, string|boolean, string|boolean] },
      ],
    },
    {
      title: t('pricing.sectionSupport'),
      rows: [
        { label: t('pricing.featSupport'), values: [t('pricing.supportEmail'), t('pricing.supportEmail'), t('pricing.supportPriority')] as [string|boolean, string|boolean, string|boolean] },
        { label: t('pricing.featAPI'),     values: [false, false, true] as [boolean, boolean, boolean] },
      ],
    },
  ];
```

par :

```tsx
  const OTHER_SECTIONS = [
    {
      title: t('pricing.sectionPortal'),
      rows: [
        { label: t('pricing.featPortal'), desc: t('pricing.descPortal'), values: [t('pricing.brandedPortal'), t('pricing.whiteLabel'), t('pricing.whiteLabel')] as [string|boolean, string|boolean, string|boolean] },
      ],
    },
    {
      title: t('pricing.sectionFeatures'),
      rows: [
        { label: t('pricing.featTemplatesPreset'), desc: t('pricing.descTemplatesPreset'), values: [true, true, true] as [boolean, boolean, boolean] },
        { label: t('pricing.featTemplatesCustom'), desc: t('pricing.descTemplatesCustom'), values: [false, true, true] as [boolean, boolean, boolean] },
        { label: t('pricing.featAI'),              desc: t('pricing.descAI'),              values: [false, true, true] as [boolean, boolean, boolean] },
        { label: t('pricing.featFinances'),        desc: t('pricing.descFinances'),        values: [false, true, true] as [boolean, boolean, boolean] },
      ],
    },
    {
      title: t('pricing.sectionIntegrations'),
      rows: [
        { label: t('pricing.featGoogleCalendar'),        desc: t('pricing.descGoogleCalendar'),        values: [t('pricing.comingSoon'), t('pricing.comingSoon'), t('pricing.comingSoon')] as [string|boolean, string|boolean, string|boolean] },
        { label: t('pricing.featCreativeIntegrations'),  desc: t('pricing.descCreativeIntegrations'),  values: [false, t('pricing.comingSoon'), t('pricing.comingSoon')] as [string|boolean, string|boolean, string|boolean] },
      ],
    },
    {
      title: t('pricing.sectionSupport'),
      rows: [
        { label: t('pricing.featSupport'), desc: t('pricing.descSupport'), values: [t('pricing.supportEmail'), t('pricing.supportEmail'), t('pricing.supportPriority')] as [string|boolean, string|boolean, string|boolean] },
        { label: t('pricing.featAPI'),     desc: t('pricing.descAPI'),     values: [false, false, true] as [boolean, boolean, boolean] },
      ],
    },
  ];
```

- [ ] **Step 6: Câbler `RowLabel` dans les 4 lignes codées à la main de "Projets & équipe"**

Dans `app/src/screens/Pricing.tsx`, remplacer les 4 blocs suivants (chacun individuellement, ils ne sont pas contigus dans le fichier — chaque `<div style={{ padding: '13px 20px'...` fait partie d'un bloc de ligne plus large qui contient aussi les cellules de valeurs ; ne touchez QUE le premier `<div>` de chaque bloc de ligne, celui qui contient le libellé) :

Remplacer :
```tsx
              <div style={{ padding: '13px 20px', display: 'flex', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{t('pricing.featProjects')}</span>
              </div>
```
par :
```tsx
              <RowLabel label={t('pricing.featProjects')} desc={t('pricing.descProjects')} />
```

Remplacer :
```tsx
              <div style={{ padding: '13px 20px', display: 'flex', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{t('pricing.featMembers')}</span>
              </div>
```
par :
```tsx
              <RowLabel label={t('pricing.featMembers')} desc={t('pricing.descMembers')} />
```

Remplacer :
```tsx
              <div style={{ padding: '13px 20px', display: 'flex', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{t('pricing.featGuests')}</span>
              </div>
```
par :
```tsx
              <RowLabel label={t('pricing.featGuests')} desc={t('pricing.descGuests')} />
```

Remplacer :
```tsx
              <div style={{ padding: '13px 20px', display: 'flex', alignItems: 'center' }}>
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{t('pricing.featStorage')}</span>
              </div>
```
par :
```tsx
              <RowLabel label={t('pricing.featStorage')} desc={t('pricing.descStorage')} />
```

- [ ] **Step 7: Câbler `RowLabel` dans la boucle générique `OTHER_SECTIONS.map`**

Dans `app/src/screens/Pricing.tsx`, remplacer :

```tsx
                    <div style={{ padding: '13px 20px', display: 'flex', alignItems: 'center' }}>
                      <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{row.label}</span>
                    </div>
```

par :

```tsx
                    <RowLabel label={row.label} desc={row.desc} />
```

- [ ] **Step 8: Vérifier les types**

Run: `cd "D:\Vibe Coding\Rush\app" && npx tsc --noEmit -p tsconfig.app.json`
Expected: zéro erreur sur `Pricing.tsx` (des erreurs pré-existantes dans d'autres fichiers du dépôt sont normales, hors scope).

- [ ] **Step 9: Vérification visuelle et interactive**

Démarrer le serveur de dev et naviguer vers `/pricing`. Vérifier :
- Survoler le libellé "Membres d'équipe" (colonne de gauche) : après ~300 ms, une petite carte sombre apparaît sous le libellé avec le texte descriptif. Elle disparaît immédiatement en sortant la souris.
- Répéter pour au moins 2 autres lignes parmi les 4 codées à la main (Projets actifs, Invités / clients, Stockage inclus) et au moins 2 lignes de la boucle générique (ex. Assistant IA, Accès API) — toutes les 13 lignes doivent avoir une info-bulle fonctionnelle.
- Survoler une cellule de valeur (une coche, "Illimités", ou un compteur `−/+`) ne doit PAS déclencher d'info-bulle — seul le libellé de gauche le fait.
- L'info-bulle ne doit pas être coupée/masquée par le bord du tableau (le conteneur a `overflow: hidden`) — confirmer qu'elle s'affiche entièrement par-dessus le contenu qui suit.
- Vérifier en français ET en anglais que le texte descriptif correspond à la langue active, sans clé i18n brute affichée.
- Confirmer que les compteurs `−/+` des sièges/stockage restent pleinement fonctionnels (ce changement ne doit pas les affecter).

- [ ] **Step 10: Commit**

```bash
git add app/src/screens/Pricing.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat(pricing): add hover tooltips with descriptions to comparison table rows"
```

---

### Task 2: Vérification complète de bout en bout

**Files:** aucun changement de code — validation uniquement.

- [ ] **Step 1: Build**

Run: `cd "D:\Vibe Coding\Rush\app" && npx tsc --noEmit -p tsconfig.app.json`
Expected: zéro erreur sur `Pricing.tsx`.

- [ ] **Step 2: Parcours complet des 13 lignes en français**

Démarrer le serveur de dev, naviguer vers `/pricing` en français, et survoler individuellement chacune des 13 lignes du tableau comparatif (Projets actifs, Membres d'équipe, Invités / clients, Stockage inclus, Portail client, Modèles préconçus, Modèles personnalisés, Assistant IA, Finances & facturation, Google Calendar, Révisions Premiere Pro & DaVinci Resolve, Support, Accès API). Confirmer que chacune affiche une description différente et pertinente, sans texte manquant ni clé brute.

- [ ] **Step 3: Parcours complet des 13 lignes en anglais**

Basculer la langue vers l'anglais et refaire le même parcours que l'étape 2. Vérifier qu'aucun texte français ne subsiste.

- [ ] **Step 4: Cas limites**

- Survoler rapidement plusieurs libellés l'un après l'autre (sans attendre 300 ms sur chacun) : aucune info-bulle fantôme ne doit rester affichée après que la souris ait quitté.
- Survoler un libellé puis, avant les 300 ms, bouger la souris vers une cellule de valeur de la même ligne (ex. un compteur) : aucune info-bulle ne doit apparaître (le survol du libellé a été interrompu).
- Survoler "Membres d'équipe" puis cliquer/interagir avec le compteur `−/+` de sièges juste en dessous du libellé : l'interaction avec le compteur doit rester pleinement fonctionnelle, non bloquée par l'info-bulle.

- [ ] **Step 5: Commit final si des ajustements ont été faits pendant la vérification**

```bash
git add -A
git commit -m "fix(pricing): address issues found during end-to-end verification"
```

(Ne committer que s'il y a eu des changements réels à cette étape — sinon, passer directement à la fin.)
