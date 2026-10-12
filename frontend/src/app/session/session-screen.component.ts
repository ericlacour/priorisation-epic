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
import { LinkBoxComponent } from '../shared/link-box.component';
import { MethodGlossaryComponent } from '../shared/method-glossary.component';
import { MethodPanelComponent } from '../shared/method-panel.component';
import { scaleLabel } from '../shared/method-format';
import { AnimationLinkComponent } from './animation-link.component';
import { SessionEnd, SessionSocketService } from './session-socket.service';
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
        @if (!session.isFacilitator() && !roundOpen()) {
          <p class="notice info" role="note">{{ messages.noRound }}</p>
        }
        @if (!session.isFacilitator()) {
          <div class="actions" role="group">
            <button type="button" class="btn btn-secondary" disabled [attr.title]="messages.soon">
              {{ messages.export }}
            </button>
            <button type="button" class="btn btn-secondary" disabled [attr.title]="messages.soon">
              {{ messages.revealedRounds }}
            </button>
          </div>
        }
        <div class="layout-board">
          <app-board
            [state]="state"
            [editable]="canEdit()"
            (featureSelected)="selectedId.set($event)"
          />
          <aside class="side" [attr.aria-label]="messages.sidePanel">
            <section class="card">
              <h2>{{ messages.participants(state.participants.length) }}</h2>
              <ul class="plist">
                @for (participant of state.participants; track participant.participantId) {
                  <li>
                    <span
                      class="dot"
                      [class.on]="participant.online"
                      [class.off]="!participant.online"
                      aria-hidden="true"
                    ></span>
                    <span>
                      {{ participant.pseudo }}
                      @if (participant.participantId === state.me?.participantId) {
                        ({{ messages.you }})
                      }
                    </span>
                    <span class="role">
                      {{
                        participant.role === 'FACILITATOR'
                          ? messages.facilitator
                          : (participant.businessRole ?? '')
                      }}
                    </span>
                    <span class="sr-only">{{
                      participant.online ? messages.online : messages.offline
                    }}</span>
                  </li>
                }
              </ul>
            </section>
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
  private readonly screen = inject(ScreenSizeService);
  private readonly origin = inject(DOCUMENT).location.origin;
  protected readonly messages = MESSAGES.session;
  protected readonly sessionMessages = MESSAGES.sessionEntry;
  protected readonly errors = MESSAGES.errors;

  readonly sessionId = input.required<string>();
  /** La connexion est terminée pour ce navigateur (`4404` ou `4401`). */
  readonly sessionEnded = output<SessionEnd>();

  protected readonly selectedId = signal<string | null>(null);
  protected readonly methodOpen = signal(false);

  /** L'animateur sur ordinateur peut saisir ; sur téléphone tout est en lecture seule. */
  protected readonly canEdit = computed(
    () => this.session.isFacilitator() && !this.screen.isPhone(),
  );
  protected readonly selected = computed(() => {
    const id = this.selectedId();
    return id === null ? null : (this.session.state()?.features.find((f) => f.id === id) ?? null);
  });
  protected readonly roundOpen = computed(
    () => this.session.state()?.features.some((f) => f.votingInProgress) ?? false,
  );
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
