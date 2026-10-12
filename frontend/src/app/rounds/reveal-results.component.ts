import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { CriteriaValues, Feature, FeatureResult, Round, SessionState } from '../api/contract';
import { MESSAGES } from '../i18n/messages.fr';
import { SessionStateService } from '../session/session-state.service';
import { CriterionTermComponent } from '../shared/criterion-term.component';
import { allowedValues, invalidVoteMessage, readCriterionInput } from '../shared/method-format';

interface Card {
  readonly result: FeatureResult;
  readonly feature: Feature;
}

/**
 * Résultats d'un tour révélé (écran 6, FR-020 à FR-022) : pour chaque fonctionnalité, les votes de chacun (« sans
 * avis » pour un critère vide, « n'a pas voté » pour qui n'a rien donné), le minimum et le maximum de chaque critère
 * de `methodDefinition` et le badge « écart important ». Le calcul est celui du serveur. L'animateur (`canEdit`)
 * saisit les valeurs retenues, **vides** sauf celles préremplies par `unanimous` (FR-021), et peut relancer un tour
 * sur une sélection (FR-022). Les autres lisent seulement.
 */
@Component({
  selector: 'app-reveal-results',
  imports: [CriterionTermComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'reveal-results' },
  template: `
    <div class="notice success round-banner" role="status">
      <span>{{
        canEdit()
          ? messages.banner(round().number, cards().length)
          : messages.bannerReadOnly(round().number, cards().length)
      }}</span>
      @if (hideable()) {
        <button type="button" class="btn btn-secondary btn-sm" (click)="hidden.emit()">
          {{ messages.hide }}
        </button>
      }
    </div>
    <div class="reveal-list" role="list">
      @for (card of cards(); track card.feature.id) {
        <section class="card reveal-card" role="listitem">
          <div class="actions reveal-head">
            <h2>
              <button type="button" class="fid" (click)="featureSelected.emit(card.feature.id)">
                {{ card.feature.externalId }}
              </button>
              · {{ card.feature.title }}
            </h2>
            @if (canEdit()) {
              <label class="small">
                <input
                  type="checkbox"
                  [attr.aria-label]="messages.relaunchLabel(card.feature.externalId)"
                  [checked]="relaunch().has(card.feature.id)"
                  (change)="toggle(card.feature.id)"
                />
                {{ messages.relaunchCheck }}
              </label>
            }
          </div>
          <div class="table-wrap">
            <table class="reveal-grid">
              <thead>
                <tr>
                  <th scope="col">{{ messages.participant }}</th>
                  @for (criterion of state().methodDefinition.criteria; track criterion.key) {
                    <th scope="col"><app-criterion-term [term]="criterion" /></th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (vote of card.result.votes; track vote.participantId) {
                  <tr>
                    <td>{{ pseudo(vote.participantId) }}</td>
                    @for (criterion of state().methodDefinition.criteria; track criterion.key) {
                      @if (vote.criteria[criterion.key] ?? null; as value) {
                        <td>{{ value }}</td>
                      } @else {
                        <td class="noopinion">{{ messages.noOpinion }}</td>
                      }
                    }
                  </tr>
                }
                @for (id of card.result.nonVoters; track id) {
                  <tr class="novote">
                    <td>{{ pseudo(id) }}</td>
                    <td [attr.colspan]="state().methodDefinition.criteria.length">
                      {{ messages.noVote }}
                    </td>
                  </tr>
                }
                <tr class="minmax">
                  <td>{{ messages.minMax }}</td>
                  @for (criterion of state().methodDefinition.criteria; track criterion.key) {
                    <td [class.spread]="card.result.largeSpread.includes(criterion.key)">
                      {{ range(card.result, criterion.key) }}
                      @if (card.result.largeSpread.includes(criterion.key)) {
                        <span class="badge warn">{{ messages.spread }}</span>
                      }
                    </td>
                  }
                </tr>
              </tbody>
            </table>
          </div>
          @if (canEdit()) {
            <div class="actions consensus">
              <span class="small strong">{{ messages.consensus }}</span>
              @for (criterion of state().methodDefinition.criteria; track criterion.key) {
                <label class="small">
                  <app-criterion-term [term]="criterion" />
                  <input
                    class="input consensus-input"
                    type="text"
                    inputmode="numeric"
                    autocomplete="off"
                    [attr.aria-label]="messages.consensusField(criterion.code)"
                    [attr.title]="isPrefilled(card, criterion.key) ? messages.prefilled : null"
                    [class.error]="invalidKeys(card.feature.id).includes(criterion.key)"
                    [attr.aria-invalid]="
                      invalidKeys(card.feature.id).includes(criterion.key) ? 'true' : null
                    "
                    [value]="consensus(card, criterion.key)"
                    (input)="edit(card.feature.id, criterion.key, valueOf($event))"
                  />
                </label>
              }
              <button
                type="button"
                class="btn btn-primary btn-sm"
                [disabled]="busy().has(card.feature.id)"
                (click)="validate(card)"
              >
                {{ busy().has(card.feature.id) ? messages.validating : messages.validate }}
              </button>
              <span class="help">{{ messages.consensusHelp }}</span>
            </div>
            @if (messagesOf(card.feature.id); as list) {
              <div role="alert">
                @for (message of list; track message) {
                  <p class="err small">{{ message }}</p>
                }
              </div>
            }
            @if (saved().has(card.feature.id)) {
              <p class="help" role="status">{{ messages.validated }}</p>
            }
          }
        </section>
      }
    </div>
    @if (canEdit()) {
      <div class="actions reveal-actions">
        <button
          type="button"
          class="btn btn-primary"
          [disabled]="relaunch().size === 0 || relaunching()"
          (click)="launch()"
        >
          {{ messages.relaunch(relaunch().size) }}
        </button>
        @if (relaunchError(); as text) {
          <span class="err" role="alert">{{ text }}</span>
        }
      </div>
    }
  `,
})
export class RevealResultsComponent {
  private readonly session = inject(SessionStateService);
  protected readonly messages = MESSAGES.rounds.results;

  readonly state = input.required<SessionState>();
  readonly round = input.required<Round>();
  /** Animateur sur ordinateur : valeurs retenues et relance. */
  readonly canEdit = input(false);
  /** Le bandeau propose « Masquer » (le dernier tour révélé, pas l'historique). */
  readonly hideable = input(false);
  readonly hidden = output<void>();
  readonly featureSelected = output<string>();

  protected readonly cards = computed<readonly Card[]>(() => {
    const features = this.state().features;
    return (this.round().results ?? []).flatMap((result) => {
      const feature = features.find((f) => f.id === result.featureId);
      return feature ? [{ result, feature }] : [];
    });
  });
  protected readonly relaunch = signal<ReadonlySet<string>>(new Set());
  protected readonly relaunching = signal(false);
  protected readonly relaunchError = signal<string | null>(null);
  private readonly drafts = signal<Readonly<Record<string, Readonly<Record<string, string>>>>>({});
  private readonly problems = signal<Readonly<Record<string, readonly string[]>>>({});
  private readonly problemKeys = signal<Readonly<Record<string, readonly string[]>>>({});
  protected readonly busy = signal<ReadonlySet<string>>(new Set());
  protected readonly saved = signal<ReadonlySet<string>>(new Set());

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected pseudo(participantId: string): string {
    return this.state().participants.find((p) => p.participantId === participantId)?.pseudo ?? '?';
  }

  /** « 4 – 8 » ; « — » quand personne n'a donné de valeur pour ce critère (FR-020). */
  protected range(result: FeatureResult, key: string): string {
    const min = result.min[key] ?? null;
    const max = result.max[key] ?? null;
    return min === null || max === null ? this.messages.empty : this.messages.range(min, max);
  }

  protected isPrefilled(card: Card, key: string): boolean {
    return (card.result.unanimous[key] ?? null) !== null;
  }

  /** Vide, sauf si tous ceux qui ont donné une valeur ont saisi la même (FR-021). */
  protected consensus(card: Card, key: string): string {
    const draft = this.drafts()[card.feature.id]?.[key];
    return draft ?? String(card.result.unanimous[key] ?? '');
  }

  protected edit(featureId: string, key: string, raw: string): void {
    this.saved.update((s) => without(s, featureId));
    this.drafts.update((drafts) => ({
      ...drafts,
      [featureId]: { ...drafts[featureId], [key]: raw },
    }));
  }

  protected messagesOf(featureId: string): readonly string[] | null {
    const list = this.problems()[featureId];
    return list && list.length > 0 ? list : null;
  }

  protected invalidKeys(featureId: string): readonly string[] {
    return this.problemKeys()[featureId] ?? [];
  }

  protected toggle(featureId: string): void {
    this.relaunch.update((set) => {
      const next = new Set(set);
      if (!next.delete(featureId)) next.add(featureId);
      return next;
    });
  }

  /** Enregistre les valeurs retenues saisies (les champs vides ne changent rien) par une seule intention. */
  protected async validate(card: Card): Promise<void> {
    const allowed = allowedValues(this.state().scale);
    const criteria: Record<string, number | null> = {};
    const messages: string[] = [];
    const keys: string[] = [];
    for (const criterion of this.state().methodDefinition.criteria) {
      const read = readCriterionInput(this.consensus(card, criterion.key), allowed);
      if (!read.ok) {
        messages.push(invalidVoteMessage(criterion.code, allowed));
        keys.push(criterion.key);
      } else if (read.value !== null) {
        criteria[criterion.key] = read.value;
      }
    }
    this.problems.update((p) => ({ ...p, [card.feature.id]: messages }));
    this.problemKeys.update((p) => ({ ...p, [card.feature.id]: keys }));
    if (messages.length > 0 || Object.keys(criteria).length === 0) return;
    const current = this.session.feature(card.feature.id) ?? card.feature;
    // Une valeur déjà retenue n'est pas renvoyée : le serveur ne diffuserait rien et rien ne la confirmerait.
    for (const key of Object.keys(criteria)) {
      if ((current.criteria?.[key] ?? null) === criteria[key]) delete criteria[key];
    }
    if (Object.keys(criteria).length === 0) {
      this.saved.update((s) => new Set(s).add(card.feature.id));
      return;
    }
    this.busy.update((s) => new Set(s).add(card.feature.id));
    const result = await this.session.updateFeature(current.id, current.version, {
      criteria: criteria as CriteriaValues,
    });
    this.busy.update((s) => without(s, card.feature.id));
    if (result.ok) this.saved.update((s) => new Set(s).add(card.feature.id));
    else this.problems.update((p) => ({ ...p, [card.feature.id]: [MESSAGES.errors[result.code]] }));
  }

  protected async launch(): Promise<void> {
    if (this.relaunching() || this.relaunch().size === 0) return;
    this.relaunching.set(true);
    this.relaunchError.set(null);
    const ids = this.cards()
      .map((c) => c.feature.id)
      .filter((id) => this.relaunch().has(id));
    const result = await this.session.openRound(ids, this.round().id);
    this.relaunching.set(false);
    if (result.ok) this.relaunch.set(new Set());
    else this.relaunchError.set(MESSAGES.errors[result.code]);
  }
}

const without = (set: ReadonlySet<string>, id: string): Set<string> => {
  const next = new Set(set);
  next.delete(id);
  return next;
};
