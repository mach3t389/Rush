import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './index.css';

import { AppShell } from './components/layout/AppShell';
import { Dashboard } from './screens/Dashboard';
import { Taches } from './screens/Taches';
import { Projets } from './screens/Projets';
import { Travail } from './screens/Travail';
import { Ressources } from './screens/Ressources';
import { VideoReview } from './screens/VideoReview';
import { Portail } from './screens/Portail';
import { Clients } from './screens/Clients';
import { FicheClient } from './screens/FicheClient';
import { CalendrierGlobal } from './screens/CalendrierGlobal';
import { Notifications } from './screens/Notifications';
import { Parametres } from './screens/Parametres';
import { Activite } from './screens/Activite';
import { TravailOverview } from './screens/TravailOverview';
import { ResourceRouter } from './screens/ResourceRouter';
import { Modeles } from './screens/Modeles';
import { ProjectMembres } from './screens/ProjectMembres';
import { ProjetCalendrier } from './screens/ProjetCalendrier';

const router = createBrowserRouter([
  // Portail client — sans sidebar (route standalone)
  { path: '/portail/:projectId', element: <Portail /> },

  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'taches', element: <Taches /> },
      { path: 'projets', element: <Projets /> },
      { path: 'projets/:projectId', element: <Travail /> },
      { path: 'projets/:projectId/overview', element: <TravailOverview /> },
      { path: 'projets/:projectId/ressources', element: <Ressources /> },
      { path: 'projets/:projectId/ressources/:resourceId', element: <ResourceRouter /> },
      { path: 'projets/:projectId/calendrier', element: <ProjetCalendrier /> },
      { path: 'projets/:projectId/membres', element: <ProjectMembres /> },
      { path: 'clients', element: <Clients /> },
      { path: 'clients/:clientId', element: <FicheClient /> },
      { path: 'notifications', element: <Notifications /> },
      { path: 'parametres', element: <Parametres /> },
      { path: 'activite', element: <Activite /> },
      { path: 'calendrier', element: <CalendrierGlobal /> },
      { path: 'modeles', element: <Modeles /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
