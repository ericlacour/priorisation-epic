import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  output,
  signal,
} from '@angular/core';

import { CriterionDefinition, Feature } from '../api/session-state';
import { format } from '../i18n/format';
import { MESSAGES } from '../i18n/messages.fr';
import { SessionRoomService } from '../session/session-room.service';
import {
  CriterionRankingComponent,
  RankedItem,
  RankingStep,
  resolveStep,
} from './criterion-ranking.component';
import { initialLevels } from './ranking';

/**
 * Écran « Prioriser par classement » (FR-015a), ouvert depuis le tableau par l'animateur : choix des fonctionnalités
 * et des critères, puis un classement par critère, dans l'ordre de `methodDefinition`. Rien n'est envoyé avant
 * « Terminer » : chaque fonctionnalité modifiée part alors en une seule modification, avec la version lue au début
 * (jamais d'écrasement silencieux), et l'écran rend la main au tableau, que le serveur retrie.
 */
@Component({
  selector: 'app-ranking-screen',
  imports: [CriterionRankingComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'board-page ranking-page', role: 'main' },
  template: `
    @if (state(); as state) {
      <div class="board-head">
        <div>
          <h1 tabindex="-1">{{ messages.title }}</h1>
          <p class="muted small">{{ subtitle() }}</p>
        </div>
        <div class="board-tools">
          <button type="button" class="btn btn-secondary" (click)="closed.emit()">
            {{ messages.cancel }}
          </button>
        </div>
      </div>

      @if (notSent()) {
        <p class="notice danger" role="alert">{{ notConnected }}</p>
      }

      @if (current(); as criterion) {
        <p class="ranking-help">{{ instruction(criterion) }}</p>
        <app-criterion-ranking
          [items]="items()"
          [criterion]="criterion"
          [scale]="state.scale"
          [step]="steps()[criterion.key]!"
          (stepChange)="setStep(criterion.key, $event)"
        />
      } @else {
        <div class="ranking-setup">
          <fieldset class="card ranking-criteria">
            <legend>{{ messages.criteriaLegend }}</legend>
            @for (criterion of state.methodDefinition.criteria; track criterion.key) {
              <label class="check">
                <input
                  type="checkbox"
                  [checked]="chosenCriteria().has(criterion.key)"
                  (change)="toggleCriterion(criterion.key)"
                />
                <b>{{ criterion.code }}</b> · {{ criterion.label }}
              </label>
            }
            @if (chosenCriteria().size === 0) {
              <p class="err" role="alert">{{ messages.criteriaRequired }}</p>
            }
          </fieldset>
          <fieldset class="card ranking-features">
            <legend>{{ messages.featuresLegend }}</legend>
            <div class="ranking-select-all">
              <button type="button" class="link-button small" (click)="selectAll()">
                {{ messages.selectAll }}
              </button>
              <button type="button" class="link-button small" (click)="chosenFeatures.set([])">
                {{ messages.selectNone }}
              </button>
            </div>
            <div class="ranking-feature-list">
              @for (feature of state.features; track feature.id) {
                <label class="check">
                  <input
                    type="checkbox"
                    [disabled]="feature.votingInProgress"
                    [checked]="isChosen(feature)"
                    (change)="toggleFeature(feature.id)"
                  />
                  <span class="fid-text">{{ feature.externalId }}</span>
                  {{ feature.title }}
                  @if (feature.votingInProgress) {
                    <span class="muted small">{{ messages.inRound }}</span>
                  }
                </label>
              }
            </div>
            @if (selectable().length === 0) {
              <p class="err" role="alert">{{ messages.featuresRequired }}</p>
            }
          </fieldset>
        </div>
      }

      <div class="board-actions ranking-nav">
        @if (stepIndex() !== null) {
          <button type="button" class="btn btn-secondary" (click)="previous()">
            {{ messages.previous }}
          </button>
        }
        <button type="button" class="btn btn-primary" [disabled]="!canGoOn()" (click)="next()">
          {{ nextLabel() }}
        </button>
      </div>
    }
  `,
})
export class RankingScreenComponent {
  private readonly room = inject(SessionRoomService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  protected readonly messages = MESSAGES.ranking;
  protected readonly notConnected = MESSAGES.intentErrors.NOT_CONNECTED;

  /** Retour au tableau : après « Terminer » ou « Annuler ». */
  readonly closed = output<void>();

  protected readonly state = this.room.state;
  /** Fonctionnalités choisies, par identifiant : toutes celles hors tour au départ. */
  protected readonly chosenFeatures = signal<readonly string[]>(
    (this.room.state()?.features ?? []).filter((f) => !f.votingInProgress).map((f) => f.id),
  );
  protected readonly chosenCriteria = signal<ReadonlySet<string>>(
    new Set((this.room.state()?.methodDefinition.criteria ?? []).map((c) => c.key)),
  );
  /** `null` : choix des fonctionnalités et des critères ; sinon, l'index du critère classé. */
  protected readonly stepIndex = signal<number | null>(null);
  protected readonly steps = signal<Readonly<Record<string, RankingStep>>>({});
  protected readonly notSent = signal(false);
  /** Les fonctionnalités telles qu'au début du classement : leurs versions et valeurs de départ. */
  private readonly base = signal<readonly Feature[]>([]);

  /** Les fonctionnalités choisies qui existent encore et ne sont pas dans un tour, dans l'ordre du tableau. */
  protected readonly selectable = computed(() => {
    const chosen = new Set(this.chosenFeatures());
    return (this.state()?.features ?? []).filter((f) => chosen.has(f.id) && !f.votingInProgress);
  });

  /** Les critères choisis, dans l'ordre de la définition de la méthode. */
  protected readonly criteria = computed<readonly CriterionDefinition[]>(() =>
    (this.state()?.methodDefinition.criteria ?? []).filter((c) => this.chosenCriteria().has(c.key)),
  );

  protected readonly current = computed(() => {
    const index = this.stepIndex();
    return index === null ? null : (this.criteria()[index] ?? null);
  });

  protected readonly items = computed<ReadonlyMap<string, RankedItem>>(
    () => new Map(this.base().map((f) => [f.id, f])),
  );

  protected readonly canGoOn = computed(() => {
    const criterion = this.current();
    const scale = this.state()?.scale;
    if (!criterion || !scale) return this.selectable().length > 0 && this.criteria().length > 0;
    const step = this.steps()[criterion.key];
    return step !== undefined && resolveStep(step, scale) !== null;
  });

  protected readonly nextLabel = computed(() => {
    const index = this.stepIndex();
    if (index === null) return this.messages.start;
    return index === this.criteria().length - 1 ? this.messages.finish : this.messages.next;
  });

  protected readonly subtitle = computed(() => {
    const index = this.stepIndex();
    const criterion = this.current();
    if (index === null || !criterion) return this.messages.setupSubtitle;
    return format(this.messages.stepSubtitle, {
      step: index + 1,
      total: this.criteria().length,
      code: criterion.code,
      label: criterion.label,
      count: this.base().length,
    });
  });

  constructor() {
    // Plus de droits d'animateur (jeton refusé, rôle transmis) : retour au tableau.
    effect(() => {
      if (!this.room.canAnimate()) this.closed.emit();
    });
    afterNextRender(() => this.focusTitle());
  }

  protected instruction(criterion: CriterionDefinition): string {
    return format(this.messages.instruction, { code: criterion.code, label: criterion.label });
  }

  protected isChosen(feature: Feature): boolean {
    return !feature.votingInProgress && this.chosenFeatures().includes(feature.id);
  }

  protected toggleFeature(id: string): void {
    this.chosenFeatures.update((ids) =>
      ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id],
    );
  }

  protected selectAll(): void {
    this.chosenFeatures.set(
      (this.state()?.features ?? []).filter((f) => !f.votingInProgress).map((f) => f.id),
    );
  }

  protected toggleCriterion(key: string): void {
    this.chosenCriteria.update((keys) => {
      const next = new Set(keys);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  protected setStep(key: string, step: RankingStep): void {
    this.steps.update((steps) => ({ ...steps, [key]: step }));
  }

  protected previous(): void {
    const index = this.stepIndex();
    this.stepIndex.set(index === null || index === 0 ? null : index - 1);
    this.focusTitle();
  }

  protected next(): void {
    if (!this.canGoOn()) return;
    const index = this.stepIndex();
    if (index === null) {
      this.start();
    } else if (index < this.criteria().length - 1) {
      this.stepIndex.set(index + 1);
    } else {
      this.finish();
      return;
    }
    this.focusTitle();
  }

  /**
   * Commence (ou recommence après un retour au choix) : les classements déjà faits sont gardés si la sélection n'a
   * pas changé ; sinon chaque critère repart des valeurs actuelles.
   */
  private start(): void {
    const features = this.selectable();
    const before = this.base();
    const sameSelection =
      features.length === before.length && features.every((f, i) => before[i]?.id === f.id);
    if (!sameSelection) {
      this.base.set(features);
      this.steps.set({});
    }
    const base = this.base();
    const scale = this.state()?.scale;
    const steps = { ...this.steps() };
    for (const criterion of this.criteria()) {
      steps[criterion.key] ??= {
        levels: initialLevels(
          base.map((f) => f.id),
          (id) => base.find((f) => f.id === id)?.criteria?.[criterion.key],
        ),
        top: String(scale?.max ?? ''),
        overrides: {},
      };
    }
    this.steps.set(steps);
    this.stepIndex.set(0);
  }

  /** Une modification par fonctionnalité dont une valeur change, avec la version du début du classement. */
  private finish(): void {
    const scale = this.state()?.scale;
    if (!scale) return;
    const changes = new Map<string, Record<string, number | null>>();
    for (const criterion of this.criteria()) {
      const step = this.steps()[criterion.key];
      const values = step ? resolveStep(step, scale) : null;
      if (!values) return;
      for (const feature of this.base()) {
        const value = values.get(feature.id) ?? null;
        if (value === (feature.criteria?.[criterion.key] ?? null)) continue;
        changes.set(feature.id, { ...changes.get(feature.id), [criterion.key]: value });
      }
    }
    const existing = new Set((this.state()?.features ?? []).map((f) => f.id));
    for (const feature of this.base()) {
      const criteria = changes.get(feature.id);
      if (!criteria || !existing.has(feature.id)) continue;
      const sent = this.room.updateFeature({
        featureId: feature.id,
        version: feature.version,
        criteria,
      });
      if (!sent) {
        this.notSent.set(true);
        return;
      }
    }
    this.closed.emit();
  }

  private focusTitle(): void {
    this.host.querySelector<HTMLElement>('h1')?.focus();
  }
}
