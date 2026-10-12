import { ChangeDetectionStrategy, Component, OnInit, inject, input } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { MESSAGES } from '../i18n/messages.fr';
import { BrowserStorage } from '../storage/browser-storage';

/**
 * Lien privé d'animation `/s/:sessionId/animer#{animationToken}` (FR-002). Le jeton est dans le fragment : il n'est
 * jamais envoyé au serveur. Cette page le range dans le navigateur (`pe.animation.{sessionId}`), efface le fragment
 * de l'URL (remplacement de l'entrée d'historique) et ouvre la session, où la connexion présente le jeton avec
 * `hello` pour obtenir les droits d'animateur.
 */
@Component({
  selector: 'app-animate',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="page">
      <h1>{{ messages.title }}</h1>
      <p class="lead" role="status">{{ messages.lead }}</p>
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
    void this.router.navigate(['/s', this.sessionId()], { replaceUrl: true });
  }
}
