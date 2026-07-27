import { useLayoutEffect, useState, type RefObject } from 'react';

// Shared by every fixed-position context menu / floating panel that opens at
// a click point (right-click menus, "..." menus). Measures the panel after
// it renders and, if it would overflow the viewport, flips it above/left of
// the click point instead — so a right-click near the bottom or edge of the
// screen doesn't clip its own options.
export function useClampedMenuPosition(
  ref: RefObject<HTMLElement | null>,
  pos: { x: number; y: number },
  deps: React.DependencyList = [],
) {
  const [coords, setCoords] = useState<{ left: number; top: number; maxHeight?: number }>({ left: pos.x, top: pos.y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const margin = 8;
    const { width, height } = el.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;

    let left = pos.x;
    if (left + width + margin > vw) left = Math.max(margin, pos.x - width); // bascule à gauche du curseur
    left = Math.min(left, vw - width - margin);
    left = Math.max(margin, left);

    const spaceBelow = vh - pos.y;
    const spaceAbove = pos.y;
    let top = pos.y;
    let maxHeight: number | undefined;
    if (height + margin > spaceBelow) {
      // Pas assez de place en dessous : ouvrir vers le haut si plus d'espace, sinon clamp + scroll
      if (spaceAbove > spaceBelow) {
        top = Math.max(margin, pos.y - height);
        maxHeight = pos.y - margin;
      } else {
        top = Math.min(pos.y, vh - height - margin);
        maxHeight = vh - top - margin;
      }
    }
    top = Math.max(margin, top);
    setCoords({ left, top, maxHeight });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos.x, pos.y, ...deps]);

  return coords;
}
