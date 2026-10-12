import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { Feature, SessionState } from '../api/contract';
import { computedDisplay, missingScore } from '../board/feature-cells';
import { MESSAGES } from '../i18n/messages.fr';
import { DrawerComponent } from '../shared/drawer.component';
import { SessionStateService } from '../session/session-state.service';

interface Row {
  readonly feature: Feature;
  /** Numéro du tour ouvert qui contient déjà la fonctionnalité, `null` si elle est libre. */
  readonly lockedBy: number | null;
  readonly kind: 'outOfScale' | 'unrated' | 'scored';
}

/**
 * « Ouvrir un tour de vote » (écran 4 bis, FR-018), pour l'animateur sur ordinateur : une, plusieurs ou toutes les
 * fonctionnalités par cases à cocher, avec recherche et sélections rapides. Une fonctionnalité déjà dans un tour
 * ouvert est désactivée avec « déjà dans le tour N ». Rien n'est envoyé avant « Ouvrir le tour » ; le tableau ne
 * bouge que sur le `sessionState` diffusé.
 */
@Component({
  selector: 'app-open-round-dialog',
  imports: [DrawerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-drawer labelledBy="open-round-title" [suspended]="suspended()" (closed)="closed.emit()">
      <div drawer-head>
        <h2 id="open-round-title">{{ messages.title }}</h2>
      </div>
      <p class="small muted">{{ messages.lead }}</p>
      <div class="actions" role="group" [attr.aria-label]="messages.quick">
        <span class="small strong">{{ messages.quick }}</span>
        <button type="button" class="btn btn-secondary btn-sm" (click)="selectAll()">
          {{ messages.all }}
        </button>
        <button type="button" class="btn btn-secondary btn-sm" (click)="select('unrated')">
          {{ messages.unrated(count('unrated')) }}
        </button>
        <button type="button" class="btn btn-secondary btn-sm" (click)="select('outOfScale')">
          {{ messages.outOfScale(count('outOfScale')) }}
        </button>
        <button type="button" class="btn btn-secondary btn-sm" (click)="selectToReview()">
          {{ messages.toReview(toReviewCount()) }}
        </button>
        <button type="button" class="btn btn-ghost btn-sm" (click)="selected.set(empty)">
          {{ messages.none }}
        </button>
      </div>
      <div class="field">
        <label for="open-round-search" class="sr-only">{{ messages.search }}</label>
        <input
          id="open-round-search"
          class="input"
          type="search"
          [placeholder]="messages.search"
          [value]="query()"
          (input)="query.set(valueOf($event))"
        />
      </div>
      <div class="table-wrap">
        <table class="pick">
          <thead>
            <tr>
              <th scope="col" class="pick-check">
                <input
                  type="checkbox"
                  [attr.aria-label]="messages.all"
                  [checked]="allVisibleSelected()"
                  (change)="toggleVisible($event)"
                />
              </th>
              <th scope="col">{{ messages.colId }}</th>
              <th scope="col">{{ messages.colTitle }}</th>
              <th scope="col">{{ messages.colState }}</th>
            </tr>
          </thead>
          <tbody>
            @for (row of visibleRows(); track row.feature.id) {
              <tr
                [class.sel]="selected().has(row.feature.id)"
                [class.locked]="row.lockedBy !== null"
              >
                <td class="pick-check">
                  <input
                    type="checkbox"
                    [attr.aria-label]="messages.rowLabel(row.feature.externalId, row.lockedBy)"
                    [disabled]="row.lockedBy !== null"
                    [checked]="selected().has(row.feature.id)"
                    (change)="toggle(row.feature.id)"
                  />
                </td>
                <td>
                  <button
                    type="button"
                    class="fid"
                    [attr.title]="boardMessages.openDetail(row.feature.externalId)"
                    (click)="featureSelected.emit(row.feature.id)"
                  >
                    {{ row.feature.externalId }}
                  </button>
                </td>
                <td class="title">{{ row.feature.title }}</td>
                <td>
                  @if (row.lockedBy !== null) {
                    <span class="badge vote">{{ messages.inRound(row.lockedBy) }}</span>
                  } @else if (row.kind === 'outOfScale') {
                    <span class="badge warn">{{ messages.stateOutOfScale }}</span>
                  } @else if (row.kind === 'unrated') {
                    <span class="badge">{{ messages.stateUnrated }}</span>
                  } @else {
                    <span class="muted small">{{ score(row.feature) }}</span>
                  }
                  @if (row.feature.markedForReview) {
                    <span
                      class="badge review"
                      [attr.title]="boardMessages.reviewTitle(row.feature.reviewReason)"
                      >{{ boardMessages.review }}</span
                    >
                  }
                </td>
              </tr>
            } @empty {
              <tr>
                <td colspan="4" class="muted">{{ messages.empty }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <p class="help">{{ messages.help }}</p>
      @if (error(); as text) {
        <p class="err" role="alert">{{ text }}</p>
      }
      <div drawer-foot class="actions round-foot">
        <span class="small" role="status"
          ><b>{{ selected().size }}</b> {{ selectedText() }}</span
        >
        <span class="actions">
          <button type="button" class="btn btn-secondary" (click)="closed.emit()">
            {{ messages.cancel }}
          </button>
          <button
            type="button"
            class="btn btn-primary"
            [disabled]="selected().size === 0 || busy()"
            (click)="submit()"
          >
            {{ busy() ? messages.submitting : messages.submit(selected().size) }}
          </button>
        </span>
      </div>
    </app-drawer>
  `,
})
export class OpenRoundDialogComponent {
  private readonly session = inject(SessionStateService);
  protected readonly messages = MESSAGES.rounds.dialog;
  protected readonly boardMessages = MESSAGES.board;
  protected readonly empty: ReadonlySet<string> = new Set();

  readonly state = input.required<SessionState>();
  /** Un panneau de détail est ouvert par-dessus : la boîte se cache mais garde la sélection. */
  readonly suspended = input(false);
  readonly closed = output<void>();
  /** Un identifiant a été activé : ouvrir le descriptif de cette fonctionnalité (FR-016b). */
  readonly featureSelected = output<string>();

  protected readonly selected = signal<ReadonlySet<string>>(this.empty);
  protected readonly query = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly rows = computed<readonly Row[]>(() => {
    const open = this.state().openRounds;
    return this.state().features.map((feature) => {
      const round = open.find((r) => r.featureIds.includes(feature.id));
      const missing = missingScore(feature);
      return {
        feature,
        lockedBy: round?.number ?? null,
        kind: missing === 'outOfScale' ? 'outOfScale' : missing ? 'unrated' : 'scored',
      };
    });
  });
  protected readonly visibleRows = computed(() => {
    const query = this.query().trim().toLowerCase();
    return this.rows().filter(
      (row) =>
        query === '' ||
        row.feature.externalId.toLowerCase().includes(query) ||
        row.feature.title.toLowerCase().includes(query),
    );
  });
  private readonly free = computed(() => this.rows().filter((r) => r.lockedBy === null));
  protected readonly allVisibleSelected = computed(() => {
    const free = this.visibleRows().filter((r) => r.lockedBy === null);
    return free.length > 0 && free.every((r) => this.selected().has(r.feature.id));
  });
  protected readonly toReviewCount = computed(
    () => this.free().filter((r) => r.feature.markedForReview).length,
  );
  protected readonly selectedText = computed(() =>
    this.messages.selectedLabel(this.selected().size),
  );

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected count(kind: 'unrated' | 'outOfScale'): number {
    return this.free().filter((r) => r.kind === kind).length;
  }

  /** « WSJF 4,00 » : la dernière valeur calculée de la méthode, telle que le serveur l'a formatée. */
  protected score(feature: Feature): string {
    const computed = this.state().methodDefinition.computedValues;
    const last = computed[computed.length - 1];
    const display = last ? computedDisplay(feature, last.key) : null;
    return last && display ? this.messages.stateScore(last.code, display) : '';
  }

  protected selectAll(): void {
    this.selected.set(new Set(this.free().map((r) => r.feature.id)));
  }

  protected select(kind: 'unrated' | 'outOfScale'): void {
    this.selected.set(
      new Set(
        this.free()
          .filter((r) => r.kind === kind)
          .map((r) => r.feature.id),
      ),
    );
  }

  protected selectToReview(): void {
    this.selected.set(
      new Set(
        this.free()
          .filter((r) => r.feature.markedForReview)
          .map((r) => r.feature.id),
      ),
    );
  }

  protected toggle(id: string): void {
    const next = new Set(this.selected());
    if (!next.delete(id)) next.add(id);
    this.selected.set(next);
  }

  protected toggleVisible(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const next = new Set(this.selected());
    for (const row of this.visibleRows()) {
      if (row.lockedBy !== null) continue;
      if (checked) next.add(row.feature.id);
      else next.delete(row.feature.id);
    }
    this.selected.set(next);
  }

  protected async submit(): Promise<void> {
    if (this.busy() || this.selected().size === 0) return;
    this.busy.set(true);
    this.error.set(null);
    // Dans l'ordre du tableau, pas dans celui des clics.
    const ids = this.state()
      .features.filter((f) => this.selected().has(f.id))
      .map((f) => f.id);
    const result = await this.session.openRound(ids);
    this.busy.set(false);
    if (result.ok) this.closed.emit();
    else this.error.set(MESSAGES.errors[result.code]);
  }
}
