import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';

import {
  AddFeatureMessage,
  ErrorCode,
  ErrorMessage,
  Feature,
  SessionState,
  UpdateFeatureChanges,
  addFeatureMessage,
  deleteFeatureMessage,
  isSessionState,
  updateFeatureMessage,
} from '../api/contract';
import { SessionSocketService } from './session-socket.service';

const sameText = (a: string | null | undefined, b: string | null | undefined): boolean =>
  (a ?? '').trim() === (b ?? '').trim();

/**
 * La fonctionnalité montre-t-elle ces changements ? Une intention n'est confirmée que par un état qui les contient :
 * la version qui avance ne suffit pas, car elle avance aussi quand une autre personne modifie la même fonctionnalité,
 * et le serveur, lui, refuse alors notre intention (`STALE_VERSION`). Les textes sont comparés sans espaces autour.
 */
function showsChanges(feature: Feature, changes: UpdateFeatureChanges): boolean {
  if (changes.externalId !== undefined && !sameText(feature.externalId, changes.externalId))
    return false;
  if (changes.title !== undefined && !sameText(feature.title, changes.title)) return false;
  if (changes.description !== undefined && !sameText(feature.description, changes.description))
    return false;
  if (changes.markedForReview !== undefined && feature.markedForReview !== changes.markedForReview)
    return false;
  if (changes.reviewReason !== undefined && !sameText(feature.reviewReason, changes.reviewReason))
    return false;
  return Object.entries(changes.criteria ?? {}).every(
    ([key, value]) => (feature.criteria?.[key] ?? null) === value,
  );
}

/** Délai au-delà duquel une intention sans réponse du serveur est déclarée sans confirmation. */
export const INTENT_TIMEOUT_MS = 10_000;

/** Échec d'une intention : un `error` du serveur, une connexion fermée (`OFFLINE`) ou aucune réponse (`TIMEOUT`). */
export type IntentFailure = ErrorCode | 'OFFLINE' | 'TIMEOUT';

export type IntentResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly code: IntentFailure; readonly error?: ErrorMessage };

interface Pending {
  /** Fonctionnalité visée, `undefined` pour un ajout. */
  readonly featureId: string | undefined;
  /** Vrai quand le `sessionState` reçu montre que l'intention a été prise en compte. */
  readonly done: (state: SessionState) => boolean;
  readonly settle: (result: IntentResult) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

/**
 * État de la session pour ce poste : dernier `sessionState` reçu (le serveur l'envoie déjà filtré pour ce
 * destinataire) et intentions de l'animateur sur les fonctionnalités. Chaque intention renvoie une promesse qui se
 * résout quand le `sessionState` suivant la confirme, ou avec l'`error` du serveur : aucune écriture locale, le
 * tableau ne change que sur ce que le serveur diffuse (FR-015). Aucun calcul métier.
 *
 * Fourni par la page de session, avec le {@link SessionSocketService} dont il lit les messages.
 */
@Injectable()
export class SessionStateService {
  private readonly socket = inject(SessionSocketService);
  private readonly stateSignal = signal<SessionState | null>(null);
  private readonly errorSignal = signal<ErrorMessage | null>(null);
  private pending: Pending[] = [];

  /** Dernier état reçu, `null` avant le premier. */
  readonly state = this.stateSignal.asReadonly();
  /** Dernière erreur du serveur qu'aucune intention en attente n'attendait (par exemple `FORBIDDEN`). */
  readonly unexpectedError = this.errorSignal.asReadonly();
  readonly connection = this.socket.connection;
  readonly end = this.socket.end;
  readonly isFacilitator = computed(() => this.stateSignal()?.me?.role === 'FACILITATOR');

  constructor() {
    const subscription = this.socket.messages.subscribe((message) => {
      if (isSessionState(message)) this.receiveState(message);
      else if (message.type === 'error') this.receiveError(message as ErrorMessage);
    });
    inject(DestroyRef).onDestroy(() => {
      subscription.unsubscribe();
      for (const p of this.pending) clearTimeout(p.timer);
      this.pending = [];
    });
  }

  connect(sessionId: string): void {
    this.stateSignal.set(null);
    this.socket.connect(sessionId);
  }

  /** La fonctionnalité d'identifiant donné dans l'état courant. */
  feature(id: string): Feature | null {
    return this.stateSignal()?.features.find((f) => f.id === id) ?? null;
  }

  addFeature(feature: Omit<AddFeatureMessage, 'type'>): Promise<IntentResult> {
    const wanted = feature.externalId.toLowerCase();
    // Même identifiant ne suffit pas : une autre personne a pu ajouter, au même moment, une autre fonctionnalité de ce
    // nom, et le serveur refuse alors la nôtre (`DUPLICATE_EXTERNAL_ID`).
    return this.submit(addFeatureMessage(feature), undefined, (state) =>
      state.features.some(
        (f) =>
          f.externalId.toLowerCase() === wanted &&
          showsChanges(f, {
            title: feature.title,
            ...(feature.description !== undefined ? { description: feature.description } : {}),
            ...(feature.criteria ? { criteria: feature.criteria } : {}),
          }),
      ),
    );
  }

  updateFeature(
    featureId: string,
    version: number,
    changes: UpdateFeatureChanges,
  ): Promise<IntentResult> {
    return this.submit(updateFeatureMessage(featureId, version, changes), featureId, (state) => {
      const current = state.features.find((f) => f.id === featureId);
      return !!current && current.version > version && showsChanges(current, changes);
    });
  }

  deleteFeature(featureId: string, version: number): Promise<IntentResult> {
    return this.submit(
      deleteFeatureMessage(featureId, version),
      featureId,
      (state) => !state.features.some((f) => f.id === featureId),
    );
  }

  private submit(
    message: object,
    featureId: string | undefined,
    done: (state: SessionState) => boolean,
  ): Promise<IntentResult> {
    this.errorSignal.set(null);
    if (!this.socket.send(message)) return Promise.resolve({ ok: false, code: 'OFFLINE' });
    return new Promise((resolve) => {
      const entry: Pending = {
        featureId,
        done,
        settle: resolve,
        timer: setTimeout(() => {
          this.pending = this.pending.filter((p) => p !== entry);
          resolve({ ok: false, code: 'TIMEOUT' });
        }, INTENT_TIMEOUT_MS),
      };
      this.pending.push(entry);
    });
  }

  private receiveState(state: SessionState): void {
    this.stateSignal.set(state);
    const settled = this.pending.filter((p) => p.done(state));
    if (settled.length === 0) return;
    this.pending = this.pending.filter((p) => !settled.includes(p));
    for (const p of settled) {
      clearTimeout(p.timer);
      p.settle({ ok: true });
    }
  }

  private receiveError(error: ErrorMessage): void {
    const target = this.pending.find(
      (p) => error.featureId === undefined || p.featureId === error.featureId,
    );
    if (!target) {
      this.errorSignal.set(error);
      return;
    }
    this.pending = this.pending.filter((p) => p !== target);
    clearTimeout(target.timer);
    target.settle({ ok: false, code: error.code, error });
  }
}
