import {
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  computed,
  inject,
  output,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { AssistantPreviewService } from '../board/assistant-preview.service';
import { LinksMenuComponent } from '../board/links-menu.component';
import { ExportMenuComponent } from '../import-export/export-menu.component';
import { ParticipantsMenuComponent } from '../board/participants-menu.component';
import { format } from '../i18n/format';
import { MESSAGES } from '../i18n/messages.fr';
import { ScreenSizeService } from '../layout/screen-size.service';
import { scaleLabel } from '../shared/scale';
import { statusBadge } from '../shared/status-badge';
import { glossaryTitle } from '../shared/method-glossary.component';
import { ThemeMenuComponent } from '../top-bar/theme-menu.component';
import { SessionRoomService } from './session-room.service';

/**
 * Barre de session (FR-014c), sur une ligne, à la place de la barre de l'application : à gauche la pastille « PF »
 * (retour à l'accueil), le nom de la session tronqué (en entier au survol), son statut et une ligne d'information,
 * puis le lien « Comprendre le <méthode> » (FR-016a) ; à droite les outils, les mêmes pour tous : participants
 * (FR-005), « Tours révélés » (place réservée, active avec le vote masqué), le menu « Exporter » (FR-023, FR-024),
 * les liens de l'animateur (FR-014b) et le thème.
 */
@Component({
  selector: 'app-session-bar',
  imports: [
    ExportMenuComponent,
    LinksMenuComponent,
    ParticipantsMenuComponent,
    RouterLink,
    ThemeMenuComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'session-bar' },
  template: `
    @if (state(); as state) {
      <a
        class="brand-mark"
        routerLink="/"
        [attr.aria-label]="messages.home"
        [attr.title]="messages.home"
        >{{ appMessages.badge }}</a
      >
      <div class="session-id">
        <h1 [attr.title]="state.name">{{ state.name }}</h1>
        <p class="session-sub">
          <span class="badge" [class]="statusClass()">{{ statusLabel() }}</span>
          <span class="board-info-text muted" [attr.title]="infoLine()">{{ infoLine() }}</span>
        </p>
      </div>
      <button type="button" class="link-button session-help" (click)="glossaryRequested.emit()">
        {{ glossaryTitle() }}
      </button>
      <div class="session-tools" role="group" [attr.aria-label]="messages.toolsLabel">
        <app-participants-menu
          [participants]="state.participants"
          [meId]="state.me?.participantId ?? null"
        />
        <button type="button" class="btn btn-secondary" disabled [attr.title]="messages.soon">
          {{ messages.revealedRounds }}
        </button>
        <app-export-menu [sessionId]="state.sessionId" />
        @if (room.canAnimate()) {
          <app-links-menu
            [sessionId]="state.sessionId"
            [inviteUrl]="inviteUrl()"
            [withAnimation]="!screen.isPhone()"
          />
        }
        @if (!screen.isPhone()) {
          <!-- L'aperçu de l'assistant IA, une illustration : affiché ou masqué d'un clic (FR-014d). -->
          <button
            type="button"
            class="btn btn-secondary assistant-toggle"
            [attr.aria-pressed]="assistant.shown()"
            [attr.title]="assistant.shown() ? assistantMessages.hide : assistantMessages.show"
            (click)="assistant.toggle()"
          >
            <span aria-hidden="true">✦</span> {{ assistantMessages.toggle }}
          </button>
        }
        <app-theme-menu />
      </div>
    }
  `,
})
export class SessionBarComponent {
  /** Le lien « Comprendre le <méthode> » ouvre le panneau des définitions (FR-016a). */
  readonly glossaryRequested = output<void>();

  protected readonly room = inject(SessionRoomService);
  protected readonly screen = inject(ScreenSizeService);
  protected readonly assistant = inject(AssistantPreviewService);
  protected readonly assistantMessages = MESSAGES.assistant;
  private readonly document = inject(DOCUMENT);
  protected readonly messages = MESSAGES.board;
  protected readonly appMessages = MESSAGES.app;
  protected readonly state = this.room.state;

  protected readonly statusLabel = computed(
    () => this.messages.status[this.state()?.status ?? 'PREPARATION'],
  );

  protected readonly statusClass = computed(() => statusBadge(this.state()?.status));

  protected readonly infoLine = computed(() => {
    const state = this.state();
    if (!state) return '';
    const facilitator = state.participants.find((p) => p.role === 'FACILITATOR')?.pseudo ?? '';
    const values = { facilitator, me: state.me?.pseudo ?? '', scale: scaleLabel(state.scale) };
    return format(
      this.room.canAnimate() ? this.messages.facilitatorLine : this.messages.participantLine,
      values,
    );
  });

  protected readonly glossaryTitle = computed(() => {
    const definition = this.state()?.methodDefinition;
    return definition ? glossaryTitle(definition) : '';
  });

  protected readonly inviteUrl = computed(
    () => `${this.document.location.origin}/s/${this.state()?.sessionId ?? ''}`,
  );
}
