import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { MESSAGES } from '../i18n/messages.fr';

/** Lien de session `/s/:sessionId` (emplacement) : l'entrée dans la session arrive avec la User Story 1. */
@Component({
  selector: 'app-session-entry',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="page">
      <h1>{{ messages.title }}</h1>
    </main>
  `,
})
export class SessionEntryComponent {
  protected readonly messages = MESSAGES.sessionEntry;
  /** Identifiant de la session, lu dans l'URL. */
  readonly sessionId = input.required<string>();
}
