import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';

import { MESSAGES } from '../i18n/messages.fr';
import { CLIPBOARD } from './clipboard';

/** Durée d'affichage de « Copié » sur le bouton. */
const COPIED_DELAY_MS = 2000;

/**
 * Un bouton qui copie un lien sans l'afficher. Si le navigateur refuse la copie, le lien s'affiche pour être copié à
 * la main ; s'il n'est pas disponible (`text` vaut `null`), le message `unavailable` s'affiche.
 */
@Component({
  selector: 'app-copy-button',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'copy-button' },
  template: `
    <button type="button" class="btn btn-secondary btn-sm" [attr.title]="hint()" (click)="copy()">
      {{ copied() ? messages.copied : label() }}
    </button>
    @if (problem(); as text) {
      <div class="copy-problem" role="alert">
        <span class="err">{{ text }}</span>
        @if (fallback(); as link) {
          <code>{{ link }}</code>
        }
      </div>
    }
  `,
})
export class CopyButtonComponent {
  private readonly clipboard = inject(CLIPBOARD);
  protected readonly messages = MESSAGES.link;

  readonly label = input.required<string>();
  /** Texte d'aide au survol : ce que le bouton copie. */
  readonly hint = input('');
  /** Le texte à copier, ou `null` s'il n'est pas disponible. */
  readonly text = input.required<string | null>();
  /** Message affiché quand `text` vaut `null`. */
  readonly unavailable = input('');

  protected readonly copied = signal(false);
  protected readonly problem = signal<string | null>(null);
  protected readonly fallback = signal<string | null>(null);
  private timer: ReturnType<typeof setTimeout> | undefined;

  protected async copy(): Promise<void> {
    this.problem.set(null);
    this.fallback.set(null);
    const text = this.text();
    if (text === null) {
      this.problem.set(this.unavailable());
      return;
    }
    try {
      await this.clipboard(text);
      this.copied.set(true);
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.copied.set(false), COPIED_DELAY_MS);
    } catch {
      this.copied.set(false);
      this.problem.set(this.messages.copyFailed);
      this.fallback.set(text);
    }
  }
}
