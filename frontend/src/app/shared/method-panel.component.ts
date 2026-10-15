import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { MethodDefinition, SessionScale } from '../api/session-state';
import { format } from '../i18n/format';
import { MESSAGES } from '../i18n/messages.fr';
import { SidePanelComponent } from './side-panel.component';

/**
 * Panneau en lecture seule « Méthode de la session » (FR-017c) : nom et version, formule, critères, valeurs
 * calculées, règle de tri et d'égalité, échelle. Tout vient d'une `methodDefinition` : une autre méthode
 * afficherait les siens. Disponible pour tous, téléphone compris.
 */
@Component({
  selector: 'app-method-panel',
  imports: [SidePanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-side-panel labelledBy="method-panel-title" (closed)="closed.emit()">
      <header class="panel-head">
        <span class="muted small">{{ messages.caption }}</span>
        <h2 id="method-panel-title">
          {{ definition().name }}
          <span class="badge">{{ versionLabel() }}</span>
        </h2>
      </header>
      <section>
        <h3>{{ messages.formula }}</h3>
        <p class="formula">{{ definition().formula }}</p>
      </section>
      <section>
        <h3>{{ messages.criteria }}</h3>
        <table class="mini-table">
          <thead>
            <tr>
              <th>{{ messages.code }}</th>
              <th>{{ messages.name }}</th>
              <th>{{ messages.definition }}</th>
              <th>{{ messages.importColumn }}</th>
            </tr>
          </thead>
          <tbody>
            @for (criterion of definition().criteria; track criterion.key) {
              <tr>
                <td>{{ criterion.code }}</td>
                <td>{{ criterion.label }}</td>
                <td>{{ criterion.definition }}</td>
                <td>{{ criterion.header }}</td>
              </tr>
            }
          </tbody>
        </table>
      </section>
      <section>
        <h3>{{ messages.computed }}</h3>
        <table class="mini-table">
          <thead>
            <tr>
              <th>{{ messages.code }}</th>
              <th>{{ messages.name }}</th>
              <th>{{ messages.definition }}</th>
              <th>{{ messages.display }}</th>
            </tr>
          </thead>
          <tbody>
            @for (value of definition().computedValues; track value.key) {
              <tr>
                <td>{{ value.code }}</td>
                <td>{{ value.label }}</td>
                <td>{{ value.definition }}</td>
                <td>{{ messages.displays[value.display] }}</td>
              </tr>
            }
          </tbody>
        </table>
      </section>
      <section>
        <h3>{{ messages.tieBreak }}</h3>
        <p>{{ definition().tieBreakRule }}</p>
      </section>
      @if (scale(); as scale) {
        <section>
          <h3>{{ messages.scale }}</h3>
          <p>{{ scaleLabel(scale) }}</p>
        </section>
      }
      <p class="notice info" role="note">{{ messages.frozen }}</p>
    </app-side-panel>
  `,
})
export class MethodPanelComponent {
  protected readonly messages = MESSAGES.methodPanel;

  readonly definition = input.required<MethodDefinition>();
  /** Échelle de la session ; absente depuis l'accueil, où aucune session n'existe encore. */
  readonly scale = input<SessionScale | null>(null);
  readonly closed = output<void>();

  protected versionLabel(): string {
    return format(this.messages.version, { version: this.definition().version });
  }

  protected scaleLabel(scale: SessionScale): string {
    return scale.type === 'FIBONACCI'
      ? format(this.messages.scaleFibonacci, { values: scale.allowedValues.join(', ') })
      : format(this.messages.scaleValue, { max: scale.max });
  }
}
