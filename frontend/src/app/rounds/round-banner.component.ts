import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';

import { Round } from '../api/contract';
import { MESSAGES } from '../i18n/messages.fr';
import { SessionStateService } from '../session/session-state.service';

/**
 * Bandeau d'un tour ouvert (écran 5) : « Tour N en cours sur K fonctionnalités », visible de tous, avec le bouton
 * « Révéler le tour N » pour l'animateur (FR-020), qui peut révéler à tout moment.
 */
@Component({
  selector: 'app-round-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'notice info round-banner', role: 'status' },
  template: `
    <span>{{ messages.banner(round().number, round().featureIds.length) }}</span>
    @if (canReveal()) {
      <button type="button" class="btn btn-primary btn-sm" [disabled]="busy()" (click)="reveal()">
        {{ busy() ? roundMessages.revealing : roundMessages.reveal(round().number) }}
      </button>
    }
    @if (error(); as text) {
      <span class="err" role="alert">{{ text }}</span>
    }
  `,
})
export class RoundBannerComponent {
  private readonly session = inject(SessionStateService);
  protected readonly messages = MESSAGES.rounds.vote;
  protected readonly roundMessages = MESSAGES.rounds;

  readonly round = input.required<Round>();
  readonly canReveal = input(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async reveal(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    const result = await this.session.revealRound(this.round().id);
    this.busy.set(false);
    if (!result.ok) this.error.set(MESSAGES.errors[result.code]);
  }
}
