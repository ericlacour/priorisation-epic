import { DOCUMENT } from '@angular/common';
import { Injectable, OnDestroy, inject, signal } from '@angular/core';

/** Largeur (en px) en dessous de laquelle l'écran est un téléphone. */
export const PHONE_MAX_WIDTH = 600;

/**
 * Taille de l'écran. `isPhone` passe l'interface en lecture seule (spec, « Hors périmètre », saisie
 * sur téléphone) : actions de saisie, de vote et d'animation masquées, et bandeau « Pour voter ou
 * modifier, utilisez un ordinateur ».
 */
@Injectable({ providedIn: 'root' })
export class ScreenSizeService implements OnDestroy {
  private readonly query: MediaQueryList | null;
  private readonly phone = signal(false);

  /** Vrai quand la largeur de la fenêtre est strictement inférieure à 600 px. */
  readonly isPhone = this.phone.asReadonly();

  private readonly onChange = (event: MediaQueryListEvent): void => this.phone.set(event.matches);

  constructor() {
    const win = inject(DOCUMENT).defaultView;
    this.query = win?.matchMedia?.(`(max-width: ${PHONE_MAX_WIDTH - 0.02}px)`) ?? null;
    this.phone.set(this.query?.matches ?? false);
    this.query?.addEventListener('change', this.onChange);
  }

  ngOnDestroy(): void {
    this.query?.removeEventListener('change', this.onChange);
  }
}
