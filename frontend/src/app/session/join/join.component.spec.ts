import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SessionApi, SessionApiError, SessionApiErrorKind } from '../../api/session-api';
import { BrowserStorage, LOCAL_STORAGE } from '../../storage/browser-storage';
import { SESSION_ID, sessionState } from '../../testing/fixtures';
import { JoinComponent } from './join.component';

describe('JoinComponent', () => {
  let store: Map<string, string>;
  const api = {
    getSession: vi.fn(),
    joinSession: vi.fn(),
  };

  beforeEach(() => {
    store = new Map();
    api.getSession.mockReset().mockResolvedValue(sessionState({ name: 'PI 27 – Epics' }));
    api.joinSession.mockReset().mockResolvedValue({ participantToken: 'tok-1' });
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
      ],
    });
  });

  async function mount(takingOver = false) {
    const fixture = TestBed.createComponent(JoinComponent);
    fixture.componentRef.setInput('sessionId', SESSION_ID);
    fixture.componentRef.setInput('takingOver', takingOver);
    const events = { joined: 0, notFound: 0 };
    fixture.componentInstance.joined.subscribe(() => events.joined++);
    fixture.componentInstance.notFound.subscribe(() => events.notFound++);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      root,
      events,
      pseudo: root.querySelector('#join-pseudo') as HTMLInputElement,
      role: root.querySelector('#join-role') as HTMLSelectElement,
      error: () => root.querySelector('.err')?.textContent?.trim(),
      async type(value: string) {
        this.pseudo.value = value;
        this.pseudo.dispatchEvent(new Event('input'));
      },
      async choose(value: string) {
        this.role.value = value;
        this.role.dispatchEvent(new Event('change'));
      },
      async submit() {
        root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
        await fixture.whenStable();
        fixture.detectChanges();
      },
    };
  }

  it('asks for a pseudo and an optional role, with the session name', async () => {
    const ui = await mount();
    expect(ui.root.querySelector('h1')?.textContent).toBe('Rejoindre la session');
    expect(ui.root.querySelector('.lead')?.textContent).toBe('PI 27 – Epics');
    expect(Array.from(ui.role.options).map((o) => o.textContent?.trim())).toEqual([
      '—',
      'Product Owner',
      'Product Management',
      'Architecte',
      'Expert métier',
      'Lead PM',
      'Tech Lead',
    ]);
    expect(ui.root.textContent).toContain('Pas de compte ni de mot de passe');
    expect(api.getSession).toHaveBeenCalledWith(SESSION_ID);
  });

  it('prefills the last pseudo used in this browser', async () => {
    store.set('pe.pseudo', 'alice');
    expect((await mount()).pseudo.value).toBe('alice');
  });

  it('tells someone who opened the animation link that they take the animation back', async () => {
    expect((await mount(true)).root.querySelector('.notice')?.textContent).toContain(
      "Vous allez reprendre l'animation",
    );
    expect((await mount(false)).root.querySelector('.notice')).toBeNull();
  });

  it('refuses an empty pseudo without calling the server', async () => {
    const ui = await mount();
    await ui.type('   ');
    await ui.submit();
    expect(ui.error()).toBe('Saisissez un pseudo (40 caractères au plus).');
    expect(ui.pseudo.getAttribute('aria-invalid')).toBe('true');
    expect(api.joinSession).not.toHaveBeenCalled();
  });

  it('joins with the trimmed pseudo, keeps the token and the pseudo, and says it joined', async () => {
    const ui = await mount();
    await ui.type('  alice ');
    await ui.choose('Tech Lead');
    await ui.submit();
    expect(api.joinSession).toHaveBeenCalledWith(SESSION_ID, {
      pseudo: 'alice',
      businessRole: 'Tech Lead',
    });
    expect(store.get(`pe.token.${SESSION_ID}`)).toBe('tok-1');
    expect(store.get('pe.pseudo')).toBe('alice');
    expect(ui.events.joined).toBe(1);
  });

  it('sends no role when none is chosen', async () => {
    const ui = await mount();
    await ui.type('alice');
    await ui.submit();
    expect(api.joinSession).toHaveBeenCalledWith(SESSION_ID, { pseudo: 'alice' });
  });

  it('disables the button while joining', async () => {
    let release!: (value: unknown) => void;
    api.joinSession.mockReturnValueOnce(new Promise((resolve) => (release = resolve)));
    const ui = await mount();
    await ui.type('alice');
    ui.root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    ui.fixture.detectChanges();
    const button = ui.root.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.textContent?.trim()).toBe('Connexion…');
    release({ participantToken: 'tok' });
    await ui.fixture.whenStable();
    ui.fixture.detectChanges();
    expect(button.disabled).toBe(false);
  });

  it.each<[SessionApiErrorKind, string | null, string]>([
    ['pseudoTaken', null, 'Ce pseudo est déjà utilisé dans la session.'],
    ['invalid', 'Pseudo trop long.', 'Pseudo trop long.'],
    ['invalid', null, 'Saisissez un pseudo (40 caractères au plus).'],
    ['network', null, 'Le service ne répond pas.'],
    ['tooManyRequests', null, 'Le service ne répond pas.'],
  ])('shows the error for %s', async (kind, detail, expected) => {
    api.joinSession.mockRejectedValueOnce(new SessionApiError(kind, detail));
    const ui = await mount();
    await ui.type('alice');
    await ui.submit();
    expect(ui.error()).toContain(expected);
    expect(ui.events.joined).toBe(0);
    expect(store.has(`pe.token.${SESSION_ID}`)).toBe(false);
  });

  it('treats any unexpected failure as the service not answering', async () => {
    api.joinSession.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const ui = await mount();
    await ui.type('alice');
    await ui.submit();
    expect(ui.error()).toContain('Le service ne répond pas.');
  });

  it('says the session does not exist when joining returns 404', async () => {
    api.joinSession.mockRejectedValueOnce(new SessionApiError('notFound'));
    const ui = await mount();
    await ui.type('alice');
    await ui.submit();
    expect(ui.events.notFound).toBe(1);
    expect(ui.error()).toBe('Session introuvable');
  });

  it('says the session does not exist when it cannot be found on opening', async () => {
    api.getSession.mockRejectedValueOnce(new SessionApiError('notFound'));
    const ui = await mount();
    expect(ui.events.notFound).toBe(1);
  });

  it('stays usable, without the name, when the session cannot be checked', async () => {
    api.getSession.mockRejectedValueOnce(new SessionApiError('network'));
    const ui = await mount();
    expect(ui.events.notFound).toBe(0);
    expect(ui.root.querySelector('.lead')).toBeNull();
    expect(ui.pseudo).not.toBeNull();
  });
});
