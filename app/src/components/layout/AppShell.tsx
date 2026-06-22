import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { GlobalTopBar } from './GlobalTopBar';
import { CommandPalette } from '../CommandPalette';
import { AIChat } from '../AIChat';
import { triggerAIToggle } from '../aiChatBridge';

export function AppShell() {
  const [cmdOpen, setCmdOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdOpen(prev => !prev);
      }
      // Touche I seule — ignorée si focus dans un champ de texte hors du panneau IA
      if ((e.key === 'i' || e.key === 'I' || e.code === 'KeyI') && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
        const t = e.target as HTMLElement;
        const inAIPanel = !!t.closest?.('[data-ai-panel]');
        const inTextField = (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) && !inAIPanel;
        if (!inTextField) {
          e.preventDefault();
          triggerAIToggle();
        }
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, []);

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>
      <Sidebar onSearch={() => setCmdOpen(true)} />
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <GlobalTopBar onSearch={() => setCmdOpen(true)} />
        <div style={{ flex: 1, overflow: 'hidden', minHeight: 0 }}>
          <Outlet />
        </div>
      </main>
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
      <AIChat />
    </div>
  );
}
