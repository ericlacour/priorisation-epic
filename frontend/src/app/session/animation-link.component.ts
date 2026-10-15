import { ChangeDetectionStrategy, Component, DOCUMENT, inject, input } from '@angular/core';

import { MESSAGES } from '../i18n/messages.fr';
import { CopyButtonComponent } from '../shared/copy-button.component';
import { BrowserStorage } from '../storage/browser-storage';

/**
 * « Copier mon lien d’animation » (FR-002, cas « Lien d'animation perdu »), pour l'animateur seulement : le lien
 * `/s/{sessionId}/animer#{animationToken}` est reconstruit à partir du jeton rangé dans ce navigateur, puis copié sans
 * être affiché. Aucun appel au serveur : il ne connaît que l'empreinte du jeton.
 */
@Component({
  selector: 'app-animation-link',
  imports: [CopyButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-copy-button
      [label]="messages.copy"
      [hint]="messages.hint"
      [text]="url()"
      [unavailable]="messages.missing"
    />
  `,
})
export class AnimationLinkComponent {
  private readonly storage = inject(BrowserStorage);
  private readonly document = inject(DOCUMENT);
  protected readonly messages = MESSAGES.animationLink;

  readonly sessionId = input.required<string>();

  /** Le jeton est rangé avant l'ouverture du tableau (à la création, ou par le lien d'animation). */
  protected url(): string | null {
    const token = this.storage.readAnimationToken(this.sessionId());
    return token ? `${this.document.location.origin}/s/${this.sessionId()}/animer#${token}` : null;
  }
}
