import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { CardOpinion } from '../api/contract';
import { MESSAGES } from '../i18n/messages.fr';
import { OPINION_SYMBOLS } from './opinions';

/** La liste des avis d'une carte : pseudo, avis et commentaire (FR-015c). */
@Component({
  selector: 'app-opinion-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'opinion-list' },
  template: `
    <ul class="opinion-items">
      @for (opinion of opinions(); track opinion.participantId) {
        <li>
          <b>{{ names().get(opinion.participantId) ?? '?' }}</b>
          <span class="opinion-kind" [attr.data-opinion]="opinion.opinion">
            {{ symbols[opinion.opinion] }} {{ messages.opinions[opinion.opinion] }}
          </span>
          @if (opinion.comment) {
            <q class="opinion-comment">{{ opinion.comment }}</q>
          }
        </li>
      } @empty {
        <li class="muted small">{{ messages.noOpinion }}</li>
      }
    </ul>
  `,
})
export class OpinionListComponent {
  protected readonly messages = MESSAGES.liveRanking;
  protected readonly symbols = OPINION_SYMBOLS;

  readonly opinions = input.required<readonly CardOpinion[]>();
  /** Pseudo de chaque membre, par identifiant de participant. */
  readonly names = input.required<ReadonlyMap<string, string>>();
}
