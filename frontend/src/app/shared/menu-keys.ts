/**
 * Navigation au clavier dans un menu (`role="menu"`), commune aux menus de l'application : l'élément à atteindre pour
 * une touche, ou `null` si la touche ne déplace pas le focus. `index` vaut -1 quand le focus est sur le menu lui-même
 * et non sur un élément : la flèche du bas va alors au premier, la flèche du haut au dernier.
 */
export function menuTarget(key: string, index: number, count: number): number | null {
  if (count === 0) return null;
  switch (key) {
    case 'ArrowDown':
      return index < 0 ? 0 : (index + 1) % count;
    case 'ArrowUp':
      return index < 0 ? count - 1 : (index - 1 + count) % count;
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}
