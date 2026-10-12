import { DestroyRef, Injectable, InjectionToken, Signal, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';

import {
  CLOSE_SESSION_NOT_FOUND,
  CLOSE_UNKNOWN_TOKEN,
  ServerMessage,
  heartbeatMessage,
  helloMessage,
  parseServerMessage,
} from '../api/contract';
import { APP_CONFIG } from '../config/app-config';
import { BrowserStorage } from '../storage/browser-storage';

/** Ouverture d'un WebSocket, remplaçable dans les tests. */
export const WEB_SOCKET_FACTORY = new InjectionToken<(url: string) => WebSocket>(
  'WEB_SOCKET_FACTORY',
  {
    providedIn: 'root',
    factory: () => (url) => new WebSocket(url),
  },
);

/** `WebSocket.readyState`, sans dépendre d'un `WebSocket` global (tests). */
const OPEN = 1;
const CLOSING = 2;
const CLOSED = 3;

/** Le client envoie `heartbeat` toutes les 5 s (asyncapi.yaml, maintien de connexion). */
export const HEARTBEAT_INTERVAL_MS = 5_000;

/** Sans aucun message du serveur depuis 12 s, la connexion est perdue. */
export const SILENCE_TIMEOUT_MS = 12_000;

/** Attente avant chaque tentative de reconnexion : aussitôt, puis 1, 2, 4, 8 s, puis toutes les 10 s. */
export const RECONNECT_DELAYS_MS: readonly number[] = [0, 1_000, 2_000, 4_000, 8_000, 10_000];

/**
 * - `notFound` : fermeture `4404`, session introuvable ;
 * - `unknownToken` : fermeture `4401` (ou aucun jeton rangé), il faut rejoindre la session.
 */
export type SessionEnd = 'notFound' | 'unknownToken';

/**
 * - `connecting` : première connexion, rien reçu du serveur ;
 * - `open` : au moins un message reçu sur la connexion courante ;
 * - `lost` : connexion perdue, reconnexion en cours.
 */
export type ConnectionStatus = 'connecting' | 'open' | 'lost';

/** URL du canal de session, déduite de `apiBaseUrl` : `http` → `ws`, `https` → `wss`. Aucun jeton dans l'URL. */
export function sessionSocketUrl(apiBaseUrl: string, sessionId: string): string {
  return `${apiBaseUrl.replace(/^http/, 'ws')}/ws/sessions/${encodeURIComponent(sessionId)}`;
}

/**
 * Seul propriétaire du WebSocket de session. Il envoie `hello` (jeton de participant et, chez l'animateur, jeton
 * d'animation) dès l'ouverture, puis `heartbeat` toutes les 5 s. Sans message du serveur pendant 12 s, ou sur une
 * fermeture autre que `4401` / `4404`, la connexion est perdue : il se reconnecte seul (aussitôt, puis après 1, 2, 4
 * et 8 s, puis toutes les 10 s) en rejouant `hello`. `4401` et `4404` arrêtent tout : le jeton rangé est effacé et
 * `end` indique pourquoi. Les messages du serveur sont publiés tels que lus sur `messages` ; aucun calcul métier.
 *
 * Fourni par la page du lien de session : il vit et meurt avec elle.
 */
@Injectable()
export class SessionSocketService {
  private readonly config = inject(APP_CONFIG);
  private readonly storage = inject(BrowserStorage);
  private readonly openSocket = inject(WEB_SOCKET_FACTORY);

  private readonly endSignal = signal<SessionEnd | null>(null);
  private readonly connectionSignal = signal<ConnectionStatus>('connecting');
  private readonly incoming = new Subject<ServerMessage>();
  private sessionId: string | null = null;
  private socket: WebSocket | null = null;
  /** Tentatives faites depuis la dernière connexion établie : choisit l'attente de la suivante. */
  private attempts = 0;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private silence: ReturnType<typeof setTimeout> | undefined;
  private retry: ReturnType<typeof setTimeout> | undefined;

  /** Fin de la session pour ce navigateur, `null` tant qu'elle se poursuit. */
  readonly end: Signal<SessionEnd | null> = this.endSignal.asReadonly();
  /** État de la connexion. */
  readonly connection: Signal<ConnectionStatus> = this.connectionSignal.asReadonly();
  /** Messages du serveur reconnus (`tick`, `error`, `sessionState`…), dans l'ordre d'arrivée. */
  readonly messages = this.incoming.asObservable();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.disconnect();
      this.incoming.complete();
    });
  }

  /** Ouvre la connexion à la session avec les jetons rangés (`pe.token.*`, `pe.animation.*`). */
  connect(sessionId: string): void {
    this.disconnect();
    this.sessionId = sessionId;
    this.endSignal.set(null);
    this.connectionSignal.set('connecting');
    this.attempts = 0;
    this.openAttempt();
  }

  /** Ferme la connexion et arrête toute reconnexion. */
  disconnect(): void {
    this.sessionId = null;
    clearTimeout(this.retry);
    this.retry = undefined;
    this.closeSocket();
  }

  /** Envoie un message client sur une connexion ouverte ; sinon rien n'est envoyé. Renvoie vrai si envoyé. */
  send(message: object): boolean {
    const socket = this.socket;
    if (!socket || socket.readyState !== OPEN || this.connectionSignal() !== 'open') return false;
    socket.send(JSON.stringify(message));
    return true;
  }

  /** Une tentative : relit les jetons, ouvre un socket et rejoue `hello` à son ouverture. */
  private openAttempt(): void {
    this.retry = undefined;
    const sessionId = this.sessionId;
    if (sessionId === null) return;
    const token = this.storage.readToken(sessionId);
    if (!token) {
      this.finish('unknownToken');
      return;
    }
    const animationToken = this.storage.readAnimationToken(sessionId);
    const socket = this.openSocket(sessionSocketUrl(this.config.apiBaseUrl, sessionId));
    this.socket = socket;
    this.armSilence();
    socket.onopen = () => {
      if (this.socket !== socket) return;
      socket.send(JSON.stringify(helloMessage(token, animationToken)));
      this.heartbeat = setInterval(() => {
        if (socket.readyState === OPEN) socket.send(JSON.stringify(heartbeatMessage()));
      }, HEARTBEAT_INTERVAL_MS);
    };
    socket.onmessage = (event: MessageEvent) => {
      if (this.socket !== socket) return;
      this.armSilence();
      this.receive(event.data);
    };
    socket.onclose = (event: CloseEvent) => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.stopTimers();
      if (event.code === CLOSE_SESSION_NOT_FOUND) this.finish('notFound');
      else if (event.code === CLOSE_UNKNOWN_TOKEN) this.finish('unknownToken');
      else this.lose();
    };
  }

  /** Connexion perdue : la fermer si besoin, programmer la prochaine tentative. */
  private lose(): void {
    this.closeSocket();
    this.connectionSignal.set('lost');
    const delay = RECONNECT_DELAYS_MS[Math.min(this.attempts, RECONNECT_DELAYS_MS.length - 1)];
    this.attempts++;
    this.retry = setTimeout(() => this.openAttempt(), delay);
  }

  /** Fin `4404` ou `4401` : plus aucune tentative, jeton effacé, `end` renseigné. */
  private finish(end: SessionEnd): void {
    const sessionId = this.sessionId;
    this.disconnect();
    if (sessionId !== null) {
      this.storage.removeToken(sessionId);
      this.storage.removeAnimationToken(sessionId);
    }
    this.endSignal.set(end);
  }

  private receive(data: unknown): void {
    if (typeof data !== 'string') return;
    let json: unknown;
    try {
      json = JSON.parse(data);
    } catch {
      return;
    }
    const message = parseServerMessage(json);
    if (!message) return;
    if (this.connectionSignal() !== 'open') {
      this.connectionSignal.set('open');
      this.attempts = 0;
    }
    this.incoming.next(message);
  }

  /** Chien de garde : sans message du serveur pendant 12 s, la connexion est perdue. */
  private armSilence(): void {
    clearTimeout(this.silence);
    this.silence = setTimeout(() => this.lose(), SILENCE_TIMEOUT_MS);
  }

  private closeSocket(): void {
    this.stopTimers();
    const socket = this.socket;
    this.socket = null;
    if (socket && socket.readyState !== CLOSED && socket.readyState !== CLOSING) {
      socket.close(1000);
    }
  }

  private stopTimers(): void {
    clearInterval(this.heartbeat);
    this.heartbeat = undefined;
    clearTimeout(this.silence);
    this.silence = undefined;
  }
}
