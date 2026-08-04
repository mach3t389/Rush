import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { isDemoSession } from '../../data/authStore';
import { getStudioId } from '../../data/studioStore';
import { supabase } from '../../data/supabaseClient';
import { getProjects, addProject } from '../../data/projectStore';
import { addEvent } from '../../data/eventStore';
import { addResource } from '../../data/resourceStore';
import { addFile } from '../../data/fileStore';
import { CLIENTS, MY_TASKS } from '../../data/mock';
import type { Project, Phase, ResourceType } from '../../types';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ChatMessage {
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
            enum: ['screenplay', 'document', 'video_review', 'moodboard', 'form', 'web_review'],
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
          calendarEnabled: true,
          filesEnabled: true,
          financeEnabled: true,
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
          moodboard: 'MOODBOARD', form: 'FORMULAIRE', web_review: 'SITE WEB',
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
        // Also register it as a file item (same as FichiersGlobal.tsx's own
        // resource-creation flow) — addResource() alone doesn't make a
        // resource show up in the Fichiers browser, since that reads from
        // fileStore, not resourceStore.
        addFile({ name: args.title, type: 'resource', ext: 'res', parentFolderId: null, projectId: args.projectId, resourceId: res.id, resourceType: res.type });
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

export function renderMarkdown(text: string): React.ReactNode[] {
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

// ── Hook: useAIAgentChat ────────────────────────────────────────────────────

export function useAIAgentChat(navigate: (path: string) => void) {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const generationRef = useRef(0);

  const setMessagesBoth = useCallback((next: ChatMessage[]) => {
    messagesRef.current = next;
    setMessages(next);
  }, []);

  const send = useCallback(async (text: string) => {
    const content = text.trim();
    if (!content || loading) return;

    const myGeneration = generationRef.current;
    const userMsg: ChatMessage = { role: 'user', content };
    const currentMessages = [...messagesRef.current, userMsg];
    setMessagesBoth(currentMessages);
    setLoading(true);

    if (isDemoSession()) {
      if (generationRef.current === myGeneration) {
        setMessagesBoth([...currentMessages, { role: 'assistant', content: t('ai.demoNotice') }]);
      }
      setLoading(false);
      return;
    }

    let apiMsgs = [
      { role: 'system', content: buildSystemPrompt() },
      ...currentMessages.map(m => ({
        role: m.role,
        content: m.content,
        ...(m.name ? { name: m.name } : {}),
        ...(m.toolUseId ? { toolUseId: m.toolUseId } : {}),
        ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
      })),
    ];

    let displayMsgs = [...currentMessages];

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('no_session');

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

            apiMsgs.push({ role: 'tool', content: result, name: toolName, toolUseId: tc.id });

            const toolMsg: ChatMessage = { role: 'tool', content: result, name: toolName, toolUseId: tc.id, _toolLabel: toolName };
            displayMsgs = [...displayMsgs, toolMsg];
            if (generationRef.current !== myGeneration) return;
            setMessagesBoth([...displayMsgs]);
          }
        } else {
          const final: ChatMessage = { role: 'assistant', content: msg.content ?? '' };
          displayMsgs = [...displayMsgs, final];
          if (generationRef.current !== myGeneration) return;
          setMessagesBoth([...displayMsgs]);
          break;
        }
      }
    } catch (e: any) {
      const key = e?.message === 'plan_gated' ? 'ai.planRequired'
        : e?.message === 'quota_exceeded' ? 'ai.quotaExceeded'
        : 'ai.assistantError';
      const errMsg: ChatMessage = { role: 'assistant', content: t(key) };
      if (generationRef.current === myGeneration) {
        setMessagesBoth([...messagesRef.current, errMsg]);
      }
    } finally {
      setLoading(false);
    }
  }, [loading, navigate, t, setMessagesBoth]);

  const clear = useCallback(() => {
    generationRef.current++;
    messagesRef.current = [];
    setMessages([]);
  }, []);

  return { messages, loading, quota, send, clear };
}
