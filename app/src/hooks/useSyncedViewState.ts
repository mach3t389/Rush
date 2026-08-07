import { useState, useEffect, type Dispatch, type SetStateAction } from 'react';
import { getViewPref, setViewPref, subscribeViewPrefs } from '../data/viewPrefsStore';

// Comme usePersistedState, mais la valeur est synchronisée sur Supabase par
// utilisateur (view_prefs) au lieu de localStorage seul — donc persistante
// d'un appareil/navigateur à l'autre. Réservé aux préférences qui doivent
// suivre l'utilisateur (type de vue, afficher/masquer les éléments terminés),
// pas à l'état éphémère d'onglet.
export function useSyncedViewState<T>(key: string, fallback: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => getViewPref(key, fallback));

  // Se re-synchronise quand le fetch Supabase (asynchrone) résout, ou quand
  // la préférence change depuis un autre composant/onglet abonné.
  useEffect(() => subscribeViewPrefs(() => setValue(getViewPref(key, fallback))), [key]);
  // eslint-disable-next-line react-hooks/exhaustive-deps

  const setAndPersist: Dispatch<SetStateAction<T>> = (next) => {
    const resolved = typeof next === 'function' ? (next as (prev: T) => T)(value) : next;
    setValue(resolved);
    setViewPref(key, resolved);
  };

  return [value, setAndPersist];
}

// Comme useSyncedViewState, mais scopée par projet — sa valeur initiale (avant
// tout réglage propre à CE projet) hérite de la dernière valeur utilisée
// ailleurs (clé "<key>_default"), qui se met aussi à jour à chaque
// changement. Un nouveau projet démarre donc avec tes réglages habituels,
// tout en restant ensuite modifiable indépendamment par projet.
export function useProjectSyncedViewState<T>(key: string, projectId: string, fallback: T): [T, Dispatch<SetStateAction<T>>] {
  const defaultKey = `${key}_default`;
  const projectKey = `${key}_${projectId}`;
  const [value, setValue] = useState<T>(() => getViewPref(projectKey, getViewPref(defaultKey, fallback)));

  useEffect(() => subscribeViewPrefs(() => setValue(getViewPref(projectKey, getViewPref(defaultKey, fallback)))), [projectKey, defaultKey]);
  // eslint-disable-next-line react-hooks/exhaustive-deps

  const setAndPersist: Dispatch<SetStateAction<T>> = (next) => {
    const resolved = typeof next === 'function' ? (next as (prev: T) => T)(value) : next;
    setValue(resolved);
    setViewPref(projectKey, resolved);
    setViewPref(defaultKey, resolved);
  };

  return [value, setAndPersist];
}
