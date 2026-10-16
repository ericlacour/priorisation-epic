import { Injectable, signal } from '@angular/core';

/**
 * Barre du haut de l'application ou barre de session (FR-014c). Le tableau de la session a sa propre barre (nom,
 * statut, outils, thème) : tant qu'il est affiché, la barre de l'application cède sa place, pour que les deux barres de
 * la session tiennent dans la hauteur de l'ancienne barre et de l'ancien en-tête.
 */
@Injectable({ providedIn: 'root' })
export class SessionChromeService {
  private readonly active = signal(false);

  /** Vrai tant que la barre de session remplace la barre de l'application. */
  readonly sessionBar = this.active.asReadonly();

  show(): void {
    this.active.set(true);
  }

  hide(): void {
    this.active.set(false);
  }
}
