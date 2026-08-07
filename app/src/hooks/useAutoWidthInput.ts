import { useLayoutEffect, useRef, useState } from 'react';

// Mesure la largeur réelle (en pixels, selon la police effectivement
// rendue) du texte en cours d'édition via un <span> caché, puis y ajoute un
// espace FIXE (pas proportionnel au nombre de caractères) pour laisser de
// la place où cliquer et continuer à taper. Le composant appelant doit
// rendre le span mesureur (measureRef) — seulement pendant que `active` est
// vrai, sinon la mesure au premier montage est ratée — avec exactement les
// mêmes styles de police que l'input, et appliquer `width` à l'input (avec
// un maxWidth pour ne jamais dépasser la colonne).
//
// `active` doit être inclus explicitement : si le champ s'ouvre avec un
// texte déjà identique à celui du rendu précédent (cas courant — on copie
// juste task.title dans le brouillon en ouvrant l'édition), `text` seul ne
// change pas de valeur d'un render à l'autre et l'effet ne se redéclenche
// pas, laissant la largeur bloquée à `minPx` jusqu'à la première frappe.
export function useAutoWidthInput(text: string, active: boolean, extraPx = 24, minPx = 60) {
  const measureRef = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState(minPx);

  useLayoutEffect(() => {
    if (active && measureRef.current) {
      setWidth(Math.max(minPx, measureRef.current.offsetWidth + extraPx));
    }
  }, [text, active, extraPx, minPx]);

  return { measureRef, width };
}
