import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SFPill, SFCard, SFBar, SFButton } from '../components/ui';
import { SFIcon } from '../components/ui/SFIcon';
import { CLIENTS } from '../data/mock';
import { isPinnedClient, togglePinClient, subscribePinnedClients } from '../data/pinnedStore';

export function Clients() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'archived'>('all');
  const [, forceUpdate] = useState(0);

  useEffect(() => subscribePinnedClients(() => forceUpdate(n => n + 1)), []);

  const filtered = CLIENTS.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.sector.toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (filter === 'active') return c.status === 'ok' || c.status === 'info';
    if (filter === 'archived') return c.status === 'neutral';
    return true;
  });

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, fontSize: 22 }}>Clients</h1>
          <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>
            {CLIENTS.length} clients actifs
          </p>
        </div>
        <SFButton variant="primary" icon="plus">Nouveau client</SFButton>
      </div>

      {/* Search + filters */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 340 }}>
          <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', display: 'flex' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-3)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          </div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un client..."
            style={{ width: '100%', padding: '8px 12px 8px 32px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {([['all', 'Tous'], ['active', 'Actifs'], ['archived', 'Archivés']] as const).map(([val, label]) => (
            <button key={val} onClick={() => setFilter(val)} style={{ padding: '6px 12px', borderRadius: 9, border: 'none', background: filter === val ? 'var(--surface-3)' : 'transparent', color: filter === val ? 'var(--text)' : 'var(--text-2)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {filtered.map(client => {
          const pinned = isPinnedClient(client.id);
          return (
            <SFCard key={client.id} padding={20} gap={12} onClick={() => navigate(`/clients/${client.id}`)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 9, background: client.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                  {client.initials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 600, fontSize: 14 }}>{client.name}</p>
                  <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.04em', textTransform: 'uppercase', marginTop: 2 }}>
                    {client.sector} · {client.city}
                  </p>
                </div>
                {/* Pin star */}
                <button
                  onClick={e => { e.stopPropagation(); togglePinClient(client.id); }}
                  title={pinned ? 'Désépingler' : 'Épingler dans la barre latérale'}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 28, height: 28, borderRadius: 7, border: 'none', flexShrink: 0,
                    background: pinned ? 'rgba(var(--accent-rgb, 124,58,237), 0.12)' : 'transparent',
                    color: pinned ? 'var(--accent)' : 'var(--text-3)',
                    cursor: 'pointer', transition: 'background 0.15s, color 0.15s',
                  }}
                  onMouseEnter={e => {
                    if (!pinned) {
                      (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)';
                      (e.currentTarget as HTMLElement).style.color = 'var(--text)';
                    }
                  }}
                  onMouseLeave={e => {
                    if (!pinned) {
                      (e.currentTarget as HTMLElement).style.background = 'transparent';
                      (e.currentTarget as HTMLElement).style.color = 'var(--text-3)';
                    }
                  }}
                >
                  <SFIcon name="star" size={14} fill={pinned ? 'currentColor' : 'none'} />
                </button>
              </div>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-2)' }}>
                <span>{client.activeProjects} projets actifs</span>
                <span>{client.pendingDeliverables} livrables</span>
                <span>Depuis {client.since}</span>
              </div>

              <SFBar value={client.progress} height={3} />

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <SFPill status={client.status} small>{client.statusLabel}</SFPill>
                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>{client.lastActivity}</span>
              </div>
            </SFCard>
          );
        })}
      </div>
    </div>
  );
}
