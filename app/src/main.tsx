import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider, redirect } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import './index.css';
import i18n from './i18n/i18n';
import { isAuthenticated } from './data/authStore';
import { preloadResourceContent } from './data/resourceContentStore';

import { AppShell } from './components/layout/AppShell';
import { Dashboard } from './screens/Dashboard';
import { Taches } from './screens/Taches';
import { Projets } from './screens/Projets';
import { Travail } from './screens/Travail';
import { ClientInvitationAccept } from './screens/ClientInvitationAccept';
import { ClientHome } from './screens/ClientHome';
import { isClientSession } from './data/clientSessionStore';
import { TeamInvitationAccept } from './screens/TeamInvitationAccept';
import { Clients } from './screens/Clients';
import { FicheClient } from './screens/FicheClient';
import { CalendrierGlobal } from './screens/CalendrierGlobal';
import { Parametres } from './screens/Parametres';
import { Activite } from './screens/Activite';
import { TravailOverview } from './screens/TravailOverview';
import { ResourceRouter } from './screens/ResourceRouter';
import { Modeles } from './screens/Modeles';
import { ProjectMembres } from './screens/ProjectMembres';
import { ProjetCalendrier } from './screens/ProjetCalendrier';
import { FichiersGlobal } from './screens/FichiersGlobal';
import { Fichiers } from './screens/Fichiers';
import { VueGlobale } from './screens/VueGlobale';
import { ProjectActivite } from './screens/ProjectActivite';
import { Finances } from './screens/Finances';
import { ProjetFinances } from './screens/ProjetFinances';
import { Login } from './screens/Login';
import { Register } from './screens/Register';
import { ForgotPassword } from './screens/ForgotPassword';
import { Onboarding } from './screens/Onboarding';
import { Pricing } from './screens/Pricing';
import { AdminStudios } from './screens/AdminStudios';
import { RouteErrorPage } from './screens/RouteErrorPage';
import { NoOrganization } from './screens/NoOrganization';

// ── Route guards ──────────────────────────────────────────────────────────────
const authLoader = async () => {
  if (!(await isAuthenticated())) return redirect('/login');
  // A client-authenticated session must never reach the studio AppShell —
  // every screen under it eventually calls a studio-scoped store, and
  // getStudioId() would silently auto-provision a brand-new empty studio
  // for a user with no studio_members row (see studioStore.ts's
  // resolveStudioId, step 3) instead of failing loudly. Route them to their
  // own minimal space before that can happen.
  if (await isClientSession()) return redirect('/mon-espace');
  await preloadResourceContent();
  return null;
};
const guestLoader = async () => { if (await isAuthenticated()) return redirect('/'); return null; };
const clientLoader = async () => {
  if (!(await isAuthenticated())) return redirect('/login');
  if (!(await isClientSession())) return redirect('/');
  return null;
};

const router = createBrowserRouter([
  // Auth routes (standalone, no sidebar)
  { path: '/login',          element: <Login />,          loader: guestLoader },
  { path: '/register',       element: <Register />,       loader: guestLoader },
  { path: '/forgot-password',element: <ForgotPassword />, loader: guestLoader },
  { path: '/onboarding',     element: <Onboarding />,     loader: authLoader  },

  // Page tarification publique — sans authentification requise
  { path: '/pricing', element: <Pricing /> },
  { path: '/admin/studios', element: <AdminStudios />, loader: authLoader },

  // Invitation contact client — sans sidebar, accessible sans compte (route standalone)
  { path: '/invitation/:token', element: <ClientInvitationAccept /> },

  // Invitation membre d'équipe — sans sidebar, accessible sans compte (route standalone)
  { path: '/invitation-equipe/:token', element: <TeamInvitationAccept /> },

  // Écran "aucune organisation" — atteint uniquement après avoir quitté sa
  // dernière organisation (voir leaveCurrentStudio dans studioStore.ts).
  { path: '/mes-organisations', element: <NoOrganization />, loader: authLoader },

  // Espace client — sans sidebar (route standalone), réservé aux comptes
  // client (voir clientLoader ci-dessus). Écran minimal pour cette étape —
  // le vrai tableau de bord client est un chantier séparé.
  { path: '/mon-espace', element: <ClientHome />, loader: clientLoader, errorElement: <RouteErrorPage /> },

  {
    path: '/',
    element: <AppShell />,
    loader: authLoader,
    errorElement: <RouteErrorPage />,
    children: [
      { index: true, element: <Dashboard /> },
      { path: 'taches', element: <Taches /> },
      { path: 'projets', element: <Projets /> },
      { path: 'projets/:projectId', element: <Travail /> },
      { path: 'projets/:projectId/overview', element: <TravailOverview /> },
      { path: 'projets/:projectId/fichiers', element: <Fichiers /> },
      { path: 'projets/:projectId/ressources/:resourceId', element: <ResourceRouter /> },
      // Ressource hors projet (créée dans Fichiers global / espace client) — pas de projectId dans l'URL
      { path: 'ressources/:resourceId', element: <ResourceRouter /> },
      { path: 'projets/:projectId/calendrier', element: <ProjetCalendrier /> },
      { path: 'projets/:projectId/membres', element: <ProjectMembres /> },
      { path: 'projets/:projectId/activite', element: <ProjectActivite /> },
      { path: 'projets/:projectId/finances', element: <ProjetFinances /> },
      { path: 'finances', element: <Finances /> },
      { path: 'clients', element: <Clients /> },
      { path: 'clients/:clientId', element: <FicheClient /> },
      { path: 'parametres', element: <Parametres /> },
      { path: 'activite', element: <Activite /> },
      { path: 'calendrier', element: <CalendrierGlobal /> },
      { path: 'modeles', element: <Modeles /> },
      { path: 'fichiers', element: <FichiersGlobal /> },
      { path: 'global', element: <VueGlobale /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nextProvider i18n={i18n}>
      <RouterProvider router={router} />
    </I18nextProvider>
  </StrictMode>
);
