import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';

import { MESSAGES } from '../i18n/messages.fr';
import { LinkBoxComponent } from '../shared/link-box.component';
import { BrowserStorage } from '../storage/browser-storage';

/** `/s/{sessionId}/animer#{animationToken}` : le jeton reste après le `#`, il n'est jamais envoyé au serveur. */
export function animationUrl(origin: string, sessionId: string, token: string): string {
  return `${origin}/s/${encodeURIComponent(sessionId)}/animer#${token}`;
}

/**
 * « Afficher mon lien d'animation » (FR-002, cas « Lien d'animation perdu »), réservé à l'animateur : reconstruit le
 * lien privé à partir du jeton `pe.animation.{sessionId}` rangé dans ce navigateur, l'affiche avec un bouton
 * « Copier » et l'avertissement « À garder pour vous ». Aucun appel serveur : il ne connaît que l'empreinte du jeton.
 * Le composant n'est monté que pour l'animateur.
 */
@Component({
  selector: 'app-animation-link',
  imports: [LinkBoxComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!shown()) {
      <button type="button" class="btn btn-ghost btn-sm" (click)="shown.set(true)">
        {{ messages.show }}
      </button>
    } @else {
      <div class="secret">
        <h3>{{ messages.title }}</h3>
        @if (url(); as url) {
          <p class="small">
            <b>{{ messages.warning }}</b> {{ messages.help }}
          </p>
          <app-link-box [url]="url" [label]="messages.title" />
        } @else {
          <p class="small" role="status">{{ messages.missing }}</p>
        }
        <button type="button" class="btn btn-ghost btn-sm" (click)="shown.set(false)">
          {{ messages.hide }}
        </button>
      </div>
    }
  `,
})
export class AnimationLinkComponent {
  private readonly storage = inject(BrowserStorage);
  private readonly origin = inject(DOCUMENT).location.origin;
  protected readonly messages = MESSAGES.animationLink;

  readonly sessionId = input.required<string>();
  protected readonly shown = signal(false);
  protected readonly url = computed(() => {
    const token = this.storage.readAnimationToken(this.sessionId());
    return token ? animationUrl(this.origin, this.sessionId(), token) : null;
  });
}
