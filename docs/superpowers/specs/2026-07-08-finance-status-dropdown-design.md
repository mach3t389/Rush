# Révision Finance — statut par menu déroulant, cohérence visuelle, position du bouton Modifier — Design

**Status:** Approuvé par l'utilisateur (2026-07-08).

## Contexte

L'utilisateur trouve la manière actuelle de changer le statut de paiement d'une facture peu pratique, et remarque que le style entre la page Finance globale (`Finances.tsx`) et la page Finance d'un projet (`ProjetFinances.tsx`) n'est pas uniforme, et que le bouton "Modifier la facture" n'est pas placé à un endroit intuitif/cohérent avec le reste de la plateforme.

Confirmé par lecture du code : il existe en fait **3 tableaux de factures** partageant les mêmes composants (`StatusPill`, `InvoiceFormPanel`, `InvoiceDetailPanel` exportés depuis `Finances.tsx`) :
- `Finances.tsx` (page Finance globale)
- `ProjetFinances.tsx` (page Finance d'un projet)
- `FicheClient.tsx` (onglet Finances d'une fiche client)

Aujourd'hui, changer le statut d'une facture se fait de 3 façons différentes et incohérentes :
1. Des icônes d'action ponctuelles dans chaque ligne de tableau ("Envoyer" si `draft`, "Marquer payée" sauf si `paid`/`cancelled`/`draft`) — dupliquées à l'identique dans les 3 tableaux.
2. Des boutons équivalents dans `InvoiceDetailPanel` (panneau de détail).
3. Un `<select>` listant les 6 statuts, caché au milieu du long formulaire de modification (`InvoiceFormPanel`) — le seul endroit où on peut réellement choisir n'importe quel statut (y compris revenir à `draft` ou passer à `cancelled`).

Le bouton "Modifier" (icône `edit-2`, différente de l'icône `square-pen` utilisée partout ailleurs dans la plateforme pour "modifier" — fiche client, cartes de projet, modèles) est mêlé aux autres boutons d'action (Envoyer / Marquer payée / Voir le PDF) en bas du panneau de détail, plutôt qu'en haut à côté du bouton de fermeture, comme c'est le cas partout ailleurs.

## Objectif

Remplacer les 3 mécanismes de changement de statut par un seul : un badge de statut cliquable avec menu déroulant, sur le même modèle que le statut d'une tâche (`ProjectTaskRow.tsx` : bouton avec pastille de couleur + chevron, `InlineDropdown` qui liste les options). Uniformiser visuellement les 3 tableaux via ce badge partagé. Déplacer le bouton "Modifier" en haut du panneau de détail, à côté du X, avec l'icône `square-pen`.

## Changements

### 1. `financeStore.ts` — nouvelle fonction `setInvoiceStatus`

Ajout d'une fonction qui centralise la logique métier déjà existante (aujourd'hui dupliquée dans `handleSend`/`handleMarkPaid` de chaque écran) :

```ts
export function setInvoiceStatus(id: string, newStatus: InvoiceStatus): void {
  const inv = _invoices.find(i => i.id === id);
  if (!inv || inv.status === newStatus) return;

  if (newStatus === 'sent' && inv.status === 'draft') {
    sendInvoice(id); // logique existante : calcule sentDate, issuedDate, dueDate
    return;
  }
  if (newStatus === 'paid') {
    updateInvoice(id, { status: 'paid', paidDate: new Date().toISOString().slice(0, 10), paidAmount: inv.total });
    return;
  }
  updateInvoice(id, { status: newStatus });
}
```

Comportement : passer à "Envoyée" depuis "Brouillon" déclenche le calcul automatique des dates (comme aujourd'hui). Passer à "Payée" fixe la date de paiement à aujourd'hui et le montant payé au total (comme aujourd'hui). Tout autre changement (Vue, En retard, Annulée, retour à Brouillon, ou passer à Envoyée depuis un autre statut que Brouillon) met juste à jour le statut, sans effet de bord cette fois — c'est nouveau : ces transitions n'avaient aucune interface avant (seulement accessibles via le `<select>` caché du formulaire).

`sendInvoice` reste exportée telle quelle (utilisée en interne par `setInvoiceStatus`).

### 2. `Finances.tsx` — `StatusPill` devient interactif

Nouvelle prop optionnelle `onChange` :

```ts
export function StatusPill({ status, onChange }: { status: InvoiceStatus; onChange?: (s: InvoiceStatus) => void }) {
  const { t } = useTranslation();
  const cfg = STATUS_CFG[status];
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  const pill = (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, background: cfg.bg, color: cfg.fg, fontFamily: 'var(--ff-mono)', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
      {t(cfg.labelKey)}
    </span>
  );

  if (!onChange) return pill;

  const ALL_STATUSES: InvoiceStatus[] = ['draft', 'sent', 'viewed', 'paid', 'overdue', 'cancelled'];

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={e => { e.stopPropagation(); setAnchor((e.currentTarget as HTMLElement).getBoundingClientRect()); setOpen(o => !o); }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
      >
        {pill}
        <SFIcon name="chevron-down" size={10} color="var(--text-3)" />
      </button>
      {open && (
        <FinanceInlineDropdown onClose={() => setOpen(false)} anchorRect={anchor}>
          {ALL_STATUSES.map(s => (
            <button key={s} onClick={e => { e.stopPropagation(); onChange(s); setOpen(false); }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: 'none', background: s === status ? 'var(--surface-3)' : 'transparent', color: 'var(--text)', fontSize: 12, fontFamily: 'var(--ff-text)', cursor: 'pointer', textAlign: 'left' }}
              onMouseEnter={e => { if (s !== status) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
              onMouseLeave={e => { if (s !== status) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_CFG[s].fg, display: 'block', flexShrink: 0 }} />
              {t(STATUS_CFG[s].labelKey)}
            </button>
          ))}
        </FinanceInlineDropdown>
      )}
    </div>
  );
}
```

`FinanceInlineDropdown` : copie locale du composant `InlineDropdown` existant (positionnement par `anchorRect`, fond `var(--surface)`, ombre) — même pattern que `ProjectTaskRow.tsx`/`Travail.tsx`/`Taches.tsx`, chacun ayant sa propre copie locale (convention déjà en place dans le code, pas de fichier partagé à créer).

Sites d'utilisation mis à jour pour passer `onChange`:
- `Finances.tsx` ligne ~1153 (ligne de tableau) : `<StatusPill status={inv.status} onChange={s => setInvoiceStatus(inv.id, s)} />`
- `Finances.tsx` ligne ~314 (`InvoiceDetailPanel`, header) : idem, avec `invoice.id`.
- `ProjetFinances.tsx` ligne ~125 (ligne de tableau) : idem.
- `FicheClient.tsx` ligne ~1053 (ligne de tableau) : idem.

Import de `setInvoiceStatus` ajouté dans les 3 fichiers écrans qui ne l'ont pas déjà.

### 3. Suppression des mécanismes redondants

- **Icônes "Envoyer" / "Marquer payée" dans les lignes de tableau** (`Finances.tsx`, `ProjetFinances.tsx`, `FicheClient.tsx`) : supprimées. Les fonctions `handleMarkPaid`/`handleSend` locales à `Finances.tsx` (celles utilisées par les lignes de tableau, pas `InvoiceDetailPanel`) sont supprimées si elles ne servent plus qu'à ça.
- **Boutons "Envoyer" / "Marquer payée" dans `InvoiceDetailPanel`** : supprimés (`canSend`, `canPay`, `handleSend`, `handleMarkPaid` locaux à ce composant). Il ne reste que "Voir le PDF" (si applicable) dans la rangée de boutons du panneau.
- **Champ `<select>` de statut dans `InvoiceFormPanel`** : supprimé (la ligne "N° facture + Statut" devient juste "N° facture" seul, ou reprend toute la largeur). Le statut se change uniquement via le badge, plus jamais depuis le formulaire de modification.

Ce que ça laisse comme actions dans chaque ligne de tableau : badge de statut cliquable, "Voir le PDF" (si présent), "Supprimer" (avec confirmation inline, inchangé).

### 4. Repositionnement du bouton "Modifier"

Dans `InvoiceDetailPanel`, le header passe de :
```
[N° facture]
[Titre]                                    [X]
[Badge statut]
```
à :
```
[N° facture]                    [✎ Modifier] [X]
[Titre]
[Badge statut cliquable]
```

Bouton "Modifier" : petit bouton icône seul (comme sur `ProjectCard.tsx`, 28×28px, `square-pen`, fond `var(--surface-3)`, devient accent au survol), placé immédiatement à gauche du bouton de fermeture — même position relative que partout ailleurs dans la plateforme où un panneau/carte a un bouton fermer + modifier ensemble.

## Uniformité visuelle entre les 3 tableaux

Les 3 tableaux gardent leurs colonnes propres à leur contexte (celui de la page globale a une colonne Projet et plus de filtres/KPIs, celui d'un projet et celui d'une fiche client n'en ont pas besoin puisqu'ils sont déjà filtrés — c'est voulu, pas une incohérence à corriger). Ce qui devient identique aux 3 endroits : le badge de statut (même composant, même interaction), et le jeu d'actions restantes par ligne (Voir le PDF, Supprimer). Les tout petits écarts de style relevés en lisant le code (padding de ligne 10px vs 11px) sont alignés sur 11px partout au passage, pour que les lignes aient exactement la même hauteur.

## Hors scope

- Pas de changement au design des factures PDF, aux taxes, aux méthodes de paiement, ni à la migration de `financeStore.ts` vers Supabase (volontairement reportée — voir mémoire `finance-chantier-deferred`). Cette révision reste 100% interface, sur les données existantes en `localStorage`.
- Le paiement partiel (`paidAmount` différent du total) n'existe pas aujourd'hui et n'est pas ajouté ici.

## Vérification

- Régression visuelle : les 3 pages Finance s'affichent normalement, badges de statut identiques partout.
- Changer un statut via le badge dans chaque tableau (global, projet, fiche client) et dans le panneau de détail — la facture se met à jour instantanément (comme avant), rechargement de page conserve le changement (localStorage).
- Passer une facture `draft` → `sent` via le badge recalcule bien la date d'échéance (comportement `sendInvoice` préservé).
- Passer une facture à `paid` via le badge fixe bien la date de paiement à aujourd'hui et le montant payé au total.
- Le formulaire de modification ne montre plus le champ statut ; modifier une facture existante ne peut plus changer son statut par ce biais.
- Le bouton "Modifier" apparaît en haut du panneau de détail à côté du X, avec l'icône `square-pen`.
- Vérification TypeScript/lint sans nouvelle régression par rapport à la base de référence actuelle.
