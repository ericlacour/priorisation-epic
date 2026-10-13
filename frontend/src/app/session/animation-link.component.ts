import { ChangeDetectionStrategy, Component, DOCUMENT, inject, input, signal } from '@angular/core';

import { MESSAGES } from '../i18n/messages.fr';
import { LinkBoxComponent } from '../shared/link-box.component';
import { BrowserStorage } from '../storage/browser-storage';

/**
 * « Afficher mon lien d'animation » (FR-002, cas « Lien d'animation perdu »), pour l'animateur seulement : le lien
 * `/s/{sessionId}/animer#{animationToken}` est reconstruit à partir du jeton rangé dans ce navigateur. Aucun appel au
 * serveur : il ne connaît que l'empreinte du jeton.
 */
@Component({
  selector: 'app-animation-link',
  imports: [LinkBoxComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (url(); as link) {
      <div class="secret">
        <p class="small">
          <strong>{{ messages.warning }}</strong>
        </p>
        <app-link-box [url]="link" />
        <button type="button" class="link-button small" (click)="hide()">
          {{ messages.hide }}
        </button>
      </div>
    } @else if (missing()) {
      <p class="err" role="alert">{{ messages.missing }}</p>
    } @else {
      <button type="button" class="btn btn-ghost btn-sm" (click)="show()">
        {{ messages.show }}
      </button>
    }
  `,
})
export class AnimationLinkComponent {
  private readonly storage = inject(BrowserStorage);
  private readonly document = inject(DOCUMENT);
  protected readonly messages = MESSAGES.animationLink;

  readonly sessionId = input.required<string>();
  protected readonly url = signal<string | null>(null);
  protected readonly missing = signal(false);

  protected show(): void {
    const token = this.storage.readAnimationToken(this.sessionId());
    if (!token) {
      this.missing.set(true);
      return;
    }
    this.url.set(`${this.document.location.origin}/s/${this.sessionId()}/animer#${token}`);
  }

  protected hide(): void {
    this.url.set(null);
  }
}
