# Consentement notifications à l'inscription

**Date :** 2026-08-04
**Statut :** Approuvé, prêt pour plan d'implémentation

## Contexte

`notifPrefsStore.ts` gère déjà des préférences de notification par catégorie
(`comment`, `mention`, `approval`) × canal (`inapp`, `email`), éditables dans
Paramètres → Notifications. Ces préférences ne sont cependant jamais écrites
explicitement à la création du compte : `loadNotifPrefs()` retombe sur des
`DEFAULTS` codés en dur (mentions et approbations envoyées par email) tant
qu'aucune ligne `notif_prefs` n'existe en base. Résultat : un nouvel
utilisateur reçoit silencieusement des courriels sans jamais avoir donné son
accord.

## Objectif

Demander explicitement, au moment de la création d'un compte, si
l'utilisateur souhaite recevoir des notifications par courriel — et
persister ce choix immédiatement, plutôt que de compter sur un fallback
implicite.

## Périmètre

**Inclus :**
- Une case à cocher, cochée par défaut, dans les 3 formulaires qui créent un
  compte Supabase Auth : `Register.tsx` (fondateur de studio),
  `TeamInvitationAccept.tsx` (membre d'équipe invité, branche inscription),
  `ClientInvitationAccept.tsx` (client invité, branche inscription).
- Écriture explicite d'une ligne `notif_prefs` juste après la création du
  compte, reflétant le choix de la case.
- Traductions FR/EN pour le nouveau libellé.

**Exclu (hors périmètre, pas touché) :**
- `DigestPrefs` (récap quotidien) — déjà `digestMode: false` par défaut,
  déjà un opt-in séparé dans Paramètres. Pas de changement.
- Les branches "connexion" de `TeamInvitationAccept.tsx` /
  `ClientInvitationAccept.tsx` (un utilisateur qui a déjà un compte et se
  contente de se connecter pour accepter l'invitation) — pas de nouvelle
  case, aucun nouveau compte n'est créé.
- Toute UI de gestion fine par catégorie sur l'écran d'inscription — ce
  niveau de détail reste dans Paramètres → Notifications, comme aujourd'hui.

## Comportement

**Libellé (FR) :**
> Je souhaite recevoir des notifications par courriel (mentions, approbations, etc.) — modifiable à tout moment dans Paramètres.

**Libellé (EN) :**
> I'd like to receive email notifications (mentions, approvals, etc.) — you can change this anytime in Settings.

**Case cochée (comportement par défaut, inchangé) :**
```
{
  comment:  { inapp: true, email: false },
  mention:  { inapp: true, email: true },
  approval: { inapp: true, email: true },
}
```

**Case décochée :**
```
{
  comment:  { inapp: true, email: false },
  mention:  { inapp: true, email: false },
  approval: { inapp: true, email: false },
}
```
Le canal in-app reste toujours actif dans les deux cas — ce n'est pas
optionnel, c'est le canal de notification principal du produit.

Dans les deux cas, l'utilisateur peut tout ajuster librement ensuite dans
Paramètres → Notifications, écran déjà existant et inchangé.

## Implémentation

### `notifPrefsStore.ts`

Nouvelle fonction exportée :

```ts
export async function initNotifPrefsOnSignup(emailOptIn: boolean): Promise<void>
```

- Construit les prefs initiales (`DEFAULTS` si `emailOptIn`, sinon la
  variante tout-email-désactivé ci-dessus).
- Réutilise la logique d'upsert Supabase existante (`saveSupabasePrefs`),
  appelée directement — pas de détour par `isDemoSession()`/localStorage,
  puisque cette fonction n'est appelée que depuis les flux d'inscription
  réels (`register`/`registerClient`), jamais en session démo.
- Ne bloque pas l'inscription si l'upsert échoue : `console.error` et on
  continue, même philosophie que le reste du fichier (une préférence de
  notification qui échoue à s'écrire ne doit jamais empêcher la création du
  compte — l'utilisateur retombera simplement sur `DEFAULTS` au premier
  chargement de Paramètres, comme c'est déjà le cas aujourd'hui pour tout
  utilisateur pré-existant à cette fonctionnalité).

### `authStore.ts`

`register()` et `registerClient()` gagnent un paramètre `emailOptIn:
boolean` dans leur objet `data`. Après un `signUp` réussi (la session est
déjà active à ce point, comme le confirme le code existant), on appelle
`initNotifPrefsOnSignup(data.emailOptIn)` avant de retourner `{ ok: true }`.

### Écrans

Dans les 3 formulaires, ajout d'un état local `emailOptIn` (défaut `true`)
et d'une case à cocher entre le champ mot de passe et le bouton de
soumission, avec le style natif `<input type="checkbox">` +
`accentColor: 'var(--accent)'` déjà utilisé ailleurs dans l'app (voir
`Modeles.tsx`), pas de nouveau composant partagé — usage trop ponctuel (3
sites) pour justifier une abstraction.

Le `emailOptIn` de l'état local est passé dans l'appel à `register()` /
`registerClient()` au submit.

### i18n

Nouvelle clé `auth.emailOptIn` dans `fr.json` et `en.json`, avec le libellé
ci-dessus.

## Erreurs / cas limites

- **Upsert `notif_prefs` échoue** (ex. table indisponible) : ne bloque pas
  l'inscription, comme détaillé ci-dessus.
- **Utilisateurs déjà inscrits avant cette fonctionnalité** : aucune
  migration nécessaire. Ils continuent de retomber sur `DEFAULTS` via le
  fallback existant de `loadNotifPrefs()`, comportement inchangé pour eux.

## Tests / vérification

Pas de suite de tests automatisés dans ce projet (voir CLAUDE.md). Vérification
via le serveur de preview :
- Inscription (Register.tsx) case cochée → vérifier en base que
  `notif_prefs.prefs` reflète `DEFAULTS`.
- Inscription case décochée → vérifier que `mention`/`approval` sont à
  `email: false`.
- Flux d'invitation équipe et client, mêmes vérifications.
- Confirmer que Paramètres → Notifications affiche bien l'état écrit à
  l'inscription au premier chargement.
