import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  output,
  signal,
} from '@angular/core';

import { ScaleType } from '../api/contract';
import { format } from '../i18n/format';
import { MESSAGES } from '../i18n/messages.fr';
import { ModalComponent } from '../shared/modal.component';
import { FIBONACCI_BOUNDS, allowedValuesOf, defaultMax, isValidMax } from '../shared/scale';
import { SessionRoomService } from './session-room.service';

/** Une ligne de l'avertissement : une fonctionnalité et ses valeurs, « F-1 : JS = 4, BV = 6 ». */
interface ImpactLine {
  readonly externalId: string;
  readonly values: string;
}

/**
 * Échelle de la session (FR-009 à FR-011) : type (entiers continus ou suite de Fibonacci) et borne. Le changement
 * est d'abord envoyé sans confirmation ; si des valeurs deviennent hors échelle, le serveur répond `SCALE_IMPACT`
 * avec la liste, affichée ici, et l'animateur confirme ou annule. Le serveur reste seul juge : les valeurs
 * autorisées affichées ne sont qu'un aperçu. La fenêtre se ferme quand l'état reçu porte la nouvelle échelle.
 */
@Component({
  selector: 'app-settings-dialog',
  imports: [ModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal labelledBy="settings-title" (closed)="cancel()">
      <h2 id="settings-title">{{ messages.title }}</h2>
      <div class="radio-cards" role="radiogroup" [attr.aria-label]="messages.type">
        @for (option of types; track option.type) {
          <button
            type="button"
            class="radio-card"
            role="radio"
            [attr.aria-checked]="type() === option.type"
            (click)="choose(option.type)"
          >
            <b>{{ option.title }}</b>
            <span class="small muted">{{ option.hint }}</span>
          </button>
        }
      </div>
      <div class="field settings-max">
        <label for="settings-max">{{ messages.max }}</label>
        @if (type() === 'FIBONACCI') {
          <select id="settings-max" class="input" [value]="max()" (change)="setMax($event)">
            @for (bound of fibonacciBounds; track bound) {
              <option [value]="bound" [selected]="bound === maxValue()">{{ bound }}</option>
            }
          </select>
        } @else {
          <input
            id="settings-max"
            class="input"
            type="number"
            inputmode="numeric"
            min="2"
            max="100"
            [value]="max()"
            [attr.aria-invalid]="!valid()"
            [attr.aria-describedby]="valid() ? null : 'settings-max-error'"
            (input)="setMax($event)"
          />
        }
        @if (!valid()) {
          <p id="settings-max-error" class="err">{{ messages.maxInvalid }}</p>
        }
      </div>
      @if (valid()) {
        <div>
          <span class="small"
            ><b>{{ messages.allowed }}</b></span
          >
          <ul class="chips" [attr.aria-label]="messages.allowed">
            @for (value of allowed(); track value) {
              <li>{{ value }}</li>
            }
          </ul>
        </div>
      }
      @if (impact(); as impact) {
        <div class="notice impact" role="alert">
          <b>{{ impactTitle() }}</b>
          {{ messages.impactText }}
          <ul>
            @for (line of impact; track line.externalId) {
              <li>{{ line.externalId }} : {{ line.values }}</li>
            }
          </ul>
          @if (restored(); as restored) {
            <p class="small">{{ restored }}</p>
          }
        </div>
      } @else if (refusalText(); as text) {
        <p class="notice danger" role="alert">{{ text }}</p>
      }
      <div class="actions end">
        <button type="button" class="btn btn-secondary" (click)="cancel()">
          {{ messages.cancel }}
        </button>
        @if (impact()) {
          <button type="button" class="btn btn-primary" (click)="apply(true)">
            {{ messages.confirm }}
          </button>
        } @else {
          <button
            type="button"
            class="btn btn-primary"
            [disabled]="!valid()"
            (click)="apply(false)"
          >
            {{ messages.apply }}
          </button>
        }
      </div>
    </app-modal>
  `,
})
export class SettingsDialogComponent {
  readonly closed = output<void>();

  private readonly room = inject(SessionRoomService);
  protected readonly messages = MESSAGES.settingsDialog;
  protected readonly fibonacciBounds = FIBONACCI_BOUNDS;
  protected readonly types: readonly { type: ScaleType; title: string; hint: string }[] = [
    {
      type: 'CONTINUOUS',
      title: MESSAGES.settingsDialog.continuous,
      hint: MESSAGES.settingsDialog.continuousHint,
    },
    {
      type: 'FIBONACCI',
      title: MESSAGES.settingsDialog.fibonacci,
      hint: MESSAGES.settingsDialog.fibonacciHint,
    },
  ];

  private readonly state = this.room.state;
  protected readonly type = signal<ScaleType>(
    this.state()?.scale.type === 'FIBONACCI' ? 'FIBONACCI' : 'CONTINUOUS',
  );
  protected readonly max = signal(String(this.state()?.scale.max ?? 10));
  /** L'échelle envoyée, attendue dans un prochain état pour fermer la fenêtre. */
  private readonly awaited = signal<{ type: ScaleType; max: number } | null>(null);

  protected readonly maxValue = computed(() => Number(this.max()));
  protected readonly valid = computed(() => isValidMax(this.type(), this.maxValue()));
  protected readonly allowed = computed(() =>
    this.valid() ? allowedValuesOf(this.type(), this.maxValue()) : [],
  );

  /** Les valeurs impactées du dernier refus `SCALE_IMPACT`, regroupées par fonctionnalité. */
  protected readonly impact = computed<readonly ImpactLine[] | null>(() => {
    const refusal = this.room.refusal();
    if (refusal?.code !== 'SCALE_IMPACT' || !refusal.impactedValues?.length) return null;
    const lines = new Map<string, string[]>();
    for (const impacted of refusal.impactedValues) {
      const values = lines.get(impacted.externalId) ?? [];
      values.push(
        format(this.messages.impactValue, {
          code: this.codeOf(impacted.criterion),
          value: impacted.value,
        }),
      );
      lines.set(impacted.externalId, values);
    }
    return [...lines].map(([externalId, values]) => ({ externalId, values: values.join(', ') }));
  });

  protected readonly impactTitle = computed(() =>
    format(this.messages.impactTitle, {
      count: this.room.refusal()?.impactedValues?.length ?? 0,
    }),
  );

  /** Les valeurs hors échelle aujourd'hui que l'échelle demandée accepte de nouveau. */
  protected readonly restored = computed(() => {
    const allowed = this.allowed();
    const values: string[] = [];
    for (const feature of this.state()?.features ?? []) {
      for (const key of feature.score?.outOfScale ?? []) {
        const value = feature.criteria?.[key];
        if (value !== null && value !== undefined && allowed.includes(value)) {
          values.push(
            `${feature.externalId} ${format(this.messages.impactValue, { code: this.codeOf(key), value })}`,
          );
        }
      }
    }
    return values.length ? format(this.messages.restored, { values: values.join(', ') }) : null;
  });

  protected readonly refusalText = computed(() => {
    const refusal = this.room.refusal();
    return refusal ? MESSAGES.intentErrors[refusal.code] : null;
  });

  constructor() {
    this.room.clearRefusal();
    // L'état reçu porte l'échelle demandée : le changement est appliqué, la fenêtre se ferme.
    effect(() => {
      const awaited = this.awaited();
      const scale = this.state()?.scale;
      if (awaited && scale && scale.type === awaited.type && scale.max === awaited.max) {
        this.closed.emit();
      }
    });
  }

  protected choose(type: ScaleType): void {
    if (type === this.type()) return;
    this.room.clearRefusal();
    this.type.set(type);
    if (!isValidMax(type, this.maxValue())) this.max.set(String(defaultMax(type)));
  }

  protected setMax(event: Event): void {
    this.room.clearRefusal();
    this.max.set((event.target as HTMLInputElement | HTMLSelectElement).value.trim());
  }

  /** Sans `confirm`, un changement qui met des valeurs hors échelle revient en `SCALE_IMPACT`. */
  protected apply(confirm: boolean): void {
    if (!this.valid()) return;
    const scale = { type: this.type(), max: this.maxValue() };
    const current = this.state()?.scale;
    if (current && current.type === scale.type && current.max === scale.max) {
      this.closed.emit();
      return;
    }
    if (this.room.updateSettings(confirm ? { scale, confirm: true } : { scale })) {
      this.awaited.set(scale);
    }
  }

  protected cancel(): void {
    this.room.clearRefusal();
    this.closed.emit();
  }

  private codeOf(key: string): string {
    return (
      this.state()?.methodDefinition.criteria.find((criterion) => criterion.key === key)?.code ??
      key
    );
  }
}
