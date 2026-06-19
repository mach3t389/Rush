import { useState, useRef, useCallback, useEffect } from 'react';
import { getResourceContent, setResourceContent } from '../data/resourceContentStore';

// ─────────────────────────────────────────────────────────────────────────────
// Système de VERSIONS universel pour les ressources.
//
// Toute ressource (quel que soit son type) peut avoir plusieurs versions ; chaque
// version est un instantané COMPLET du contenu de l'éditeur (`content: T`). On peut
// basculer entre versions, en créer une nouvelle (snapshot du contenu courant) et
// restaurer une ancienne. Le tout est persisté via resourceContentStore — donc le
// point de bascule backend reste unique.
//
// Forme stockée sous resourceId : { versions: [...], activeId }.
// Rétro-compatibilité : si une entrée legacy (contenu nu, non versionné) existe
// déjà, elle est enveloppée comme version « V1 ».
// ─────────────────────────────────────────────────────────────────────────────

export interface ResourceVersion<T> {
  id: string;
  label: string;       // ex. "V1", "Montage final"
  date: string;        // libellé lisible (ex. "10 juin")
  content: T;
}

interface VersionedState<T> {
  versions: ResourceVersion<T>[];
  activeId: string;
}

function isVersioned<T>(v: unknown): v is VersionedState<T> {
  return !!v && typeof v === 'object' && Array.isArray((v as VersionedState<T>).versions) && typeof (v as VersionedState<T>).activeId === 'string';
}

export interface UseResourceVersions<T> {
  versions: ResourceVersion<T>[];
  activeId: string;
  activeContent: T;
  /** Met à jour le contenu de la version active (persisté, débouncé). */
  setActiveContent: (next: T) => void;
  /** Crée une nouvelle version à partir du contenu courant et l'active. */
  newVersion: (label?: string) => void;
  /** Bascule sur une version existante. */
  switchVersion: (id: string) => void;
  /** Restaure une ancienne version (en crée une nouvelle copie active). */
  restoreVersion: (id: string) => void;
  renameVersion: (id: string, label: string) => void;
  deleteVersion: (id: string) => void;
}

export function useResourceVersions<T>(
  resourceId: string | undefined,
  makeInitial: () => T,
  todayLabel: string,
  debounceMs = 400,
): UseResourceVersions<T> {
  const [state, setState] = useState<VersionedState<T>>(() => {
    const stored = resourceId ? getResourceContent<unknown>(resourceId) : undefined;
    if (isVersioned<T>(stored)) return stored;
    // Contenu legacy non versionné → enveloppe en V1.
    const initial = (stored !== undefined ? (stored as T) : makeInitial());
    return { versions: [{ id: 'v1', label: 'V1', date: todayLabel, content: initial }], activeId: 'v1' };
  });

  const timer = useRef<number | null>(null);
  const latest = useRef(state);
  latest.current = state;

  const commit = useCallback((next: VersionedState<T>, immediate = false) => {
    setState(next);
    latest.current = next;
    if (!resourceId) return;
    if (timer.current) clearTimeout(timer.current);
    if (immediate) { setResourceContent(resourceId, next); return; }
    timer.current = window.setTimeout(() => setResourceContent(resourceId, next), debounceMs);
  }, [resourceId, debounceMs]);

  // Flush en attente au démontage.
  useEffect(() => () => {
    if (timer.current && resourceId) { clearTimeout(timer.current); setResourceContent(resourceId, latest.current); }
  }, [resourceId]);

  const active = state.versions.find(v => v.id === state.activeId) ?? state.versions[0];

  const setActiveContent = useCallback((next: T) => {
    const cur = latest.current;
    commit({ ...cur, versions: cur.versions.map(v => v.id === cur.activeId ? { ...v, content: next } : v) });
  }, [commit]);

  const nextLabel = (versions: ResourceVersion<T>[]) => {
    const nums = versions.map(v => /^V(\d+)$/.exec(v.label)?.[1]).filter(Boolean).map(Number);
    return `V${(nums.length ? Math.max(...nums) : versions.length) + 1}`;
  };

  const newVersion = useCallback((label?: string) => {
    const cur = latest.current;
    const activeNow = cur.versions.find(v => v.id === cur.activeId) ?? cur.versions[0];
    const id = `v${cur.versions.length + 1}-${cur.versions.reduce((a, v) => a + v.label.length, 0)}`;
    const version: ResourceVersion<T> = {
      id,
      label: label?.trim() || nextLabel(cur.versions),
      date: todayLabel,
      content: JSON.parse(JSON.stringify(activeNow.content)) as T, // clone profond du contenu courant
    };
    commit({ versions: [...cur.versions, version], activeId: id }, true);
  }, [commit, todayLabel]);

  const switchVersion = useCallback((id: string) => {
    const cur = latest.current;
    if (!cur.versions.some(v => v.id === id)) return;
    commit({ ...cur, activeId: id }, true);
  }, [commit]);

  const restoreVersion = useCallback((id: string) => {
    const cur = latest.current;
    const src = cur.versions.find(v => v.id === id);
    if (!src) return;
    const newId = `v${cur.versions.length + 1}-r`;
    const version: ResourceVersion<T> = {
      id: newId,
      label: `${nextLabel(cur.versions)} (de ${src.label})`,
      date: todayLabel,
      content: JSON.parse(JSON.stringify(src.content)) as T,
    };
    commit({ versions: [...cur.versions, version], activeId: newId }, true);
  }, [commit, todayLabel]);

  const renameVersion = useCallback((id: string, label: string) => {
    const cur = latest.current;
    commit({ ...cur, versions: cur.versions.map(v => v.id === id ? { ...v, label: label.trim() || v.label } : v) }, true);
  }, [commit]);

  const deleteVersion = useCallback((id: string) => {
    const cur = latest.current;
    if (cur.versions.length <= 1) return; // toujours au moins une version
    const remaining = cur.versions.filter(v => v.id !== id);
    const activeId = cur.activeId === id ? remaining[remaining.length - 1].id : cur.activeId;
    commit({ versions: remaining, activeId }, true);
  }, [commit]);

  return {
    versions: state.versions,
    activeId: state.activeId,
    activeContent: active.content,
    setActiveContent,
    newVersion,
    switchVersion,
    restoreVersion,
    renameVersion,
    deleteVersion,
  };
}
