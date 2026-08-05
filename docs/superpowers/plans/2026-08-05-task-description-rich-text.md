# Task Description Rich Text Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain-text textarea used for task descriptions in `TaskPanel.tsx` with a Tiptap-based rich-text editor supporting bold/italic/underline, headings, bullet/numbered lists, interactive checkboxes, and links.

**Architecture:** A new isolated component `TaskDescriptionEditor.tsx` wraps Tiptap (`useEditor`) and owns the toolbar + edit/read-only rendering. `TaskPanel.tsx` swaps its current `<textarea>`/`<div>` pair for this component, passing `task.description` (now HTML instead of plain text) through the same `onUpdate?.({ description })` callback it already uses. A `stripHtml()` utility fixes the three tooltip previews elsewhere in the app that read `task.description` as plain text.

**Tech Stack:** React 19, TypeScript, Tiptap 2.x (`@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-task-list`, `@tiptap/extension-task-item`, `@tiptap/extension-underline`, `@tiptap/extension-link`).

## Global Constraints

- No new backend/schema changes — `task.description` stays a plain `string` column, now holding HTML.
- Follow the existing edit/read-only pattern already in `TaskPanel.tsx`: click to edit, `Escape`/blur-equivalent to leave edit mode (Tiptap has no native `<textarea>` blur, so edit mode exits on outside click — see Task 2).
- Toolbar is visible **only** in edit mode (per user decision during brainstorming), not permanently.
- Every task must build with `npx tsc --noEmit -p tsconfig.app.json` producing zero errors, run from `app/`.
- `secLabel(t('taskPanel.description'))` (existing helper, `TaskPanel.tsx:962`) stays exactly where it is, above the editor — do not remove it.
- Style using inline `style={{}}` with the existing CSS tokens (`var(--accent)`, `var(--text-3)`, `var(--surface-3)`, `var(--border)`, `var(--radius)` etc.) — this codebase does not use Tailwind for components like this (see CLAUDE.md "Conventions").
- All new user-facing strings go through `t('namespace.key')` — add keys to both `app/src/locales/fr.json` and `app/src/locales/en.json` before using them (CLAUDE.md i18n rule).

---

### Task 1: Install Tiptap and add translation keys

**Files:**
- Modify: `app/package.json`
- Modify: `app/src/locales/fr.json`
- Modify: `app/src/locales/en.json`

**Interfaces:**
- Produces: i18n keys under `taskPanel.descriptionToolbar.*` and `taskPanel.descriptionLink.*` that Task 2 consumes.

- [ ] **Step 1: Install the Tiptap packages**

Run from `app/`:

```bash
npm install @tiptap/react@^2.9.0 @tiptap/pm@^2.9.0 @tiptap/starter-kit@^2.9.0 @tiptap/extension-task-list@^2.9.0 @tiptap/extension-task-item@^2.9.0 @tiptap/extension-underline@^2.9.0 @tiptap/extension-link@^2.9.0
```

Expected: `package.json` `dependencies` gains these 7 entries; `npm install` exits 0.

- [ ] **Step 2: Add English translation keys**

In `app/src/locales/en.json`, find the `"taskPanel"` object (top-level namespace) and add a new `"descriptionToolbar"` object as a sibling of the existing `"description"` key inside it:

```json
"descriptionToolbar": {
  "bold": "Bold",
  "italic": "Italic",
  "underline": "Underline",
  "heading": "Heading",
  "headingNormal": "Normal text",
  "heading1": "Heading 1",
  "heading2": "Heading 2",
  "heading3": "Heading 3",
  "bulletList": "Bullet list",
  "orderedList": "Numbered list",
  "taskList": "Checklist",
  "link": "Link",
  "linkPromptLabel": "Link URL",
  "linkPromptPlaceholder": "https://example.com",
  "linkRemove": "Remove link"
}
```

- [ ] **Step 3: Add French translation keys**

In `app/src/locales/fr.json`, same location (sibling of `"description"` inside `"taskPanel"`):

```json
"descriptionToolbar": {
  "bold": "Gras",
  "italic": "Italique",
  "underline": "Souligné",
  "heading": "Titre",
  "headingNormal": "Texte normal",
  "heading1": "Titre 1",
  "heading2": "Titre 2",
  "heading3": "Titre 3",
  "bulletList": "Liste à puces",
  "orderedList": "Liste numérotée",
  "taskList": "Liste de tâches",
  "link": "Lien",
  "linkPromptLabel": "URL du lien",
  "linkPromptPlaceholder": "https://exemple.com",
  "linkRemove": "Retirer le lien"
}
```

- [ ] **Step 4: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/locales/en.json','utf8')); JSON.parse(require('fs').readFileSync('src/locales/fr.json','utf8')); console.log('valid')"` from `app/`.
Expected: `valid` printed, no exception.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/locales/en.json src/locales/fr.json
git commit -m "chore: install Tiptap deps, add description toolbar translation keys"
```

---

### Task 2: Build `TaskDescriptionEditor.tsx`

**Files:**
- Create: `app/src/components/TaskDescriptionEditor.tsx`

**Interfaces:**
- Consumes: `t()` from `react-i18next` (`useTranslation()`), CSS tokens from `app/src/index.css` (`var(--accent)`, `var(--on-accent)`, `var(--text)`, `var(--text-2)`, `var(--text-3)`, `var(--surface)`, `var(--surface-2)`, `var(--surface-3)`, `var(--border)`, `var(--border-2)`, `var(--radius)`, `var(--radius-sm)`, `var(--ff-text)`), `SFIcon` from `../components/ui`.
- Produces: `TaskDescriptionEditor` component with this exact signature, consumed by Task 3:
  ```ts
  export function TaskDescriptionEditor(props: {
    value: string;
    onChange: (html: string) => void;
    placeholder: string;
  }): JSX.Element
  ```
  Internal state (edit vs. read-only) is owned entirely inside this component — `TaskPanel.tsx` does not need to know whether it's currently being edited.

This component owns:
1. Detecting plain-text legacy descriptions and converting them to HTML once, on mount.
2. Switching between read-only display and edit mode (click-to-edit, click-outside-to-exit).
3. Rendering the toolbar only while editing.

- [ ] **Step 1: Write the plain-text-to-HTML conversion helper and detection**

Create `app/src/components/TaskDescriptionEditor.tsx` with this first slice:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { SFIcon } from './ui';
import { escapeHtml } from '../data/htmlEscape';

// A description saved before this feature existed is plain text (no HTML
// tags). Detect that case so we can convert it to paragraphs once, instead
// of showing raw "<" characters or losing line breaks.
function looksLikeHtml(text: string): boolean {
  return /<[a-z][\s\S]*>/i.test(text);
}

function plainTextToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map(block => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}
```

- [ ] **Step 2: Write the toolbar sub-component**

Append to the same file:

```tsx
function ToolbarButton({ active, onClick, title, children }: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onMouseDown={e => e.preventDefault()}
      onClick={onClick}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minWidth: 26, height: 26, padding: '0 6px', borderRadius: 6,
        border: '1px solid transparent',
        background: active ? 'rgba(249,255,0,0.12)' : 'transparent',
        color: active ? 'var(--accent)' : 'var(--text-3)',
        cursor: 'pointer', fontSize: 12, fontFamily: 'var(--ff-text)', fontWeight: 600,
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      {children}
    </button>
  );
}

function DescriptionToolbar({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  const [headingOpen, setHeadingOpen] = useState(false);
  const headingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!headingOpen) return;
    const onDown = (e: MouseEvent) => {
      if (headingRef.current && !headingRef.current.contains(e.target as Node)) setHeadingOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [headingOpen]);

  const activeHeadingLabel = editor.isActive('heading', { level: 1 })
    ? t('taskPanel.descriptionToolbar.heading1')
    : editor.isActive('heading', { level: 2 })
    ? t('taskPanel.descriptionToolbar.heading2')
    : editor.isActive('heading', { level: 3 })
    ? t('taskPanel.descriptionToolbar.heading3')
    : t('taskPanel.descriptionToolbar.headingNormal');

  const setLink = () => {
    const previous = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt(t('taskPanel.descriptionToolbar.linkPromptLabel'), previous ?? '');
    if (url === null) return;
    if (url === '') { editor.chain().focus().unsetLink().run(); return; }
    const href = /^https?:\/\//.test(url) ? url : `https://${url}`;
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
  };

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
      padding: '4px 6px', borderRadius: 8, border: '1px solid var(--border)',
      background: 'var(--surface-2)', marginBottom: 6,
    }}>
      <ToolbarButton active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title={t('taskPanel.descriptionToolbar.bold')}>
        <b>G</b>
      </ToolbarButton>
      <ToolbarButton active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title={t('taskPanel.descriptionToolbar.italic')}>
        <i>I</i>
      </ToolbarButton>
      <ToolbarButton active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title={t('taskPanel.descriptionToolbar.underline')}>
        <u>U</u>
      </ToolbarButton>

      <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 2px' }} />

      <div ref={headingRef} style={{ position: 'relative' }}>
        <ToolbarButton active={editor.isActive('heading')} onClick={() => setHeadingOpen(o => !o)} title={t('taskPanel.descriptionToolbar.heading')}>
          <span style={{ fontSize: 11 }}>{activeHeadingLabel}</span>
          <SFIcon name="chevron-down" size={10} color="currentColor" />
        </ToolbarButton>
        {headingOpen && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 50,
            background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8,
            padding: 4, minWidth: 130, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}>
            {[0, 1, 2, 3].map(level => (
              <button
                key={level}
                type="button"
                onMouseDown={e => e.preventDefault()}
                onClick={() => {
                  if (level === 0) editor.chain().focus().setParagraph().run();
                  else editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 }).run();
                  setHeadingOpen(false);
                }}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '5px 8px', borderRadius: 5,
                  border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 12,
                  fontFamily: 'var(--ff-text)', cursor: 'pointer',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
              >
                {level === 0 ? t('taskPanel.descriptionToolbar.headingNormal')
                  : level === 1 ? t('taskPanel.descriptionToolbar.heading1')
                  : level === 2 ? t('taskPanel.descriptionToolbar.heading2')
                  : t('taskPanel.descriptionToolbar.heading3')}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 2px' }} />

      <ToolbarButton active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title={t('taskPanel.descriptionToolbar.bulletList')}>
        <SFIcon name="list" size={13} color="currentColor" />
      </ToolbarButton>
      <ToolbarButton active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title={t('taskPanel.descriptionToolbar.orderedList')}>
        <SFIcon name="list-ordered" size={13} color="currentColor" />
      </ToolbarButton>
      <ToolbarButton active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()} title={t('taskPanel.descriptionToolbar.taskList')}>
        <SFIcon name="list-checks" size={13} color="currentColor" />
      </ToolbarButton>

      <div style={{ width: 1, height: 16, background: 'var(--border)', margin: '0 2px' }} />

      <ToolbarButton active={editor.isActive('link')} onClick={setLink} title={t('taskPanel.descriptionToolbar.link')}>
        <SFIcon name="link" size={13} color="currentColor" />
      </ToolbarButton>
    </div>
  );
}
```

`SFIcon` accepts any kebab-case Lucide icon name (per CLAUDE.md); `list`, `list-ordered`, `list-checks`, `link`, `chevron-down` are all valid Lucide names.

- [ ] **Step 3: Write the main `TaskDescriptionEditor` component**

Append to the same file:

```tsx
const EDITOR_EXTENSIONS = [
  StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
  Underline,
  Link.configure({ openOnClick: false, autolink: true }),
  TaskList,
  TaskItem.configure({ nested: false }),
];

export function TaskDescriptionEditor({ value, onChange, placeholder }: {
  value: string;
  onChange: (html: string) => void;
  placeholder: string;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Convert a legacy plain-text description to HTML exactly once, the
  // first time this component mounts with that value — never again, so we
  // don't re-run the conversion on every keystroke.
  const initialContent = useRef(
    value && !looksLikeHtml(value) ? plainTextToHtml(value) : value
  );

  const editor = useEditor({
    extensions: EDITOR_EXTENSIONS,
    content: initialContent.current,
    editable: editing,
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
  });

  useEffect(() => {
    editor?.setEditable(editing);
  }, [editing, editor]);

  useEffect(() => {
    if (!editing) return;
    const onDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setEditing(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [editing]);

  if (!editor) return null;

  const isEmpty = editor.isEmpty;

  return (
    <div ref={wrapperRef} onClick={() => { if (!editing) setEditing(true); }}>
      {editing && <DescriptionToolbar editor={editor} />}
      <div
        title={editing ? undefined : t('taskPanel.clickToEdit')}
        style={{
          width: '100%', padding: '8px 12px', borderRadius: 10,
          border: `1px solid ${editing ? 'var(--accent)' : 'transparent'}`,
          background: editing ? 'var(--surface-3)' : 'transparent',
          fontSize: 13, fontFamily: 'var(--ff-text)', lineHeight: 1.6,
          boxSizing: 'border-box', cursor: editing ? 'text' : 'pointer', minHeight: 56,
        }}
        onMouseEnter={e => { if (!editing) (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; }}
        onMouseLeave={e => { if (!editing) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        <EditorContent editor={editor} />
        {isEmpty && !editing && (
          <div style={{ color: 'var(--text-3)', marginTop: editor.isEmpty ? -22 : 0 }}>{placeholder}</div>
        )}
      </div>
    </div>
  );
}
```

The empty-state placeholder is drawn as a second element rather than a Tiptap `Placeholder` extension, keeping the dependency list to exactly the 7 packages installed in Task 1.

- [ ] **Step 4: Add the required CSS for Tiptap's default output**

Open `app/src/index.css` and append at the end of the file:

```css
.tiptap-desc-content p { margin: 0 0 6px; }
.tiptap-desc-content p:last-child { margin-bottom: 0; }
.tiptap-desc-content ul, .tiptap-desc-content ol { margin: 0 0 6px; padding-left: 22px; }
.tiptap-desc-content ul[data-type="taskList"] { list-style: none; padding-left: 4px; }
.tiptap-desc-content ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 6px; }
.tiptap-desc-content ul[data-type="taskList"] li > label { margin-top: 3px; }
.tiptap-desc-content h1 { font-size: 18px; font-weight: 700; margin: 10px 0 6px; }
.tiptap-desc-content h2 { font-size: 16px; font-weight: 700; margin: 8px 0 6px; }
.tiptap-desc-content h3 { font-size: 14px; font-weight: 700; margin: 6px 0 4px; }
.tiptap-desc-content a { color: var(--accent); text-decoration: underline; }
.tiptap-desc-content .ProseMirror { outline: none; color: var(--text); }
```

Then give `EditorContent` this class — go back to Step 3's JSX and change:

```tsx
<EditorContent editor={editor} />
```

to:

```tsx
<EditorContent editor={editor} className="tiptap-desc-content" />
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json` from `app/`.
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/TaskDescriptionEditor.tsx src/index.css
git commit -m "feat(tasks): add TaskDescriptionEditor rich-text component"
```

---

### Task 3: Wire `TaskDescriptionEditor` into `TaskPanel.tsx`

**Files:**
- Modify: `app/src/components/TaskPanel.tsx:1232-1277` (the Description block, including the surrounding `editingDescription`/`descRef`/`descViewRef`/`pendingCaretOffset`/`caretOffsetFromPoint` machinery it replaces)

**Interfaces:**
- Consumes: `TaskDescriptionEditor` from Task 2 (`{ value, onChange, placeholder }`).

This task removes description-specific state that no longer applies (the plain-`<textarea>` auto-height effect, the click-to-caret-offset logic) since `TaskDescriptionEditor` now owns all of that internally.

- [ ] **Step 1: Remove the now-unused `caretOffsetFromPoint` helper**

In `app/src/components/TaskPanel.tsx`, delete the whole function at lines ~529-554 (from the comment `// Maps a click's viewport (x, y)...` through the closing `}` of `caretOffsetFromPoint`). Nothing else in the file calls it once Step 3 of this task is done — confirm with `grep -n "caretOffsetFromPoint" app/src/components/TaskPanel.tsx` returning no matches after this task completes.

- [ ] **Step 2: Remove the now-unused description state and effect**

Delete these lines (currently ~588-589, ~595, ~606, and the effect ~624-634):

```tsx
  const [description, setDescription] = useState(task.description ?? '');
```
→ keep this one (still needed, see Step 3), but delete:
```tsx
  const [editingDescription, setEditingDescription] = useState(false);
  const descViewRef = useRef<HTMLDivElement>(null);
  // Caret offset captured from the click that opens edit mode, applied once
  // the textarea mounts — the read-only <div> is swapped for a <textarea>
  // on click, and `autoFocus` alone always places the caret at position 0
  // regardless of where in the text the user actually clicked, forcing a
  // second click to actually position it.
  const pendingCaretOffset = useRef<number | null>(null);
```
and:
```tsx
  const descRef = useRef<HTMLTextAreaElement>(null);
```
and the whole effect:
```tsx
  useEffect(() => {
    if (descRef.current) {
      descRef.current.style.height = 'auto';
      descRef.current.style.height = descRef.current.scrollHeight + 'px';
      if (editingDescription && pendingCaretOffset.current !== null) {
        const pos = Math.min(pendingCaretOffset.current, descRef.current.value.length);
        descRef.current.focus();
        descRef.current.setSelectionRange(pos, pos);
        pendingCaretOffset.current = null;
      }
    }
  }, [description, editingDescription]);
```

- [ ] **Step 3: Replace the Description JSX block**

Replace this entire block:

```tsx
          {/* Description — persistée via onUpdate (voir onChange plus bas) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {secLabel(t('taskPanel.description'))}
            {editingDescription ? (
              <textarea
                ref={descRef}
                value={description}
                onChange={e => { setDescription(e.target.value); onUpdate?.({ description: e.target.value }); }}
                onBlur={() => setEditingDescription(false)}
                onKeyDown={e => { if (e.key === 'Escape') { setEditingDescription(false); } }}
                placeholder={t('tasks.addDescription')}
                rows={2}
                autoFocus
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 10,
                  border: '1px solid var(--accent)', background: 'var(--surface-3)',
                  color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)',
                  resize: 'none', outline: 'none', lineHeight: 1.6, boxSizing: 'border-box',
                  overflow: 'hidden', minHeight: 56,
                }}
              />
            ) : (
              <div
                ref={descViewRef}
                onClick={e => {
                  pendingCaretOffset.current = description
                    ? caretOffsetFromPoint(e.clientX, e.clientY, e.currentTarget)
                    : 0;
                  setEditingDescription(true);
                }}
                title={t('taskPanel.clickToEdit')}
                style={{
                  width: '100%', padding: '8px 12px', borderRadius: 10,
                  border: '1px solid transparent', background: 'transparent',
                  color: description ? 'var(--text)' : 'var(--text-3)', fontSize: 13, fontFamily: 'var(--ff-text)',
                  lineHeight: 1.6, boxSizing: 'border-box', cursor: 'text', minHeight: 56,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                {description ? linkify(description.trimEnd()) : t('tasks.addDescription')}
              </div>
            )}
          </div>
```

with:

```tsx
          {/* Description — persistée via onUpdate (voir onChange plus bas) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {secLabel(t('taskPanel.description'))}
            <TaskDescriptionEditor
              value={description}
              onChange={html => { setDescription(html); onUpdate?.({ description: html }); }}
              placeholder={t('tasks.addDescription')}
            />
          </div>
```

- [ ] **Step 4: Add the import**

Near the top of `app/src/components/TaskPanel.tsx`, alongside the other component imports (e.g. next to the existing `import { SFIcon } from './ui';` or similar local import), add:

```tsx
import { TaskDescriptionEditor } from './TaskDescriptionEditor';
```

- [ ] **Step 5: Remove the now-unused `linkify` import if nothing else in the file uses it**

Run: `grep -n "linkify(" app/src/components/TaskPanel.tsx` from the repo root.
If the only remaining matches are inside comments or none at all, remove the line `import { linkify } from '../utils/linkify';` from the top of the file. If `linkify(` is still called elsewhere in the file (e.g. on comment text), leave the import in place.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json` from `app/`.
Expected: 0 errors. In particular, confirm no "declared but never used" errors for `editingDescription`, `descRef`, `descViewRef`, `pendingCaretOffset`, or `caretOffsetFromPoint`.

- [ ] **Step 7: Commit**

```bash
git add src/components/TaskPanel.tsx
git commit -m "feat(tasks): wire TaskDescriptionEditor into TaskPanel, drop plain-text description editing"
```

---

### Task 4: Fix the 3 plain-text tooltip previews

**Files:**
- Create: `app/src/utils/stripHtml.ts`
- Modify: `app/src/screens/Travail.tsx:568`
- Modify: `app/src/screens/TravailBoard.tsx:536`
- Modify: `app/src/screens/Taches.tsx:572`

**Interfaces:**
- Produces: `export function stripHtml(html: string): string` — plain-text extraction from an HTML string, used by all three call sites below.

- [ ] **Step 1: Create `stripHtml.ts`**

```ts
// Extracts plain text from an HTML string — used for tooltip/preview text
// where a task description (now stored as Tiptap-generated HTML) needs to
// read as plain text instead of showing raw markup.
export function stripHtml(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent ?? '').trim();
}
```

- [ ] **Step 2: Update `Travail.tsx`**

In `app/src/screens/Travail.tsx`, find line 568:

```tsx
          <span title={task.description.slice(0, 120)} style={{ flexShrink: 0, marginLeft: 2, display: 'flex', alignItems: 'center' }}>
```

Replace with:

```tsx
          <span title={stripHtml(task.description).slice(0, 120)} style={{ flexShrink: 0, marginLeft: 2, display: 'flex', alignItems: 'center' }}>
```

Add the import near the top of the file, alongside the other utility imports:

```tsx
import { stripHtml } from '../utils/stripHtml';
```

- [ ] **Step 3: Update `TravailBoard.tsx`**

In `app/src/screens/TravailBoard.tsx`, find line 536:

```tsx
                              <span title={task.description.slice(0, 120)} style={{ display: 'flex', alignItems: 'center' }}>
```

Replace with:

```tsx
                              <span title={stripHtml(task.description).slice(0, 120)} style={{ display: 'flex', alignItems: 'center' }}>
```

Add the import near the top of the file:

```tsx
import { stripHtml } from '../utils/stripHtml';
```

- [ ] **Step 4: Update `Taches.tsx`**

In `app/src/screens/Taches.tsx`, find line 572:

```tsx
          <span title={task.description.slice(0, 120)} style={{ flexShrink: 0, marginLeft: 5, display: 'flex', alignItems: 'center' }}>
```

Replace with:

```tsx
          <span title={stripHtml(task.description).slice(0, 120)} style={{ flexShrink: 0, marginLeft: 5, display: 'flex', alignItems: 'center' }}>
```

Add the import near the top of the file:

```tsx
import { stripHtml } from '../utils/stripHtml';
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.app.json` from `app/`.
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/utils/stripHtml.ts src/screens/Travail.tsx src/screens/TravailBoard.tsx src/screens/Taches.tsx
git commit -m "fix(tasks): strip HTML from description tooltip previews"
```

---

### Task 5: Live verification

**Files:** None (verification only, no code changes expected unless a bug surfaces).

- [ ] **Step 1: Start the dev server and open a task with an existing plain-text description**

Run `npm run dev --prefix app -- --port <unused-port> --strictPort` (or use the project's preview tooling). Open any task that has a pre-existing plain-text description (e.g. one with multiple lines/paragraphs). Click into the description.
Expected: the text appears as paragraphs, line breaks preserved, no raw `<` characters visible, editable immediately.

- [ ] **Step 2: Test each toolbar action**

With the description in edit mode: toggle bold, italic, underline on a text selection; apply H1/H2/H3 and switch back to normal; toggle a bullet list; toggle a numbered list; toggle a checklist and check/uncheck an item; add a link via the link button, then remove it.
Expected: each control visually reflects active state (highlighted) when the cursor is inside that formatting; the checklist item's checkbox is directly clickable; the link opens the URL prompt and applies/removes correctly.

- [ ] **Step 3: Verify read-only rendering and click-to-edit**

Click outside the description to exit edit mode.
Expected: formatting (bold/headings/lists/checkboxes) renders correctly in read-only mode; checkbox items remain clickable in read-only mode without entering edit mode first; clicking elsewhere in the text (not on a checkbox) enters edit mode.

- [ ] **Step 4: Verify persistence**

Reload the page (or close and reopen the task panel) after editing a description.
Expected: the formatted HTML persists and re-renders identically.

- [ ] **Step 5: Verify the 3 tooltip previews**

Hover the description icon on a task row with a formatted description in: the list view (`Travail.tsx`), the Kanban board (`TravailBoard.tsx`), and Mes tâches (`Taches.tsx`).
Expected: the tooltip shows plain text (no HTML tags), truncated at 120 characters.

- [ ] **Step 6: Report findings**

If any step in this task fails, fix the underlying code in the relevant task's files, re-run the affected task's typecheck, and re-verify. Do not mark this task complete with a known-broken behavior.

---
