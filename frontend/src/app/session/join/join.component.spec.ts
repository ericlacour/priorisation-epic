import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { SESSION_ID } from '../../testing/fixtures';
import { fakeFetch, memoryStorage, pageProviders, reply, settle } from '../../testing/helpers';
import { JoinComponent } from './join.component';

const JOIN = `POST /api/sessions/${SESSION_ID}/participants`;

describe('JoinComponent', () => {
  async function render(routes: Parameters<typeof fakeFetch>[0], pseudo?: string) {
    const http = fakeFetch(routes);
    const storage = memoryStorage();
    if (pseudo) storage.data.set('pe.pseudo', pseudo);
    TestBed.configureTestingModule({ providers: pageProviders(http.fn, storage.provider) });
    const fixture = TestBed.createComponent(JoinComponent);
    fixture.componentRef.setInput('sessionId', SESSION_ID);
    const joined: number[] = [];
    const notFound: number[] = [];
    fixture.componentInstance.joined.subscribe(() => joined.push(1));
    fixture.componentInstance.notFound.subscribe(() => notFound.push(1));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return { fixture, element, http, storage, joined, notFound };
  }

  const submit = async (r: Awaited<ReturnType<typeof render>>, pseudo: string, role = '') => {
    const input = r.element.querySelector<HTMLInputElement>('#join-pseudo')!;
    input.value = pseudo;
    input.dispatchEvent(new Event('input'));
    if (role) {
      const select = r.element.querySelector<HTMLSelectElement>('#join-role')!;
      select.value = role;
      select.dispatchEvent(new Event('change'));
    }
    r.element.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle(r.fixture);
  };

  it('asks for a pseudo and an optional business role', async () => {
    const { element } = await render({});
    expect(element.querySelector('h1')?.textContent).toBe('Rejoindre la session');
    expect(element.querySelectorAll('#join-role option')).toHaveLength(7);
    expect(element.textContent).toContain('Pas de compte ni de mot de passe');
  });

  it('prefills the last pseudo', async () => {
    const { element } = await render({}, 'Camille');
    expect(element.querySelector<HTMLInputElement>('#join-pseudo')!.value).toBe('Camille');
  });

  it('joins, stores the participant token and the pseudo, and tells the page', async () => {
    const r = await render({ [JOIN]: () => reply(201, { participantToken: 'tok' }) });

    await submit(r, '  Camille ', 'Product Owner');

    expect(JSON.parse(String(r.http.calls[0].init?.body))).toEqual({
      pseudo: 'Camille',
      businessRole: 'Product Owner',
    });
    expect(r.storage.data.get(`pe.token.${SESSION_ID}`)).toBe('tok');
    expect(r.storage.data.get('pe.pseudo')).toBe('Camille');
    expect(r.joined).toHaveLength(1);
  });

  it('sends no business role when none is chosen', async () => {
    const r = await render({ [JOIN]: () => reply(201, { participantToken: 'tok' }) });
    await submit(r, 'Camille');
    expect(JSON.parse(String(r.http.calls[0].init?.body))).toEqual({ pseudo: 'Camille' });
  });

  it('explains how to continue when the pseudo is already used', async () => {
    const r = await render({
      [JOIN]: () => reply(409, { title: 'Pseudo déjà utilisé', status: 409, detail: 'x' }),
    });

    await submit(r, 'alice');

    expect(r.element.querySelector('[role="alert"]')?.textContent).toContain(
      "libéré après 10 minutes d'absence",
    );
    expect(r.joined).toHaveLength(0);
    expect(r.storage.data.has(`pe.token.${SESSION_ID}`)).toBe(false);
  });

  it('refuses a blank pseudo without calling the server', async () => {
    const r = await render({});
    await submit(r, '   ');
    expect(r.element.querySelector('[role="alert"]')?.textContent).toContain(
      'Saisissez votre pseudo',
    );
    expect(r.http.calls).toHaveLength(0);
  });

  it('tells the page when the session does not exist', async () => {
    const r = await render({
      [JOIN]: () => reply(404, { title: 'Session introuvable', status: 404, detail: 'x' }),
    });
    await submit(r, 'Camille');
    expect(r.notFound).toHaveLength(1);
  });

  it('shows the server message on other refusals and a network message otherwise', async () => {
    const invalid = await render({
      [JOIN]: () => reply(400, { title: 't', status: 400, detail: 'Le pseudo est invalide.' }),
    });
    await submit(invalid, 'Camille');
    expect(invalid.element.querySelector('[role="alert"]')?.textContent).toBe(
      'Le pseudo est invalide.',
    );
    TestBed.resetTestingModule();

    const down = await render({ [JOIN]: () => reply(500, {}) });
    await submit(down, 'Camille');
    expect(down.element.querySelector('[role="alert"]')?.textContent).toContain(
      'Le service ne répond pas',
    );
  });
});
