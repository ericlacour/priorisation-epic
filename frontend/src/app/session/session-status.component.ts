import { ChangeDetectionStrategy, Component, inject, input, output, signal } from '@angular/core';

import { SessionStatus } from '../api/contract';
import { MESSAGES } from '../i18n/messages.fr';
import { SessionStateService } from './session-state.service';

/**
 * Actions d'animation de la session (FR-004, FR-018), pour l'animateur sur ordinateur : « Démarrer la session » tant
 * qu'elle est en préparation, et « Ouvrir un tour », qui n'est possible qu'en cours de session. En préparation, le
 * bouton est désactivé et l'explication est lue avec lui. Aucune règle ici : le serveur refuse ce qui n'est pas permis.
 */
@Component({
  selector: 'app-session-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'round-actions' },
  template: `
    <div class="actions" role="group" [attr.aria-label]="sessionMessages.actions">
      @if (status() === 'PREPARATION') {
        <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="start()">
          {{ messages.start }}
        </button>
      }
      <button
        type="button"
        class="btn btn-secondary"
        [disabled]="status() !== 'IN_PROGRESS'"
        [attr.aria-describedby]="status() === 'PREPARATION' ? 'start-first' : null"
        (click)="openRound.emit()"
      >
        {{ messages.open }}
      </button>
      @if (status() === 'PREPARATION') {
        <span class="help" id="start-first">{{ messages.startFirst }}</span>
      }
    </div>
    @if (error(); as text) {
      <p class="err" role="alert">{{ text }}</p>
    }
  `,
})
export class SessionStatusComponent {
  private readonly session = inject(SessionStateService);
  protected readonly messages = MESSAGES.rounds;
  protected readonly sessionMessages = MESSAGES.session;

  readonly status = input.required<SessionStatus>();
  /** « Ouvrir un tour » a été demandé. */
  readonly openRound = output<void>();

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async start(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    const result = await this.session.startSession();
    this.busy.set(false);
    if (!result.ok) this.error.set(MESSAGES.errors[result.code]);
  }
}
