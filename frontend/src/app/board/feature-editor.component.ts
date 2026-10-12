import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { CriteriaValues, Feature, SessionState } from '../api/contract';
import { MESSAGES } from '../i18n/messages.fr';
import { SessionStateService } from '../session/session-state.service';
import { allowedValues, describeAllowed, readCriterionInput } from '../shared/method-format';
import { computedDisplay, criterionValue } from './feature-cells';

interface Conflict {
  readonly feature: Feature;
}

/**
 * Ligne d'édition du tableau, pour l'animateur (FR-006, FR-015) : ajout (`feature` absente), modification et
 * suppression avec confirmation. Un champ de saisie par critère de `methodDefinition`, contrôlé côté front (entier de
 * l'échelle) puis côté serveur. « Enregistrer » envoie **une seule** intention (`addFeature` ou `updateFeature` avec
 * la `version` lue) ; rien n'est modifié ni retrié en local, le tableau ne bouge que sur le `sessionState` diffusé.
 * Sur `STALE_VERSION`, la valeur actuelle est montrée avant de la garder ou de la remplacer par la saisie.
 */
@Component({
  selector: 'tr[appFeatureEditor]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'edit-row', '(keydown.enter)': 'onEnter($event)', '(keydown.escape)': 'cancel()' },
  template: `
    <td>{{ rank() }}</td>
    <td>
      @if (feature()) {
        <b>{{ feature()!.externalId }}</b>
      } @else {
        <input
          class="input"
          type="text"
          maxlength="50"
          [attr.aria-label]="messages.externalId"
          [attr.aria-invalid]="externalIdInvalid() ? 'true' : null"
          [value]="externalId()"
          (input)="externalId.set(valueOf($event))"
        />
      }
    </td>
    <td class="title editor-cell">
      <input
        class="input wide"
        type="text"
        maxlength="200"
        [attr.aria-label]="messages.title"
        [attr.aria-invalid]="titleInvalid() ? 'true' : null"
        [value]="title()"
        (input)="title.set(valueOf($event))"
      />
      <div class="editor-messages" role="alert">
        @for (message of errors(); track message) {
          <p class="err">{{ message }}</p>
        }
        @if (confirmingRemoval()) {
          <p class="err">{{ messages.confirmRemove(feature()!.externalId) }}</p>
          <p class="actions">
            <button type="button" class="btn btn-primary btn-sm" (click)="remove()">
              {{ messages.confirmRemoveYes }}
            </button>
            <button
              type="button"
              class="btn btn-secondary btn-sm"
              (click)="confirmingRemoval.set(false)"
            >
              {{ messages.cancel }}
            </button>
          </p>
        }
        @if (conflict(); as conflict) {
          <p class="err">{{ messages.conflictIntro }}</p>
          @for (line of conflictLines(conflict); track line) {
            <p class="err">{{ line }}</p>
          }
          <p class="actions">
            <button type="button" class="btn btn-secondary btn-sm" (click)="cancel()">
              {{ messages.keepCurrent }}
            </button>
            <button type="button" class="btn btn-primary btn-sm" (click)="overwrite(conflict)">
              {{ messages.overwrite }}
            </button>
          </p>
        }
      </div>
    </td>
    @for (criterion of definition().criteria; track criterion.key) {
      <td class="num">
        <input
          class="input"
          type="text"
          inputmode="numeric"
          [attr.aria-label]="criterion.code"
          [attr.aria-invalid]="invalidKeys().includes(criterion.key) ? 'true' : null"
          [placeholder]="messages.criterionPlaceholder"
          [value]="values()[criterion.key] ?? ''"
          (input)="setValue(criterion.key, valueOf($event))"
        />
      </td>
    }
    @for (computed of definition().computedValues; track computed.key) {
      <td class="num">{{ currentComputed(computed.key) }}</td>
    }
    <td class="actions-cell">
      <div class="actions">
        <button type="button" class="btn btn-primary btn-sm" [disabled]="saving()" (click)="save()">
          {{ saving() ? messages.saving : messages.save }}
        </button>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          [disabled]="saving()"
          (click)="cancel()"
        >
          {{ messages.cancel }}
        </button>
        @if (feature()) {
          <button
            type="button"
            class="btn btn-danger btn-sm"
            [disabled]="saving()"
            (click)="confirmingRemoval.set(true)"
          >
            {{ messages.remove }}
          </button>
        }
      </div>
    </td>
  `,
})
export class FeatureEditorComponent implements OnInit {
  private readonly session = inject(SessionStateService);
  protected readonly messages = MESSAGES.editor;
  private readonly boardMessages = MESSAGES.board;

  readonly state = input.required<SessionState>();
  /** La fonctionnalité à modifier ; absente : ajout d'une nouvelle fonctionnalité. */
  readonly feature = input<Feature | null>(null);
  /** L'édition est terminée (enregistrée, annulée ou supprimée). */
  readonly closed = output<void>();

  protected readonly definition = computed(() => this.state().methodDefinition);
  protected readonly externalId = signal('');
  protected readonly title = signal('');
  protected readonly values = signal<Readonly<Record<string, string>>>({});
  protected readonly saving = signal(false);
  protected readonly confirmingRemoval = signal(false);
  protected readonly conflict = signal<Conflict | null>(null);
  protected readonly errors = signal<readonly string[]>([]);
  protected readonly invalidKeys = signal<readonly string[]>([]);
  protected readonly externalIdInvalid = signal(false);
  protected readonly titleInvalid = signal(false);
  protected readonly rank = computed(() => this.feature()?.score?.rank ?? this.boardMessages.none);

  /** Ce que la ligne montrait à l'ouverture : base de la comparaison pour n'envoyer que ce qui change. */
  private baseVersion = 0;
  private baseTitle = '';
  private baseValues: CriteriaValues = {};

  ngOnInit(): void {
    const feature = this.feature();
    if (!feature) return;
    this.baseVersion = feature.version;
    this.baseTitle = feature.title;
    this.baseValues = feature.criteria ?? {};
    this.title.set(feature.title);
    this.values.set(
      Object.fromEntries(
        this.definition().criteria.map((c) => [
          c.key,
          String(criterionValue(feature, c.key) ?? ''),
        ]),
      ),
    );
  }

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected setValue(key: string, raw: string): void {
    this.values.update((values) => ({ ...values, [key]: raw }));
  }

  protected currentComputed(key: string): string {
    const feature = this.feature();
    return (feature && computedDisplay(feature, key)) ?? this.boardMessages.none;
  }

  protected onEnter(event: Event): void {
    if ((event.target as HTMLElement).tagName === 'INPUT') this.save();
  }

  protected cancel(): void {
    if (!this.saving()) this.closed.emit();
  }

  protected async save(): Promise<void> {
    if (this.saving()) return;
    const criteria = this.validate();
    if (criteria === null) return;
    const feature = this.feature();
    this.errors.set([]);
    this.conflict.set(null);
    if (!feature) {
      await this.send(() =>
        this.session.addFeature({
          externalId: this.externalId().trim(),
          title: this.title().trim(),
          ...(Object.keys(criteria).length > 0 ? { criteria } : {}),
        }),
      );
      return;
    }
    const changes = this.diff(this.baseTitle, this.baseValues, criteria);
    if (!changes) {
      this.closed.emit();
      return;
    }
    await this.send(() => this.session.updateFeature(feature.id, this.baseVersion, changes));
  }

  /** Remplace la saisie d'un autre poste : renvoie la saisie avec la version actuelle, sans lire la valeur actuelle. */
  protected async overwrite(conflict: Conflict): Promise<void> {
    const criteria = this.validate();
    if (criteria === null || this.saving()) return;
    const current = conflict.feature;
    const changes = this.diff(current.title, current.criteria ?? {}, criteria);
    this.errors.set([]);
    this.conflict.set(null);
    if (!changes) {
      this.closed.emit();
      return;
    }
    await this.send(() => this.session.updateFeature(current.id, current.version, changes));
  }

  protected async remove(): Promise<void> {
    const feature = this.feature();
    if (!feature || this.saving()) return;
    this.confirmingRemoval.set(false);
    await this.send(() => this.session.deleteFeature(feature.id, this.baseVersion));
  }

  protected conflictLines(conflict: Conflict): string[] {
    const lines: string[] = [];
    const current = conflict.feature;
    for (const c of this.definition().criteria) {
      const now = criterionValue(current, c.key);
      const before = this.baseValues[c.key] ?? null;
      if (now !== before) {
        const mine = this.values()[c.key]?.trim();
        lines.push(
          this.messages.conflictCriterion(
            c.code,
            now === null ? this.boardMessages.none : String(now),
            mine ? mine : this.boardMessages.none,
          ),
        );
      }
    }
    if (current.title !== this.baseTitle) lines.push(this.messages.conflictTitle(current.title));
    return lines.length > 0 ? lines : [this.messages.conflictGeneric];
  }

  private async send(
    intent: () => ReturnType<SessionStateService['updateFeature']>,
  ): Promise<void> {
    this.saving.set(true);
    const result = await intent();
    this.saving.set(false);
    if (result.ok) {
      this.closed.emit();
    } else if (result.code === 'STALE_VERSION' && this.feature()) {
      const current = this.session.feature(this.feature()!.id);
      if (current) this.conflict.set({ feature: current });
      else this.errors.set([MESSAGES.errors.STALE_VERSION]);
    } else {
      this.errors.set([MESSAGES.errors[result.code]]);
      if (result.code === 'DUPLICATE_EXTERNAL_ID') this.externalIdInvalid.set(true);
    }
  }

  /** Contrôle la saisie ; renvoie les valeurs saisies (clés non vides) ou `null` après avoir montré les erreurs. */
  private validate(): Record<string, number | null> | null {
    const errors: string[] = [];
    const allowed = allowedValues(this.state().scale);
    const criteria: Record<string, number | null> = {};
    const invalid: string[] = [];
    for (const c of this.definition().criteria) {
      const read = readCriterionInput(this.values()[c.key] ?? '', allowed);
      if (!read.ok) {
        invalid.push(c.key);
        errors.push(MESSAGES.validation.criterion(c.code, describeAllowed(allowed)));
      } else {
        criteria[c.key] = read.value;
      }
    }
    const missingId = !this.feature() && this.externalId().trim() === '';
    const missingTitle = this.title().trim() === '';
    if (missingId) errors.push(this.messages.externalIdRequired);
    if (missingTitle) errors.push(this.messages.titleRequired);
    this.externalIdInvalid.set(missingId);
    this.titleInvalid.set(missingTitle);
    this.invalidKeys.set(invalid);
    this.errors.set(errors);
    if (errors.length > 0) return null;
    return criteria;
  }

  /**
   * Les changements entre la référence (`title`, `base`) et la saisie. Un ajout envoie tout ce qui est saisi ;
   * une modification n'envoie que les clés différentes (`null` efface une valeur). `null` : rien à envoyer.
   */
  private diff(
    title: string,
    base: CriteriaValues,
    criteria: Record<string, number | null>,
  ): { title?: string; criteria?: CriteriaValues } | null {
    const changed: Record<string, number | null> = {};
    for (const [key, value] of Object.entries(criteria)) {
      if ((base[key] ?? null) !== value) changed[key] = value;
    }
    const newTitle = this.title().trim();
    const changes: { title?: string; criteria?: CriteriaValues } = {};
    if (newTitle !== title) changes.title = newTitle;
    if (Object.keys(changed).length > 0) changes.criteria = changed;
    return Object.keys(changes).length > 0 ? changes : null;
  }
}
