import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionApi, SessionApiError } from '../api/session-api';
import { BrowserStorage, LOCAL_STORAGE } from '../storage/browser-storage';
import { REACH_EFFORT, SESSION_ID, WSJF } from '../testing/fixtures';
import { HomeComponent } from './home.component';

describe('HomeComponent', () => {
  let store: Map<string, string>;
  const api = { listMethods: vi.fn(), createSession: vi.fn() };
  const router = { navigate: vi.fn() };

  beforeEach(() => {
    store = new Map();
    api.listMethods.mockReset().mockResolvedValue([WSJF]);
    api.createSession.mockReset().mockResolvedValue({
      sessionId: SESSION_ID,
      participantToken: 'p-tok',
      animationToken: 'a-tok',
    });
    router.navigate.mockReset().mockResolvedValue(true);
    const backing = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    } as Storage;
    TestBed.configureTestingModule({
      providers: [
        BrowserStorage,
        { provide: LOCAL_STORAGE, useValue: () => backing },
        { provide: SessionApi, useValue: api },
        { provide: Router, useValue: router },
      ],
    });
  });

  async function mount() {
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const ui = {
      fixture,
      root,
      field: (id: string) => root.querySelector(id) as HTMLInputElement,
      type(id: string, value: string) {
        const input = root.querySelector(id) as HTMLInputElement;
        input.value = value;
        input.dispatchEvent(new Event('input'));
      },
      async submit() {
        root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
        await fixture.whenStable();
        fixture.detectChanges();
      },
      alerts: () =>
        Array.from(root.querySelectorAll('[role="alert"]')).map((e) => e.textContent?.trim()),
    };
    return ui;
  }

  it('shows the application name, the notice and the creation form', async () => {
    const ui = await mount();
    expect(ui.root.querySelector('h1')?.textContent).toBe('Priorisation Fonctionnalités');
    expect(ui.root.querySelector('.notice')?.textContent).toContain('Version temporaire');
    expect(ui.root.querySelector('h2')?.textContent).toBe('Créer une session');
  });

  it('offers the methods of the server with the formula and the first one preselected', async () => {
    api.listMethods.mockResolvedValue([REACH_EFFORT, WSJF]);
    const ui = await mount();
    const select = ui.field('#home-method') as unknown as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.textContent?.trim());
    expect(options).toEqual([
      'Portée sur effort (version 1) : Ratio = Portée / Effort',
      `WSJF (version 1) : ${WSJF.formula}`,
    ]);
    expect(select.value).toBe('REACH_EFFORT');
  });

  it('opens the method panel from the detail link, for the chosen method', async () => {
    const ui = await mount();
    (ui.root.querySelector('.link-button') as HTMLButtonElement).click();
    ui.fixture.detectChanges();
    expect(ui.root.querySelector('app-method-panel')).not.toBeNull();
    expect(ui.root.querySelector('#method-panel-title')?.textContent).toContain('WSJF');
  });

  it('falls back to the default method when the list cannot be loaded', async () => {
    api.listMethods.mockRejectedValue(new SessionApiError('network'));
    const ui = await mount();
    expect(ui.root.querySelector('#home-method-help')?.textContent).toContain(
      'la méthode par défaut sera utilisée',
    );
    ui.type('#home-name', 'PI 27');
    ui.type('#home-pseudo', 'eric');
    await ui.submit();
    expect(api.createSession).toHaveBeenCalledWith({ name: 'PI 27', pseudo: 'eric' });
  });

  it('refuses an empty or too long name and pseudo without calling the server', async () => {
    const ui = await mount();
    await ui.submit();
    expect(ui.alerts()).toEqual([
      'Saisissez un nom de session (120 caractères au plus).',
      'Saisissez un pseudo (40 caractères au plus).',
    ]);
    ui.type('#home-name', 'x'.repeat(121));
    ui.type('#home-pseudo', 'y'.repeat(41));
    await ui.submit();
    expect(ui.field('#home-name').getAttribute('aria-invalid')).toBe('true');
    expect(api.createSession).not.toHaveBeenCalled();
  });

  it('creates the session with the chosen method and keeps both tokens and the pseudo', async () => {
    const ui = await mount();
    ui.type('#home-name', '  PI 27 – Epics  ');
    ui.type('#home-pseudo', ' eric ');
    await ui.submit();

    expect(api.createSession).toHaveBeenCalledWith({
      name: 'PI 27 – Epics',
      pseudo: 'eric',
      method: 'WSJF',
    });
    expect(store.get(`pe.token.${SESSION_ID}`)).toBe('p-tok');
    expect(store.get(`pe.animation.${SESSION_ID}`)).toBe('a-tok');
    expect(store.get('pe.pseudo')).toBe('eric');
  });

  it('then shows the invitation link and the private animation link, and goes to the session', async () => {
    const ui = await mount();
    ui.type('#home-name', 'PI 27');
    ui.type('#home-pseudo', 'eric');
    await ui.submit();

    expect(ui.root.querySelector('.notice.success')?.textContent).toContain(
      'Votre session est prête',
    );
    const links = Array.from(ui.root.querySelectorAll('app-link-box code')).map(
      (c) => c.textContent,
    );
    expect(links[0]).toBe(`${location.origin}/s/${SESSION_ID}`);
    expect(links[1]).toBe(`${location.origin}/s/${SESSION_ID}/animer#a-tok`);
    expect(ui.root.querySelector('.secret')?.textContent).toContain('À garder pour vous.');
    expect(ui.root.querySelector('form')).toBeNull();

    (ui.root.querySelector('.actions .btn-primary') as HTMLButtonElement).click();
    expect(router.navigate).toHaveBeenCalledWith(['/s', SESSION_ID]);
  });

  it('prefills the last pseudo used in this browser', async () => {
    store.set('pe.pseudo', 'eric');
    const ui = await mount();
    expect(ui.field('#home-pseudo').value).toBe('eric');
  });

  it.each([
    [new SessionApiError('tooManyRequests'), 'Trop de sessions ont été créées'],
    [
      new SessionApiError('invalid', 'Cette méthode de priorisation n’existe pas.'),
      'Cette méthode',
    ],
    [new SessionApiError('network'), 'Le service ne répond pas'],
  ])('shows a readable error and stays on the form (%#)', async (error, text) => {
    api.createSession.mockRejectedValue(error);
    const ui = await mount();
    ui.type('#home-name', 'PI 27');
    ui.type('#home-pseudo', 'eric');
    await ui.submit();
    expect(ui.alerts().join(' ')).toContain(text);
    expect(ui.root.querySelector('form')).not.toBeNull();
    expect(store.size).toBe(0);
  });

  it('does not send twice while a creation is in progress', async () => {
    let release!: (value: unknown) => void;
    api.createSession.mockReturnValue(new Promise((resolve) => (release = resolve)));
    const ui = await mount();
    ui.type('#home-name', 'PI 27');
    ui.type('#home-pseudo', 'eric');
    const first = ui.submit();
    await ui.submit();
    expect(api.createSession).toHaveBeenCalledTimes(1);
    release({ sessionId: SESSION_ID, participantToken: 'p', animationToken: 'a' });
    await first;
  });
});
