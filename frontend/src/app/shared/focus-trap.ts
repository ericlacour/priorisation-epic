/** Contrôles qui prennent le focus avec Tab. */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Garde Tab et Maj+Tab dans une fenêtre modale (`aria-modal`) : après son dernier contrôle, le focus revient au
 * premier, et inversement ; sans contrôle, il reste sur la fenêtre. À appeler sur chaque `keydown` de la fenêtre.
 * Un Tab déjà traité (fenêtre imbriquée) est laissé tel quel.
 */
export function keepTabInside(event: KeyboardEvent, container: HTMLElement): void {
  if (event.key !== 'Tab' || event.defaultPrevented) return;
  const focusables = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (element) => !element.closest('[hidden]'),
  );
  const active = container.ownerDocument.activeElement;
  if (focusables.length === 0) {
    event.preventDefault();
    container.focus();
    return;
  }
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (event.shiftKey && (active === first || active === container)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}
