// Shared "still loading" placeholder — same layout as the unified empty
// states (centered, 32px glyph, 14px title) but with a spinning ring instead
// of an icon, so a brief first-fetch window never reads as "no data here".
export function SFLoadingState({ label }: { label?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '64px 0', color: 'var(--text-3)' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: 'var(--accent)', animation: 'spin 0.8s linear infinite' }} />
      {label && <p style={{ fontSize: 14, fontWeight: 500 }}>{label}</p>}
    </div>
  );
}
