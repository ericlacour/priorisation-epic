import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  input,
  model,
  signal,
} from '@angular/core';

import { CriterionDefinition, SessionScale } from '../api/session-state';
import { parseCriterionInput } from '../board/feature-editor.component';
import { format } from '../i18n/format';
import { MESSAGES } from '../i18n/messages.fr';
import {
  Drop,
  RankingStep,
  canJoinAbove,
  canMoveDown,
  canMoveUp,
  joinAbove,
  levelValues,
  moveDown,
  moveTo,
  moveUp,
  place,
  unrank,
  withPending,
} from './ranking';

/** Une fonctionnalité à classer : seul ce qui s'affiche. */
export interface RankedItem {
  readonly id: string;
  readonly externalId: string;
  readonly title: string;
}

type Action = 'up' | 'down' | 'join' | 'last';

/**
 * Classement des fonctionnalités pour un critère (FR-015a) : niveaux du plus fort au plus faible, déplacés par
 * glisser-déposer (par la poignée ⠿, pour que les champs de valeur restent cliquables) ou par boutons (clavier),
 * égalités, fonctionnalités non classées, valeur du premier niveau et valeurs proposées, modifiables une à une. Ne
 * sait rien de l'envoi : il édite un `RankingStep`, ce qui le rend réutilisable pour le vote d'un tour.
 */
@Component({
  selector: 'app-criterion-ranking',
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'criterion-ranking' },
  template: `
    <div class="ranking-top">
      <label class="ranking-top-label" for="ranking-top-value">{{ topLabel() }}</label>
      <input
        id="ranking-top-value"
        class="input num-input"
        inputmode="numeric"
        [attr.aria-invalid]="topInvalid()"
        [attr.aria-describedby]="topInvalid() ? 'ranking-top-error' : 'ranking-top-help'"
        [value]="step().top"
        (input)="setTop($any($event.target).value)"
      />
      <button
        type="button"
        class="btn btn-secondary btn-sm"
        [disabled]="!hasOverrides()"
        (click)="resetOverrides()"
      >
        {{ messages.resetProposals }}
      </button>
      <span id="ranking-top-help" class="muted small">{{ messages.topHelp }}</span>
    </div>
    @if (topInvalid()) {
      <p id="ranking-top-error" class="err" role="alert">{{ topError() }}</p>
    }

    <div class="ranking-lists">
      <ol class="ranking-levels" [attr.aria-label]="listLabel()">
        @for (level of step().levels; track $index; let index = $index) {
          <li class="rank-level">
            <div
              class="rank-gap"
              aria-hidden="true"
              [class.drop-target]="dropTarget() === 'before-' + index"
              (dragover)="allowDrop($event, 'before-' + index)"
              (dragleave)="dropTarget.set(null)"
              (drop)="drop($event, { before: index })"
            ></div>
            <div
              class="rank-level-body"
              [class.drop-target]="dropTarget() === 'into-' + index"
              (dragover)="allowDrop($event, 'into-' + index)"
              (dragleave)="dropTarget.set(null)"
              (drop)="drop($event, { into: index })"
            >
              <span class="rank" [attr.aria-label]="levelLabel(index)">{{ index + 1 }}</span>
              <ul class="rank-items">
                @for (id of level; track id) {
                  <ng-container
                    [ngTemplateOutlet]="row"
                    [ngTemplateOutletContext]="{ id, value: valueText(id, index), ranked: true }"
                  />
                }
              </ul>
            </div>
          </li>
        } @empty {
          <li class="muted small rank-empty">{{ messages.emptyRanking }}</li>
        }
        <li
          class="rank-gap rank-gap-end"
          aria-hidden="true"
          [class.drop-target]="dropTarget() === 'end'"
          (dragover)="allowDrop($event, 'end')"
          (dragleave)="dropTarget.set(null)"
          (drop)="drop($event, { before: step().levels.length })"
        ></li>
      </ol>

      @if (step().unranked.length > 0 || dragged() !== null) {
        <section
          class="rank-unranked"
          [attr.aria-label]="messages.unrankedTitle"
          [class.drop-target]="dropTarget() === 'unranked'"
          (dragover)="allowDrop($event, 'unranked')"
          (dragleave)="dropTarget.set(null)"
          (drop)="dropUnranked($event)"
        >
          <h2 class="small">{{ messages.unrankedTitle }}</h2>
          <p class="muted small">{{ messages.unrankedHelp }}</p>
          <ul class="rank-items">
            @for (id of step().unranked; track id) {
              <ng-container
                [ngTemplateOutlet]="row"
                [ngTemplateOutletContext]="{ id, value: valueText(id, -1), ranked: false }"
              />
            }
          </ul>
        </section>
      }
    </div>
    @if (invalidIds().size > 0) {
      <p class="err" role="alert">{{ valueError() }}</p>
    }

    <ng-template #row let-id="id" let-value="value" let-ranked="ranked">
      @if (items().get(id); as item) {
        <li class="rank-item" [attr.data-id]="id" [class.dragging]="dragged() === id">
          <span
            class="drag-handle"
            draggable="true"
            aria-hidden="true"
            [attr.title]="messages.dragHandle"
            (dragstart)="startDrag($event, id)"
            (dragend)="endDrag()"
            >⠿</span
          >
          <span class="fid-text">{{ item.externalId }}</span>
          <span class="rank-title">{{ item.title }}</span>
          <span class="rank-value">
            <input
              class="input num-input"
              inputmode="numeric"
              [attr.aria-label]="valueLabel(item)"
              [attr.aria-invalid]="invalidIds().has(id)"
              [value]="value"
              (input)="override(id, $any($event.target).value)"
            />
            @if (isOverridden(id)) {
              <span class="badge review">{{ messages.overridden }}</span>
            }
          </span>
          <span class="rank-actions">
            @if (ranked) {
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                data-action="up"
                [attr.aria-label]="actionLabel(messages.moveUp, item)"
                [disabled]="!canUp(id)"
                (click)="act(id, 'up')"
              >
                ↑ {{ messages.moveUp }}
              </button>
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                data-action="down"
                [attr.aria-label]="actionLabel(messages.moveDown, item)"
                [disabled]="!canDown(id)"
                (click)="act(id, 'down')"
              >
                ↓ {{ messages.moveDown }}
              </button>
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                data-action="join"
                [attr.aria-label]="actionLabel(messages.joinAbove, item)"
                [disabled]="!canJoin(id)"
                (click)="act(id, 'join')"
              >
                = {{ messages.joinAbove }}
              </button>
            } @else {
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                data-action="last"
                [attr.aria-label]="actionLabel(messages.rankLast, item)"
                (click)="act(id, 'last')"
              >
                ↑ {{ messages.rankLast }}
              </button>
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                data-action="join"
                [attr.aria-label]="actionLabel(messages.joinLast, item)"
                [disabled]="step().levels.length === 0"
                (click)="act(id, 'join')"
              >
                = {{ messages.joinLast }}
              </button>
            }
          </span>
        </li>
      }
    </ng-template>
  `,
})
export class CriterionRankingComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  protected readonly messages = MESSAGES.ranking;

  readonly items = input.required<ReadonlyMap<string, RankedItem>>();
  readonly criterion = input.required<CriterionDefinition>();
  readonly scale = input.required<SessionScale>();
  readonly step = model.required<RankingStep>();

  protected readonly dragged = signal<string | null>(null);
  protected readonly dropTarget = signal<string | null>(null);

  /** La valeur de chaque niveau ; vide si la valeur du premier niveau n'est pas valide. */
  private readonly levels = computed(() => levelValues(this.step(), this.scale()) ?? []);

  protected readonly topInvalid = computed(() => {
    const top = parseCriterionInput(this.step().top, this.scale());
    return top === null || top === undefined;
  });

  protected readonly invalidIds = computed(() => {
    const invalid = new Set<string>();
    for (const [id, text] of Object.entries(this.step().overrides)) {
      if (parseCriterionInput(text, this.scale()) === undefined) invalid.add(id);
    }
    return invalid;
  });

  protected readonly hasOverrides = computed(() => Object.keys(this.step().overrides).length > 0);

  protected readonly topLabel = computed(() =>
    format(this.messages.topLabel, { code: this.criterion().code }),
  );
  protected readonly topError = computed(() =>
    format(this.messages.topInvalid, { max: this.scale().max }),
  );
  protected readonly valueError = computed(() =>
    format(MESSAGES.editor.valueInvalid, { code: this.criterion().code, max: this.scale().max }),
  );
  protected readonly listLabel = computed(() =>
    format(this.messages.listLabel, { code: this.criterion().code }),
  );

  protected levelLabel(index: number): string {
    return format(this.messages.levelLabel, { level: index + 1 });
  }

  protected valueLabel(item: RankedItem): string {
    return format(this.messages.valueLabel, {
      code: this.criterion().code,
      id: item.externalId,
    });
  }

  protected actionLabel(action: string, item: RankedItem): string {
    return `${action} : ${item.externalId}`;
  }

  /** La valeur affichée : celle saisie à la main, sinon celle du niveau ; vide pour une non classée (`level` -1). */
  protected valueText(id: string, level: number): string {
    const overrides = this.step().overrides;
    if (id in overrides) return overrides[id] ?? '';
    const value = this.levels()[level];
    return value === null || value === undefined ? '' : String(value);
  }

  protected isOverridden(id: string): boolean {
    return id in this.step().overrides;
  }

  protected canUp(id: string): boolean {
    return canMoveUp(this.step().levels, id);
  }

  protected canDown(id: string): boolean {
    return canMoveDown(this.step().levels, id);
  }

  protected canJoin(id: string): boolean {
    return canJoinAbove(this.step().levels, id);
  }

  protected setTop(text: string): void {
    this.step.update((step) => ({ ...step, top: text, topTouched: true }));
  }

  protected override(id: string, text: string): void {
    this.step.update((step) => ({ ...step, overrides: { ...step.overrides, [id]: text } }));
  }

  protected resetOverrides(): void {
    this.step.update((step) => ({ ...step, overrides: {} }));
  }

  protected act(id: string, action: Action): void {
    const step = this.step();
    // Une non classée occupe provisoirement un dernier niveau : « Classer en dernier » la garde là, « Égalité » la
    // joint au niveau au-dessus, c'est-à-dire au dernier.
    const levels = withPending(step, id);
    const moved =
      action === 'last'
        ? [...levels]
        : action === 'up'
          ? moveUp(levels, id)
          : action === 'down'
            ? moveDown(levels, id)
            : joinAbove(levels, id);
    this.step.set(place(step, id, moved === levels && action !== 'last' ? step.levels : moved));
    // La ligne est recréée à sa nouvelle place : le focus revient sur le même bouton, ou sur sa valeur s'il est grisé.
    const focusAction = action === 'last' ? 'up' : action;
    afterNextRender(
      () => {
        const row = this.host.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`);
        const button = row?.querySelector<HTMLButtonElement>(`[data-action="${focusAction}"]`);
        (button && !button.disabled ? button : row?.querySelector('input'))?.focus();
      },
      { injector: this.injector },
    );
  }

  // --- Glisser-déposer ------------------------------------------------------------------------------

  protected startDrag(event: DragEvent, id: string): void {
    this.dragged.set(id);
    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', id);
      event.dataTransfer.effectAllowed = 'move';
      // On glisse toute la ligne, pas seulement la poignée.
      const row = (event.target as HTMLElement | null)?.closest('.rank-item');
      if (row) event.dataTransfer.setDragImage(row, 0, 0);
    }
  }

  protected endDrag(): void {
    this.dragged.set(null);
    this.dropTarget.set(null);
  }

  protected allowDrop(event: DragEvent, target: string): void {
    if (this.dragged() === null) return;
    event.preventDefault();
    this.dropTarget.set(target);
  }

  protected drop(event: DragEvent, drop: Drop): void {
    event.preventDefault();
    const id = this.dragged();
    this.endDrag();
    if (id === null) return;
    const step = this.step();
    const levels = withPending(step, id);
    const moved = moveTo(levels, id, drop);
    if (moved !== levels) this.step.set(place(step, id, moved));
  }

  protected dropUnranked(event: DragEvent): void {
    event.preventDefault();
    const id = this.dragged();
    this.endDrag();
    if (id !== null) this.step.update((step) => unrank(step, id));
  }
}
