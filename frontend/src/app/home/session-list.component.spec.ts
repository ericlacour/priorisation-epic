import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { fakeFetch, memoryStorage, pageProviders, reply, settle } from '../testing/helpers';
import { SessionListComponent } from './session-list.component';

const SESSIONS = [
  {
    sessionId: 'Qm7tY2wR9pLk4XcV8bNz3D',
    name: 'PI 28 – Epics',
    facilitatorPseudo: 'Camille',
    createdAt: '2026-10-14T12:00:00Z',
    status: 'IN_PROGRESS',
    method: 'WSJF',
    methodVersion: 2,
  },
  {
    sessionId: 'Hn4cR8vT1kWq6ZsJ0dXe5F',
    name: 'PI 27 – Bilan',
    facilitatorPseudo: 'Éric',
    createdAt: '2026-09-30T12:00:00Z',
    status: 'CLOSED',
    method: 'WSJF',
    methodVersion: 2,
  },
];

describe('SessionListComponent', () => {
  async function render(routes: Parameters<typeof fakeFetch>[0]) {
    const http = fakeFetch(routes);
    TestBed.configureTestingModule({
      providers: [provideRouter([]), ...pageProviders(http.fn, memoryStorage().provider)],
    });
    const fixture = TestBed.createComponent(SessionListComponent);
    fixture.detectChanges();
    await settle(fixture);
    return { fixture, http, element: fixture.nativeElement as HTMLElement };
  }

  it('lists the sessions in the order received, with name, facilitator, date, method and status', async () => {
    const { element } = await render({ 'GET /api/sessions': () => reply(200, SESSIONS) });

    const headers = [...element.querySelectorAll('th')].map((th) => th.textContent?.trim());
    expect(headers).toEqual(['Nom', 'Animateur', 'Date', 'Méthode', 'Statut']);
    const rows = [...element.querySelectorAll('tbody tr')].map((tr) =>
      [...tr.querySelectorAll('td')].map((td) => td.textContent?.trim()),
    );
    expect(rows).toEqual([
      ['PI 28 – Epics', 'Camille', '14/10/2026', 'WSJF v2', 'En cours'],
      ['PI 27 – Bilan', 'Éric', '30/09/2026', 'WSJF v2', 'Clôturée'],
    ]);
    expect(element.querySelector('tbody tr:last-child .badge')?.className).toBe('badge closed');
  });

  it('opens a session by its name', async () => {
    const { element } = await render({ 'GET /api/sessions': () => reply(200, SESSIONS) });

    const link = element.querySelector<HTMLAnchorElement>('tbody a')!;
    expect(link.getAttribute('href')).toBe('/s/Qm7tY2wR9pLk4XcV8bNz3D');
    expect(link.getAttribute('aria-label')).toBe('Ouvrir la session PI 28 – Epics');
  });

  it('says when there is no session yet', async () => {
    const { element } = await render({ 'GET /api/sessions': () => reply(200, []) });
    expect(element.textContent).toContain('Aucune session pour l’instant.');
    expect(element.querySelector('table')).toBeNull();
  });

  it('reports an unavailable list and retries', async () => {
    let attempts = 0;
    const { fixture, element } = await render({
      'GET /api/sessions': () => (++attempts === 1 ? reply(500, {}) : reply(200, SESSIONS)),
    });
    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'La liste des sessions est indisponible.',
    );

    element.querySelector<HTMLButtonElement>('button')!.click();
    await settle(fixture);
    expect(element.querySelectorAll('tbody tr')).toHaveLength(2);
  });
});
