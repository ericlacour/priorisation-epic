import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { ActiveRankingRoom } from '../api/contract';
import { format } from '../i18n/format';
import { MESSAGES } from '../i18n/messages.fr';
import { RankedItem } from './criterion-ranking.component';
import { RoomEntry, roomRanking } from './opinions';

/**
 * Le classement selon la salle (FR-015c), à côté du classement en direct : chaque fonctionnalité prend la moyenne des
 * avis des participants, ramenée à l'échelle, et les niveaux se refont. Une fonctionnalité que la salle déplace porte
 * sa valeur dans le brouillon et sa valeur selon la salle. Un clic sur l'identifiant ouvre le descriptif.
 */
@Component({
  selector: 'app-room-ranking',
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'opinion-block room-ranking' },
  template: `
    <h2 class="rank-column-title" [attr.title]="messages.roomHint">
      {{ messages.roomTitle }} <span class="rank-count">{{ changedCount() }}</span>
    </h2>
    <ol class="ranking-levels" [attr.aria-label]="messages.roomLabel">
      @for (level of ranking().levels; track $index; let index = $index) {
        <li class="rank-level" [class.rank-level-alt]="index % 2 === 1">
          <div class="rank-level-body">
            <span class="rank">{{ index + 1 }}</span>
            <ul class="rank-items">
              @for (entry of level; track entry.id) {
                <ng-container [ngTemplateOutlet]="row" [ngTemplateOutletContext]="{ entry }" />
              }
            </ul>
          </div>
        </li>
      }
      @if (ranking().unranked.length > 0) {
        <li class="rank-level">
          <div class="rank-level-body">
            <span class="rank" [attr.title]="messages.roomUnranked">–</span>
            <ul class="rank-items">
              @for (entry of ranking().unranked; track entry.id) {
                <ng-container [ngTemplateOutlet]="row" [ngTemplateOutletContext]="{ entry }" />
              }
            </ul>
          </div>
        </li>
      }
    </ol>

    <ng-template #row let-entry="entry">
      @if (items().get(entry.id); as item) {
        <li class="rank-item" [attr.data-id]="entry.id" [attr.data-direction]="direction(entry)">
          <button
            type="button"
            class="fid"
            [attr.title]="detailLabel(item)"
            (click)="detailRequested.emit(entry.id)"
          >
            {{ item.externalId }}
          </button>
          <span class="rank-title" [attr.title]="item.title">{{ item.title }}</span>
          @if (direction(entry)) {
            <span class="room-change" [attr.aria-label]="changeLabel(item, entry)">{{
              changeText(entry)
            }}</span>
          } @else {
            <span class="rank-value live-value">{{ entry.value ?? messages.noValue }}</span>
          }
        </li>
      }
    </ng-template>
  `,
})
export class RoomRankingComponent {
  protected readonly messages = MESSAGES.liveRanking;

  readonly room = input.required<ActiveRankingRoom>();
  readonly items = input.required<ReadonlyMap<string, RankedItem>>();
  /** Les valeurs de l'échelle de la session, croissantes. */
  readonly allowed = input.required<readonly number[]>();

  /** Ouvrir le descriptif d'une fonctionnalité. */
  readonly detailRequested = output<string>();

  protected readonly ranking = computed(() => roomRanking(this.room(), this.allowed()));

  /** Le nombre de fonctionnalités que la salle déplace. */
  protected readonly changedCount = computed(
    () =>
      [...this.ranking().levels.flat(), ...this.ranking().unranked].filter((e) => this.direction(e))
        .length,
  );

  /** `up` ou `down` si la salle change la valeur, sinon `null`. */
  protected direction(entry: RoomEntry): 'up' | 'down' | null {
    if (entry.value === entry.current) return null;
    if (entry.current === null) return 'up';
    if (entry.value === null) return 'down';
    return entry.value > entry.current ? 'up' : 'down';
  }

  protected changeText(entry: RoomEntry): string {
    return format(this.messages.roomChange, {
      from: entry.current ?? this.messages.noValue,
      to: entry.value ?? this.messages.noValue,
    });
  }

  protected changeLabel(item: RankedItem, entry: RoomEntry): string {
    return format(this.messages.roomChangeLabel, {
      id: item.externalId,
      from: entry.current ?? this.messages.noValue,
      to: entry.value ?? this.messages.noValue,
    });
  }

  protected detailLabel(item: RankedItem): string {
    return format(MESSAGES.board.openDetail, { id: item.externalId });
  }
}
