import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { ActiveRankingRoom } from '../api/contract';
import { format } from '../i18n/format';
import { MESSAGES } from '../i18n/messages.fr';
import { RankedItem } from './criterion-ranking.component';
import { OpinionListComponent } from './opinion-list.component';
import { OpinionGap, agreedIds, cardsToMove, opinionsOf } from './opinions';

/** L'ordre des cartes à déplacer selon leur écart d'avis. */
const GAP_ORDER = { strong: 0, notable: 1, none: 2 } as const;

/**
 * Le panneau de l'animateur pendant un classement diffusé (FR-015c) : la carte en discussion avec ses avis, puis les
 * cartes que la salle voudrait monter ou descendre, avec les valeurs souhaitées et les commentaires. Les cartes aux
 * avis les plus éloignés (`gaps`, voir `roomGaps`) passent en tête, teintées selon l'écart ; à écart égal, de la plus
 * demandée à la moins demandée. Chacune se met en discussion, reçoit « Accord trouvé » ou voit ses avis effacés d'un
 * clic ; son identifiant ouvre le descriptif. En bas, les accords trouvés, que l'animateur peut rouvrir.
 */

@Component({
  selector: 'app-opinions-panel',
  imports: [NgTemplateOutlet, OpinionListComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'opinions-panel' },
  template: `
    @if (spotlight(); as id) {
      <section class="opinion-block" aria-labelledby="spotlight-title">
        <h2 id="spotlight-title" class="rank-column-title">{{ messages.spotlight }}</h2>
        <div class="opinion-card spotlight" [attr.data-gap]="gaps().get(id)?.level ?? null">
          <ng-container [ngTemplateOutlet]="title" [ngTemplateOutletContext]="{ id }" />
          <app-opinion-list [opinions]="opinionsOf(id)" [names]="names()" />
          <div class="board-actions">
            <button
              type="button"
              class="btn btn-primary btn-sm"
              [attr.title]="messages.settleHint"
              (click)="settle.emit({ id, agreed: true })"
            >
              {{ messages.settle }}
            </button>
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              (click)="spotlightChange.emit(null)"
            >
              {{ messages.endSpotlight }}
            </button>
            <button type="button" class="btn btn-ghost btn-sm" (click)="clear.emit(id)">
              {{ messages.clear }}
            </button>
          </div>
        </div>
      </section>
    }
    <section class="opinion-block" aria-labelledby="to-move-title">
      <h2 id="to-move-title" class="rank-column-title">
        {{ messages.toMove }} <span class="rank-count">{{ toMove().length }}</span>
      </h2>
      @for (id of toMove(); track id) {
        <div class="opinion-card" [attr.data-gap]="gaps().get(id)?.level ?? null">
          <ng-container [ngTemplateOutlet]="title" [ngTemplateOutletContext]="{ id }" />
          <app-opinion-list [opinions]="opinionsOf(id)" [names]="names()" />
          <div class="board-actions">
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              (click)="spotlightChange.emit(id)"
            >
              {{ messages.startSpotlight }}
            </button>
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              [attr.title]="messages.settleHint"
              (click)="settle.emit({ id, agreed: true })"
            >
              {{ messages.settle }}
            </button>
            <button type="button" class="btn btn-ghost btn-sm" (click)="clear.emit(id)">
              {{ messages.clear }}
            </button>
          </div>
        </div>
      } @empty {
        <p class="muted small">{{ messages.nothingToMove }}</p>
      }
    </section>
    @if (agreed().length > 0) {
      <section class="opinion-block" aria-labelledby="agreed-title">
        <h2 id="agreed-title" class="rank-column-title">
          {{ messages.agreedTitle }} <span class="rank-count">{{ agreed().length }}</span>
        </h2>
        <ul class="agreed-list">
          @for (id of agreed(); track id) {
            <li>
              <span class="agreed-badge" [attr.title]="messages.agreedHint">{{
                messages.agreed
              }}</span>
              <span class="agreed-name">
                <span class="fid-text">{{ items().get(id)?.externalId }}</span>
                {{ items().get(id)?.title }}
              </span>
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                [attr.aria-label]="reopenLabel(id)"
                (click)="settle.emit({ id, agreed: false })"
              >
                {{ messages.reopen }}
              </button>
            </li>
          }
        </ul>
      </section>
    }

    <ng-template #title let-id="id">
      <p class="opinion-card-title">
        @if (items().get(id); as item) {
          <button
            type="button"
            class="fid"
            [attr.title]="detailLabel(item)"
            (click)="detailRequested.emit(id)"
          >
            {{ item.externalId }}
          </button>
          {{ item.title }}
        }
        @if (gaps().get(id); as gap) {
          <span class="opinion-gap" [attr.title]="gapHint(gap)">{{ gapText(gap) }}</span>
        }
      </p>
    </ng-template>
  `,
})
export class OpinionsPanelComponent {
  protected readonly messages = MESSAGES.liveRanking;

  readonly room = input.required<ActiveRankingRoom>();
  readonly items = input.required<ReadonlyMap<string, RankedItem>>();
  readonly names = input.required<ReadonlyMap<string, string>>();
  /** Les gros écarts encore à discuter, par fonctionnalité (voir `roomGaps`). */
  readonly gaps = input<ReadonlyMap<string, OpinionGap>>(new Map());

  /** Mettre une carte en discussion, ou terminer la discussion (`null`). */
  readonly spotlightChange = output<string | null>();
  /** « Accord trouvé » sur une carte pour le critère en cours, ou sa réouverture. */
  readonly settle = output<{ readonly id: string; readonly agreed: boolean }>();
  /** « Effacer les avis » d'une carte pour le critère en cours. */
  readonly clear = output<string>();
  /** Ouvrir le descriptif d'une fonctionnalité. */
  readonly detailRequested = output<string>();

  protected readonly spotlight = computed(() => this.room().spotlightFeatureId);
  /**
   * Les cartes à déplacer : fort écart, puis écart notable, puis les autres ; à niveau égal, l'écart le plus large
   * d'abord, puis l'ordre de `cardsToMove`.
   */
  protected readonly toMove = computed(() => {
    const rank = (id: string) => GAP_ORDER[this.gaps().get(id)?.level ?? 'none'];
    const steps = (id: string) => this.gaps().get(id)?.steps ?? 0;
    return cardsToMove(this.room())
      .filter((id) => id !== this.spotlight())
      .sort((a, b) => rank(a) - rank(b) || steps(b) - steps(a));
  });

  /** Les cartes où la salle s'est mise d'accord pour ce critère, dans l'ordre du brouillon. */
  protected readonly agreed = computed(() => {
    const ids = agreedIds(this.room());
    const draft = this.room().draft;
    return [...draft.levels.flat(), ...draft.unranked].filter((id) => ids.has(id));
  });

  protected reopenLabel(id: string): string {
    return format(this.messages.reopenLabel, { id: this.items().get(id)?.externalId ?? id });
  }

  protected gapText(gap: OpinionGap): string {
    return format(this.messages.gap, { low: gap.low, high: gap.high });
  }

  protected gapHint(gap: OpinionGap): string {
    const hint = format(this.messages.gapHint, { low: gap.low, high: gap.high, steps: gap.steps });
    return gap.opposed ? `${hint} ${this.messages.gapOpposed}` : hint;
  }

  protected detailLabel(item: RankedItem): string {
    return format(MESSAGES.board.openDetail, { id: item.externalId });
  }

  protected opinionsOf(id: string) {
    return opinionsOf(this.room(), id);
  }
}
