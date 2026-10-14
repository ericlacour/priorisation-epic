import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';

import { Participant } from '../api/session-state';
import { format } from '../i18n/format';
import { MESSAGES } from '../i18n/messages.fr';

/**
 * Liste des participants à la demande (FR-005), en haut à droite du tableau : un bouton « Participants (n) » qui ouvre
 * la liste avec la présence de chacun. Comme le menu du thème : à l'ouverture, le focus va dans la liste ; Échap la
 * ferme et rend le focus au bouton ; Tab hors de la liste ou un clic ailleurs la ferment.
 */
@Component({
  selector: 'app-participants-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'participants-menu',
    '(document:click)': 'onDocumentClick($event)',
    '(keydown.escape)': 'onEscape()',
    '(focusout)': 'onFocusOut($event)',
  },
  template: `
    <button
      #trigger
      type="button"
      class="btn btn-secondary btn-sm"
      [attr.aria-controls]="open() ? 'participants-list' : null"
      [attr.aria-expanded]="open()"
      (click)="toggle()"
    >
      {{ title() }} <span aria-hidden="true">{{ open() ? '▴' : '▾' }}</span>
    </button>
    @if (open()) {
      <div
        #list
        id="participants-list"
        class="participants-pop"
        role="region"
        tabindex="-1"
        [attr.aria-label]="messages.participantsList"
      >
        <ul class="plist">
          @for (participant of participants(); track participant.participantId) {
            <li>
              <span
                class="dot"
                [class.on]="participant.online"
                [class.off]="!participant.online"
              ></span>
              {{ participant.pseudo }}
              @if (participant.participantId === meId()) {
                {{ messages.youSuffix }}
              }
              <span class="role">{{ roleOf(participant) }}</span>
            </li>
          }
        </ul>
      </div>
    }
  `,
})
export class ParticipantsMenuComponent {
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  private readonly trigger = viewChild<ElementRef<HTMLButtonElement>>('trigger');
  private readonly list = viewChild<ElementRef<HTMLElement>>('list');
  protected readonly messages = MESSAGES.board;

  readonly participants = input.required<readonly Participant[]>();
  /** Identifiant du participant de ce poste, suivi de « (vous) ». */
  readonly meId = input<string | null>(null);
  protected readonly open = signal(false);
  protected readonly title = computed(() =>
    format(this.messages.participants, { count: this.participants().length }),
  );

  protected toggle(): void {
    if (this.open()) {
      this.open.set(false);
      return;
    }
    this.open.set(true);
    afterNextRender(() => this.list()?.nativeElement.focus(), { injector: this.injector });
  }

  protected roleOf(participant: Participant): string {
    return participant.role === 'FACILITATOR'
      ? this.messages.animator
      : participant.online
        ? ''
        : this.messages.offline;
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.contains(event.target as Node)) this.open.set(false);
  }

  protected onEscape(): void {
    if (!this.open()) return;
    this.open.set(false);
    this.trigger()?.nativeElement.focus();
  }

  /** Le focus quitte le menu (Tab) : la liste se ferme. */
  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget;
    if (this.open() && next instanceof Node && !this.host.contains(next)) this.open.set(false);
  }
}
