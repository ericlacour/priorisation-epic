import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';

import {
  AddFeatureMessage,
  DeleteFeatureMessage,
  ErrorCode,
  UpdateFeatureMessage,
  isErrorMessage,
  isSessionState,
} from '../api/contract';
import { SessionState } from '../api/session-state';
import { BrowserStorage } from '../storage/browser-storage';
import { SessionSocketService } from './session-socket.service';

/** Intention refusée : le code du serveur, ou `NOT_CONNECTED` quand rien n'a pu être envoyé. */
export interface IntentRefusal {
  readonly code: ErrorCode | 'NOT_CONNECTED';
  readonly featureId?: string;
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
  private sessionId: string | null = null;
  /** Vrai entre l'envoi d'une intention et la réponse du serveur : distingue un refus d'intention d'un refus du `hello`. */
  private awaiting = false;

  readonly state = this.stateSignal.asReadonly();
  readonly refusal = this.refusalSignal.asReadonly();
  readonly connection = this.socket.connection;
  readonly end = this.socket.end;
  /** Les droits d'animateur sont ceux de la connexion : `me.role` vaut `FACILITATOR` avec un jeton d'animation valide. */
  readonly canAnimate = computed(() => this.stateSignal()?.me?.role === 'FACILITATOR');

  constructor() {
    const subscription = this.socket.messages.subscribe((message) => {
      if (isSessionState(message)) {
        this.awaiting = false;
        this.stateSignal.set(message);
      } else if (isErrorMessage(message)) {
        this.receiveError(message.code, message.featureId);
      }
    });
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
  }

  /** Ouvre la connexion à la session avec les jetons rangés dans ce navigateur. */
  open(sessionId: string): void {
    this.sessionId = sessionId;
    this.socket.connect(sessionId);
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

  /** Oublie le dernier refus (l'utilisateur l'a lu ou a corrigé sa saisie). */
  clearRefusal(): void {
    this.refusalSignal.set(null);
  }

  private send(message: object): boolean {
    this.refusalSignal.set(null);
    this.awaiting = true;
    if (this.socket.send(message)) return true;
    this.awaiting = false;
    this.refusalSignal.set({ code: 'NOT_CONNECTED' });
    return false;
  }

  private receiveError(code: ErrorCode, featureId?: string): void {
    if (!this.awaiting && code === 'FORBIDDEN') {
      // Refus du `hello` : le jeton d'animation rangé n'est pas valide. La connexion reste celle d'un participant.
      if (this.sessionId !== null) this.storage.removeAnimationToken(this.sessionId);
      return;
    }
    this.awaiting = false;
    this.refusalSignal.set(featureId === undefined ? { code } : { code, featureId });
  }
}
