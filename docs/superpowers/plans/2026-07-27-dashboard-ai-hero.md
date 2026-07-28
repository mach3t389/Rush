# Dashboard AI Hero Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AI-first hero block at the top of the Dashboard (accueil) that greets the user, shows a locally-computed summary, offers fixed suggestion chips, and lets the user chat inline (expanding in place) using the same backend/tools as the existing floating AI panel.

**Architecture:** Extract the AI agentic-loop engine (tool definitions, system prompt builder, tool executor, markdown renderer, and the `useAIAgentChat` hook) out of `AIChat.tsx` into a new shared module `app/src/components/ai/aiAgentCore.tsx`, with zero behavior change to the existing floating panel. Then build a new `DashboardAIHero` component in `Dashboard.tsx` that consumes the same hook, so both surfaces call `/api/ai-chat` identically and share the same quota. The hero is gated by `canUseFeature(plan, 'ai')` (hidden entirely for real free-plan accounts) with an exception for demo sessions (always visible, static demo notice on send — same as the floating panel already does).

**Tech Stack:** React 19 + TypeScript, react-i18next, existing `/api/ai-chat` Vercel function (Claude Haiku), Supabase auth session token.

## Global Constraints

- No automated test suite exists in this repo — verification is via `npx tsc -p tsconfig.app.json --noEmit`, `npm run build`, and manual checks in the browser preview (per `CLAUDE.md`).
- No hard-coded user-facing strings — every new string goes through `t('namespace.key')`, added to both `app/src/locales/fr.json` and `app/src/locales/en.json` first.
- Never use `<input type="date">` — not applicable here (no date pickers in this feature).
- All styling stays inline `style={}` with existing CSS tokens (`var(--accent)`, `var(--surface)`, etc.) — no new Tailwind usage, matching the rest of the codebase.
- `SFIcon` names must be valid Lucide kebab-case names (verify on lucide.dev before using a new one).
- The floating AI panel (`AIChat.tsx`) must keep working identically after the refactor — this is a behavior-preserving extraction, not a rewrite.

---

### Task 1: Extract shared AI agent engine, refactor AIChat.tsx to use it

**Files:**
- Create: `app/src/components/ai/aiAgentCore.tsx`
- Modify: `app/src/components/AIChat.tsx`

**Interfaces:**
- Produces (from `aiAgentCore.tsx`, consumed by Task 3):
  - `export interface ChatMessage { role: 'user' | 'assistant' | 'tool'; content: string; name?: string; toolUseId?: string; tool_calls?: { id: string; function: { name: string; arguments: any } }[]; _toolLabel?: string; }`
  - `export function renderMarkdown(text: string): React.ReactNode[]`
  - `export function useAIAgentChat(navigate: (path: string) => void): { messages: ChatMessage[]; loading: boolean; quota: { used: number; limit: number } | null; send: (text: string) => Promise<void>; clear: () => void; }`
  - `send` takes the exact text to send as its only, required argument — the hook owns no input-box state itself, since the hero and the floating panel each manage their own input differently (e.g. dictation vs. plain typing). Every caller passes the text explicitly (e.g. `send(input)`, `send(s)` for a suggestion chip).

- [ ] **Step 1: Create `app/src/components/ai/aiAgentCore.tsx` with the moved-verbatim engine code**

Move (cut, not copy) the following from `app/src/components/AIChat.tsx` into the new file, unchanged except for import paths (this file lives one directory deeper, under `components/ai/`, so relative imports gain an extra `../`):
- The `ChatMessage` interface (lines 23-31 of the original file)
- The `TOOLS` array (lines 35-150)
- `buildSystemPrompt()` (lines 154-185) — imports `getProjects` from `'../../data/projectStore'` and `CLIENTS` from `'../../data/mock'`
- `executeTool()` (lines 189-299) — imports `addProject` from `'../../data/projectStore'`, `addEvent` from `'../../data/eventStore'`, `addResource` from `'../../data/resourceStore'`, `addFile` from `'../../data/fileStore'`, `CLIENTS`/`MY_TASKS` from `'../../data/mock'`, and types `Project`, `Phase`, `ResourceType` from `'../../types'`
- `renderMarkdown()` and `inlineMarkdown()` (lines 303-372) — no extra imports needed, pure React/string logic

Then add a new hook at the bottom of the file that wraps the agentic-loop logic currently inlined in `AIChat.tsx`'s `send` function (lines 501-596), generalized to not depend on component-local `input`/`setInput` state:

```tsx
import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { isDemoSession } from '../../data/authStore';
import { getStudioId } from '../../data/studioStore';
import { supabase } from '../../data/supabaseClient';

export function useAIAgentChat(navigate: (path: string) => void) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null);

  const send = useCallback(async (text: string) => {
    const content = text.trim();
    if (!content || loading) return;

    const userMsg: ChatMessage = { role: 'user', content };
    let currentMessages: ChatMessage[] = [];
    setMessages(prev => { currentMessages = [...prev, userMsg]; return currentMessages; });
    setLoading(true);

    if (isDemoSession()) {
      setMessages(prev => [...prev, { role: 'assistant', content: t('ai.demoNotice') }]);
      setLoading(false);
      return;
    }

    let apiMsgs = [
      { role: 'system', content: buildSystemPrompt() },
      ...currentMessages.map(m => ({
        role: m.role,
        content: m.content,
        ...(m.name ? { name: m.name } : {}),
        ...(m.toolUseId ? { toolUseId: m.toolUseId } : {}),
        ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
      })),
    ];

    let displayMsgs = [...currentMessages];

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('no_session');

      while (true) {
        const resp = await fetch('/api/ai-chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ messages: apiMsgs, tools: TOOLS, studioId: await getStudioId() }),
        });

        if (!resp.ok) {
          const errBody = await resp.json().catch(() => ({}));
          if (resp.status === 403) throw new Error('plan_gated');
          if (resp.status === 429) {
            setQuota({ used: errBody.used, limit: errBody.limit });
            throw new Error('quota_exceeded');
          }
          throw new Error(`HTTP ${resp.status}`);
        }
        const data = await resp.json();
        const msg = data.message as ChatMessage;
        if (data.usage) setQuota(data.usage);

        apiMsgs.push({ role: msg.role, content: msg.content ?? '', ...(msg.tool_calls ? { tool_calls: msg.tool_calls } : {}) });

        if (msg.tool_calls && msg.tool_calls.length > 0) {
          for (const tc of msg.tool_calls) {
            const toolName = tc.function.name;
            const toolArgs = typeof tc.function.arguments === 'string'
              ? JSON.parse(tc.function.arguments)
              : tc.function.arguments;

            const result = executeTool(toolName, toolArgs, navigate);

            apiMsgs.push({ role: 'tool', content: result, name: toolName, toolUseId: tc.id });

            const toolMsg: ChatMessage = { role: 'tool', content: result, name: toolName, toolUseId: tc.id, _toolLabel: toolName };
            displayMsgs = [...displayMsgs, toolMsg];
            setMessages([...displayMsgs]);
          }
        } else {
          const final: ChatMessage = { role: 'assistant', content: msg.content ?? '' };
          displayMsgs = [...displayMsgs, final];
          setMessages([...displayMsgs]);
          break;
        }
      }
    } catch (e: any) {
      const key = e?.message === 'plan_gated' ? 'ai.planRequired'
        : e?.message === 'quota_exceeded' ? 'ai.quotaExceeded'
        : 'ai.assistantError';
      const errMsg: ChatMessage = { role: 'assistant', content: t(key) };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  }, [loading, navigate, t]);

  const clear = useCallback(() => setMessages([]), []);

  return { messages, loading, quota, send, clear };
}
```

Note the one behavioral-neutral change from the original: `currentMessages` is now captured via the `setMessages` functional-update callback instead of reading the stale `messages` closure directly, so `send()` no longer depends on `messages` being fresh in its own closure (it already didn't need to be a `useCallback` dependency before because `AIChat.tsx`'s `send` was a plain function redefined every render — as a hook-returned `useCallback`, this avoids a stale-closure bug the plain-function version didn't have to worry about).

- [ ] **Step 2: Update `app/src/components/AIChat.tsx` to import from the new module and use the hook**

Remove from `AIChat.tsx`:
- The `ChatMessage` interface
- The `TOOLS` array
- `buildSystemPrompt()`
- `executeTool()`
- `renderMarkdown()` and `inlineMarkdown()`
- The local `messages`, `loading`, `quota` state (`useState` calls) and the entire `send` function body

Add this import near the top of `AIChat.tsx` (alongside the existing imports):

```tsx
import { useAIAgentChat, renderMarkdown } from './ai/aiAgentCore';
```

Replace the removed state/function with:

```tsx
const { messages, loading, quota, send, clear } = useAIAgentChat(navigate);
```

Update every remaining reference in the file:
- The "clear conversation" trash button's `onClick={() => setMessages([])}` becomes `onClick={clear}`
- Every other usage of `messages`, `loading`, `quota`, `send` stays exactly as-is (same names, same call signatures — `send()` with no args reads `input` via the caller); since the hook's `send` now takes the text as its only argument, update both call sites:
  - The suggestion-chip button: `onClick={() => send(s)}` stays the same (already passes a string)
  - The dictation auto-send: `setTimeout(() => send(latestFull.trim()), 400)` stays the same
  - The send button and Enter-to-send handler currently call `send()` with no argument (relying on component-local `input` state read inside the old `send`). Update both call sites to pass `input` explicitly: `onClick={() => send(input)}` and `if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }`
  - After calling `send(input)` from the input box, also clear the local input state: change `onClick={() => send(input)}` to an inline handler that does `{ send(input); setInput(''); }`, and similarly for the Enter-key handler: `{ e.preventDefault(); send(input); setInput(''); }` — the old code cleared `input` synchronously inside the removed `send` function (`setInput('')` right after building `userMsg`); since `input` now lives only in `AIChat.tsx`, the clearing must happen at the call site instead.

- [ ] **Step 3: Typecheck**

Run: `cd "app" && npx tsc -p tsconfig.app.json --noEmit`
Expected: no errors. If there are unused-import errors (e.g. `supabase`, `getStudioId`, `isDemoSession` no longer used directly in `AIChat.tsx`), remove those now-unused imports from `AIChat.tsx`.

- [ ] **Step 4: Manual smoke test in browser preview**

Start the dev server preview (`rush-app` config, or whichever `.claude/launch.json` entry points at this worktree's `app` folder) and in a **real (non-demo) session** with AI access:
1. Open the floating AI panel (bouton IA en haut à droite, or press `I`).
2. Send a message and confirm you get a response (or the expected quota/plan-gated error if applicable).
3. Click a suggestion chip and confirm it sends correctly.
4. Click the trash icon and confirm the conversation clears.
5. Confirm dictation (if testable) still works and auto-send still functions.

In a **demo session**, confirm sending a message shows the static `ai.demoNotice` text with no network call (check Network tab — no request to `/api/ai-chat`).

- [ ] **Step 5: Commit**

```bash
git add app/src/components/ai/aiAgentCore.tsx app/src/components/AIChat.tsx
git commit -m "refactor(ai): extract shared agent engine from AIChat into aiAgentCore"
```

---

### Task 2: Add i18n keys for the Dashboard AI hero

**Files:**
- Modify: `app/src/locales/fr.json` (inside the existing `"dashboard"` object, after `"noActivityYet"`)
- Modify: `app/src/locales/en.json` (same location)

**Interfaces:**
- Produces (consumed by Task 3): translation keys `dashboard.aiHero.title`, `dashboard.aiHero.placeholder`, `dashboard.aiHero.summaryBase`, `dashboard.aiHero.summaryLate`, `dashboard.aiHero.suggestion1..4`, `dashboard.aiHero.newConversation`.

- [ ] **Step 1: Add French keys**

In `app/src/locales/fr.json`, inside the `"dashboard": { ... }` object, change the last line from:

```json
    "noActivityYet": "Aucune activité pour l'instant."
  },
```

to:

```json
    "noActivityYet": "Aucune activité pour l'instant.",
    "aiHero": {
      "title": "Qu'est-ce qu'on fait aujourd'hui ?",
      "placeholder": "Demandez-moi n'importe quoi…",
      "summaryBase": "Vous avez {{tasksCount}} tâche(s) à faire et {{projectsCount}} projet(s) actif(s) en ce moment.",
      "summaryLate": " {{lateCount}} projet(s) accuse(nt) du retard.",
      "suggestion1": "Créer une tâche",
      "suggestion2": "Résumer mes projets actifs",
      "suggestion3": "Que dois-je prioriser aujourd'hui ?",
      "suggestion4": "Créer un événement",
      "newConversation": "Nouvelle conversation"
    }
  },
```

- [ ] **Step 2: Add English keys**

In `app/src/locales/en.json`, inside the `"dashboard": { ... }` object, change the last line from:

```json
    "noActivityYet": "No activity yet."
  },
```

to:

```json
    "noActivityYet": "No activity yet.",
    "aiHero": {
      "title": "What are we doing today?",
      "placeholder": "Ask me anything…",
      "summaryBase": "You have {{tasksCount}} task(s) to do and {{projectsCount}} active project(s) right now.",
      "summaryLate": " {{lateCount}} project(s) running late.",
      "suggestion1": "Create a task",
      "suggestion2": "Summarize my active projects",
      "suggestion3": "What should I prioritize today?",
      "suggestion4": "Create an event",
      "newConversation": "New conversation"
    }
  },
```

- [ ] **Step 3: Validate JSON syntax**

Run: `cd "app" && node -e "JSON.parse(require('fs').readFileSync('src/locales/fr.json','utf8')); JSON.parse(require('fs').readFileSync('src/locales/en.json','utf8')); console.log('OK')"`
Expected: prints `OK` with no error.

- [ ] **Step 4: Commit**

```bash
git add app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat(i18n): add dashboard AI hero translation keys"
```

---

### Task 3: Build the DashboardAIHero component and mount it in Dashboard.tsx

**Files:**
- Modify: `app/src/screens/Dashboard.tsx`

**Interfaces:**
- Consumes: `useAIAgentChat`, `renderMarkdown` from `'../components/ai/aiAgentCore'` (Task 1); `dashboard.aiHero.*` keys (Task 2); `usePlan` from `'../data/planStore'`; `canUseFeature` from `'../data/planFeatures'`; `isDemoSession` from `'../data/authStore'` (already imported in this file).
- Produces: nothing consumed elsewhere — this is the leaf UI for this feature.

- [ ] **Step 1: Add the new imports to `Dashboard.tsx`**

At the top of `app/src/screens/Dashboard.tsx`, add:

```tsx
import { useAIAgentChat, renderMarkdown } from '../components/ai/aiAgentCore';
import { usePlan } from '../data/planStore';
import { canUseFeature } from '../data/planFeatures';
```

(`isDemoSession` is already imported on line 13 of the current file.)

- [ ] **Step 2: Add the `DashboardAIHero` component**

Insert this new component definition in `app/src/screens/Dashboard.tsx`, right before the `// ── Dashboard ──` section comment (i.e. right before `export function Dashboard()`):

```tsx
// ── AI Hero — accueil-first entry point into the AI assistant ────────────────

function DashboardAIHero({
  tasksCount, projectsCount, lateCount,
}: { tasksCount: number; projectsCount: number; lateCount: number }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const plan = usePlan();
  const demo = isDemoSession();
  const { messages, loading, send, clear } = useAIAgentChat(navigate);
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Réel plan Gratuit sans accès IA → bloc absent. Session démo → toujours
  // visible (vitrine produit), écrire dedans montre le message démo statique
  // via useAIAgentChat lui-même (même comportement que le panneau flottant).
  if (!demo && !canUseFeature(plan, 'ai')) return null;

  const summary = t('dashboard.aiHero.summaryBase', { tasksCount, projectsCount })
    + (lateCount > 0 ? t('dashboard.aiHero.summaryLate', { lateCount }) : '');

  const suggestions = [
    t('dashboard.aiHero.suggestion1'),
    t('dashboard.aiHero.suggestion2'),
    t('dashboard.aiHero.suggestion3'),
    t('dashboard.aiHero.suggestion4'),
  ];

  const submit = (text: string) => {
    const content = text.trim();
    if (!content || loading) return;
    send(content);
    setInput('');
  };

  return (
    <div style={{
      marginBottom: 20, borderRadius: 'var(--radius-lg)', padding: 24,
      background: 'linear-gradient(160deg, color-mix(in srgb, var(--accent) 8%, var(--surface)), var(--surface))',
      border: '1px solid color-mix(in srgb, var(--accent) 25%, var(--border))',
    }}>
      {messages.length === 0 ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <SFIcon name="sparkles" size={20} color="var(--accent)" />
            <h2 style={{ fontFamily: 'var(--ff-display)', fontWeight: 800, fontSize: 22, color: 'var(--text)' }}>
              {t('dashboard.aiHero.title')}
            </h2>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16 }}>{summary}</p>
        </>
      ) : (
        <div style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
          {messages.map((msg, i) => {
            if (msg.role === 'tool') {
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '5px 10px', borderRadius: 7,
                  background: 'color-mix(in srgb, var(--accent) 6%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
                  fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)',
                }}>
                  <SFIcon name="zap" size={10} color="var(--accent)" />
                  <span style={{ color: 'var(--accent)' }}>{msg._toolLabel}</span>
                  <span>{t('ai.toolExecuted')}</span>
                </div>
              );
            }
            const isUser = msg.role === 'user';
            return (
              <div key={i} style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '80%', padding: '9px 13px',
                  borderRadius: isUser ? '14px 14px 4px 14px' : '4px 14px 14px 14px',
                  background: isUser ? 'var(--accent)' : 'var(--surface-2)',
                  color: isUser ? 'var(--on-accent)' : 'var(--text)',
                  fontSize: 13, lineHeight: 1.6,
                  border: isUser ? 'none' : '1px solid var(--border)',
                }}>
                  {isUser ? msg.content : renderMarkdown(msg.content)}
                </div>
              </div>
            );
          })}
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
              <div style={{
                padding: '10px 14px', borderRadius: '4px 14px 14px 14px',
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                display: 'flex', gap: 5, alignItems: 'center',
              }}>
                {[0, 1, 2].map(n => (
                  <div key={n} style={{
                    width: 6, height: 6, borderRadius: '50%', background: 'var(--text-3)',
                    animation: `ai-dot 1.2s ${n * 0.2}s ease-in-out infinite`,
                  }} />
                ))}
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      <div style={{
        display: 'flex', gap: 8, alignItems: 'center',
        background: 'var(--surface)', border: '1px solid var(--border-2)',
        borderRadius: 13, padding: '8px 8px 8px 14px',
      }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(input); }}
          placeholder={t('dashboard.aiHero.placeholder')}
          style={{
            flex: 1, border: 'none', background: 'none', outline: 'none',
            fontSize: 14, color: 'var(--text)', fontFamily: 'var(--ff-text)',
          }}
        />
        <button
          onClick={() => submit(input)}
          disabled={!input.trim() || loading}
          style={{
            width: 32, height: 32, borderRadius: 9, flexShrink: 0,
            background: input.trim() && !loading ? 'var(--accent)' : 'var(--surface-3)',
            border: 'none', cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <SFIcon name="send" size={14} color={input.trim() && !loading ? 'var(--on-accent)' : 'var(--text-3)'} />
        </button>
      </div>

      {messages.length === 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {suggestions.map(s => (
            <button
              key={s}
              onClick={() => setInput(s)}
              style={{
                background: 'var(--surface-2)', border: '1px solid var(--border)',
                borderRadius: 99, padding: '6px 14px', cursor: 'pointer',
                fontSize: 12, color: 'var(--text-2)', fontFamily: 'var(--ff-text)',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      ) : (
        <button
          onClick={clear}
          style={{
            marginTop: 10, background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-text)',
          }}
        >
          {t('dashboard.aiHero.newConversation')}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Mount `DashboardAIHero` above `PageHeader` in the `Dashboard` component's render**

In the `Dashboard()` function's `return` statement, the current structure starts with:

```tsx
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PageHeader
```

The hero must render *inside* the scrollable content area (`overflow: 'auto'` div), not above the fixed `PageHeader`, per the approved design ("nouveau bloc ajouté au-dessus, en-tête actuel gardé" — this means visually above the greeting text within the page's normal flow, not pinned outside the scroll container). Change it to:

```tsx
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PageHeader
```

...stays the same up through the closing of `<PageHeader .../>`, then right after the `<PageHeader ... />` closing tag and before `<div style={{ flex: 1, overflow: 'auto', padding: 24 }}>`, no change is needed there — the hero goes *inside* that scrollable div, as its first child. Find:

```tsx
      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
      {/* Main body: 2 columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 16 }}>
```

Replace with:

```tsx
      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
      <DashboardAIHero tasksCount={myTasks.length} projectsCount={activeProjects.length} lateCount={lateProjects} />
      {/* Main body: 2 columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 16 }}>
```

(`myTasks`, `activeProjects`, and `lateProjects` are already computed earlier in `Dashboard()` — lines 231-233 of the current file — no new data fetching needed.)

- [ ] **Step 4: Typecheck**

Run: `cd "app" && npx tsc -p tsconfig.app.json --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add app/src/screens/Dashboard.tsx
git commit -m "feat(dashboard): add AI hero section above the greeting header"
```

---

### Task 4: Full build and manual verification

**Files:** none (verification only)

- [ ] **Step 1: Full production build**

Run: `cd "app" && npm run build`
Expected: build succeeds with no TypeScript or bundler errors.

- [ ] **Step 2: Manual verification — real session with AI access**

Using the browser preview, log into (or simulate) a real session where `canUseFeature(plan, 'ai')` is true:
1. Load `/` (Dashboard) and confirm the hero block appears above the "Bonjour [Prénom]" header.
2. Confirm the summary sentence reflects the same numbers shown in the header's mini-stats (tasks count, active projects count) and, if there are late projects, that the extra clause appears.
3. Click each of the 4 suggestion chips one at a time and confirm each pre-fills the input bar without sending.
4. Type a message and press Enter; confirm the block expands in place to show the conversation (no page navigation, no floating panel opening) and a response eventually appears.
5. Confirm the floating AI panel (top-right button or `I` key) still opens independently and has its own separate conversation history from the hero block.
6. Click "Nouvelle conversation" and confirm the hero collapses back to the title/summary/suggestions view.

- [ ] **Step 3: Manual verification — demo session**

1. Load `/` in a demo session and confirm the hero block is visible.
2. Send a message and confirm the static `ai.demoNotice` text appears with no request to `/api/ai-chat` in the Network tab.

- [ ] **Step 4: Manual verification — free plan gating (best-effort)**

If a real free-plan test account is available, confirm the hero block does not render at all on `/`. If no such account is available in this environment, instead read `canUseFeature(plan, 'ai')`'s definition in `app/src/data/planFeatures.ts` and confirm `'ai'` is excluded from the free plan's feature list, and note in the commit/PR description that live free-plan verification is pending manual confirmation by the user.

- [ ] **Step 5: Commit (if any fixes were needed during verification)**

```bash
git add -A
git commit -m "fix(dashboard): address issues found during AI hero manual verification"
```

(Skip this step if no fixes were needed.)
