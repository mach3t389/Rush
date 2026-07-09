import { useParams } from 'react-router-dom';
import { ProjectHeaderBar } from '../components/ProjectHeaderBar';
import { ActivityFeed, type FeedActivity } from '../components/ActivityFeed';
import { PROJECTS, USERS } from '../data/mock';
import { isDemoSession } from '../data/authStore';

export function getProjectActivities(projectId: string): FeedActivity[] {
  if (!isDemoSession()) return [];
  const project = PROJECTS.find(p => p.id === projectId);
  const color = project?.clientColor ?? '#5c3d8f';
  const name  = project?.name ?? '';
  return [
    { id:'pa1', day:"Aujourd'hui", type:'comment', actorName:'Sarah Martin',  actorInitials:'SM', actorColor:'#3b4f8f', action:'a commenté sur',             target:'Rough Cut — V4',                detail:'"L\'intro est un peu longue…"',   time:'Il y a 12 min', projectName:name, projectColor:color },
    { id:'pa2', day:"Aujourd'hui", type:'upload',  actorName:'Thomas Robert', actorInitials:'TR', actorColor:'#5c3d8f', action:'a uploadé une nouvelle version', target:'Rough Cut — V4',              detail:'V4 · 03:28 · 2.1 Go',           time:'Il y a 2h',     projectName:name, projectColor:color },
    { id:'pa3', day:"Aujourd'hui", type:'task',    actorName:'Julie Bernard', actorInitials:'JB', actorColor:'#1a6b4a', action:'a complété la tâche',          target:'Repérage des lieux de tournage', detail:'Section Préproduction',          time:'Il y a 3h',     projectName:name, projectColor:color },
    { id:'pa4', day:'Hier',        type:'approve', actorName:'Marc Dufour',   actorInitials:'MD', actorColor:'#7d4e57', action:'a approuvé le document',       target:'Brief créatif client',          detail:'Document PDF · Validé',          time:'Hier, 16:42',   projectName:name, projectColor:color },
    { id:'pa5', day:'Hier',        type:'comment', actorName:'Sarah Martin',  actorInitials:'SM', actorColor:'#3b4f8f', action:'a créé une tâche depuis',      target:'Commentaire 00:42',             detail:"→ Couper l'intro de 3 secondes", time:'Hier, 14:10',   projectName:name, projectColor:color },
    { id:'pa6', day:'Hier',        type:'upload',  actorName:'Thomas Robert', actorInitials:'TR', actorColor:'#5c3d8f', action:'a modifié',                    target:'Scénario — V3',                 detail:'Révision dialogues scènes 3 à 7',time:'Hier, 11:25',   projectName:name, projectColor:color },
    { id:'pa7', day:'Il y a 3 j',  type:'member',  actorName:USERS.lea.name,  actorInitials:'LM', actorColor:'#5c3d8f', action:'a ajouté',                     target:'Julie Bernard',                 detail:'Rôle : Monteuse',                time:'9 juin, 09:14', projectName:name, projectColor:color },
    { id:'pa8', day:'Il y a 1 sem',type:'task',    actorName:'Julie Bernard', actorInitials:'JB', actorColor:'#1a6b4a', action:'a créé la section',            target:'Postproduction',                detail:'4 tâches ajoutées',              time:'4 juin, 10:30', projectName:name, projectColor:color },
  ];
}

export function ProjectActivite() {
  const { projectId } = useParams<{ projectId: string }>();

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <ProjectHeaderBar projectId={projectId ?? ''} />
      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        <ActivityFeed activities={getProjectActivities(projectId ?? '')} />
      </div>
    </div>
  );
}
