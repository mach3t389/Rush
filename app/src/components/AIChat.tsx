import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { defaultSpeechLang } from '../i18n/useI18n';
import { registerAIToggle, registerAIClose } from './aiChatBridge';
import { usePlan } from '../data/planStore';
import { canUseFeature } from '../data/planFeatures';
import { requestUpgrade } from '../data/upgradePromptStore';
import { getShortcuts as getShortcutsFn, matchesShortcut as matchesShortcutFn } from '../data/shortcutsStore';
import { isDemoSession } from '../data/authStore';
import { getStudioId } from '../data/studioStore';
import { supabase } from '../data/supabaseClient';
import { useNavigate } from 'react-router-dom';
import { SFIcon } from './ui';
import { getProjects, addProject } from '../data/projectStore';
import { addEvent } from '../data/eventStore';
import { addResource } from '../data/resourceStore';
import { CLIENTS, MY_TASKS } from '../data/mock';
import type { Project, Phase, ResourceType } from '../types';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolUseId?: string;
  tool_calls?: { id: string; function: { name: string; arguments: any } }[];
  // display-only
  _toolLabel?: string;
}

// ── Outils disponibles ────────────────────────────────────────────────────────

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_projects',
      description: 'Liste tous les projets de la plateforme avec leur statut, phase et client.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_clients',
      description: 'Liste tous les clients enregistrés dans la plateforme.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_tasks',
      description: 'Liste les tâches. Peut être filtré par statut.',
      parameters: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['danger', 'warn', 'info', 'ok'],
            description: 'danger=en retard, warn=en attente, info=en cours, ok=complété',
          },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_project',
      description: 'Crée un nouveau projet et navigue vers sa page.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Nom du projet' },
          clientId: { type: 'string', description: 'ID du client (ex: c1, c2, c3…)' },
          phase: {
            type: 'string',
            enum: ['preproduction', 'production', 'postproduction', 'livraison'],
            description: 'Phase de départ',
          },
          deliveryDate: { type: 'string', description: 'Date de livraison (ex: "30 juin")' },
        },
        required: ['name', 'clientId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_event',
      description: 'Crée un événement dans le calendrier.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Titre de l\'événement' },
          eventTypeId: {
            type: 'string',
            enum: ['reunion', 'tournage', 'livraison', 'deadline', 'montage'],
            description: 'Type d\'événement',
          },
          start: { type: 'string', description: 'Date/heure ISO de début (ex: 2026-06-25T10:00)' },
          end: { type: 'string', description: 'Date/heure ISO de fin (ex: 2026-06-25T11:00)' },
          projectId: { type: 'string', description: 'ID du projet associé (optionnel)' },
          location: { type: 'string', description: 'Lieu (optionnel)' },
        },
        required: ['title', 'eventTypeId', 'start', 'end'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_resource',
      description: 'Crée une ressource (scénario, document, révision vidéo, etc.) dans un projet.',
      parameters: {
        type: 'object',
        properties: {
          projectId: { type: 'string', description: 'ID du projet' },
          type: {
            type: 'string',
            enum: ['screenplay', 'document', 'video_review', 'moodboard', 'checklist', 'form', 'web_review'],
            description: 'Type de ressource',
          },
          title: { type: 'string', description: 'Titre de la ressource' },
        },
        required: ['projectId', 'type', 'title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'navigate',
      description: 'Navigue vers une page de la plateforme.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Chemin (ex: /, /projets, /projets/pj1, /projets/pj1/ressources, /clients, /taches, /calendrier)',
          },
        },
        required: ['path'],
      },
    },
  },
];

// ── Prompt système ────────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  const projects = getProjects();
  const clientList = CLIENTS.map(c => `  ${c.id}: "${c.name}" (${c.sector}, ${c.city})`).join('\n');
  const projectList = projects.map(p => `  ${p.id}: "${p.name}" — client: ${p.clientName}, statut: ${p.statusLabel}, phase: ${p.phaseLabel}`).join('\n');

  return `Tu es Rush Assistant, un assistant IA intégré à Rush, une plateforme de gestion de production vidéo et créative. Tu parles directement avec un membre de l'équipe.

RÈGLES ABSOLUES — respecte-les sans exception :
1. Réponds TOUJOURS en français naturel et conversationnel. Parle comme un collègue compétent et chaleureux, pas comme un robot.
2. N'affiche JAMAIS de JSON, de code, de schéma d'outils, ou de structure technique dans tes réponses. Jamais. Si tu veux mentionner un identifiant, écris-le en prose : "le projet Campagne Été", pas {"id": "pj1"}.
3. N'explique JAMAIS comment tu fonctionnes, quels outils tu as, ou ce que tu vas "appeler". L'utilisateur ne veut pas voir les coulisses.
4. Sois **conversationnel** : pose des questions de suivi, reformule pour confirmer que tu as bien compris, propose des options si c'est ambigu.
5. AVANT de créer ou modifier quelque chose (projet, événement, ressource), résume en une phrase ce que tu vas faire et demande : "Je fais ça ?" ou "Tu confirmes ?" Attends le oui avant d'agir.
6. Pour les lectures (lister projets, clients, tâches), agis directement puis présente les résultats de façon lisible — pas en tableau JSON, mais en texte clair avec des tirets ou du gras.
7. Garde tes réponses courtes sauf si l'utilisateur demande des détails.
8. Si l'utilisateur te salue (bonjour, allo, salut, hey, hi…) ou semble hésiter (ex: "euh", "hmm", "je sais pas", "qu'est-ce que tu peux faire"), réponds chaleureusement et propose des exemples concrets regroupés par thème avec des puces et des verbes d'action. Voici les catégories à suggérer :
   - **Projets** : créer un nouveau projet pour un client, lister les projets actifs, voir l'avancement
   - **Calendrier** : créer un tournage, une réunion ou une deadline, consulter les événements à venir
   - **Tâches** : lister les tâches en retard, voir ce qui est en cours, filtrer par statut
   - **Clients** : lister les clients actifs, voir leurs projets associés
   - **Ressources** : créer un scénario, une révision vidéo ou un document dans un projet
   - **Navigation** : aller directement à n'importe quelle section de la plateforme

CONTEXTE DE LA PLATEFORME (pour toi uniquement, ne le récite pas mot pour mot) :
Date : ${new Date().toLocaleDateString('fr-CA')}

Clients :
${clientList}

Projets actifs :
${projectList}`;
}

// ── Exécution des outils ──────────────────────────────────────────────────────

function executeTool(
  name: string,
  args: Record<string, any>,
  navigate: (path: string) => void
): string {
  try {
    switch (name) {
      case 'list_projects': {
        const projects = getProjects();
        if (!projects.length) return 'Aucun projet trouvé.';
        return projects.map(p =>
          `• [${p.id}] ${p.name} — ${p.clientName} | ${p.statusLabel} | ${p.phaseLabel} | ${p.progress}%`
        ).join('\n');
      }

      case 'list_clients': {
        return CLIENTS.map(c =>
          `• [${c.id}] ${c.name} — ${c.sector}, ${c.city} | ${c.statusLabel} | ${c.activeProjects} projet(s) actif(s)`
        ).join('\n');
      }

      case 'list_tasks': {
        let tasks = [...MY_TASKS];
        if (args.status) tasks = tasks.filter((t: any) => t.status === args.status);
        if (!tasks.length) return 'Aucune tâche trouvée.';
        return tasks.map((t: any) =>
          `• ${t.title} — ${t.projectName} | ${t.statusLabel} | ${t.priorityLabel} | échéance: ${t.dueDate}`
        ).join('\n');
      }

      case 'create_project': {
        const client = CLIENTS.find(c => c.id === args.clientId);
        if (!client) {
          return `Client "${args.clientId}" introuvable. IDs disponibles: ${CLIENTS.map(c => `${c.id} (${c.name})`).join(', ')}`;
        }
        const phaseMap: Record<string, string> = {
          preproduction: 'Préproduction', production: 'Production',
          postproduction: 'Postproduction', livraison: 'Livraison',
        };
        const phase = (args.phase || 'preproduction') as Phase;
        const project: Project = {
          id: `pj${Date.now()}`,
          name: args.name,
          clientId: client.id,
          clientName: client.name,
          clientColor: client.avatarColor,
          phase,
          phaseLabel: phaseMap[phase] ?? 'Préproduction',
          progress: 0,
          taskCount: 0,
          deliverableCount: 0,
          members: [],
          deliveryDate: args.deliveryDate ?? 'À définir',
          status: 'info',
          statusLabel: 'En cours',
          modifiedAt: new Date().toISOString(),
        };
        addProject(project);
        setTimeout(() => navigate(`/projets/${project.id}`), 600);
        return `Projet "${project.name}" créé (ID: ${project.id}) pour ${client.name}. Navigation vers le projet…`;
      }

      case 'create_event': {
        const ev = addEvent({
          title: args.title,
          eventTypeId: args.eventTypeId ?? 'reunion',
          start: args.start,
          end: args.end ?? args.start,
          projectId: args.projectId,
          location: args.location,
        });
        return `Événement "${ev.title}" créé le ${args.start}${args.location ? ` à ${args.location}` : ''}.`;
      }

      case 'create_resource': {
        const eyebrowMap: Record<string, string> = {
          screenplay: 'SCÉNARISATION', document: 'DOCUMENT', video_review: 'RÉVISION',
          moodboard: 'MOODBOARD', checklist: 'CHECKLIST', form: 'FORMULAIRE', web_review: 'SITE WEB',
        };
        const res = {
          id: `r${Date.now()}`,
          type: args.type as ResourceType,
          eyebrow: eyebrowMap[args.type] ?? 'RESSOURCE',
          title: args.title,
          status: 'warn' as const,
          statusLabel: 'À faire',
          meta: 'Créé à l\'instant',
          version: 'V1',
        };
        addResource(res);
        setTimeout(() => navigate(`/projets/${args.projectId}/ressources/${res.id}`), 600);
        return `Ressource "${args.title}" (${args.type}) créée dans le projet ${args.projectId}. Navigation…`;
      }

      case 'navigate': {
        navigate(args.path);
        return `Navigation vers "${args.path}".`;
      }

      default:
        return `Outil inconnu: ${name}`;
    }
  } catch (e: any) {
    return `Erreur lors de l'exécution: ${e?.message ?? e}`;
  }
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

function renderMarkdown(text: string): React.ReactNode[] {
  // Split on fenced code blocks first
  const segments = text.split(/(```[\s\S]*?```)/g);
  const nodes: React.ReactNode[] = [];

  segments.forEach((seg, si) => {
    if (seg.startsWith('```')) {
      // Strip fence markers and optional language tag
      const inner = seg.replace(/^```[^\n]*\n?/, '').replace(/```$/, '').trim();
      nodes.push(
        <pre key={`code-${si}`} style={{
          background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '8px 11px', margin: '6px 0',
          fontFamily: 'var(--ff-mono)', fontSize: 11, lineHeight: 1.6,
          overflowX: 'auto', whiteSpace: 'pre-wrap', color: 'var(--text-2)',
        }}>
          {inner}
        </pre>
      );
      return;
    }

    const lines = seg.split('\n');
    let listItems: string[] = [];

    const flushList = (key: string) => {
      if (listItems.length) {
        nodes.push(
          <ul key={key} style={{ paddingLeft: 16, margin: '4px 0', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {listItems.map((li, i) => <li key={i} style={{ listStyle: 'disc', paddingLeft: 2 }}>{inlineMarkdown(li)}</li>)}
          </ul>
        );
        listItems = [];
      }
    };

    lines.forEach((line, i) => {
      const key = `${si}-${i}`;
      if (/^#{1,3}\s/.test(line)) {
        flushList(key + 'l');
        nodes.push(<p key={key} style={{ fontWeight: 700, fontSize: 13, marginTop: 8, marginBottom: 2 }}>{inlineMarkdown(line.replace(/^#{1,3}\s/, ''))}</p>);
      } else if (/^[-*]\s/.test(line)) {
        listItems.push(line.replace(/^[-*]\s/, ''));
      } else if (line.trim() === '') {
        flushList(key + 'l');
        if (nodes.length > 0) nodes.push(<div key={key} style={{ height: 5 }} />);
      } else {
        flushList(key + 'l');
        nodes.push(<p key={key} style={{ margin: 0 }}>{inlineMarkdown(line)}</p>);
      }
    });
    flushList(`${si}-end`);
  });

  return nodes;
}

function inlineMarkdown(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return parts.map((part, i) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (/^\*[^*]+\*$/.test(part)) return <em key={i}>{part.slice(1, -1)}</em>;
    if (/^`[^`]+`$/.test(part)) return (
      <code key={i} style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: 4, fontFamily: 'var(--ff-mono)', fontSize: 11 }}>
        {part.slice(1, -1)}
      </code>
    );
    return part;
  });
}

// ── Speech Recognition ───────────────────────────────────────────────────────

const SpeechRecognitionAPI =
  (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;

// ── Composant principal ───────────────────────────────────────────────────────

export function AIChat() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [speechLang, setSpeechLang] = useState(() => defaultSpeechLang(i18n.language));
  const [autoSend, setAutoSend] = useState(false);
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recognitionRef = useRef<any>(null);

  const LANGS = [
    { id: 'fr-FR', label: 'Français' },
    { id: 'en-US', label: 'English (US)' },
    { id: 'en-GB', label: 'English (UK)' },
    { id: 'es-ES', label: 'Español' },
  ];

  const SUGGESTIONS = [
    t('ai.suggestionOverdueProjects'),
    t('ai.suggestionCreateShoot'),
    t('ai.suggestionListClients'),
    t('ai.suggestionCreateProject'),
  ];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (open && textareaRef.current) textareaRef.current.focus();
  }, [open]);

  // Raccourci micro — lu depuis shortcutsStore
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (matchesShortcutFn(e, getShortcutsFn().ai_mic)) {
        e.preventDefault();
        toggleListening();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [open, listening, speechLang]);

  // rAF-batched: dictation fires onresult many times per second while
  // actively speaking, each one calling setInput — without batching, every
  // single one forces its own synchronous layout (autoResize reads
  // scrollHeight right after resetting height), which under a burst of
  // rapid updates can visibly fall behind and only catch up once results
  // stop coming in (i.e. right when the user stops talking). Coalescing to
  // once per animation frame keeps growth visibly continuous instead.
  useEffect(() => {
    const raf = requestAnimationFrame(autoResize);
    return () => cancelAnimationFrame(raf);
  }, [input]);

  const toggleListening = () => {
    if (!SpeechRecognitionAPI) {
      alert(t('ai.speechUnsupported'));
      return;
    }

    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = speechLang;
    recognition.continuous = true;
    recognition.interimResults = true;

    // Preserve text already in the input before dictation starts
    const baseText = (textareaRef.current?.value ?? '').trimEnd();
    let spokenFinal = '';

    recognition.onstart = () => setListening(true);

    recognition.onresult = (e: any) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const chunk = e.results[i][0].transcript;
        if (e.results[i].isFinal) spokenFinal += chunk;
        else interim = chunk;
      }
      const prefix = baseText ? baseText + ' ' : '';
      setInput(prefix + spokenFinal + interim);
      // Resize is already handled by the rAF-batched effect on `input` —
      // no need to also schedule it here.
    };

    recognition.onend = () => {
      setListening(false);
      if (spokenFinal.trim() && autoSend) {
        const prefix = baseText ? baseText + ' ' : '';
        setTimeout(() => send((prefix + spokenFinal).trim()), 400);
      }
    };

    recognition.onerror = (e: any) => {
      if (e.error !== 'no-speech') setListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  // Auto-resize textarea — also scrolls to the bottom on every resize so
  // the line currently being typed/dictated never ends up hidden above or
  // below the visible area once the text exceeds the max height.
  const autoResize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.max(60, Math.min(el.scrollHeight, 400)) + 'px';
    el.scrollTop = el.scrollHeight;
  };

  const send = async (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || loading) return;

    const userMsg: ChatMessage = { role: 'user', content };
    const allMessages = [...messages, userMsg];
    setMessages(allMessages);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setLoading(true);

    if (isDemoSession()) {
      setMessages(prev => [...prev, { role: 'assistant', content: t('ai.demoNotice') }]);
      setLoading(false);
      return;
    }

    // Build API payload (strip display-only fields)
    let apiMsgs = [
      { role: 'system', content: buildSystemPrompt() },
      ...allMessages.map(m => ({
        role: m.role,
        content: m.content,
        ...(m.name ? { name: m.name } : {}),
        ...(m.toolUseId ? { toolUseId: m.toolUseId } : {}),
        ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
      })),
    ];

    let displayMsgs = [...allMessages];

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('no_session');

      // Agentic loop — keep going until we get a text response
      while (true) {
        const resp = await fetch('/api/ai-chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ messages: apiMsgs, tools: TOOLS, studioId: await getStudioId() }),
        });

        if (!resp.ok) {
          const errBody = await resp.json().catch(() => ({}));
          if (resp.status === 403) throw new Error('plan_gated');
          if (resp.status === 429) {
            setQuota({ used: errBody.used, limit: errBody.limit });
            throw new Error('quota_exceeded');
          }
          throw new Error(`HTTP ${resp.status}`);
        }
        const data = await resp.json();
        const msg = data.message as ChatMessage;
        if (data.usage) setQuota(data.usage);

        apiMsgs.push({ role: msg.role, content: msg.content ?? '', ...(msg.tool_calls ? { tool_calls: msg.tool_calls } : {}) });

        if (msg.tool_calls && msg.tool_calls.length > 0) {
          for (const tc of msg.tool_calls) {
            const toolName = tc.function.name;
            const toolArgs = typeof tc.function.arguments === 'string'
              ? JSON.parse(tc.function.arguments)
              : tc.function.arguments;

            const result = executeTool(toolName, toolArgs, navigate);

            // Tool result for API
            apiMsgs.push({ role: 'tool', content: result, name: toolName, toolUseId: tc.id });

            // Show in UI
            const toolMsg: ChatMessage = { role: 'tool', content: result, name: toolName, toolUseId: tc.id, _toolLabel: toolName };
            displayMsgs = [...displayMsgs, toolMsg];
            setMessages([...displayMsgs]);
          }
          // Continue loop to get final text response
        } else {
          // Final text response
          const final: ChatMessage = { role: 'assistant', content: msg.content ?? '' };
          displayMsgs = [...displayMsgs, final];
          setMessages([...displayMsgs]);
          break;
        }
      }
    } catch (e: any) {
      const key = e?.message === 'plan_gated' ? 'ai.planRequired'
        : e?.message === 'quota_exceeded' ? 'ai.quotaExceeded'
        : 'ai.assistantError';
      const errMsg: ChatMessage = { role: 'assistant', content: t(key) };
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  };

  const plan = usePlan();
  const toggle = useCallback(() => {
    setOpen(o => {
      if (o) return false; // always allow closing
      if (!canUseFeature(plan, 'ai')) {
        requestUpgrade({ feature: 'ai' });
        return false;
      }
      return true;
    });
  }, [plan]);
  const close  = useCallback(() => setOpen(false), []);
  useEffect(() => {
    registerAIToggle(toggle);
    return () => registerAIToggle(() => {});
  }, [toggle]);
  useEffect(() => {
    registerAIClose(close);
    return () => registerAIClose(() => {});
  }, [close]);

  return (
    <>
      {/* Panel */}
      {open && (
        <div data-ai-panel style={{
          position: 'fixed', right: 0, top: 0, bottom: 0, zIndex: 89,
          width: 380,
          background: 'var(--surface)',
          borderLeft: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          boxShadow: '-12px 0 40px rgba(0,0,0,0.5)',
        }}>
          {/* Header */}
          <div style={{
            flexShrink: 0, padding: '13px 16px',
            borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
              background: 'color-mix(in srgb, var(--accent) 12%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <SFIcon name="sparkles" size={14} color="var(--accent)" />
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{t('ai.title')}</p>
              <p style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', letterSpacing: '0.06em' }}>
                CLAUDE HAIKU
              </p>
            </div>
            {messages.length > 0 && (
              <button
                onClick={() => setMessages([])}
                title={t('ai.clearConversation')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, borderRadius: 6, display: 'flex' }}
              >
                <SFIcon name="trash-2" size={13} />
              </button>
            )}
            <button
              onClick={() => setShowSettings(s => !s)}
              title={t('ai.settings')}
              style={{
                background: showSettings ? 'var(--surface-3)' : 'none',
                border: 'none', cursor: 'pointer',
                color: showSettings ? 'var(--text)' : 'var(--text-3)',
                padding: 4, borderRadius: 6, display: 'flex',
                transition: 'background 0.12s, color 0.12s',
              }}
            >
              <SFIcon name="settings" size={14} />
            </button>
            <button
              onClick={() => setOpen(false)}
              title={t('ai.close')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, borderRadius: 6, display: 'flex', transition: 'color 0.12s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
            >
              <SFIcon name="x" size={15} />
            </button>
          </div>

          {/* Settings panel */}
          {showSettings && (
            <div style={{
              flexShrink: 0,
              borderBottom: '1px solid var(--border)',
              background: 'var(--surface-2)',
              padding: '14px 16px',
              display: 'flex', flexDirection: 'column', gap: 14,
            }}>
              {/* Usage quota */}
              {quota && (
                <div>
                  <p style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', letterSpacing: '0.06em', marginBottom: 8 }}>{t('ai.usageThisMonth')}</p>
                  <p style={{ fontSize: 12, color: 'var(--text-2)' }}>{t('ai.usageCount', { used: quota.used, limit: quota.limit })}</p>
                </div>
              )}

              {/* Voice language */}
              <div>
                <p style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', letterSpacing: '0.06em', marginBottom: 8 }}>{t('ai.voiceLanguage')}</p>
                <div style={{ display: 'flex', gap: 6 }}>
                  {LANGS.map(l => (
                    <button
                      key={l.id}
                      onClick={() => setSpeechLang(l.id)}
                      style={{
                        fontSize: 11, padding: '4px 10px', borderRadius: 7, cursor: 'pointer',
                        fontFamily: 'var(--ff-text)',
                        background: speechLang === l.id ? 'var(--accent)' : 'var(--surface-3)',
                        color: speechLang === l.id ? '#0a0a00' : 'var(--text-2)',
                        border: speechLang === l.id ? 'none' : '1px solid var(--border)',
                        fontWeight: speechLang === l.id ? 600 : 400,
                        transition: 'background 0.12s',
                      }}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Auto-send */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: 12, color: 'var(--text-2)', fontWeight: 500 }}>{t('ai.autoSend')}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{t('ai.autoSendDesc')}</p>
                </div>
                <button
                  onClick={() => setAutoSend(a => !a)}
                  style={{
                    width: 36, height: 20, borderRadius: 10, flexShrink: 0,
                    background: autoSend ? 'var(--accent)' : 'var(--surface-3)',
                    border: autoSend ? 'none' : '1px solid var(--border-2)',
                    cursor: 'pointer', position: 'relative',
                    transition: 'background 0.2s',
                  }}
                >
                  <span style={{
                    position: 'absolute', top: 2,
                    left: autoSend ? 18 : 2,
                    width: 16, height: 16, borderRadius: '50%',
                    background: autoSend ? '#0a0a00' : 'var(--text-3)',
                    transition: 'left 0.2s',
                  }} />
                </button>
              </div>
            </div>
          )}

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.length === 0 ? (
              <div style={{ padding: '32px 8px', textAlign: 'center' }}>
                <div style={{
                  width: 48, height: 48, borderRadius: '50%', margin: '0 auto 14px',
                  background: 'color-mix(in srgb, var(--accent) 10%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--accent) 25%, transparent)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <SFIcon name="sparkles" size={22} color="var(--accent)" />
                </div>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>{t('ai.emptyTitle')}</p>
                <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 20 }}>
                  {t('ai.emptyDesc')}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {SUGGESTIONS.map(s => (
                    <button
                      key={s}
                      onClick={() => send(s)}
                      style={{
                        background: 'var(--surface-2)', border: '1px solid var(--border)',
                        borderRadius: 9, padding: '8px 13px', cursor: 'pointer',
                        fontSize: 12, color: 'var(--text-2)', textAlign: 'left',
                        fontFamily: 'var(--ff-text)', transition: 'border-color 0.12s',
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((msg, i) => {
                if (msg.role === 'tool') {
                  return (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '5px 10px', borderRadius: 7,
                      background: 'color-mix(in srgb, var(--accent) 6%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--accent) 20%, transparent)',
                      fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)',
                    }}>
                      <SFIcon name="zap" size={10} color="var(--accent)" />
                      <span style={{ color: 'var(--accent)' }}>{msg._toolLabel}</span>
                      <span>{t('ai.toolExecuted')}</span>
                    </div>
                  );
                }

                const isUser = msg.role === 'user';
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start' }}>
                    <div style={{
                      maxWidth: '88%',
                      padding: '9px 13px',
                      borderRadius: isUser ? '14px 14px 4px 14px' : '4px 14px 14px 14px',
                      background: isUser ? 'var(--accent)' : 'var(--surface-2)',
                      color: isUser ? '#0a0a00' : 'var(--text)',
                      fontSize: 13, lineHeight: 1.6,
                      border: isUser ? 'none' : '1px solid var(--border)',
                    }}>
                      {isUser ? msg.content : renderMarkdown(msg.content)}
                    </div>
                  </div>
                );
              })
            )}

            {loading && (
              <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                <div style={{
                  padding: '10px 14px', borderRadius: '4px 14px 14px 14px',
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  display: 'flex', gap: 5, alignItems: 'center',
                }}>
                  {[0, 1, 2].map(n => (
                    <div key={n} style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: 'var(--text-3)',
                      animation: `ai-dot 1.2s ${n * 0.2}s ease-in-out infinite`,
                    }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ flexShrink: 0, padding: '12px 14px', borderTop: '1px solid var(--border)' }}>
            <div style={{
              display: 'flex', gap: 8, alignItems: 'flex-end',
              background: 'var(--surface-2)', border: '1px solid var(--border-2)',
              borderRadius: 13, padding: '8px 8px 8px 13px',
            }}>
              <textarea
                ref={textareaRef}
                value={input}
                onChange={e => { setInput(e.target.value); autoResize(); }}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
                }}
                placeholder={t('ai.placeholder')}
                rows={3}
                style={{
                  flex: 1, border: 'none', background: 'none', resize: 'none',
                  fontSize: 13, color: 'var(--text)', fontFamily: 'var(--ff-text)',
                  outline: 'none', lineHeight: 1.5, minHeight: 60, overflowY: 'auto',
                }}
              />
              <div style={{ position: 'relative', flexShrink: 0 }}>
                <button
                  onClick={toggleListening}
                  title={listening ? t('ai.stopListening') : t('ai.dictate')}
                  style={{
                    width: 30, height: 30, borderRadius: 9,
                    background: listening ? 'var(--accent)' : 'var(--surface-3)',
                    border: listening ? '1px solid var(--accent)' : '1px solid transparent',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transition: 'background 0.15s, border-color 0.15s',
                    animation: listening ? 'mic-pulse 1.4s ease-in-out infinite' : 'none',
                  }}
                >
                  <SFIcon name="mic" size={13} color={listening ? 'var(--on-accent)' : 'var(--text-3)'} />
                </button>
                <kbd style={{
                  position: 'absolute', bottom: -5, right: -5,
                  fontSize: 8, lineHeight: 1.3, padding: '0 3px',
                  borderRadius: 3, fontFamily: 'var(--ff-mono)', fontWeight: 700,
                  background: listening ? 'var(--on-accent)' : 'var(--surface-2)',
                  color: listening ? 'var(--accent)' : 'var(--text-3)',
                  border: `1px solid ${listening ? 'var(--accent)' : 'var(--border)'}`,
                  pointerEvents: 'none',
                }}>⌃M</kbd>
              </div>
              <button
                onClick={() => send()}
                disabled={!input.trim() || loading}
                style={{
                  width: 30, height: 30, borderRadius: 9, flexShrink: 0,
                  background: input.trim() && !loading ? 'var(--accent)' : 'var(--surface-3)',
                  border: 'none',
                  cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'background 0.12s',
                }}
              >
                <SFIcon name="send" size={13} color={input.trim() && !loading ? '#000' : 'var(--text-3)'} />
              </button>
            </div>
            <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 6, fontFamily: 'var(--ff-mono)', textAlign: 'center' }}>
              {t('ai.inputHint')}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
