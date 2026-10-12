import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';

import { BoardComponent } from '../board/board.component';
import { FeatureDetailPanelComponent } from '../board/feature-detail-panel.component';
import { MESSAGES } from '../i18n/messages.fr';
import { ScreenSizeService } from '../layout/screen-size.service';
import { OpenRoundDialogComponent } from '../rounds/open-round-dialog.component';
import { RevealResultsComponent } from '../rounds/reveal-results.component';
import { RoundBannerComponent } from '../rounds/round-banner.component';
import { VotePanelComponent } from '../rounds/vote-panel.component';
import { LinkBoxComponent } from '../shared/link-box.component';
import { MethodGlossaryComponent } from '../shared/method-glossary.component';
import { MethodPanelComponent } from '../shared/method-panel.component';
import { scaleLabel } from '../shared/method-format';
import { AnimationLinkComponent } from './animation-link.component';
import { ParticipantsComponent } from './participants.component';
import { SessionEnd, SessionSocketService } from './session-socket.service';
import { SessionStatusComponent } from './session-status.component';
import { SessionStateService } from './session-state.service';

/**
 * Écran d'une session rejointe (écrans 4 et 4 quinquies des maquettes) : barre de session, tableau, panneau latéral
 * (participants, invitation, lien d'animation, aide sur la méthode) et panneaux de détail et de méthode. Il possède
 * la connexion WebSocket (fournie ici, elle vit et meurt avec l'écran) et ne fait que montrer le `sessionState` reçu.
 */
@Component({
  selector: 'app-session-screen',
  imports: [
    BoardComponent,
    FeatureDetailPanelComponent,
    MethodPanelComponent,
    MethodGlossaryComponent,
    AnimationLinkComponent,
    LinkBoxComponent,
    ParticipantsComponent,
    SessionStatusComponent,
    OpenRoundDialogComponent,
    VotePanelComponent,
    RevealResultsComponent,
    RoundBannerComponent,
  ],
  providers: [SessionSocketService, SessionStateService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'session-screen' },
  template: `
    @if (session.state(); as state) {
      <header class="session-bar">
        <div>
          <h1 class="session-title">{{ state.name }}</h1>
          <div class="session-sub">{{ subtitle() }}</div>
        </div>
        <span
          class="badge"
          [class.live]="state.status === 'IN_PROGRESS'"
          [class.prep]="state.status === 'PREPARATION'"
          [class.closed]="state.status === 'CLOSED'"
          >{{ messages.status[state.status] }}</span
        >
      </header>
      @if (session.connection() === 'lost') {
        <p class="notice danger" role="status">{{ messages.connectionLost }}</p>
      }
      @if (session.unexpectedError(); as error) {
        <p class="notice danger" role="alert">{{ errors[error.code] }}</p>
      }
      <div class="session-body">
        @if (session.handedOver()) {
          <p class="notice success" role="status">{{ handoverMessages.handedOver }}</p>
        }
        @for (round of state.openRounds; track round.id) {
          <app-round-banner [round]="round" [canReveal]="canEdit()" />
        }
        @if (!session.isFacilitator() && state.openRounds.length === 0) {
          <p class="notice info" role="note">{{ messages.noRound }}</p>
        }
        <div class="actions" role="group">
          @if (state.lastRevealedRounds.length > 0) {
            <button
              type="button"
              class="btn btn-secondary"
              [attr.aria-pressed]="historyOpen()"
              (click)="historyOpen.set(!historyOpen())"
            >
              {{ messages.revealedRounds }}
            </button>
          }
          @if (!session.isFacilitator()) {
            <button type="button" class="btn btn-secondary" disabled [attr.title]="messages.soon">
              {{ messages.export }}
            </button>
          }
        </div>
        <div class="layout-board">
          <div class="main-col">
            @if (canEdit()) {
              <app-session-status [status]="state.status" (openRound)="dialogOpen.set(true)" />
            }
            @if (!screen.isPhone() && state.me) {
              @for (round of state.openRounds; track round.id) {
                <app-vote-panel
                  [state]="state"
                  [round]="round"
                  (featureSelected)="selectedId.set($event)"
                />
              }
            }
            @for (round of shownRounds(); track round.id) {
              <app-reveal-results
                [state]="state"
                [round]="round"
                [canEdit]="canEdit()"
                [hideable]="!historyOpen()"
                (hidden)="dismissedRoundId.set(round.id)"
                (featureSelected)="selectedId.set($event)"
              />
            }
            <app-board
              [state]="state"
              [editable]="canEdit()"
              (featureSelected)="selectedId.set($event)"
            />
          </div>
          <aside class="side" [attr.aria-label]="messages.sidePanel">
            <app-participants
              [participants]="state.participants"
              [meId]="state.me?.participantId ?? null"
              [round]="state.openRounds[0] ?? null"
              [canTransfer]="canEdit()"
            />
            <section class="card">
              <h2>{{ messages.invite }}</h2>
              <app-link-box [url]="inviteUrl()" [label]="messages.inviteLabel" />
              @if (canEdit()) {
                <app-animation-link [sessionId]="sessionId()" />
              }
            </section>
            <app-method-glossary
              [definition]="state.methodDefinition"
              (methodRequested)="methodOpen.set(true)"
            />
          </aside>
        </div>
      </div>
      @if (dialogOpen() && canEdit()) {
        <app-open-round-dialog
          [state]="state"
          [suspended]="selectedId() !== null"
          (closed)="dialogOpen.set(false)"
          (featureSelected)="selectedId.set($event)"
        />
      }
      @if (selected(); as feature) {
        <app-feature-detail-panel
          [feature]="feature"
          [state]="state"
          [canEdit]="canEdit()"
          (closed)="selectedId.set(null)"
          (methodRequested)="openMethodFromDetail()"
        />
      }
      @if (methodOpen()) {
        <app-method-panel
          [definition]="state.methodDefinition"
          [scale]="state.scale"
          (closed)="methodOpen.set(false)"
        />
      }
    } @else {
      <p class="page lead" role="status">
        {{ session.connection() === 'lost' ? messages.connectionLost : sessionMessages.loading }}
      </p>
    }
  `,
})
export class SessionScreenComponent implements OnInit {
  protected readonly session = inject(SessionStateService);
  private readonly socket = inject(SessionSocketService);
  protected readonly screen = inject(ScreenSizeService);
  private readonly origin = inject(DOCUMENT).location.origin;
  protected readonly messages = MESSAGES.session;
  protected readonly sessionMessages = MESSAGES.sessionEntry;
  protected readonly errors = MESSAGES.errors;
  protected readonly handoverMessages = MESSAGES.participantsList;

  readonly sessionId = input.required<string>();
  /** La connexion est terminée pour ce navigateur (`4404` ou `4401`). */
  readonly sessionEnded = output<SessionEnd>();

  protected readonly selectedId = signal<string | null>(null);
  protected readonly methodOpen = signal(false);
  protected readonly dialogOpen = signal(false);
  protected readonly historyOpen = signal(false);
  /** Le dernier tour révélé que l'utilisateur a masqué : un nouveau tour révélé réapparaît. */
  protected readonly dismissedRoundId = signal<string | null>(null);

  /** L'animateur sur ordinateur peut saisir ; sur téléphone tout est en lecture seule. */
  protected readonly canEdit = computed(
    () => this.session.isFacilitator() && !this.screen.isPhone(),
  );
  protected readonly selected = computed(() => {
    const id = this.selectedId();
    return id === null ? null : (this.session.state()?.features.find((f) => f.id === id) ?? null);
  });
  /** Les tours révélés montrés : le dernier tant qu'il n'est pas masqué, ou tous (du plus récent au plus ancien). */
  protected readonly shownRounds = computed(() => {
    const rounds = this.session.state()?.lastRevealedRounds ?? [];
    if (this.historyOpen()) return rounds;
    const latest = rounds[0];
    return latest && latest.id !== this.dismissedRoundId() ? [latest] : [];
  });
  protected readonly inviteUrl = computed(() => `${this.origin}/s/${this.sessionId()}`);
  protected readonly subtitle = computed(() => {
    const state = this.session.state();
    if (!state) return '';
    const scale = scaleLabel(state.scale);
    const facilitator = state.participants.find((p) => p.role === 'FACILITATOR')?.pseudo ?? '';
    if (state.me?.role === 'FACILITATOR')
      return this.messages.facilitatorSub(state.me.pseudo, scale);
    return state.me
      ? this.messages.participantSub(state.me.pseudo, facilitator, scale)
      : this.messages.viewerSub(facilitator, scale);
  });

  constructor() {
    effect(() => {
      const end = this.socket.end();
      if (end !== null) this.sessionEnded.emit(end);
    });
  }

  ngOnInit(): void {
    this.session.connect(this.sessionId());
  }

  protected openMethodFromDetail(): void {
    this.selectedId.set(null);
    this.methodOpen.set(true);
  }
}
