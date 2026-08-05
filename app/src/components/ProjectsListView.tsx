import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFButton, SFIcon, SFAvatar, SFPill, SFBar, SFModal, DatePickerDropdown, formatDisplay, SFLoadingState, PageHeader, LifecycleFilterDropdown, CategoryFilterDropdown, type LifecycleFilter } from './ui';
import { USERS } from '../data/mock';
import { loadAllTemplates, resolveTasksSections, subscribeProjectTemplates } from '../data/templates';
import type { TemplateTask } from '../data/templates';
import type { Project, Status, Phase, SectionData, Task, User, Client } from '../types/index';
import { ProjectCard, ProjectEditPanel, PROJECT_STATUS_OPTIONS, type EditUpdates } from './ProjectCard';
import { getProjects, addProject, updateProject, subscribeProjects, isProjectsLoading, archiveProject, unarchiveProject, removeProject, changeProjectClient } from '../data/projectStore';
import { getClients, addClient, findClient, subscribeClients } from '../data/clientStore';
import { getClientExternalTeam, subscribeClientTeam } from '../data/clientTeamStore';
import { syncProjectClientAccess } from '../data/projectClientAccessStore';
import { setSections, getCurrentSectionLabel, getProjectStats, subscribeStore } from '../data/taskStore';
import { setProjectContent } from '../data/projectContentStore';
import { addFolderTree } from '../data/fileStore';
import { isPinned, togglePin, subscribePinned, isPinnedClient } from '../data/pinnedStore';
import { loadPersisted, savePersisted } from '../data/persist';
import { isDemoSession, getCurrentUser } from '../data/authStore';
import { getTeamMembers } from '../data/teamStore';
import { usePlan } from '../data/planStore';
import { canCreateNewProject } from '../data/upgradePromptStore';
import { addWatchers } from '../data/watchers';

// ── Constants ─────────────────────────────────────────────────────────────────

const PROJECT_COLORS = ['#5B8AF5', '#34C98A', '#A05BE8', '#F5975B', '#E85B7A', '#5BC4E8', '#F5C05B', '#E85BB8'];
const TEAM = Object.values(USERS).filter(u => u.role !== 'Cliente');

// Demo sessions pick from the 5 mock people; real sessions must show the
// studio's actual invited team, not the mock roster.
function getTeam(): User[] {
  if (isDemoSession()) return TEAM;
  const team = getTeamMembers();
  return team.length > 0 ? team : TEAM;
}
type Step = 'start' | 'info' | 'team';
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

function StepDot({ label, num, active, done, reachable, onClick }: { label: string; num: number; active: boolean; done: boolean; reachable: boolean; onClick: () => void }) {
  return (
    <div
      onClick={reachable ? onClick : undefined}
      style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: reachable ? 'pointer' : 'default' }}
    >
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
  onCreate: (p: Project) => void | Promise<void>;
  defaultClientId?: string;
}) {
  const { t } = useTranslation();
  const [step, setStep]                 = useState<Step>('start');
  const [templateId, setTemplateId]     = useState<string | null>(null);
  const clients = getClients().filter(c => !c.archived);
  const [name, setName]                 = useState('');
  const [clientId, setClientId]         = useState(defaultClientId ?? clients[0]?.id ?? '');
  // Studio flambant neuf, aucun client encore créé — le sélecteur de clients
  // (grille) n'a rien à montrer. Plutôt que de laisser l'utilisateur créer un
  // projet sans client (et planter au clic sur "Créer le projet", cf. bug
  // signalé), on propose de créer un premier client à la volée avec juste un
  // nom, réutilisé ci-dessous dans create().
  const [newClientName, setNewClientName] = useState('');
  const [isPersonalProject, setIsPersonalProject] = useState(false);
  const [calendarEnabled, setCalendarEnabled] = useState(true);
  const [filesEnabled, setFilesEnabled]       = useState(true);
  const [financeEnabled, setFinanceEnabled]   = useState(false);
  useEffect(() => {
    if (isPersonalProject) { setFinanceEnabled(false); return; }
    const hasClient = clientId || newClientName.trim().length > 0;
    setFinanceEnabled(!!hasClient);
  }, [isPersonalProject, clientId, newClientName]);
  const [color, setColor]               = useState(PROJECT_COLORS[0]);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [budget, setBudget]             = useState('');
  const [description, setDescription]   = useState('');
  const [dateRect, setDateRect]         = useState<DOMRect | null>(null);
  const [dateOpen, setDateOpen]         = useState(false);
  const team = getTeam();
  const authUser = getCurrentUser();
  const defaultMemberId = (!isDemoSession() && authUser && team.some(u => u.id === authUser.id)) ? authUser.id : team[0]?.id;
  const [memberIds, setMemberIds]       = useState<string[]>(defaultMemberId ? [defaultMemberId] : []);
  // External members picker: individually-picked contacts of the client
  // selected in step 2, plus whole-client bulk chips for OTHER clients —
  // same three-pool pattern as ProjectMembres.tsx's AddMemberModal, ported
  // here so a project can be created with external collaborators already
  // attached instead of only internal team members.
  const [externalPickedIds, setExternalPickedIds] = useState<Set<string>>(new Set());
  const [groupPickedIds, setGroupPickedIds]       = useState<Set<string>>(new Set());
  // Empty-state guard for bulk-picked "other client" chips whose contact pool
  // hasn't finished loading yet (or is genuinely empty) — same check as
  // ProjectMembres.tsx's AddMemberModal.handleConfirm, ported here so
  // create() doesn't silently add zero people with no feedback.
  const [emptyGroupWarning, setEmptyGroupWarning] = useState(false);
  // If the step-2 client selection changes after some of its contacts were
  // picked in step 3, those picks were scoped to the OLD client's contact
  // pool and become orphaned (unresolvable, undeselectable) once step 3
  // re-renders against the new client. groupPickedIds is untouched — it's
  // scoped to explicitly-chosen OTHER clients, independent of step 2.
  useEffect(() => { setExternalPickedIds(new Set()); }, [clientId, isPersonalProject]);
  // getClientExternalTeam()/getClients() read synchronous caches that start
  // empty until their background Supabase fetch resolves — without these
  // subscriptions the contacts pool and bulk-chip counts below would freeze
  // at the stale empty state until some unrelated re-render happened.
  const [, forceContactsRerender] = useState(0);
  useEffect(() => subscribeClientTeam(() => forceContactsRerender(n => n + 1)), []);
  const [, forceClientsRerender] = useState(0);
  useEffect(() => subscribeClients(() => forceClientsRerender(n => n + 1)), []);

  const [templateSearch, setTemplateSearch] = useState('');
  const [clientSearch, setClientSearch] = useState('');
  const [teamSearch, setTeamSearch] = useState('');
  const [allTemplates, setAllTemplates] = useState(loadAllTemplates);
  // Session réelle : loadAllTemplates() déclenche le fetch Supabase mais renvoie
  // [] tant qu'il n'a pas résolu — sans cet abonnement, l'assistant affiche
  // "aucun modèle" au premier montage et ne se met à jour qu'au prochain
  // re-render externe (ex. changement d'étape), jamais spontanément.
  useEffect(() => subscribeProjectTemplates(() => setAllTemplates(loadAllTemplates())), []);
  // Tri chronologique : les modèles de départ (semés à la création du studio,
  // donc les plus anciens) apparaissent naturellement en premier, dans leur
  // ordre de semis ; les modèles créés ensuite par l'utilisateur suivent.
  const sortedTemplates = [...allTemplates].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const templates = templateSearch.trim()
    ? sortedTemplates.filter(t => t.name.toLowerCase().includes(templateSearch.trim().toLowerCase()) || t.tags.some(tag => tag.toLowerCase().includes(templateSearch.trim().toLowerCase())))
    : sortedTemplates;
  const selectedTemplate = sortedTemplates.find(t => t.id === templateId) ?? null;

  // The creator is always a member of their own project — can't deselect yourself.
  const toggleMember = (id: string) => {
    if (id === defaultMemberId) return;
    setMemberIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleExternal = (id: string) => setExternalPickedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const toggleGroupPick = (id: string) => setGroupPickedIds(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // Selected client (step 2) whose contacts get their own pool + bulk-add
  // button — only when a real, already-existing client was picked (a
  // freshly-typed newClientName has no id/contacts yet at this step).
  // Mirrors create()'s own client resolution (allClients[0] fallback when no
  // client was explicitly picked yet) so the contacts pool/bulk-add shown
  // here always matches the client the project will actually end up with —
  // otherwise picks here could target an empty-string clientId while
  // create() silently assigns the project to allClients[0].
  const selectedClientId = !isPersonalProject ? ((clientId || clients[0]?.id) ?? '') : '';
  const selectedClientContacts = selectedClientId ? getClientExternalTeam(selectedClientId) : [];
  const selectedClientName = selectedClientId ? getClients().find(c => c.id === selectedClientId)?.name : undefined;
  const addAllSelectedClientContacts = () => {
    setExternalPickedIds(prev => {
      const next = new Set(prev);
      selectedClientContacts.forEach(c => next.add(c.id));
      return next;
    });
  };

  const canNext = step === 'start' ? true
    : step === 'info' ? name.trim().length > 0 && (isPersonalProject || clients.length > 0 || newClientName.trim().length > 0)
    : true; // 'team' : aucune sélection obligatoire — un projet peut n'avoir aucun membre assigné

  const next = () => {
    if (step === 'start') {
      setStep('info');
    } else if (step === 'info') {
      setStep('team');
    } else {
      create();
    }
  };
  const back = () => {
    if (step === 'info') setStep('start');
    else if (step === 'team') setStep('info');
  };

  const create = async () => {
    // A picked "other client" chip whose contact team is still empty (fetch not
    // resolved yet, or genuinely no contacts) would otherwise silently add zero
    // people with no feedback — block and warn instead of proceeding, same as
    // AddMemberModal.handleConfirm in ProjectMembres.tsx.
    const emptyPickedGroup = [...groupPickedIds].some(groupId => getClientExternalTeam(groupId).length === 0);
    if (emptyPickedGroup) { setEmptyGroupWarning(true); return; }
    setEmptyGroupWarning(false);
    // Non-archivés uniquement — un client archivé ne doit jamais être choisi
    // par défaut ni faire croire à tort que le studio a déjà un client actif
    // (c'était le bug : allClients[0] pouvait retomber sur un client archivé
    // au lieu de déclencher la création du tout premier client).
    const allClients = getClients().filter(c => !c.archived);
    let client: Client | undefined = isPersonalProject ? undefined : (allClients.find(c => c.id === clientId) ?? allClients[0]);
    if (!isPersonalProject && !client) {
      // Studio sans aucun client (compte flambant neuf) — crée un client
      // minimal à partir du nom saisi. addClient() écrit en fire-and-forget
      // en session réelle (Supabase) : on attend sa disponibilité réelle
      // avant de s'en servir, même garde-fou que NewClientModal (Clients.tsx).
      const trimmedName = newClientName.trim();
      const newClientId = `c${Date.now()}`;
      const initials = trimmedName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '—';
      const newClient: Client = {
        id: newClientId,
        name: trimmedName,
        initials,
        avatarColor: PROJECT_COLORS[0],
        sector: '',
        city: '—',
        activeProjects: 0,
        pendingDeliverables: 0,
        since: String(new Date().getFullYear()),
        progress: 0,
        status: 'ok',
        statusLabel: t('clients.statusActive'),
        lastActivity: new Date().toISOString(),
      };
      addClient(newClient);
      client = findClient(newClientId) ?? await new Promise<Client>(resolve => {
        const unsubscribe = subscribeClients(() => {
          const found = findClient(newClientId);
          if (found) { unsubscribe(); resolve(found); }
        });
      });
    }
    const internalMembers = team.filter(u => memberIds.includes(u.id));
    // Resolve external picks against the SAME client id that was used to
    // render the pool above — `client` above may already have been created
    // moments earlier from newClientName, but that client has no contacts
    // yet, so this only ever resolves to something when a real existing
    // client was selected in step 2.
    const externalMembers: User[] = selectedClientId
      ? getClientExternalTeam(selectedClientId)
          .filter(c => externalPickedIds.has(c.id))
          .map(c => ({ id: c.id, name: c.name, initials: c.initials, avatarColor: c.color, role: c.role } as User))
      : [];
    // Expand bulk-picked "other client" chips into their full contact list.
    const groupMembers: User[] = Array.from(groupPickedIds).flatMap(groupId =>
      getClientExternalTeam(groupId).map(c => ({ id: c.id, name: c.name, initials: c.initials, avatarColor: c.color, role: c.role } as User))
    );
    const seenMemberIds = new Set<string>();
    const members: User[] = [...internalMembers, ...externalMembers, ...groupMembers].filter(u => {
      if (seenMemberIds.has(u.id)) return false;
      seenMemberIds.add(u.id);
      return true;
    });
    const projectId = `pj${Date.now()}`;
    const templateSections = selectedTemplate ? resolveTasksSections(selectedTemplate) : [];
    const budgetNum = Number(String(budget).replace(/[^\d.]/g, ''));
    const newProject: Project = {
      id: projectId,
      name: name.trim(),
      clientId: client?.id,
      clientName: client?.name,
      clientColor: color,
      phase: 'preproduction',
      phaseLabel: 'Préproduction',
      progress: 0,
      taskCount: templateSections.reduce((n, s) => n + s.tasks.length, 0),
      deliverableCount: 0,
      members,
      deliveryDate: deliveryDate ? formatDisplay(deliveryDate) : '—',
      status: 'info',
      statusLabel: 'En cours',
      modifiedAt: new Date().toISOString(),
      budget: Number.isFinite(budgetNum) && budgetNum > 0 ? budgetNum : undefined,
      description: description.trim() || undefined,
      calendarEnabled,
      filesEnabled,
      financeEnabled: financeEnabled && !!client,
    };
    if (templateSections.length) {
      const buildTask = (tt: TemplateTask, id: string): Task => ({
        id,
        title: tt.title,
        projectId,
        projectName: newProject.name,
        projectColor: color,
        assignees: tt.assignees?.length ? tt.assignees : [members[0] ?? USERS.lea],
        status: 'warn',
        statusLabel: 'En attente',
        priority: tt.priority ?? 'normal',
        priorityLabel: tt.priority === 'high' ? 'Élevée' : tt.priority === 'low' ? 'Basse' : 'Normale',
        dueDate: tt.dueDate ?? '',
        checked: false,
        description: tt.description,
        subtasks: tt.subtasks?.length ? tt.subtasks.map((sub, j) => buildTask(sub, `${id}-sub${j}`)) : [],
        watchers: addWatchers([], [getCurrentUser()?.id, (members[0] ?? USERS.lea).id]),
      });
      const sections: SectionData[] = templateSections.map(sec => ({
        label: sec.label,
        progress: 0,
        tasks: sec.tasks.map((tt, i) => buildTask(tt, `${projectId}-${sec.label}-${i}`)),
      }));
      setSections(projectId, sections);
    }
    if (selectedTemplate?.folderStructure?.length) {
      addFolderTree(selectedTemplate.folderStructure, { projectId });
    }
    // `project_content.project_id` référence `projects(id)` : la ligne projet doit
    // exister AVANT d'écrire le contenu d'Aperçu (sinon violation de clé étrangère
    // en session réelle). On attend donc la création avant setProjectContent.
    await onCreate(newProject);
    // Grant real client-contact access — project.members is just the JSONB
    // display list; project_client_access (the table RLS actually checks) is
    // never touched by writing `members` above. Every distinct client whose
    // contacts ended up picked (the step-2 selected client via externalMembers,
    // AND any bulk-picked "other client" chips) needs its own sync call, not
    // just the step-2 client — a bulk chip can add contacts from a client that
    // isn't the one selected for billing.
    const externalAccessClientIds = new Set<string>();
    if (selectedClientId && externalMembers.length) externalAccessClientIds.add(selectedClientId);
    groupPickedIds.forEach(id => externalAccessClientIds.add(id));
    externalAccessClientIds.forEach(cid => syncProjectClientAccess(projectId, cid, members));
    if (selectedTemplate?.overviewSections?.length || selectedTemplate?.overviewSectionData) {
      setProjectContent(projectId, {
        customSections: selectedTemplate.overviewSections,
        customSectionData: selectedTemplate.overviewSectionData,
      });
    }
    onClose();
  };

  const STEP_ORDER: Step[] = ['start', 'info', 'team'];
  const stepDone = (s: Step) => STEP_ORDER.indexOf(step) > STEP_ORDER.indexOf(s);

  // Une étape n'est valide que si son propre "canNext" serait vrai — reproduit
  // la même règle que canNext, mais évaluable pour n'importe quelle étape, pas
  // seulement l'étape courante (nécessaire pour savoir jusqu'où on peut sauter).
  const isStepValid = (s: Step): boolean => {
    if (s === 'info') return name.trim().length > 0 && (isPersonalProject || clients.length > 0 || newClientName.trim().length > 0);
    return true; // 'start'/'team' : jamais bloquantes
  };
  // Une étape est atteignable par clic si toutes les étapes qui la précèdent
  // sont déjà valides — on peut donc toujours reculer, mais avancer seulement
  // jusqu'où les champs obligatoires sont déjà remplis.
  const maxReachableIndex = (() => {
    let max = 0;
    for (let i = 0; i < STEP_ORDER.length; i++) {
      if (i > 0 && !isStepValid(STEP_ORDER[i - 1])) break;
      max = i;
    }
    return max;
  })();
  const isStepReachable = (s: Step) => STEP_ORDER.indexOf(s) <= maxReachableIndex;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400 }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--surface)', borderRadius: 18, border: '1px solid var(--border)', boxShadow: '0 24px 72px rgba(0,0,0,0.6)', width: 820, maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 28px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 700 }}>{t('projects.newProject')}</h2>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
              {step === 'start' ? t('projects.stepStartSubtitle') : step === 'info' ? t('projects.stepInfoSubtitle') : t('projects.stepTeamSubtitle')}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <StepDot label={t('projects.stepStart')} num={1} active={step === 'start'} done={stepDone('start')} reachable={isStepReachable('start')} onClick={() => setStep('start')} />
            <div style={{ width: 16, height: 1, background: 'var(--border-2)' }} />
            <StepDot label={t('projects.stepInfo')} num={2} active={step === 'info'} done={stepDone('info')} reachable={isStepReachable('info')} onClick={() => setStep('info')} />
            <div style={{ width: 16, height: 1, background: 'var(--border-2)' }} />
            <StepDot label={t('projects.stepTeam')} num={3} active={step === 'team'} done={stepDone('team')} reachable={isStepReachable('team')} onClick={() => setStep('team')} />
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
                <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>{t('projects.startFromTemplate')}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-2)', borderRadius: 9, padding: '6px 12px', border: '1px solid var(--border)', marginBottom: 10 }}>
                  <SFIcon name="search" size={13} color="var(--text-3)" />
                  <input
                    value={templateSearch}
                    onChange={e => setTemplateSearch(e.target.value)}
                    placeholder={t('projects.searchTemplatesPlaceholder')}
                    style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)' }}
                  />
                </div>
                <div style={{ maxHeight: 360, overflowY: 'auto', paddingRight: 4 }}>
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
                            </div>
                            <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{tpl.description}</p>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
                              {tpl.tags.slice(0, 3).map(tag => (
                                <span key={tag} style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', background: 'var(--surface-3)', color: 'var(--text-3)', padding: '2px 6px', borderRadius: 4 }}>{tag}</span>
                              ))}
                            </div>
                            <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 6 }}>
                              {t('projects.sectionsTasksCount', { sections: resolveTasksSections(tpl).length, tasks: resolveTasksSections(tpl).reduce((n, s) => n + s.tasks.length, 0) })}
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
                {templates.length === 0 && (
                  <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: '20px 0' }}>{t('projects.noTemplatesFound')}</p>
                )}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Project info */}
          {step === 'info' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
                <button
                  type="button"
                  onClick={() => {
                    const next = !isPersonalProject;
                    setIsPersonalProject(next);
                    if (next) { setClientId(''); setNewClientName(''); setFinanceEnabled(false); }
                  }}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 10,
                    padding: '7px 12px 7px 8px', borderRadius: 8, border: 'none', background: 'none',
                    color: 'var(--text-2)', fontSize: 12, fontFamily: 'var(--ff-text)', cursor: 'pointer',
                  }}
                >
                  <span style={{
                    width: 16, height: 16, borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: `1.5px solid ${isPersonalProject ? 'var(--accent)' : 'var(--border-2)'}`,
                    background: isPersonalProject ? 'var(--accent)' : 'transparent',
                  }}>
                    {isPersonalProject && <SFIcon name="check" size={11} color="var(--on-accent)" />}
                  </span>
                  {t('projects.personalProjectOption')}
                </button>
                {isPersonalProject && (
                  <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 10 }}>{t('projects.personalProjectHint')}</p>
                )}
                {!isPersonalProject && (clients.length === 0 ? (
                  <div>
                    <input
                      value={newClientName}
                      onChange={e => setNewClientName(e.target.value)}
                      placeholder={t('clients.placeholder')}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--ff-text)' }}
                    />
                    <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6 }}>{t('projects.firstClientHint')}</p>
                  </div>
                ) : (
                  <>
                    {clients.length > 8 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-2)', borderRadius: 9, padding: '6px 12px', border: '1px solid var(--border)', marginBottom: 8 }}>
                        <SFIcon name="search" size={13} color="var(--text-3)" />
                        <input
                          value={clientSearch}
                          onChange={e => setClientSearch(e.target.value)}
                          placeholder={t('projects.searchClientPlaceholder')}
                          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)' }}
                        />
                      </div>
                    )}
                    <div style={{ maxHeight: clients.length > 8 ? 220 : undefined, overflowY: clients.length > 8 ? 'auto' : 'visible', paddingRight: 4 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                        {(() => {
                          const sortedClients = [...clients].sort((a, b) => Number(isPinnedClient(b.id)) - Number(isPinnedClient(a.id)));
                          const filteredClients = clientSearch.trim()
                            ? sortedClients.filter(c => c.name.toLowerCase().includes(clientSearch.trim().toLowerCase()))
                            : sortedClients;
                          return filteredClients.map(c => (
                            <button
                              key={c.id}
                              onClick={() => setClientId(c.id)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '8px 10px', borderRadius: 9, cursor: 'pointer',
                                border: `1.5px solid ${clientId === c.id ? 'var(--accent)' : 'var(--border)'}`,
                                background: clientId === c.id ? 'rgba(249,255,0,0.08)' : 'var(--surface-2)',
                              }}
                            >
                              <div style={{ width: 22, height: 22, borderRadius: '50%', background: c.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <span style={{ fontSize: 9, fontWeight: 700, color: '#fff' }}>{c.initials}</span>
                              </div>
                              <span style={{ flex: 1, fontSize: 11, fontWeight: 500, color: clientId === c.id ? 'var(--text)' : 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                              {clientId === c.id && <SFIcon name="check" size={13} color="var(--accent)" />}
                            </button>
                          ));
                        })()}
                      </div>
                    </div>
                  </>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, auto) 1fr 1fr', gap: 14, alignItems: 'start' }}>
                <div>
                  <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 8 }}>{t('projects.projectColor')}</label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {PROJECT_COLORS.map(c => (
                      <button
                        key={c}
                        onClick={() => setColor(c)}
                        style={{
                          width: 22, height: 22, borderRadius: '50%', background: c,
                          border: color === c ? '2px solid white' : '2px solid transparent',
                          outline: color === c ? `2px solid ${c}` : 'none',
                          cursor: 'pointer', flexShrink: 0,
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
                        padding: '8px 12px', borderRadius: 9, border: '1px solid var(--border)',
                        background: 'var(--surface-2)', cursor: 'pointer',
                        fontFamily: 'var(--ff-mono)', fontSize: 12,
                        color: deliveryDate ? 'var(--text)' : 'var(--text-3)',
                        width: '100%', boxSizing: 'border-box', justifyContent: 'flex-start',
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

                <div>
                  <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>{t('projects.budgetLabel')} <span style={{ fontWeight: 400, opacity: 0.6 }}>{t('projects.optional')}</span></label>
                  <input
                    value={budget}
                    onChange={e => setBudget(e.target.value)}
                    placeholder={t('projects.budget')}
                    inputMode="numeric"
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--ff-mono)' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>{t('projects.description')} <span style={{ fontWeight: 400, opacity: 0.6 }}>{t('projects.optional')}</span></label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder={t('projects.projectName')}
                  rows={2}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--ff-text)', resize: 'vertical', lineHeight: 1.5 }}
                />
              </div>

              <div>
                <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 8 }}>{t('projects.featuresLabel')}</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[
                    { key: 'calendar', label: t('projects.moduleCalendar'), checked: calendarEnabled, onToggle: () => setCalendarEnabled(v => !v), disabled: false },
                    { key: 'files',    label: t('projects.moduleFiles'),    checked: filesEnabled,    onToggle: () => setFilesEnabled(v => !v),    disabled: false },
                    { key: 'finance',  label: t('projects.moduleFinance'),  checked: financeEnabled,  onToggle: () => setFinanceEnabled(v => !v),  disabled: isPersonalProject || (!clientId && !newClientName.trim()) },
                  ].map(m => (
                    <button
                      key={m.key}
                      type="button"
                      disabled={m.disabled}
                      onClick={m.onToggle}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', borderRadius: 8,
                        border: 'none', background: 'none',
                        color: m.disabled ? 'var(--text-3)' : 'var(--text-2)', fontSize: 12, fontFamily: 'var(--ff-text)',
                        cursor: m.disabled ? 'not-allowed' : 'pointer', opacity: m.disabled ? 0.5 : 1, textAlign: 'left',
                      }}
                    >
                      <span style={{
                        width: 16, height: 16, borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: `1.5px solid ${m.checked && !m.disabled ? 'var(--accent)' : 'var(--border-2)'}`,
                        background: m.checked && !m.disabled ? 'var(--accent)' : 'transparent',
                      }}>
                        {m.checked && !m.disabled && <SFIcon name="check" size={11} color="var(--on-accent)" />}
                      </span>
                      {m.label}
                      {m.key === 'finance' && m.disabled && (
                        <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--text-3)' }}>{t('projects.moduleFinanceRequiresClient')}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* Step 3: Team */}
          {step === 'team' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ fontSize: 13, color: 'var(--text-2)' }}>{t('projects.selectMembers')}</p>
              {team.length > 8 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-2)', borderRadius: 9, padding: '6px 12px', border: '1px solid var(--border)' }}>
                  <SFIcon name="search" size={13} color="var(--text-3)" />
                  <input
                    value={teamSearch}
                    onChange={e => setTeamSearch(e.target.value)}
                    placeholder={t('projects.searchTeamPlaceholder')}
                    style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)' }}
                  />
                </div>
              )}
              <div style={{ maxHeight: team.length > 8 ? 260 : undefined, overflowY: team.length > 8 ? 'auto' : 'visible', paddingRight: 4 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  {(() => {
                    const sortedTeam = [...team].sort((a, b) => Number(b.id === defaultMemberId) - Number(a.id === defaultMemberId));
                    const filteredTeam = teamSearch.trim()
                      ? sortedTeam.filter(u => u.name.toLowerCase().includes(teamSearch.trim().toLowerCase()) || u.role.toLowerCase().includes(teamSearch.trim().toLowerCase()))
                      : sortedTeam;
                    return filteredTeam.map(u => {
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
                    });
                  })()}
                </div>
              </div>
              <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>
                {t('projects.membersSelected', { count: memberIds.length + externalPickedIds.size + groupPickedIds.size })}
              </p>

              {/* Selected client's contacts — individually addable, plus a bulk shortcut */}
              {selectedClientId && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                      {selectedClientName ?? t('members.clientContacts')}
                    </p>
                    {selectedClientContacts.length > 0 && (
                      <SFButton variant="secondary" icon="user-plus" onClick={addAllSelectedClientContacts}>
                        {t('projects.addAllClientContacts', { clientName: selectedClientName ?? '' })}
                      </SFButton>
                    )}
                  </div>
                  {selectedClientContacts.length === 0 ? (
                    <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{t('members.noClientContacts')}</p>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                      {selectedClientContacts
                        .filter(c => c.name.toLowerCase().includes(teamSearch.trim().toLowerCase()))
                        .map(c => {
                          const on = externalPickedIds.has(c.id);
                          return (
                            <button
                              key={c.id}
                              onClick={() => toggleExternal(c.id)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                padding: '12px 14px', borderRadius: 11, cursor: 'pointer',
                                border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                                background: on ? 'rgba(249,255,0,0.05)' : 'var(--surface-2)',
                                transition: 'border-color 0.12s',
                              }}
                            >
                              <SFAvatar initials={c.initials} bg={c.color} size={34} />
                              <div style={{ textAlign: 'left', minWidth: 0 }}>
                                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</p>
                                <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>{c.role}</p>
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
                  )}
                </div>
              )}

              {/* Other clients — bulk-add chips, so an external collaborator from a
                  different client (or any client, on a personal/client-less project)
                  can still be added without leaving the wizard. */}
              {(() => {
                const otherClients = getClients()
                  .filter(c => !c.archived && c.id !== selectedClientId)
                  .filter(c => c.name.toLowerCase().includes(teamSearch.trim().toLowerCase()));
                if (otherClients.length === 0) return null;
                return (
                  <div>
                    <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
                      {t('members.groups')}
                    </p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                      {otherClients.map(c => {
                        const on = groupPickedIds.has(c.id);
                        return (
                          <button
                            key={c.id}
                            onClick={() => toggleGroupPick(c.id)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 12,
                              padding: '12px 14px', borderRadius: 11, cursor: 'pointer',
                              border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                              background: on ? 'rgba(249,255,0,0.05)' : 'var(--surface-2)',
                              transition: 'border-color 0.12s',
                            }}
                          >
                            <SFAvatar initials={c.initials} bg={c.avatarColor} size={34} />
                            <div style={{ textAlign: 'left', minWidth: 0 }}>
                              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</p>
                              <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>{t('members.groupContactCount', { count: getClientExternalTeam(c.id).length })}</p>
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
                  </div>
                );
              })()}

              {emptyGroupWarning && (
                <p style={{ fontSize: 11, color: 'var(--danger)' }}>{t('members.emptyGroupWarning')}</p>
              )}
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
  const [color, setColor] = useState(p.clientColor ?? 'var(--text-3)');
  const [status, setStatus] = useState<Status>(p.status);
  const [statusLabel, setStatusLabel] = useState(p.statusLabel);
  const [phase, setPhase] = useState<Phase>(p.phase);
  const [phaseLabel, setPhaseLabel] = useState(p.phaseLabel);
  const [deliveryDate, setDeliveryDate] = useState(p.deliveryDate);
  // Menu "..." — même contenu que ProjectCard.tsx (carte grille) et
  // ProjectHeaderBar.tsx (en-tête projet) : Modifier en premier, puis
  // Déplacer/Archiver/Supprimer. La vue Liste n'avait aucun de ces trois
  // derniers avant ce chantier.
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [moveClientOpen, setMoveClientOpen] = useState(false);
  const [moveClientSearch, setMoveClientSearch] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) { setMenuOpen(false); setConfirmDelete(false); } };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  useEffect(() => subscribePinned(() => setPinnedState(isPinned(p.id))), [p.id]);
  const [, forceStatsTick] = useState(0);
  useEffect(() => subscribeStore(() => forceStatsTick(n => n + 1)), []);
  const stats = getProjectStats(p);

  const handleSave = (u: EditUpdates) => {
    setName(u.name); setColor(u.color);
    setStatus(u.status); setStatusLabel(u.statusLabel);
    setPhase(u.phase); setPhaseLabel(u.phaseLabel);
    setDeliveryDate(u.deliveryDate);
    updateProject(p.id, {
      name: u.name, clientColor: u.color, status: u.status, statusLabel: u.statusLabel,
      phase: u.phase, phaseLabel: u.phaseLabel, deliveryDate: u.deliveryDate,
      budget: u.budget, description: u.description,
      calendarEnabled: u.calendarEnabled,
      filesEnabled: u.filesEnabled,
      financeEnabled: u.financeEnabled,
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
        </div>
      </div>

      {/* Phase */}
      <div>
        {/* No fallback to the static phaseLabel — a project with no sections
            yet has no real phase, and a default like "Préproduction" was
            misleading since that section doesn't actually exist. */}
        {getCurrentSectionLabel(p.id) && <SFPill status="neutral" small>{getCurrentSectionLabel(p.id)}</SFPill>}
      </div>

      {/* Progression */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}><SFBar value={stats.progress} height={4} /></div>
        <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10.5, color: 'var(--text-2)', flexShrink: 0, width: 30, textAlign: 'right' }}>{stats.progress}%</span>
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
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuOpen(v => !v)}
            title={t('projects.projectMenu')}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, border: 'none', flexShrink: 0, background: 'var(--surface-2)', color: 'var(--text-2)', cursor: 'pointer' }}
          >
            <SFIcon name="ellipsis" size={14} />
          </button>
          {menuOpen && (
            <div
              onClick={e => e.stopPropagation()}
              style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 500, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, padding: 4, minWidth: 190, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
            >
              <button
                onClick={() => { setEditOpen(true); setMenuOpen(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--ff-text)' }}
              >
                <SFIcon name="square-pen" size={13} color="var(--text-3)" />
                {t('projects.editProject')}
              </button>
              <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
              <button
                onClick={() => { if (p.archived) { unarchiveProject(p.id); } else { archiveProject(p.id); } setMenuOpen(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--ff-text)' }}
              >
                <SFIcon name={p.archived ? 'rotate-ccw' : 'archive'} size={13} color="var(--text-3)" />
                {p.archived ? t('projects.unarchiveProject') : t('projects.archiveProject')}
              </button>
              <button
                onClick={() => { setMoveClientOpen(true); setMenuOpen(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--ff-text)' }}
              >
                <SFIcon name="arrow-right-left" size={13} color="var(--text-3)" />
                {t('projects.moveToClient')}
              </button>
              {p.archived && !confirmDelete && (
                <button
                  onClick={() => setConfirmDelete(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--danger)', fontSize: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--ff-text)' }}
                >
                  <SFIcon name="trash-2" size={13} color="var(--danger)" />
                  {t('projects.deleteProjectPermanently')}
                </button>
              )}
              {p.archived && confirmDelete && (
                <div style={{ padding: '8px 10px' }}>
                  <p style={{ fontSize: 11, color: 'var(--danger)', marginBottom: 6 }}>{t('projects.deleteProjectConfirm')}</p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => { removeProject(p.id); setMenuOpen(false); setConfirmDelete(false); }}
                      style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: 'none', background: 'var(--danger)', color: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}
                    >
                      {t('tasks.yes')}
                    </button>
                    <button
                      onClick={() => setConfirmDelete(false)}
                      style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}
                    >
                      {t('tasks.no')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {editOpen && (
        <ProjectEditPanel
          p={p} color={color} name={name} status={status} statusLabel={statusLabel}
          phase={phase} phaseLabel={phaseLabel} deliveryDate={deliveryDate}
          onClose={() => setEditOpen(false)} onSave={handleSave}
        />
      )}

      {moveClientOpen && (
        <SFModal open onClose={() => { setMoveClientOpen(false); setMoveClientSearch(''); }} title={t('projects.moveToClient')} width={380} maxHeight="70vh">
          <input
            autoFocus
            value={moveClientSearch}
            onChange={e => setMoveClientSearch(e.target.value)}
            placeholder={t('members.searchPlaceholder')}
            style={{ width: '100%', boxSizing: 'border-box', padding: '8px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'var(--ff-text)', marginBottom: 10 }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 320, overflowY: 'auto' }}>
            {p.clientId && (
              <button
                onClick={e => {
                  e.stopPropagation();
                  void changeProjectClient(p, null);
                  setMoveClientOpen(false);
                  setMoveClientSearch('');
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', color: 'var(--danger)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <SFIcon name="x-circle" size={16} />
                <span style={{ fontSize: 13 }}>{t('projects.removeClientFromProject')}</span>
              </button>
            )}
            {getClients().filter(c => !c.archived && c.id !== p.clientId && c.name.toLowerCase().includes(moveClientSearch.toLowerCase())).map(c => (
              <button
                key={c.id}
                onClick={e => {
                  e.stopPropagation();
                  void changeProjectClient(p, c.id, c.name, c.avatarColor);
                  setMoveClientOpen(false);
                  setMoveClientSearch('');
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ width: 28, height: 28, borderRadius: 7, background: c.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                  {c.initials}
                </div>
                <span style={{ fontSize: 13 }}>{c.name}</span>
              </button>
            ))}
          </div>
        </SFModal>
      )}
    </div>
  );
}

function ProjectListView({ projects }: { projects: Project[] }) {
  const { t } = useTranslation();
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflowX: 'auto', overflowY: 'hidden', background: 'var(--surface)', flexShrink: 0 }}>
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

const NO_CLIENT_FILTER = '__none__';
const VIEW_KEY = 'sf_projects_view';
const FILTER_KEY = 'sf_projects_filter';
const LIFECYCLE_FILTER_KEY = 'sf_projects_lifecycle_filter';

export function ProjectsListView({ clientId, projectIds, autoOpen, onModalClose }: { clientId?: string; projectIds?: string[]; autoOpen?: boolean; onModalClose?: () => void }) {
  const { t } = useTranslation();
  const plan = usePlan();
  const [search, setSearch] = useState('');
  // Only persisted for the main /projets page — a filter picked while
  // looking at one client's own Projets tab (clientId set) shouldn't leak
  // into what the global page shows next time.
  // Two independent dimensions, same as Clients: workflow stage (Terminé/En
  // cours/etc) and lifecycle (Tous/Actifs/Archivés) — an archived project
  // still has a real status, so mixing them into one filter doesn't work.
  const scoped = !!clientId || !!projectIds;
  const [statusFilter, setStatusFilter] = useState<'all' | Status>(() => scoped ? 'all' : loadPersisted<'all' | Status>(FILTER_KEY, 'all'));
  const [lifecycleFilter, setLifecycleFilter] = useState<LifecycleFilter>(() => scoped ? 'all' : loadPersisted<LifecycleFilter>(LIFECYCLE_FILTER_KEY, 'all'));
  const [clientFilter, setClientFilter] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>('recent');
  const [sortOpen, setSortOpen] = useState(false);

  const openNewProjectModal = () => {
    if (canCreateNewProject(plan)) setShowModal(true);
  };
  const sortBtnRef = useRef<HTMLButtonElement>(null);
  const [allProjects, setAllProjects] = useState(getProjects);
  const [showModal, setShowModal] = useState(false);
  const [clientFilterOpen, setClientFilterOpen] = useState(false);
  const clientFilterRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<'grid' | 'list'>(() => loadPersisted<'grid' | 'list'>(VIEW_KEY, 'grid'));
  const changeView = (v: 'grid' | 'list') => { setView(v); savePersisted(VIEW_KEY, v); };
  const changeStatusFilter = (f: 'all' | Status) => { setStatusFilter(f); if (!scoped) savePersisted(FILTER_KEY, f); };
  const changeLifecycleFilter = (f: LifecycleFilter) => { setLifecycleFilter(f); if (!scoped) savePersisted(LIFECYCLE_FILTER_KEY, f); };

  useEffect(() => subscribeProjects(() => setAllProjects(getProjects())), []);

  useEffect(() => {
    if (autoOpen) { setShowModal(true); onModalClose?.(); }
  }, [autoOpen]);

  const projects = projectIds
    ? allProjects.filter(p => projectIds.includes(p.id))
    : clientId
      ? allProjects.filter(p => p.clientId === clientId)
      : clientFilter === NO_CLIENT_FILTER
        ? allProjects.filter(p => p.clientId == null)
        : clientFilter
          ? allProjects.filter(p => p.clientId === clientFilter)
          : allProjects;

  const SORT_OPTIONS = scoped
    ? ALL_SORT_OPTIONS.filter(o => o.value !== 'client')
    : ALL_SORT_OPTIONS;

  const filtered = projects
    .filter(p => {
      if (search) {
        const q = search.toLowerCase();
        const match = p.name.toLowerCase().includes(q) || (!scoped && (p.clientName ?? '').toLowerCase().includes(q));
        if (!match) return false;
      }
      if (lifecycleFilter === 'archived' && !p.archived) return false;
      if (lifecycleFilter === 'active' && p.archived) return false;
      if (statusFilter !== 'all' && p.status !== statusFilter) return false;
      return true;
    })
    .slice()
    .sort((a, b) => {
      if (sortBy === 'alpha')      return a.name.localeCompare(b.name);
      if (sortBy === 'alpha-desc') return b.name.localeCompare(a.name);
      if (sortBy === 'client')     return (a.clientName ?? '').localeCompare(b.clientName ?? '');
      if (sortBy === 'delivery')   return (a.deliveryDate ?? '').localeCompare(b.deliveryDate ?? '');
      if (sortBy === 'progress')   return getProjectStats(b).progress - getProjectStats(a).progress;
      return (b.modifiedAt ?? '').localeCompare(a.modifiedAt ?? '');
    });

  // Standalone /projets page: fixed header (title + controls) with the list
  // scrolling independently below, like every other screen. Embedded in a
  // client's own Projets tab (clientId set): everything scrolls together
  // with the rest of that tab's content instead — there's no separate
  // fixed region to put a header in there.
  const useFixedHeader = !scoped;

  // "Archivé" is a lifecycle flag (orthogonal to workflow stage — an
  // archived project still has a real status), not another stage a project
  // moves through, so it doesn't belong in the same list as
  // Terminé/En cours/etc. It gets its own toggle below instead.
  const STATUS_FILTER_OPTIONS: { value: 'all' | Status; label: string }[] = [
    { value: 'all', label: t('projects.filterAllStatus') },
    ...PROJECT_STATUS_OPTIONS.map(o => ({ value: o.status, label: t(o.labelKey) })),
  ];

  const controlsRow = (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: 1, minWidth: 200, maxWidth: 340, height: 36 }}>
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

        {/* Status filter — workflow stage only. "Archivé" is a separate
            lifecycle dimension (LifecycleFilterDropdown, right below),
            not another option in this list. */}
        <CategoryFilterDropdown
          value={statusFilter}
          onChange={changeStatusFilter}
          categoryLabel={t('projects.statusLabel')}
          options={STATUS_FILTER_OPTIONS}
        />

        {/* Lifecycle (Tous/Actifs/Archivés) — same shared dropdown as Clients */}
        <LifecycleFilterDropdown
          value={lifecycleFilter}
          onChange={changeLifecycleFilter}
          categoryLabel={t('common.activityFilterLabel')}
          labels={{ all: t('projects.filterAllLifecycle'), active: t('clients.filterActive'), archived: t('projects.filterArchived') }}
        />

        {/* Client filter dropdown — global context only. Left-aligned with
            the other filters (search/status/lifecycle): it narrows the
            list, same as they do. Sort and the view toggle (right-aligned,
            below) don't narrow anything — they just change how the
            results are displayed. */}
        {!scoped && (() => {
          const clientsWithProjects = getClients().filter(c => allProjects.some(p => p.clientId === c.id));
          const hasNoClientProjects = allProjects.some(p => p.clientId == null);
          if (clientsWithProjects.length === 0 && !hasNoClientProjects) return null;
          const selected = clientsWithProjects.find(c => c.id === clientFilter);
          const noClientSelected = clientFilter === NO_CLIENT_FILTER;
          return (
            <div ref={clientFilterRef} style={{ position: 'relative', flexShrink: 0 }}>
              <button
                onClick={() => setClientFilterOpen(o => !o)}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 11px', borderRadius: 9, border: `1px solid ${clientFilter ? 'var(--accent)' : 'var(--border)'}`, background: clientFilter ? 'rgba(249,255,0,0.07)' : 'var(--surface-2)', color: clientFilter ? 'var(--accent)' : 'var(--text-2)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--ff-text)', whiteSpace: 'nowrap', flexShrink: 0 }}
              >
                <SFIcon name="users" size={13} color={(selected || noClientSelected) ? 'var(--accent)' : 'var(--text-3)'} />
                {t('projects.clientsLabel')}
                {selected && (
                  <>: <i style={{ width: 7, height: 7, borderRadius: '50%', background: selected.avatarColor, flexShrink: 0, display: 'block' }} />{selected.name}</>
                )}
                {noClientSelected && <>: {t('projects.noClientFilter')}</>}
                <SFIcon name="chevron-down" size={12} color={clientFilter ? 'var(--accent)' : 'var(--text-3)'} />
              </button>
              {clientFilterOpen && (
                <>
                  <div onClick={() => setClientFilterOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 290 }} />
                  <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 300, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 12, padding: 5, minWidth: 210, maxHeight: 300, overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                    <button
                      onClick={() => { setClientFilter(null); setClientFilterOpen(false); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none', background: clientFilter === null ? 'var(--surface-3)' : 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 12, color: clientFilter === null ? 'var(--text)' : 'var(--text-2)', fontWeight: clientFilter === null ? 600 : 400, fontFamily: 'var(--ff-text)' }}
                    >
                      <SFIcon name="layers" size={13} color={clientFilter === null ? 'var(--accent)' : 'var(--text-3)'} />
                      {t('projects.allClients')}
                      {clientFilter === null && <SFIcon name="check" size={12} color="var(--accent)" style={{ marginLeft: 'auto' }} />}
                    </button>
                    {hasNoClientProjects && (
                      <button
                        onClick={() => { setClientFilter(NO_CLIENT_FILTER); setClientFilterOpen(false); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none', background: noClientSelected ? 'var(--surface-3)' : 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 12, color: noClientSelected ? 'var(--text)' : 'var(--text-2)', fontWeight: noClientSelected ? 600 : 400, fontFamily: 'var(--ff-text)' }}
                      >
                        <i style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--text-3)', flexShrink: 0, display: 'block' }} />
                        {t('projects.noClientFilter')}
                        <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', marginLeft: 'auto' }}>
                          {allProjects.filter(p => p.clientId == null).length}
                        </span>
                        {noClientSelected && <SFIcon name="check" size={12} color="var(--accent)" />}
                      </button>
                    )}
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

        {/* Right: display options only (sort order, grid/list) — these
            never narrow the result set, unlike everything to the left. */}
        <div style={{ marginLeft: 'auto', position: 'relative', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
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
            <SFButton variant="primary" icon="plus" onClick={() => openNewProjectModal()}>{t('projects.newProject')}</SFButton>
          )}
        </div>
        </div>
  );

  const listContent = (
    <>
      {/* Empty state */}
      {filtered.length === 0 && (
        isProjectsLoading() ? (
          <SFLoadingState />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '60px 0', color: 'var(--text-3)' }}>
            <SFIcon name="folder-open" size={36} color="var(--text-3)" />
            <p style={{ fontSize: 14 }}>{t('projects.noProjectsFound')}</p>
            <SFButton variant="ghost" icon="plus" onClick={() => openNewProjectModal()}>{t('projects.newProject')}</SFButton>
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
    </>
  );

  const modal = showModal && (
    <NewProjectModal
      onClose={() => setShowModal(false)}
      onCreate={p => addProject(p)}
      defaultClientId={clientId}
    />
  );

  if (useFixedHeader) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <PageHeader
          title={t('projects.title')}
          subtitle={t('projects.countsSummary', { total: projects.length, active: projects.filter(p => p.status !== 'ok' && p.status !== 'neutral').length, late: projects.filter(p => p.status === 'danger').length })}
          actions={<SFButton variant="primary" icon="plus" onClick={() => openNewProjectModal()}>{t('projects.newProject')}</SFButton>}
        >
          {controlsRow}
        </PageHeader>
        <div style={{ flex: 1, overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {listContent}
        </div>
        {modal}
      </div>
    );
  }

  return (
    <>
      {controlsRow}
      {listContent}
      {modal}
    </>
  );
}
