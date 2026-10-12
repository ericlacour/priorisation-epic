import { ChangeDetectionStrategy, Component } from '@angular/core';

import { MESSAGES } from '../i18n/messages.fr';

/** Accueil (emplacement) : la création de session arrive avec la User Story 1. */
@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="page">
      <h1>{{ messages.title }}</h1>
      <p class="lead">{{ messages.lead }}</p>
    </main>
  `,
})
export class HomeComponent {
  protected readonly messages = MESSAGES.home;
}
