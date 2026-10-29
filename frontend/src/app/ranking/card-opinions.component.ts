import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

import { CardOpinion, OPINION_KINDS } from '../api/contract';
import { format } from '../i18n/format';
import { MESSAGES } from '../i18n/messages.fr';
import { OpinionListComponent } from './opinion-list.component';
import { OPINION_SYMBOLS } from './opinions';

/**
 * Les compteurs d'avis d'une carte (FR-015c, point 3) : nombre de ✓, ↑ et ↓, et d'avis commentés. Un clic ouvre la
 * liste des avis, que la touche Échap ou un second clic referme. Rien sans avis.
 */
@Component({
  selector: 'app-card-opinions',
  imports: [OpinionListComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card-opinions', '(keydown.escape)': 'open.set(false)' },
  template: `
    @if (opinions().length > 0) {
      <button
        type="button"
        class="opinion-counts"
        [attr.aria-expanded]="open()"
        [attr.aria-label]="label()"
        (click)="open.set(!open())"
      >
        @for (count of counts(); track count.kind) {
          <span class="opinion-count" [attr.data-opinion]="count.kind"
            >{{ symbols[count.kind] }} {{ count.count }}</span
          >
        }
        @if (commented() > 0) {
          <span class="opinion-count" data-opinion="COMMENT" [attr.title]="messages.commented">
            <svg viewBox="0 0 16 16" aria-hidden="true" class="opinion-bubble">
              <path d="M2 3h12v8H6l-3 3v-3H2z" />
            </svg>
            {{ commented() }}
          </span>
        }
      </button>
      @if (open()) {
        <div class="opinion-popover" role="dialog" [attr.aria-label]="label()">
          <app-opinion-list [opinions]="opinions()" [names]="names()" />
        </div>
      }
    }
  `,
})
export class CardOpinionsComponent {
  protected readonly messages = MESSAGES.liveRanking;
  protected readonly symbols = OPINION_SYMBOLS;

  readonly opinions = input.required<readonly CardOpinion[]>();
  readonly names = input.required<ReadonlyMap<string, string>>();
  /** L'identifiant affiché de la fonctionnalité, pour les lecteurs d'écran. */
  readonly featureLabel = input.required<string>();

  protected readonly open = signal(false);

  protected readonly counts = computed(() =>
    OPINION_KINDS.map((kind) => ({
      kind,
      count: this.opinions().filter((opinion) => opinion.opinion === kind).length,
    })).filter((count) => count.count > 0),
  );

  protected readonly commented = computed(
    () => this.opinions().filter((opinion) => opinion.comment).length,
  );

  protected readonly label = computed(() =>
    format(this.messages.opinionsOf, { id: this.featureLabel() }),
  );
}
