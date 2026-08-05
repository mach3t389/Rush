export function computeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = parts.map(p => p[0]).join('').toUpperCase().slice(0, 2);
  return initials || '??';
}
