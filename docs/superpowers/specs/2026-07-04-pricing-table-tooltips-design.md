# Info-bulles au survol des lignes du tableau comparatif

## Contexte

Le tableau comparatif détaillé de `Pricing.tsx` a ~13 lignes de fonctionnalités (Projets actifs, Membres d'équipe, Invités/clients, Stockage inclus, Portail client, Modèles préconçus, Modèles personnalisés, Assistant IA, Finances & facturation, Google Calendar, Révisions Premiere Pro/DaVinci Resolve, Support, Accès API). Le nom seul de certaines lignes n'est pas toujours suffisant pour comprendre ce qui est réellement inclus. L'utilisateur veut qu'un survol du libellé d'une ligne affiche une description plus détaillée.

Aucun composant tooltip réutilisable n'existe dans le projet. Le pattern le plus proche est `InlineDropdown` (`app/src/components/ProjectTaskRow.tsx:83-110`) et `DatePickerDropdown`, tous deux conçus pour des popovers déclenchés au clic avec fond assombri — trop lourds pour un tooltip de survol léger.

## Objectif

Afficher une info-bulle au survol du libellé de chaque ligne du tableau (les 4 lignes de la section "Projets & équipe" rendues à la main, plus les 9 lignes des sections génériques Portail/Fonctionnalités/Intégrations/Support), avec un texte descriptif propre à chaque ligne.

## Composant `InfoTooltip`

Nouveau composant local à `Pricing.tsx` (à côté de `Check`/`CellValue`/`Stepper`), pas un composant partagé — spécifique à ce besoin, pas de duplication ailleurs dans l'app pour l'instant.

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
```

**Détails de comportement :**
- Délai d'affichage de 300 ms après l'entrée de la souris (évite le clignotement en traversant le tableau), disparition immédiate à la sortie.
- Positionnement en `position: fixed` calculé via `getBoundingClientRect()` au moment du survol — nécessaire car le conteneur du tableau a `overflow: hidden` (`Pricing.tsx`, section "Tableau comparatif"), ce qui couperait une info-bulle en position `absolute` normale. Aucun ancêtre du tableau n'a de `transform` CSS, donc `position: fixed` s'échappe correctement jusqu'au viewport.
- `pointerEvents: 'none'` sur la bulle — purement informatif, évite les problèmes de survol qui rentre/sort en boucle.
- `cursor: 'help'` sur l'élément déclencheur, indice visuel qu'il y a plus d'info au survol.
- Pas de détection de collision avec le bord du viewport dans cette première version (le tableau vit dans un conteneur `maxWidth: 1080` desktop, l'espace est généralement suffisant) — si un débordement apparaît en pratique sur des libellés très longs, ce sera un ajustement futur, hors scope ici.

`app/src/screens/Pricing.tsx` importe déjà `useState` de React — l'import devient `import { useState, useRef } from 'react';`.

## Composant `RowLabel` (refactor DRY)

Actuellement, le libellé de ligne est rendu à deux endroits différents avec un balisage identique dupliqué :
1. Les 4 lignes codées à la main de la section "Projets & équipe".
2. La boucle générique `OTHER_SECTIONS.map(...)` (9 lignes à travers 4 sections).

Nouveau helper qui remplace les deux :

```tsx
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

- Les 4 blocs de la section "Projets & équipe" deviennent `<RowLabel label={t('pricing.featMembers')} desc={t('pricing.descMembers')} />` (et équivalent pour les 3 autres).
- Chaque entrée de `row` dans `OTHER_SECTIONS` gagne un champ `desc` à côté de `label` (ex. `{ label: t('pricing.featPortal'), desc: t('pricing.descPortal'), values: [...] }`), et le rendu générique utilise `<RowLabel label={row.label} desc={row.desc} />` à la place du `<div><span>{row.label}</span></div>` actuel.

## Contenu (i18n)

13 nouvelles clés `pricing.descXxx` (une par ligne existante), ajoutées dans `app/src/locales/fr.json` ET `app/src/locales/en.json`, à côté de leur clé `featXxx` correspondante :

| Clé | Français | English |
|---|---|---|
| `descProjects` | Nombre de projets que vous pouvez avoir en cours simultanément. Les projets terminés ou archivés ne comptent pas dans cette limite. | Number of projects you can have active at once. Completed or archived projects don't count toward this limit. |
| `descMembers` | Comptes internes à votre studio (designers, monteurs, chargés de projet). N'inclut pas les invités/clients sur le portail. | Internal accounts on your studio's team (designers, editors, project managers). Does not include guests/clients on the portal. |
| `descGuests` | Personnes externes invitées à consulter ou commenter un projet via le portail client. Toujours gratuit et illimité. | External people invited to view or comment on a project via the client portal. Always free and unlimited. |
| `descStorage` | Espace de stockage inclus dans le prix de base pour vos fichiers, vidéos et ressources de projet. | Storage space included in the base price for your files, videos, and project resources. |
| `descPortal` | Espace dédié où vos clients consultent l'avancement, donnent leurs commentaires et approuvent les livrables. | Dedicated space where your clients review progress, leave feedback, and approve deliverables. |
| `descTemplatesPreset` | Modèles de projet prêts à l'emploi fournis par Rush pour démarrer rapidement. | Ready-to-use project templates provided by Rush to get started quickly. |
| `descTemplatesCustom` | Créez et enregistrez vos propres modèles de projet réutilisables, adaptés à votre flux de travail. | Create and save your own reusable project templates, tailored to your workflow. |
| `descAI` | Assistant intelligent intégré pour créer des projets, résumer du contenu et répondre à vos questions. | Built-in AI assistant to create projects, summarize content, and answer your questions. |
| `descFinances` | Suivi du budget par projet et génération de factures directement dans Rush. | Track project budgets and generate invoices directly within Rush. |
| `descGoogleCalendar` | Synchronisation bidirectionnelle de vos événements avec Google Calendar. | Two-way sync of your events with Google Calendar. |
| `descCreativeIntegrations` | Recevez et répondez aux commentaires de révision directement depuis votre logiciel de montage. | Receive and respond to review comments directly from your editing software. |
| `descSupport` | Niveau d'assistance offert par l'équipe Rush en cas de question ou de problème. | Level of assistance provided by the Rush team for questions or issues. |
| `descAPI` | Accès programmatique à vos données Rush pour connecter vos propres outils ou automatisations. | Programmatic access to your Rush data to connect your own tools or automations. |

## Portée

- S'applique à **toutes** les lignes du tableau (13/13), pas seulement les moins évidentes — cohérence visuelle, pas de devinette sur lesquelles "méritent" une description.
- Le survol se déclenche uniquement sur le **libellé de la ligne** (colonne de gauche), jamais sur les cellules de valeurs (coches, "Illimités", compteurs `−/+`) — évite d'interférer avec les compteurs interactifs de la Task 2 précédente.
- N'affecte pas les lignes d'en-tête de section ("PROJETS & ÉQUIPE", "PORTAIL CLIENT", etc.) ni la ligne de prix/CTA en en-tête et en pied de tableau.

## Hors scope

- Détection de collision avec le bord du viewport (tooltip qui déborderait à droite sur un très grand libellé) — acceptable pour cette première version vu le layout desktop `maxWidth: 1080`.
- Comportement tactile/mobile (pas de "tap pour afficher") — l'app est déjà orientée desktop, aucune media query existante dans ce fichier.
- Extraction d'`InfoTooltip`/`RowLabel` vers `components/ui/` comme composants partagés — reste local à `Pricing.tsx` pour l'instant, à reconsidérer si le besoin apparaît ailleurs.
