import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { CriteriaValues, Round, SessionState } from '../api/contract';
import { MESSAGES } from '../i18n/messages.fr';
import { SessionStateService } from '../session/session-state.service';
import {
  allowedValues,
  describeAllowed,
  invalidVoteMessage,
  readCriterionInput,
} from '../shared/method-format';

interface Problems {
  readonly messages: readonly string[];
  readonly keys: readonly string[];
}

type Drafts = Readonly<Record<string, Readonly<Record<string, string>>>>;

/**
 * « Votre vote » (écran 5, FR-019) : un nombre par critère de `methodDefinition` et par fonctionnalité du tour, en
 * saisie directe. Un champ vide vaut « sans avis » ; la fonctionnalité passe « Noté » dès qu'un critère a une valeur,
 * d'après ce que le serveur a enregistré (`myVotes`), pas d'après la saisie. Une saisie est contrôlée (entier de
 * l'échelle) puis envoyée en quittant le champ ; une saisie refusée n'envoie rien. Aucun critère n'est écrit en dur.
 */
@Component({
  selector: 'app-vote-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'vote-panel card' },
  template: `
    <h2>{{ messages.title }}</h2>
    <p class="help" id="vote-help">
      {{ messages.help(allowedText(), glossaryTitle()) }}
    </p>
    @for (feature of features(); track feature.id) {
      <section class="vote-feature" [class.done]="scored(feature.id)">
        <div class="actions vote-head">
          <b>
            <button type="button" class="fid" (click)="featureSelected.emit(feature.id)">
              {{ feature.externalId }}
            </button>
            · {{ feature.title }}
          </b>
          <span class="badge" [class.live]="scored(feature.id)">{{
            scored(feature.id) ? messages.done : messages.todo
          }}</span>
        </div>
        <div class="vote-inputs">
          @for (criterion of definition().criteria; track criterion.key) {
            <label>
              {{ messages.field(criterion.code, criterion.label) }}
              <input
                class="input"
                type="text"
                inputmode="numeric"
                autocomplete="off"
                aria-describedby="vote-help"
                [class.error]="invalid(feature.id).includes(criterion.key)"
                [attr.aria-invalid]="invalid(feature.id).includes(criterion.key) ? 'true' : null"
                [placeholder]="messages.noOpinion"
                [value]="draft(feature.id, criterion.key)"
                (input)="edit(feature.id, criterion.key, valueOf($event))"
                (change)="send(feature.id)"
              />
            </label>
          }
        </div>
        @if (errors(feature.id).length > 0) {
          <div class="vote-errors" role="alert">
            @for (message of errors(feature.id); track message) {
              <p class="err small">{{ message }}</p>
            }
          </div>
        }
      </section>
    }
  `,
})
export class VotePanelComponent {
  private readonly session = inject(SessionStateService);
  protected readonly messages = MESSAGES.rounds.vote;

  readonly state = input.required<SessionState>();
  readonly round = input.required<Round>();
  /** Un identifiant a été activé : ouvrir le descriptif de cette fonctionnalité (FR-016b). */
  readonly featureSelected = output<string>();

  protected readonly definition = computed(() => this.state().methodDefinition);
  protected readonly features = computed(() =>
    this.state().features.filter((f) => this.round().featureIds.includes(f.id)),
  );
  protected readonly allowed = computed(() => allowedValues(this.state().scale));
  protected readonly allowedText = computed(() => describeAllowed(this.allowed()));
  protected readonly glossaryTitle = computed(() =>
    MESSAGES.method.glossaryTitle(this.definition().name),
  );

  private readonly drafts = signal<Drafts>({});
  private readonly dirty = signal<ReadonlySet<string>>(new Set());
  /** Nombre de frappes par fonctionnalité : une confirmation ne vaut que si rien n'a été tapé depuis l'envoi. */
  private readonly edits = new Map<string, number>();
  private readonly problems = signal<Readonly<Record<string, Problems>>>({});

  constructor() {
    // Ce que le serveur a enregistré alimente les champs que je ne suis pas en train de modifier.
    effect(() => {
      const votes = this.round().myVotes;
      const dirty = this.dirty();
      const keys = this.definition().criteria.map((c) => c.key);
      this.drafts.update((drafts) => {
        const next: Record<string, Record<string, string>> = { ...drafts };
        for (const feature of this.round().featureIds) {
          if (dirty.has(feature) && next[feature]) continue;
          next[feature] = Object.fromEntries(
            keys.map((key) => [key, String(votes[feature]?.[key] ?? '')]),
          );
        }
        return next;
      });
    });
  }

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected draft(featureId: string, key: string): string {
    return this.drafts()[featureId]?.[key] ?? '';
  }

  protected scored(featureId: string): boolean {
    return Object.values(this.round().myVotes[featureId] ?? {}).some((v) => v !== null);
  }

  protected errors(featureId: string): readonly string[] {
    return this.problems()[featureId]?.messages ?? [];
  }

  protected invalid(featureId: string): readonly string[] {
    return this.problems()[featureId]?.keys ?? [];
  }

  protected edit(featureId: string, key: string, raw: string): void {
    this.edits.set(featureId, (this.edits.get(featureId) ?? 0) + 1);
    this.dirty.update((set) => new Set(set).add(featureId));
    this.drafts.update((drafts) => ({
      ...drafts,
      [featureId]: { ...drafts[featureId], [key]: raw },
    }));
  }

  /** Contrôle la saisie de la fonctionnalité puis l'envoie ; une saisie refusée n'envoie rien. */
  protected async send(featureId: string): Promise<void> {
    const criteria: Record<string, number | null> = {};
    const messages: string[] = [];
    const keys: string[] = [];
    for (const criterion of this.definition().criteria) {
      const read = readCriterionInput(this.draft(featureId, criterion.key), this.allowed());
      if (read.ok) criteria[criterion.key] = read.value;
      else {
        messages.push(invalidVoteMessage(criterion.code, this.allowed()));
        keys.push(criterion.key);
      }
    }
    this.problems.update((p) => ({ ...p, [featureId]: { messages, keys } }));
    if (messages.length > 0) return;
    const sentAt = this.edits.get(featureId) ?? 0;
    const result = await this.session.castVote(
      this.round().id,
      featureId,
      criteria as CriteriaValues,
    );
    if (!result.ok) {
      this.problems.update((p) => ({
        ...p,
        [featureId]: { messages: [MESSAGES.errors[result.code]], keys: [] },
      }));
    } else if ((this.edits.get(featureId) ?? 0) === sentAt) {
      this.dirty.update((set) => {
        const next = new Set(set);
        next.delete(featureId);
        return next;
      });
    }
  }
}
