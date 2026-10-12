import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { MESSAGES } from '../i18n/messages.fr';

/** Lien privé d'animation `/s/:sessionId/animer` (emplacement) : l'animation arrive avec la User Story 1. */
@Component({
  selector: 'app-animate',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="page">
      <h1>{{ messages.title }}</h1>
    </main>
  `,
})
export class AnimateComponent {
  protected readonly messages = MESSAGES.animate;
  /** Identifiant de la session, lu dans l'URL. */
  readonly sessionId = input.required<string>();
}
