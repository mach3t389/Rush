# Discord Bug Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a floating "Signaler un bug" button, always visible to authenticated Rush users, that captures a screenshot, collects a description + reproduction steps, and posts them as a Discord embed to a webhook configured by the studio admin.

**Architecture:** A new sub-route (`bug-report`) added inside the existing `app/api/integrations.ts` serverless function (no new Vercel function — the project is at 12/12 on the Hobby plan), guarded by a real Supabase session token exactly like `app/api/send-email.ts`. Two new client components (`BugReportButton.tsx`, `BugReportModal.tsx`) mounted once in `AppShell.tsx`. Screenshot capture via the new `html-to-image` dependency (no browser permission prompt, unlike `getDisplayMedia`).

**Tech Stack:** React 19 + TypeScript, Vercel serverless function (`@vercel/node`), Supabase (`@supabase/supabase-js`, already a dependency, admin client via `adminClient()` in `_lib/northbook/auth.ts`), `html-to-image` (new dependency), native Discord webhook API (no Discord SDK needed).

## Global Constraints

- Aucun test automatisé dans ce projet — vérification via `npx tsc --noEmit -p tsconfig.app.json` puis serveur de preview, pas de suite pytest/jest.
- Le projet est à 12/12 fonctions Vercel (plan Hobby) — ne JAMAIS créer de nouveau fichier sous `app/api/`. Toute nouvelle route serveur doit être une branche à l'intérieur d'un fichier existant.
- Tout texte utilisateur doit passer par `t('namespace.key')` — ajouter les clés dans `fr.json` ET `en.json` avant de les utiliser.
- Style : `style={{}}` inline avec les tokens CSS existants, suivre exactement les composants `SFModal`/`SFButton`/`SFIcon` déjà en place.
- La route backend exige un jeton de session Supabase valide (en-tête `Authorization: Bearer <token>`), vérifié via `adminClient().auth.getUser(token)` — exactement le pattern de `app/api/send-email.ts`. Aucun autre mécanisme d'authentification (pas de secret codé en dur).
- Une session démo (`isDemoSession() === true`) n'a jamais de jeton Supabase réel — le client ne doit jamais tenter l'appel réseau dans ce cas ; afficher un message statique à la place (même esprit que `ai.demoNotice`).
- La variable d'environnement `DISCORD_BUG_WEBHOOK_URL` doit être créée manuellement dans les paramètres du projet Vercel par l'utilisateur (Alexis) — jamais commitée, jamais ajoutée à `.env.example` (c'est un secret serveur, pas une variable client `VITE_*`).

---

### Task 1: Route backend `bug-report` dans `app/api/integrations.ts`

**Files:**
- Modify: `app/api/integrations.ts` (ajouter une fonction handler + une ligne de dispatch)

**Interfaces:**
- Consumes : `adminClient` (déjà importé depuis `./_lib/northbook/auth.js`, ligne d'import existante à conserver telle quelle), `HttpError`, `asRecord`, `requiredString`, `optionalString` (déjà importés depuis `./_lib/northbook/types.js`), `routePath`, `method`, `body` (fonctions déjà définies plus haut dans ce même fichier).
- Produces : endpoint `POST /api/integrations/v1/bug-report`, consommé par le client dans la Task 2 (`fetch('/api/integrations/v1/bug-report', ...)`).

- [ ] **Step 1: Lire le fichier existant pour confirmer les points d'ancrage exacts**

Ouvrir `app/api/integrations.ts` et repérer :
- La liste d'imports en haut du fichier (ne pas la modifier, sauf ajout éventuel — aucun nouvel import n'est nécessaire, tout ce qui est utilisé ci-dessous est déjà importé).
- Le bloc `export default async function handler(...)` (vers la fin du fichier) et sa série de `if (path[0] === ...)`.
- La ligne juste avant `throw new HttpError(404, 'route_not_found');` — c'est là qu'ajouter le nouveau `if`.

- [ ] **Step 2: Ajouter la fonction `bugReport` juste avant `export default async function handler`**

Insérer ce bloc immédiatement avant la ligne `export default async function handler(req: VercelRequest, res: VercelResponse) {` :

```typescript
// Signalement de bug — poste un embed (+ capture d'écran optionnelle) vers
// un webhook Discord configuré par variable d'environnement. Nécessite
// DISCORD_BUG_WEBHOOK_URL dans les paramètres du projet Vercel (créé
// manuellement par l'admin du studio dans son serveur Discord : clic droit
// sur le canal → Intégrations → Webhooks → Nouveau webhook → copier l'URL).
// Authentifié par jeton de session Supabase, même pattern que
// app/api/send-email.ts — jamais de secret codé en dur envoyé par le client.
interface BugReportBody {
  description: string;
  reproduction: string;
  page: string;
  screenResolution: string;
  userAgent: string;
  userName: string;
  userEmail: string;
  studioName: string;
  screenshotDataUrl?: string;
}

async function bugReport(req: VercelRequest, res: VercelResponse) {
  method(req, 'POST');

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) throw new HttpError(401, 'missing_token');

  const supabase = adminClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) throw new HttpError(401, 'invalid_token');

  const input = body(req);
  const description = requiredString(input.description, 'description', 4000);
  const reproduction = requiredString(input.reproduction, 'reproduction', 4000);
  const page = optionalString(input.page, 'page', 300) ?? '—';
  const screenResolution = optionalString(input.screenResolution, 'screenResolution', 50) ?? '—';
  const userAgent = optionalString(input.userAgent, 'userAgent', 500) ?? '—';
  const userName = optionalString(input.userName, 'userName', 200) ?? '—';
  const userEmail = optionalString(input.userEmail, 'userEmail', 200) ?? '—';
  const studioName = optionalString(input.studioName, 'studioName', 200) ?? '—';
  const screenshotDataUrl = optionalString(input.screenshotDataUrl, 'screenshotDataUrl', 10_000_000);

  if (!process.env.DISCORD_BUG_WEBHOOK_URL) {
    console.error('DISCORD_BUG_WEBHOOK_URL is not configured');
    throw new HttpError(500, 'not_configured', 'Bug reporting is not configured');
  }

  const embed: Record<string, unknown> = {
    title: '🐛 Rapport de bug — Rush',
    color: 0xf9ff00,
    fields: [
      { name: '📋 Description', value: description.slice(0, 1024) },
      { name: '🔁 Reproduction', value: reproduction.slice(0, 1024) },
      { name: '📄 Page', value: page, inline: true },
      { name: '🖥️ Écran', value: screenResolution, inline: true },
      { name: '👤 Utilisateur', value: `${userName} (${userEmail}) — ${studioName}` },
      { name: '🌐 Navigateur', value: userAgent.slice(0, 1024) },
    ],
    timestamp: new Date().toISOString(),
  };

  const form = new FormData();

  if (screenshotDataUrl) {
    const match = screenshotDataUrl.match(/^data:image\/(png|jpeg);base64,(.+)$/);
    if (match) {
      const [, ext, base64] = match;
      const buffer = Buffer.from(base64, 'base64');
      const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
      form.append('files[0]', new Blob([buffer], { type: mime }), `screenshot.${ext}`);
      embed.image = { url: `attachment://screenshot.${ext}` };
    }
  }

  form.append('payload_json', JSON.stringify({ embeds: [embed] }));

  const discordRes = await fetch(process.env.DISCORD_BUG_WEBHOOK_URL, {
    method: 'POST',
    body: form,
  });

  if (!discordRes.ok) {
    console.error('Discord webhook failed', discordRes.status, await discordRes.text());
    throw new HttpError(502, 'discord_failed', 'Failed to post bug report to Discord');
  }

  res.status(200).json({ ok: true });
}
```

- [ ] **Step 3: Ajouter le dispatch dans `handler`**

Dans `export default async function handler`, juste avant la ligne `throw new HttpError(404, 'route_not_found');`, ajouter :

```typescript
    if (path[0] === 'bug-report') return await bugReport(req, res);
```

- [ ] **Step 4: Vérifier le typecheck**

Run (depuis `app/`) : `npx tsc --noEmit -p tsconfig.app.json`
Expected : aucune erreur. Si une erreur de type apparaît sur `FormData`/`Blob`/`Buffer` (globaux Node), confirmer que `tsconfig` cible bien un `lib`/`types` incluant Node 18+ (déjà le cas pour ce projet, les autres routes `api/` utilisent déjà `Buffer` — voir `_lib/northbook/storage.ts` si besoin de comparer).

- [ ] **Step 5: Commit**

```bash
git add app/api/integrations.ts
git commit -m "feat(bugs): route bug-report dans integrations.ts (webhook Discord)"
```

---

### Task 2: `BugReportModal.tsx` — formulaire, dépendance `html-to-image`

**Files:**
- Create: `app/src/components/BugReportModal.tsx`
- Modify: `app/package.json`, `app/package-lock.json` (nouvelle dépendance)
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json` (nouvelles clés)

**Interfaces:**
- Consumes : `SFModal`, `SFButton` (depuis `../components/ui`), `supabase` (depuis `../data/supabaseClient`), `getCurrentUser`, `isDemoSession` (depuis `../data/authStore`), `showToast` (depuis `../data/toastStore`).
- Produces : composant `BugReportModal({ open, onClose, screenshotDataUrl }: { open: boolean; onClose: () => void; screenshotDataUrl: string | null })`, consommé par `BugReportButton.tsx` dans la Task 3 (qui lui fournit `screenshotDataUrl`, déjà capturé avant l'ouverture).

- [ ] **Step 1: Installer `html-to-image`**

Run (depuis `app/`) : `npm install html-to-image --legacy-peer-deps`
Expected : `package.json` et `package-lock.json` modifiés, aucune erreur `ERESOLVE` (le `.npmrc` du projet a déjà `legacy-peer-deps=true`, mais préciser le flag explicitement comme fait pour `marked` plus tôt dans ce projet).

- [ ] **Step 2: Ajouter les clés i18n dans `fr.json`**

Chercher un emplacement logique dans `app/src/locales/fr.json` — créer un nouveau namespace `bugReport` (chercher la fin d'un namespace existant, ex. juste après le bloc `"toast": { ... }` ou similaire, avec la même indentation à 2 espaces que le reste du fichier). Insérer :

```json
  "bugReport": {
    "buttonTitle": "Signaler un bug",
    "modalTitle": "Signaler un bug",
    "descriptionLabel": "Description",
    "descriptionPlaceholder": "Qu'est-ce qui ne fonctionne pas ?",
    "reproductionLabel": "Étapes de reproduction",
    "reproductionPlaceholder": "Comment reproduire le problème ?",
    "screenshotLabel": "Capture d'écran",
    "removeScreenshot": "Retirer la capture",
    "screenshotUnavailable": "Capture d'écran indisponible, le rapport sera envoyé sans image.",
    "send": "Envoyer",
    "sending": "Envoi...",
    "sentToast": "Bug signalé, merci !",
    "notConfiguredError": "Le signalement de bug n'est pas encore configuré, contactez l'administrateur.",
    "sendError": "L'envoi a échoué, réessaie dans un instant.",
    "demoNotice": "Le signalement de bug nécessite un compte réel — crée un compte pour l'utiliser."
  },
```

- [ ] **Step 3: Ajouter les clés équivalentes dans `en.json`**

Au même endroit relatif dans `app/src/locales/en.json` :

```json
  "bugReport": {
    "buttonTitle": "Report a bug",
    "modalTitle": "Report a bug",
    "descriptionLabel": "Description",
    "descriptionPlaceholder": "What's not working?",
    "reproductionLabel": "Reproduction steps",
    "reproductionPlaceholder": "How to reproduce the issue?",
    "screenshotLabel": "Screenshot",
    "removeScreenshot": "Remove screenshot",
    "screenshotUnavailable": "Screenshot unavailable, the report will be sent without an image.",
    "send": "Send",
    "sending": "Sending...",
    "sentToast": "Bug reported, thanks!",
    "notConfiguredError": "Bug reporting isn't configured yet, contact the administrator.",
    "sendError": "Sending failed, try again in a moment.",
    "demoNotice": "Bug reporting requires a real account — create one to use it."
  },
```

- [ ] **Step 4: Créer `app/src/components/BugReportModal.tsx`**

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SFModal, SFButton, SFIcon } from './ui';
import { supabase } from '../data/supabaseClient';
import { getCurrentUser, isDemoSession } from '../data/authStore';
import { showToast } from '../data/toastStore';

export function BugReportModal({ open, onClose, screenshotDataUrl }: {
  open: boolean;
  onClose: () => void;
  screenshotDataUrl: string | null;
}) {
  const { t } = useTranslation();
  const [description, setDescription] = useState('');
  const [reproduction, setReproduction] = useState('');
  const [keepScreenshot, setKeepScreenshot] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setDescription('');
    setReproduction('');
    setKeepScreenshot(true);
    setError(null);
  };

  const close = () => {
    if (sending) return;
    reset();
    onClose();
  };

  if (isDemoSession()) {
    return (
      <SFModal open={open} onClose={close} title={t('bugReport.modalTitle')} width={420}>
        <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6 }}>{t('bugReport.demoNotice')}</p>
      </SFModal>
    );
  }

  const handleSend = async () => {
    if (!description.trim() || !reproduction.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError(t('bugReport.sendError'));
        setSending(false);
        return;
      }
      const user = getCurrentUser();
      const res = await fetch('/api/integrations/v1/bug-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          description: description.trim(),
          reproduction: reproduction.trim(),
          page: window.location.pathname,
          screenResolution: `${window.innerWidth}×${window.innerHeight}`,
          userAgent: navigator.userAgent,
          userName: user?.name ?? '',
          userEmail: user?.email ?? '',
          studioName: user?.studioName ?? '',
          screenshotDataUrl: keepScreenshot ? (screenshotDataUrl ?? undefined) : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: { code?: string } } | null;
        setError(body?.error?.code === 'not_configured' ? t('bugReport.notConfiguredError') : t('bugReport.sendError'));
        setSending(false);
        return;
      }
      showToast({ type: 'task', message: t('bugReport.sentToast') });
      reset();
      setSending(false);
      onClose();
    } catch {
      setError(t('bugReport.sendError'));
      setSending(false);
    }
  };

  return (
    <SFModal open={open} onClose={close} title={t('bugReport.modalTitle')} width={480}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={{ display: 'block', fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            {t('bugReport.descriptionLabel')}
          </label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder={t('bugReport.descriptionPlaceholder')}
            rows={3}
            style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border-2)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)', resize: 'vertical', outline: 'none' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            {t('bugReport.reproductionLabel')}
          </label>
          <textarea
            value={reproduction}
            onChange={e => setReproduction(e.target.value)}
            placeholder={t('bugReport.reproductionPlaceholder')}
            rows={3}
            style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border-2)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)', resize: 'vertical', outline: 'none' }}
          />
        </div>

        {screenshotDataUrl ? (
          keepScreenshot ? (
            <div>
              <label style={{ display: 'block', fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                {t('bugReport.screenshotLabel')}
              </label>
              <div style={{ position: 'relative', borderRadius: 9, overflow: 'hidden', border: '1px solid var(--border-2)' }}>
                <img src={screenshotDataUrl} alt="" style={{ width: '100%', display: 'block' }} />
                <button
                  onClick={() => setKeepScreenshot(false)}
                  title={t('bugReport.removeScreenshot')}
                  style={{ position: 'absolute', top: 6, right: 6, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: 4, cursor: 'pointer', display: 'flex' }}
                >
                  <SFIcon name="x" size={13} />
                </button>
              </div>
            </div>
          ) : null
        ) : (
          <p style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>{t('bugReport.screenshotUnavailable')}</p>
        )}

        {error && <p style={{ fontSize: 12, color: 'var(--danger)' }}>{error}</p>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <SFButton variant="secondary" onClick={close} disabled={sending}>{t('tasks.cancel')}</SFButton>
          <SFButton
            variant="primary"
            onClick={handleSend}
            disabled={sending || !description.trim() || !reproduction.trim()}
          >
            {sending ? t('bugReport.sending') : t('bugReport.send')}
          </SFButton>
        </div>
      </div>
    </SFModal>
  );
}
```

Note : `t('tasks.cancel')` réutilise une clé déjà existante dans le fichier (confirmée présente ailleurs dans ce projet, ex. `BulkMoveModal` dans `Travail.tsx`) — ne pas la redéfinir dans le namespace `bugReport`.

- [ ] **Step 5: Vérifier le typecheck**

Run (depuis `app/`) : `npx tsc --noEmit -p tsconfig.app.json`
Expected : aucune erreur.

- [ ] **Step 6: Commit**

```bash
git add app/package.json app/package-lock.json app/src/components/BugReportModal.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat(bugs): formulaire BugReportModal + dépendance html-to-image"
```

---

### Task 3: `BugReportButton.tsx` — capture d'écran, montage dans `AppShell`

**Files:**
- Create: `app/src/components/BugReportButton.tsx`
- Modify: `app/src/components/layout/AppShell.tsx`

**Interfaces:**
- Consumes : `BugReportModal` (Task 2, `{ open, onClose, screenshotDataUrl }`), `SFIcon` (`../components/ui`), `toJpeg` (depuis `html-to-image`, installé en Task 2).
- Produces : composant `BugReportButton()` sans props, monté une fois dans `AppShell.tsx`.

- [ ] **Step 1: Créer `app/src/components/BugReportButton.tsx`**

```tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toJpeg } from 'html-to-image';
import { SFIcon } from './ui';
import { BugReportModal } from './BugReportModal';

export function BugReportButton() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);

  const handleClick = async () => {
    try {
      const dataUrl = await toJpeg(document.body, { quality: 0.8, pixelRatio: 1 });
      setScreenshotDataUrl(dataUrl);
    } catch {
      // Capture indisponible (ex. contenu protégé par CORS) — le rapport
      // part quand même, juste sans image (voir BugReportModal, qui affiche
      // déjà l'avertissement quand screenshotDataUrl est null).
      setScreenshotDataUrl(null);
    }
    setOpen(true);
  };

  return (
    <>
      <button
        onClick={handleClick}
        title={t('bugReport.buttonTitle')}
        style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 80,
          width: 44, height: 44, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          color: 'var(--text-2)', cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; }}
      >
        <SFIcon name="bug" size={18} />
      </button>
      <BugReportModal
        open={open}
        onClose={() => setOpen(false)}
        screenshotDataUrl={screenshotDataUrl}
      />
    </>
  );
}
```

Note sur le `zIndex: 80` : `AIChat.tsx` utilise `zIndex: 89` pour son panneau et un backdrop à `88` (voir lignes 164-166 de ce fichier) ; `80` reste sous ces valeurs pour que le panneau IA, s'il s'ouvre, passe par-dessus le bouton bug sans conflit visuel. `SFModal` par défaut utilise `zIndex: 400`, largement au-dessus.

- [ ] **Step 2: Monter le bouton dans `AppShell.tsx`**

Dans `app/src/components/layout/AppShell.tsx`, ajouter l'import en haut du fichier, juste après la ligne import de `AIChat` :

```tsx
import { BugReportButton } from '../BugReportButton';
```

Puis, dans le JSX retourné par `AppShell`, ajouter `<BugReportButton />` juste après `<AIChat />` :

```tsx
      <AIChat />
      <BugReportButton />
      <ToastBar />
```

- [ ] **Step 3: Vérifier le typecheck**

Run (depuis `app/`) : `npx tsc --noEmit -p tsconfig.app.json`
Expected : aucune erreur.

- [ ] **Step 4: Vérification live**

1. Démarrer un serveur de preview (`npm run dev` depuis `app/`, ou l'outil Browser du harnais sur un port dédié).
2. Se connecter avec le compte démo (`lea.marchand@rushflow.com`, n'importe quel mot de passe).
3. Confirmer que le bouton 🐛 apparaît en bas à droite sur plusieurs pages (Accueil, un projet, Paramètres) — toujours visible, ne bloque aucun autre élément flottant.
4. Cliquer dessus → la modale affiche le message de session démo (`bugReport.demoNotice`), aucune requête réseau vers `/api/integrations/v1/bug-report` ne doit apparaître dans l'onglet Réseau du navigateur.
5. Se déconnecter, s'inscrire ou se connecter avec un vrai compte (si disponible pour le test) → cliquer sur le bouton → confirmer que la modale affiche cette fois le formulaire complet avec l'aperçu de la capture d'écran.
6. Remplir Description + Reproduction, cliquer Envoyer → observer la requête réseau : elle échouera avec `notConfiguredError` tant que `DISCORD_BUG_WEBHOOK_URL` n'est pas configurée sur Vercel (attendu à ce stade — voir Task 4) — confirmer que le message d'erreur s'affiche correctement dans la modale et que le formulaire reste ouvert (pas de perte du texte saisi).

- [ ] **Step 5: Commit**

```bash
git add app/src/components/BugReportButton.tsx app/src/components/layout/AppShell.tsx
git commit -m "feat(bugs): bouton flottant Signaler un bug + montage dans AppShell"
```

---

### Task 4: Configuration Vercel et vérification de bout en bout

**Files:** aucun fichier de code — étape de configuration manuelle + vérification finale.

**Interfaces:** aucune (tâche de déploiement/vérification, pas de nouveau code).

- [ ] **Step 1: Créer le webhook Discord (manuel, par l'utilisateur)**

Dans le serveur Discord visé : clic droit sur le canal cible → Intégrations → Webhooks → Nouveau webhook → copier l'URL (`https://discord.com/api/webhooks/{id}/{token}`).

- [ ] **Step 2: Ajouter la variable d'environnement sur Vercel (manuel, par l'utilisateur)**

Dashboard Vercel → projet Rush → Settings → Environment Variables → ajouter `DISCORD_BUG_WEBHOOK_URL` avec l'URL copiée à l'étape précédente, pour l'environnement Production (et Preview si souhaité) → redéployer (un push suffit à déclencher un nouveau déploiement qui lira la variable).

- [ ] **Step 3: Vérification de bout en bout après déploiement**

Une fois la variable configurée et le code déployé (après le merge de ce plan) :
1. Se connecter avec un vrai compte sur l'app déployée.
2. Cliquer sur le bouton 🐛, remplir Description + Reproduction, envoyer.
3. Confirmer le toast de confirmation côté app.
4. Confirmer dans Discord que le message est bien apparu dans le canal choisi, avec les champs attendus (Description, Reproduction, Page, Écran, Utilisateur, Navigateur) et la capture d'écran en pièce jointe.

- [ ] **Step 4: Utiliser `superpowers:finishing-a-development-branch` pour conclure**

Ne pas merger/pousser manuellement — suivre ce skill pour présenter les options de fin de branche à l'utilisateur.
