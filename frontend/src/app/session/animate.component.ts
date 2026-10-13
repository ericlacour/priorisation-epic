import { ChangeDetectionStrategy, Component, OnInit, inject, input } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { MESSAGES } from '../i18n/messages.fr';
import { BrowserStorage } from '../storage/browser-storage';

/**
 * Lien privé d'animation `/s/:sessionId/animer#{animationToken}` (FR-002) : le jeton, porté par le fragment, ne
 * quitte jamais le navigateur. Il est rangé (`pe.animation.{sessionId}`), puis le fragment est effacé de l'adresse et
 * la page ouvre la session, où la connexion présentera le jeton à `hello`.
 */
@Component({
  selector: 'app-animate',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="state-screen" role="status">
      <h1>{{ messages.title }}</h1>
    </main>
  `,
})
export class AnimateComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly storage = inject(BrowserStorage);
  protected readonly messages = MESSAGES.animate;

  /** Identifiant de la session, lu dans l'URL. */
  readonly sessionId = input.required<string>();

  ngOnInit(): void {
    const token = this.route.snapshot.fragment;
    if (token) this.storage.saveAnimationToken(this.sessionId(), token);
    // `replaceUrl` : l'adresse avec le jeton ne reste pas dans l'historique du navigateur.
    void this.router.navigate(['/s', this.sessionId()], { replaceUrl: true });
  }
}
