import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { SESSION_ID, WSJF } from '../testing/fixtures';
import { fakeFetch, memoryStorage, pageProviders, reply, settle } from '../testing/helpers';
import { HomeComponent } from './home.component';

const METHODS = () => reply(200, [JSON.parse(JSON.stringify(WSJF))]);
const CREATED = () =>
  reply(201, { sessionId: SESSION_ID, participantToken: 'ptoken', animationToken: 'atoken' });

describe('HomeComponent', () => {
  async function render(routes: Parameters<typeof fakeFetch>[0] = {}) {
    const http = fakeFetch({ 'GET /api/methods': METHODS, ...routes });
    const storage = memoryStorage();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), ...pageProviders(http.fn, storage.provider)],
    });
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    await settle(fixture);
    const element = fixture.nativeElement as HTMLElement;
    return { fixture, element, http, storage };
  }

  const type = (element: HTMLElement, selector: string, value: string) => {
    const input = element.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  };

  const submit = async (fixture: Awaited<ReturnType<typeof render>>['fixture']) => {
    (fixture.nativeElement as HTMLElement)
      .querySelector('form')!
      .dispatchEvent(new Event('submit'));
    await settle(fixture);
  };

  it('shows the application name, the temporary-version notice and the creation form', async () => {
    const { element } = await render();
    expect(element.querySelector('h1')?.textContent).toBe('Priorisation Fonctionnalités');
    expect(element.querySelector('[role="note"]')?.textContent).toContain(
      'ne saisissez pas de données confidentielles',
    );
    expect(element.querySelector('h2')?.textContent).toBe('Créer une session');
  });

  it('offers the methods of GET /api/methods with their formula, WSJF being the default', async () => {
    const { element } = await render();
    const option = element.querySelector<HTMLOptionElement>('#create-method option')!;
    expect(option.textContent).toContain('WSJF');
    expect(option.textContent).toContain('CoD = BV + TC + RR/OE ; WSJF = CoD / JS');
    expect(option.selected).toBe(true);
    expect(element.querySelector('#create-method-help')?.textContent).toContain(
      'ne pourra plus être changée',
    );
  });

  it('opens the read-only method panel from « Voir le détail de la méthode »', async () => {
    const { fixture, element } = await render();
    element.querySelector<HTMLButtonElement>('.help .link-button')!.click();
    fixture.detectChanges();
    expect(element.querySelector('app-method-panel')?.textContent).toContain('Business Value');
  });

  it('creates the session with the chosen method, stores the tokens and shows both links', async () => {
    const { fixture, element, http, storage } = await render({ 'POST /api/sessions': CREATED });
    type(element, '#create-name', ' Atelier Q4 ');
    type(element, '#create-pseudo', ' Éric ');

    await submit(fixture);

    const post = http.calls.find((c) => c.key === 'POST /api/sessions')!;
    expect(JSON.parse(String(post.init?.body))).toEqual({
      name: 'Atelier Q4',
      pseudo: 'Éric',
      method: 'WSJF',
    });
    expect(storage.data.get(`pe.token.${SESSION_ID}`)).toBe('ptoken');
    expect(storage.data.get(`pe.animation.${SESSION_ID}`)).toBe('atoken');
    expect(storage.data.get('pe.pseudo')).toBe('Éric');
    const links = [...element.querySelectorAll('code')].map((c) => c.textContent);
    expect(links[0]).toContain(`/s/${SESSION_ID}`);
    expect(links[0]).not.toContain('/animer');
    expect(links[1]).toContain(`/s/${SESSION_ID}/animer#atoken`);
    expect(element.querySelector('.secret')?.textContent).toContain('À garder pour vous.');
  });

  it('goes to the session from « Aller à la session »', async () => {
    const { fixture, element } = await render({ 'POST /api/sessions': CREATED });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    type(element, '#create-name', 'A');
    type(element, '#create-pseudo', 'Éric');
    await submit(fixture);

    element.querySelector<HTMLButtonElement>('.actions .btn-primary')!.click();

    expect(navigate).toHaveBeenCalledWith(['/s', SESSION_ID]);
  });

  it('refuses an empty name or pseudo without calling the server', async () => {
    const { fixture, element, http } = await render();

    await submit(fixture);
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('nom de la session');
    type(element, '#create-name', 'A');
    await submit(fixture);
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('pseudo');
    type(element, '#create-name', 'x'.repeat(121));
    type(element, '#create-pseudo', 'Éric');
    await submit(fixture);
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('nom de la session');

    expect(http.calls.some((c) => c.key === 'POST /api/sessions')).toBe(false);
  });

  it('shows the French detail of a server refusal and keeps the form', async () => {
    const { fixture, element } = await render({
      'POST /api/sessions': () =>
        reply(400, { title: 'Requête invalide', status: 400, detail: 'Le pseudo est invalide.' }),
    });
    type(element, '#create-name', 'A');
    type(element, '#create-pseudo', 'Éric');

    await submit(fixture);

    expect(element.querySelector('[role="alert"]')?.textContent).toBe('Le pseudo est invalide.');
    expect(element.querySelector('form')).not.toBeNull();
  });

  it('refuses a name already taken under the name field, keeps the input and focuses it (FR-001a)', async () => {
    const { fixture, element, storage } = await render({
      'POST /api/sessions': () =>
        reply(409, {
          title: 'Nom de session déjà pris',
          status: 409,
          detail: 'Une session porte déjà ce nom. Choisissez-en un autre.',
        }),
    });
    type(element, '#create-name', 'PI26T7_TEST');
    type(element, '#create-pseudo', 'Éric');

    await submit(fixture);

    const name = element.querySelector<HTMLInputElement>('#create-name')!;
    expect(element.querySelector('#create-name-error')?.textContent).toBe(
      'Une session porte déjà ce nom. Choisissez-en un autre.',
    );
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(name.getAttribute('aria-describedby')).toBe('create-name-error');
    expect(name.value).toBe('PI26T7_TEST');
    expect(document.activeElement).toBe(name);
    expect(element.querySelector('h1')?.textContent).not.toBe('Session créée');
    expect(storage.data.size).toBe(0);

    type(element, '#create-name', 'PI26T7_TEST bis');
    fixture.detectChanges();
    expect(element.querySelector('#create-name-error')).toBeNull();
    expect(name.getAttribute('aria-invalid')).toBeNull();
  });

  it('shows a network message when the service does not answer', async () => {
    const { fixture, element } = await render({
      'POST /api/sessions': () => reply(500, {}),
    });
    type(element, '#create-name', 'A');
    type(element, '#create-pseudo', 'Éric');

    await submit(fixture);

    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'Le service ne répond pas',
    );
  });

  it('lets the user retry when the methods cannot be loaded', async () => {
    let attempts = 0;
    const { fixture, element } = await render({
      'GET /api/methods': () => (++attempts === 1 ? reply(500, {}) : METHODS()),
    });
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('indisponibles');
    expect(element.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(true);

    element.querySelector<HTMLButtonElement>('.field .btn')!.click();
    await settle(fixture);

    expect(element.querySelector('#create-method option')).not.toBeNull();
  });

  it('prefills the last pseudo', async () => {
    const http = fakeFetch({ 'GET /api/methods': METHODS });
    const storage = memoryStorage();
    storage.data.set('pe.pseudo', 'Éric');
    TestBed.configureTestingModule({
      providers: [provideRouter([]), ...pageProviders(http.fn, storage.provider)],
    });
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    await settle(fixture);
    expect(
      (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('#create-pseudo')!
        .value,
    ).toBe('Éric');
  });
});
