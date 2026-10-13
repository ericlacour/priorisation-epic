import { ChangeDetectionStrategy, Component } from '@angular/core';

import { MESSAGES } from '../i18n/messages.fr';
import { ThemeMenuComponent } from './theme-menu.component';

/** Barre du haut, toujours affichée : pastille « PF », nom de l'application et menu du thème. */
@Component({
  selector: 'app-top-bar',
  imports: [ThemeMenuComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'top-bar', role: 'banner' },
  template: `
    <div class="brand">
      <span class="brand-mark" aria-hidden="true">{{ messages.badge }}</span>
      <span class="brand-name">{{ messages.name }}</span>
    </div>
    <app-theme-menu />
  `,
})
export class TopBarComponent {
  protected readonly messages = MESSAGES.app;
}
