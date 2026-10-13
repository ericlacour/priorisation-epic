import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  input,
  output,
  signal,
} from '@angular/core';

import { CriteriaChanges } from '../api/contract';
import { Feature, MethodDefinition, SessionScale } from '../api/session-state';
import { format } from '../i18n/format';
import { MESSAGES } from '../i18n/messages.fr';

/** Ce que l'animateur a saisi dans la ligne : seuls les champs modifiés sont présents (jamais d'envoi inutile). */
export interface FeatureEdit {
  /** Version de la fonctionnalité quand l'édition a commencé : jamais d'écrasement silencieux (constitution III). */
  readonly baseVersion?: number;
  readonly externalId?: string;
  readonly title?: string;
  readonly criteria: CriteriaChanges;
}

/** Saisie d'une valeur : un entier de la plage, ou `null` si le champ est vide ; `undefined` si invalide. */
export function parseCriterionInput(text: string, scale: SessionScale): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (!/^\d+$/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return scale.allowedValues.includes(value) ? value : undefined;
}

/**
 * Ligne d'édition du tableau (FR-006, FR-015) : ajout, modification et suppression avec confirmation d'une
 * fonctionnalité. Un champ par critère de `methodDefinition`, contrôlé côté front (entier de l'échelle, ou vide) puis
 * côté serveur. « Enregistrer » émet UNE seule modification : le tableau ne se retrie qu'à ce moment, et la ligne
 * en cours de saisie ne bouge pas.
 */
@Component({
  // Une ligne de tableau ne peut pas être un élément personnalisé : le composant s'applique à un <tr>.
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'tr[appFeatureEditor]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'edit-row' },
  template: `
    <td>—</td>
    <td class="id-cell">
      @if (feature(); as current) {
        <span class="fid-text">{{ current.externalId }}</span>
      } @else {
        <input
          class="input"
          [attr.aria-label]="messages.externalId"
          maxlength="50"
          [value]="externalId()"
          (input)="externalId.set($any($event.target).value)"
        />
      }
    </td>
    <td class="title">
      <input
        class="input wide"
        [attr.aria-label]="messages.title"
        maxlength="200"
        [value]="title()"
        (input)="title.set($any($event.target).value)"
      />
      @if (shownErrors().length > 0) {
        <div class="err" role="alert">
          @for (error of shownErrors(); track error) {
            <div>{{ error }}</div>
          }
        </div>
      }
    </td>
    @for (criterion of definition().criteria; track criterion.key) {
      <td class="num">
        <input
          class="input num-input"
          inputmode="numeric"
          [attr.aria-label]="criterion.code"
          [attr.aria-invalid]="invalidKeys().has(criterion.key)"
          [value]="values()[criterion.key] ?? ''"
          (input)="setValue(criterion.key, $any($event.target).value)"
        />
      </td>
    }
    <td class="num" [attr.colspan]="definition().computedValues.length">
      <span class="muted small">{{ messages.recalculated }}</span>
    </td>
    <td class="actions-cell">
      @if (confirming()) {
        <span class="confirm" role="alert">{{ confirmText() }}</span>
        <button type="button" class="btn btn-danger btn-sm" (click)="removed.emit()">
          {{ messages.confirmRemoveYes }}
        </button>
        <button type="button" class="btn btn-secondary btn-sm" (click)="confirming.set(false)">
          {{ messages.cancel }}
        </button>
      } @else {
        <button type="button" class="btn btn-primary btn-sm" (click)="save()">
          {{ messages.save }}
        </button>
        <button type="button" class="btn btn-secondary btn-sm" (click)="cancelled.emit()">
          {{ messages.cancel }}
        </button>
        @if (feature()) {
          <button type="button" class="btn btn-secondary btn-sm" (click)="confirming.set(true)">
            {{ messages.remove }}
          </button>
        }
      }
    </td>
  `,
})
export class FeatureEditorComponent implements OnInit {
  protected readonly messages = MESSAGES.editor;

  /** La fonctionnalité éditée ; absente pour une nouvelle ligne. */
  readonly feature = input<Feature | null>(null);
  readonly definition = input.required<MethodDefinition>();
  readonly scale = input.required<SessionScale>();
  readonly saved = output<FeatureEdit>();
  readonly cancelled = output<void>();
  readonly removed = output<void>();

  /** La fonctionnalité telle qu'elle était au début de l'édition : ce qui change se compare à elle, pas à l'état en direct. */
  private base: Feature | null = null;

  protected readonly externalId = signal('');
  protected readonly title = signal('');
  protected readonly values = signal<Readonly<Record<string, string>>>({});
  protected readonly confirming = signal(false);
  private readonly submitted = signal(false);

  protected readonly invalidKeys = computed(() => {
    const invalid = new Set<string>();
    for (const criterion of this.definition().criteria) {
      if (parseCriterionInput(this.values()[criterion.key] ?? '', this.scale()) === undefined) {
        invalid.add(criterion.key);
      }
    }
    return invalid;
  });

  private readonly errors = computed(() => {
    const errors: string[] = [];
    if (!this.feature() && !this.externalId().trim()) errors.push(this.messages.externalIdRequired);
    if (!this.title().trim()) errors.push(this.messages.titleRequired);
    for (const criterion of this.definition().criteria) {
      if (this.invalidKeys().has(criterion.key)) {
        errors.push(
          format(this.messages.valueInvalid, { code: criterion.code, max: this.scale().max }),
        );
      }
    }
    return errors;
  });

  /** Les erreurs ne s'affichent qu'après un premier essai d'enregistrement. */
  protected readonly shownErrors = computed(() => (this.submitted() ? this.errors() : []));
  protected readonly confirmText = computed(() =>
    format(this.messages.confirmRemove, { id: this.feature()?.externalId ?? '' }),
  );

  /** Valeurs de départ : celles de la fonctionnalité au moment où l'édition commence. */
  ngOnInit(): void {
    const feature = this.feature();
    this.base = feature;
    if (!feature) return;
    this.title.set(feature.title);
    const values: Record<string, string> = {};
    for (const criterion of this.definition().criteria) {
      const value = feature.criteria?.[criterion.key];
      if (value !== null && value !== undefined) values[criterion.key] = String(value);
    }
    this.values.set(values);
  }

  protected setValue(key: string, text: string): void {
    this.values.update((values) => ({ ...values, [key]: text }));
  }

  protected save(): void {
    this.submitted.set(true);
    if (this.errors().length > 0) return;
    const feature = this.base;
    const criteria: Record<string, number | null> = {};
    for (const criterion of this.definition().criteria) {
      const value = parseCriterionInput(this.values()[criterion.key] ?? '', this.scale()) ?? null;
      const before = feature?.criteria?.[criterion.key] ?? null;
      if (feature ? value !== before : value !== null) criteria[criterion.key] = value;
    }
    if (!feature) {
      this.saved.emit({
        externalId: this.externalId().trim(),
        title: this.title().trim(),
        criteria,
      });
      return;
    }
    const title = this.title().trim();
    if (title === feature.title && Object.keys(criteria).length === 0) {
      this.cancelled.emit();
      return;
    }
    this.saved.emit({
      baseVersion: feature.version,
      ...(title === feature.title ? {} : { title }),
      criteria,
    });
  }
}
