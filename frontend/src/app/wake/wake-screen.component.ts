import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { MESSAGES } from '../i18n/messages.fr';

/** Écrans d'état du réveil : « Réveil du service… » puis, au-delà de 3 min, « Le service ne répond pas. ». */
@Component({
  selector: 'app-wake-screen',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (unavailable()) {
      <main class="state-screen" role="alert">
        <svg
          class="state-icon"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <circle cx="10" cy="10" r="8" />
          <path d="M10 5.5v5.5" />
          <circle cx="10" cy="14.2" r=".6" fill="currentColor" />
        </svg>
        <h1 class="state-error">{{ messages.unavailable }}</h1>
        <button type="button" class="btn btn-primary" (click)="retry.emit()">
          {{ messages.retry }}
        </button>
      </main>
    } @else {
      <main class="state-screen" role="status">
        <div class="wake-dots" aria-hidden="true"><span></span><span></span><span></span></div>
        <h1>{{ messages.waking }}</h1>
        <p class="lead">{{ messages.wakingLead }}</p>
      </main>
    }
  `,
})
export class WakeScreenComponent {
  protected readonly messages = MESSAGES.wake;
  readonly unavailable = input(false);
  readonly retry = output<void>();
}
