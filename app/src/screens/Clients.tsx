import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SFPill, SFCard, SFBar, SFButton } from '../components/ui';
import { SFIcon } from '../components/ui/SFIcon';
import { isPinnedClient, togglePinClient, subscribePinnedClients } from '../data/pinnedStore';
import { getClients, addClient, subscribeClients } from '../data/clientStore';
import type { Client } from '../types/index';

// ── New client modal ──────────────────────────────────────────────────────────

const SECTORS = ['Publicité', 'Documentaire', 'Social', 'Institutionnel', 'Clip musical', 'Motion design', 'Fiction', 'Événementiel', 'Autre'];
const AVATAR_COLORS = ['#3b4f8f', '#1a6b4a', '#7d4e57', '#5b3ea8', '#2d5a7d', '#a85f3e', '#2a7a8a', '#404040', '#8a2a6e', '#4a7a2a'];

function NewClientModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [name,   setName]   = useState('');
  const [sector, setSector] = useState(SECTORS[0]);
  const [city,   setCity]   = useState('');
  const [color,  setColor]  = useState(AVATAR_COLORS[0]);

  const canCreate = name.trim().length > 0;

  const handleCreate = () => {
    if (!canCreate) return;
    const initials = name.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
    const id = `c${Date.now()}`;
    const client: Client = {
      id,
      name: name.trim(),
      initials,
      avatarColor: color,
      sector,
      city: city.trim() || '—',
      activeProjects: 0,
      pendingDeliverables: 0,
      since: String(new Date().getFullYear()),
      progress: 0,
      status: 'ok',
      statusLabel: 'Actif',
      lastActivity: 'À l\'instant',
    };
    addClient(client);
    onClose();
    navigate(`/clients/${id}`);
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'var(--surface)', borderRadius: 18, border: '1px solid var(--border)', boxShadow: '0 24px 72px rgba(0,0,0,0.6)', width: 480, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: 17, fontWeight: 700 }}>Nouveau client</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', padding: 4 }}>
            <SFIcon name="x" size={17} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Name */}
          <div>
            <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>Nom *</label>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && canCreate) handleCreate(); }}
              placeholder="Ex: Studio Lumière..."
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 14, fontWeight: 600, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--ff-text)' }}
            />
          </div>

          {/* Sector */}
          <div>
            <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>Secteur</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {SECTORS.map(s => (
                <button
                  key={s}
                  onClick={() => setSector(s)}
                  style={{ padding: '5px 11px', borderRadius: 8, border: `1.5px solid ${sector === s ? 'var(--accent)' : 'var(--border)'}`, background: sector === s ? 'rgba(249,255,0,0.05)' : 'var(--surface-2)', color: sector === s ? 'var(--text)' : 'var(--text-2)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* City */}
          <div>
            <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>Ville</label>
            <input
              value={city}
              onChange={e => setCity(e.target.value)}
              placeholder="Ex: Paris..."
              style={{ width: '100%', padding: '9px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--ff-text)' }}
            />
          </div>

          {/* Color */}
          <div>
            <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 8 }}>Couleur avatar</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              {AVATAR_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  style={{ width: 28, height: 28, borderRadius: 8, background: c, border: color === c ? '2px solid var(--text)' : '2px solid transparent', cursor: 'pointer', padding: 0, outline: color === c ? `2px solid ${c}` : 'none', outlineOffset: 2 }}
                />
              ))}
              {/* Preview */}
              <div style={{ marginLeft: 8, width: 40, height: 40, borderRadius: 10, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#fff' }}>
                {name.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '??'}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, padding: '16px 24px', borderTop: '1px solid var(--border)' }}>
          <button
            onClick={onClose}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 9, padding: '8px 18px', cursor: 'pointer', fontSize: 13, color: 'var(--text-2)', fontFamily: 'var(--ff-text)' }}
          >
            Annuler
          </button>
          <SFButton variant="primary" onClick={handleCreate} disabled={!canCreate}>
            Créer le client →
          </SFButton>
        </div>
      </div>
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function Clients() {
  const navigate = useNavigate();
  const [search, setSearch]         = useState('');
  const [filter, setFilter]         = useState<'all' | 'active' | 'archived'>('all');
  const [clients, setClients]       = useState(getClients);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [showModal, setShowModal]   = useState(false);

  useEffect(() => subscribePinnedClients(() => setClients(getClients())), []);
  useEffect(() => subscribeClients(() => setClients(getClients())), []);

  const filtered = clients.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.sector.toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (filter === 'active')   return c.status === 'ok' || c.status === 'info';
    if (filter === 'archived') return c.status === 'neutral';
    return true;
  });

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      {showModal && <NewClientModal onClose={() => setShowModal(false)} />}

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, fontSize: 22 }}>Clients</h1>
          <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>
            {clients.length} clients
          </p>
        </div>
        <SFButton variant="primary" icon="plus" onClick={() => setShowModal(true)}>Nouveau client</SFButton>
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
                <button
                  onClick={e => { e.stopPropagation(); togglePinClient(client.id); }}
                  title={pinned ? 'Désépingler' : 'Épingler dans la barre latérale'}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, border: 'none', flexShrink: 0, background: pinned ? 'rgba(var(--accent-rgb, 124,58,237), 0.12)' : 'transparent', color: pinned ? 'var(--accent)' : 'var(--text-3)', cursor: 'pointer', transition: 'background 0.15s, color 0.15s' }}
                  onMouseEnter={e => { if (!pinned) { (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)'; } }}
                  onMouseLeave={e => { if (!pinned) { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; } }}
                >
                  <SFIcon name="star" size={14} fill={pinned ? 'currentColor' : 'none'} />
                </button>

                <div style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => setMenuOpenId(menuOpenId === client.id ? null : client.id)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, border: 'none', background: menuOpenId === client.id ? 'var(--surface-3)' : 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = menuOpenId === client.id ? 'var(--surface-3)' : 'transparent'; }}
                  >
                    <SFIcon name="more-horizontal" size={14} />
                  </button>
                  {menuOpenId === client.id && (
                    <>
                      <div onClick={() => setMenuOpenId(null)} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
                      <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 100, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, padding: 4, minWidth: 175, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                        <button
                          onClick={() => { navigate(`/clients/${client.id}?edit=true`); setMenuOpenId(null); }}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--ff-text)' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <SFIcon name="edit-3" size={13} color="var(--text-3)" />
                          Modifier le client
                        </button>
                        <button
                          onClick={() => { navigate(`/clients/${client.id}`); setMenuOpenId(null); }}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--ff-text)' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <SFIcon name="external-link" size={13} color="var(--text-3)" />
                          Voir le client
                        </button>
                      </div>
                    </>
                  )}
                </div>
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
