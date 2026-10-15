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
  Levels,
  canJoinAbove,
  canMoveDown,
  canMoveUp,
  joinAbove,
  moveDown,
  moveTo,
  moveUp,
  proposedValues,
} from './ranking';

/** Une fonctionnalité à classer : seul ce qui s'affiche. */
export interface RankedItem {
  readonly id: string;
  readonly externalId: string;
  readonly title: string;
}

/** Classement d'un critère en cours : niveaux, valeur du premier niveau et valeurs modifiées à la main (textes saisis). */
export interface RankingStep {
  readonly levels: Levels;
  readonly top: string;
  readonly overrides: Readonly<Record<string, string>>;
}

/** Les valeurs proposées par niveau ; toutes `null` si la valeur du premier niveau n'est pas valide. */
function proposalsOf(step: RankingStep, scale: SessionScale): (number | null)[] {
  const top = parseCriterionInput(step.top, scale);
  return top === null || top === undefined
    ? step.levels.map(() => null)
    : proposedValues(step.levels.length, top, scale.allowedValues);
}

/**
 * Les valeurs retenues de chaque fonctionnalité du classement, ou `null` si une saisie n'est pas valide (valeur du
 * premier niveau, ou valeur modifiée hors échelle).
 */
export function resolveStep(
  step: RankingStep,
  scale: SessionScale,
): ReadonlyMap<string, number | null> | null {
  const top = parseCriterionInput(step.top, scale);
  if (top === null || top === undefined) return null;
  const proposals = proposalsOf(step, scale);
  const values = new Map<string, number | null>();
  for (const [index, level] of step.levels.entries()) {
    for (const id of level) {
      if (id in step.overrides) {
        const value = parseCriterionInput(step.overrides[id] ?? '', scale);
        if (value === undefined) return null;
        values.set(id, value);
      } else {
        values.set(id, proposals[index] ?? null);
      }
    }
  }
  return values;
}

type Action = 'up' | 'down' | 'join';

/**
 * Classement des fonctionnalités pour un critère (FR-015a) : niveaux du plus fort au plus faible, déplacés par
 * glisser-déposer ou par boutons (clavier), égalités, valeur du premier niveau et valeurs proposées, modifiables une
 * à une. Ne sait rien de l'envoi : il édite un `RankingStep`, ce qui le rend réutilisable pour le vote d'un tour.
 */
@Component({
  selector: 'app-criterion-ranking',
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
        [attr.aria-describedby]="topInvalid() ? 'ranking-top-error' : null"
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
      <span class="muted small">{{ messages.dragHelp }}</span>
    </div>
    @if (topInvalid()) {
      <p id="ranking-top-error" class="err" role="alert">{{ topError() }}</p>
    }

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
                @if (items().get(id); as item) {
                  <li
                    class="rank-item"
                    draggable="true"
                    [attr.data-id]="id"
                    [class.dragging]="dragged() === id"
                    (dragstart)="startDrag($event, id)"
                    (dragend)="endDrag()"
                  >
                    <span class="drag-handle" aria-hidden="true">⠿</span>
                    <span class="fid-text">{{ item.externalId }}</span>
                    <span class="rank-title">{{ item.title }}</span>
                    <span class="rank-value">
                      <input
                        class="input num-input"
                        inputmode="numeric"
                        [attr.aria-label]="valueLabel(item)"
                        [attr.aria-invalid]="invalidIds().has(id)"
                        [value]="valueText(id, index)"
                        (input)="override(id, $any($event.target).value)"
                      />
                      @if (isOverridden(id)) {
                        <span class="badge review">{{ messages.overridden }}</span>
                      }
                    </span>
                    <span class="rank-actions">
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
                    </span>
                  </li>
                }
              }
            </ul>
          </div>
        </li>
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
    @if (invalidIds().size > 0) {
      <p class="err" role="alert">{{ valueError() }}</p>
    }
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

  private readonly proposals = computed(() => proposalsOf(this.step(), this.scale()));

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

  /** La valeur affichée : celle saisie à la main, sinon la proposition du niveau. */
  protected valueText(id: string, level: number): string {
    const overrides = this.step().overrides;
    if (id in overrides) return overrides[id] ?? '';
    const proposal = this.proposals()[level];
    return proposal === null || proposal === undefined ? '' : String(proposal);
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
    this.step.update((step) => ({ ...step, top: text }));
  }

  protected override(id: string, text: string): void {
    this.step.update((step) => ({ ...step, overrides: { ...step.overrides, [id]: text } }));
  }

  protected resetOverrides(): void {
    this.step.update((step) => ({ ...step, overrides: {} }));
  }

  protected act(id: string, action: Action): void {
    const move = action === 'up' ? moveUp : action === 'down' ? moveDown : joinAbove;
    this.setLevels(move(this.step().levels, id));
    // La ligne est recréée à sa nouvelle place : le focus revient sur le même bouton, ou sur sa valeur s'il est grisé.
    afterNextRender(
      () => {
        const row = this.host.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`);
        const button = row?.querySelector<HTMLButtonElement>(`[data-action="${action}"]`);
        (button && !button.disabled ? button : row?.querySelector('input'))?.focus();
      },
      { injector: this.injector },
    );
  }

  // --- Glisser-déposer ------------------------------------------------------------------------------

  protected startDrag(event: DragEvent, id: string): void {
    this.dragged.set(id);
    event.dataTransfer?.setData('text/plain', id);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
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
    if (id !== null) this.setLevels(moveTo(this.step().levels, id, drop));
  }

  private setLevels(levels: Levels): void {
    this.step.update((step) => ({ ...step, levels }));
  }
}
