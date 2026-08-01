# Récap quotidien de notifications — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un utilisateur peut activer "récap quotidien" avec une heure au
choix dans Paramètres → Notifications. Quand c'est actif, ses courriels
individuels (commentaire/mention/approbation) sont coupés et il reçoit à
la place un seul courriel condensé par jour, résumant l'activité depuis
son dernier récap.

**Architecture:** Deux nouvelles colonnes + une colonne de suivi sur
`notif_prefs` (`digest_mode`, `digest_hour`, `last_digest_sent_at`).
`app/api/send-email.ts` gagne une branche déclenchée par
`Authorization: Bearer ${CRON_SECRET}` (même mécanisme que
`google-calendar-sync.ts`) — appelée toutes les heures par un service
cron externe, elle trouve les utilisateurs dus cette heure-ci, agrège
leurs notifications récentes et envoie un résumé. La branche existante
(envoi d'un courriel unique par un utilisateur authentifié) gagne un
garde-fou : si le destinataire a `digest_mode = true`, l'envoi individuel
est sauté inconditionnellement.

**Tech Stack:** React 19 + TypeScript, Supabase, Vercel Serverless
(`@vercel/node`), Resend.

## Global Constraints

- **Aucune nouvelle fonction Vercel** — `app/api/` est déjà à 12/12 sur le
  plan Hobby. Tout ce chantier vit dans `app/api/send-email.ts` existant.
- Toute nouvelle colonne Supabase est ajoutée par une migration SQL dans
  `docs/superpowers/specs/`, exécution manuelle par l'utilisateur —
  rappeler ça explicitement à la fin de la tâche qui l'ajoute.
- Pattern démo/réel existant à respecter : le mode récap n'a aucun sens
  en session démo (pas de vrais courriels envoyés) — les nouveaux champs
  `digest_mode`/`digest_hour` restent lisibles/modifiables en démo
  (cohérence de l'UI Paramètres) mais aucun envoi réel n'est jamais
  déclenché pour une session démo.
- `npx tsc --noEmit -p app/tsconfig.app.json` (ou la forme
  `node_modules/.bin/tsc` depuis `app/` si `npx` échoue à résoudre) → 0
  erreur.
- Ne jamais utiliser `<input type="date">` — non applicable ici (sélecteur
  d'heure, pas de date), un `<select>` natif standard convient pour un
  choix parmi 24 heures.

---

### Task 1: Champs `digest_mode`/`digest_hour` + UI Paramètres

**Files:**
- Modify: `app/src/data/notifPrefsStore.ts`
- Modify: `app/src/screens/Parametres.tsx`
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json`
- Create: `docs/superpowers/specs/2026-08-01-notifications-digest-migration.sql`

**Interfaces:**
- Produces (dans `notifPrefsStore.ts`) : `loadDigestPrefs(): { digestMode: boolean; digestHour: number }`, `saveDigestPrefs(prefs: { digestMode: boolean; digestHour: number }): void` — API séparée de `loadNotifPrefs`/`saveNotifPrefs` (champs globaux, pas par-catégorie, pas la même forme de données).

- [ ] **Step 1: Étendre `notifPrefsStore.ts`**

Lire le fichier complet actuel avant d'éditer (déjà montré ci-dessous
pour référence, mais vérifier qu'il n'a pas changé). Ajouter, après
`DEFAULTS` :

```typescript
export interface DigestPrefs { digestMode: boolean; digestHour: number }
const DIGEST_DEFAULTS: DigestPrefs = { digestMode: false, digestHour: 8 };
const DIGEST_STORAGE_KEY = 'sf_notif_digest_prefs';

let _digestPrefs: DigestPrefs | null = null;
let _digestFetchStarted = false;

async function fetchSupabaseDigestPrefs(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { data, error } = await supabase
    .from('notif_prefs')
    .select('digest_mode, digest_hour')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) { console.error('fetchSupabaseDigestPrefs failed', error); return; }

  _digestPrefs = {
    digestMode: data?.digest_mode ?? DIGEST_DEFAULTS.digestMode,
    digestHour: data?.digest_hour ?? DIGEST_DEFAULTS.digestHour,
  };
}

function ensureDigestFetchStarted(): void {
  if (_digestFetchStarted) return;
  _digestFetchStarted = true;
  void fetchSupabaseDigestPrefs();
}

async function saveSupabaseDigestPrefs(prefs: DigestPrefs): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase.from('notif_prefs').upsert({
    user_id: user.id,
    digest_mode: prefs.digestMode,
    digest_hour: prefs.digestHour,
    updated_at: new Date().toISOString(),
  });
  if (error) console.error('saveSupabaseDigestPrefs failed', error);
}

export function loadDigestPrefs(): DigestPrefs {
  if (isDemoSession()) {
    return loadPersisted<DigestPrefs>(DIGEST_STORAGE_KEY, DIGEST_DEFAULTS);
  }
  ensureDigestFetchStarted();
  return _digestPrefs ?? DIGEST_DEFAULTS;
}

export function saveDigestPrefs(prefs: DigestPrefs): void {
  if (isDemoSession()) {
    savePersisted(DIGEST_STORAGE_KEY, prefs);
    return;
  }
  _digestPrefs = prefs;
  void saveSupabaseDigestPrefs(prefs);
}
```

Note : `.upsert({ user_id, digest_mode, digest_hour, ... })` sans `prefs`
écraserait la colonne `prefs` existante avec `null` si Supabase traite
l'upsert comme un remplacement complet de ligne plutôt qu'un merge partiel
— **vérifier ce point avant de committer** : lire comment
`saveSupabasePrefs` (déjà dans ce fichier) gère ça pour `prefs`, et
confirmer que `upsert` sur ce projet ne merge que les colonnes fournies
(comportement par défaut de PostgREST : `upsert` fait un `insert ... on
conflict do update set <colonnes fournies>`, donc `prefs` n'est PAS
écrasée tant qu'elle n'est pas dans l'objet passé — mais confirmer par la
documentation Supabase/PostgREST plutôt que supposer, et ajuster si le
comportement réel diffère).

- [ ] **Step 2: UI dans `Parametres.tsx`**

Dans la section `activeSection === 'notifs'`, juste après le tableau des
3 catégories existantes (avant le `<p>` d'aide en bas), ajouter :

```tsx
<div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16 }}>
  <div style={{ flex: 1 }}>
    <p style={{ fontSize: 14, fontWeight: 600 }}>{t('settings.digestModeLabel')}</p>
    <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{t('settings.digestModeDesc')}</p>
  </div>
  {digestPrefs.digestMode && (
    <select
      value={digestPrefs.digestHour}
      onChange={e => setDigestPrefsState(p => { const next = { ...p, digestHour: Number(e.target.value) }; saveDigestPrefs(next); return next; })}
      style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-mono)', outline: 'none' }}
    >
      {Array.from({ length: 24 }, (_, h) => (
        <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
      ))}
    </select>
  )}
  <Toggle on={digestPrefs.digestMode} onChange={v => setDigestPrefsState(p => { const next = { ...p, digestMode: v }; saveDigestPrefs(next); return next; })} />
</div>
```

Ajouter l'état et l'import juste avant le `return` du composant
Paramètres (à côté de `notifPrefs`/`setChannel` déjà existants) :

```typescript
const [digestPrefs, setDigestPrefsState] = useState<DigestPrefs>(loadDigestPrefs);
```

Mettre à jour l'import en haut du fichier :
`import { NOTIF_EVENTS, loadNotifPrefs, saveNotifPrefs, loadDigestPrefs, saveDigestPrefs, type NotifPrefs, type DigestPrefs } from '../data/notifPrefsStore';`

- [ ] **Step 3: Clés de traduction**

Ajouter dans `fr.json` et `en.json`, sous le namespace `settings` :
```json
"digestModeLabel": "Récap quotidien",
"digestModeDesc": "Recevoir un seul résumé par courriel chaque jour plutôt que des courriels individuels pour chaque commentaire, mention ou demande d'approbation"
```
(`en.json` : "Daily digest" / "Receive a single email summary each day instead of individual emails for every comment, mention, or approval request".)

- [ ] **Step 4: Migration SQL**

`docs/superpowers/specs/2026-08-01-notifications-digest-migration.sql` :

```sql
-- Récap quotidien : préférence globale (pas par catégorie) + heure
-- choisie par l'utilisateur + horodatage du dernier récap envoyé (sert de
-- fenêtre d'agrégation et évite un double envoi si le service cron
-- externe appelle deux fois trop proches l'une de l'autre).
alter table notif_prefs add column if not exists digest_mode boolean default false;
alter table notif_prefs add column if not exists digest_hour integer default 8;
alter table notif_prefs add column if not exists last_digest_sent_at timestamptz;
```

- [ ] **Step 5: Vérifier**

`npx tsc --noEmit -p tsconfig.app.json` → 0 erreur nouvelle.

- [ ] **Step 6: Commit et rappel migration**

```bash
git add app/src/data/notifPrefsStore.ts app/src/screens/Parametres.tsx app/src/locales/fr.json app/src/locales/en.json docs/superpowers/specs/2026-08-01-notifications-digest-migration.sql
git commit -m "feat(notifs): add digest mode preference (global toggle + hour picker)"
```

⚠️ Rappeler à l'utilisateur d'exécuter la migration dans Supabase → SQL
Editor avant que la Tâche 2 ne fonctionne en session réelle.

---

### Task 2: Couper les courriels individuels quand le récap est actif

**Files:**
- Modify: `app/api/send-email.ts`

**Interfaces:**
- Aucun changement de signature côté client (`sendEmail(...)` dans `app/src/data/emailStore.ts` reste identique) — le garde-fou vit entièrement côté serveur.

- [ ] **Step 1: Étendre le gate existant**

Dans `send-email.ts`, le bloc qui consulte déjà `notif_prefs` pour
`eventKey`/`recipientUserId` (juste avant l'envoi Resend) devient :

```typescript
  const { eventKey, recipientUserId } = req.body as SendEmailBody;
  if (eventKey && recipientUserId) {
    const { data: prefsRow } = await supabaseAdmin
      .from('notif_prefs')
      .select('prefs, digest_mode')
      .eq('user_id', recipientUserId)
      .maybeSingle();
    // Le mode récap coupe TOUS les courriels individuels, peu importe la
    // préférence par catégorie — c'est le point du mode "un seul résumé
    // par jour plutôt que du courriel au fil de l'eau".
    if (prefsRow?.digest_mode) {
      res.status(200).json({ ok: true, skipped: true, reason: 'digest_mode' });
      return;
    }
    const prefs = (prefsRow?.prefs as Record<string, { email?: boolean }> | undefined) ?? {};
    if (prefs[eventKey]?.email === false) {
      res.status(200).json({ ok: true, skipped: true });
      return;
    }
  }
```

- [ ] **Step 2: Vérifier**

`npx tsc --noEmit -p tsconfig.app.json` → 0 erreur nouvelle.

- [ ] **Step 3: Commit**

```bash
git add app/api/send-email.ts
git commit -m "feat(notifs): skip individual emails when recipient has digest mode enabled"
```

---

### Task 3: Déclenchement du récap (branche cron dans `send-email.ts`)

**Files:**
- Modify: `app/api/send-email.ts`

**Interfaces:**
- Produces: une nouvelle branche de `handler` — aucune route/fonction séparée. Déclenchée par `Authorization: Bearer ${process.env.CRON_SECRET}`, appelée en `POST` sans corps significatif (ou corps vide) par le service cron externe.

- [ ] **Step 1: Brancher sur l'en-tête cron en tout début de `handler`**

```typescript
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const authHeader = req.headers.authorization || '';
  if (authHeader === `Bearer ${process.env.CRON_SECRET}`) {
    return handleDigestRun(req, res);
  }

  if (req.method !== 'POST') {
    // ... (reste du handler existant, inchangé)
```

- [ ] **Step 2: Implémenter `handleDigestRun`**

Ajouter cette fonction dans le fichier (après `handler`, avant ou après
le reste selon l'ordre existant) :

```typescript
// Appelée toutes les heures par un service cron externe (voir CLAUDE.md —
// même mécanisme que google-calendar-sync.ts, contournant la limite d'une
// exécution/jour du cron natif Vercel Hobby). Trouve chaque utilisateur
// dont l'heure de récap choisie correspond à l'heure actuelle, agrège son
// activité depuis son dernier récap, envoie un résumé condensé.
async function handleDigestRun(req: VercelRequest, res: VercelResponse) {
  if (!process.env.RESEND_API_KEY) {
    res.status(200).json({ ok: true, skipped: true, reason: 'email not configured' });
    return;
  }

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const currentHour = new Date().getHours();
  const { data: dueUsers, error: dueError } = await supabaseAdmin
    .from('notif_prefs')
    .select('user_id, last_digest_sent_at')
    .eq('digest_mode', true)
    .eq('digest_hour', currentHour);

  if (dueError) { console.error('handleDigestRun: fetching due users failed', dueError); res.status(500).json({ error: 'failed' }); return; }
  if (!dueUsers || dueUsers.length === 0) { res.status(200).json({ ok: true, sent: 0 }); return; }

  const resend = new Resend(process.env.RESEND_API_KEY);
  let sent = 0;

  for (const row of dueUsers) {
    const since = row.last_digest_sent_at ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: notifRows, error: notifError } = await supabaseAdmin
      .from('notifications')
      .select('kind, count')
      .contains('recipient_ids', [row.user_id])
      .in('kind', ['comment', 'mention', 'approval'])
      .gt('timestamp', new Date(since).getTime());

    if (notifError) { console.error('handleDigestRun: fetching notifications failed', notifError, row.user_id); continue; }
    if (!notifRows || notifRows.length === 0) continue; // pas d'activité, pas de courriel

    const totals: Record<string, number> = { comment: 0, mention: 0, approval: 0 };
    for (const n of notifRows) totals[n.kind] = (totals[n.kind] ?? 0) + (n.count ?? 1);

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(row.user_id);
    const email = authUser?.user?.email;
    if (!email) continue;

    const parts: string[] = [];
    if (totals.comment > 0)  parts.push(`<strong>${totals.comment} commentaire${totals.comment > 1 ? 's' : ''}</strong>`);
    if (totals.mention > 0)  parts.push(`<strong>${totals.mention} mention${totals.mention > 1 ? 's' : ''}</strong>`);
    if (totals.approval > 0) parts.push(`<strong>${totals.approval} demande${totals.approval > 1 ? 's' : ''} d'approbation</strong>`);

    const html = `<p>Votre récap Rush</p><p>Depuis votre dernier récap : ${parts.join(', ')}.</p><p><a href="${process.env.VITE_APP_URL ?? 'https://rush.app'}">Voir le détail dans Rush →</a></p>`;

    const { error: sendError } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to: email,
      subject: 'Votre récap Rush',
      html,
    });
    if (sendError) { console.error('handleDigestRun: send failed', sendError, row.user_id); continue; }

    await supabaseAdmin.from('notif_prefs').update({ last_digest_sent_at: new Date().toISOString() }).eq('user_id', row.user_id);
    sent++;
  }

  res.status(200).json({ ok: true, sent });
}
```

Note sur `process.env.VITE_APP_URL` : vérifier si cette variable
d'environnement existe déjà dans ce projet (grep `VITE_APP_URL` ou
équivalent dans les autres fichiers `app/api/`) — sinon, utiliser
l'URL de production connue du projet en dur, ou toute variable
d'environnement Vercel déjà exposée qui contient l'URL du déploiement
(`VERCEL_URL` est fournie automatiquement par Vercel mais pointe vers le
déploiement courant, pas nécessairement le domaine custom — vérifier ce
qui est le plus approprié en lisant comment d'autres fichiers de ce
projet construisent déjà un lien cliquable vers l'app dans un courriel,
par exemple dans les courriels d'invitation).

- [ ] **Step 3: Vérifier**

`npx tsc --noEmit -p tsconfig.app.json` → 0 erreur nouvelle.

- [ ] **Step 4: Commit**

```bash
git add app/api/send-email.ts
git commit -m "feat(notifs): daily digest cron branch — aggregate and send once per due user"
```

⚠️ **Configuration manuelle requise, hors code** (rappeler explicitement
à l'utilisateur, ne pas essayer d'automatiser) :
1. Confirmer que `CRON_SECRET` est déjà configuré dans les variables
   d'environnement Vercel (déjà utilisé par `google-calendar-sync.ts` —
   probablement déjà présent, mais vérifier).
2. Configurer un job sur cron-job.org (ou équivalent) qui appelle
   `POST https://<domaine>/api/send-email` toutes les heures, avec
   l'en-tête `Authorization: Bearer <CRON_SECRET>` — même configuration
   que le job existant pour `google-calendar-sync.ts`, juste une URL
   différente.
