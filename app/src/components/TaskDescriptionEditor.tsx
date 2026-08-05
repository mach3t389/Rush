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

const EDITOR_EXTENSIONS = [
  StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
  Underline,
  Link.configure({ openOnClick: true, autolink: true, HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' } }),
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
    <div ref={wrapperRef} onClick={e => {
      if (editing) return;
      if ((e.target as HTMLElement).closest('a')) return;
      setEditing(true);
    }}>
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
        <EditorContent editor={editor} className="tiptap-desc-content" />
        {isEmpty && !editing && (
          <div style={{ color: 'var(--text-3)', marginTop: -22 }}>{placeholder}</div>
        )}
      </div>
    </div>
  );
}
