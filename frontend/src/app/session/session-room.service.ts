import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';

import {
  ActiveRankingRoom,
  AddFeatureMessage,
  DeleteFeatureMessage,
  ErrorCode,
  ImpactedValue,
  OpinionKind,
  RankingDraft,
  RankingEndReason,
  StatusAction,
  UpdateFeatureMessage,
  UpdateSettingsMessage,
  isErrorMessage,
  isRankingRoom,
  isSessionState,
} from '../api/contract';
import { SessionState } from '../api/session-state';
import { BrowserStorage } from '../storage/browser-storage';
import { SessionSocketService } from './session-socket.service';

/** Intention refusée : le code du serveur, ou `NOT_CONNECTED` quand rien n'a pu être envoyé. */
export interface IntentRefusal {
  readonly code: ErrorCode | 'NOT_CONNECTED';
  readonly featureId?: string;
  /** `SCALE_IMPACT` : les valeurs que le changement d'échelle mettrait hors échelle. */
  readonly impactedValues?: readonly ImpactedValue[];
}

/**
 * L'état de la session ouverte dans cet onglet : dernier `sessionState` reçu, droits d'animateur de la connexion
 * (`me.role`), dernier refus d'une intention, et envoi des intentions de fonctionnalité. Aucun calcul métier : le
 * serveur envoie les scores et le tri. Fourni par la page du lien de session, avec `SessionSocketService`.
 */
@Injectable()
export class SessionRoomService {
  private readonly socket = inject(SessionSocketService);
  private readonly storage = inject(BrowserStorage);

  private readonly stateSignal = signal<SessionState | null>(null);
  private readonly refusalSignal = signal<IntentRefusal | null>(null);
  private readonly rankingRoomSignal = signal<ActiveRankingRoom | null>(null);
  private readonly rankingEndSignal = signal<RankingEndReason | null>(null);
  private sessionId: string | null = null;

  readonly state = this.stateSignal.asReadonly();
  readonly refusal = this.refusalSignal.asReadonly();
  /** La salle de classement en cours (FR-015b), ou `null` : aucun classement diffusé. */
  readonly rankingRoom = this.rankingRoomSignal.asReadonly();
  /** Pourquoi la dernière salle s'est fermée, jusqu'à ce que le message soit lu. */
  readonly rankingEnd = this.rankingEndSignal.asReadonly();
  readonly connection = this.socket.connection;
  readonly end = this.socket.end;
  /** Les droits d'animateur sont ceux de la connexion : `me.role` vaut `FACILITATOR` avec un jeton d'animation valide. */
  readonly canAnimate = computed(() => this.stateSignal()?.me?.role === 'FACILITATOR');
  /** Une session clôturée est en lecture seule pour tous, animateur compris, sauf « Rouvrir » (FR-004, FR-026). */
  readonly closed = computed(() => this.stateSignal()?.status === 'CLOSED');
  /** L'animateur peut modifier le tableau : il anime une session qui n'est pas clôturée. */
  readonly canEdit = computed(() => this.canAnimate() && !this.closed());

  constructor() {
    const subscription = this.socket.messages.subscribe((message) => {
      if (isSessionState(message)) {
        this.stateSignal.set(message);
      } else if (isErrorMessage(message)) {
        this.receiveError(message.code, message.featureId, message.impactedValues);
      } else if (isRankingRoom(message)) {
        this.rankingRoomSignal.set(message.active ? message : null);
        this.rankingEndSignal.set(message.active ? null : message.endReason);
      }
    });
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
    // Connexion perdue : la salle n'est plus suivie. Le serveur la renvoie à la reconnexion si elle est encore ouverte.
    effect(() => {
      if (this.socket.connection() === 'lost') this.rankingRoomSignal.set(null);
    });
  }

  /** Ouvre la connexion à la session avec les jetons rangés dans ce navigateur. */
  open(sessionId: string): void {
    this.sessionId = sessionId;
    this.socket.connect(sessionId);
  }

  /**
   * Montre l'état lu par `GET /api/sessions/{sessionId}`, sans connexion : la consultation d'une session clôturée
   * depuis la liste des sessions, sans la rejoindre (FR-026).
   */
  showReadOnly(state: SessionState): void {
    this.sessionId = state.sessionId;
    this.stateSignal.set(state);
  }

  addFeature(message: Omit<AddFeatureMessage, 'type'>): boolean {
    return this.send({ type: 'addFeature', ...message });
  }

  updateFeature(message: Omit<UpdateFeatureMessage, 'type'>): boolean {
    return this.send({ type: 'updateFeature', ...message });
  }

  deleteFeature(message: Omit<DeleteFeatureMessage, 'type'>): boolean {
    return this.send({ type: 'deleteFeature', ...message });
  }

  /** Renomme la session ou change son échelle ; sans `confirm`, un changement impactant revient en `SCALE_IMPACT`. */
  updateSettings(message: Omit<UpdateSettingsMessage, 'type'>): boolean {
    return this.send({ type: 'updateSettings', ...message });
  }

  /** Démarre, clôture ou rouvre la session (animateur, FR-004). */
  changeStatus(action: StatusAction): boolean {
    return this.send({ type: 'changeStatus', action });
  }

  /**
   * Diffuse le brouillon de l'écran de classement (animateur, FR-015b), ou met la diffusion en pause avec `null`.
   * Envoi discret : un échec ne remplace pas le dernier refus affiché.
   */
  sendRankingDraft(draft: RankingDraft | null): boolean {
    return this.socket.send(
      draft === null
        ? { type: 'updateRankingDraft', live: false }
        : { type: 'updateRankingDraft', live: true, draft },
    );
  }

  /** Ferme la salle de classement (animateur) : `SAVED` après « Terminer », `CANCELLED` sur « Annuler ». */
  endRanking(outcome: 'SAVED' | 'CANCELLED'): boolean {
    return this.socket.send({ type: 'endRanking', outcome });
  }

  /**
   * Donne, change ou retire (`null`) son avis sur une carte (participant, FR-015c). `comment` absent garde le
   * commentaire, vide l'efface.
   */
  giveOpinion(
    featureId: string,
    criterionKey: string,
    opinion: OpinionKind | null,
    comment?: string,
    value?: number,
  ): boolean {
    return this.send({
      type: 'giveOpinion',
      featureId,
      criterionKey,
      opinion,
      ...(comment === undefined ? {} : { comment }),
      ...(value === undefined ? {} : { value }),
    });
  }

  /** « Effacer les avis » d'une carte pour un critère (animateur). */
  clearOpinions(featureId: string, criterionKey: string): boolean {
    return this.send({ type: 'clearOpinions', featureId, criterionKey });
  }

  /** Met une carte en discussion, ou termine la discussion avec `null` (animateur). */
  setSpotlight(featureId: string | null): boolean {
    return this.send({ type: 'setSpotlight', featureId });
  }

  /** « Accord trouvé » sur une carte pour un critère, ou sa réouverture avec `false` (animateur). */
  settleCard(featureId: string, criterionKey: string, agreed: boolean): boolean {
    return this.send({ type: 'settleCard', featureId, criterionKey, agreed });
  }

  /** Le message de fin de la salle a été lu. */
  dismissRankingEnd(): void {
    this.rankingEndSignal.set(null);
  }

  /** Les jetons de l'animateur de cette session rangés dans ce navigateur, pour l'import ; `null` sans eux. */
  facilitatorTokens(): { participantToken: string; animationToken: string } | null {
    if (this.sessionId === null) return null;
    const participantToken = this.storage.readToken(this.sessionId);
    const animationToken = this.storage.readAnimationToken(this.sessionId);
    return participantToken && animationToken ? { participantToken, animationToken } : null;
  }

  /** Oublie le dernier refus (l'utilisateur l'a lu ou a corrigé sa saisie). */
  clearRefusal(): void {
    this.refusalSignal.set(null);
  }

  private send(message: object): boolean {
    this.refusalSignal.set(null);
    if (this.socket.send(message)) return true;
    this.refusalSignal.set({ code: 'NOT_CONNECTED' });
    return false;
  }

  private receiveError(
    code: ErrorCode,
    featureId?: string,
    impactedValues?: readonly ImpactedValue[],
  ): void {
    if (code === 'FORBIDDEN' && !this.socket.hasSentIntent()) {
      // Aucune intention n'est partie sur cette connexion : c'est le refus du `hello`, le jeton d'animation rangé
      // n'est pas valide. La connexion reste celle d'un participant. Un `sessionState` reçu entre-temps (présence
      // d'un autre participant) ne change rien à ce classement.
      if (this.sessionId !== null) this.storage.removeAnimationToken(this.sessionId);
      return;
    }
    this.refusalSignal.set({
      code,
      ...(featureId === undefined ? {} : { featureId }),
      ...(impactedValues === undefined ? {} : { impactedValues }),
    });
  }
}
