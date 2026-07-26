import type { ReactNode } from 'react';

// Standard page header, shared across every top-level screen so the title/
// action-bar layout never drifts screen-to-screen (some pages had a title,
// some didn't; some had a gray action bar, some didn't). Fixed (non-
// scrolling) — the screen's own content area scrolls below it.
export function PageHeader({ title, subtitle, actions, children }: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /** Optional action/filter bar rendered below the title row. */
  children?: ReactNode;
}) {
  return (
    <div style={{ flexShrink: 0, background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
      <div style={{ padding: '12px 24px', borderBottom: children ? '1px solid var(--border)' : 'none', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, fontSize: 20 }}>{title}</h1>
          {subtitle && <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{subtitle}</p>}
        </div>
        {actions && <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>{actions}</div>}
      </div>
      {/* No forced flex here — callers with a single filter row wrap their
          own content in a flex row; callers with multiple distinct rows
          (e.g. search on one line, filter chips on another) supply their
          own stacked layout instead of having everything forced onto one
          crowded line. */}
      {children && (
        <div style={{ padding: '10px 24px' }}>
          {children}
        </div>
      )}
    </div>
  );
}
