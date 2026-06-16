import { useState, useEffect, type Dispatch, type SetStateAction } from 'react';
import { loadPersisted, savePersisted } from '../data/persist';

// Comme useState, mais la valeur est lue depuis localStorage au montage et
// réécrite à chaque changement. Utilisé pour mémoriser les préférences d'UI
// par page (ex. mode d'affichage : grille / liste / colonnes).
//
// Le setter retourné est celui de React, donc la signature est identique à
// useState : on peut passer une valeur OU une fonction de mise à jour.
export function usePersistedState<T>(key: string, fallback: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => loadPersisted(key, fallback));
  useEffect(() => { savePersisted(key, value); }, [key, value]);
  return [value, setValue];
}
