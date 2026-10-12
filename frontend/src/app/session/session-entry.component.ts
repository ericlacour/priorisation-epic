import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { isSessionId } from '../api/contract';
import { MESSAGES } from '../i18n/messages.fr';
import { BrowserStorage } from '../storage/browser-storage';
import { JoinComponent } from './join/join.component';
import { SessionScreenComponent } from './session-screen.component';
import { SessionEnd } from './session-socket.service';

type View = 'session' | 'join' | 'notFound';

/**
 * Lien de session `/s/:sessionId`. Sans jeton de participant rangé dans ce navigateur : écran « Rejoindre ». Avec un
 * jeton : l'écran de la session. Un jeton refusé par le serveur (`4401`) ramène à « Rejoindre » ; une session
 * inconnue (`4404`, ou identifiant mal formé) montre « Session introuvable ».
 */
@Component({
  selector: 'app-session-entry',
  imports: [JoinComponent, SessionScreenComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (view()) {
      @case ('notFound') {
        <main class="state-screen">
          <h1>{{ messages.notFoundTitle }}</h1>
          <p class="lead">{{ messages.notFoundLead }}</p>
          <a class="btn btn-primary" routerLink="/">{{ messages.backHome }}</a>
        </main>
      }
      @case ('join') {
        <app-join
          [sessionId]="sessionId()"
          [takingOver]="takingOver()"
          (joined)="view.set('session')"
          (notFound)="view.set('notFound')"
        />
      }
      @default {
        <app-session-screen [sessionId]="sessionId()" (sessionEnded)="onEnded($event)" />
      }
    }
  `,
})
export class SessionEntryComponent {
  private readonly storage = inject(BrowserStorage);
  protected readonly messages = MESSAGES.sessionEntry;

  /** Identifiant de la session, lu dans l'URL. */
  readonly sessionId = input.required<string>();

  /** Vue courante ; se recalcule quand l'identifiant change, puis suit les événements des écrans. */
  protected readonly view = linkedSignal<View>(() => {
    const id = this.sessionId();
    if (!isSessionId(id)) return 'notFound';
    return this.storage.readToken(id) ? 'session' : 'join';
  });
  protected readonly takingOver = computed(
    () => this.storage.readAnimationToken(this.sessionId()) !== null,
  );

  protected onEnded(end: SessionEnd): void {
    this.view.set(end === 'notFound' ? 'notFound' : 'join');
  }
}
