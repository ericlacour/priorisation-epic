import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { SessionApi, SessionApiError } from '../api/session-api';
import { BoardComponent } from '../board/board.component';
import { MESSAGES } from '../i18n/messages.fr';
import { BrowserStorage } from '../storage/browser-storage';
import { RankingScreenComponent } from '../ranking/ranking-screen.component';
import { JoinComponent } from './join/join.component';
import { SessionRoomService } from './session-room.service';
import { SessionSocketService } from './session-socket.service';

/** Intervalle de relecture d'une session clôturée vue en lecture seule : sa réouverture finit par se voir. */
export const READ_ONLY_REFRESH_MS = 30_000;

/** Ce que la page montre : la recherche de la session, l'écran d'entrée, la session ouverte ou « introuvable ». */
type Phase = 'checking' | 'join' | 'room' | 'notFound' | 'unavailable';

/**
 * Lien de session `/s/:sessionId`. Sans jeton rangé dans ce navigateur, l'écran d'entrée, ou, pour une session
 * clôturée, son tableau en lecture seule lu par `GET /api/sessions/{sessionId}`, sans la rejoindre (FR-026) ; seul
 * l'animateur venu par son lien d'animation la rejoint, pour pouvoir la rouvrir. Avec un jeton, la connexion à la
 * session et le tableau. La connexion (`4401`) ou la session (`4404`) perdue ramène à l'entrée ou à
 * « Session introuvable ». L'animateur passe du tableau à l'écran « Prioriser par classement » et en revient. Le
 * socket et l'état de la session vivent et meurent avec la page.
 */
@Component({
  selector: 'app-session-entry',
  imports: [BoardComponent, JoinComponent, RankingScreenComponent, RouterLink],
  providers: [SessionSocketService, SessionRoomService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (phase()) {
      @case ('checking') {
        <main class="state-screen" role="status">
          <h1>{{ messages.loading }}</h1>
        </main>
      }
      @case ('join') {
        <app-join [sessionId]="sessionId()" (joined)="open()" (notFound)="phase.set('notFound')" />
      }
      @case ('room') {
        @if (ranking()) {
          <app-ranking-screen (closed)="ranking.set(false)" />
        } @else {
          <app-board (rankingRequested)="ranking.set(true)" />
        }
      }
      @case ('notFound') {
        <main class="state-screen" role="alert">
          <h1 class="state-error">{{ messages.notFound }}</h1>
          <p class="lead">{{ messages.notFoundLead }}</p>
          <a class="btn btn-primary" routerLink="/">{{ messages.home }}</a>
        </main>
      }
      @case ('unavailable') {
        <main class="state-screen" role="alert">
          <h1 class="state-error">{{ apiErrors.network }}</h1>
          <button type="button" class="btn btn-primary" (click)="ngOnInit()">
            {{ wakeMessages.retry }}
          </button>
        </main>
      }
    }
  `,
})
export class SessionEntryComponent implements OnInit {
  private readonly api = inject(SessionApi);
  private readonly storage = inject(BrowserStorage);
  private readonly room = inject(SessionRoomService);
  protected readonly messages = MESSAGES.sessionEntry;
  protected readonly apiErrors = MESSAGES.apiErrors;
  protected readonly wakeMessages = MESSAGES.wake;

  /** Identifiant de la session, lu dans l'URL. */
  readonly sessionId = input.required<string>();
  protected readonly phase = signal<Phase>('checking');
  /** Dans la session : l'écran « Prioriser par classement » à la place du tableau (FR-015a). */
  protected readonly ranking = signal(false);
  /** La relecture de la session clôturée montrée sans connexion (pas de socket pour en recevoir les changements). */
  private refreshTimer: ReturnType<typeof setInterval> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopRefresh());
    effect(() => {
      const end = this.room.end();
      if (end === 'notFound') this.phase.set('notFound');
      else if (end === 'unknownToken') this.phase.set('join');
    });
  }

  ngOnInit(): void {
    this.stopRefresh();
    if (this.storage.readToken(this.sessionId())) {
      this.open();
      return;
    }
    this.phase.set('checking');
    this.api.checkSession(this.sessionId()).then(
      (state) => {
        if (state.status === 'CLOSED' && !this.storage.readAnimationToken(this.sessionId())) {
          this.ranking.set(false);
          this.room.showReadOnly(state);
          this.phase.set('room');
          this.refreshTimer = setInterval(() => this.refresh(), READ_ONLY_REFRESH_MS);
        } else {
          this.phase.set('join');
        }
      },
      (e: unknown) =>
        this.phase.set(
          e instanceof SessionApiError && e.kind === 'notFound' ? 'notFound' : 'unavailable',
        ),
    );
  }

  /**
   * Relit la session clôturée montrée en lecture seule : rouverte, elle propose de la rejoindre ; supprimée,
   * « Session introuvable ». Un échec réseau garde la dernière vue, la relecture suivante réessaie.
   */
  private refresh(): void {
    this.api.checkSession(this.sessionId()).then(
      (state) => {
        if (this.refreshTimer === undefined) return;
        if (state.status === 'CLOSED') {
          this.room.showReadOnly(state);
        } else {
          this.stopRefresh();
          this.phase.set('join');
        }
      },
      (e: unknown) => {
        if (this.refreshTimer === undefined) return;
        if (e instanceof SessionApiError && e.kind === 'notFound') {
          this.stopRefresh();
          this.phase.set('notFound');
        }
      },
    );
  }

  private stopRefresh(): void {
    clearInterval(this.refreshTimer);
    this.refreshTimer = undefined;
  }

  /** Ouvre la connexion avec les jetons rangés. */
  protected open(): void {
    this.stopRefresh();
    // Une session rouverte (après une reconnexion ou un retour à l'entrée) commence toujours sur le tableau.
    this.ranking.set(false);
    this.phase.set('room');
    this.room.open(this.sessionId());
  }
}
