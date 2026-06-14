import type { User, Client, Project, Task, Resource, VideoComment, VideoCorrection, VideoVersion, AppNotification, ActivityItem } from '../types';

// ── Users ─────────────────────────────────────────────────────────────────────
export const USERS: Record<string, User> = {
  lea:    { id: 'lea',    name: 'Léa Marchand',   initials: 'LM', avatarColor: '#5c3d8f', role: 'Admin' },
  sarah:  { id: 'sarah',  name: 'Sarah Martin',    initials: 'SM', avatarColor: '#3b4f8f', role: 'Dir. créative' },
  thomas: { id: 'thomas', name: 'Thomas Robert',   initials: 'TR', avatarColor: '#5c3d8f', role: 'Chef de projet' },
  julie:  { id: 'julie',  name: 'Julie Bernard',   initials: 'JB', avatarColor: '#1a6b4a', role: 'Monteuse' },
  marc:   { id: 'marc',   name: 'Marc Dufour',     initials: 'MD', avatarColor: '#7d4e57', role: 'Producteur' },
  marie:  { id: 'marie',  name: 'Marie Lefebvre',  initials: 'ML', avatarColor: '#5c3d8f', role: 'Cliente' },
};

// ── Clients ───────────────────────────────────────────────────────────────────
export const CLIENTS: Client[] = [
  { id: 'c1', name: 'Nova Films',       initials: 'NF', avatarColor: '#3b4f8f', sector: 'Publicité',      city: 'Paris',     activeProjects: 4, pendingDeliverables: 2, since: '2023', progress: 72, status: 'ok',      statusLabel: 'Actif',    lastActivity: 'Il y a 2h' },
  { id: 'c2', name: 'Studio Bleu',      initials: 'SB', avatarColor: '#1a6b4a', sector: 'Documentaire',   city: 'Montréal',  activeProjects: 2, pendingDeliverables: 1, since: '2022', progress: 45, status: 'ok',      statusLabel: 'Actif',    lastActivity: 'Il y a 5h' },
  { id: 'c3', name: 'Fondation Lumière',initials: 'FL', avatarColor: '#4a3428', sector: 'Social',         city: 'Lyon',      activeProjects: 1, pendingDeliverables: 0, since: '2024', progress: 60, status: 'warn',    statusLabel: 'En pause', lastActivity: 'Il y a 3j' },
  { id: 'c4', name: 'Maison Leroux',    initials: 'ML', avatarColor: '#2d5a7d', sector: 'Institutionnel', city: 'Bordeaux',  activeProjects: 1, pendingDeliverables: 1, since: '2023', progress: 80, status: 'ok',      statusLabel: 'Actif',    lastActivity: 'Hier' },
  { id: 'c5', name: 'Collectif Ondes',  initials: 'CO', avatarColor: '#7d4e57', sector: 'Clip musical',   city: 'Paris',     activeProjects: 1, pendingDeliverables: 0, since: '2024', progress: 45, status: 'ok',      statusLabel: 'Actif',    lastActivity: 'Il y a 2j' },
  { id: 'c6', name: 'Agence Vertigo',   initials: 'AV', avatarColor: '#3d3d30', sector: 'Motion design',  city: 'Paris',     activeProjects: 0, pendingDeliverables: 0, since: '2025', progress: 0,  status: 'neutral', statusLabel: 'Inactif',  lastActivity: 'Il y a 1 sem.' },
];

// ── Projects ──────────────────────────────────────────────────────────────────
export const PROJECTS: Project[] = [
  { id: 'pj1', name: 'Campagne Été 2025',     clientId: 'c1', clientName: 'Nova Films',       clientColor: '#3b4f8f', phase: 'production',    phaseLabel: 'Production',    progress: 65, taskCount: 8,  deliverableCount: 3, members: [USERS.sarah, USERS.thomas, USERS.julie], deliveryDate: '15 juin', status: 'info',    statusLabel: 'En cours',         modifiedAt: 'Il y a 1h' },
  { id: 'pj2', name: 'Les Bâtisseurs',         clientId: 'c2', clientName: 'Studio Bleu',      clientColor: '#1a6b4a', phase: 'preproduction', phaseLabel: 'Préproduction', progress: 30, taskCount: 14, deliverableCount: 1, members: [USERS.julie, USERS.marc],           deliveryDate: '1 août',  status: 'info',    statusLabel: 'En cours',         modifiedAt: 'Il y a 3h' },
  { id: 'pj3', name: 'Film institutionnel 2025',clientId: 'c4', clientName: 'Maison Leroux',    clientColor: '#2d5a7d', phase: 'postproduction',phaseLabel: 'Postproduction',progress: 80, taskCount: 4,  deliverableCount: 2, members: [USERS.sarah, USERS.thomas],         deliveryDate: '20 juin', status: 'ok',      statusLabel: 'En avance',        modifiedAt: 'Hier' },
  { id: 'pj4', name: 'Clip Horizon',            clientId: 'c5', clientName: 'Collectif Ondes',  clientColor: '#7d4e57', phase: 'production',    phaseLabel: 'Production',    progress: 45, taskCount: 6,  deliverableCount: 1, members: [USERS.marc, USERS.julie, USERS.sarah],deliveryDate: '28 juin', status: 'danger',  statusLabel: 'En retard',        modifiedAt: 'Il y a 2h' },
  { id: 'pj5', name: 'Motion Design Pack',      clientId: 'c6', clientName: 'Agence Vertigo',   clientColor: '#3d3d30', phase: 'livraison',     phaseLabel: 'Livraison',     progress: 92, taskCount: 2,  deliverableCount: 1, members: [USERS.thomas],              deliveryDate: '12 juin', status: 'warn',    statusLabel: 'En attente client',modifiedAt: 'Il y a 4h' },
  { id: 'pj6', name: 'Brand Film Q4',           clientId: 'c2', clientName: 'Studio Bleu',      clientColor: '#1a6b4a', phase: 'livraison',     phaseLabel: 'Livraison',     progress: 100,taskCount: 0,  deliverableCount: 5, members: [USERS.sarah, USERS.julie],          deliveryDate: 'Déc 2024',status: 'neutral', statusLabel: 'Complété',         modifiedAt: 'Il y a 2 sem.' },
];

// ── My Tasks ──────────────────────────────────────────────────────────────────
export const MY_TASKS: Task[] = [
  { id: 'u1', title: 'Révision finale scénario V3 — Dialogues principaux', projectId:'pj1', projectName:'Nova Films',     projectColor:'#3b4f8f', assignee:USERS.lea, status:'danger', statusLabel:'En retard', priority:'high',   priorityLabel:'Élevée',  dueDate:'Hier',          dueDateRed:true,  checked:false },
  { id: 'u2', title: 'Validation maquettes graphiques motion design',        projectId:'pj5', projectName:'Studio Intern',  projectColor:'#5c3d8f', assignee:USERS.lea, status:'info',   statusLabel:'En cours',  priority:'high',   priorityLabel:'Élevée',  dueDate:"Aujourd'hui",   dueDateRed:false, checked:false },
  { id: 'h1', title: 'Préparation liste équipement tournage jour 1',         projectId:'pj1', projectName:'Nova Films',     projectColor:'#3b4f8f', assignee:USERS.lea, status:'warn',   statusLabel:'En attente',priority:'high',   priorityLabel:'Élevée',  dueDate:'Demain',        dueDateRed:false, checked:false },
  { id: 'h2', title: 'Brief créatif documentaire "Les Bâtisseurs"',           projectId:'pj2', projectName:'Studio Lumière', projectColor:'#5c3d8f', assignee:USERS.lea, status:'info',   statusLabel:'En cours',  priority:'high',   priorityLabel:'Élevée',  dueDate:'12 juin',       dueDateRed:false, checked:false },
  { id: 'h3', title: 'Appel de confirmation client avant tournage',           projectId:'pj4', projectName:'Maison Leroux',  projectColor:'#1a6b4a', assignee:USERS.lea, status:'warn',   statusLabel:'En attente',priority:'high',   priorityLabel:'Élevée',  dueDate:'13 juin',       dueDateRed:false, checked:false },
  { id: 'h4', title: 'Envoi devis production clip musical',                   projectId:'pj5', projectName:'Collectif Ondes',projectColor:'#7d4e57', assignee:USERS.lea, status:'info',   statusLabel:'En cours',  priority:'high',   priorityLabel:'Élevée',  dueDate:'14 juin',       dueDateRed:false, checked:false },
  { id: 'n1', title: 'Archiver les projets terminés Q1 2025',                 projectId:'int', projectName:'Studio interne', projectColor:'#404040', assignee:USERS.lea, status:'ok',     statusLabel:'Complété',  priority:'normal', priorityLabel:'Normale', dueDate:'8 juin',        dueDateRed:false, checked:true  },
  { id: 'n2', title: 'Mettre à jour la grille tarifaire 2025',                projectId:'int', projectName:'Studio interne', projectColor:'#404040', assignee:USERS.lea, status:'warn',   statusLabel:'En attente',priority:'normal', priorityLabel:'Normale', dueDate:'20 juin',       dueDateRed:false, checked:false },
  { id: 'n3', title: 'Vérifier licences musicales clip Collectif Ondes',      projectId:'pj4', projectName:'Collectif Ondes',projectColor:'#7d4e57', assignee:USERS.lea, status:'warn',   statusLabel:'En attente',priority:'normal', priorityLabel:'Normale', dueDate:'18 juin',       dueDateRed:false, checked:false },
  { id: 'n4', title: 'Commander batteries Li-Ion pour le tournage J2',        projectId:'pj1', projectName:'Nova Films',     projectColor:'#3b4f8f', assignee:USERS.lea, status:'warn',   statusLabel:'En attente',priority:'normal', priorityLabel:'Normale', dueDate:'16 juin',       dueDateRed:false, checked:false },
  { id: 'n5', title: 'Planifier la réunion de post-production',               projectId:'pj2', projectName:'Studio Lumière', projectColor:'#5c3d8f', assignee:USERS.lea, status:'warn',   statusLabel:'En attente',priority:'normal', priorityLabel:'Normale', dueDate:'22 juin',       dueDateRed:false, checked:false },
  { id: 'n6', title: 'Rédiger le rapport de fin de projet Maison Leroux',     projectId:'pj3', projectName:'Maison Leroux',  projectColor:'#1a6b4a', assignee:USERS.lea, status:'warn',   statusLabel:'En attente',priority:'normal', priorityLabel:'Normale', dueDate:'25 juin',       dueDateRed:false, checked:false },
  { id: 'l1', title: 'Organiser les archives des fichiers source Q1 2025',    projectId:'int', projectName:'Studio interne', projectColor:'#404040', assignee:USERS.lea, status:'warn',   statusLabel:'En attente',priority:'low',    priorityLabel:'Basse',   dueDate:'30 juin',       dueDateRed:false, checked:false },
  { id: 'l2', title: 'Mettre à jour les modèles de contrats',                 projectId:'int', projectName:'Studio interne', projectColor:'#404040', assignee:USERS.lea, status:'warn',   statusLabel:'En attente',priority:'low',    priorityLabel:'Basse',   dueDate:'15 juil.',      dueDateRed:false, checked:false },
];

// ── Project Tasks (Vue Travail) ───────────────────────────────────────────────
export const PROJECT_TASKS: Record<string, { label: string; progress: number; tasks: Task[] }[]> = {
  pj1: [
    {
      label: 'Préproduction', progress: 75,
      tasks: [
        { id:'p1', title:'Analyse du brief client et validation des objectifs', projectId:'pj1', projectName:'Campagne Été 2025', projectColor:'#3b4f8f', assignee:USERS.sarah,  status:'ok',     statusLabel:'Complété',  priority:'normal', priorityLabel:'Normale', dueDate:'3 mai',  checked:true,  subtasks:[] },
        { id:'p2', title:'Écriture du scénario V3',                             projectId:'pj1', projectName:'Campagne Été 2025', projectColor:'#3b4f8f', assignee:USERS.thomas, status:'info',   statusLabel:'En cours',  priority:'high',   priorityLabel:'Élevée',  dueDate:'10 mai', checked:false, activityCount:3,
          subtasks:[
            { id:'p2s1', title:'Révision des dialogues — Scènes 3 à 7', projectId:'pj1', projectName:'Campagne Été 2025', projectColor:'#3b4f8f', assignee:USERS.thomas, status:'warn', statusLabel:'En attente', priority:'high', priorityLabel:'Élevée', dueDate:'8 mai', checked:false, subtasks:[] },
          ]
        },
        { id:'p3', title:'Repérage des lieux de tournage',        projectId:'pj1', projectName:'Campagne Été 2025', projectColor:'#3b4f8f', assignee:USERS.julie, status:'ok',   statusLabel:'Complété',  priority:'normal', priorityLabel:'Normale', dueDate:'5 mai',  checked:true,  subtasks:[] },
        { id:'p4', title:'Casting acteurs principaux',             projectId:'pj1', projectName:'Campagne Été 2025', projectColor:'#3b4f8f', assignee:USERS.marc,  status:'warn', statusLabel:'En attente', priority:'high',  priorityLabel:'Élevée',  dueDate:'15 mai', checked:false, subtasks:[] },
      ]
    },
    {
      label: 'Production', progress: 40,
      tasks: [
        { id:'pr1', title:'Tournage jour 1 — Studio principal',          projectId:'pj1', projectName:'Campagne Été 2025', projectColor:'#3b4f8f', assignee:USERS.sarah,  status:'danger', statusLabel:'En retard', priority:'high',   priorityLabel:'Élevée',  dueDate:'8 mai',  checked:false, subtasks:[], activityCount:7 },
        { id:'pr2', title:'Tournage jour 2 — Extérieur centre-ville',    projectId:'pj1', projectName:'Campagne Été 2025', projectColor:'#3b4f8f', assignee:USERS.thomas, status:'info',   statusLabel:'En cours',  priority:'high',   priorityLabel:'Élevée',  dueDate:'12 mai', checked:false, subtasks:[], activityCount:1 },
      ]
    },
    {
      label: 'Postproduction', progress: 0,
      tasks: [
        { id:'pp1', title:'Assemblage rough cut',           projectId:'pj1', projectName:'Campagne Été 2025', projectColor:'#3b4f8f', assignee:USERS.julie, status:'warn', statusLabel:'En attente', priority:'normal', priorityLabel:'Normale', dueDate:'20 mai', checked:false, subtasks:[] },
        { id:'pp2', title:'Étalonnage colorimétrique',      projectId:'pj1', projectName:'Campagne Été 2025', projectColor:'#3b4f8f', assignee:USERS.marc,  status:'warn', statusLabel:'En attente', priority:'normal', priorityLabel:'Normale', dueDate:'25 mai', checked:false, subtasks:[] },
        { id:'pp3', title:'Mixage et design sonore',        projectId:'pj1', projectName:'Campagne Été 2025', projectColor:'#3b4f8f', assignee:USERS.sarah, status:'warn', statusLabel:'En attente', priority:'high',   priorityLabel:'Élevée',  dueDate:'28 mai', checked:false, subtasks:[] },
      ]
    },
    {
      label: 'Livraison', progress: 0,
      tasks: [
        { id:'l1', title:'Export H.264 + ProRes 4K',                   projectId:'pj1', projectName:'Campagne Été 2025', projectColor:'#3b4f8f', assignee:USERS.julie, status:'warn', statusLabel:'En attente', priority:'normal', priorityLabel:'Normale', dueDate:'1 juin', checked:false, subtasks:[] },
        { id:'l2', title:'Présentation finale client Nova Films',       projectId:'pj1', projectName:'Campagne Été 2025', projectColor:'#3b4f8f', assignee:USERS.marc,  status:'warn', statusLabel:'En attente', priority:'high',   priorityLabel:'Élevée',  dueDate:'5 juin', checked:false, subtasks:[] },
      ]
    },
  ],
};

// ── Resources ─────────────────────────────────────────────────────────────────
export const RESOURCES: Resource[] = [
  { id:'r1', type:'screenplay',  eyebrow:'SCÉNARISATION', title:'Scénario Campagne Été — V3',  status:'ok',      statusLabel:'Approuvé',    meta:'Modifié il y a 2h',  version:'V3' },
  { id:'r2', type:'video_review', eyebrow:'RÉVISION', title:'Rough Cut — Séquence 1',       status:'review',  statusLabel:'En révision', meta:'3 commentaires',     version:'V4', avatars:[{initials:'SM',bg:'#3b4f8f'},{initials:'TR',bg:'#5c3d8f'},{initials:'JB',bg:'#1a6b4a'}] },
  { id:'r3', type:'moodboard',   eyebrow:'MOODBOARD',    title:'Direction artistique',         status:'info',    statusLabel:'En cours',    meta:'14 références',      colors:['#2d3a4a','#4a3428','#2a3d30','#3d3042'] },
  { id:'r4', type:'document',    eyebrow:'DOCUMENT',     title:'Brief créatif client',         status:'ok',      statusLabel:'Validé',      meta:'PDF · 2.4 Mo' },
  { id:'r5', type:'checklist',   eyebrow:'CHECKLIST',    title:'Checklist tournage J1',        status:'info',    statusLabel:'En cours',    meta:'6/10 complétés',     progress:60 },
  { id:'r6', type:'inspirations',eyebrow:'INSPIRATIONS', title:'Références visuelles',         status:'neutral', statusLabel:'8 références', meta:'8 références',      colors:['#1e2d3d','#3d2a1e','#1e3d2d','#3d3d1e','#2d1e3d','#2a2a2a'], avatars:[{initials:'JT',bg:'#2d3748'}] },
  { id:'r7', type:'file',        eyebrow:'FICHIERS',       title:'Dossiers du projet',                   status:'neutral', statusLabel:'Fichiers',   meta:'12 fichiers' },
  { id:'r8', type:'form',        eyebrow:'FORMULAIRE',     title:'Questionnaire de satisfaction client',  status:'info',    statusLabel:'En cours', meta:'0 réponse' },
];

// ── Video Review ──────────────────────────────────────────────────────────────
export const VIDEO_COMMENTS: VideoComment[] = [
  { id:'c1', author:USERS.sarah,  timeSeconds:42,  timeLabel:'00:42', text:"L'intro est un peu longue — peut-on couper les 3 premières secondes ?", resolved:false },
  { id:'c2', author:USERS.thomas, timeSeconds:75,  timeLabel:'01:15', text:'Transition au plan 8 est parfaite. Je valide ce segment.',              resolved:false },
  { id:'c3', author:USERS.marc,   timeSeconds:128, timeLabel:'02:08', text:'Son trop fort sur le plan extérieur rue Saint-Denis.',                   resolved:true  },
  { id:'c4', author:USERS.julie,  timeSeconds:28,  timeLabel:'00:28', text:"La colorimétrie des plans intérieurs est exactement ce qu'on cherchait.", resolved:false },
  { id:'c5', author:USERS.sarah,  timeSeconds:114, timeLabel:'01:54', text:"Besoin d'une musique plus dynamique pour le final — trop mou.",          resolved:false },
  { id:'c6', author:USERS.thomas, timeSeconds:165, timeLabel:'02:45', text:'La voix off est claire, la prise est bonne.',                            resolved:false },
  { id:'c7', author:USERS.marc,   timeSeconds:190, timeLabel:'03:10', text:'Fin un peu abrupte, on peut ajouter un fondu au noir ?',                 resolved:true  },
  { id:'c8', author:USERS.julie,  timeSeconds:55,  timeLabel:'00:55', text:'Super travail sur les raccords de mouvement.',                           resolved:false },
];

export const VIDEO_CORRECTIONS: VideoCorrection[] = [
  { id:'cr1', num:'#1', label:"Couper l'intro de 3 secondes",             status:'info',   statusLabel:'En cours' },
  { id:'cr2', num:'#2', label:'Réduire niveau sonore plan extérieur',      status:'ok',     statusLabel:'Intégré'  },
  { id:'cr3', num:'#3', label:'Ajouter fondu au noir sur plan final',      status:'warn',   statusLabel:'À faire'  },
  { id:'cr4', num:'#4', label:'Révision colorimétrie plans de nuit',       status:'warn',   statusLabel:'À faire'  },
  { id:'cr5', num:'#5', label:'Ajuster tempo de la musique finale',        status:'info',   statusLabel:'En cours' },
];

export const VIDEO_VERSIONS: VideoVersion[] = [
  { v:'V1', status:'ok',     label:'Approuvé' },
  { v:'V2', status:'ok',     label:'Approuvé' },
  { v:'V3', status:'danger', label:'Corrections' },
  { v:'V4', status:'review', label:'En révision', active:true },
];

// ── Notifications ─────────────────────────────────────────────────────────────
export const NOTIFICATIONS: AppNotification[] = [
  { id:'n1', day:"Aujourd'hui", unread:true,  actor:USERS.marie,  text:'a approuvé la V4 de',                  bold:'Rough Cut — Nova Films', time:'Il y a 12 min', type:'APPROBATION',    typeStatus:'ok',     action:'Voir le livrable →' },
  { id:'n2', day:"Aujourd'hui", unread:true,  actor:USERS.thomas, text:'a uploadé une nouvelle version de',    bold:'Clip Automne',           time:'Il y a 1h',     type:'NOUVELLE VERSION',typeStatus:'info',   action:'Voir la version →' },
  { id:'n3', day:"Aujourd'hui", unread:true,  actor:USERS.marc,   text:'a laissé 2 commentaires sur',          bold:'V4 Rough Cut',           time:'Il y a 2h',     type:'COMMENTAIRE',    typeStatus:'review', action:'Voir les commentaires →' },
  { id:'n4', day:'Hier',        unread:false, actor:USERS.lea,    text:"t'a assigné la tâche",                 bold:'Révision scénario V3',   time:'Hier, 16:42',   type:'TÂCHE',          typeStatus:'info',   action:undefined },
  { id:'n5', day:'Hier',        unread:false, actor:USERS.marc,   text:'Budget Maison Leroux approuvé par',    bold:'Marc Dufour',            time:'Hier, 15:00',   type:'APPROBATION',    typeStatus:'ok',     action:undefined },
  { id:'n6', day:'Hier',        unread:false, actor:USERS.thomas, text:'Nouvelle version uploadée par Thomas sur', bold:'Les Bâtisseurs',     time:'Hier, 11:25',   type:'NOUVELLE VERSION',typeStatus:'info',  action:undefined },
  { id:'n7', day:'Hier',        unread:false, actor:USERS.sarah,  text:'a demandé des corrections sur',        bold:'Rough Cut V3',           time:'Hier, 09:00',   type:'CORRECTIONS',    typeStatus:'danger', action:undefined },
  { id:'n8', day:'Cette semaine',unread:false,actor:USERS.sarah,  text:'a accepté le devis pour',              bold:'Les Bâtisseurs',         time:'8 juin',        type:'CONTRAT',        typeStatus:'ok',     action:undefined },
  { id:'n9', day:'Cette semaine',unread:false,actor:USERS.julie,  text:'contrat signé pour',                   bold:'Clip Horizon',           time:'7 juin',        type:'CONTRAT',        typeStatus:'ok',     action:undefined },
];

// ── Activity Feed ─────────────────────────────────────────────────────────────
export const ACTIVITY: ActivityItem[] = [
  { id:'a1', day:"Aujourd'hui", type:'comment', actor:USERS.sarah,  action:'a commenté sur',            target:'Rough Cut — V4',              detail:'"L\'intro est un peu longue…"',      time:'Il y a 12 min' },
  { id:'a2', day:"Aujourd'hui", type:'upload',  actor:USERS.thomas, action:'a uploadé une nouvelle version', target:'Rough Cut — V4',             detail:'V4 · 03:28 · 2.1 Go',              time:'Il y a 2h' },
  { id:'a3', day:"Aujourd'hui", type:'task',    actor:USERS.julie,  action:'a complété la tâche',       target:'Repérage des lieux de tournage', detail:'Section Préproduction',             time:'Il y a 3h' },
  { id:'a4', day:'Hier',        type:'approve', actor:USERS.marc,   action:'a approuvé le document',    target:'Brief créatif client',          detail:'Document PDF · Validé',             time:'Hier, 16:42' },
  { id:'a5', day:'Hier',        type:'comment', actor:USERS.sarah,  action:'a créé une tâche depuis',   target:'Commentaire 00:42',             detail:"→ Couper l'intro de 3 secondes",    time:'Hier, 14:10' },
  { id:'a6', day:'Hier',        type:'upload',  actor:USERS.thomas, action:'a modifié',                 target:'Scénario Campagne Été — V3',    detail:'Révision dialogues scènes 3 à 7',   time:'Hier, 11:25' },
];

// ── Dashboard data ────────────────────────────────────────────────────────────
export const TODAY_TASKS = MY_TASKS.slice(0, 5);

export const PINNED_PROJECTS = [
  { id:'rp1', label:'Campagne Été 2025', client:'Nova Films',     color:'#3b4f8f' },
  { id:'rp2', label:'Les Bâtisseurs',    client:'Studio Bleu',    color:'#1a6b4a' },
  { id:'rp3', label:'Clip Horizon',      client:'Collectif Ondes',color:'#7d4e57' },
];
