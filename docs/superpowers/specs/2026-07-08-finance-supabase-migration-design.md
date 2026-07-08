# Migration Finance vers Supabase — Design

**Status:** Approuvé par l'utilisateur (2026-07-08). 12e chantier Phase 2 (backend Supabase) — dernier store métier restant après la clôture de la Phase 2 principale le 2026-07-07 (voir mémoire `finance-chantier-deferred` / `audit-roadmap`).

## Contexte

`financeStore.ts` est le seul store de données métier réelles qui restait volontairement en `localStorage` après les 11 chantiers précédents. Il avait été mis de côté parce que l'utilisateur avait potentiellement des fonctionnalités futures en tête pour Finances qui auraient pu changer la forme des données. Redemandé le 2026-07-08 : confirmé qu'il n'y a plus de changement de fonctionnalité prévu — migration telle quelle.

## Ce qui est migré

`financeStore.ts` gère aujourd'hui 4 choses, toutes en `localStorage` :

1. **Factures** (`Invoice[]`, clé `sf_invoices`) — numéro, client, projet, montant, lignes de taxes, statut, dates, commentaires internes.
2. **Méthodes de paiement du studio** (`PaymentMethod[]`, clé `sf_payment_methods`) — virement, Interac, carte, etc., partagées par tout le studio.
3. **Paramètres par défaut de facturation** (`InvoiceDefaults`, clé `sf_invoice_defaults`) — taxes par défaut, délai de paiement, devise, préfixe de numéro : un seul enregistrement par studio.
4. **PDF de facture** (`sf_inv_pdf_<id>`, base64 en `localStorage`, limité à ce que le navigateur peut stocker).

Les 3 premiers deviennent de vraies tables Supabase, scopées par studio (toute l'équipe voit les mêmes données, comme pour Projets/Clients/Tâches). Le 4e (PDF) ne devient pas une nouvelle table : il est branché sur le système de stockage de fichiers déjà construit pour les vidéos/fichiers du studio (`fileContentStore.ts` + la fonction Supabase `file-storage`, sur Cloudflare R2) — ce système accepte déjà n'importe quel identifiant comme clé d'objet, donc un PDF de facture peut l'utiliser directement en lui donnant un identifiant du type `invoice-pdf-<id de la facture>`, sans toucher à l'infrastructure existante.

## Ce qui NE change PAS

- Les 3 comptes de démonstration (Léa, Sarah, Thomas) gardent exactement le comportement actuel en `localStorage`, byte pour byte.
- Aucun champ, aucune fonctionnalité, aucun écran ne change. Les 3 pages Finance (globale, projet, fiche client) et leurs panneaux continuent d'appeler les mêmes fonctions exportées par `financeStore.ts`, avec les mêmes signatures.
- La numérotation automatique des factures (`nextInvoiceNumber`) reste un calcul côté client sur la liste en mémoire, comme aujourd'hui — pas de changement.

## Schéma Supabase

Trois tables, toutes scopées par studio (comme Projets/Clients/Tâches — tout le monde dans le studio voit les mêmes données) :

```sql
create table invoices (
  id text primary key,
  studio_id uuid not null references studios(id),
  number text not null,
  client_id text not null,
  project_id text,
  title text not null,
  amount numeric not null,
  tax_lines jsonb not null default '[]',
  tax numeric not null default 0,
  total numeric not null default 0,
  currency text not null default 'CAD',
  status text not null default 'draft',
  issued_date text not null default '',
  due_date text not null default '',
  sent_date text,
  payment_terms_days integer,
  notes text,
  internal_note text,
  paid_date text,
  paid_amount numeric,
  has_pdf boolean not null default false,
  comments jsonb not null default '[]',
  created_at timestamptz not null default now()
);

alter table invoices enable row level security;

create policy "studio members can manage their invoices"
  on invoices for all
  using (studio_id in (select my_studio_ids()))
  with check (studio_id in (select my_studio_ids()));

grant select, insert, update, delete on invoices to authenticated;

create table payment_methods (
  id text primary key,
  studio_id uuid not null references studios(id),
  type text not null,
  name text not null,
  icon text not null,
  details text not null default '',
  fee_percent numeric,
  fee_label text,
  is_recommended boolean not null default false,
  is_enabled boolean not null default true,
  stripe_link text,
  sort_order integer not null default 0
);

alter table payment_methods enable row level security;

create policy "studio members can manage their payment methods"
  on payment_methods for all
  using (studio_id in (select my_studio_ids()))
  with check (studio_id in (select my_studio_ids()));

grant select, insert, update, delete on payment_methods to authenticated;

create table invoice_defaults (
  studio_id uuid primary key references studios(id),
  tax_lines jsonb not null default '[]',
  payment_terms_days integer not null default 30,
  currency text not null default 'CAD',
  notes text not null default '',
  number_prefix text not null default 'INV'
);

alter table invoice_defaults enable row level security;

create policy "studio members can manage their invoice defaults"
  on invoice_defaults for all
  using (studio_id in (select my_studio_ids()))
  with check (studio_id in (select my_studio_ids()));

grant select, insert, update, delete on invoice_defaults to authenticated;
```

Notes de conception, cohérentes avec tous les chantiers précédents :
- Tous les identifiants sont `text` générés côté client (`inv_<timestamp>`, jamais `uuid`/`gen_random_uuid()`), comme partout ailleurs dans le projet.
- Les dates (`issued_date`, `due_date`, `sent_date`, `paid_date`) restent des chaînes `text` au format `AAAA-MM-JJ`, pas un type `date` — l'application les traite déjà comme des chaînes partout (même convention que `projects.delivery_date`).
- `tax_lines` et `comments` restent en `jsonb` : ce sont de petites listes à forme libre déjà traitées comme des blobs côté application (comme `taxLines` l'était déjà), pas besoin de tables séparées.
- `invoice_defaults` a une seule ligne par studio (`studio_id` est la clé primaire) — pas de ligne au démarrage, elle est créée à la première sauvegarde de paramètres ; en attendant, l'application retombe sur les valeurs par défaut d'usine, exactement comme aujourd'hui.

## `financeStore.ts` — le nouveau store

Même pattern que tous les stores migrés (`resourceStore.ts`, `clientStore.ts`, etc.) :
- Sessions démo (`isDemoSession()`) : comportement `localStorage` inchangé.
- Sessions réelles : chargement en mémoire de la liste des factures, des méthodes de paiement et des paramètres par défaut du studio au premier accès ; lectures synchrones depuis ce cache ; écritures immédiates dans le cache (mise à jour visible tout de suite) puis envoi en arrière-plan vers Supabase.

Toutes les fonctions d'écriture existantes (`addInvoice`, `updateInvoice`, `removeInvoice`, `addInvoiceComment`, `addPaymentMethod`, `updatePaymentMethod`, `removePaymentMethod`, `setInvoiceDefaults`) sont des opérations élément-par-élément (ajouter/modifier/supprimer une seule facture ou méthode à la fois) — aucune ne remplace une liste entière par une nouvelle, donc le bug de "cache écrasé avant calcul de ce qui a été supprimé" déjà rencontré et documenté dans deux chantiers précédents (mémoire `stale-cache-diff-bug-pattern`) ne peut pas se reproduire ici structurellement. Vérifié quand même explicitement pendant la revue de code.

`sendInvoice` et `setInvoiceStatus` (ajoutée lors du chantier précédent) continuent de fonctionner sur le cache en mémoire exactement comme avant, sans changement de logique.

## PDF de facture — réutilisation du stockage existant

`savePdf`, `loadPdf`, `removePdf` restent exportées par `financeStore.ts` (les écrans n'ont donc presque rien à changer), mais leur intérieur délègue désormais au système de stockage déjà construit pour les vidéos/fichiers du studio (`fileContentStore.ts`, sur Cloudflare R2), avec un identifiant du type `invoice-pdf-<id de la facture>` :

```ts
export function savePdf(invoiceId: string, file: File): void {   // avant : (invoiceId, dataUrl: string)
  setFileContent(`invoice-pdf-${invoiceId}`, file);
  updateInvoice(invoiceId, { hasPdf: true });
}
export function loadPdf(invoiceId: string): string | null {      // signature inchangée
  return getFileContent(`invoice-pdf-${invoiceId}`);
}
export function removePdf(invoiceId: string): void {              // signature inchangée
  removeFileContent(`invoice-pdf-${invoiceId}`);
  updateInvoice(invoiceId, { hasPdf: false });
}
```

Différence pratique pour `InvoiceFormPanel` : le champ d'upload PDF passait le fichier par un `FileReader` pour obtenir une chaîne base64 avant d'appeler `savePdf` ; il passera désormais directement l'objet `File`, sans étape de lecture intermédiaire.

Un nouveau champ `hasPdf` (booléen) est ajouté à chaque facture — mis à jour par `savePdf`/`removePdf` en même temps que le fichier. C'est ce qui permet aux tableaux de factures (qui doivent vérifier « est-ce que cette facture a un PDF » pour chacune des lignes affichées) de le savoir instantanément sans devoir demander un lien d'accès au fichier pour chaque ligne — seul l'aperçu du PDF (quand on clique réellement pour l'ouvrir) a besoin d'aller chercher ce lien. Aucun changement d'interface pour l'utilisateur (le bouton « Choisir un PDF » se comporte pareil), et aucune limite de taille supplémentaire n'est introduite par les autres tables.

En session démo, `fileContentStore.ts` garde son comportement `localStorage` actuel (base64, limité à 3 Mo) — donc les PDF de démonstration existants continuent de fonctionner sans changement.

## Hors scope

- Aucune fonctionnalité nouvelle (paiement partiel, facturation récurrente, intégration Stripe réelle, etc.) — confirmé avec l'utilisateur, migration telle quelle uniquement.
- Aucun changement aux 3 pages Finance ni à leurs panneaux, au-delà du branchement interne vers Supabase/`fileContentStore.ts`.

## Vérification

- Régression démo : les 3 comptes de démonstration continuent de créer/modifier/supprimer des factures, méthodes de paiement, paramètres par défaut, et d'attacher un PDF, exactement comme avant.
- Session réelle : créer une facture, la modifier, changer son statut, ajouter un commentaire, attacher un PDF — recharger la page confirme que tout persiste. Un deuxième compte du même studio voit les mêmes factures.
- Isolation entre studios : un studio ne voit jamais les factures/méthodes de paiement d'un autre studio.
- Le PDF attaché à une facture reste accessible après un rechargement complet, sans limite de taille artificielle.
- Vérification TypeScript/lint sans nouvelle régression par rapport à la référence actuelle du projet (185 erreurs / 339 problèmes lint).
