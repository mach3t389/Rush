# Standardisation du système de commentaires — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the look and core functionality (replies, resolve/reopen, @mentions, delete) of the comment UI across 7 of 9 resource-editor types, by extending the existing shared `RevisionCommentSidebar` component and migrating 3 bespoke implementations onto it (one of which — `ScriptCommentSidebar` — is itself already shared across 5 editor types).

**Architecture:** Task 1 extends `app/src/components/RevisionComments.tsx` with three additive, backward-compatible capabilities: real `@mention` autocomplete (ported from `VideoReview.tsx`'s proven pattern), an optional `excerpt` field for quoted-context display, and optional-hide behavior for the "Annoter" button and the bottom quick-add box (for consumers whose comment-creation flow lives entirely outside the list panel). Tasks 2-4 each migrate one bespoke comment UI onto the extended shared component, converting local comment types to satisfy `RevisionComment`'s shape.

**Tech Stack:** React 19 + TypeScript, existing `app/src/components/RevisionComments.tsx`.

## Global Constraints

- No automated test suite in this repo — verification is via the Preview browser tool and `npx tsc --noEmit -p tsconfig.app.json` (the bare `tsc --noEmit` is a false pass in this repo — the root tsconfig is a project-references-only stub; always use `-p tsconfig.app.json`).
- All user-facing text must go through `t()`. Any new user-facing string needs a matching key added to BOTH `app/src/locales/fr.json` and `app/src/locales/en.json` before use.
- **`VideoReview.tsx` is explicitly OUT OF SCOPE for this plan** — do not modify it (it is only read as a reference pattern for the mention-autocomplete port).
- **Comment persistence is explicitly OUT OF SCOPE** for `ScriptCommentSidebar`'s 5 consumers (Scénario, Moodboard, Checklist, Inspirations, Formulaire) — their comments continue to live only in local `useState` and are lost on reload, exactly as today. Do not add persistence as part of this plan.
- Do not touch the pre-existing `SFAvatar` prop-mismatch bug in `RevisionComments.tsx` (`name`/`color` props passed where the component expects `initials`/`bg`) — it is out of scope for this plan.
- `RevisionComment.author` is typed `typeof USERS.lea`, which is structurally the `User` interface (`app/src/types/index.ts`): `{ id: string; name: string; initials: string; avatarColor: string; role: string }`.

---

### Task 1: Extend `RevisionComments.tsx` — mentions, excerpt, optional controls

**Files:**
- Modify: `app/src/components/RevisionComments.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `RevisionComment.excerpt?: string` (new optional field); `RevisionCommentSidebarProps.onToggleDrawing?: () => void` and `.drawing?: boolean` (now optional — omit to hide the "Annoter" header button); `RevisionCommentSidebarProps.onAdd?: (text: string) => void` (now optional — omit to hide the bottom quick-add box). All other existing props/behavior are unchanged. Tasks 2-4 rely on these exact optional signatures.

- [ ] **Step 1: Add the `excerpt` field to `RevisionComment`**

In `app/src/components/RevisionComments.tsx`, replace:

```tsx
export interface RevisionComment {
  id: string;
  author: typeof USERS.lea;
  text: string;
  status: 'open' | 'resolved';
  annotation?: RevisionAnnotation;
  replies: RevisionReply[];
  contextLabel?: string; // e.g. "Page 2" or "Photo 3"
}
```

with:

```tsx
export interface RevisionComment {
  id: string;
  author: typeof USERS.lea;
  text: string;
  status: 'open' | 'resolved';
  annotation?: RevisionAnnotation;
  replies: RevisionReply[];
  contextLabel?: string; // e.g. "Page 2" or "Photo 3"
  excerpt?: string; // quoted source text the comment is anchored to (e.g. a text selection)
}
```

- [ ] **Step 2: Add a `TEAM` constant and a `renderMentions` helper**

Right after the imports (after line 4, `import { USERS } from '../data/mock';`), add:

```tsx

const TEAM = Object.values(USERS);

function renderMentions(text: string) {
  return text.split(/(@\S+)/g).map((part, i) =>
    part.startsWith('@')
      ? <span key={i} style={{ color: 'var(--accent)', fontWeight: 600 }}>{part}</span>
      : part
  );
}
```

- [ ] **Step 3: Render the excerpt in `CommentCard`**

In the `CommentCard` function, replace:

```tsx
      <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.45, margin: '0 0 10px' }}>{comment.text}</p>
```

with:

```tsx
      {comment.excerpt && (
        <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', borderLeft: '2px solid rgba(249,255,0,0.4)', paddingLeft: 6, marginBottom: 5, lineHeight: 1.4, fontStyle: 'italic' }}>
          "{comment.excerpt}{comment.excerpt.length >= 80 ? '…' : ''}"
        </p>
      )}
      <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.45, margin: '0 0 10px' }}>{renderMentions(comment.text)}</p>
```

- [ ] **Step 4: Highlight mentions in replies too**

In the `CommentCard` function's replies block, replace:

```tsx
              <div>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>{r.author.name} </span>
                <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{r.text}</span>
              </div>
```

with:

```tsx
              <div>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>{r.author.name} </span>
                <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{renderMentions(r.text)}</span>
              </div>
```

- [ ] **Step 5: Add mention-autocomplete state and handlers to `CommentCard`'s reply box**

In `CommentCard`, replace:

```tsx
  const { t } = useTranslation();
  const [replyText, setReplyText] = useState('');
  const [showReply, setShowReply] = useState(false);
  const color = comment.annotation ? annoColor(index) : 'var(--text-3)';
  const resolved = comment.status === 'resolved';

  const submitReply = () => {
    const t = replyText.trim();
    if (!t) return;
    onReply(t);
    setReplyText('');
    setShowReply(false);
  };
```

with:

```tsx
  const { t } = useTranslation();
  const [replyText, setReplyText] = useState('');
  const [showReply, setShowReply] = useState(false);
  const [replyMentionQuery, setReplyMentionQuery] = useState<string | null>(null);
  const [replyMentionRect, setReplyMentionRect] = useState<DOMRect | null>(null);
  const color = comment.annotation ? annoColor(index) : 'var(--text-3)';
  const resolved = comment.status === 'resolved';

  const submitReply = () => {
    const t = replyText.trim();
    if (!t) return;
    onReply(t);
    setReplyText('');
    setShowReply(false);
    setReplyMentionQuery(null);
  };

  const handleReplyChange = (val: string, el: HTMLInputElement | null) => {
    setReplyText(val);
    const m = val.match(/@(\w*)$/);
    if (m) { setReplyMentionQuery(m[1]); if (el) setReplyMentionRect(el.getBoundingClientRect()); }
    else setReplyMentionQuery(null);
  };

  const pickReplyMention = (name: string) => {
    setReplyText(prev => prev.replace(/@\w*$/, `@${name} `));
    setReplyMentionQuery(null);
  };
```

- [ ] **Step 6: Wire the reply input to the new mention handlers and render the dropdown**

In `CommentCard`, replace the reply input block:

```tsx
      {showReply && (
        <div style={{ marginTop: 8, display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
          <input
            autoFocus
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submitReply(); if (e.key === 'Escape') setShowReply(false); }}
            placeholder={t('review.replyShort')}
            style={{ flex: 1, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 12, outline: 'none', fontFamily: 'var(--ff-text)' }}
          />
          <button onClick={submitReply} style={{ padding: '6px 10px', borderRadius: 7, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>↵</button>
        </div>
      )}
```

with:

```tsx
      {showReply && (
        <div style={{ marginTop: 8, display: 'flex', gap: 6, position: 'relative' }} onClick={e => e.stopPropagation()}>
          {replyMentionQuery !== null && (
            <div style={{ position: 'fixed', bottom: replyMentionRect ? window.innerHeight - replyMentionRect.top + 4 : 80, left: replyMentionRect?.left ?? 80, zIndex: 1100, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, overflow: 'hidden', minWidth: 180, boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
              {TEAM.filter(u => u.name.toLowerCase().includes(replyMentionQuery.toLowerCase())).map(u => (
                <button key={u.id} onMouseDown={e => { e.preventDefault(); pickReplyMention(u.name); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text)', textAlign: 'left' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                  <span style={{ width: 22, height: 22, borderRadius: '50%', background: u.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'white', fontWeight: 700, flexShrink: 0 }}>{u.initials}</span>
                  {u.name}
                </button>
              ))}
            </div>
          )}
          <input
            autoFocus
            value={replyText}
            onChange={e => handleReplyChange(e.target.value, e.target)}
            onKeyDown={e => { if (e.key === 'Enter' && replyMentionQuery === null) submitReply(); if (e.key === 'Escape') setShowReply(false); }}
            placeholder={t('review.replyShort')}
            style={{ flex: 1, padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 12, outline: 'none', fontFamily: 'var(--ff-text)' }}
          />
          <button onClick={submitReply} style={{ padding: '6px 10px', borderRadius: 7, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>↵</button>
        </div>
      )}
```

- [ ] **Step 7: Make `drawing`/`onToggleDrawing`/`onAdd` optional in `RevisionCommentSidebar`'s props**

In `RevisionCommentSidebar`'s destructured props type, replace:

```tsx
  comments: RevisionComment[];
  activeId: string | null;
  onActivate: (id: string | null) => void;
  onAdd: (text: string) => void;
  onResolve: (id: string) => void;
  onReply: (id: string, text: string) => void;
  onDelete?: (id: string) => void;
  pendingAnnotation: boolean;
  onCancelPending: () => void;
  drawing: boolean;
  onToggleDrawing: () => void;
  contextLabel?: string;
  embedded?: boolean;
```

with:

```tsx
  comments: RevisionComment[];
  activeId: string | null;
  onActivate: (id: string | null) => void;
  onAdd?: (text: string) => void;
  onResolve: (id: string) => void;
  onReply: (id: string, text: string) => void;
  onDelete?: (id: string) => void;
  pendingAnnotation: boolean;
  onCancelPending: () => void;
  drawing?: boolean;
  onToggleDrawing?: () => void;
  contextLabel?: string;
  embedded?: boolean;
```

- [ ] **Step 8: Hide the "Annoter" header button when `onToggleDrawing` is not provided**

In `RevisionCommentSidebar`, replace:

```tsx
          <button
            onClick={onToggleDrawing}
            title={drawing ? t('review.cancelAnnotation') : t('review.placeAnnotation')}
            style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7,
              border: `1px solid ${drawing ? 'var(--accent)' : 'var(--border-2)'}`,
              background: drawing ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'var(--surface-2)',
              color: drawing ? 'var(--accent)' : 'var(--text-2)',
              fontSize: 11, cursor: 'pointer', fontFamily: 'var(--ff-text)', fontWeight: 500,
              transition: 'all 0.12s',
            }}
          >
            <SFIcon name="map-pin" size={12}  />
            {drawing ? t('review.clickOnMedia') : t('review.annotate')}
          </button>
```

with:

```tsx
          {onToggleDrawing && (
            <button
              onClick={onToggleDrawing}
              title={drawing ? t('review.cancelAnnotation') : t('review.placeAnnotation')}
              style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7,
                border: `1px solid ${drawing ? 'var(--accent)' : 'var(--border-2)'}`,
                background: drawing ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'var(--surface-2)',
                color: drawing ? 'var(--accent)' : 'var(--text-2)',
                fontSize: 11, cursor: 'pointer', fontFamily: 'var(--ff-text)', fontWeight: 500,
                transition: 'all 0.12s',
              }}
            >
              <SFIcon name="map-pin" size={12}  />
              {drawing ? t('review.clickOnMedia') : t('review.annotate')}
            </button>
          )}
```

- [ ] **Step 9: Hide the bottom quick-add box when `onAdd` is not provided, and add mention-autocomplete to it**

In `RevisionCommentSidebar`, replace:

```tsx
  const { t } = useTranslation();
  const [newText, setNewText] = useState('');
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('all');

  const filtered = comments.filter(c =>
    filter === 'all' ? true : c.status === filter
  );
  const openCount = comments.filter(c => c.status === 'open').length;

  const submit = () => {
    const t = newText.trim();
    if (!t) return;
    onAdd(t);
    setNewText('');
  };
```

with:

```tsx
  const { t } = useTranslation();
  const [newText, setNewText] = useState('');
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [addMentionQuery, setAddMentionQuery] = useState<string | null>(null);
  const [addMentionRect, setAddMentionRect] = useState<DOMRect | null>(null);

  const filtered = comments.filter(c =>
    filter === 'all' ? true : c.status === filter
  );
  const openCount = comments.filter(c => c.status === 'open').length;

  const submit = () => {
    const t = newText.trim();
    if (!t || !onAdd) return;
    onAdd(t);
    setNewText('');
    setAddMentionQuery(null);
  };

  const handleAddChange = (val: string, el: HTMLInputElement | null) => {
    setNewText(val);
    const m = val.match(/@(\w*)$/);
    if (m) { setAddMentionQuery(m[1]); if (el) setAddMentionRect(el.getBoundingClientRect()); }
    else setAddMentionQuery(null);
  };

  const pickAddMention = (name: string) => {
    setNewText(prev => prev.replace(/@\w*$/, `@${name} `));
    setAddMentionQuery(null);
  };
```

- [ ] **Step 10: Wrap the bottom quick-add box in `{onAdd && (...)}`  and wire mentions**

In `RevisionCommentSidebar`, replace:

```tsx
      {/* Quick add (no annotation) */}
      {!pendingAnnotation && (
        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              value={newText}
              onChange={e => setNewText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submit(); }}
              placeholder={t('review.addCommentMention')}
              style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 12, outline: 'none', fontFamily: 'var(--ff-text)' }}
            />
            <button onClick={submit} disabled={!newText.trim()} style={{ padding: '7px 12px', borderRadius: 7, border: 'none', background: newText.trim() ? 'var(--accent)' : 'var(--surface-3)', color: newText.trim() ? 'var(--on-accent)' : 'var(--text-3)', fontSize: 12, cursor: newText.trim() ? 'pointer' : 'default', fontWeight: 600 }}>↵</button>
          </div>
        </div>
      )}
```

with:

```tsx
      {/* Quick add (no annotation) */}
      {!pendingAnnotation && onAdd && (
        <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 6, position: 'relative' }}>
            {addMentionQuery !== null && (
              <div style={{ position: 'absolute', bottom: 'calc(100% + 4px)', left: 0, zIndex: 1100, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, overflow: 'hidden', minWidth: 180, boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
                {TEAM.filter(u => u.name.toLowerCase().includes(addMentionQuery.toLowerCase())).map(u => (
                  <button key={u.id} onMouseDown={e => { e.preventDefault(); pickAddMention(u.name); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text)', textAlign: 'left' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                    <span style={{ width: 22, height: 22, borderRadius: '50%', background: u.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'white', fontWeight: 700, flexShrink: 0 }}>{u.initials}</span>
                    {u.name}
                  </button>
                ))}
              </div>
            )}
            <input
              value={newText}
              onChange={e => handleAddChange(e.target.value, e.target)}
              onKeyDown={e => { if (e.key === 'Enter' && addMentionQuery === null) submit(); }}
              placeholder={t('review.addCommentMention')}
              style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 12, outline: 'none', fontFamily: 'var(--ff-text)' }}
            />
            <button onClick={submit} disabled={!newText.trim()} style={{ padding: '7px 12px', borderRadius: 7, border: 'none', background: newText.trim() ? 'var(--accent)' : 'var(--surface-3)', color: newText.trim() ? 'var(--on-accent)' : 'var(--text-3)', fontSize: 12, cursor: newText.trim() ? 'pointer' : 'default', fontWeight: 600 }}>↵</button>
          </div>
        </div>
      )}
```

- [ ] **Step 11: Typecheck**

Run (from `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "components/RevisionComments.tsx"`
Expected: the same pre-existing 2 `SFAvatar`/`SFIcon` prop-mismatch errors and the `SFButton`/`i`-unused errors already present before this task (do not introduce new ones). Compare against `git show <base-commit>:app/src/components/RevisionComments.tsx` piped through the same command if unsure which errors are pre-existing.

- [ ] **Step 12: Manual check**

Via the Preview tool: open an `ImageReview` or `DocumentReview` resource (both already wired to `RevisionCommentSidebar`), type `@` in the comment box, confirm the mention dropdown appears and filters by name, confirm picking a name inserts `@Name ` into the text. Confirm the "Annoter" button and quick-add box still render normally (both consumers still pass `onToggleDrawing`/`onAdd`, so nothing should be hidden for them).

- [ ] **Step 13: Commit**

```bash
git add app/src/components/RevisionComments.tsx
git commit -m "feat: add mention autocomplete, excerpt field, and optional controls to RevisionCommentSidebar"
```

---

### Task 2: Migrate `ScriptCommentSidebar` (fixes 5 editors: Scénario, Moodboard, Checklist, Inspirations, Formulaire)

**Files:**
- Modify: `app/src/screens/ResourceDetail.tsx`

**Interfaces:**
- Consumes: `RevisionCommentSidebar`, `type RevisionComment` from `../components/RevisionComments` (Task 1's extended version). `ScriptCommentSidebar`'s external signature `{ resourceId: string }` is UNCHANGED — none of its 5 call sites need modification.
- Produces: nothing consumed by later tasks (Tasks 3-4 are independent files).

- [ ] **Step 1: Add the import**

In `app/src/screens/ResourceDetail.tsx`, find the existing import block (starts at line 1) and add, right after the `RequestApprovalButton` import (line 9):

```tsx
import { RevisionCommentSidebar, type RevisionComment } from '../components/RevisionComments';
```

- [ ] **Step 2: Replace `ScriptCommentSidebar`'s implementation**

Replace the entire `ScriptCommentSidebar` function (currently lines 287-351, from `interface ScriptComment { ... }` through the function's closing `}`):

```tsx
interface ScriptComment { id: string; author: string; text: string; ts: number; resolved: boolean; }

function ScriptCommentSidebar({ resourceId }: { resourceId: string }) {
  const { t } = useTranslation();
  const [comments, setComments] = useState<ScriptComment[]>([]);
  const [draft, setDraft] = useState('');

  const addComment = () => {
    if (!draft.trim()) return;
    setComments(prev => [...prev, { id: `sc-${Date.now()}`, author: t('resourceDetail.me'), text: draft.trim(), ts: Date.now(), resolved: false }]);
    setDraft('');
  };

  const openComments = comments.filter(c => !c.resolved);
  const resolvedComments = comments.filter(c => c.resolved);

  return (
    <div id="rd-comments-panel" style={{ width:240, flexShrink:0, display:'flex', flexDirection:'column', borderLeft:'1px solid var(--border)', overflow:'hidden' }}>
      <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--border)', flexShrink:0, display:'flex', alignItems:'center', gap:6 }}>
        <SFIcon name="message-circle" size={12} color="var(--text-3)" />
        <p style={{ fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.07em' }}>{t('activity.comments')}</p>
        {openComments.length > 0 && <span style={{ marginLeft:'auto', fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--accent)', fontWeight:700 }}>{openComments.length}</span>}
      </div>
      <div style={{ flex:1, overflow:'auto', padding:'10px', display:'flex', flexDirection:'column', gap:6 }}>
        {comments.length === 0 && (
          <p style={{ fontSize:11, color:'var(--text-3)', padding:'4px 2px' }}>{t('resourceDetail.noComment')}</p>
        )}
        {openComments.map(c => (
          <div key={c.id} style={{ padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--surface-2)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:4 }}>
              <SFAvatar user={{ name: c.author } as any} size={18} />
              <span style={{ fontSize:11, fontWeight:600, color:'var(--text-2)', flex:1 }}>{c.author}</span>
              <button
                onClick={() => setComments(prev => prev.map(cc => cc.id === c.id ? { ...cc, resolved: true } : cc))}
                title={t('resourceDetail.resolve')}
                style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-3)', padding:2, borderRadius:4, display:'flex', alignItems:'center' }}
              >
                <SFIcon name="check" size={11} />
              </button>
            </div>
            <p style={{ fontSize:12, color:'var(--text)', lineHeight:1.5 }}>{c.text}</p>
          </div>
        ))}
        {resolvedComments.length > 0 && (
          <p style={{ fontFamily:'var(--ff-mono)', fontSize:8, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.06em', marginTop:4 }}>{t('resourceDetail.resolvedCount', { count: resolvedComments.length })}</p>
        )}
      </div>
      <div style={{ padding:'10px', borderTop:'1px solid var(--border)', flexShrink:0 }}>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addComment(); } }}
          placeholder={t('tasks.addComment')}
          rows={2}
          style={{ width:'100%', resize:'none', background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:7, padding:'7px 9px', fontSize:12, color:'var(--text)', outline:'none', fontFamily:'var(--ff-text)', boxSizing:'border-box', colorScheme:'dark' }}
        />
        <button
          onClick={addComment}
          disabled={!draft.trim()}
          style={{ marginTop:6, width:'100%', padding:'6px 0', borderRadius:7, border:'none', background: draft.trim() ? 'var(--accent)' : 'var(--surface-3)', color: draft.trim() ? '#000' : 'var(--text-3)', fontSize:12, fontWeight:600, cursor: draft.trim() ? 'pointer' : 'default', fontFamily:'var(--ff-text)', transition:'background 0.15s' }}
        >
          {t('taskPanel.send')}
        </button>
      </div>
    </div>
  );
}
```

with:

```tsx
function ScriptCommentSidebar({ resourceId: _resourceId }: { resourceId: string }) {
  const [comments, setComments] = useState<RevisionComment[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const handleAdd = (text: string) => {
    setComments(prev => [...prev, { id: `sc-${Date.now()}`, author: USERS.lea, text, status: 'open', replies: [] }]);
  };
  const handleResolve = (id: string) => {
    setComments(prev => prev.map(c => c.id === id ? { ...c, status: c.status === 'resolved' ? 'open' : 'resolved' } : c));
  };
  const handleReply = (id: string, text: string) => {
    setComments(prev => prev.map(c => c.id === id ? { ...c, replies: [...c.replies, { id: `sr-${Date.now()}`, author: USERS.lea, text }] } : c));
  };
  const handleDelete = (id: string) => {
    setComments(prev => prev.filter(c => c.id !== id));
    if (activeId === id) setActiveId(null);
  };

  return (
    <div id="rd-comments-panel" style={{ width:280, flexShrink:0, display:'flex', flexDirection:'column', borderLeft:'1px solid var(--border)', overflow:'hidden' }}>
      <RevisionCommentSidebar
        comments={comments}
        activeId={activeId}
        onActivate={setActiveId}
        onAdd={handleAdd}
        onResolve={handleResolve}
        onReply={handleReply}
        onDelete={handleDelete}
        pendingAnnotation={false}
        onCancelPending={() => {}}
        embedded
      />
    </div>
  );
}
```

**Note:** `resourceId` is renamed to `_resourceId` in the destructure because it is no longer read inside the function (comments are not persisted per the design's explicit scope decision — see Global Constraints) but the prop must stay in the signature since all 5 call sites still pass it. `USERS` is already imported in this file (line 5).

- [ ] **Step 3: Typecheck**

Run (from `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "screens/ResourceDetail.tsx"`
Compare the output against the same command run on the pre-task commit (`git show <base-commit>:app/src/screens/ResourceDetail.tsx`) — expected: no NEW errors introduced by this change (the file has many pre-existing errors unrelated to this task; only flag ones whose line number falls inside the code you just changed).

- [ ] **Step 4: Manual check**

Via the Preview tool: open a Scénario resource, a Moodboard, a Checklist, an Inspirations board, and a Formulaire (all route through `ResourceDetail`/`ResourceRouter`). For each: confirm the comments sidebar now shows the unified look (reply/resolve/delete buttons, filter pills), add a comment, add a reply, resolve it, delete it — confirm each works identically across all 5.

- [ ] **Step 5: Commit**

```bash
git add app/src/screens/ResourceDetail.tsx
git commit -m "refactor: migrate ScriptCommentSidebar to shared RevisionCommentSidebar"
```

---

### Task 3: Migrate `DocumentView`'s Commentaires tab

**Files:**
- Modify: `app/src/screens/ResourceDetail.tsx`

**Interfaces:**
- Consumes: `RevisionCommentSidebar`, `type RevisionComment`, `type RevisionReply` from `../components/RevisionComments` (already imported by Task 2 in this same file — do not re-add the import, just extend it).
- Produces: nothing consumed by later tasks.

**Context:** `DocumentView`'s comments (`DocComment`) are anchored to a text selection via an HTML `<mark data-comment-id>` element, created by `addCommentAnchor()` (a toolbar action, unaffected by this task), then completed via a pending-comment textarea that lives INSIDE the same `rightTab === 'comments'` block being migrated here. Comments are already persisted via `resourceContentStore` (existing `persistContent()` effect) — extending `DocComment` with `status`/`replies` means these new fields flow through that same existing persistence effect automatically; no changes to the persistence effect itself are needed.

- [ ] **Step 1: Update the import to include `RevisionReply`**

Find the import added in Task 2:

```tsx
import { RevisionCommentSidebar, type RevisionComment } from '../components/RevisionComments';
```

Replace with:

```tsx
import { RevisionCommentSidebar, type RevisionComment, type RevisionReply } from '../components/RevisionComments';
```

- [ ] **Step 2: Extend the `DocComment` interface**

Replace:

```tsx
interface DocComment { id: string; author: User; text: string; time: string; anchorId?: string; excerpt?: string; }
```

with:

```tsx
interface DocComment { id: string; author: User; text: string; time: string; anchorId?: string; excerpt?: string; status: 'open' | 'resolved'; replies: RevisionReply[]; }
```

- [ ] **Step 3: Add `status`/`replies` to the seed comments**

Replace:

```tsx
  const [comments, setComments] = useState<DocComment[]>(
    persisted?.comments ?? (persistKey ? [] : [
      { id:'dc1', author:USERS.sarah,  text:'La section budget nécessite une mise à jour avec les derniers chiffres.', time:'Il y a 1h' },
      { id:'dc2', author:USERS.thomas, text:'Peut-on ajouter une section sur la stratégie sociale ?', time:'Il y a 3h' },
    ])
  );
```

with:

```tsx
  const [comments, setComments] = useState<DocComment[]>(
    persisted?.comments ?? (persistKey ? [] : [
      { id:'dc1', author:USERS.sarah,  text:'La section budget nécessite une mise à jour avec les derniers chiffres.', time:'Il y a 1h', status:'open', replies:[] },
      { id:'dc2', author:USERS.thomas, text:'Peut-on ajouter une section sur la stratégie sociale ?', time:'Il y a 3h', status:'open', replies:[] },
    ])
  );
```

- [ ] **Step 4: Adapt `submitComment` to accept the text from `RevisionCommentSidebar`'s `onAdd`, and add resolve/reply/delete handlers**

Replace:

```tsx
  const submitComment = () => {
    if (!newCommentText.trim() || !pendingAnchorId) return;
    const mark = editorRef.current?.querySelector(`[data-comment-id="${pendingAnchorId}"]`) as HTMLElement | null;
    const excerpt = mark?.innerText?.slice(0, 80) ?? '';
    setComments(p => [...p, { id: pendingAnchorId, author: USERS.lea, text: newCommentText.trim(), time: 'À l\'instant', anchorId: pendingAnchorId, excerpt }]);
    setNewCommentText('');
    setPendingAnchorId(null);
    onEdit?.();
  };
```

with:

```tsx
  const submitComment = (textOverride?: string) => {
    const text = (textOverride ?? newCommentText).trim();
    if (!text || !pendingAnchorId) return;
    const mark = editorRef.current?.querySelector(`[data-comment-id="${pendingAnchorId}"]`) as HTMLElement | null;
    const excerpt = mark?.innerText?.slice(0, 80) ?? '';
    setComments(p => [...p, { id: pendingAnchorId, author: USERS.lea, text, time: 'À l\'instant', anchorId: pendingAnchorId, excerpt, status: 'open', replies: [] }]);
    setNewCommentText('');
    setPendingAnchorId(null);
    onEdit?.();
  };

  const resolveComment = (id: string) => {
    setComments(prev => prev.map(c => c.id === id ? { ...c, status: c.status === 'resolved' ? 'open' : 'resolved' } : c));
  };

  const replyToComment = (id: string, text: string) => {
    setComments(prev => prev.map(c => c.id === id ? { ...c, replies: [...c.replies, { id: `dr${Date.now()}`, author: USERS.lea, text }] } : c));
  };

  const deleteComment = (id: string) => {
    setComments(prev => prev.filter(c => c.id !== id));
  };
```

- [ ] **Step 5: Replace the comments-tab JSX block**

Replace the entire block (currently starting at `{rightTab==='comments' && (` and ending at its matching `)}`):

```tsx
{rightTab==='comments' && (
  <>
    <div style={{ flex:1, overflow:'auto', padding:12, display:'flex', flexDirection:'column', gap:10 }}>
      {comments.map(c => (
        <div key={c.id} onClick={() => c.anchorId && scrollToAnchor(c.anchorId)}
          style={{ display:'flex', gap:8, cursor: c.anchorId ? 'pointer' : 'default', opacity: pendingAnchorId && pendingAnchorId !== c.anchorId ? 0.5 : 1 }}>
          <SFAvatar initials={c.author.initials} bg={c.author.avatarColor} size={24} />
          <div style={{ flex:1, background: pendingAnchorId===c.anchorId ? 'rgba(249,255,0,0.06)' : 'var(--surface-2)', borderRadius:9, padding:'8px 10px', border: pendingAnchorId===c.anchorId ? '1px solid rgba(249,255,0,0.3)' : '1px solid transparent' }}>
            {c.excerpt && (
              <p style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)', borderLeft:'2px solid rgba(249,255,0,0.4)', paddingLeft:6, marginBottom:5, lineHeight:1.4, fontStyle:'italic' }}>
                "{c.excerpt}{c.excerpt.length >= 80 ? '…' : ''}"
              </p>
            )}
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
              <span style={{ fontSize:11, fontWeight:600 }}>{c.author.name.split(' ')[0]}</span>
              <span style={{ fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--text-3)' }}>{c.time}</span>
            </div>
            <p style={{ fontSize:12, color:'var(--text-2)', lineHeight:1.5 }}>{c.text}</p>
          </div>
        </div>
      ))}
    </div>
    {pendingAnchorId && (
      <div style={{ padding:'10px 12px', borderTop:'1px solid var(--border)', background:'var(--surface-2)' }}>
        <div style={{ fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--accent)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>{t('resourceDetail.commentsPanel.newCommentLabel')}</div>
        <textarea ref={newCommentRef} value={newCommentText} onChange={e=>setNewCommentText(e.target.value)}
          onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); submitComment(); } if(e.key==='Escape') cancelComment(); }}
          placeholder={t('resourceDetail.commentsPanel.commentPlaceholder')} rows={3}
          style={{ width:'100%', padding:'7px 10px', borderRadius:9, border:'1px solid var(--border-2)', background:'var(--surface)', color:'var(--text)', fontSize:12, outline:'none', fontFamily:'var(--ff-text)', colorScheme:'dark' as any, resize:'none', boxSizing:'border-box' }}
        />
        <div style={{ display:'flex', gap:6, marginTop:6 }}>
          <button onClick={submitComment} style={{ flex:1, padding:'6px', borderRadius:7, border:'none', cursor:'pointer', background:'var(--accent)', color:'var(--on-accent)', fontSize:11, fontWeight:600, fontFamily:'var(--ff-text)' }}>{t('resourceDetail.commentsPanel.submitButton')}</button>
          <button onClick={cancelComment} style={{ padding:'6px 10px', borderRadius:7, border:'1px solid var(--border-2)', cursor:'pointer', background:'transparent', color:'var(--text-2)', fontSize:11, fontFamily:'var(--ff-text)' }}>{t('resourceDetail.commentsPanel.cancelButton')}</button>
        </div>
      </div>
    )}
  </>
)}
```

with:

```tsx
{rightTab==='comments' && (
  <RevisionCommentSidebar
    comments={comments}
    activeId={pendingAnchorId}
    onActivate={id => { if (id) scrollToAnchor(id); }}
    onResolve={resolveComment}
    onReply={replyToComment}
    onDelete={deleteComment}
    pendingAnnotation={!!pendingAnchorId}
    onCancelPending={cancelComment}
    onAdd={pendingAnchorId ? text => submitComment(text) : undefined}
    embedded
  />
)}
```

**Note:** `newCommentRef`, `newCommentText`, `setNewCommentText` remain declared (used by `submitComment`'s default-param fallback and elsewhere) but are no longer wired to a rendered `<textarea>` directly — `RevisionCommentSidebar` owns its own internal input state and calls `onAdd(text)` with the typed text, which flows into `submitComment(textOverride)`. Do not remove `newCommentText`/`setNewCommentText`/`newCommentRef` — check the rest of the file for other references before considering removal (there may be none, but that's a separate concern from this migration, not to be cleaned up here per the "don't touch unrelated code" constraint).

- [ ] **Step 6: Typecheck**

Run (from `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "screens/ResourceDetail.tsx"`
Compare against the pre-task commit the same way as Task 2's Step 3. If `newCommentRef`/`newCommentText` become newly-unused (real new `noUnusedLocals` errors, not pre-existing), that is a genuine issue to fix — but only if the typecheck actually flags it; do not preemptively remove them otherwise.

- [ ] **Step 7: Manual check**

Via the Preview tool: open a Document resource (`DocumentView`). Select a range of text, trigger "Add Comment" (the existing toolbar action that calls `addCommentAnchor`), type a comment in the now-shared sidebar's pending-prompt box, submit. Confirm: the excerpt quote appears above the comment text, clicking the comment card scrolls to and flashes the anchored text, reply/resolve/delete all work. Reload the page and confirm the comment (with its new `status`/`replies` fields) survives via the existing persistence.

- [ ] **Step 8: Commit**

```bash
git add app/src/screens/ResourceDetail.tsx
git commit -m "refactor: migrate DocumentView comments tab to shared RevisionCommentSidebar"
```

---

### Task 4: Migrate `WebReview`'s annotation sidebar

**Files:**
- Modify: `app/src/screens/WebReview.tsx`

**Interfaces:**
- Consumes: `RevisionCommentSidebar`, `type RevisionComment`, `type RevisionReply` from `../components/RevisionComments`.
- Produces: nothing consumed by other tasks.

**Context:** WebReview's pin-placement UX (the "Annoter" toggle button, the floating pending-comment input that appears at the clicked page position, and the `Pin` markers overlaid on the iframe) all live OUTSIDE the sidebar list block being migrated here (confirmed: the floating pending-input is at lines ~382-427, the sidebar list is at lines ~452-524 — two separate, non-overlapping JSX regions) and are UNCHANGED by this task. Only the list-of-existing-annotations panel (lines 452-524) is replaced. `Annotation` currently has no `replies` field and no persistence — this task adds a `replies` field (initialized empty) so replies work, but does NOT add persistence (comments continue to reset to `DEMO_ANNOTATIONS` on reload, unchanged from today).

- [ ] **Step 1: Add the import**

In `app/src/screens/WebReview.tsx`, replace:

```tsx
import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { SFIcon, SFButton, SFPill, SFAvatar } from '../components/ui';
import { getResources, updateResource } from '../data/resourceStore';
import { RequestApprovalButton } from '../components/RequestApprovalButton';
import { PROJECTS } from '../data/mock';
```

with:

```tsx
import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { SFIcon, SFButton, SFPill, SFAvatar } from '../components/ui';
import { getResources, updateResource } from '../data/resourceStore';
import { RequestApprovalButton } from '../components/RequestApprovalButton';
import { PROJECTS } from '../data/mock';
import { RevisionCommentSidebar, type RevisionComment, type RevisionReply } from '../components/RevisionComments';
```

- [ ] **Step 2: Add a `replies` field to `Annotation` and to `DEMO_ANNOTATIONS`**

Replace:

```tsx
interface Annotation {
  id: string;
  // Page-absolute pixel coordinates (from top-left of the scrollable page, not the viewport)
  x: number;
  y: number;
  text: string;
  author: string;
  authorInitials: string;
  authorColor: string;
  resolved: boolean;
  createdAt: string;
}

// Demo annotations stored in page-pixel coordinates
const DEMO_ANNOTATIONS: Annotation[] = [
  { id: 'a1', x: 300, y: 150, text: 'Le logo est trop petit sur mobile. Agrandir à 48px minimum.', author: 'Léa Marchand', authorInitials: 'LM', authorColor: '#3b4f8f', resolved: false, createdAt: 'Il y a 2h' },
  { id: 'a2', x: 650, y: 380, text: 'Cette section manque de contraste. Tester avec un fond plus foncé.', author: 'Marc Dupont', authorInitials: 'MD', authorColor: '#1a6b4a', resolved: false, createdAt: 'Il y a 45 min' },
  { id: 'a3', x: 420, y: 620, text: 'CTA bien placé, approuvé.', author: 'Léa Marchand', authorInitials: 'LM', authorColor: '#3b4f8f', resolved: true, createdAt: 'Hier' },
];
```

with:

```tsx
interface Annotation {
  id: string;
  // Page-absolute pixel coordinates (from top-left of the scrollable page, not the viewport)
  x: number;
  y: number;
  text: string;
  author: string;
  authorInitials: string;
  authorColor: string;
  resolved: boolean;
  createdAt: string;
  replies: RevisionReply[];
}

// Demo annotations stored in page-pixel coordinates
const DEMO_ANNOTATIONS: Annotation[] = [
  { id: 'a1', x: 300, y: 150, text: 'Le logo est trop petit sur mobile. Agrandir à 48px minimum.', author: 'Léa Marchand', authorInitials: 'LM', authorColor: '#3b4f8f', resolved: false, createdAt: 'Il y a 2h', replies: [] },
  { id: 'a2', x: 650, y: 380, text: 'Cette section manque de contraste. Tester avec un fond plus foncé.', author: 'Marc Dupont', authorInitials: 'MD', authorColor: '#1a6b4a', resolved: false, createdAt: 'Il y a 45 min', replies: [] },
  { id: 'a3', x: 420, y: 620, text: 'CTA bien placé, approuvé.', author: 'Léa Marchand', authorInitials: 'LM', authorColor: '#3b4f8f', resolved: true, createdAt: 'Hier', replies: [] },
];
```

- [ ] **Step 3: Add `replies: []` to the annotation created by `commitAnnotation`**

Replace:

```tsx
  const commitAnnotation = () => {
    if (!pendingPos || !draftText.trim()) return;
    const ann: Annotation = {
      id: `a${Date.now()}`,
      x: pendingPos.x,
      y: pendingPos.y,
      text: draftText.trim(),
      author: 'Moi',
      authorInitials: 'MO',
      authorColor: '#5b3ea8',
      resolved: false,
      createdAt: 'À l\'instant',
    };
    setAnnotations(prev => [...prev, ann]);
    setSelectedId(ann.id);
    setPendingPos(null);
    setDraftText('');
    setAddingPin(false);
  };

  const toggleResolved = (id: string) => {
    setAnnotations(prev => prev.map(a => a.id === id ? { ...a, resolved: !a.resolved } : a));
  };

  const deleteAnnotation = (id: string) => {
    setAnnotations(prev => prev.filter(a => a.id !== id));
    if (selectedId === id) setSelectedId(null);
  };
```

with:

```tsx
  const commitAnnotation = () => {
    if (!pendingPos || !draftText.trim()) return;
    const ann: Annotation = {
      id: `a${Date.now()}`,
      x: pendingPos.x,
      y: pendingPos.y,
      text: draftText.trim(),
      author: 'Moi',
      authorInitials: 'MO',
      authorColor: '#5b3ea8',
      resolved: false,
      createdAt: 'À l\'instant',
      replies: [],
    };
    setAnnotations(prev => [...prev, ann]);
    setSelectedId(ann.id);
    setPendingPos(null);
    setDraftText('');
    setAddingPin(false);
  };

  const toggleResolved = (id: string) => {
    setAnnotations(prev => prev.map(a => a.id === id ? { ...a, resolved: !a.resolved } : a));
  };

  const deleteAnnotation = (id: string) => {
    setAnnotations(prev => prev.filter(a => a.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const replyToAnnotation = (id: string, text: string) => {
    setAnnotations(prev => prev.map(a => a.id === id ? { ...a, replies: [...a.replies, { id: `wr${Date.now()}`, author: { id: 'moi', name: 'Moi', initials: 'MO', avatarColor: '#5b3ea8', role: '' }, text }] } : a));
  };

  const toRevisionComment = (ann: Annotation, index: number): RevisionComment => ({
    id: ann.id,
    author: { id: `wa-${index}`, name: ann.author, initials: ann.authorInitials, avatarColor: ann.authorColor, role: '' },
    text: ann.text,
    status: ann.resolved ? 'resolved' : 'open',
    annotation: { x: ann.x, y: ann.y },
    replies: ann.replies,
  });
```

- [ ] **Step 4: Replace the sidebar list JSX block**

Replace the block (currently `{sidebarTab === 'annotations' && (` through its matching `)}`):

```tsx
          {sidebarTab === 'annotations' && (
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {annotations.length} annotations
                </span>
                <button
                  onClick={() => setShowResolved(o => !o)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--ff-mono)', fontSize: 10, color: showResolved ? 'var(--text-2)' : 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                >
                  <SFIcon name={showResolved ? 'eye' : 'eye-off'} size={11} />
                  Résolues
                </button>
              </div>

              {visible.length === 0 && (
                <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                  <SFIcon name="message-circle" size={28} color="var(--text-3)" />
                  <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 10, lineHeight: 1.5 }}>Aucune annotation visible.<br />Cliquez sur "Annoter" pour en ajouter.</p>
                </div>
              )}

              {visible.map((ann, i) => (
                <div
                  key={ann.id}
                  onClick={() => setSelectedId(selectedId === ann.id ? null : ann.id)}
                  style={{
                    padding: '12px 14px', borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    background: selectedId === ann.id ? 'var(--surface-2)' : 'transparent',
                    transition: 'background 0.12s',
                    opacity: ann.resolved ? 0.6 : 1,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                      background: ann.resolved ? 'rgba(34,197,94,0.15)' : 'rgba(249,200,0,0.15)',
                      border: `1.5px solid ${ann.resolved ? 'rgba(34,197,94,0.6)' : 'rgba(249,200,0,0.6)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'var(--ff-mono)', fontSize: 9, fontWeight: 700,
                      color: ann.resolved ? 'rgba(34,197,94,0.9)' : 'rgba(249,200,0,0.95)',
                    }}>
                      {ann.resolved ? '✓' : i + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5, marginBottom: 6, textDecoration: ann.resolved ? 'line-through' : 'none' }}>{ann.text}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <SFAvatar initials={ann.authorInitials} bg={ann.authorColor} size={16} />
                        <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)' }}>{ann.author} · {ann.createdAt}</span>
                      </div>
                    </div>
                  </div>
                  {selectedId === ann.id && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 10, paddingLeft: 28 }}>
                      <button
                        onClick={e => { e.stopPropagation(); toggleResolved(ann.id); }}
                        style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: '1px solid var(--border-2)', background: 'var(--surface-3)', color: ann.resolved ? 'var(--ok)' : 'var(--text-2)', fontSize: 10, fontFamily: 'var(--ff-mono)', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                      >
                        {ann.resolved ? 'Réouvrir' : 'Résoudre'}
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); deleteAnnotation(ann.id); }}
                        style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border-2)', background: 'var(--surface-3)', color: 'var(--danger)', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                      >
                        <SFIcon name="trash-2" size={12} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
```

with:

```tsx
          {sidebarTab === 'annotations' && (
            <RevisionCommentSidebar
              comments={visible.map((ann, i) => toRevisionComment(ann, i))}
              activeId={selectedId}
              onActivate={setSelectedId}
              onResolve={toggleResolved}
              onReply={replyToAnnotation}
              onDelete={deleteAnnotation}
              pendingAnnotation={false}
              onCancelPending={() => {}}
              embedded
            />
          )}
```

**Note:** the header's "annotations count" label and the "Résolues" show/hide toggle (previously inline in the block above) are now handled by `RevisionCommentSidebar`'s own built-in header (open-count badge + all/open/resolved filter pills) — `showResolved` state and its toggle button become unused by this specific block. Do not remove the `showResolved` state declaration or its setter — check whether `visible` (the filtered array used elsewhere, e.g. in the pin-overlay rendering at the previously-noted lines ~366-379) still depends on it before making any further change; this plan does not require touching `visible`'s definition.

- [ ] **Step 5: Typecheck**

Run (from `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "screens/WebReview.tsx"`
Compare against the pre-task commit the same way as prior tasks — flag only genuinely new errors introduced by this diff.

- [ ] **Step 6: Manual check**

Via the Preview tool: open a WebReview resource. Click "Annoter", click a spot on the embedded page, type a comment in the floating input, submit — confirm the pin appears AND the sidebar list (now using the shared card look) shows it. Click the sidebar card, confirm the reply box now works (new capability), resolve it, delete it — confirm the corresponding pin marker on the page updates/disappears in sync (since both read from the same `annotations` state).

- [ ] **Step 7: Commit**

```bash
git add app/src/screens/WebReview.tsx
git commit -m "refactor: migrate WebReview annotation sidebar to shared RevisionCommentSidebar"
```

---

### Task 5: Manual end-to-end verification and final regression pass

**Files:** none (no code changes — browser verification only).

**Interfaces:** none.

- [ ] **Step 1: Confirm `VideoReview` is untouched**

Run: `git diff --stat <merge-base>..HEAD -- app/src/screens/VideoReview.tsx`
Expected: no output (file untouched, confirming the explicit scope decision to defer its migration).

- [ ] **Step 2: Full regression sweep**

Via the Preview tool, sign in and visit one resource of each of the following 7 types, confirming in each case that the comment sidebar has the unified look (avatar, filter pills, reply/resolve/delete) and that adding/replying/resolving/deleting all work: Image, Document (revision-style, `ImageReview`/`DocumentReview` — should behave exactly as before, since Task 1 was additive-only), Scénario, Moodboard, Checklist, Inspirations, Formulaire, Document (rich-text editor), Web. Confirm `VideoReview` (video resource) still works exactly as before (untouched).

- [ ] **Step 3: Full typecheck**

Run (from `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"`
Compare against the pre-task-1 baseline error count (record it before Task 1 starts). Expected: same count or lower — zero new errors across all 4 touched files.

- [ ] **Step 4: Lint**

Run (from `app/`): `npm run lint 2>&1 | grep -A6 "RevisionComments.tsx\|ResourceDetail.tsx\|WebReview.tsx"`
Expected: no new findings (compare any output against the merge-base version of each file — this repo has pre-existing lint debt unrelated to this change).
