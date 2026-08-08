import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { marked } from 'marked';
import { SFIcon } from './ui';
import { escapeHtml } from '../data/htmlEscape';

// Détecte un texte source markdown non rendu (astérisques/dièses littéraux,
// copiés depuis un éditeur de texte brut) — par opposition à du texte déjà
// mis en forme (collé depuis une app qui fournit du vrai HTML sémantique
// dans le presse-papier, cas déjà géré nativement par Tiptap). Seuil bas
// volontaire : un seul motif markdown reconnu suffit à déclencher la
// conversion, un faux positif se traduit au pire par un texte inchangé
// (** reste visible), jamais par une perte de contenu.
const MARKDOWN_PATTERNS = [
  /^#{1,6}\s+\S/m,          // # Titre
  /\*\*[^*\n]+\*\*/,        // **gras**
  /(?:^|\s)_[^_\n]+_(?:\s|$)/, // _italique_
  /^[-*+]\s+\S/m,           // - liste
  /^\d+\.\s+\S/m,           // 1. liste numérotée
  /\[[^\]\n]+\]\([^)\n]+\)/, // [texte](lien)
  /`[^`\n]+`/,              // `code`
  /^```/m,                  // ```bloc de code```
  /~~[^~\n]+~~/,            // ~~barré~~
];

function looksLikeMarkdownSource(text: string): boolean {
  return MARKDOWN_PATTERNS.some(re => re.test(text));
}

// A description saved before this feature existed is plain text (no HTML
// tags). Detect that case so we can convert it to paragraphs once, instead
// of showing raw "<" characters or losing line breaks.
function looksLikeHtml(text: string): boolean {
  return /<\/[a-z]+>|<[a-z]+[^>]*\/>/i.test(text);
}

function plainTextToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map(block => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

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

function LinkPopover({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const { t } = useTranslation();
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState((editor.getAttributes('link').href as string | undefined) ?? '');

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [onClose]);

  const apply = () => {
    if (url.trim() === '') { editor.chain().focus().unsetLink().run(); onClose(); return; }
    const href = /^https?:\/\//.test(url) ? url : `https://${url}`;
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    onClose();
  };

  return (
    <div
      ref={popoverRef}
      onMouseDown={e => e.stopPropagation()}
      style={{
        position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 50,
        background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8,
        padding: 8, minWidth: 240, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column', gap: 6,
      }}
    >
      <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {t('taskPanel.descriptionToolbar.linkPromptLabel')}
      </label>
      <input
        ref={inputRef}
        type="text"
        value={url}
        onChange={e => setUrl(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); apply(); }
          if (e.key === 'Escape') { e.preventDefault(); onClose(); }
        }}
        placeholder={t('taskPanel.descriptionToolbar.linkPromptPlaceholder')}
        style={{
          width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border-2)',
          background: 'var(--surface)', color: 'var(--text)', fontSize: 12, fontFamily: 'var(--ff-text)',
          outline: 'none', boxSizing: 'border-box',
        }}
      />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
        <button
          type="button"
          onMouseDown={e => e.preventDefault()}
          onClick={apply}
          style={{
            padding: '4px 10px', borderRadius: 6, border: 'none', background: 'var(--accent)',
            color: 'var(--on-accent)', fontSize: 12, fontWeight: 600, fontFamily: 'var(--ff-text)', cursor: 'pointer',
          }}
        >
          OK
        </button>
      </div>
    </div>
  );
}

function DescriptionToolbar({ editor }: { editor: Editor }) {
  const { t } = useTranslation();
  const [headingOpen, setHeadingOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const headingRef = useRef<HTMLDivElement>(null);
  const linkRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!headingOpen) return;
    const onDown = (e: MouseEvent) => {
      if (headingRef.current && !headingRef.current.contains(e.target as Node)) setHeadingOpen(false);
    };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [headingOpen]);

  const activeHeadingLabel = editor.isActive('heading', { level: 1 })
    ? t('taskPanel.descriptionToolbar.heading1')
    : editor.isActive('heading', { level: 2 })
    ? t('taskPanel.descriptionToolbar.heading2')
    : editor.isActive('heading', { level: 3 })
    ? t('taskPanel.descriptionToolbar.heading3')
    : t('taskPanel.descriptionToolbar.headingNormal');

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap',
      padding: '4px 6px', borderRadius: 8, border: '1px solid var(--border)',
      background: 'var(--surface-2)',
      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
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

      <div ref={linkRef} style={{ position: 'relative' }}>
        <ToolbarButton active={editor.isActive('link')} onClick={() => setLinkOpen(o => !o)} title={t('taskPanel.descriptionToolbar.link')}>
          <SFIcon name="link" size={13} color="currentColor" />
        </ToolbarButton>
        {linkOpen && <LinkPopover editor={editor} onClose={() => setLinkOpen(false)} />}
      </div>
    </div>
  );
}

const EDITOR_EXTENSIONS = [
  StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
  Underline,
  Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } }),
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
    // Tiptap's getHTML() always returns at least "<p></p>" for an empty
    // doc, never "" — emit "" instead so callers that truthy-check
    // task.description (list-row icons, etc.) see an emptied description
    // as actually empty, not as content.
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? '' : e.getHTML()),
    editorProps: {
      handlePaste: (_view, event) => {
        const clipboard = event.clipboardData;
        if (!clipboard) return false;
        const html = clipboard.getData('text/html');
        // Du HTML avec de vraies balises sémantiques (copié depuis une app
        // qui a déjà rendu le markdown, ex. un aperçu GitHub) est déjà pris
        // en charge nativement par Tiptap — ne pas y toucher.
        if (html && /<(strong|b|em|i|h[1-6]|ul|ol|blockquote|a\s)/i.test(html)) return false;
        const text = clipboard.getData('text/plain');
        if (!text || !looksLikeMarkdownSource(text)) return false;
        const parsedHtml = marked.parse(text, { breaks: true, async: false }) as string;
        editor?.chain().focus().insertContent(parsedHtml).run();
        return true;
      },
    },
  });

  useEffect(() => {
    editor?.setEditable(editing);
  }, [editing, editor]);

  if (!editor) return null;

  const isEmpty = editor.isEmpty;

  return (
    <div
      ref={wrapperRef}
      style={{ position: 'relative' }}
      onClick={e => {
        if (editing) return;
        if ((e.target as HTMLElement).closest('a')) return;
        // Flip Tiptap's own editable flag synchronously, right here,
        // instead of only setting `editing` and leaving a useEffect to
        // call setEditable — that effect runs on the *next* render, so
        // the click that opens edit mode always landed on a
        // still-non-editable view and placed no caret, needing a second
        // click.
        // Résoudre la position de clic AVANT le setTimeout — au moment où
        // il tourne, la vue vient de repasser éditable et son layout peut
        // avoir bougé (bordure, fond), donc les coordonnées de la souris
        // doivent être capturées ici, sur l'événement natif.
        const clickX = e.clientX;
        const clickY = e.clientY;
        editor.setEditable(true);
        setEditing(true);
        // focus() itself has to be deferred out of this click handler's
        // own call stack — calling it inline here (even after
        // setEditable) never sticks, the browser drops it back to no
        // focus by the time the click finishes dispatching. A macrotask
        // scheduled from the click handler (not from a useEffect, which
        // re-runs/cancels on its own render cycle) reliably lands after
        // that dispatch completes.
        window.setTimeout(() => {
          const coords = editor.view.posAtCoords({ left: clickX, top: clickY });
          editor.commands.focus(coords ? coords.pos : 'end');
        }, 0);
      }}
      onBlur={e => {
        // Ancestors (e.g. TaskPanel's modal wrapper) call e.stopPropagation()
        // on mousedown to shield other document-level "click outside"
        // listeners — that also blocks a mousedown-based exit here. `blur`
        // is a different event, unaffected by that, and fires reliably
        // whenever focus actually leaves this subtree (clicking the task
        // title, sous-tâches, observateurs, etc.), not just on the panel's
        // outer backdrop.
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setEditing(false);
      }}
    >
      {editing && (
        // `position: sticky` sur ce wrapper (participant au flux normal,
        // hauteur réelle) : la barre d'outils occupe sa propre place
        // au-dessus de la boîte de description — jamais par-dessus — et
        // reste collée au sommet de la colonne défilable (`overflow: auto`
        // dans TaskPanel) pendant le défilement d'une longue description.
        <div style={{ position: 'sticky', top: 0, zIndex: 20, marginBottom: 6 }}>
          <DescriptionToolbar editor={editor} />
        </div>
      )}
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
        <EditorContent editor={editor} className="tiptap-desc-content" />
        {isEmpty && !editing && (
          <div style={{ color: 'var(--text-3)', marginTop: -22 }}>{placeholder}</div>
        )}
      </div>
    </div>
  );
}
