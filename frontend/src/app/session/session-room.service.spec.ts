import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';

import { ServerMessage } from '../api/contract';
import { SESSION_ID, state } from '../testing/fixtures';
import { memoryStorage } from '../testing/helpers';
import { SessionRoomService } from './session-room.service';
import { SessionSocketService } from './session-socket.service';

describe('SessionRoomService', () => {
  function setup(connected = true) {
    const messages = new Subject<ServerMessage>();
    let sent = false;
    const socket = {
      messages: messages.asObservable(),
      connection: signal('open'),
      end: signal(null),
      connect: vi.fn(),
      send: vi.fn<(message: object) => boolean>(() => {
        sent ||= connected;
        return connected;
      }),
      hasSentIntent: () => sent,
    };
    const storage = memoryStorage();
    TestBed.configureTestingModule({
      providers: [
        SessionRoomService,
        { provide: SessionSocketService, useValue: socket },
        storage.provider,
      ],
    });
    const room = TestBed.inject(SessionRoomService);
    room.open(SESSION_ID);
    return { room, messages, socket, storage };
  }

  it('opens the connection of the session', () => {
    const { socket } = setup();
    expect(socket.connect).toHaveBeenCalledWith(SESSION_ID);
  });

  it('keeps the last sessionState and derives the animation rights from me.role', () => {
    const { room, messages } = setup();
    expect(room.state()).toBeNull();
    expect(room.canAnimate()).toBe(false);

    messages.next(state());
    expect(room.state()?.name).toBe('Atelier Q4');
    expect(room.canAnimate()).toBe(true);

    messages.next(state({ me: { participantId: 'p2', pseudo: 'Camille', role: 'PARTICIPANT' } }));
    expect(room.canAnimate()).toBe(false);
    messages.next(state({ me: null }));
    expect(room.canAnimate()).toBe(false);
  });

  it('sends the feature intents as contract messages', () => {
    const { room, socket } = setup();

    expect(room.addFeature({ externalId: 'F-1', title: 'T', criteria: { bv: 8 } })).toBe(true);
    expect(room.updateFeature({ featureId: 'f1', version: 2, criteria: { js: null } })).toBe(true);
    expect(room.deleteFeature({ featureId: 'f1', version: 3 })).toBe(true);

    expect(socket.send.mock.calls.map((call) => call[0])).toEqual([
      { type: 'addFeature', externalId: 'F-1', title: 'T', criteria: { bv: 8 } },
      { type: 'updateFeature', featureId: 'f1', version: 2, criteria: { js: null } },
      { type: 'deleteFeature', featureId: 'f1', version: 3 },
    ]);
  });

  it('reports a refusal with its feature, and a new state clears the wait', () => {
    const { room, messages } = setup();
    room.updateFeature({ featureId: 'f1', version: 2 });

    messages.next({ type: 'error', code: 'STALE_VERSION', featureId: 'f1' } as ServerMessage);
    expect(room.refusal()).toEqual({ code: 'STALE_VERSION', featureId: 'f1' });

    room.clearRefusal();
    expect(room.refusal()).toBeNull();
    messages.next({ type: 'error', code: 'INVALID_VALUE' } as ServerMessage);
    expect(room.refusal()).toEqual({ code: 'INVALID_VALUE' });
  });

  it('says nothing was sent when the connection is lost', () => {
    const { room, socket } = setup(false);

    expect(room.addFeature({ externalId: 'F-1', title: 'T' })).toBe(false);

    expect(socket.send).toHaveBeenCalledOnce();
    expect(room.refusal()).toEqual({ code: 'NOT_CONNECTED' });
  });

  it('forgets an invalid animation token refused at hello, without showing an error', () => {
    const { room, messages, storage } = setup();
    storage.data.set(`pe.animation.${SESSION_ID}`, 'stale-token');

    messages.next({ type: 'error', code: 'FORBIDDEN' } as ServerMessage);

    expect(storage.data.has(`pe.animation.${SESSION_ID}`)).toBe(false);
    expect(room.refusal()).toBeNull();
  });

  it('shows a FORBIDDEN refusal that answers an intent', () => {
    const { room, messages } = setup();
    room.addFeature({ externalId: 'F-1', title: 'T' });

    messages.next({ type: 'error', code: 'FORBIDDEN' } as ServerMessage);

    expect(room.refusal()).toEqual({ code: 'FORBIDDEN' });
  });

  it('keeps a FORBIDDEN that answers an intent apart from hello, even after an unrelated state', () => {
    const { room, messages, storage } = setup();
    storage.data.set(`pe.animation.${SESSION_ID}`, 'token');
    room.addFeature({ externalId: 'F-1', title: 'T' });

    messages.next(state());
    messages.next({ type: 'error', code: 'FORBIDDEN' } as ServerMessage);

    expect(storage.data.get(`pe.animation.${SESSION_ID}`)).toBe('token');
    expect(room.refusal()).toEqual({ code: 'FORBIDDEN' });
  });

  it('ignores messages it does not know', () => {
    const { room, messages } = setup();
    messages.next({ type: 'tick' });
    expect(room.state()).toBeNull();
    expect(room.refusal()).toBeNull();
  });

  it('sends updateSettings and keeps the impacted values of a SCALE_IMPACT refusal', () => {
    const { room, messages, socket } = setup();
    expect(room.updateSettings({ scale: { type: 'FIBONACCI', max: 13 } })).toBe(true);
    expect(socket.send).toHaveBeenLastCalledWith({
      type: 'updateSettings',
      scale: { type: 'FIBONACCI', max: 13 },
    });

    const impactedValues = [{ externalId: 'F-1', criterion: 'js', value: 4 }];
    messages.next({ type: 'error', code: 'SCALE_IMPACT', impactedValues });
    expect(room.refusal()).toEqual({ code: 'SCALE_IMPACT', impactedValues });
  });

  it('gives the facilitator tokens stored for the session, or null', () => {
    const { room, storage } = setup();
    expect(room.facilitatorTokens()).toBeNull();
    storage.data.set(`pe.token.${SESSION_ID}`, 'p-token');
    expect(room.facilitatorTokens()).toBeNull();
    storage.data.set(`pe.animation.${SESSION_ID}`, 'a-token');
    expect(room.facilitatorTokens()).toEqual({
      participantToken: 'p-token',
      animationToken: 'a-token',
    });
  });
});
