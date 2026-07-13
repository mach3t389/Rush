import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { GlobalTopBar } from './GlobalTopBar';
import { RouteErrorBoundary } from './RouteErrorBoundary';
import { CommandPalette } from '../CommandPalette';
import { AIChat } from '../AIChat';
import { triggerAIToggle, triggerAIClose } from '../aiChatBridge';
import { ToastBar } from '../ToastBar';
import { ViewAsBanner } from '../ViewAsBanner';
import { getShortcuts, subscribeShortcuts, matchesShortcut } from '../../data/shortcutsStore';
import { initAnalytics } from '../../analytics';

export function AppShell() {
  const [cmdOpen, setCmdOpen] = useState(false);
  const [shortcuts, setShortcuts] = useState(getShortcuts);

  useEffect(() => subscribeShortcuts(() => setShortcuts(getShortcuts())), []);

  // AppShell only mounts once the auth loader (router guard) has confirmed
  // the user is logged in — this is the single common entry point for the
  // authenticated app, so injecting here means login/register attempts on
  // /login are never counted as visits.
  useEffect(() => { initAnalytics(); }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Escape — ferme le panneau IA ou la palette de recherche ouverts
      if (e.key === 'Escape') {
        if (cmdOpen) { setCmdOpen(false); e.preventDefault(); return; }
        triggerAIClose();
        return;
      }

      // Ctrl+K — toujours actif (convention universelle)
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdOpen(prev => !prev);
        return;
      }

      const t = e.target as HTMLElement;
      const inTextField = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable;
      const inAIPanel = !!t.closest?.('[data-ai-panel]');

      // Raccourci Recherche
      if (matchesShortcut(e, shortcuts.search) && !inTextField) {
        e.preventDefault();
        setCmdOpen(true);
        return;
      }

      // Raccourci IA toggle
      if (matchesShortcut(e, shortcuts.ai_toggle) && (!inTextField || inAIPanel)) {
        e.preventDefault();
        triggerAIToggle();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [shortcuts, cmdOpen]);

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>
      <Sidebar onSearch={() => setCmdOpen(true)} />
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <ViewAsBanner />
        <GlobalTopBar onSearch={() => setCmdOpen(true)} />
        <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
          <RouteErrorBoundary>
            <Outlet />
          </RouteErrorBoundary>
        </div>
      </main>
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
      <AIChat />
      <ToastBar />
    </div>
  );
}
