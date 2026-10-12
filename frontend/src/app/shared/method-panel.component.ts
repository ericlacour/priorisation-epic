import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { MethodDefinition, Scale } from '../api/contract';
import { MESSAGES } from '../i18n/messages.fr';
import { DrawerComponent } from './drawer.component';
import { scaleDescription } from './method-format';

/**
 * Panneau en lecture seule « Méthode de la session » (FR-017c, écran 4 quater) : nom et version, formule, critères,
 * valeurs calculées, règle de tri et d'égalité, échelle. Tout vient d'une `methodDefinition` (celle de `sessionState`
 * ou celle de `GET /api/methods`) : une autre méthode afficherait ses propres critères. Il se ferme par la croix,
 * Échap ou un clic à côté.
 */
@Component({
  selector: 'app-method-panel',
  imports: [DrawerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-drawer labelledBy="method-panel-title" (closed)="closed.emit()">
      <div drawer-head>
        <span class="muted small">{{ messages.panelKicker }}</span>
        <h2 id="method-panel-title">
          {{ definition().name }}
          <span class="badge">{{ messages.version(definition().version) }}</span>
        </h2>
      </div>
      <p class="notice info">{{ messages.frozen }}</p>
      <h3>{{ messages.formula }}</h3>
      <p class="formula">{{ definition().formula }}</p>
      <h3>{{ messages.criteria }}</h3>
      <dl class="glossary">
        @for (criterion of definition().criteria; track criterion.key) {
          <dt>{{ criterion.code }} · {{ criterion.label }}</dt>
          <dd>
            {{ criterion.definition }}
            <span class="muted small">{{ messages.importColumn(criterion.header) }}</span>
          </dd>
        }
      </dl>
      <p class="help">{{ messages.scaleLine(scaleText()) }}</p>
      <h3>{{ messages.computedValues }}</h3>
      <dl class="glossary">
        @for (value of definition().computedValues; track value.key) {
          <dt>{{ value.code }} · {{ value.label }}</dt>
          <dd>
            {{ value.definition }}
            <span class="muted small">{{ messages.display(value.display) }}</span>
          </dd>
        }
      </dl>
      <h3>{{ messages.tieBreak }}</h3>
      <p class="small">{{ definition().tieBreakRule }}</p>
    </app-drawer>
  `,
})
export class MethodPanelComponent {
  protected readonly messages = MESSAGES.method;
  readonly definition = input.required<MethodDefinition>();
  /** Échelle de la session, `null` depuis le formulaire de création (échelle par défaut). */
  readonly scale = input<Scale | null>(null);
  readonly closed = output<void>();
  protected readonly scaleText = computed(() => scaleDescription(this.scale()));
}
