import { ChangeDetectionStrategy, Component, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { MESSAGES } from './i18n/messages.fr';
import { ScreenSizeService } from './layout/screen-size.service';
import { SessionChromeService } from './layout/session-chrome.service';
import { TopBarComponent } from './top-bar/top-bar.component';
import { ServerWakeService } from './wake/server-wake.service';
import { WakeScreenComponent } from './wake/wake-screen.component';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, TopBarComponent, WakeScreenComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Sur le tableau d'une session, la barre de session prend la place de la barre de l'application (FR-014c). -->
    @if (!chrome.sessionBar()) {
      <app-top-bar />
    }
    @if (screen.isPhone()) {
      <p class="read-only-banner" role="status">{{ messages.layout.readOnlyBanner }}</p>
    }
    @switch (wake.state()) {
      @case ('waking') {
        <app-wake-screen />
      }
      @case ('unavailable') {
        <app-wake-screen [unavailable]="true" (retry)="wake.start()" />
      }
      @case ('ready') {
        <router-outlet />
      }
    }
  `,
})
export class App implements OnInit {
  protected readonly screen = inject(ScreenSizeService);
  protected readonly chrome = inject(SessionChromeService);
  protected readonly wake = inject(ServerWakeService);
  protected readonly messages = MESSAGES;

  ngOnInit(): void {
    this.wake.start();
  }
}
