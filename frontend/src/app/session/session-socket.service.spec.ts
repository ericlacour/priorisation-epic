import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ServerMessage } from '../api/contract';
import { APP_CONFIG } from '../config/app-config';
import { BrowserStorage, LOCAL_STORAGE } from '../storage/browser-storage';
import {
  HEARTBEAT_INTERVAL_MS,
  RECONNECT_DELAYS_MS,
  SILENCE_TIMEOUT_MS,
  SessionSocketService,
  WEB_SOCKET_FACTORY,
  sessionSocketUrl,
} from './session-socket.service';

const ID = 'k3Jx9QvT2mLpZ8wR4nYb7A';

class FakeSocket {
  readyState = 0;
  readonly sent: unknown[] = [];
  closedWith: number | undefined;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  constructor(readonly url: string) {}
  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }
  close(code: number): void {
    this.closedWith = code;
    this.readyState = 3;
  }
  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(data: unknown): void {
    this.onmessage?.({
      data: typeof data === 'string' ? data : JSON.stringify(data),
    } as MessageEvent);
  }
  closeFromServer(code: number): void {
    this.readyState = 3;
    this.onclose?.({ code } as CloseEvent);
  }
}

describe('SessionSocketService', () => {
  let sockets: FakeSocket[];
  let store: Map<string, string>;
  let service: SessionSocketService;
  let received: ServerMessage[];

  function setup(tokens: Record<string, string> = { [`pe.token.${ID}`]: 'tok' }): void {
    sockets = [];
    store = new Map(Object.entries(tokens));
    const backing = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    } as Storage;
    TestBed.configureTestingModule({
      providers: [
        SessionSocketService,
        { provide: APP_CONFIG, useValue: { apiBaseUrl: 'https://api.example' } },
        { provide: LOCAL_STORAGE, useValue: () => backing },
        {
          provide: WEB_SOCKET_FACTORY,
          useValue: (url: string) => {
            const socket = new FakeSocket(url);
            sockets.push(socket);
            return socket as unknown as WebSocket;
          },
        },
      ],
    });
    service = TestBed.inject(SessionSocketService);
    received = [];
    service.messages.subscribe((m) => received.push(m));
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('derives wss from https and puts no token in the URL', () => {
    expect(sessionSocketUrl('https://api.example', ID)).toBe(`wss://api.example/ws/sessions/${ID}`);
    expect(sessionSocketUrl('http://localhost:8080', ID)).toBe(
      `ws://localhost:8080/ws/sessions/${ID}`,
    );
  });

  it('sends hello on open, with the animation token when stored', () => {
    setup({ [`pe.token.${ID}`]: 'tok', [`pe.animation.${ID}`]: 'anim' });
    service.connect(ID);
    expect(sockets).toHaveLength(1);
    expect(service.connection()).toBe('connecting');
    sockets[0].open();
    expect(sockets[0].sent).toEqual([
      { type: 'hello', participantToken: 'tok', animationToken: 'anim' },
    ]);
  });

  it('sends hello without animation token for a plain participant', () => {
    setup();
    service.connect(ID);
    sockets[0].open();
    expect(sockets[0].sent).toEqual([{ type: 'hello', participantToken: 'tok' }]);
  });

  it('sends a heartbeat every 5 s', () => {
    setup();
    service.connect(ID);
    sockets[0].open();
    sockets[0].receive({ type: 'tick' });
    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS - 1);
    expect(sockets[0].sent).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(sockets[0].sent[1]).toEqual({ type: 'heartbeat' });
    sockets[0].receive({ type: 'tick' });
    vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
    expect(sockets[0].sent).toHaveLength(3);
  });

  it('becomes open on the first server message and publishes recognised messages only', () => {
    setup();
    service.connect(ID);
    sockets[0].open();
    sockets[0].receive('pas du json');
    sockets[0].receive({ nope: true });
    sockets[0].receive(new ArrayBuffer(1) as unknown as string);
    expect(service.connection()).toBe('connecting');
    sockets[0].receive({ type: 'tick' });
    expect(service.connection()).toBe('open');
    expect(received).toEqual([{ type: 'tick' }]);
  });

  it('send only goes out on an open connection', () => {
    setup();
    service.connect(ID);
    sockets[0].open();
    expect(service.send({ type: 'x' })).toBe(false);
    sockets[0].receive({ type: 'tick' });
    expect(service.send({ type: 'x' })).toBe(true);
    expect(sockets[0].sent.at(-1)).toEqual({ type: 'x' });
  });

  it('declares the connection lost after 12 s of silence, and any message resets the watchdog', () => {
    setup();
    service.connect(ID);
    sockets[0].open();
    sockets[0].receive({ type: 'tick' });
    vi.advanceTimersByTime(SILENCE_TIMEOUT_MS - 1);
    sockets[0].receive({ type: 'tick' });
    vi.advanceTimersByTime(SILENCE_TIMEOUT_MS - 1);
    expect(service.connection()).toBe('open');
    vi.advanceTimersByTime(1);
    expect(service.connection()).toBe('lost');
    expect(sockets[0].closedWith).toBe(1000);
  });

  it('reconnects at once, then after 1, 2, 4, 8 s, then every 10 s', () => {
    setup();
    service.connect(ID);
    sockets[0].open();
    let expected = 1;
    for (const delay of RECONNECT_DELAYS_MS) {
      sockets[expected - 1].closeFromServer(1006);
      expect(service.connection()).toBe('lost');
      if (delay > 0) {
        vi.advanceTimersByTime(delay - 1);
        expect(sockets).toHaveLength(expected);
      }
      vi.advanceTimersByTime(1);
      expect(sockets).toHaveLength(++expected);
    }
    // Au-delà : toujours 10 s.
    sockets[expected - 1].closeFromServer(1006);
    vi.advanceTimersByTime(9_999);
    expect(sockets).toHaveLength(expected);
    vi.advanceTimersByTime(1);
    expect(sockets).toHaveLength(expected + 1);
  });

  it('replays hello on reconnection and resets the backoff once a message arrives', () => {
    setup();
    service.connect(ID);
    sockets[0].open();
    sockets[0].closeFromServer(1006);
    vi.advanceTimersByTime(0);
    sockets[1].closeFromServer(1006);
    vi.advanceTimersByTime(1_000);
    sockets[2].open();
    expect(sockets[2].sent[0]).toEqual({ type: 'hello', participantToken: 'tok' });
    sockets[2].receive({ type: 'tick' });
    expect(service.connection()).toBe('open');
    sockets[2].closeFromServer(1006);
    vi.advanceTimersByTime(0);
    expect(sockets).toHaveLength(4);
  });

  it.each([
    [4401, 'unknownToken'],
    [4404, 'notFound'],
  ] as const)('does not reconnect after close code %i, and forgets the tokens', (code, end) => {
    setup({ [`pe.token.${ID}`]: 'tok', [`pe.animation.${ID}`]: 'anim' });
    service.connect(ID);
    sockets[0].open();
    sockets[0].closeFromServer(code);
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
    expect(service.end()).toBe(end);
    expect(TestBed.inject(BrowserStorage).readToken(ID)).toBeNull();
    expect(TestBed.inject(BrowserStorage).readAnimationToken(ID)).toBeNull();
  });

  it('ends with unknownToken, without opening a socket, when no token is stored', () => {
    setup({});
    service.connect(ID);
    expect(sockets).toHaveLength(0);
    expect(service.end()).toBe('unknownToken');
  });

  it('disconnect stops everything and ignores late events from the old socket', () => {
    setup();
    service.connect(ID);
    const first = sockets[0];
    first.open();
    service.disconnect();
    expect(first.closedWith).toBe(1000);
    first.receive({ type: 'tick' });
    first.closeFromServer(1006);
    vi.advanceTimersByTime(60_000);
    expect(sockets).toHaveLength(1);
    expect(received).toEqual([]);
  });

  it('connect again replaces the previous socket and clears a previous end', () => {
    setup();
    service.connect(ID);
    sockets[0].closeFromServer(4404);
    expect(service.end()).toBe('notFound');
    store.set(`pe.token.${ID}`, 'tok');
    service.connect(ID);
    expect(service.end()).toBeNull();
    expect(sockets).toHaveLength(2);
  });

  it('closes the socket when the service is destroyed', () => {
    setup();
    service.connect(ID);
    sockets[0].open();
    TestBed.resetTestingModule();
    expect(sockets[0].closedWith).toBe(1000);
  });
});
