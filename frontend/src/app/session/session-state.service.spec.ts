import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ErrorMessage, ServerMessage, SessionState } from '../api/contract';
import { feature, participantState, sessionState } from '../testing/fixtures';
import { INTENT_TIMEOUT_MS, SessionStateService } from './session-state.service';
import { SessionSocketService } from './session-socket.service';

class FakeSocket {
  readonly messages = new Subject<ServerMessage>();
  readonly connection = signal<'connecting' | 'open' | 'lost'>('open');
  readonly end = signal<'notFound' | 'unknownToken' | null>(null);
  readonly sent: Record<string, unknown>[] = [];
  open = true;
  connectedTo: string | null = null;
  connect(id: string): void {
    this.connectedTo = id;
  }
  send(message: object): boolean {
    if (!this.open) return false;
    this.sent.push(message as Record<string, unknown>);
    return true;
  }
}

const error = (code: ErrorMessage['code'], featureId?: string): ErrorMessage => ({
  type: 'error',
  code,
  ...(featureId ? { featureId } : {}),
});

describe('SessionStateService', () => {
  let socket: FakeSocket;
  let service: SessionStateService;

  beforeEach(() => {
    vi.useFakeTimers();
    socket = new FakeSocket();
    TestBed.configureTestingModule({
      providers: [SessionStateService, { provide: SessionSocketService, useValue: socket }],
    });
    service = TestBed.inject(SessionStateService);
  });

  afterEach(() => vi.useRealTimers());

  const push = (state: SessionState) => socket.messages.next(state);

  it('has no state before the first sessionState, then keeps the last one', () => {
    expect(service.state()).toBeNull();
    expect(service.isFacilitator()).toBe(false);
    push(sessionState({ version: 1 }));
    push(sessionState({ version: 2, name: 'Autre nom' }));
    expect(service.state()?.name).toBe('Autre nom');
    expect(service.isFacilitator()).toBe(true);
  });

  it('knows a participant is not the facilitator', () => {
    push(participantState());
    expect(service.isFacilitator()).toBe(false);
  });

  it('forgets the previous state when it connects, and opens the socket', () => {
    push(sessionState());
    service.connect('abc');
    expect(service.state()).toBeNull();
    expect(socket.connectedTo).toBe('abc');
  });

  it('exposes the connection status and the end of the session', () => {
    expect(service.connection()).toBe('open');
    socket.end.set('unknownToken');
    expect(service.end()).toBe('unknownToken');
  });

  it('finds a feature of the current state', () => {
    push(sessionState({ features: [feature()] }));
    expect(service.feature(feature().id)?.externalId).toBe('F-1');
    expect(service.feature('nope')).toBeNull();
  });

  it('ignores messages it does not know', () => {
    push(sessionState());
    socket.messages.next({ type: 'tick' });
    expect(service.state()).not.toBeNull();
    expect(service.unexpectedError()).toBeNull();
  });

  describe('addFeature', () => {
    it('sends one intention and resolves when the next sessionState shows the feature', async () => {
      push(sessionState({ features: [] }));
      const result = service.addFeature({ externalId: 'F-9', title: 'Neuf', criteria: { bv: 3 } });
      expect(socket.sent).toEqual([
        { type: 'addFeature', externalId: 'F-9', title: 'Neuf', criteria: { bv: 3 } },
      ]);
      // aucune écriture locale : le tableau ne change que sur ce que le serveur diffuse
      expect(service.state()?.features).toHaveLength(0);
      push(
        sessionState({
          version: 2,
          features: [feature({ externalId: 'f-9', title: 'Neuf', criteria: { bv: 3 } })],
        }),
      );
      await expect(result).resolves.toEqual({ ok: true });
    });

    it('does not take another feature with the same identifier for its own confirmation', async () => {
      const result = service.addFeature({ externalId: 'F-9', title: 'Neuf' });
      let settled = false;
      void result.then(() => (settled = true));
      // une autre personne vient d'ajouter un F-9 d'un autre titre : le serveur refusera le nôtre
      push(sessionState({ features: [feature({ externalId: 'F-9', title: 'Celui d’un autre' })] }));
      await Promise.resolve();
      expect(settled).toBe(false);
      socket.messages.next(error('DUPLICATE_EXTERNAL_ID'));
      await expect(result).resolves.toMatchObject({ ok: false, code: 'DUPLICATE_EXTERNAL_ID' });
    });

    it('stays pending while the state does not show it', async () => {
      const result = service.addFeature({ externalId: 'F-9', title: 'Neuf' });
      let settled = false;
      void result.then(() => (settled = true));
      push(sessionState({ features: [feature({ externalId: 'F-1' })] }));
      await Promise.resolve();
      expect(settled).toBe(false);
      push(sessionState({ features: [feature({ externalId: 'F-9', title: 'Neuf' })] }));
      await expect(result).resolves.toEqual({ ok: true });
    });

    it('resolves with the server error, for example a duplicate identifier', async () => {
      const result = service.addFeature({ externalId: 'F-1', title: 'Doublon' });
      const refusal = error('DUPLICATE_EXTERNAL_ID');
      socket.messages.next(refusal);
      await expect(result).resolves.toEqual({
        ok: false,
        code: 'DUPLICATE_EXTERNAL_ID',
        error: refusal,
      });
    });
  });

  describe('updateFeature', () => {
    it('sends the version it read and resolves once a newer version arrives', async () => {
      const f = feature({ version: 3 });
      push(sessionState({ features: [f] }));
      const result = service.updateFeature(f.id, 3, { title: 'Nouveau', criteria: { js: 5 } });
      expect(socket.sent[0]).toEqual({
        type: 'updateFeature',
        featureId: f.id,
        version: 3,
        title: 'Nouveau',
        criteria: { js: 5 },
      });
      push(
        sessionState({
          features: [
            feature({ version: 4, title: 'Nouveau', criteria: { bv: 8, tc: 5, rrOe: 3, js: 5 } }),
          ],
        }),
      );
      await expect(result).resolves.toEqual({ ok: true });
    });

    it('does not take another person’s change for the confirmation of its own', async () => {
      const f = feature({ version: 3 });
      push(sessionState({ features: [f] }));
      const result = service.updateFeature(f.id, 3, { criteria: { js: 3 } });
      let settled = false;
      void result.then(() => (settled = true));
      // un autre poste a mis le JS à 5 : la version avance, mais ce n'est pas notre changement
      push(
        sessionState({
          features: [feature({ version: 4, criteria: { bv: 8, tc: 5, rrOe: 3, js: 5 } })],
        }),
      );
      await Promise.resolve();
      expect(settled).toBe(false);
      socket.messages.next(error('STALE_VERSION', f.id));
      await expect(result).resolves.toMatchObject({ ok: false, code: 'STALE_VERSION' });
      expect(service.feature(f.id)?.version).toBe(4);
    });

    it('is confirmed when someone else made exactly the same change', async () => {
      const f = feature({ version: 3 });
      push(sessionState({ features: [f] }));
      const result = service.updateFeature(f.id, 3, {
        markedForReview: true,
        reviewReason: 'à voir',
      });
      push(
        sessionState({
          features: [feature({ version: 4, markedForReview: true, reviewReason: ' à voir ' })],
        }),
      );
      await expect(result).resolves.toEqual({ ok: true });
    });

    it('checks every kind of change before confirming', async () => {
      const f = feature({ version: 1 });
      push(sessionState({ features: [f] }));
      const result = service.updateFeature(f.id, 1, {
        externalId: 'F-77',
        title: 'T',
        description: null,
        markedForReview: false,
        criteria: { js: null },
      });
      // chaque état ci-dessous contredit un seul des changements : aucun ne confirme
      const base = {
        version: 2,
        externalId: 'F-77',
        title: 'T',
        description: null,
        markedForReview: false,
        criteria: { bv: 8, tc: 5, rrOe: 3, js: null },
      };
      for (const wrong of [
        { externalId: 'F-1' },
        { title: 'Autre' },
        { description: 'x' },
        { markedForReview: true },
        { criteria: { js: 4 } },
      ]) {
        push(sessionState({ features: [feature({ ...base, ...wrong })] }));
      }
      let settled = false;
      void result.then(() => (settled = true));
      await Promise.resolve();
      expect(settled).toBe(false);
      push(sessionState({ features: [feature(base)] }));
      await expect(result).resolves.toEqual({ ok: true });
    });

    it('reports STALE_VERSION for that feature', async () => {
      const f = feature({ version: 3 });
      const result = service.updateFeature(f.id, 2, { title: 'X' });
      const refusal = error('STALE_VERSION', f.id);
      socket.messages.next(refusal);
      await expect(result).resolves.toMatchObject({ ok: false, code: 'STALE_VERSION' });
    });

    it('does not mix up the errors of two features', async () => {
      const a = service.updateFeature('A', 1, { title: 'a' });
      const b = service.updateFeature('B', 1, { title: 'b' });
      socket.messages.next(error('FEATURE_IN_OPEN_ROUND', 'B'));
      await expect(b).resolves.toMatchObject({ ok: false, code: 'FEATURE_IN_OPEN_ROUND' });
      socket.messages.next(error('INVALID_VALUE', 'A'));
      await expect(a).resolves.toMatchObject({ ok: false, code: 'INVALID_VALUE' });
    });
  });

  describe('deleteFeature', () => {
    it('resolves when the feature is gone from the next sessionState', async () => {
      const f = feature();
      push(sessionState({ features: [f] }));
      const result = service.deleteFeature(f.id, 0);
      expect(socket.sent[0]).toEqual({ type: 'deleteFeature', featureId: f.id, version: 0 });
      push(sessionState({ features: [] }));
      await expect(result).resolves.toEqual({ ok: true });
    });
  });

  describe('failures', () => {
    it('answers OFFLINE without sending when the connection is closed', async () => {
      socket.open = false;
      await expect(service.deleteFeature('A', 0)).resolves.toEqual({ ok: false, code: 'OFFLINE' });
      expect(socket.sent).toHaveLength(0);
    });

    it('answers TIMEOUT when the server never confirms', async () => {
      const result = service.addFeature({ externalId: 'F-9', title: 'Neuf' });
      vi.advanceTimersByTime(INTENT_TIMEOUT_MS);
      await expect(result).resolves.toEqual({ ok: false, code: 'TIMEOUT' });
      // une réponse tardive n'est plus attendue : l'erreur est « inattendue »
      socket.messages.next(error('FORBIDDEN'));
      expect(service.unexpectedError()?.code).toBe('FORBIDDEN');
    });

    it('keeps an error nobody was waiting for, and clears it on the next intention', () => {
      socket.messages.next(error('FORBIDDEN'));
      expect(service.unexpectedError()?.code).toBe('FORBIDDEN');
      void service.deleteFeature('A', 0);
      expect(service.unexpectedError()).toBeNull();
    });

    it('gives an error without a feature to the oldest pending intention', async () => {
      const first = service.addFeature({ externalId: 'F-9', title: 'Neuf' });
      const second = service.deleteFeature('A', 0);
      socket.messages.next(error('SESSION_CLOSED'));
      await expect(first).resolves.toMatchObject({ ok: false, code: 'SESSION_CLOSED' });
      vi.advanceTimersByTime(INTENT_TIMEOUT_MS);
      await expect(second).resolves.toEqual({ ok: false, code: 'TIMEOUT' });
    });

    it('stops waiting when the service is destroyed', () => {
      void service.addFeature({ externalId: 'F-9', title: 'Neuf' });
      TestBed.resetTestingModule();
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
