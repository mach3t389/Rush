import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFButton, SFIcon, SFAvatar, SFPill, SFBar, DatePickerDropdown, formatDisplay, SFLoadingState } from './ui';
import { USERS } from '../data/mock';
import { loadAllTemplates, loadAllResourceTemplates, type ProjectTemplate } from '../data/templates';
import type { Project, Status, Phase, SectionData, Task, User } from '../types/index';
import { ProjectCard, ProjectEditPanel, PROJECT_STATUS_OPTIONS } from './ProjectCard';
import { getProjects, addProject, updateProject, subscribeProjects, isProjectsLoading } from '../data/projectStore';
import { getClients } from '../data/clientStore';
import { setSections } from '../data/taskStore';
import { addFolderTree } from '../data/fileStore';
import { isPinned, togglePin, subscribePinned } from '../data/pinnedStore';
import { loadPersisted, savePersisted } from '../data/persist';
import { isDemoSession, getCurrentUser } from '../data/authStore';
import { getTeamMembers } from '../data/teamStore';

// ── Constants ─────────────────────────────────────────────────────────────────

const PROJECT_COLORS = ['#3b4f8f', '#1a6b4a', '#7d4e57', '#5b3ea8', '#a85f3e', '#2a7a8a', '#7a6a2a', '#404040'];
const TEAM = Object.values(USERS).filter(u => u.role !== 'Cliente');

// Demo sessions pick from the 5 mock people; real sessions must show the
// studio's actual invited team, not the mock roster.
function getTeam(): User[] {
  if (isDemoSession()) return TEAM;
  const team = getTeamMembers();
  return team.length > 0 ? team : TEAM;
}
type Step = 'start' | 'info' | 'fichiers' | 'team';
type SortKey = 'recent' | 'alpha' | 'alpha-desc' | 'delivery' | 'client' | 'progress';

const ALL_SORT_OPTIONS: { value: SortKey; labelKey: string; icon: string }[] = [
  { value: 'recent',     labelKey: 'projects.sortRecent',    icon: 'clock' },
  { value: 'alpha',      labelKey: 'projects.sortAlphaAsc',  icon: 'arrow-down-a-z' },
  { value: 'alpha-desc', labelKey: 'projects.sortAlphaDesc', icon: 'arrow-up-a-z' },
  { value: 'delivery',   labelKey: 'projects.sortDelivery',  icon: 'calendar' },
  { value: 'client',     labelKey: 'projects.sortClient',    icon: 'users' },
  { value: 'progress',   labelKey: 'projects.sortProgress',  icon: 'bar-chart-2' },
];

// ── Step indicator ────────────────────────────────────────────────────────────

function StepDot({ label, num, active, done }: { label: string; num: number; active: boolean; done: boolean }) {
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
              {num}
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
  const { t } = useTranslation();
  const [step, setStep]                 = useState<Step>('start');
  const [templateId, setTemplateId]     = useState<string | null>(null);
  const clients = getClients().filter(c => !c.archived);
  const [name, setName]                 = useState('');
  const [clientId, setClientId]         = useState(defaultClientId ?? clients[0]?.id ?? '');
  const [color, setColor]               = useState(PROJECT_COLORS[0]);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [dateRect, setDateRect]         = useState<DOMRect | null>(null);
  const [dateOpen, setDateOpen]         = useState(false);
  const team = getTeam();
  const authUser = getCurrentUser();
  const defaultMemberId = (!isDemoSession() && authUser && team.some(u => u.id === authUser.id)) ? authUser.id : team[0]?.id;
  const [memberIds, setMemberIds]       = useState<string[]>(defaultMemberId ? [defaultMemberId] : []);
  const [folderStructTplId, setFolderStructTplId] = useState<string | null>(null);

  // Sélection restreinte de modèles pour ce wizard de démarrage rapide — le reste
  // reste disponible dans la bibliothèque complète (Modèles). Ordre volontaire :
  // "Projet vierge" en premier, puis 3 modèles pré-remplis représentatifs.
  const QUICK_START_TEMPLATE_ORDER = ['tpl-vierge', 'tpl-shoot-photo', 'tpl-motion-design', 'tpl-film-institutionnel'];
  const allTemplates = loadAllTemplates();
  const templates = QUICK_START_TEMPLATE_ORDER
    .map(id => allTemplates.find(t => t.id === id))
    .filter((t): t is ProjectTemplate => !!t);
  const selectedTemplate = templates.find(t => t.id === templateId) ?? null;
  const folderStructTemplates = loadAllResourceTemplates().filter(t => t.type === 'file');

  // The creator is always a member of their own project — can't deselect yourself.
  const toggleMember = (id: string) => {
    if (id === defaultMemberId) return;
    setMemberIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const canNext = step === 'start' ? true
    : step === 'info' ? name.trim().length > 0
    : true; // 'fichiers' et 'team' : aucune sélection obligatoire — un projet peut n'avoir aucun membre assigné

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
    const members = team.filter(u => memberIds.includes(u.id));
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
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--surface)', borderRadius: 18, border: '1px solid var(--border)', boxShadow: '0 24px 72px rgba(0,0,0,0.6)', width: 820, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 28px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 700 }}>{t('projects.newProject')}</h2>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              {step === 'start' ? t('projects.stepStartSubtitle') : step === 'info' ? t('projects.stepInfoSubtitle') : step === 'fichiers' ? t('projects.stepFilesSubtitle') : t('projects.stepTeamSubtitle')}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <StepDot label={t('projects.stepStart')} num={1} active={step === 'start'} done={stepDone('start')} />
            <div style={{ width: 16, height: 1, background: 'var(--border-2)' }} />
            <StepDot label={t('projects.stepInfo')} num={2} active={step === 'info'} done={stepDone('info')} />
            <div style={{ width: 16, height: 1, background: 'var(--border-2)' }} />
            <StepDot label={t('projects.stepFiles')} num={3} active={step === 'fichiers'} done={stepDone('fichiers')} />
            <div style={{ width: 16, height: 1, background: 'var(--border-2)' }} />
            <StepDot label={t('projects.stepTeam')} num={4} active={step === 'team'} done={stepDone('team')} />
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
                <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>{t('projects.blankCanvas')}</p>
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
                    <p style={{ fontWeight: 600, fontSize: 13 }}>{t('projects.emptyProject')}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{t('projects.emptyProjectDesc')}</p>
                  </div>
                  {templateId === null && <SFIcon name="circle-check" size={18} color="var(--accent)" style={{ marginLeft: 'auto' }} />}
                </div>
              </div>

              <div>
                <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>{t('projects.startFromTemplate')}</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                  {templates.map(tpl => {
                    const isSelected = templateId === tpl.id;
                    return (
                      <div
                        key={tpl.id}
                        onClick={() => setTemplateId(tpl.id)}
                        style={{
                          padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                          border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                          background: isSelected ? 'rgba(249,255,0,0.04)' : 'var(--surface-2)',
                          transition: 'border-color 0.15s', position: 'relative',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                          <div style={{ width: 36, height: 36, borderRadius: 9, background: tpl.color + '33', border: `1.5px solid ${tpl.color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <SFIcon name={tpl.icon} size={17} color={tpl.color} />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                              <p style={{ fontWeight: 600, fontSize: 13 }}>{tpl.name}</p>
                              {tpl.builtIn && (
                                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 8, background: 'var(--surface-3)', color: 'var(--text-3)', borderRadius: 4, padding: '1px 5px', letterSpacing: '0.06em' }}>{t('projects.official')}</span>
                              )}
                            </div>
                            <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{tpl.description}</p>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                              {tpl.tags.slice(0, 3).map(tag => (
                                <span key={tag} style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', background: 'var(--surface-3)', color: 'var(--text-3)', padding: '2px 6px', borderRadius: 4 }}>{tag}</span>
                              ))}
                            </div>
                            <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 6 }}>
                              {t('projects.sectionsTasksCount', { sections: tpl.sections.length, tasks: tpl.sections.reduce((n, s) => n + s.tasks.length, 0) })}
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
                <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>{t('projects.projectNameLabel')} {t('common.required')}</label>
                <input
                  autoFocus
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder={t('projects.projectNamePlaceholder')}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 14, fontWeight: 600, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--ff-text)' }}
                />
              </div>

              <div>
                <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>{t('projects.client')}</label>
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
                <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 8 }}>{t('projects.projectColor')}</label>
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
                <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>{t('projects.deliveryDate')} <span style={{ fontWeight: 400, opacity: 0.6 }}>{t('projects.optional')}</span></label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
                    {deliveryDate ? formatDisplay(deliveryDate) : t('projects.chooseDate')}
                  </button>
                  {deliveryDate && (
                    <button
                      onClick={() => setDeliveryDate('')}
                      title={t('projects.removeDate')}
                      style={{ width: 26, height: 26, borderRadius: 7, border: 'none', background: 'var(--surface-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', flexShrink: 0 }}
                    >
                      <SFIcon name="x" size={12} />
                    </button>
                  )}
                </div>
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
                    <p style={{ fontSize: 11, fontWeight: 600 }}>{t('projects.templateLabel', { name: selectedTemplate.name })}</p>
                    <p style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>
                      {t('projects.sectionsTasksPreconfigured', { sections: selectedTemplate.sections.length, tasks: selectedTemplate.sections.reduce((n, s) => n + s.tasks.length, 0) })}
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
                {t('projects.folderStructureIntro')}
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
                  <p style={{ fontWeight: 600, fontSize: 13 }}>{t('projects.noStructure')}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{t('projects.noStructureDesc')}</p>
                </div>
                {folderStructTplId === null && <SFIcon name="circle-check" size={18} color="var(--accent)" style={{ marginLeft: 'auto' }} />}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                {folderStructTemplates.map(tpl => {
                  const isSelected = folderStructTplId === tpl.id;
                  const folders = tpl.folderStructure ?? [];
                  return (
                    <div
                      key={tpl.id}
                      onClick={() => setFolderStructTplId(tpl.id)}
                      style={{
                        padding: '14px 16px', borderRadius: 12, cursor: 'pointer',
                        border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                        background: isSelected ? 'rgba(249,255,0,0.04)' : 'var(--surface-2)',
                        transition: 'border-color 0.15s', position: 'relative',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 9, background: tpl.color + '33', border: `1.5px solid ${tpl.color}55`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <SFIcon name={tpl.icon} size={17} color={tpl.color} />
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <p style={{ fontWeight: 600, fontSize: 13 }}>{tpl.name}</p>
                            {tpl.builtIn && <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 8, background: 'var(--surface-3)', color: 'var(--text-3)', borderRadius: 4, padding: '1px 5px', letterSpacing: '0.06em' }}>{t('projects.official')}</span>}
                          </div>
                          <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.4, marginBottom: 8 }}>{tpl.description}</p>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {folders.slice(0, 4).map(f => (
                              <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <SFIcon name="folder" size={10} color={tpl.color} />
                                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)' }}>{f.name}</span>
                                {f.children && f.children.length > 0 && (
                                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 8, color: 'var(--text-3)', opacity: 0.6 }}>({f.children.length})</span>
                                )}
                              </div>
                            ))}
                            {folders.length > 4 && (
                              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', opacity: 0.6, paddingLeft: 15 }}>{t('projects.moreFolders', { count: folders.length - 4 })}</span>
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
              <p style={{ fontSize: 13, color: 'var(--text-2)' }}>{t('projects.selectMembers')}</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {team.map(u => {
                  const on = memberIds.includes(u.id);
                  const isYou = u.id === defaultMemberId;
                  return (
                    <button
                      key={u.id}
                      onClick={() => toggleMember(u.id)}
                      title={isYou ? t('projects.youAlwaysIncluded') : undefined}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '12px 14px', borderRadius: 11, cursor: isYou ? 'default' : 'pointer',
                        border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                        background: on ? 'rgba(249,255,0,0.05)' : 'var(--surface-2)',
                        transition: 'border-color 0.12s',
                      }}
                    >
                      <SFAvatar initials={u.initials} bg={u.avatarColor} size={34} />
                      <div style={{ textAlign: 'left', minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}{isYou ? ` (${t('projects.you')})` : ''}</p>
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
                {t('projects.membersSelected', { count: memberIds.length })}
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
            {step === 'start' ? t('projects.cancel') : t('projects.back')}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {name && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 7, background: 'var(--surface-2)', marginRight: 8 }}>
                <i style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, display: 'block' }} />
                <span style={{ fontSize: 11, fontFamily: 'var(--ff-mono)', color: 'var(--text-2)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
              </div>
            )}
            <SFButton variant="primary" onClick={next} disabled={!canNext}>
              {step === 'team' ? t('projects.createProject') : t('projects.continue')}
            </SFButton>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Detailed list (row) view ──────────────────────────────────────────────────

const PROJ_LIST_COLS = 'minmax(200px, 2.2fr) 1fr 1.4fr minmax(120px, 1fr) 108px 68px';

function ProjColHead({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
      {children}
    </span>
  );
}

function ProjectListRow({ p }: { p: Project }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [pinned, setPinnedState] = useState(() => isPinned(p.id));
  const [editOpen, setEditOpen] = useState(false);
  const [name, setName] = useState(p.name);
  const [color, setColor] = useState(p.clientColor);
  const [status, setStatus] = useState<Status>(p.status);
  const [statusLabel, setStatusLabel] = useState(p.statusLabel);
  const [phase, setPhase] = useState<Phase>(p.phase);
  const [phaseLabel, setPhaseLabel] = useState(p.phaseLabel);
  const [deliveryDate, setDeliveryDate] = useState(p.deliveryDate);

  useEffect(() => subscribePinned(() => setPinnedState(isPinned(p.id))), [p.id]);

  const handleSave = (u: { name: string; color: string; status: Status; statusLabel: string; phase: Phase; phaseLabel: string; deliveryDate: string; budget?: number; description?: string }) => {
    setName(u.name); setColor(u.color);
    setStatus(u.status); setStatusLabel(u.statusLabel);
    setPhase(u.phase); setPhaseLabel(u.phaseLabel);
    setDeliveryDate(u.deliveryDate);
    updateProject(p.id, {
      name: u.name, status: u.status, statusLabel: u.statusLabel,
      phase: u.phase, phaseLabel: u.phaseLabel, deliveryDate: u.deliveryDate,
      budget: u.budget, description: u.description,
    });
  };

  return (
    <div
      onClick={() => navigate(`/projets/${p.id}`)}
      style={{ display: 'grid', gridTemplateColumns: PROJ_LIST_COLS, gap: 16, alignItems: 'center', padding: '12px 18px', borderTop: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.12s' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      {/* Projet */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <p style={{ fontWeight: 600, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</p>
          <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.03em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>{p.clientName}</p>
        </div>
      </div>

      {/* Phase */}
      <div>
        <SFPill status="neutral" small>{phaseLabel}</SFPill>
      </div>

      {/* Progression */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}><SFBar value={p.progress} height={4} /></div>
        <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10.5, color: 'var(--text-2)', flexShrink: 0, width: 30, textAlign: 'right' }}>{p.progress}%</span>
      </div>

      {/* Statut */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <SFPill status={status} small>{statusLabel}</SFPill>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }} onClick={e => e.stopPropagation()}>
        <button
          onClick={() => togglePin(p.id)}
          title={pinned ? t('projects.unpin') : t('projects.pinToSidebar')}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, border: 'none', flexShrink: 0, background: pinned ? 'rgba(249,255,0,0.12)' : 'var(--surface-2)', color: pinned ? 'var(--accent)' : 'var(--text-2)', cursor: 'pointer', transition: 'background 0.15s, color 0.15s' }}
          onMouseEnter={e => { if (!pinned) { (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; } }}
          onMouseLeave={e => { if (!pinned) { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; } }}
        >
          <SFIcon name="star" size={14} fill={pinned ? 'currentColor' : 'none'} />
        </button>
        <button
          onClick={() => setEditOpen(true)}
          title={t('projects.editProject')}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border-2)', flexShrink: 0, background: 'var(--surface-3)', color: 'var(--text)', cursor: 'pointer', transition: 'background 0.15s, border-color 0.15s' }}
          onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'var(--accent)'; el.style.color = 'var(--on-accent)'; el.style.borderColor = 'transparent'; }}
          onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'var(--surface-3)'; el.style.color = 'var(--text)'; el.style.borderColor = 'var(--border-2)'; }}
        >
          <SFIcon name="square-pen" size={13} />
        </button>
      </div>

      {editOpen && (
        <ProjectEditPanel
          p={p} color={color} name={name} status={status} statusLabel={statusLabel}
          phase={phase} phaseLabel={phaseLabel} deliveryDate={deliveryDate}
          onClose={() => setEditOpen(false)} onSave={handleSave}
        />
      )}
    </div>
  );
}

function ProjectListView({ projects }: { projects: Project[] }) {
  const { t } = useTranslation();
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflowX: 'auto', overflowY: 'hidden', background: 'var(--surface)' }}>
      <div style={{ minWidth: 780 }}>
        <div style={{ display: 'grid', gridTemplateColumns: PROJ_LIST_COLS, gap: 16, alignItems: 'center', padding: '11px 18px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
          <ProjColHead>{t('projects.colProject')}</ProjColHead>
          <ProjColHead>{t('projects.colPhase')}</ProjColHead>
          <ProjColHead>{t('projects.colProgress')}</ProjColHead>
          <ProjColHead>{t('projects.colStatus')}</ProjColHead>
          <div />
        </div>
        {projects.map(p => <ProjectListRow key={p.id} p={p} />)}
      </div>
    </div>
  );
}

// ── Shared project list view ──────────────────────────────────────────────────

const VIEW_KEY = 'sf_projects_view';

export function ProjectsListView({ clientId, autoOpen, onModalClose }: { clientId?: string; autoOpen?: boolean; onModalClose?: () => void }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | Status | 'archived'>('all');
  const [clientFilter, setClientFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>('recent');
  const [sortOpen, setSortOpen] = useState(false);
  const sortBtnRef = useRef<HTMLButtonElement>(null);
  const [allProjects, setAllProjects] = useState(getProjects);
  const [showModal, setShowModal] = useState(false);
  const [clientFilterOpen, setClientFilterOpen] = useState(false);
  const clientFilterRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<'grid' | 'list'>(() => loadPersisted<'grid' | 'list'>(VIEW_KEY, 'grid'));
  const changeView = (v: 'grid' | 'list') => { setView(v); savePersisted(VIEW_KEY, v); };

  useEffect(() => subscribeProjects(() => setAllProjects(getProjects())), []);

  useEffect(() => {
    if (autoOpen) { setShowModal(true); onModalClose?.(); }
  }, [autoOpen]);

  const projects = clientId
    ? allProjects.filter(p => p.clientId === clientId)
    : clientFilter
      ? allProjects.filter(p => p.clientId === clientFilter)
      : allProjects;

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
      if (filter === 'archived') return !!p.archived;
      if (p.archived) return false;
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
            <h1 style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, fontSize: 22 }}>{t('projects.title')}</h1>
            <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>
              {t('projects.countsSummary', { total: projects.length, active: projects.filter(p => p.status !== 'ok' && p.status !== 'neutral').length, late: projects.filter(p => p.status === 'danger').length })}
            </p>
          </div>
          <SFButton variant="primary" icon="plus" onClick={() => setShowModal(true)}>{t('projects.newProject')}</SFButton>
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
            placeholder={t('projects.searchPlaceholder')}
            style={{ width: '100%', height: '100%', padding: '8px 12px 8px 32px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {([['all', t('projects.filterAll')], ...PROJECT_STATUS_OPTIONS.map(o => [o.status, t(o.labelKey)]), ['archived', t('projects.filterArchived')]] as [string, string][]).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilter(val as 'all' | Status | 'archived')}
              style={{ padding: '6px 12px', borderRadius: 9, border: 'none', background: filter === val ? 'var(--surface-3)' : 'transparent', color: filter === val ? 'var(--text)' : 'var(--text-2)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Right controls: client filter + sort */}
        <div style={{ marginLeft: 'auto', position: 'relative', display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Client filter dropdown — global context only */}
          {!clientId && (() => {
            const clientsWithProjects = getClients().filter(c => allProjects.some(p => p.clientId === c.id));
            if (clientsWithProjects.length === 0) return null;
            const selected = clientsWithProjects.find(c => c.id === clientFilter);
            return (
              <div ref={clientFilterRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setClientFilterOpen(o => !o)}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 11px', borderRadius: 9, border: `1px solid ${clientFilter ? 'var(--accent)' : 'var(--border)'}`, background: clientFilter ? 'rgba(249,255,0,0.07)' : 'var(--surface-2)', color: clientFilter ? 'var(--accent)' : 'var(--text-2)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}
                >
                  {selected ? (
                    <><i style={{ width: 7, height: 7, borderRadius: '50%', background: selected.avatarColor, flexShrink: 0, display: 'block' }} />{selected.name}</>
                  ) : (
                    <><SFIcon name="users" size={13} color="var(--text-3)" />{t('projects.allClients')}</>
                  )}
                  <SFIcon name="chevron-down" size={12} color={clientFilter ? 'var(--accent)' : 'var(--text-3)'} />
                </button>
                {clientFilterOpen && (
                  <>
                    <div onClick={() => setClientFilterOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 290 }} />
                    <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 300, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 12, padding: 5, minWidth: 210, maxHeight: 300, overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                      <button
                        onClick={() => { setClientFilter(null); setClientFilterOpen(false); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none', background: clientFilter === null ? 'var(--surface-3)' : 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 12, color: clientFilter === null ? 'var(--text)' : 'var(--text-2)', fontWeight: clientFilter === null ? 600 : 400, fontFamily: 'var(--ff-text)' }}
                      >
                        <SFIcon name="layers" size={13} color={clientFilter === null ? 'var(--accent)' : 'var(--text-3)'} />
                        {t('projects.allClients')}
                        {clientFilter === null && <SFIcon name="check" size={12} color="var(--accent)" style={{ marginLeft: 'auto' }} />}
                      </button>
                      <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                      {clientsWithProjects.map(c => (
                        <button
                          key={c.id}
                          onClick={() => { setClientFilter(c.id); setClientFilterOpen(false); }}
                          style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none', background: clientFilter === c.id ? 'var(--surface-3)' : 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 12, color: clientFilter === c.id ? 'var(--text)' : 'var(--text-2)', fontWeight: clientFilter === c.id ? 600 : 400, fontFamily: 'var(--ff-text)' }}
                        >
                          <i style={{ width: 8, height: 8, borderRadius: '50%', background: c.avatarColor, flexShrink: 0, display: 'block' }} />
                          {c.name}
                          <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', marginLeft: 'auto' }}>
                            {allProjects.filter(p => p.clientId === c.id).length}
                          </span>
                          {clientFilter === c.id && <SFIcon name="check" size={12} color="var(--accent)" />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            );
          })()}

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
            <span>{(() => { const k = SORT_OPTIONS.find(o => o.value === sortBy)?.labelKey; return k ? t(k) : ''; })()}</span>
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
                  <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '6px 10px 4px' }}>{t('projects.sortBy')}</p>
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
                      {t(opt.labelKey)}
                      {sortBy === opt.value && <SFIcon name="check" size={12} color="var(--accent)" style={{ marginLeft: 'auto' }} />}
                    </button>
                  ))}
                </div>
              </>
            );
          })()}

          {/* View toggle */}
          <div style={{ display: 'flex', gap: 2, background: 'var(--surface-2)', borderRadius: 9, padding: 2, border: '1px solid var(--border)' }}>
            {([['grid', 'layout-grid', t('projects.viewGrid')], ['list', 'list', t('projects.viewList')]] as const).map(([val, icon, label]) => (
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

          {/* New project button — in client context, sits in the controls row */}
          {clientId && (
            <SFButton variant="primary" icon="plus" onClick={() => setShowModal(true)}>{t('projects.newProject')}</SFButton>
          )}
        </div>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        isProjectsLoading() ? (
          <SFLoadingState />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '60px 0', color: 'var(--text-3)' }}>
            <SFIcon name="folder-open" size={36} color="var(--text-3)" />
            <p style={{ fontSize: 14 }}>{t('projects.noProjectsFound')}</p>
            <SFButton variant="ghost" icon="plus" onClick={() => setShowModal(true)}>{t('projects.newProject')}</SFButton>
          </div>
        )
      )}

      {/* Project grid */}
      {view === 'grid' && filtered.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {filtered.map(p => (
            <ProjectCard key={p.id} p={p} />
          ))}
        </div>
      )}

      {/* Project list */}
      {view === 'list' && filtered.length > 0 && (
        <ProjectListView projects={filtered} />
      )}

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
