import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { MESSAGES } from './i18n/messages.fr';
import { ScreenSizeService } from './layout/screen-size.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (screen.isPhone()) {
      <p class="read-only-banner" role="status">{{ messages.layout.readOnlyBanner }}</p>
    }
    <router-outlet />
  `,
})
export class App {
  protected readonly screen = inject(ScreenSizeService);
  protected readonly messages = MESSAGES;
}
