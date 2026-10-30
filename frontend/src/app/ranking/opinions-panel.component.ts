import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { ActiveRankingRoom } from '../api/contract';
import { MESSAGES } from '../i18n/messages.fr';
import { RankedItem } from './criterion-ranking.component';
import { OpinionListComponent } from './opinion-list.component';
import { cardsToMove, opinionsOf } from './opinions';
import { RoomRankingComponent } from './room-ranking.component';

/**
 * Le panneau de l'animateur pendant un classement diffusé (FR-015c) : la carte en discussion avec ses avis, le
 * classement selon la salle, puis les cartes que la salle voudrait monter ou descendre, de la plus demandée à la moins
 * demandée, avec les valeurs souhaitées et les commentaires. Chacune se met en discussion ou voit ses avis effacés
 * d'un clic.
 */
@Component({
  selector: 'app-opinions-panel',
  imports: [OpinionListComponent, RoomRankingComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'opinions-panel' },
  template: `
    @if (spotlight(); as id) {
      <section class="opinion-block" aria-labelledby="spotlight-title">
        <h2 id="spotlight-title" class="rank-column-title">{{ messages.spotlight }}</h2>
        <div class="opinion-card spotlight">
          <p class="opinion-card-title">
            <span class="fid-text">{{ items().get(id)?.externalId }}</span>
            {{ items().get(id)?.title }}
          </p>
          <app-opinion-list [opinions]="opinionsOf(id)" [names]="names()" />
          <div class="board-actions">
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
    <app-room-ranking
      [room]="room()"
      [items]="items()"
      [allowed]="allowed()"
      (detailRequested)="detailRequested.emit($event)"
    />
    <section class="opinion-block" aria-labelledby="to-move-title">
      <h2 id="to-move-title" class="rank-column-title">
        {{ messages.toMove }} <span class="rank-count">{{ toMove().length }}</span>
      </h2>
      @for (id of toMove(); track id) {
        <div class="opinion-card">
          <p class="opinion-card-title">
            <span class="fid-text">{{ items().get(id)?.externalId }}</span>
            {{ items().get(id)?.title }}
          </p>
          <app-opinion-list [opinions]="opinionsOf(id)" [names]="names()" />
          <div class="board-actions">
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              (click)="spotlightChange.emit(id)"
            >
              {{ messages.startSpotlight }}
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
  `,
})
export class OpinionsPanelComponent {
  protected readonly messages = MESSAGES.liveRanking;

  readonly room = input.required<ActiveRankingRoom>();
  readonly items = input.required<ReadonlyMap<string, RankedItem>>();
  readonly names = input.required<ReadonlyMap<string, string>>();
  /** Les valeurs de l'échelle de la session, croissantes. */
  readonly allowed = input.required<readonly number[]>();

  /** Mettre une carte en discussion, ou terminer la discussion (`null`). */
  readonly spotlightChange = output<string | null>();
  /** « Effacer les avis » d'une carte pour le critère en cours. */
  readonly clear = output<string>();
  /** Ouvrir le descriptif d'une fonctionnalité. */
  readonly detailRequested = output<string>();

  protected readonly spotlight = computed(() => this.room().spotlightFeatureId);
  protected readonly toMove = computed(() =>
    cardsToMove(this.room()).filter((id) => id !== this.spotlight()),
  );

  protected opinionsOf(id: string) {
    return opinionsOf(this.room(), id);
  }
}
