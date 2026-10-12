import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';

import { MESSAGES } from '../i18n/messages.fr';

/** Un lien affiché dans un cadre, avec un bouton « Copier ». Si la copie est impossible, le lien reste sélectionnable. */
@Component({
  selector: 'app-link-box',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'linkbox' },
  template: `
    <code>{{ url() }}</code>
    <button
      type="button"
      class="btn btn-secondary btn-sm"
      [attr.aria-label]="messages.copyLabel(label())"
      (click)="copy()"
    >
      {{ copied() ? messages.copied : messages.copy }}
    </button>
    @if (failed()) {
      <span class="err" role="alert">{{ messages.copyFailed }}</span>
    }
  `,
})
export class LinkBoxComponent {
  private readonly document = inject(DOCUMENT);
  protected readonly messages = MESSAGES.linkBox;
  readonly url = input.required<string>();
  /** Nom du lien, repris dans le nom accessible du bouton (« Copier le lien d'invitation »). */
  readonly label = input.required<string>();
  protected readonly copied = signal(false);
  protected readonly failed = signal(false);

  protected async copy(): Promise<void> {
    try {
      await this.document.defaultView!.navigator.clipboard.writeText(this.url());
      this.failed.set(false);
      this.copied.set(true);
    } catch {
      this.copied.set(false);
      this.failed.set(true);
    }
  }
}
