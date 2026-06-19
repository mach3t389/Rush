import { useState, useRef, useCallback, useEffect } from 'react';
import { getResourceContent, setResourceContent } from '../data/resourceContentStore';

// Comme useState, mais la valeur est lue/écrite depuis le store de contenu par
// ressource (resourceContentStore → localStorage `sf_resource_content`).
//
// - `resourceId` undefined → mode éphémère : se comporte comme un useState simple,
//   rien n'est persisté (utile pour les éditeurs de modèles qui n'ont pas de
//   ressource réelle).
// - Le setter persiste de façon débouncée (par défaut 400 ms) pour éviter d'écrire
//   à chaque frappe ; la dernière modification est flushée au démontage.
export function useResourceContent<T>(
  resourceId: string | undefined,
  fallback: T,
  debounceMs = 400,
): [T, (next: T) => void] {
  const [value, setValue] = useState<T>(() => {
    if (!resourceId) return fallback;
    const saved = getResourceContent<T>(resourceId);
    return saved !== undefined ? saved : fallback;
  });

  const timer = useRef<number | null>(null);
  const latest = useRef<T>(value);
  const pending = useRef(false);

  const save = useCallback((next: T) => {
    setValue(next);
    latest.current = next;
    if (!resourceId) return;
    pending.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setResourceContent(resourceId, latest.current);
      pending.current = false;
    }, debounceMs);
  }, [resourceId, debounceMs]);

  // Flush la dernière modification en attente au démontage (lit `latest` à jour).
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
    if (resourceId && pending.current) setResourceContent(resourceId, latest.current);
  }, [resourceId]);

  return [value, save];
}
