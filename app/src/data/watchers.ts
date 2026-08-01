// Petit utilitaire partagé pour maintenir la liste d'observateurs
// (watchers) d'une tâche/ressource/facture — dédoublonne, ignore les ids
// vides, ne fait jamais de retrait implicite (le retrait est toujours une
// action manuelle explicite dans l'UI).
export function addWatcher(current: string[] | undefined, userId: string | undefined | null): string[] {
  const list = current ?? [];
  if (!userId || list.includes(userId)) return list;
  return [...list, userId];
}

export function addWatchers(current: string[] | undefined, userIds: (string | undefined | null)[]): string[] {
  return userIds.reduce((acc, id) => addWatcher(acc, id), current ?? []);
}
