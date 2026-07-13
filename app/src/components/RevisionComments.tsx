import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SFAvatar, SFIcon } from './ui';
import { USERS } from '../data/mock';

const TEAM = Object.values(USERS);

function renderMentions(text: string) {
  return text.split(/(@\S+)/g).map((part, i) =>
    part.startsWith('@')
      ? <span key={i} style={{ color: 'var(--accent)', fontWeight: 600 }}>{part}</span>
      : part
  );
}

// ── Shared types ──────────────────────────────────────────────────────────────

export interface RevisionAnnotation {
  x: number;   // % from left
  y: number;   // % from top
  page?: number;
  assetId?: string; // image id or page id
}

export interface RevisionReply {
  id: string;
  author: typeof USERS.lea;
  text: string;
}

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

// ── Palette ───────────────────────────────────────────────────────────────────

export const ANNO_COLORS = ['#f9ff00', '#ff6b6b', '#4ecdc4', '#a8e063', '#c471ed', '#f97316'];

export function annoColor(idx: number) {
  return ANNO_COLORS[idx % ANNO_COLORS.length];
}

// ── AnnotationLayer ───────────────────────────────────────────────────────────
// Drop this over any absolutely-positioned viewer container.

export function AnnotationLayer({
  comments,
  activeId,
  onSelect,
  drawing,
  onPlace,
  assetId,
  page,
}: {
  comments: RevisionComment[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
  drawing: boolean;
  onPlace: (x: number, y: number) => void;
  assetId?: string;
  page?: number;
}) {
  const relevant = comments.filter(c =>
    c.annotation &&
    (assetId ? c.annotation.assetId === assetId : true) &&
    (page !== undefined ? c.annotation.page === page : true)
  );

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!drawing) { onSelect(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    onPlace(x, y);
  };

  return (
    <div
      onClick={handleClick}
      style={{
        position: 'absolute', inset: 0,
        cursor: drawing ? 'crosshair' : 'default',
        zIndex: 10,
      }}
    >
      {relevant.map((c, i) => {
        const color = annoColor(i);
        const isActive = c.id === activeId;
        return (
          <div
            key={c.id}
            onClick={e => { e.stopPropagation(); onSelect(isActive ? null : c.id); }}
            style={{
              position: 'absolute',
              left: `${c.annotation!.x}%`,
              top: `${c.annotation!.y}%`,
              transform: 'translate(-50%, -50%)',
              width: isActive ? 28 : 22,
              height: isActive ? 28 : 22,
              borderRadius: '50%',
              background: color,
              border: `2px solid ${isActive ? '#fff' : 'rgba(0,0,0,0.6)'}`,
              boxShadow: isActive ? `0 0 0 3px ${color}55, 0 2px 8px rgba(0,0,0,0.5)` : '0 2px 6px rgba(0,0,0,0.4)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 700, color: '#000',
              cursor: 'pointer',
              transition: 'all 0.15s',
              zIndex: isActive ? 20 : 15,
              fontFamily: 'var(--ff-mono)',
            }}
          >
            {i + 1}
          </div>
        );
      })}
    </div>
  );
}

// ── CommentCard ───────────────────────────────────────────────────────────────

function CommentCard({
  comment,
  index,
  active,
  onActivate,
  onResolve,
  onReply,
  onDelete,
}: {
  comment: RevisionComment;
  index: number;
  active: boolean;
  onActivate: () => void;
  onResolve: () => void;
  onReply: (text: string) => void;
  onDelete?: () => void;
}) {
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

  return (
    <div
      onClick={onActivate}
      style={{
        borderRadius: 10,
        border: `1px solid ${active ? color : 'var(--border)'}`,
        background: active ? `color-mix(in srgb, ${color} 5%, var(--surface))` : 'var(--surface)',
        padding: '12px 14px',
        cursor: 'pointer',
        transition: 'border-color 0.12s, background 0.12s',
        opacity: resolved ? 0.55 : 1,
        position: 'relative',
      }}
      onMouseEnter={e => { const btn = e.currentTarget.querySelector<HTMLElement>('.rc-delete'); if (btn) btn.style.opacity = '1'; }}
      onMouseLeave={e => { const btn = e.currentTarget.querySelector<HTMLElement>('.rc-delete'); if (btn) btn.style.opacity = '0'; }}
    >
      {/* Trash — apparaît au survol */}
      {onDelete && (
        <button
          className="rc-delete"
          onClick={e => { e.stopPropagation(); onDelete(); }}
          title={t('review.deleteComment')}
          style={{ position: 'absolute', top: 8, right: 8, opacity: 0, transition: 'opacity 0.15s', background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-3)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--danger)'; (e.currentTarget as HTMLElement).style.opacity = '1'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
        >
          <SFIcon name="trash-2" size={13} />
        </button>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {comment.annotation && (
          <div style={{
            width: 18, height: 18, borderRadius: '50%', background: color,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 9, fontWeight: 700, color: '#000', flexShrink: 0,
            fontFamily: 'var(--ff-mono)',
          }}>
            {index + 1}
          </div>
        )}
        <SFAvatar name={comment.author.name} initials={comment.author.initials} color={comment.author.avatarColor} size={20} />
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{comment.author.name}</span>
        {comment.contextLabel && (
          <span style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 5, marginLeft: 'auto' }}>
            {comment.contextLabel}
          </span>
        )}
        {resolved && (
          <SFIcon name="circle-check" size={13} color="var(--ok)" style={{ marginLeft: 'auto' }} />
        )}
      </div>

      {comment.excerpt && (
        <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', borderLeft: '2px solid rgba(249,255,0,0.4)', paddingLeft: 6, marginBottom: 5, lineHeight: 1.4, fontStyle: 'italic' }}>
          "{comment.excerpt}{comment.excerpt.length >= 80 ? '…' : ''}"
        </p>
      )}
      <p style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.45, margin: '0 0 10px' }}>{renderMentions(comment.text)}</p>

      {/* Replies */}
      {comment.replies.length > 0 && (
        <div style={{ borderLeft: '2px solid var(--border)', paddingLeft: 10, marginBottom: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {comment.replies.map(r => (
            <div key={r.id} style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
              <SFAvatar name={r.author.name} initials={r.author.initials} color={r.author.avatarColor} size={16} />
              <div>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)' }}>{r.author.name} </span>
                <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{renderMentions(r.text)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button
          onClick={e => { e.stopPropagation(); setShowReply(v => !v); }}
          style={{ fontSize: 11, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', fontFamily: 'var(--ff-text)' }}
        >
          {t('review.reply')}
        </button>
        <span style={{ color: 'var(--border-2)', fontSize: 11 }}>·</span>
        <button
          onClick={e => { e.stopPropagation(); onResolve(); }}
          style={{ fontSize: 11, color: resolved ? 'var(--text-3)' : 'var(--ok)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', fontFamily: 'var(--ff-text)' }}
        >
          {resolved ? t('review.reopen') : t('review.resolve')}
        </button>
      </div>

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
    </div>
  );
}

// ── RevisionCommentSidebar ────────────────────────────────────────────────────

export function RevisionCommentSidebar({
  comments,
  activeId,
  onActivate,
  onAdd,
  onResolve,
  onReply,
  onDelete,
  pendingAnnotation,
  onCancelPending,
  drawing,
  onToggleDrawing,
  contextLabel,
  embedded,
}: {
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
}) {
  const { t } = useTranslation();
  const [newText, setNewText] = useState('');
  const [filter, setFilter] = useState<'all' | 'open' | 'resolved'>('all');
  const [addMentionQuery, setAddMentionQuery] = useState<string | null>(null);

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

  const handleAddChange = (val: string) => {
    setNewText(val);
    const m = val.match(/@(\w*)$/);
    if (m) setAddMentionQuery(m[1]);
    else setAddMentionQuery(null);
  };

  const pickAddMention = (name: string) => {
    setNewText(prev => prev.replace(/@\w*$/, `@${name} `));
    setAddMentionQuery(null);
  };

  return (
    <div style={{ ...(embedded ? { flex: 1, minHeight: 0 } : { width: 320, flexShrink: 0, borderLeft: '1px solid var(--border)', height: '100%' }), display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{t('review.comments')}</span>
            {openCount > 0 && (
              <span style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', background: 'var(--accent)', color: 'var(--on-accent)', padding: '2px 6px', borderRadius: 10 }}>{openCount}</span>
            )}
          </div>
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
        </div>

        {/* Filter pills */}
        <div style={{ display: 'flex', gap: 4 }}>
          {([['all', t('review.filterAll')], ['open', t('review.filterOpen')], ['resolved', t('review.filterResolved')]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setFilter(k)} style={{
              padding: '3px 9px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 11,
              background: filter === k ? 'var(--surface-3)' : 'transparent',
              color: filter === k ? 'var(--text)' : 'var(--text-3)',
              fontFamily: 'var(--ff-text)', fontWeight: filter === k ? 600 : 400,
            }}>{l}</button>
          ))}
        </div>
      </div>

      {/* Pending annotation prompt */}
      {pendingAnnotation && (
        <div style={{ padding: '10px 16px', background: 'color-mix(in srgb, var(--accent) 8%, transparent)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <p style={{ fontSize: 12, color: 'var(--accent)', marginBottom: 8, fontWeight: 500 }}>
            {contextLabel ? t('review.annotationPlacedOn', { context: contextLabel }) : t('review.annotationPlaced')}
          </p>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              autoFocus
              value={newText}
              onChange={e => setNewText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { onCancelPending(); setNewText(''); } }}
              placeholder={t('review.describeIssue')}
              style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12, outline: 'none', fontFamily: 'var(--ff-text)' }}
            />
            <button onClick={submit} style={{ padding: '7px 12px', borderRadius: 7, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>{t('review.add')}</button>
          </div>
          <button onClick={() => { onCancelPending(); setNewText(''); }} style={{ marginTop: 6, fontSize: 11, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--ff-text)' }}>{t('review.cancel')}</button>
        </div>
      )}

      {/* Comment list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '28px 0', textAlign: 'center' }}>
            <SFIcon name="message-circle" size={26} color="var(--text-3)" />
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 10, marginBottom: filter === 'all' ? 14 : 0 }}>
              {filter === 'resolved' ? t('review.noResolvedComments') : filter === 'open' ? t('review.noOpenComments') : t('review.noCommentsForNow')}
            </p>
            {filter === 'all' && (
              <div style={{ margin: '0 16px', padding: '10px 12px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', textAlign: 'left' }}>
                <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5 }}>
                  💬 {t('review.typeCommentBelow')}<br />
                  {t('review.mentionHintBefore')} <span style={{ fontFamily: 'var(--ff-mono)', background: 'var(--surface-3)', padding: '1px 5px', borderRadius: 4, fontSize: 10 }}>@{t('review.firstNameToken')}</span> {t('review.mentionHintAfter')}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.map((c) => (
              <CommentCard
                key={c.id}
                comment={c}
                index={comments.indexOf(c)}
                active={c.id === activeId}
                onActivate={() => onActivate(c.id === activeId ? null : c.id)}
                onResolve={() => onResolve(c.id)}
                onReply={text => onReply(c.id, text)}
                onDelete={onDelete ? () => onDelete(c.id) : undefined}
              />
            ))}
          </div>
        )}
      </div>

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
              onChange={e => handleAddChange(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && addMentionQuery === null) submit(); }}
              placeholder={t('review.addCommentMention')}
              style={{ flex: 1, padding: '7px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 12, outline: 'none', fontFamily: 'var(--ff-text)' }}
            />
            <button onClick={submit} disabled={!newText.trim()} style={{ padding: '7px 12px', borderRadius: 7, border: 'none', background: newText.trim() ? 'var(--accent)' : 'var(--surface-3)', color: newText.trim() ? 'var(--on-accent)' : 'var(--text-3)', fontSize: 12, cursor: newText.trim() ? 'pointer' : 'default', fontWeight: 600 }}>↵</button>
          </div>
        </div>
      )}
    </div>
  );
}
