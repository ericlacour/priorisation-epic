import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { SESSION_ID, state } from '../testing/fixtures';
import { fakeFetch, memoryStorage, pageProviders, reply, settle } from '../testing/helpers';
import { SessionEntryComponent } from './session-entry.component';
import { SessionRoomService } from './session-room.service';
import { SessionSocketService } from './session-socket.service';

/** Salle simulée : l'entrée ne sait que l'ouvrir et lire sa fin. */
class FakeRoom {
  readonly open = vi.fn();
  readonly end = signal<'notFound' | 'unknownToken' | null>(null);
  readonly state = signal(state());
  readonly refusal = signal(null);
  readonly connection = signal('open');
  readonly canAnimate = signal(false);
  readonly closed = signal(false);
  readonly canEdit = computed(() => this.canAnimate() && !this.closed());
  readonly showReadOnly = vi.fn();
  clearRefusal = vi.fn();
}

describe('SessionEntryComponent', () => {
  async function render(options: {
    token?: boolean;
    animationToken?: boolean;
    routes?: Parameters<typeof fakeFetch>[0];
  }) {
    const http = fakeFetch(options.routes ?? {});
    const storage = memoryStorage();
    if (options.token) storage.data.set(`pe.token.${SESSION_ID}`, 'tok');
    if (options.animationToken) storage.data.set(`pe.animation.${SESSION_ID}`, 'anim');
    const room = new FakeRoom();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), ...pageProviders(http.fn, storage.provider)],
    });
    TestBed.overrideComponent(SessionEntryComponent, {
      set: {
        providers: [
          { provide: SessionRoomService, useValue: room },
          { provide: SessionSocketService, useValue: {} },
        ],
      },
    });
    const fixture = TestBed.createComponent(SessionEntryComponent);
    fixture.componentRef.setInput('sessionId', SESSION_ID);
    fixture.detectChanges();
    await settle(fixture);
    return { fixture, room, http, element: fixture.nativeElement as HTMLElement };
  }

  it('opens the connection straight away when a participant token is stored', async () => {
    const { room, element, http } = await render({ token: true });

    expect(room.open).toHaveBeenCalledWith(SESSION_ID);
    expect(http.calls).toHaveLength(0);
    expect(element.querySelector('app-board')).not.toBeNull();
  });

  it('shows the join screen when the session exists and no token is stored', async () => {
    const { room, element, http } = await render({
      routes: { [`GET /api/sessions/${SESSION_ID}`]: () => reply(200, {}) },
    });

    expect(http.calls[0].key).toBe(`GET /api/sessions/${SESSION_ID}`);
    expect(room.open).not.toHaveBeenCalled();
    expect(element.querySelector('app-join')).not.toBeNull();
  });

  it('shows a closed session read-only, without joining it nor opening a connection (FR-026)', async () => {
    const closed = state({ status: 'CLOSED', me: null });
    const { room, element } = await render({
      routes: { [`GET /api/sessions/${SESSION_ID}`]: () => reply(200, closed) },
    });

    expect(room.showReadOnly).toHaveBeenCalledWith(closed);
    expect(room.open).not.toHaveBeenCalled();
    expect(element.querySelector('app-join')).toBeNull();
    expect(element.querySelector('app-board')).not.toBeNull();
  });

  it('lets the facilitator come with the animation link join a closed session, to reopen it', async () => {
    const { room, element } = await render({
      animationToken: true,
      routes: {
        [`GET /api/sessions/${SESSION_ID}`]: () =>
          reply(200, state({ status: 'CLOSED', me: null })),
      },
    });

    expect(room.showReadOnly).not.toHaveBeenCalled();
    expect(element.querySelector('app-join')).not.toBeNull();
  });

  it('shows the join screen for a session that is not closed', async () => {
    const { room, element } = await render({
      routes: {
        [`GET /api/sessions/${SESSION_ID}`]: () =>
          reply(200, state({ status: 'IN_PROGRESS', me: null })),
      },
    });

    expect(room.showReadOnly).not.toHaveBeenCalled();
    expect(element.querySelector('app-join')).not.toBeNull();
  });

  it('shows « Session introuvable » for an unknown session, with a way home', async () => {
    const { element } = await render({
      routes: {
        [`GET /api/sessions/${SESSION_ID}`]: () =>
          reply(404, { title: 't', status: 404, detail: 'd' }),
      },
    });

    expect(element.querySelector('h1')?.textContent).toBe('Session introuvable');
    expect(element.querySelector('a')?.textContent).toContain('accueil');
  });

  it('tells the user when the service does not answer, and retries', async () => {
    let attempts = 0;
    const { fixture, element } = await render({
      routes: {
        [`GET /api/sessions/${SESSION_ID}`]: () =>
          ++attempts === 1 ? reply(500, {}) : reply(200, {}),
      },
    });
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'Le service ne répond pas',
    );

    element.querySelector<HTMLButtonElement>('button')!.click();
    await settle(fixture);

    expect(element.querySelector('app-join')).not.toBeNull();
  });

  it('goes back to the join screen when the token is no longer known (4401)', async () => {
    const { fixture, room, element } = await render({ token: true });

    room.end.set('unknownToken');
    await settle(fixture);

    expect(element.querySelector('app-join')).not.toBeNull();
  });

  it('shows « Session introuvable » when the session disappears (4404)', async () => {
    const { fixture, room, element } = await render({ token: true });

    room.end.set('notFound');
    await settle(fixture);

    expect(element.querySelector('h1')?.textContent).toBe('Session introuvable');
  });

  it('switches to the ranking screen from the board, and back (FR-015a)', async () => {
    const { fixture, room, element } = await render({ token: true });
    room.canAnimate.set(true);
    await settle(fixture);
    const button = (text: string) =>
      [...element.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
        b.textContent?.includes(text),
      )!;

    button('Prioriser par classement').click();
    await settle(fixture);
    expect(element.querySelector('app-board')).toBeNull();
    expect(element.querySelector('app-ranking-screen')).not.toBeNull();

    button('Annuler').click();
    await settle(fixture);
    expect(element.querySelector('app-ranking-screen')).toBeNull();
    expect(element.querySelector('app-board')).not.toBeNull();
  });

  it('reopens a session on the board, not on the ranking screen (FR-015a)', async () => {
    const { fixture, room, element } = await render({ token: true });
    room.canAnimate.set(true);
    await settle(fixture);
    [...element.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent?.includes('Prioriser par classement'))!
      .click();
    await settle(fixture);
    expect(element.querySelector('app-ranking-screen')).not.toBeNull();

    room.end.set('unknownToken');
    await settle(fixture);
    expect(element.querySelector('app-join')).not.toBeNull();
    // Le participant rejoint de nouveau : la session rouvre sur le tableau.
    (fixture.componentInstance as unknown as { open: () => void }).open();
    await settle(fixture);
    expect(element.querySelector('app-ranking-screen')).toBeNull();
    expect(element.querySelector('app-board')).not.toBeNull();
  });
});
