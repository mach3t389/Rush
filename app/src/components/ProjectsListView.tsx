import { useState, useEffect, useRef } from 'react';
import { SFButton, SFIcon, SFAvatar, DatePickerDropdown, formatDisplay } from './ui';
import { USERS } from '../data/mock';
import { loadAllTemplates, loadAllResourceTemplates } from '../data/templates';
import type { Project, Status, SectionData, Task } from '../types/index';
import { ProjectCard, PROJECT_STATUS_OPTIONS } from './ProjectCard';
import { getProjects, addProject, subscribeProjects } from '../data/projectStore';
import { getClients } from '../data/clientStore';
import { setSections } from '../data/taskStore';
import { addFolderTree } from '../data/fileStore';

// ── Constants ─────────────────────────────────────────────────────────────────

const PROJECT_COLORS = ['#3b4f8f', '#1a6b4a', '#7d4e57', '#5b3ea8', '#a85f3e', '#2a7a8a', '#7a6a2a', '#404040'];
const TEAM = Object.values(USERS).filter(u => u.role !== 'Cliente');
type Step = 'start' | 'info' | 'fichiers' | 'team';
type SortKey = 'recent' | 'alpha' | 'alpha-desc' | 'delivery' | 'client' | 'progress';

const ALL_SORT_OPTIONS: { value: SortKey; label: string; icon: string }[] = [
  { value: 'recent',     label: 'Récent',      icon: 'clock' },
  { value: 'alpha',      label: 'A → Z',       icon: 'arrow-down-a-z' },
  { value: 'alpha-desc', label: 'Z → A',       icon: 'arrow-up-a-z' },
  { value: 'delivery',   label: 'Livraison',   icon: 'calendar' },
  { value: 'client',     label: 'Client',      icon: 'users' },
  { value: 'progress',   label: 'Avancement',  icon: 'bar-chart-2' },
];

// ── Step indicator ────────────────────────────────────────────────────────────

function StepDot({ label, active, done }: { label: string; active: boolean; done: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{
        width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: done ? 'var(--ok)' : active ? 'var(--accent)' : 'var(--surface-3)',
        border: `1.5px solid ${done ? 'var(--ok)' : active ? 'var(--accent)' : 'var(--border-2)'}`,
      }}>
        {done
          ? <SFIcon name="check" size={12} color="#000" />
          : <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, fontWeight: 700, color: active ? 'var(--on-accent)' : 'var(--text-3)' }}>
              {label === 'Départ' ? '1' : label === 'Infos' ? '2' : label === 'Fichiers' ? '3' : '4'}
            </span>
        }
      </div>
      <span style={{ fontSize: 12, fontWeight: active ? 600 : 400, color: active ? 'var(--text)' : done ? 'var(--text-2)' : 'var(--text-3)' }}>{label}</span>
    </div>
  );
}

// ── New Project Modal ─────────────────────────────────────────────────────────

function NewProjectModal({ onClose, onCreate, defaultClientId }: {
  onClose: () => void;
  onCreate: (p: Project) => void;
  defaultClientId?: string;
}) {
  const [step, setStep]                 = useState<Step>('start');
  const [templateId, setTemplateId]     = useState<string | null>(null);
  const clients = getClients();
  const [name, setName]                 = useState('');
  const [clientId, setClientId]         = useState(defaultClientId ?? clients[0]?.id ?? '');
  const [color, setColor]               = useState(PROJECT_COLORS[0]);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [dateRect, setDateRect]         = useState<DOMRect | null>(null);
  const [dateOpen, setDateOpen]         = useState(false);
  const [memberIds, setMemberIds]       = useState<string[]>([TEAM[0].id]);
  const [folderStructTplId, setFolderStructTplId] = useState<string | null>(null);

  const templates = loadAllTemplates();
  const selectedTemplate = templates.find(t => t.id === templateId) ?? null;
  const folderStructTemplates = loadAllResourceTemplates().filter(t => t.type === 'file');

  const toggleMember = (id: string) =>
    setMemberIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  const canNext = step === 'start' ? true
    : step === 'info' ? name.trim().length > 0
    : step === 'fichiers' ? true
    : memberIds.length > 0;

  const next = () => {
    if (step === 'start') {
      setFolderStructTplId(selectedTemplate?.defaultFolderStructureId ?? null);
      setStep('info');
    } else if (step === 'info') {
      setStep('fichiers');
    } else if (step === 'fichiers') {
      setStep('team');
    } else {
      create();
    }
  };
  const back = () => {
    if (step === 'info') setStep('start');
    else if (step === 'fichiers') setStep('info');
    else if (step === 'team') setStep('fichiers');
  };

  const create = () => {
    const allClients = getClients();
    const client = allClients.find(c => c.id === clientId) ?? allClients[0];
    const members = TEAM.filter(u => memberIds.includes(u.id));
    const projectId = `pj${Date.now()}`;
    const newProject: Project = {
      id: projectId,
      name: name.trim(),
      clientId: client.id,
      clientName: client.name,
      clientColor: color,
      phase: 'preproduction',
      phaseLabel: 'Préproduction',
      progress: 0,
      taskCount: selectedTemplate ? selectedTemplate.sections.reduce((n, s) => n + s.tasks.length, 0) : 0,
      deliverableCount: 0,
      members,
      deliveryDate: deliveryDate ? formatDisplay(deliveryDate) : '—',
      status: 'info',
      statusLabel: 'En cours',
      modifiedAt: "À l'instant",
      folderStructureTemplateId: folderStructTplId ?? undefined,
    };
    if (selectedTemplate) {
      const sections: SectionData[] = selectedTemplate.sections.map(sec => ({
        label: sec.label,
        progress: 0,
        tasks: sec.tasks.map((tt, i): Task => ({
          id: `${projectId}-${sec.label}-${i}`,
          title: tt.title,
          projectId,
          projectName: newProject.name,
          projectColor: color,
          assignee: members[0] ?? USERS.lea,
          status: 'warn',
          statusLabel: 'En attente',
          priority: tt.priority ?? 'normal',
          priorityLabel: tt.priority === 'high' ? 'Élevée' : tt.priority === 'low' ? 'Basse' : 'Normale',
          dueDate: '',
          checked: false,
          subtasks: [],
        })),
      }));
      setSections(projectId, sections);
    }
    if (folderStructTplId) {
      const fileTpl = loadAllResourceTemplates().find(t => t.id === folderStructTplId);
      if (fileTpl?.folderStructure?.length) {
        addFolderTree(fileTpl.folderStructure, { projectId });
      }
    }
    onCreate(newProject);
    onClose();
  };

  const STEP_ORDER: Step[] = ['start', 'info', 'fichiers', 'team'];
  const stepDone = (s: Step) => STEP_ORDER.indexOf(step) > STEP_ORDER.indexOf(s);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--surface)', borderRadius: 18, border: '1px solid var(--border)', boxShadow: '0 24px 72px rgba(0,0,0,0.6)', width: 820, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 28px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 700 }}>Nouveau projet</h2>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              {step === 'start' ? 'Choisissez un point de départ' : step === 'info' ? 'Informations du projet' : step === 'fichiers' ? 'Structure de dossiers' : 'Assigner une équipe'}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <StepDot label="Départ" active={step === 'start'} done={stepDone('start')} />
            <div style={{ width: 16, height: 1, background: 'var(--border-2)' }} />
            <StepDot label="Infos" active={step === 'info'} done={stepDone('info')} />
            <div style={{ width: 16, height: 1, background: 'var(--border-2)' }} />
            <StepDot label="Fichiers" active={step === 'fichiers'} done={stepDone('fichiers')} />
            <div style={{ width: 16, height: 1, background: 'var(--border-2)' }} />
            <StepDot label="Équipe" active={step === 'team'} done={stepDone('team')} />
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', padding: 4 }}>
            <SFIcon name="x" size={17} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>

          {/* Step 1: Starting point */}
          {step === 'start' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <div>
                <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Canevas vide</p>
                <div
                  onClick={() => setTemplateId(null)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '14px 18px', borderRadius: 12,
                    border: `2px solid ${templateId === null ? 'var(--accent)' : 'var(--border)'}`,
                    background: templateId === null ? 'rgba(249,255,0,0.04)' : 'var(--surface-2)',
                    cursor: 'pointer', transition: 'border-color 0.15s',
                  }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <SFIcon name="plus" size={20} color="var(--text-3)" />
                  </div>
                  <div>
                    <p style={{ fontWeight: 600, fontSize: 13 }}>Projet vide</p>
                    <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>Commencez avec une ardoise blanche et ajoutez vos propres sections et tâches.</p>
                  </div>
                  {templateId === null && <SFIcon name="circle-check" size={18} color="var(--accent)" style={{ marginLeft: 'auto' }} />}
                </div>
              </div>

              <div>
                <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Partir d'un modèle</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                  {templates.map(t => {
                    const isSelected = templateId === t.id;
                    return (
                      <div
                        key={t.id}
                        onClick={() => setTemplateId(t.id)}
                        style={{
                          padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                          border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                          background: isSelected ? 'rgba(249,255,0,0.04)' : 'var(--surface-2)',
                          transition: 'border-color 0.15s', position: 'relative',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                          <div style={{ width: 36, height: 36, borderRadius: 9, background: t.color + '33', border: `1.5px solid ${t.color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <SFIcon name={t.icon} size={17} color={t.color} />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                              <p style={{ fontWeight: 600, fontSize: 13 }}>{t.name}</p>
                              {t.builtIn && (
                                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 8, background: 'var(--surface-3)', color: 'var(--text-3)', borderRadius: 4, padding: '1px 5px', letterSpacing: '0.06em' }}>OFFICIEL</span>
                              )}
                            </div>
                            <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{t.description}</p>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                              {t.tags.slice(0, 3).map(tag => (
                                <span key={tag} style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', background: 'var(--surface-3)', color: 'var(--text-3)', padding: '2px 6px', borderRadius: 4 }}>{tag}</span>
                              ))}
                            </div>
                            <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 6 }}>
                              {t.sections.length} sections · {t.sections.reduce((n, s) => n + s.tasks.length, 0)} tâches
                            </p>
                          </div>
                        </div>
                        {isSelected && (
                          <div style={{ position: 'absolute', top: 10, right: 10 }}>
                            <SFIcon name="circle-check" size={16} color="var(--accent)" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Project info */}
          {step === 'info' && (
            <div style={{ maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 18 }}>
              <div>
                <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>Nom du projet *</label>
                <input
                  autoFocus
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ex: Campagne Automne 2026…"
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 14, fontWeight: 600, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--ff-text)' }}
                />
              </div>

              <div>
                <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>Client</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {clients.map(c => (
                    <button
                      key={c.id}
                      onClick={() => setClientId(c.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '8px 12px', borderRadius: 9, cursor: 'pointer',
                        border: `1.5px solid ${clientId === c.id ? 'var(--accent)' : 'var(--border)'}`,
                        background: clientId === c.id ? 'rgba(249,255,0,0.05)' : 'var(--surface-2)',
                      }}
                    >
                      <div style={{ width: 24, height: 24, borderRadius: '50%', background: c.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: '#fff' }}>{c.initials}</span>
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 500, color: clientId === c.id ? 'var(--text)' : 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 8 }}>Couleur du projet</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {PROJECT_COLORS.map(c => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      style={{
                        width: 32, height: 32, borderRadius: '50%', background: c,
                        border: color === c ? '3px solid white' : '3px solid transparent',
                        outline: color === c ? `2px solid ${c}` : 'none',
                        cursor: 'pointer',
                      }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>Date de livraison</label>
                <button
                  onClick={e => { setDateOpen(o => !o); setDateRect((e.currentTarget as HTMLElement).getBoundingClientRect()); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 14px', borderRadius: 9, border: '1px solid var(--border)',
                    background: 'var(--surface-2)', cursor: 'pointer',
                    fontFamily: 'var(--ff-mono)', fontSize: 12,
                    color: deliveryDate ? 'var(--text)' : 'var(--text-3)',
                  }}
                >
                  <SFIcon name="calendar" size={13} color="var(--text-3)" />
                  {deliveryDate ? formatDisplay(deliveryDate) : 'Choisir une date…'}
                </button>
                {dateOpen && (
                  <DatePickerDropdown
                    value={deliveryDate}
                    onChange={v => { setDeliveryDate(v); setDateOpen(false); }}
                    onClose={() => setDateOpen(false)}
                    anchorRect={dateRect}
                    zIndex={410}
                  />
                )}
              </div>

              {selectedTemplate && (
                <div style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 7, background: selectedTemplate.color + '33', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <SFIcon name={selectedTemplate.icon} size={14} color={selectedTemplate.color} />
                  </div>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 600 }}>Modèle : {selectedTemplate.name}</p>
                    <p style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>
                      {selectedTemplate.sections.length} sections · {selectedTemplate.sections.reduce((n, s) => n + s.tasks.length, 0)} tâches pré-configurées
                    </p>
                  </div>
                  <button onClick={() => { setTemplateId(null); setStep('start'); }} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4 }}>
                    <SFIcon name="x" size={13} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Step 3: Folder structure */}
          {step === 'fichiers' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <p style={{ fontSize: 13, color: 'var(--text-2)' }}>
                Choisissez une structure de dossiers pour organiser les fichiers du projet. Vous pouvez l'ignorer ou la personnaliser ensuite.
              </p>

              <div
                onClick={() => setFolderStructTplId(null)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 18px', borderRadius: 12, cursor: 'pointer',
                  border: `2px solid ${folderStructTplId === null ? 'var(--accent)' : 'var(--border)'}`,
                  background: folderStructTplId === null ? 'rgba(249,255,0,0.04)' : 'var(--surface-2)',
                  transition: 'border-color 0.15s',
                }}
              >
                <div style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <SFIcon name="folder-open" size={18} color="var(--text-3)" />
                </div>
                <div>
                  <p style={{ fontWeight: 600, fontSize: 13 }}>Aucune structure</p>
                  <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>Créez vos dossiers manuellement dans l'onglet Fichiers du projet.</p>
                </div>
                {folderStructTplId === null && <SFIcon name="circle-check" size={18} color="var(--accent)" style={{ marginLeft: 'auto' }} />}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                {folderStructTemplates.map(t => {
                  const isSelected = folderStructTplId === t.id;
                  const folders = t.folderStructure ?? [];
                  return (
                    <div
                      key={t.id}
                      onClick={() => setFolderStructTplId(t.id)}
                      style={{
                        padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                        border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                        background: isSelected ? 'rgba(249,255,0,0.04)' : 'var(--surface-2)',
                        transition: 'border-color 0.15s', position: 'relative',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 9, background: t.color + '33', border: `1.5px solid ${t.color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <SFIcon name={t.icon} size={17} color={t.color} />
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <p style={{ fontWeight: 600, fontSize: 13 }}>{t.name}</p>
                            {t.builtIn && <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 8, background: 'var(--surface-3)', color: 'var(--text-3)', borderRadius: 4, padding: '1px 5px', letterSpacing: '0.06em' }}>OFFICIEL</span>}
                          </div>
                          <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.4, marginBottom: 8 }}>{t.description}</p>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {folders.slice(0, 4).map(f => (
                              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <SFIcon name="folder" size={10} color={t.color} />
                                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)' }}>{f.name}</span>
                                {f.children && f.children.length > 0 && (
                                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 8, color: 'var(--text-3)', opacity: 0.6 }}>({f.children.length})</span>
                                )}
                              </div>
                            ))}
                            {folders.length > 4 && (
                              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', opacity: 0.6, paddingLeft: 15 }}>+{folders.length - 4} dossiers…</span>
                            )}
                          </div>
                        </div>
                        {isSelected && (
                          <div style={{ flexShrink: 0 }}>
                            <SFIcon name="circle-check" size={16} color="var(--accent)" />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 4: Team */}
          {step === 'team' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ fontSize: 13, color: 'var(--text-2)' }}>Sélectionnez les membres qui participeront à ce projet.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {TEAM.map(u => {
                  const on = memberIds.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      onClick={() => toggleMember(u.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '12px 14px', borderRadius: 11, cursor: 'pointer',
                        border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                        background: on ? 'rgba(249,255,0,0.05)' : 'var(--surface-2)',
                        transition: 'border-color 0.12s',
                      }}
                    >
                      <SFAvatar initials={u.initials} bg={u.avatarColor} size={34} />
                      <div style={{ textAlign: 'left', minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</p>
                        <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>{u.role}</p>
                      </div>
                      <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
                        <div style={{
                          width: 18, height: 18, borderRadius: '50%',
                          background: on ? 'var(--accent)' : 'var(--surface-3)',
                          border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border-2)'}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {on && <SFIcon name="check" size={10} color="var(--on-accent)" />}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>
                {memberIds.length} membre{memberIds.length > 1 ? 's' : ''} sélectionné{memberIds.length > 1 ? 's' : ''}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 28px', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
          <button
            onClick={step === 'start' ? onClose : back}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 9, padding: '8px 18px', cursor: 'pointer', fontSize: 13, color: 'var(--text-2)', fontFamily: 'var(--ff-text)' }}
          >
            {step === 'start' ? 'Annuler' : '← Retour'}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {name && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 7, background: 'var(--surface-2)', marginRight: 8 }}>
                <i style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, display: 'block' }} />
                <span style={{ fontSize: 11, fontFamily: 'var(--ff-mono)', color: 'var(--text-2)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
              </div>
            )}
            <SFButton variant="primary" onClick={next} disabled={!canNext}>
              {step === 'team' ? '✓ Créer le projet' : 'Continuer →'}
            </SFButton>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Shared project list view ──────────────────────────────────────────────────

export function ProjectsListView({ clientId }: { clientId?: string }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | Status>('all');
  const [sortBy, setSortBy] = useState<SortKey>('recent');
  const [sortOpen, setSortOpen] = useState(false);
  const sortBtnRef = useRef<HTMLButtonElement>(null);
  const [allProjects, setAllProjects] = useState(getProjects);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => subscribeProjects(() => setAllProjects(getProjects())), []);

  const projects = clientId ? allProjects.filter(p => p.clientId === clientId) : allProjects;

  const SORT_OPTIONS = clientId
    ? ALL_SORT_OPTIONS.filter(o => o.value !== 'client')
    : ALL_SORT_OPTIONS;

  const filtered = projects
    .filter(p => {
      if (search) {
        const q = search.toLowerCase();
        const match = p.name.toLowerCase().includes(q) || (!clientId && p.clientName.toLowerCase().includes(q));
        if (!match) return false;
      }
      if (filter !== 'all') return p.status === filter;
      return true;
    })
    .slice()
    .sort((a, b) => {
      if (sortBy === 'alpha')      return a.name.localeCompare(b.name);
      if (sortBy === 'alpha-desc') return b.name.localeCompare(a.name);
      if (sortBy === 'client')     return a.clientName.localeCompare(b.clientName);
      if (sortBy === 'delivery')   return (a.deliveryDate ?? '').localeCompare(b.deliveryDate ?? '');
      if (sortBy === 'progress')   return b.progress - a.progress;
      return (b.modifiedAt ?? '').localeCompare(a.modifiedAt ?? '');
    });

  return (
    <>
      {/* Title row — visible only in global context */}
      {!clientId && (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, fontSize: 22 }}>Projets</h1>
            <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>
              {projects.length} projets · {projects.filter(p => p.status !== 'ok' && p.status !== 'neutral').length} actifs · {projects.filter(p => p.status === 'danger').length} en retard
            </p>
          </div>
          <SFButton variant="primary" icon="plus" onClick={() => setShowModal(true)}>Nouveau projet</SFButton>
        </div>
      )}

      {/* Controls row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 320, height: 36 }}>
          <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <SFIcon name="search" size={14} color="var(--text-3)" />
          </div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un projet..."
            style={{ width: '100%', height: '100%', padding: '8px 12px 8px 32px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {([['all', 'Tous'], ...PROJECT_STATUS_OPTIONS.map(o => [o.status, o.label])] as [string, string][]).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilter(val as 'all' | Status)}
              style={{ padding: '6px 12px', borderRadius: 9, border: 'none', background: filter === val ? 'var(--surface-3)' : 'transparent', color: filter === val ? 'var(--text)' : 'var(--text-2)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Sort dropdown */}
        <div style={{ marginLeft: 'auto', position: 'relative', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            ref={sortBtnRef}
            onClick={() => setSortOpen(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 11px', borderRadius: 9,
              border: `1px solid ${sortBy !== 'recent' ? 'var(--accent)' : 'var(--border)'}`,
              background: sortBy !== 'recent' ? 'rgba(249,255,0,0.07)' : 'var(--surface-2)',
              color: sortBy !== 'recent' ? 'var(--accent)' : 'var(--text-2)',
              fontSize: 12, fontWeight: 500, cursor: 'pointer',
            }}
          >
            <SFIcon name={SORT_OPTIONS.find(o => o.value === sortBy)?.icon ?? 'arrow-up-down'} size={13} />
            <span>{SORT_OPTIONS.find(o => o.value === sortBy)?.label}</span>
            <SFIcon name={sortOpen ? 'chevron-up' : 'chevron-down'} size={12} />
          </button>

          {sortOpen && (() => {
            const rect = sortBtnRef.current?.getBoundingClientRect();
            return (
              <>
                <div onClick={() => setSortOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 290 }} />
                <div style={{
                  position: 'fixed',
                  top: rect ? rect.bottom + 6 : 100,
                  right: rect ? window.innerWidth - rect.right : 24,
                  zIndex: 300,
                  background: 'var(--surface)',
                  border: '1px solid var(--border-2)',
                  borderRadius: 12,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                  minWidth: 190,
                  padding: 5,
                }}>
                  <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '6px 10px 4px' }}>Trier par</p>
                  {SORT_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => { setSortBy(opt.value); setSortOpen(false); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 9,
                        width: '100%', padding: '8px 10px', borderRadius: 8,
                        border: 'none', textAlign: 'left', cursor: 'pointer',
                        background: sortBy === opt.value ? 'var(--surface-3)' : 'transparent',
                        color: sortBy === opt.value ? 'var(--text)' : 'var(--text-2)',
                        fontSize: 12, fontWeight: sortBy === opt.value ? 600 : 400,
                      }}
                      onMouseEnter={e => { if (sortBy !== opt.value) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
                      onMouseLeave={e => { if (sortBy !== opt.value) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      <SFIcon name={opt.icon} size={13} color={sortBy === opt.value ? 'var(--accent)' : 'var(--text-3)'} />
                      {opt.label}
                      {sortBy === opt.value && <SFIcon name="check" size={12} color="var(--accent)" style={{ marginLeft: 'auto' }} />}
                    </button>
                  ))}
                </div>
              </>
            );
          })()}

          {/* New project button — in client context, sits in the controls row */}
          {clientId && (
            <SFButton variant="primary" icon="plus" onClick={() => setShowModal(true)}>Nouveau projet</SFButton>
          )}
        </div>
      </div>

      {/* Project grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {filtered.map(p => (
          <ProjectCard key={p.id} p={p} />
        ))}

        {filtered.length === 0 && (
          <div style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '60px 0', color: 'var(--text-3)' }}>
            <SFIcon name="folder-open" size={36} color="var(--text-3)" />
            <p style={{ fontSize: 14 }}>Aucun projet trouvé</p>
            <SFButton variant="ghost" icon="plus" onClick={() => setShowModal(true)}>Nouveau projet</SFButton>
          </div>
        )}
      </div>

      {showModal && (
        <NewProjectModal
          onClose={() => setShowModal(false)}
          onCreate={p => addProject(p)}
          defaultClientId={clientId}
        />
      )}
    </>
  );
}
