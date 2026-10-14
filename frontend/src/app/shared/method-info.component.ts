import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

import { format } from '../i18n/format';
import { MESSAGES } from '../i18n/messages.fr';

/**
 * Icône ⓘ à côté de l'en-tête de la valeur principale (en WSJF : le WSJF), constitution I : la formule et la règle de
 * tri s'affichent au survol, au focus clavier et au toucher, et sont annoncées aux lecteurs d'écran. Le texte vient de
 * `sessionState` (`formula`, `tieBreakRule`), jamais du composant.
 */
@Component({
  selector: 'app-method-info',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="info-icon"
      [attr.aria-label]="text()"
      [attr.aria-describedby]="shown() ? tipId : null"
      (mouseenter)="shown.set(true)"
      (mouseleave)="shown.set(false)"
      (focus)="shown.set(true)"
      (blur)="shown.set(false)"
      (click)="shown.set(!shown())"
      (keydown.escape)="shown.set(false)"
    ></button>
    @if (shown()) {
      <span class="term-tip info-tip" role="tooltip" [id]="tipId">
        <span class="info-line">{{ formula() }}</span>
        <span class="info-line">{{ sortLine() }}</span>
        <span class="info-line">{{ messages.endOfList }}</span>
      </span>
    }
  `,
})
export class MethodInfoComponent {
  private static nextId = 0;
  protected readonly tipId = `method-info-${MethodInfoComponent.nextId++}`;
  protected readonly messages = MESSAGES.methodInfo;

  readonly formula = input.required<string>();
  readonly tieBreakRule = input.required<string>();
  protected readonly shown = signal(false);
  protected readonly sortLine = computed(() =>
    format(this.messages.sort, { rule: this.tieBreakRule() }),
  );
  protected readonly text = computed(
    () =>
      `${this.messages.label} : ${this.formula()}. ${this.sortLine()} ${this.messages.endOfList}`,
  );
}
