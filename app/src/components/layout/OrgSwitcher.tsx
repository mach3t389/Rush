import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { SFIcon, SFModal, SFButton } from '../ui';
import { isDemoSession } from '../../data/authStore';
import { listMyOrganizations, switchActiveStudio, createAdditionalStudio, getStudioId, type MyOrganization } from '../../data/studioStore';

export function OrgSwitcher({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [orgs, setOrgs] = useState<MyOrganization[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isDemoSession()) return;
    let cancelled = false;
    (async () => {
      const [list, current] = await Promise.all([listMyOrganizations(), getStudioId()]);
      if (!cancelled) { setOrgs(list); setActiveId(current); }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (isDemoSession()) return null;

  const active = orgs.find(o => o.studioId === activeId);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      await createAdditionalStudio(name);
      window.location.href = '/';
    } catch (err) {
      console.error('Failed to create organisation', err);
      setCreating(false);
    }
  };

  return (
    <div ref={menuRef} style={{ position: 'relative', padding: collapsed ? '0 6px 8px' : '0 12px 8px' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title={collapsed ? (active?.name ?? t('orgSwitcher.title')) : undefined}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          padding: collapsed ? '7px 0' : '7px 10px', borderRadius: 8,
          border: '1px solid var(--border)', background: 'var(--surface-2)',
          cursor: 'pointer', justifyContent: collapsed ? 'center' : 'space-between',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <SFIcon name="building-2" size={13} color="var(--text-3)" />
          {!collapsed && (
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {active?.name ?? '…'}
            </span>
          )}
        </span>
        {!collapsed && <SFIcon name={open ? 'chevron-up' : 'chevron-down'} size={12} color="var(--text-3)" />}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: collapsed ? 0 : 12, right: collapsed ? 'auto' : 12,
          marginTop: 4, zIndex: 60, background: 'var(--surface)', border: '1px solid var(--border-2)',
          borderRadius: 10, padding: 5, boxShadow: '0 12px 32px rgba(0,0,0,0.5)', minWidth: 200,
        }}>
          {orgs.map(org => (
            <button
              key={org.studioId}
              onClick={() => { setOpen(false); if (org.studioId !== activeId) void switchActiveStudio(org.studioId); }}
              style={{
                display: 'flex', flexDirection: 'column', width: '100%', textAlign: 'left',
                padding: '7px 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
                background: org.studioId === activeId ? 'var(--surface-2)' : 'transparent',
              }}
              onMouseEnter={e => { if (org.studioId !== activeId) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
              onMouseLeave={e => { if (org.studioId !== activeId) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{org.name}</span>
              <span style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)' }}>{org.role}</span>
            </button>
          ))}
          <div style={{ height: 1, background: 'var(--border)', margin: '4px 2px' }} />
          <button
            onClick={() => { setOpen(false); setShowCreate(true); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, width: '100%', textAlign: 'left',
              padding: '7px 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
              background: 'transparent', color: 'var(--accent)', fontSize: 12, fontWeight: 600,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <SFIcon name="plus" size={13} color="var(--accent)" />
            {t('orgSwitcher.createOrg')}
          </button>
        </div>
      )}

      <SFModal open={showCreate} onClose={() => setShowCreate(false)} title={t('orgSwitcher.createOrgTitle')} width={380}>
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 14 }}>{t('orgSwitcher.createOrgDesc')}</p>
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder={t('orgSwitcher.createOrgPlaceholder')}
          autoFocus
          style={{
            width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 9,
            border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)',
            fontSize: 14, outline: 'none', marginBottom: 16,
          }}
        />
        <SFButton variant="primary" onClick={handleCreate} disabled={!newName.trim() || creating}>
          {creating ? '…' : t('orgSwitcher.createOrgSubmit')}
        </SFButton>
      </SFModal>
    </div>
  );
}
