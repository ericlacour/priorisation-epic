import { ComponentFixture, TestBed } from '@angular/core/testing';
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

const MORE = [
  ...SESSIONS,
  {
    sessionId: 'Pa2bC3dE4fG5hJ6kL7mN8p',
    name: 'Roadmap paiement',
    facilitatorPseudo: 'Camille',
    createdAt: '2026-09-20T12:00:00Z',
    status: 'PREPARATION',
    method: 'WSJF',
    methodVersion: 2,
  },
  {
    sessionId: 'Zz9yX8wV7uT6sR5qP4oN3m',
    name: 'PI 26 – Épics socle',
    facilitatorPseudo: 'Camille',
    createdAt: '2026-07-02T12:00:00Z',
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

  describe('filters (FR-026b)', () => {
    const names = (element: HTMLElement) =>
      [...element.querySelectorAll('tbody td.title')].map((td) => td.textContent?.trim());

    const type = (fixture: ComponentFixture<SessionListComponent>, id: string, value: string) => {
      const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(id)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      return input;
    };

    const statusBox = (element: HTMLElement, label: string) =>
      [...element.querySelectorAll<HTMLLabelElement>('.status-filter label')]
        .find((l) => l.textContent?.trim() === label)!
        .querySelector('input')!;

    const toggle = (fixture: ComponentFixture<SessionListComponent>, label: string) => {
      statusBox(fixture.nativeElement as HTMLElement, label).click();
      fixture.detectChanges();
    };

    it('shows the count and every session, all statuses checked', async () => {
      const { element } = await render({ 'GET /api/sessions': () => reply(200, MORE) });

      expect(element.querySelector('[role="status"]')?.textContent?.trim()).toBe(
        '4 sessions sur 4',
      );
      expect(names(element)).toHaveLength(4);
      for (const label of ['En préparation', 'En cours', 'Clôturée']) {
        expect(statusBox(element, label).checked).toBe(true);
      }
    });

    it('filters by name at each keystroke, ignoring case and accents, and highlights the match', async () => {
      const { fixture, element } = await render({ 'GET /api/sessions': () => reply(200, MORE) });

      type(fixture, '#filter-name', 'ép');
      expect(names(element)).toEqual(['PI 28 – Epics', 'PI 26 – Épics socle']);
      type(fixture, '#filter-name', 'epic');
      expect(names(element)).toEqual(['PI 28 – Epics', 'PI 26 – Épics socle']);
      expect([...element.querySelectorAll('tbody mark')].map((m) => m.textContent)).toEqual([
        'Epic',
        'Épic',
      ]);
      expect(element.querySelector('[role="status"]')?.textContent?.trim()).toBe(
        '2 sessions sur 4',
      );
    });

    it('suggests the existing facilitators and filters on an existing one only', async () => {
      const { fixture, element } = await render({ 'GET /api/sessions': () => reply(200, MORE) });
      const options = [...element.querySelectorAll('#filter-facilitator-list option')];
      expect(options.map((o) => o.getAttribute('value'))).toEqual(['Camille', 'Éric']);

      type(fixture, '#filter-facilitator', 'Cam');
      expect(names(element)).toHaveLength(4);
      type(fixture, '#filter-facilitator', 'eric');
      expect(names(element)).toEqual(['PI 27 – Bilan']);
      expect(element.querySelector('#filter-facilitator-error')).toBeNull();
    });

    it('refuses an unknown facilitator when the field is left, without filtering', async () => {
      const { fixture, element } = await render({ 'GET /api/sessions': () => reply(200, MORE) });

      const input = type(fixture, '#filter-facilitator', 'Marc');
      expect(element.querySelector('#filter-facilitator-error')).toBeNull();
      input.dispatchEvent(new Event('change'));
      fixture.detectChanges();

      expect(element.querySelector('#filter-facilitator-error')?.textContent?.trim()).toBe(
        "Aucune session n'est animée par « Marc ». Choisissez un animateur dans la liste proposée.",
      );
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(input.getAttribute('aria-describedby')).toBe('filter-facilitator-error');
      expect(names(element)).toHaveLength(4);

      type(fixture, '#filter-facilitator', 'Marc');
      expect(element.querySelector('#filter-facilitator-error')).toBeNull();
    });

    it('shows only the checked statuses, and none when no status is checked', async () => {
      const { fixture, element } = await render({ 'GET /api/sessions': () => reply(200, MORE) });

      toggle(fixture, 'Clôturée');
      expect(names(element)).toEqual(['PI 28 – Epics', 'Roadmap paiement']);
      toggle(fixture, 'En cours');
      toggle(fixture, 'En préparation');
      expect(element.querySelector('table')).toBeNull();
      expect(element.textContent).toContain('Aucune session ne correspond aux filtres.');
      expect(element.querySelector('[role="status"]')?.textContent?.trim()).toBe('0 session sur 4');
    });

    it('combines the three filters, and « Effacer les filtres » resets them all', async () => {
      const { fixture, element } = await render({ 'GET /api/sessions': () => reply(200, MORE) });

      type(fixture, '#filter-name', 'pi');
      type(fixture, '#filter-facilitator', 'camille');
      expect(names(element)).toEqual(['PI 28 – Epics', 'PI 26 – Épics socle']);
      toggle(fixture, 'En cours');
      expect(names(element)).toEqual(['PI 26 – Épics socle']);
      type(fixture, '#filter-name', 'bilan');
      expect(names(element)).toEqual([]);

      [...element.querySelectorAll<HTMLButtonElement>('button')]
        .find((b) => b.textContent?.trim() === 'Effacer les filtres')!
        .click();
      fixture.detectChanges();

      expect(names(element)).toHaveLength(4);
      expect(element.querySelector<HTMLInputElement>('#filter-name')!.value).toBe('');
      expect(element.querySelector<HTMLInputElement>('#filter-facilitator')!.value).toBe('');
      expect(statusBox(element, 'En cours').checked).toBe(true);
    });
  });
});
