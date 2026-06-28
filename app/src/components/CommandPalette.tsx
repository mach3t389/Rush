import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getProjects } from '../data/projectStore';
import { getClients } from '../data/clientStore';
import { MY_TASKS } from '../data/mock';
import { SFIcon } from './ui/SFIcon';

type ResultKind = 'project' | 'client' | 'task';

interface Result {
  kind: ResultKind;
  id: string;
  label: string;
  sublabel?: string;
  color?: string;
  href: string;
}

function search(q: string): Result[] {
  const lq = q.toLowerCase();
  const results: Result[] = [];

  for (const p of getProjects()) {
    if (p.name.toLowerCase().includes(lq) || p.clientName.toLowerCase().includes(lq)) {
      results.push({ kind: 'project', id: p.id, label: p.name, sublabel: p.clientName, color: p.clientColor, href: `/projets/${p.id}` });
    }
  }

  for (const c of getClients()) {
    if (c.name.toLowerCase().includes(lq) || c.sector.toLowerCase().includes(lq) || c.city.toLowerCase().includes(lq)) {
      results.push({ kind: 'client', id: c.id, label: c.name, sublabel: `${c.sector} · ${c.city}`, color: c.avatarColor, href: `/clients/${c.id}` });
    }
  }

  for (const t of MY_TASKS) {
    if (t.title.toLowerCase().includes(lq) || t.projectName.toLowerCase().includes(lq)) {
      results.push({ kind: 'task', id: t.id, label: t.title, sublabel: t.projectName, color: t.projectColor, href: `/projets/${t.projectId}` });
    }
  }

  return results.slice(0, 14);
}

const KIND_ICON: Record<ResultKind, string> = { project: 'folder', client: 'users', task: 'square-check' };
const KIND_LABEL_KEY: Record<ResultKind, string> = { project: 'search.typeProject', client: 'search.typeClient', task: 'search.typeTask' };

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = query.trim() ? search(query) : [];

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIdx(0);
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => { setActiveIdx(0); }, [query]);

  if (!open) return null;

  const select = (r: Result) => {
    navigate(r.href);
    onClose();
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter' && results[activeIdx]) select(results[activeIdx]);
    if (e.key === 'Escape') onClose();
  };

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: 120,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 560, maxWidth: '90vw',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 14,
          boxShadow: '0 24px 64px rgba(0,0,0,0.45)',
          overflow: 'hidden',
        }}
      >
        {/* Input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
          <SFIcon name="search" size={16} color="var(--text-3)" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder={t('search.placeholder')}
            style={{
              flex: 1, border: 'none', background: 'transparent',
              fontSize: 14, color: 'var(--text)', outline: 'none',
              fontFamily: 'var(--ff-text)',
            }}
          />
          <kbd style={{ fontSize: 10, color: 'var(--text-3)', background: 'var(--surface-2)', border: '1px solid var(--border-2)', borderRadius: 5, padding: '2px 6px', fontFamily: 'var(--ff-mono)', flexShrink: 0 }}>ESC</kbd>
        </div>

        {/* Results */}
        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
          {query.trim() === '' && (
            <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
              {t('command.startTyping')}
            </div>
          )}
          {query.trim() !== '' && results.length === 0 && (
            <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
              {t('command.noResults', { query })}
            </div>
          )}
          {results.map((r, i) => (
            <button
              key={r.kind + r.id}
              onClick={() => select(r)}
              onMouseEnter={() => setActiveIdx(i)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                width: '100%', padding: '10px 16px', border: 'none',
                background: i === activeIdx ? 'var(--surface-2)' : 'transparent',
                borderLeft: i === activeIdx ? '2px solid var(--accent)' : '2px solid transparent',
                color: 'var(--text)', cursor: 'pointer', textAlign: 'left',
              }}
            >
              <div style={{
                width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                background: r.color ?? 'var(--surface-3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <SFIcon name={KIND_ICON[r.kind]} size={13} color="rgba(255,255,255,0.85)" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</p>
                {r.sublabel && (
                  <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.sublabel}</p>
                )}
              </div>
              <span style={{
                fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)',
                background: 'var(--surface-2)', borderRadius: 5, padding: '2px 6px',
                border: '1px solid var(--border-2)', flexShrink: 0,
              }}>
                {t(KIND_LABEL_KEY[r.kind])}
              </span>
            </button>
          ))}
        </div>

        {/* Footer hints */}
        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 16 }}>
          <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>↑↓ {t('command.navigate')}</span>
          <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>↵ {t('command.open')}</span>
          <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>ESC {t('command.close')}</span>
        </div>
      </div>
    </div>,
    document.body
  );
}
