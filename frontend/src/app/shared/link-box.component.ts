import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';

import { MESSAGES } from '../i18n/messages.fr';
import { CLIPBOARD } from './clipboard';

/** Un lien et son bouton « Copier ». */
@Component({
  selector: 'app-link-box',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'linkbox' },
  template: `
    <code>{{ url() }}</code>
    <button type="button" class="btn btn-secondary btn-sm" (click)="copy()">
      {{ copied() ? messages.copied : messages.copy }}
    </button>
    @if (failed()) {
      <span class="err" role="alert">{{ messages.copyFailed }}</span>
    }
  `,
})
export class LinkBoxComponent {
  private readonly clipboard = inject(CLIPBOARD);
  protected readonly messages = MESSAGES.link;

  readonly url = input.required<string>();
  protected readonly copied = signal(false);
  protected readonly failed = signal(false);

  protected async copy(): Promise<void> {
    this.failed.set(false);
    try {
      await this.clipboard(this.url());
      this.copied.set(true);
    } catch {
      this.copied.set(false);
      this.failed.set(true);
    }
  }
}
