import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { SFIcon, SFButton } from '../ui';

// ── Permissions ───────────────────────────────────────────────────────────────

export type PermissionKey =
  | 'manage_projects'
  | 'manage_team'
  | 'manage_clients'
  | 'view_invoices'
  | 'manage_invoices'
  | 'manage_files'
  | 'request_approval'
  | 'manage_permissions';

export const PERMISSION_DEFS: { key: PermissionKey; labelKey: string; descKey: string; group: string; groupKey: string }[] = [
  { key: 'manage_projects',    labelKey: 'profile.permManageProjects',    descKey: 'profile.permManageProjectsDesc',    group: 'Projets',  groupKey: 'profile.groupProjects' },
  { key: 'manage_clients',     labelKey: 'profile.permManageClients',     descKey: 'profile.permManageClientsDesc',     group: 'Projets',  groupKey: 'profile.groupProjects' },
  { key: 'manage_team',        labelKey: 'profile.permManageTeam',        descKey: 'profile.permManageTeamDesc',        group: 'Équipe',   groupKey: 'profile.groupTeam' },
  { key: 'manage_permissions', labelKey: 'profile.permManagePermissions', descKey: 'profile.permManagePermissionsDesc', group: 'Équipe',   groupKey: 'profile.groupTeam' },
  { key: 'view_invoices',      labelKey: 'profile.permViewInvoices',      descKey: 'profile.permViewInvoicesDesc',      group: 'Finances', groupKey: 'profile.groupFinances' },
  { key: 'manage_invoices',    labelKey: 'profile.permManageInvoices',    descKey: 'profile.permManageInvoicesDesc',    group: 'Finances', groupKey: 'profile.groupFinances' },
  { key: 'manage_files',       labelKey: 'profile.permManageFiles',       descKey: 'profile.permManageFilesDesc',       group: 'Fichiers', groupKey: 'profile.groupFiles' },
  { key: 'request_approval',   labelKey: 'profile.permRequestApproval',   descKey: 'profile.permRequestApprovalDesc',   group: 'Fichiers', groupKey: 'profile.groupFiles' },
];

export const DEFAULT_PERMISSIONS: Record<string, PermissionKey[]> = {
  'Admin':          ['manage_projects','manage_team','manage_clients','view_invoices','manage_invoices','manage_files','request_approval','manage_permissions'],
  'Dir. créative':  ['manage_projects','manage_clients','manage_files','request_approval','view_invoices'],
  'Chef de projet': ['manage_projects','manage_clients','manage_files','request_approval'],
  'Monteuse':       ['manage_files','request_approval'],
  'Producteur':     ['manage_projects','manage_clients','manage_files','view_invoices','request_approval'],
};

export interface PermissionPreset {
  key: string;
  labelKey: string;
  descKey: string;
  perms: PermissionKey[];
}

export const PERMISSION_PRESETS: PermissionPreset[] = [
  {
    key: 'admin',
    labelKey: 'profile.presetAdmin',
    descKey: 'profile.presetAdminDesc',
    perms: ['manage_projects','manage_team','manage_clients','view_invoices','manage_invoices','manage_files','request_approval','manage_permissions'],
  },
  {
    key: 'gestionnaire',
    labelKey: 'profile.presetManager',
    descKey: 'profile.presetManagerDesc',
    perms: ['manage_projects','manage_clients','manage_files','request_approval','view_invoices'],
  },
  {
    key: 'collaborateur',
    labelKey: 'profile.presetCollaborator',
    descKey: 'profile.presetCollaboratorDesc',
    perms: ['manage_files','request_approval'],
  },
  {
    key: 'observateur',
    labelKey: 'profile.presetObserver',
    descKey: 'profile.presetObserverDesc',
    perms: ['view_invoices'],
  },
];

export function matchPreset(perms: PermissionKey[]): string | null {
  const sorted = [...perms].sort().join(',');
  for (const p of PERMISSION_PRESETS) {
    if ([...p.perms].sort().join(',') === sorted) return p.key;
  }
  return null;
}

const PERM_STORAGE_KEY = (id: string) => `sf_perms_${id}`;
const PROFILE_STORAGE_KEY = (id: string) => `sf_profile_${id}`;
const PHOTO_STORAGE_KEY = (id: string) => `sf_photo_${id}`;

export function loadPermissions(userId: string, role: string): PermissionKey[] {
  try {
    const raw = localStorage.getItem(PERM_STORAGE_KEY(userId));
    if (raw) return JSON.parse(raw);
  } catch { /* noop */ }
  return DEFAULT_PERMISSIONS[role] ?? [];
}

export function savePermissions(userId: string, perms: PermissionKey[]) {
  try { localStorage.setItem(PERM_STORAGE_KEY(userId), JSON.stringify(perms)); } catch { /* noop */ }
}

export interface ProfileOverrides {
  name?: string;
  role?: string;
  email?: string;
  phone?: string;
}

export function loadProfile(userId: string): ProfileOverrides {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY(userId));
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

export function saveProfile(userId: string, data: ProfileOverrides) {
  try { localStorage.setItem(PROFILE_STORAGE_KEY(userId), JSON.stringify(data)); } catch { /* noop */ }
}

export function loadPhoto(userId: string): string | null {
  try { return localStorage.getItem(PHOTO_STORAGE_KEY(userId)); } catch { return null; }
}

export function savePhoto(userId: string, dataUrl: string) {
  try { localStorage.setItem(PHOTO_STORAGE_KEY(userId), dataUrl); } catch { /* noop */ }
}

// ── Role list ─────────────────────────────────────────────────────────────────

const ROLES = ['Admin', 'Dir. créative', 'Chef de projet', 'Monteuse', 'Producteur', 'Motion designer', 'Photographe', 'Community manager'];

// ── Component ─────────────────────────────────────────────────────────────────

interface ProfileEditPanelProps {
  userId: string;
  initialName: string;
  initialRole: string;
  initialEmail: string;
  initialPhone: string;
  initialInitials: string;
  initialColor: string;
  isSelf?: boolean;
  isAdmin?: boolean;
  onClose: () => void;
  onSave?: (data: { name: string; role: string; email: string; phone: string; permissions: PermissionKey[]; photoUrl: string | null }) => void;
}

export function ProfileEditPanel({
  userId, initialName, initialRole, initialEmail, initialPhone,
  initialInitials, initialColor,
  isSelf = false, isAdmin = false,
  onClose, onSave,
}: ProfileEditPanelProps) {
  const { t } = useTranslation();
  const overrides = loadProfile(userId);
  const [name, setName]   = useState(overrides.name  ?? initialName);
  const [role, setRole]   = useState(overrides.role  ?? initialRole);
  const [email, setEmail] = useState(overrides.email ?? initialEmail);
  const [phone, setPhone] = useState(overrides.phone ?? initialPhone);
  const [photo, setPhoto] = useState<string | null>(loadPhoto(userId));
  const [permissions, setPermissions] = useState<PermissionKey[]>(() => loadPermissions(userId, overrides.role ?? initialRole));
  const [tab, setTab] = useState<'info' | 'permissions'>('info');
  const [roleOpen, setRoleOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const isAdminRole = role === 'Admin';
  const canEditPerms = isAdmin;

  const handlePhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string;
      setPhoto(dataUrl);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const togglePerm = (key: PermissionKey) => {
    if (isAdminRole) return;
    setPermissions(prev => prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]);
  };

  const handleSave = () => {
    saveProfile(userId, { name, role, email, phone });
    savePermissions(userId, permissions);
    if (photo) savePhoto(userId, photo);
    setSaved(true);
    setTimeout(() => {
      onSave?.({ name, role, email, phone, permissions, photoUrl: photo });
      onClose();
    }, 800);
  };

  const initials = name.trim().split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || initialInitials;

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 11px', borderRadius: 9,
    border: '1px solid var(--border)', background: 'var(--surface-2)',
    color: 'var(--text)', fontSize: 13, outline: 'none',
    fontFamily: 'var(--ff-text)', boxSizing: 'border-box',
  };

  const label = (text: string) => (
    <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>{text}</p>
  );

  const groups = [...new Set(PERMISSION_DEFS.map(p => p.group))];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', justifyContent: 'flex-end' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />

      <div style={{ position: 'relative', width: 480, height: '100%', background: 'var(--surface)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '-16px 0 48px rgba(0,0,0,0.7)', borderLeft: '1px solid var(--border)' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px 0', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700 }}>{isSelf ? t('profile.myProfile') : t('profile.profileOf', { name: initialName })}</h3>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4 }}>
              <SFIcon name="x" size={16} />
            </button>
          </div>

          {/* Avatar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div style={{ width: 68, height: 68, borderRadius: '50%', background: initialColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700, color: '#fff', overflow: 'hidden' }}>
                {photo
                  ? <img src={photo} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : initials}
              </div>
              {(isSelf || isAdmin) && (
                <button
                  onClick={() => fileRef.current?.click()}
                  style={{ position: 'absolute', bottom: -2, right: -2, width: 24, height: 24, borderRadius: '50%', background: 'var(--accent)', border: '2px solid var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                  title={t('profile.changePhoto')}
                >
                  <SFIcon name="camera" size={11} color="var(--on-accent)" />
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhoto} />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 17, fontWeight: 700 }}>{name}</p>
              <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>{role}</p>
              {photo && (
                <button onClick={() => setPhoto(null)} style={{ marginTop: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 11, fontFamily: 'var(--ff-text)', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <SFIcon name="x" size={11} color="var(--text-3)" /> {t('profile.removePhoto')}
                </button>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0 }}>
            {([['info', t('profile.tabInfo')], ['permissions', t('profile.tabPermissions')]] as const).map(([key, lbl]) => (
              <button key={key} onClick={() => setTab(key)} style={{ flex: 1, padding: '9px 0', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: tab === key ? 600 : 400, color: tab === key ? 'var(--text)' : 'var(--text-3)', borderBottom: `2px solid ${tab === key ? 'var(--accent)' : 'transparent'}`, fontFamily: 'var(--ff-text)', transition: 'color 0.1s' }}>
                {lbl}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>

          {tab === 'info' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                {label(t('profile.fullName'))}
                <input value={name} onChange={e => setName(e.target.value)} style={inputStyle} disabled={!isSelf && !isAdmin} />
              </div>

              <div>
                {label(t('profile.rolePosition'))}
                <div style={{ position: 'relative' }}>
                  <button onClick={() => { if (isAdmin) setRoleOpen(v => !v); }}
                    style={{ ...inputStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: isAdmin ? 'pointer' : 'default', textAlign: 'left' }}>
                    <span>{role}</span>
                    {isAdmin && <SFIcon name="chevron-down" size={13} color="var(--text-3)" />}
                  </button>
                  {roleOpen && (
                    <>
                      <div onClick={() => setRoleOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 599 }} />
                      <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 600, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, padding: 4, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', maxHeight: 240, overflowY: 'auto' }}>
                        {ROLES.map(r => (
                          <button key={r} onClick={() => { setRole(r); setRoleOpen(false); if (!isAdminRole) setPermissions(DEFAULT_PERMISSIONS[r] ?? []); }}
                            style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '8px 10px', borderRadius: 7, border: 'none', background: r === role ? 'var(--surface-3)' : 'transparent', color: 'var(--text)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}
                            onMouseEnter={e => { if (r !== role) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
                            onMouseLeave={e => { if (r !== role) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                          >
                            {r === role && <SFIcon name="check" size={13} color="var(--accent)" style={{ marginRight: 6 }} />}
                            {r !== role && <span style={{ width: 19, display: 'inline-block' }} />}
                            {r}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div>
                {label(t('profile.email'))}
                <input value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} disabled={!isSelf && !isAdmin} type="email" />
              </div>

              <div>
                {label(t('profile.phone'))}
                <input value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} disabled={!isSelf && !isAdmin} type="tel" />
              </div>
            </div>
          )}

          {tab === 'permissions' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {isAdminRole && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: 'rgba(249,255,0,0.06)', border: '1px solid var(--accent)' }}>
                  <SFIcon name="shield-check" size={16} color="var(--accent)" />
                  <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>{t('profile.adminNotice')}</p>
                </div>
              )}
              {!canEditPerms && !isSelf && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <SFIcon name="lock" size={15} color="var(--text-3)" />
                  <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>{t('profile.adminOnlyNotice')}</p>
                </div>
              )}
              {/* Presets */}
              {(canEditPerms || isSelf) && !isAdminRole && (() => {
                const activePreset = matchPreset(permissions);
                return (
                  <div>
                    <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{t('profile.presets')}</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {PERMISSION_PRESETS.map(preset => {
                        const active = activePreset === preset.key;
                        return (
                          <button key={preset.key} onClick={() => setPermissions(preset.perms)}
                            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`, background: active ? 'rgba(249,255,0,0.06)' : 'var(--surface-2)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.12s', fontFamily: 'var(--ff-text)' }}
                            onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)'; }}
                            onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
                          >
                            <div style={{ flex: 1 }}>
                              <p style={{ fontSize: 13, fontWeight: 600, color: active ? 'var(--accent)' : 'var(--text)' }}>{t(preset.labelKey)}</p>
                              <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{t(preset.descKey)}</p>
                            </div>
                            <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${active ? 'var(--accent)' : 'var(--border-2)'}`, background: active ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.12s' }}>
                              {active && <SFIcon name="check" size={10} color="var(--on-accent)" />}
                            </div>
                          </button>
                        );
                      })}
                      {!activePreset && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 10, border: '1px solid var(--accent)', background: 'rgba(249,255,0,0.04)' }}>
                          <SFIcon name="sliders" size={13} color="var(--accent)" />
                          <p style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>{t('profile.custom')}</p>
                        </div>
                      )}
                    </div>
                    <div style={{ height: 1, background: 'var(--border)', margin: '16px 0' }} />
                    <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{t('profile.permissionDetail')}</p>
                  </div>
                );
              })()}
              {groups.map(group => (
                <div key={group}>
                  <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{t(PERMISSION_DEFS.find(p => p.group === group)!.groupKey)}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {PERMISSION_DEFS.filter(p => p.group === group).map(perm => {
                      const active = isAdminRole || permissions.includes(perm.key);
                      const editable = canEditPerms && !isAdminRole;
                      return (
                        <div key={perm.key}
                          onClick={() => editable && togglePerm(perm.key)}
                          style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '11px 14px', borderRadius: 10, border: `1px solid ${active ? 'var(--border-2)' : 'var(--border)'}`, background: active ? 'var(--surface-2)' : 'var(--surface)', cursor: editable ? 'pointer' : 'default', transition: 'all 0.12s', opacity: !active && !editable ? 0.5 : 1 }}
                          onMouseEnter={e => { if (editable) (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; }}
                          onMouseLeave={e => { if (editable) (e.currentTarget as HTMLElement).style.borderColor = active ? 'var(--border-2)' : 'var(--border)'; }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 13, fontWeight: 500 }}>{t(perm.labelKey)}</p>
                            <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{t(perm.descKey)}</p>
                          </div>
                          <div style={{ width: 36, height: 20, borderRadius: 10, background: active ? 'var(--accent)' : 'var(--surface-3)', border: `1px solid ${active ? 'var(--accent)' : 'var(--border-2)'}`, position: 'relative', transition: 'all 0.15s', flexShrink: 0 }}>
                            <div style={{ position: 'absolute', top: 2, left: active ? 18 : 2, width: 14, height: 14, borderRadius: '50%', background: active ? 'var(--on-accent)' : 'var(--text-3)', transition: 'left 0.15s' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {(isSelf || isAdmin) && (
          <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>
            <SFButton variant="ghost" onClick={onClose}>{t('profile.cancel')}</SFButton>
            <button
              onClick={handleSave}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '9px 20px', borderRadius: 10, border: 'none', background: saved ? 'var(--ok)' : 'var(--accent)', color: saved ? '#fff' : 'var(--on-accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--ff-text)', transition: 'background 0.2s' }}
            >
              <SFIcon name={saved ? 'check' : 'save'} size={14} color={saved ? '#fff' : 'var(--on-accent)'} />
              {saved ? t('profile.saved') : t('profile.save')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
