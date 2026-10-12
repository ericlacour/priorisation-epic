import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';

import { Participant, Round } from '../api/contract';
import { MESSAGES } from '../i18n/messages.fr';
import { SessionStateService } from './session-state.service';

/**
 * Liste des participants (écran 4, FR-005) avec leur présence, leur rôle et, pendant un tour, leur avancement
 * (« 2 / 3 »). L'animateur peut transmettre son rôle (FR-002a) à un participant en ligne, après confirmation ; l'action
 * est désactivée pour un participant hors ligne, avec son explication. Le serveur reste juge (`PARTICIPANT_OFFLINE`).
 */
@Component({
  selector: 'app-participants',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card">
      <h2>{{ sessionMessages.participants(participants().length) }}</h2>
      <ul class="plist">
        @for (participant of participants(); track participant.participantId) {
          <li>
            <span
              class="dot"
              [class.on]="participant.online"
              [class.off]="!participant.online"
              aria-hidden="true"
            ></span>
            <span>
              {{ participant.pseudo }}
              @if (participant.participantId === meId()) {
                ({{ sessionMessages.you }})
              }
            </span>
            @if (progressOf(participant); as progress) {
              <span class="progress">{{ progress }}</span>
            }
            <span class="role">
              {{
                participant.role === 'FACILITATOR'
                  ? sessionMessages.facilitator
                  : (participant.businessRole ?? '')
              }}
            </span>
            <span class="sr-only">{{
              participant.online ? sessionMessages.online : sessionMessages.offline
            }}</span>
            @if (canTransfer() && participant.role !== 'FACILITATOR') {
              <span
                class="transfer-wrap"
                [attr.title]="participant.online ? null : messages.offlineTip"
              >
                <button
                  type="button"
                  class="btn btn-ghost btn-sm"
                  [disabled]="!participant.online || busy()"
                  [attr.aria-label]="messages.transferLabel(participant.pseudo)"
                  (click)="confirming.set(participant)"
                >
                  {{ messages.transfer }}
                </button>
              </span>
            }
          </li>
        }
      </ul>
      @if (confirming(); as target) {
        <div class="notice danger" role="alertdialog" [attr.aria-label]="messages.transfer">
          <p>{{ messages.confirm(target.pseudo) }}</p>
          <p class="actions">
            <button type="button" class="btn btn-primary btn-sm" (click)="transfer(target)">
              {{ messages.confirmYes }}
            </button>
            <button type="button" class="btn btn-secondary btn-sm" (click)="confirming.set(null)">
              {{ messages.cancel }}
            </button>
          </p>
        </div>
      }
      @if (error(); as text) {
        <p class="err" role="alert">{{ text }}</p>
      }
    </section>
  `,
})
export class ParticipantsComponent {
  private readonly session = inject(SessionStateService);
  protected readonly messages = MESSAGES.participantsList;
  protected readonly sessionMessages = MESSAGES.session;

  readonly participants = input.required<readonly Participant[]>();
  readonly meId = input<string | null>(null);
  /** Le tour ouvert dont on montre l'avancement, s'il y en a un. */
  readonly round = input<Round | null>(null);
  /** Vrai pour l'animateur sur ordinateur. */
  readonly canTransfer = input(false);

  protected readonly confirming = signal<Participant | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly counts = computed(
    () => new Map((this.round()?.progress ?? []).map((p) => [p.participantId, p.completedCount])),
  );

  protected progressOf(participant: Participant): string | null {
    const round = this.round();
    if (!round) return null;
    return this.messages.progress(
      this.counts().get(participant.participantId) ?? 0,
      round.featureIds.length,
    );
  }

  protected async transfer(target: Participant): Promise<void> {
    this.confirming.set(null);
    this.busy.set(true);
    this.error.set(null);
    const result = await this.session.transferFacilitator(target.participantId);
    this.busy.set(false);
    if (!result.ok) this.error.set(MESSAGES.errors[result.code]);
  }
}
