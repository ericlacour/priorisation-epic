import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { MethodDefinition } from '../api/contract';
import { MESSAGES } from '../i18n/messages.fr';
import { BrowserStorage } from '../storage/browser-storage';

let nextId = 0;

/**
 * Encadré « Comprendre le <nom de la méthode> » du panneau latéral (FR-016a) : toutes les définitions de la méthode,
 * repliable et dépliable, état mémorisé dans le navigateur (`pe.glossary`, ouvert par défaut). Les sigles, noms et
 * définitions viennent de `methodDefinition` ; seuls les textes génériques sont dans le catalogue.
 */
@Component({
  selector: 'app-method-glossary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'card glossary-box' },
  template: `
    <div class="glossary-head">
      <h3 [id]="titleId">{{ title() }}</h3>
      <button
        type="button"
        class="glossary-toggle"
        [attr.aria-expanded]="open()"
        [attr.aria-controls]="bodyId"
        (click)="toggle()"
      >
        {{ open() ? messages.collapse : messages.expand }}
        <span aria-hidden="true">{{ open() ? '▴' : '▾' }}</span>
      </button>
    </div>
    @if (open()) {
      <div [id]="bodyId" role="region" [attr.aria-labelledby]="titleId">
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
  private readonly uid = nextId++;
  protected readonly messages = MESSAGES.method;
  protected readonly titleId = `glossary-title-${this.uid}`;
  protected readonly bodyId = `glossary-body-${this.uid}`;

  readonly definition = input.required<MethodDefinition>();
  /** L'utilisateur demande la méthode complète (panneau « Méthode de la session »). */
  readonly methodRequested = output<void>();

  protected readonly open = signal(this.storage.readGlossaryOpen());
  protected readonly title = computed(() => this.messages.glossaryTitle(this.definition().name));
  protected readonly entries = computed(() => [
    ...this.definition().criteria,
    ...this.definition().computedValues,
  ]);

  protected toggle(): void {
    this.open.update((open) => !open);
    this.storage.saveGlossaryOpen(this.open());
  }
}
