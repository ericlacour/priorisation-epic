import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { MESSAGES } from '../i18n/messages.fr';
import { AssistantPreviewService } from './assistant-preview.service';

/**
 * La bascule « ✦ Assistant IA » (FR-014d) : enfoncée tant que l'aperçu est affiché. La même dans la barre de session
 * et sur les écrans de classement ; le choix, gardé dans ce navigateur, vaut pour les deux.
 */
@Component({
  selector: 'app-assistant-toggle',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      type="button"
      class="btn btn-secondary assistant-toggle"
      [class.btn-sm]="small()"
      [attr.aria-pressed]="assistant.shown()"
      [attr.title]="title()"
      (click)="assistant.toggle()"
    >
      <span aria-hidden="true">✦</span> {{ messages.toggle }}
    </button>
  `,
})
export class AssistantToggleComponent {
  protected readonly assistant = inject(AssistantPreviewService);
  protected readonly messages = MESSAGES.assistant;

  /** À côté de quoi l'aperçu s'affiche : le tableau ou le classement. */
  readonly beside = input<'board' | 'ranking'>('board');

  /** Au format des petits boutons, au-dessus du classement. */
  readonly small = input(false);

  protected readonly title = computed(() => {
    if (this.assistant.shown()) return this.messages.hide;
    return this.beside() === 'ranking' ? this.messages.showRanking : this.messages.show;
  });
}
