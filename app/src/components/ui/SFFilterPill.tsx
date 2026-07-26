import type { ReactNode } from 'react';

// Standard pill-style filter button — for a single filter dimension shown
// as a horizontal row (Mes tâches' Tout/Aujourd'hui/Cette semaine/En
// retard, Activité's Toutes/Non lues/Mentions/Commentaires). Distinct from
// CategoryFilterDropdown, which is for many options that would crowd a
// pill row, and from tab navigation (underlined, switches the whole view
// rather than narrowing a list) — this is specifically the "few options,
// one active at a time, filters what's below" pattern.
export function SFFilterPill({ active, onClick, children }: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 12px', borderRadius: 999, border: 'none', cursor: 'pointer',
        fontSize: 12, fontWeight: 500, fontFamily: 'var(--ff-text)', whiteSpace: 'nowrap',
        background: active ? 'var(--accent)' : 'var(--surface-2)',
        color: active ? 'var(--on-accent)' : 'var(--text-2)',
        transition: 'background 0.12s, color 0.12s',
      }}
    >
      {children}
    </button>
  );
}
