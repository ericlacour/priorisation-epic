import { provideLocationMocks } from '@angular/common/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, provideRouter, withComponentInputBinding } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { routes } from './app.routes';
import { SESSION_ID, WSJF, state } from './testing/fixtures';
import { fakeFetch, memoryStorage, pageProviders, reply, settle } from './testing/helpers';

@Component({ selector: 'app-host', imports: [RouterOutlet], template: '<router-outlet />' })
class Host {}

describe('routes', () => {
  async function visit(url: string) {
    const http = fakeFetch({
      'GET /api/methods': () => reply(200, [JSON.parse(JSON.stringify(WSJF))]),
      [`GET /api/sessions/${SESSION_ID}`]: () => reply(200, state({ me: null })),
    });
    const storage = memoryStorage();
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes, withComponentInputBinding()),
        provideLocationMocks(),
        ...pageProviders(http.fn, storage.provider),
      ],
    });
    const fixture = TestBed.createComponent(Host);
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    fixture.detectChanges();
    await settle(fixture);
    return { element: fixture.nativeElement as HTMLElement, router, storage };
  }

  it('/ shows the home page', async () => {
    expect((await visit('/')).element.querySelector('h1')?.textContent).toBe(
      'Priorisation Fonctionnalités',
    );
  });

  it('/s/:sessionId without a token shows the join screen', async () => {
    const { element } = await visit(`/s/${SESSION_ID}`);
    expect(element.querySelector('h1')?.textContent).toBe('Rejoindre la session');
  });

  it('/s/:sessionId/animer stores the animation token then opens the session without the fragment', async () => {
    const { router, storage } = await visit(`/s/${SESSION_ID}/animer#le-jeton`);

    expect(storage.data.get(`pe.animation.${SESSION_ID}`)).toBe('le-jeton');
    expect(router.url).toBe(`/s/${SESSION_ID}`);
  });

  it('redirects an unknown path to the home page', async () => {
    expect((await visit('/nimporte/quoi')).element.querySelector('h1')?.textContent).toBe(
      'Priorisation Fonctionnalités',
    );
  });
});
