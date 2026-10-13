import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { MethodDefinition } from '../api/session-state';
import { format } from '../i18n/format';
import { MESSAGES } from '../i18n/messages.fr';
import { BrowserStorage } from '../storage/browser-storage';

/**
 * Encadré « Comprendre le <méthode> » (FR-016a) : toutes les définitions de la méthode de la session. Repliable et
 * dépliable ; l'état est mémorisé dans le navigateur (`pe.glossary`), ouvert par défaut. Seuls les textes génériques
 * viennent du catalogue.
 */
@Component({
  selector: 'app-method-glossary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card glossary-box' },
  template: `
    <button
      type="button"
      class="glossary-toggle"
      [attr.aria-expanded]="open()"
      aria-controls="glossary-body"
      (click)="toggle()"
    >
      <h2>{{ title() }}</h2>
      <span class="small">{{ open() ? messages.fold : messages.unfold }}</span>
    </button>
    @if (open()) {
      <div id="glossary-body">
        <dl class="glossary">
          @for (entry of entries(); track entry.key) {
            <dt>{{ entry.code }} · {{ entry.label }}</dt>
            <dd>{{ entry.definition }}</dd>
          }
        </dl>
        <button type="button" class="link-button small" (click)="methodRequested.emit()">
          {{ messages.fullMethod }}
        </button>
      </div>
    }
  `,
})
export class MethodGlossaryComponent {
  private readonly storage = inject(BrowserStorage);
  protected readonly messages = MESSAGES.glossary;

  readonly definition = input.required<MethodDefinition>();
  /** Demande d'ouverture du panneau « Méthode de la session ». */
  readonly methodRequested = output<void>();
  protected readonly open = signal(this.storage.readGlossaryOpen());
  protected readonly title = computed(() =>
    format(this.messages.title, { method: this.definition().name }),
  );
  protected readonly entries = computed(() => [
    ...this.definition().criteria,
    ...this.definition().computedValues,
  ]);

  protected toggle(): void {
    this.open.update((value) => !value);
    this.storage.saveGlossaryOpen(this.open());
  }
}
