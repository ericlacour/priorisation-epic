import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { MethodDefinition } from '../api/session-state';
import { format } from '../i18n/format';
import { MESSAGES } from '../i18n/messages.fr';
import { SidePanelComponent } from './side-panel.component';

/** « Comprendre le <méthode> » : titre du panneau et du lien qui l'ouvre. */
export function glossaryTitle(definition: MethodDefinition): string {
  return format(MESSAGES.glossary.title, { method: definition.name });
}

/**
 * Panneau « Comprendre le <méthode> » (FR-016a) : toutes les définitions de la méthode de la session, ouvert depuis
 * le lien placé au-dessus du tableau, pour laisser au tableau toute la largeur de l'écran. Seuls les textes
 * génériques viennent du catalogue.
 */
@Component({
  selector: 'app-method-glossary',
  imports: [SidePanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-side-panel labelledBy="glossary-title" (closed)="closed.emit()">
      <header class="panel-head">
        <h2 id="glossary-title">{{ title() }}</h2>
      </header>
      <dl class="glossary">
        @for (entry of entries(); track entry.key) {
          <dt>{{ entry.code }} · {{ entry.label }}</dt>
          <dd>{{ entry.definition }}</dd>
        }
      </dl>
      <button type="button" class="link-button small" (click)="methodRequested.emit()">
        {{ messages.fullMethod }}
      </button>
    </app-side-panel>
  `,
})
export class MethodGlossaryComponent {
  protected readonly messages = MESSAGES.glossary;

  readonly definition = input.required<MethodDefinition>();
  readonly closed = output<void>();
  /** Demande d'ouverture du panneau « Méthode de la session ». */
  readonly methodRequested = output<void>();
  protected readonly title = computed(() => glossaryTitle(this.definition()));
  protected readonly entries = computed(() => [
    ...this.definition().criteria,
    ...this.definition().computedValues,
  ]);
}
