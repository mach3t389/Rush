import { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { GlobalTopBar } from './GlobalTopBar';
import { CommandPalette } from '../CommandPalette';
import { AIChat } from '../AIChat';

export function AppShell() {
  const [cmdOpen, setCmdOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', background: 'var(--bg)' }}>
      <Sidebar onSearch={() => setCmdOpen(true)} />
      <main style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <GlobalTopBar onSearch={() => setCmdOpen(true)} />
        <Outlet />
      </main>
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
      <AIChat />
    </div>
  );
}
