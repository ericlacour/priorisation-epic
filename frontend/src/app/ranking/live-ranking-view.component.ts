import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';

import { ActiveRankingRoom, CardOpinion, OpinionKind, OPINION_KINDS } from '../api/contract';
import { format } from '../i18n/format';
import { MESSAGES } from '../i18n/messages.fr';
import { ScreenSizeService } from '../layout/screen-size.service';
import { SessionRoomService } from '../session/session-room.service';
import { FeatureDetailPanelComponent } from '../board/feature-detail-panel.component';
import { CardOpinionsComponent } from './card-opinions.component';
import { OpinionListComponent } from './opinion-list.component';
import {
  OPINION_SYMBOLS,
  defaultWanted,
  opinionText,
  opinionsByFeature,
  opinionsOf,
  wantedChoices,
} from './opinions';

/** Une carte déplacée par l'animateur reste signalée ce temps-là. */
export const MOVED_HIGHLIGHT_MS = 1_500;

/** Position d'une fonctionnalité dans le brouillon : son niveau, ou -1 (non classée). */
function positions(room: ActiveRankingRoom): ReadonlyMap<string, number> {
  const at = new Map<string, number>();
  room.draft.levels.forEach((level, index) => level.forEach((id) => at.set(id, index)));
  room.draft.unranked.forEach((id) => at.set(id, -1));
  return at;
}

/**
 * Le classement de l'animateur suivi en direct par un participant (FR-015b), à la place du tableau, en lecture seule.
 * Chacun donne son avis sur une carte (✓, ↑, ↓) avec, pour ↑ et ↓, la valeur qu'il donnerait (le cran suivant de
 * l'échelle d'emblée) et un commentaire facultatif (FR-015c) ; à droite, ses avis. Un clic sur
 * l'identifiant d'une carte ouvre son descriptif. La carte que l'animateur
 * vient de déplacer est signalée, et ramenée à la vue tant que le participant suit l'animateur. Sur téléphone, la vue
 * est en lecture seule, sans avis.
 */
@Component({
  selector: 'app-live-ranking-view',
  imports: [
    NgTemplateOutlet,
    CardOpinionsComponent,
    FeatureDetailPanelComponent,
    OpinionListComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'board-page ranking-page live-ranking', role: 'main' },
  template: `
    @if (room.rankingRoom(); as live) {
      <div class="board-head ranking-head">
        <div class="ranking-heading">
          <div class="ranking-title">
            <h1 tabindex="-1">{{ messages.title }}</h1>
            <span class="muted small">{{ subtitle() }}</span>
          </div>
          <p class="small ranking-help">{{ messages.readOnly }}</p>
        </div>
      </div>

      <div class="notice info live-follow" role="status">
        <span>{{ followText() }}</span>
        <button type="button" class="btn btn-secondary btn-sm" (click)="follow.set(!follow())">
          {{ followButton() }}
        </button>
      </div>
      @if (screen.isPhone()) {
        <p class="notice info">{{ messages.phoneReadOnly }}</p>
      }

      <div class="ranking-with-room" [class.with-panel]="!screen.isPhone()">
        <div class="criterion-ranking">
          <div class="ranking-lists">
            <section class="rank-column rank-unranked" aria-labelledby="live-unranked-title">
              <h2 id="live-unranked-title" class="rank-column-title">
                {{ messages.unrankedTitle }}
                <span class="rank-count">{{ live.draft.unranked.length }}</span>
              </h2>
              <ul class="rank-items rank-scroll">
                @for (id of live.draft.unranked; track id) {
                  <ng-container [ngTemplateOutlet]="row" [ngTemplateOutletContext]="{ id }" />
                }
              </ul>
            </section>
            <section class="rank-column rank-ranked" aria-labelledby="live-ranked-title">
              <h2 id="live-ranked-title" class="rank-column-title">
                {{ messages.levelsTitle }}
                <span class="rank-count">{{ rankedCount() }}</span>
              </h2>
              <ol class="ranking-levels rank-scroll" [attr.aria-label]="criterionLabel()">
                @for (level of live.draft.levels; track $index; let index = $index) {
                  <li class="rank-level" [class.rank-level-alt]="index % 2 === 1">
                    <div class="rank-level-body">
                      <span class="rank" [attr.aria-label]="levelLabel(index)">{{
                        index + 1
                      }}</span>
                      <ul class="rank-items">
                        @for (id of level; track id) {
                          <ng-container
                            [ngTemplateOutlet]="row"
                            [ngTemplateOutletContext]="{ id }"
                          />
                        }
                      </ul>
                    </div>
                  </li>
                }
              </ol>
            </section>
          </div>
        </div>

        @if (!screen.isPhone()) {
          <aside class="opinions-panel" [attr.aria-label]="messages.myOpinions">
            @if (live.spotlightFeatureId; as spotlightId) {
              <section class="opinion-block" aria-labelledby="live-spotlight-title">
                <h2 id="live-spotlight-title" class="rank-column-title">
                  {{ messages.spotlight }}
                </h2>
                <div class="opinion-card spotlight">
                  <p class="opinion-card-title">
                    <span class="fid-text">{{ featureOf(spotlightId)?.externalId }}</span>
                    {{ featureOf(spotlightId)?.title }}
                  </p>
                  <app-opinion-list [opinions]="opinionsOf(live, spotlightId)" [names]="names()" />
                </div>
              </section>
            }

            @if (composing(); as draft) {
              <form class="opinion-card opinion-composer" (submit)="sendComment($event)">
                <p class="opinion-card-title">{{ composerTitle(draft.id, draft.kind) }}</p>
                @if (choices(live, draft.id, draft.kind).length > 0) {
                  <div class="opinion-wanted">
                    <label class="small" for="opinion-value">{{ messages.wantedLabel }}</label>
                    <select
                      id="opinion-value"
                      class="input"
                      [value]="wantedOf(draft.id)"
                      (change)="setWanted(draft.id, draft.kind, $any($event.target).value)"
                    >
                      @for (value of choices(live, draft.id, draft.kind); track value) {
                        <option [value]="value" [selected]="value === wantedOf(draft.id)">
                          {{ value }}
                        </option>
                      }
                    </select>
                  </div>
                }
                <label class="small" for="opinion-comment">{{ messages.commentLabel }}</label>
                <input
                  id="opinion-comment"
                  class="input"
                  maxlength="140"
                  [placeholder]="messages.commentPlaceholder"
                  [value]="mine().get(draft.id)?.comment ?? ''"
                />
                <div class="board-actions">
                  <button type="button" class="btn btn-ghost btn-sm" (click)="composing.set(null)">
                    {{ messages.commentSkip }}
                  </button>
                  <button type="submit" class="btn btn-primary btn-sm">
                    {{ messages.commentSend }}
                  </button>
                </div>
              </form>
            }

            <section class="opinion-block" aria-labelledby="my-opinions-title">
              <h2 id="my-opinions-title" class="rank-column-title">
                {{ messages.myOpinions }} <span class="rank-count">{{ mine().size }}</span>
              </h2>
              @for (entry of mineList(); track entry.featureId) {
                <div class="opinion-card">
                  <p class="opinion-card-title">
                    <span class="fid-text">{{ featureOf(entry.featureId)?.externalId }}</span>
                    <span class="opinion-kind" [attr.data-opinion]="entry.opinion">
                      {{ symbols[entry.opinion] }} {{ opinionText(entry) }}
                    </span>
                  </p>
                  @if (entry.comment) {
                    <q class="opinion-comment">{{ entry.comment }}</q>
                  }
                  <div class="board-actions">
                    <button
                      type="button"
                      class="btn btn-secondary btn-sm"
                      (click)="compose(entry.featureId, entry.opinion)"
                    >
                      {{ entry.comment ? messages.commentEdit : messages.commentAdd }}
                    </button>
                    <button
                      type="button"
                      class="btn btn-ghost btn-sm"
                      (click)="give(entry.featureId, null)"
                    >
                      {{ messages.withdraw }}
                    </button>
                  </div>
                </div>
              } @empty {
                <p class="muted small">{{ messages.noMyOpinion }}</p>
              }
            </section>
          </aside>
        }
      </div>

      <ng-template #row let-id="id">
        @if (featureOf(id); as feature) {
          <li
            class="rank-item"
            [attr.data-id]="id"
            [class.spotlight]="live.spotlightFeatureId === id"
            [class.just-moved]="moved().has(id)"
          >
            <button
              type="button"
              class="fid"
              [attr.title]="detailLabel(feature.externalId)"
              (click)="detailId.set(id)"
            >
              {{ feature.externalId }}
            </button>
            <span class="rank-title" [attr.title]="feature.title">{{ feature.title }}</span>
            @if (opinions().get(id); as cardOpinions) {
              <app-card-opinions
                [opinions]="cardOpinions"
                [names]="names()"
                [featureLabel]="feature.externalId"
              />
            }
            <span class="rank-value live-value">{{ valueOf(live, id) }}</span>
            @if (!screen.isPhone()) {
              <span class="rank-actions opinion-buttons">
                @for (kind of kinds; track kind) {
                  <button
                    type="button"
                    class="btn btn-ghost btn-icon"
                    [attr.data-opinion]="kind"
                    [attr.aria-pressed]="mine().get(id)?.opinion === kind"
                    [attr.aria-label]="opinionLabel(kind, feature.externalId)"
                    [attr.title]="messages.opinions[kind]"
                    (click)="toggle(id, kind)"
                  >
                    {{ symbols[kind] }}
                  </button>
                }
              </span>
            }
          </li>
        }
      </ng-template>

      @if (detailId(); as detail) {
        @if (featureOf(detail); as feature) {
          <app-feature-detail-panel [feature]="feature" (closed)="detailId.set(null)" />
        }
      }
    }
  `,
})
export class LiveRankingViewComponent {
  protected readonly room = inject(SessionRoomService);
  protected readonly screen = inject(ScreenSizeService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  protected readonly messages = MESSAGES.liveRanking;
  protected readonly symbols = OPINION_SYMBOLS;
  protected readonly kinds = OPINION_KINDS;
  protected readonly opinionText = opinionText;

  /** Le participant suit l'animateur : la carte déplacée est ramenée à la vue. */
  protected readonly follow = signal(true);
  /** La carte dont le participant écrit le commentaire, ou `null`. */
  protected readonly composing = signal<{ readonly id: string; readonly kind: OpinionKind } | null>(
    null,
  );
  /** La fonctionnalité dont le descriptif est ouvert, ou `null`. */
  protected readonly detailId = signal<string | null>(null);
  /** Les cartes que l'animateur vient de déplacer. */
  protected readonly moved = signal<ReadonlySet<string>>(new Set());

  protected readonly names = computed<ReadonlyMap<string, string>>(
    () => new Map((this.room.state()?.participants ?? []).map((p) => [p.participantId, p.pseudo])),
  );

  protected readonly features = computed(
    () => new Map((this.room.state()?.features ?? []).map((f) => [f.id, f])),
  );

  /** Les valeurs de l'échelle de la session, croissantes. */
  protected readonly allowed = computed(() => this.room.state()?.scale.allowedValues ?? []);

  private readonly criterion = computed(() => {
    const key = this.room.rankingRoom()?.draft.criterionKey;
    return this.room.state()?.methodDefinition.criteria.find((c) => c.key === key) ?? null;
  });

  private readonly facilitator = computed(() => {
    const room = this.room.rankingRoom();
    return (room && this.names().get(room.facilitatorId)) ?? '';
  });

  protected readonly opinions = computed(() => {
    const room = this.room.rankingRoom();
    return room ? opinionsByFeature(room) : new Map<string, readonly CardOpinion[]>();
  });

  /** Mes avis sur le critère en cours, par fonctionnalité. */
  protected readonly mine = computed<ReadonlyMap<string, CardOpinion>>(() => {
    const me = this.room.state()?.me?.participantId;
    const room = this.room.rankingRoom();
    if (!me || !room) return new Map();
    return new Map(
      room.opinions
        .filter((o) => o.participantId === me && o.criterionKey === room.draft.criterionKey)
        .map((o) => [o.featureId, o]),
    );
  });

  protected readonly mineList = computed(() => [...this.mine().values()]);

  protected readonly rankedCount = computed(
    () => this.room.rankingRoom()?.draft.levels.reduce((n, level) => n + level.length, 0) ?? 0,
  );

  protected readonly subtitle = computed(() => {
    const criterion = this.criterion();
    return format(this.messages.subtitle, {
      pseudo: this.facilitator(),
      code: criterion?.code ?? '',
      label: criterion?.label ?? '',
    });
  });

  protected readonly criterionLabel = computed(() =>
    format(MESSAGES.ranking.listLabel, { code: this.criterion()?.code ?? '' }),
  );

  protected readonly followText = computed(() => {
    const pseudo = this.facilitator();
    if (this.room.rankingRoom()?.live === false) return format(this.messages.paused, { pseudo });
    return format(this.follow() ? this.messages.following : this.messages.browsing, { pseudo });
  });

  protected readonly followButton = computed(() =>
    this.follow()
      ? this.messages.browse
      : format(this.messages.follow, { pseudo: this.facilitator() }),
  );

  constructor() {
    let previous: ReadonlyMap<string, number> | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    inject(DestroyRef).onDestroy(() => clearTimeout(timer));
    effect(() => {
      const room = this.room.rankingRoom();
      if (!room) return;
      const now = positions(room);
      const before = previous;
      previous = now;
      if (!before) return;
      const moved = new Set([...now].filter(([id, at]) => before.get(id) !== at).map(([id]) => id));
      if (moved.size === 0) return;
      this.moved.set(moved);
      clearTimeout(timer);
      timer = setTimeout(() => this.moved.set(new Set()), MOVED_HIGHLIGHT_MS);
      if (this.follow()) this.reveal([...moved][0] ?? '');
    });
    afterNextRender(() => this.host.querySelector<HTMLElement>('h1')?.focus());
  }

  protected featureOf(id: string) {
    return this.features().get(id);
  }

  protected opinionsOf(room: ActiveRankingRoom, id: string): readonly CardOpinion[] {
    return opinionsOf(room, id);
  }

  protected valueOf(room: ActiveRankingRoom, id: string): string {
    const value = room.draft.values[id];
    return value === null || value === undefined ? this.messages.noValue : String(value);
  }

  protected detailLabel(id: string): string {
    return format(MESSAGES.board.openDetail, { id });
  }

  /** Les valeurs que le participant peut demander pour monter ou descendre cette carte. */
  protected choices(room: ActiveRankingRoom, id: string, kind: OpinionKind): readonly number[] {
    return kind === 'AGREE'
      ? []
      : wantedChoices(this.allowed(), room.draft.values[id] ?? null, kind);
  }

  /** La valeur souhaitée de mon avis sur cette carte. */
  protected wantedOf(id: string): number | undefined {
    return this.mine().get(id)?.value;
  }

  /** Change la valeur souhaitée : elle part aussitôt, le commentaire reste. */
  protected setWanted(id: string, kind: OpinionKind, text: string): void {
    const criterionKey = this.room.rankingRoom()?.draft.criterionKey;
    const value = Number(text);
    if (!criterionKey || kind === 'AGREE' || !Number.isInteger(value)) return;
    this.room.giveOpinion(id, criterionKey, kind, undefined, value);
  }

  protected levelLabel(index: number): string {
    return format(this.messages.levelLabel, { level: index + 1 });
  }

  protected opinionLabel(kind: OpinionKind, id: string): string {
    return format(this.messages.opinionLabel, { opinion: this.messages.opinions[kind], id });
  }

  protected composerTitle(id: string, kind: OpinionKind): string {
    return format(this.messages.commentTitle, {
      id: this.featureOf(id)?.externalId ?? '',
      opinion: `${this.symbols[kind]} ${this.messages.opinions[kind]}`,
    });
  }

  /**
   * Un clic donne l'avis, puis propose la valeur souhaitée (↑, ↓) et un commentaire ; un second clic sur le même avis
   * le retire. Monter ou descendre part d'emblée avec le cran suivant de l'échelle.
   */
  protected toggle(id: string, kind: OpinionKind): void {
    if (this.mine().get(id)?.opinion === kind) {
      this.give(id, null);
      return;
    }
    if (this.give(id, kind)) this.compose(id, kind);
  }

  protected give(id: string, kind: OpinionKind | null): boolean {
    const room = this.room.rankingRoom();
    if (!room) return false;
    if (kind === null && this.composing()?.id === id) this.composing.set(null);
    const value =
      kind === null || kind === 'AGREE'
        ? undefined
        : defaultWanted(this.allowed(), room.draft.values[id] ?? null, kind);
    return this.room.giveOpinion(id, room.draft.criterionKey, kind, undefined, value);
  }

  /** Ouvre le champ du commentaire de cette carte, aussitôt l'avis donné, sans attendre l'écho du serveur. */
  protected compose(id: string, kind: OpinionKind): void {
    this.composing.set({ id, kind });
    afterNextRender(() => this.host.querySelector<HTMLInputElement>('#opinion-comment')?.focus(), {
      injector: this.injector,
    });
  }

  protected sendComment(event: Event): void {
    event.preventDefault();
    const draft = this.composing();
    const criterionKey = this.room.rankingRoom()?.draft.criterionKey;
    const input = this.host.querySelector<HTMLInputElement>('#opinion-comment');
    if (!draft || !criterionKey || !input) return;
    this.room.giveOpinion(draft.id, criterionKey, draft.kind, input.value.trim());
    this.composing.set(null);
  }

  private reveal(id: string): void {
    afterNextRender(
      () =>
        this.host
          .querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)
          ?.scrollIntoView?.({ block: 'nearest' }),
      { injector: this.injector },
    );
  }
}
