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
  untracked,
} from '@angular/core';

import { ErrorCode, RankingDraft } from '../api/contract';
import { CriterionDefinition, Feature } from '../api/session-state';
import { format } from '../i18n/format';
import { MESSAGES } from '../i18n/messages.fr';
import { SessionRoomService } from '../session/session-room.service';
import { FeatureDetailPanelComponent } from '../board/feature-detail-panel.component';
import { CriterionRankingComponent, RankedItem } from './criterion-ranking.component';
import { OpinionsPanelComponent } from './opinions-panel.component';
import { opinionsByFeature, opinionsSignature, roomGaps, settledKey } from './opinions';
import { RankingStep, draftValues, newStep, reselect, resolveStep } from './ranking';
import { RankingRoomService } from './ranking-room.service';

/** Une fonctionnalité dans un tour de vote ouvert ne se classe pas : ses valeurs viendront du vote. */
const isRankable = (feature: Feature): boolean => !feature.votingInProgress;

/** Les identifiants des fonctionnalités qui peuvent être classées, dans l'ordre du tableau. */
const rankableIds = (features: readonly Feature[] | undefined): string[] =>
  (features ?? []).filter(isRankable).map((feature) => feature.id);

/** Valeurs envoyées pour une fonctionnalité, par clé de critère. */
type Changes = Readonly<Record<string, number | null>>;

/**
 * Écran « Prioriser par classement » (FR-015a), ouvert depuis le tableau par l'animateur : choix des fonctionnalités
 * et des critères, puis un classement par critère, dans l'ordre de `methodDefinition`. Rien n'est envoyé avant
 * « Terminer » : chaque fonctionnalité modifiée part alors en une seule modification, avec la version lue au début
 * (jamais d'écrasement silencieux). L'écran attend que le serveur ait enregistré chaque valeur avant de rendre la main
 * au tableau, que le serveur retrie. Si une modification est refusée (modifiée entre-temps par un autre poste,
 * connexion perdue), il reste ouvert et nomme les fonctionnalités non enregistrées.
 */
@Component({
  selector: 'app-ranking-screen',
  imports: [CriterionRankingComponent, FeatureDetailPanelComponent, OpinionsPanelComponent],
  providers: [RankingRoomService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'board-page ranking-page',
    role: 'main',
    '(keydown.escape)': 'closeHelp()',
  },
  template: `
    @if (state(); as state) {
      <!-- Navigation et consigne dans l'en-tête : toute la hauteur restante va aux listes. -->
      <div class="board-head ranking-head">
        <div class="ranking-heading">
          <div class="ranking-title">
            <h1 tabindex="-1">{{ messages.title }}</h1>
            <span class="muted small">{{ subtitle() }}</span>
          </div>
          @if (current(); as criterion) {
            <p class="small ranking-help">{{ shortInstruction(criterion) }}</p>
          }
        </div>
        <div class="board-tools ranking-nav">
          <div class="ranking-help-menu">
            <button
              type="button"
              class="btn btn-secondary"
              aria-controls="ranking-help-panel"
              [attr.aria-expanded]="helpOpen()"
              (click)="toggleHelp()"
            >
              ? {{ messages.help }}
            </button>
            @if (helpOpen()) {
              <section
                id="ranking-help-panel"
                class="ranking-help-panel"
                aria-labelledby="ranking-help-title"
              >
                <div class="ranking-help-head">
                  <h2 id="ranking-help-title">{{ messages.helpTitle }}</h2>
                  <button
                    type="button"
                    class="btn btn-ghost btn-icon"
                    [attr.aria-label]="messages.helpClose"
                    (click)="closeHelp()"
                  >
                    ✕
                  </button>
                </div>
                @if (current(); as criterion) {
                  <p>{{ instruction(criterion) }}</p>
                }
                <ul>
                  @for (line of messages.helpSteps; track line) {
                    <li>{{ line }}</li>
                  }
                </ul>
              </section>
            }
          </div>
          <button type="button" class="btn btn-secondary" (click)="cancel()">
            {{ messages.cancel }}
          </button>
          @if (stepIndex() !== null && !pending()) {
            <button type="button" class="btn btn-secondary" (click)="previous()">
              {{ messages.previous }}
            </button>
          }
          <button
            type="button"
            class="btn btn-primary"
            [disabled]="!canGoOn() || pending() !== null"
            (click)="next()"
          >
            {{ nextLabel() }}
          </button>
        </div>
      </div>

      @if (failure(); as code) {
        <div class="notice danger ranking-unsaved" role="alert">
          <div>
            <p>{{ failureText(code) }}</p>
            <p>{{ messages.unsavedTitle }}</p>
            <ul>
              @for (line of unsavedLines(); track line) {
                <li>{{ line }}</li>
              }
            </ul>
          </div>
          <div class="board-actions">
            <button
              type="button"
              class="btn btn-primary btn-sm"
              [attr.title]="messages.retryHint"
              (click)="retry()"
            >
              {{ messages.retry }}
            </button>
            <button type="button" class="btn btn-secondary btn-sm" (click)="backToBoard()">
              {{ messages.backToBoard }}
            </button>
          </div>
        </div>
      } @else if (pending()) {
        <p class="notice info" role="status">{{ messages.saving }}</p>
      }

      @if (current(); as criterion) {
        <div class="ranking-with-room" [class.with-panel]="liveRoom() !== null">
          <app-criterion-ranking
            [items]="items()"
            [criterion]="criterion"
            [scale]="state.scale"
            [step]="steps()[criterion.key]!"
            [opinions]="opinions()"
            [names]="names()"
            [spotlightId]="liveRoom()?.spotlightFeatureId ?? null"
            [gaps]="gaps()"
            (stepChange)="setStep(criterion.key, $event)"
          >
            <button
              rankingTopAction
              type="button"
              class="btn btn-secondary btn-sm"
              [class.btn-live]="broadcast.live()"
              [attr.aria-pressed]="broadcast.live()"
              [attr.title]="broadcast.live() ? liveMessages.broadcastHint : liveMessages.pausedHint"
              (click)="broadcast.setLive(!broadcast.live())"
            >
              @if (broadcast.live()) {
                <span class="live-dot" aria-hidden="true"></span> {{ liveMessages.broadcastOn }}
              } @else {
                {{ liveMessages.broadcastOff }}
              }
            </button>
          </app-criterion-ranking>
          @if (liveRoom(); as liveRoom) {
            <app-opinions-panel
              [room]="liveRoom"
              [items]="items()"
              [names]="names()"
              [gaps]="gaps()"
              (spotlightChange)="room.setSpotlight($event)"
              (detailRequested)="detailId.set($event)"
              (clear)="room.clearOpinions($event, criterion.key)"
            />
          }
        </div>
        @if (detailFeature(); as feature) {
          <app-feature-detail-panel
            [feature]="feature"
            [definition]="state.methodDefinition"
            (closed)="detailId.set(null)"
          />
        }
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
                    [disabled]="!isRankable(feature)"
                    [checked]="isChosen(feature)"
                    (change)="toggleFeature(feature.id)"
                  />
                  <span class="fid-text">{{ feature.externalId }}</span>
                  {{ feature.title }}
                  @if (!isRankable(feature)) {
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
    }
  `,
})
export class RankingScreenComponent {
  protected readonly room = inject(SessionRoomService);
  protected readonly broadcast = inject(RankingRoomService);
  protected readonly liveMessages = MESSAGES.liveRanking;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  protected readonly messages = MESSAGES.ranking;

  /** Retour au tableau : après « Terminer » ou « Annuler ». */
  readonly closed = output<void>();

  protected readonly state = this.room.state;
  protected readonly isRankable = isRankable;
  /** Fonctionnalités choisies, par identifiant : toutes celles hors tour au départ. */
  protected readonly chosenFeatures = signal<readonly string[]>(
    rankableIds(this.room.state()?.features),
  );
  protected readonly chosenCriteria = signal<ReadonlySet<string>>(
    new Set((this.room.state()?.methodDefinition.criteria ?? []).map((c) => c.key)),
  );
  /** `null` : choix des fonctionnalités et des critères ; sinon, l'index du critère classé. */
  protected readonly stepIndex = signal<number | null>(null);
  protected readonly steps = signal<Readonly<Record<string, RankingStep>>>({});
  /** Les valeurs envoyées, en attente de confirmation par le serveur ; `null` avant « Terminer ». */
  protected readonly pending = signal<ReadonlyMap<string, Changes> | null>(null);
  /** Pourquoi l'enregistrement n'a pas abouti. */
  protected readonly failure = signal<ErrorCode | 'NOT_CONNECTED' | null>(null);
  /** L'aide « Comment classer » est ouverte. */
  protected readonly helpOpen = signal(false);
  /** La fonctionnalité dont le descriptif est ouvert, en lecture seule, ou `null`. */
  protected readonly detailId = signal<string | null>(null);
  /** Les fonctionnalités telles qu'au début du classement : leurs versions et valeurs de départ. */
  private readonly base = signal<readonly Feature[]>([]);

  /** Les fonctionnalités choisies qui existent encore et ne sont pas dans un tour, dans l'ordre du tableau. */
  protected readonly selectable = computed(() => {
    const chosen = new Set(this.chosenFeatures());
    return (this.state()?.features ?? []).filter((f) => chosen.has(f.id) && isRankable(f));
  });

  /** Les critères choisis, dans l'ordre de la définition de la méthode. */
  protected readonly criteria = computed<readonly CriterionDefinition[]>(() =>
    (this.state()?.methodDefinition.criteria ?? []).filter((c) => this.chosenCriteria().has(c.key)),
  );

  protected readonly current = computed(() => {
    const index = this.stepIndex();
    return index === null ? null : (this.criteria()[index] ?? null);
  });

  protected readonly detailFeature = computed(() => {
    const id = this.detailId();
    return id === null ? null : (this.state()?.features.find((f) => f.id === id) ?? null);
  });

  protected readonly items = computed<ReadonlyMap<string, RankedItem>>(
    () => new Map(this.base().map((f) => [f.id, f])),
  );

  /** Le brouillon diffusé aux membres pendant le classement d'un critère (FR-015b) ; `null` pendant le choix. */
  private readonly draft = computed<RankingDraft | null>(() => {
    const criterion = this.current();
    const scale = this.state()?.scale;
    const step = criterion ? this.steps()[criterion.key] : undefined;
    if (!criterion || !scale || !step) return null;
    return {
      criterionKeys: this.criteria().map((c) => c.key),
      criterionKey: criterion.key,
      levels: step.levels,
      unranked: step.unranked,
      values: draftValues(step, scale),
    };
  });

  /** La salle en cours, si elle porte sur le critère affiché (le serveur a reçu ce brouillon). */
  protected readonly liveRoom = computed(() => {
    const room = this.room.rankingRoom();
    return room && room.draft.criterionKey === this.current()?.key ? room : null;
  });

  protected readonly opinions = computed(() => {
    const room = this.liveRoom();
    return room ? opinionsByFeature(room) : new Map();
  });

  /**
   * Les discussions terminées : les avis de la carte à la fin de la discussion, par `settledKey`. Son écart ne se
   * teinte plus, tant que ses avis ne changent pas.
   */
  private readonly settled = signal<ReadonlyMap<string, string>>(new Map());

  /** Les gros écarts encore à discuter, teintés dans le classement et dans le panneau des avis. */
  protected readonly gaps = computed(() => {
    const room = this.liveRoom();
    const scale = this.state()?.scale;
    return room && scale ? roomGaps(room, scale.allowedValues, this.settled()) : new Map();
  });

  protected readonly names = computed<ReadonlyMap<string, string>>(
    () => new Map((this.state()?.participants ?? []).map((p) => [p.participantId, p.pseudo])),
  );

  /** Les fonctionnalités envoyées dont l'état reçu n'a pas encore toutes les valeurs (supprimées entre-temps : ignorées). */
  protected readonly unsaved = computed(() => {
    const pending = this.pending();
    if (!pending) return [];
    const features = new Map((this.state()?.features ?? []).map((f) => [f.id, f]));
    return [...pending].flatMap(([id, changes]) => {
      const feature = features.get(id);
      const saved =
        !feature ||
        Object.entries(changes).every(
          ([key, value]) => (feature.criteria?.[key] ?? null) === value,
        );
      return saved ? [] : [{ feature: feature as Feature, changes }];
    });
  });

  protected readonly unsavedLines = computed(() => {
    const criteria = this.state()?.methodDefinition.criteria ?? [];
    return this.unsaved().map(({ feature, changes }) => {
      const values = criteria
        .filter((c) => c.key in changes)
        .map((c) => `${c.code} ${changes[c.key] ?? MESSAGES.board.noValue}`)
        .join(', ');
      return format(this.messages.unsavedItem, { id: feature.externalId, values });
    });
  });

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
      if (!this.room.canEdit()) this.closed.emit();
    });
    // Chaque changement du classement est diffusé aux membres (FR-015b).
    effect(() => {
      const draft = this.draft();
      if (draft) this.broadcast.publish(draft);
    });
    // Pendant l'enregistrement : tout est confirmé, on rend la main ; un refus ou une coupure, on le dit.
    effect(() => {
      if (!this.pending()) return;
      if (this.unsaved().length === 0) {
        this.pending.set(null);
        this.broadcast.end('SAVED');
        this.closed.emit();
        return;
      }
      const refusal = this.room.refusal();
      if (refusal) this.failure.set(refusal.code);
      else if (this.room.connection() === 'lost') this.failure.set('NOT_CONNECTED');
    });
    // Une discussion se termine (« Terminer la discussion », ou une autre carte mise en discussion) : l'écart est vu.
    let discussed: { criterionKey: string; featureId: string } | null = null;
    effect(() => {
      const room = this.room.rankingRoom();
      const spotlight = room?.spotlightFeatureId ?? null;
      if (discussed && room && discussed.featureId !== spotlight) {
        const { criterionKey, featureId } = discussed;
        const signature = opinionsSignature(room, featureId);
        untracked(() =>
          this.settled.update((settled) =>
            new Map(settled).set(settledKey(criterionKey, featureId), signature),
          ),
        );
      }
      discussed =
        room && spotlight ? { criterionKey: room.draft.criterionKey, featureId: spotlight } : null;
    });
    afterNextRender(() => this.focusTitle());
  }

  protected shortInstruction(criterion: CriterionDefinition): string {
    return format(this.messages.shortInstruction, { code: criterion.code, label: criterion.label });
  }

  protected toggleHelp(): void {
    this.helpOpen.update((open) => !open);
  }

  /** Ferme l'aide et rend le focus au bouton « Aide ». */
  protected closeHelp(): void {
    if (!this.helpOpen()) return;
    this.helpOpen.set(false);
    this.host.querySelector<HTMLElement>('[aria-controls="ranking-help-panel"]')?.focus();
  }

  protected instruction(criterion: CriterionDefinition): string {
    return format(this.messages.instruction, { code: criterion.code, label: criterion.label });
  }

  protected isChosen(feature: Feature): boolean {
    return isRankable(feature) && this.chosenFeatures().includes(feature.id);
  }

  protected toggleFeature(id: string): void {
    this.chosenFeatures.update((ids) =>
      ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id],
    );
  }

  protected selectAll(): void {
    this.chosenFeatures.set(rankableIds(this.state()?.features));
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
   * Commence, ou recommence après un retour au choix : les classements déjà faits sont gardés. Une fonctionnalité
   * retirée de la sélection en sort, une nouvelle y entre à la place de sa valeur actuelle (ou non classée).
   */
  private start(): void {
    const previous = new Map(this.base().map((f) => [f.id, f]));
    // Une fonctionnalité déjà classée garde la version et les valeurs lues au début.
    const base = this.selectable().map((f) => previous.get(f.id) ?? f);
    this.base.set(base);
    const byId = new Map(base.map((f) => [f.id, f]));
    const ids = base.map((f) => f.id);
    const scale = this.state()?.scale;
    if (!scale) return;
    const steps = { ...this.steps() };
    for (const criterion of this.criteria()) {
      const valueOf = (id: string) => byId.get(id)?.criteria?.[criterion.key];
      const step = steps[criterion.key];
      steps[criterion.key] = step ? reselect(step, ids, valueOf) : newStep(ids, valueOf, scale);
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
    const toSend = this.base().filter((f) => changes.has(f.id) && existing.has(f.id));
    if (toSend.length === 0) {
      this.broadcast.end('SAVED');
      this.closed.emit();
      return;
    }
    this.failure.set(null);
    this.pending.set(new Map(toSend.map((f) => [f.id, changes.get(f.id) ?? {}])));
    for (const feature of toSend) {
      const criteria = changes.get(feature.id) ?? {};
      if (!this.room.updateFeature({ featureId: feature.id, version: feature.version, criteria })) {
        this.failure.set('NOT_CONNECTED');
        return;
      }
    }
  }

  protected failureText(code: ErrorCode | 'NOT_CONNECTED'): string {
    return MESSAGES.intentErrors[code];
  }

  /** Renvoie les valeurs non enregistrées, sur la version actuelle : l'animateur choisit de remplacer. */
  protected retry(): void {
    this.failure.set(null);
    for (const { feature, changes } of this.unsaved()) {
      const sent = this.room.updateFeature({
        featureId: feature.id,
        version: feature.version,
        criteria: changes,
      });
      if (!sent) {
        this.failure.set('NOT_CONNECTED');
        return;
      }
    }
  }

  protected backToBoard(): void {
    this.room.clearRefusal();
    this.broadcast.end('CANCELLED');
    this.closed.emit();
  }

  /** « Annuler » : retour au tableau sans rien enregistrer ; la salle se ferme chez les membres. */
  protected cancel(): void {
    this.broadcast.end('CANCELLED');
    this.closed.emit();
  }

  private focusTitle(): void {
    this.host.querySelector<HTMLElement>('h1')?.focus();
  }
}
