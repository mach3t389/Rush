import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFPill, SFCard, SFBar, SFButton } from '../components/ui';
import { SFIcon } from '../components/ui/SFIcon';
import { isPinnedClient, togglePinClient, subscribePinnedClients } from '../data/pinnedStore';
import { getClients, addClient, findClient, updateClient, subscribeClients } from '../data/clientStore';
import { loadPersisted, savePersisted } from '../data/persist';
import type { Client } from '../types/index';

// ── Shared edit panel primitives ──────────────────────────────────────────────

const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--ff-text)' };

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>{label}</p>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.06em', display: 'block', marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}

// ── New client modal ──────────────────────────────────────────────────────────

const AVATAR_COLORS = ['#3b4f8f', '#1a6b4a', '#7d4e57', '#5b3ea8', '#2d5a7d', '#a85f3e', '#2a7a8a', '#404040', '#8a2a6e', '#4a7a2a'];
const SECTOR_KEYS = ['advertising', 'musicClip', 'documentary', 'corporate', 'motionDesign', 'social', 'other'] as const;

function NewClientModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const SECTORS = SECTOR_KEYS.map(k => t(`clients.${k}`));
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
      statusLabel: t('clients.statusActive'),
      lastActivity: t('clients.justNow'),
    };
    addClient(client);
    onClose();
    // For real (Supabase-backed) sessions, addClient() writes asynchronously —
    // wait for the new client to actually be readable before navigating, so
    // FicheClient never mounts with an id that isn't in the store yet.
    if (findClient(id)) {
      navigate(`/clients/${id}`);
    } else {
      const unsubscribe = subscribeClients(() => {
        if (findClient(id)) {
          unsubscribe();
          navigate(`/clients/${id}`);
        }
      });
    }
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ background: 'var(--surface)', borderRadius: 18, border: '1px solid var(--border)', boxShadow: '0 24px 72px rgba(0,0,0,0.6)', width: 480, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: '1px solid var(--border)' }}>
          <h2 style={{ fontSize: 17, fontWeight: 700 }}>{t('clients.newClient')}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', padding: 4 }}>
            <SFIcon name="x" size={17} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Name */}
          <div>
            <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>{t('clients.name')} {t('common.required')}</label>
            <input
              autoFocus
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && canCreate) handleCreate(); }}
              placeholder={t('clients.placeholder')}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 14, fontWeight: 600, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--ff-text)' }}
            />
          </div>

          {/* Sous-titre */}
          <div>
            <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>{t('clients.subtitle')}</label>
            <input
              value={sector}
              onChange={e => setSector(e.target.value)}
              placeholder={t('clients.subtitlePlaceholder')}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--ff-text)' }}
            />
          </div>

          {/* City */}
          <div>
            <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>{t('clients.city')}</label>
            <input
              value={city}
              onChange={e => setCity(e.target.value)}
              placeholder={t('clients.cityPlaceholder')}
              style={{ width: '100%', padding: '9px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--ff-text)' }}
            />
          </div>

          {/* Color */}
          <div>
            <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 8 }}>{t('clients.avatarColor')}</label>
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
            {t('clients.cancel')}
          </button>
          <SFButton variant="primary" onClick={handleCreate} disabled={!canCreate}>
            {t('clients.createClient')}
          </SFButton>
        </div>
      </div>
    </div>
  );
}

// ── Client Edit Panel ─────────────────────────────────────────────────────────

function ClientEditPanel({ client, onClose }: { client: Client; onClose: () => void }) {
  const { t } = useTranslation();
  const [name,        setName]        = useState(client.name);
  const [sector,      setSector]      = useState(client.sector);
  const [city,        setCity]        = useState(client.city === '—' ? '' : client.city);
  const [color,       setColor]       = useState(client.avatarColor);
  const [address,     setAddress]     = useState(client.address ?? '');
  const [phone,       setPhone]       = useState(client.phone ?? '');
  const [email,       setEmail]       = useState(client.email ?? '');
  const [emailCompta, setEmailCompta] = useState(client.emailCompta ?? '');
  const [website,     setWebsite]     = useState(client.website ?? '');
  const [notes,       setNotes]       = useState(client.notes ?? '');

  const commit = (patch: Partial<Client>) => {
    const finalName = ((patch.name ?? name) as string).trim() || client.name;
    const finalCity = ((patch.city ?? city) as string).trim() || '—';
    const initials  = finalName.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2) || client.initials;
    updateClient(client.id, {
      name: finalName, initials,
      sector:      patch.sector      ?? sector,
      city:        finalCity,
      avatarColor: patch.avatarColor ?? color,
      address:     patch.address     ?? address,
      phone:       patch.phone       ?? phone,
      email:       patch.email       ?? email,
      emailCompta: patch.emailCompta ?? emailCompta,
      website:     patch.website     ?? website,
      notes:       patch.notes       ?? notes,
    });
  };

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 600, display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ width: 400, background: 'var(--surface)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0, transition: 'background 0.15s' }}>
              {name.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || client.initials}
            </div>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name || client.name}</h3>
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>{sector}</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4, flexShrink: 0 }}>
            <SFIcon name="x" size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── Identité ── */}
          <Section label={t('clients.identity')}>
            <Field label={t('clients.clientName')}>
              <input autoFocus value={name} onChange={e => setName(e.target.value)}
                onBlur={e => commit({ name: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                style={inputStyle} />
            </Field>
            <Field label={t('clients.subtitle')}>
              <input value={sector} onChange={e => setSector(e.target.value)}
                onBlur={e => commit({ sector: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                placeholder={t('clients.subtitlePlaceholder')} style={inputStyle} />
            </Field>
            <Field label={t('clients.avatarColor')}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {AVATAR_COLORS.map(c => (
                  <button key={c} onClick={() => { setColor(c); commit({ avatarColor: c }); }}
                    style={{ width: 26, height: 26, borderRadius: 7, background: c, border: color === c ? '3px solid white' : '3px solid transparent', outline: color === c ? `2px solid ${c}` : 'none', outlineOffset: 2, cursor: 'pointer', padding: 0, transform: color === c ? 'scale(1.15)' : 'none', transition: 'transform 0.1s', flexShrink: 0 }}
                  />
                ))}
              </div>
            </Field>
          </Section>

          {/* ── Coordonnées ── */}
          <Section label={t('clients.contactInfo')}>
            <Field label={t('clients.address')}>
              <input value={address} onChange={e => setAddress(e.target.value)}
                onBlur={e => commit({ address: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                placeholder={t('clients.addressPlaceholder')} style={inputStyle} />
            </Field>
            <Field label={t('clients.city')}>
              <input value={city} onChange={e => setCity(e.target.value)}
                onBlur={e => commit({ city: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                placeholder={t('clients.cityShortPlaceholder')} style={inputStyle} />
            </Field>
            <Field label={t('clients.website')}>
              <input value={website} onChange={e => setWebsite(e.target.value)}
                onBlur={e => commit({ website: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                placeholder={t('clients.websitePlaceholder')} style={inputStyle} />
            </Field>
          </Section>

          {/* ── Contact principal ── */}
          <Section label={t('clients.mainContact')}>
            <Field label={t('clients.phone')}>
              <input value={phone} onChange={e => setPhone(e.target.value)}
                onBlur={e => commit({ phone: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                placeholder={t('clients.phonePlaceholder')} style={inputStyle} type="tel" />
            </Field>
            <Field label={t('clients.email')}>
              <input value={email} onChange={e => setEmail(e.target.value)}
                onBlur={e => commit({ email: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                placeholder={t('clients.emailPlaceholder')} style={inputStyle} type="email" />
            </Field>
            <Field label={t('clients.accountingEmail')}>
              <input value={emailCompta} onChange={e => setEmailCompta(e.target.value)}
                onBlur={e => commit({ emailCompta: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                placeholder={t('clients.accountingEmailPlaceholder')} style={inputStyle} type="email" />
            </Field>
          </Section>

          {/* ── Notes ── */}
          <Section label={t('clients.internalNotes')}>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              onBlur={e => commit({ notes: e.target.value })}
              placeholder={t('clients.notesPlaceholder')}
              rows={4}
              style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.6, colorScheme: 'dark' } as React.CSSProperties} />
          </Section>

        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Shared row actions (star + edit) ──────────────────────────────────────────

function ClientActions({ clientId, pinned, onEdit }: { clientId: string; pinned: boolean; onEdit: () => void }) {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
      <button
        onClick={e => { e.stopPropagation(); togglePinClient(clientId); }}
        title={pinned ? t('clients.unpin') : t('clients.pinSidebar')}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, border: 'none', flexShrink: 0, background: pinned ? 'rgba(249,255,0,0.12)' : 'var(--surface-2)', color: pinned ? 'var(--accent)' : 'var(--text-2)', cursor: 'pointer', transition: 'background 0.15s, color 0.15s' }}
        onMouseEnter={e => { if (!pinned) { (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; } }}
        onMouseLeave={e => { if (!pinned) { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; } }}
      >
        <SFIcon name="star" size={14} fill={pinned ? 'currentColor' : 'none'} />
      </button>
      <button
        onClick={e => { e.stopPropagation(); onEdit(); }}
        title={t('clients.editClient')}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border-2)', flexShrink: 0, background: 'var(--surface-3)', color: 'var(--text)', cursor: 'pointer', transition: 'background 0.15s, border-color 0.15s' }}
        onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'var(--accent)'; el.style.color = 'var(--on-accent)'; el.style.borderColor = 'transparent'; }}
        onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'var(--surface-3)'; el.style.color = 'var(--text)'; el.style.borderColor = 'var(--border-2)'; }}
      >
        <SFIcon name="square-pen" size={13} />
      </button>
    </div>
  );
}

// ── Detailed list view ────────────────────────────────────────────────────────

const LIST_COLS = 'minmax(200px, 2.2fr) 1.1fr 1.5fr 1fr minmax(120px, 1fr) 108px 68px';

function ColHead({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', ...style }}>
      {children}
    </span>
  );
}

function ClientListView({ clients, onEdit }: { clients: Client[]; onEdit: (c: Client) => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflowX: 'auto', overflowY: 'hidden', background: 'var(--surface)' }}>
      <div style={{ minWidth: 820 }}>
      {/* Header */}
      <div style={{ display: 'grid', gridTemplateColumns: LIST_COLS, gap: 16, alignItems: 'center', padding: '11px 18px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
        <ColHead>{t('clients.colClient')}</ColHead>
        <ColHead>{t('clients.colLocation')}</ColHead>
        <ColHead>{t('clients.colContact')}</ColHead>
        <ColHead>{t('clients.colActivity')}</ColHead>
        <ColHead>{t('clients.colProgress')}</ColHead>
        <ColHead>{t('clients.colStatus')}</ColHead>
        <div />
      </div>

      {/* Rows */}
      {clients.map((client, i) => {
        const pinned = isPinnedClient(client.id);
        return (
          <div
            key={client.id}
            onClick={() => navigate(`/clients/${client.id}`)}
            style={{ display: 'grid', gridTemplateColumns: LIST_COLS, gap: 16, alignItems: 'center', padding: '12px 18px', borderTop: i === 0 ? 'none' : '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.12s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            {/* Client */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: client.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                {client.initials}
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontWeight: 600, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.name}</p>
                <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.03em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>{client.sector}</p>
              </div>
            </div>

            {/* Localisation */}
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 12.5, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.city}</p>
              {client.website && (
                <a
                  href={client.website.startsWith('http') ? client.website : `https://${client.website}`}
                  target="_blank" rel="noreferrer"
                  onClick={e => e.stopPropagation()}
                  style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textDecoration: 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', marginTop: 1 }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
                >
                  {client.website.replace(/^https?:\/\//, '')}
                </a>
              )}
            </div>

            {/* Contact */}
            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {client.email
                ? <span style={{ fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.email}</span>
                : <span style={{ fontSize: 12, color: 'var(--text-3)' }}>—</span>}
              {client.phone && <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10.5, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{client.phone}</span>}
            </div>

            {/* Activité */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 12.5, color: 'var(--text)', whiteSpace: 'nowrap' }}>{t('clients.activeProjects', { count: client.activeProjects })}</span>
              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{t('clients.deliverablesSince', { count: client.pendingDeliverables, year: client.since })}</span>
            </div>

            {/* Progression */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <div style={{ flex: 1, minWidth: 0 }}><SFBar value={client.progress} height={4} /></div>
              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10.5, color: 'var(--text-2)', flexShrink: 0, width: 30, textAlign: 'right' }}>{client.progress}%</span>
            </div>

            {/* Statut */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <SFPill status={client.status} small>{client.statusLabel}</SFPill>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
              <ClientActions clientId={client.id} pinned={pinned} onEdit={() => onEdit(client)} />
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

const VIEW_KEY = 'sf_clients_view';

export function Clients() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch]         = useState('');
  const [filter, setFilter]         = useState<'all' | 'active' | 'archived'>('all');
  const [clients, setClients]       = useState(getClients);
  const [showModal, setShowModal]   = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [view, setView]             = useState<'grid' | 'list'>(() => loadPersisted<'grid' | 'list'>(VIEW_KEY, 'grid'));

  const changeView = (v: 'grid' | 'list') => { setView(v); savePersisted(VIEW_KEY, v); };

  useEffect(() => subscribePinnedClients(() => setClients(getClients())), []);
  useEffect(() => subscribeClients(() => setClients(getClients())), []);

  const filtered = clients.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) || c.sector.toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (filter === 'archived') return !!c.archived;
    if (c.archived) return false;
    if (filter === 'active')   return c.status === 'ok' || c.status === 'info';
    return true;
  });

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      {showModal && <NewClientModal onClose={() => setShowModal(false)} />}
      {editingClient && <ClientEditPanel client={editingClient} onClose={() => setEditingClient(null)} />}

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, fontSize: 22 }}>{t('clients.title')}</h1>
          <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>
            {t('clients.count', { count: clients.length })}
          </p>
        </div>
        <SFButton variant="primary" icon="plus" onClick={() => setShowModal(true)}>{t('clients.newClient')}</SFButton>
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
            placeholder={t('clients.searchPlaceholder')}
            style={{ width: '100%', padding: '8px 12px 8px 32px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {([['all', t('clients.filterAll')], ['active', t('clients.filterActive')], ['archived', t('clients.filterArchived')]] as const).map(([val, label]) => (
            <button key={val} onClick={() => setFilter(val)} style={{ padding: '6px 12px', borderRadius: 9, border: 'none', background: filter === val ? 'var(--surface-3)' : 'transparent', color: filter === val ? 'var(--text)' : 'var(--text-2)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
              {label}
            </button>
          ))}
        </div>

        {/* View toggle */}
        <div style={{ display: 'flex', gap: 2, marginLeft: 'auto', background: 'var(--surface-2)', borderRadius: 9, padding: 2, border: '1px solid var(--border)' }}>
          {([['grid', 'layout-grid', t('clients.viewGrid')], ['list', 'list', t('clients.viewList')]] as const).map(([val, icon, label]) => (
            <button
              key={val}
              onClick={() => changeView(val)}
              title={label}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 26, borderRadius: 7, border: 'none', background: view === val ? 'var(--surface-3)' : 'transparent', color: view === val ? 'var(--text)' : 'var(--text-3)', cursor: 'pointer', transition: 'background 0.12s, color 0.12s' }}
            >
              <SFIcon name={icon} size={15} />
            </button>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '60px 0', color: 'var(--text-3)' }}>
          <SFIcon name="users" size={36} color="var(--text-3)" />
          <p style={{ fontSize: 14 }}>{t('clients.noClientsFound')}</p>
          <SFButton variant="ghost" icon="plus" onClick={() => setShowModal(true)}>{t('clients.newClient')}</SFButton>
        </div>
      )}

      {/* List view */}
      {view === 'list' && filtered.length > 0 && <ClientListView clients={filtered} onEdit={setEditingClient} />}

      {/* Grid */}
      {view === 'grid' && filtered.length > 0 && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {filtered.map(client => {
          const pinned = isPinnedClient(client.id);
          return (
            <SFCard key={client.id} padding={18} gap={12} onClick={() => navigate(`/clients/${client.id}`)}>
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
                {/* Star + edit */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, alignSelf: 'flex-start' }}>
                  <button
                    onClick={e => { e.stopPropagation(); togglePinClient(client.id); }}
                    title={pinned ? t('clients.unpin') : t('clients.pinSidebar')}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, border: 'none', flexShrink: 0, background: pinned ? 'rgba(249,255,0,0.12)' : 'var(--surface-2)', color: pinned ? 'var(--accent)' : 'var(--text-2)', cursor: 'pointer', transition: 'background 0.15s, color 0.15s' }}
                    onMouseEnter={e => { if (!pinned) { (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; } }}
                    onMouseLeave={e => { if (!pinned) { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; } }}
                  >
                    <SFIcon name="star" size={14} fill={pinned ? 'currentColor' : 'none'} />
                  </button>

                  <button
                    onClick={e => { e.stopPropagation(); setEditingClient(client); }}
                    title={t('clients.editClient')}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border-2)', flexShrink: 0, background: 'var(--surface-3)', color: 'var(--text)', cursor: 'pointer', transition: 'background 0.15s, border-color 0.15s' }}
                    onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'var(--accent)'; el.style.color = 'var(--on-accent)'; el.style.borderColor = 'transparent'; }}
                    onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'var(--surface-3)'; el.style.color = 'var(--text)'; el.style.borderColor = 'var(--border-2)'; }}
                  >
                    <SFIcon name="square-pen" size={13} />
                  </button>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-2)' }}>
                <span>{t('clients.activeProjects', { count: client.activeProjects })}</span>
                <span>{t('clients.deliverables', { count: client.pendingDeliverables })}</span>
                <span>{t('clients.since', { year: client.since })}</span>
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
      )}
    </div>
  );
}
