import { Component } from '@angular/core';
import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, provideRouter, withComponentInputBinding } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { FETCH } from './api/session-api';
import { APP_CONFIG } from './config/app-config';
import { routes } from './app.routes';

@Component({ selector: 'app-host', imports: [RouterOutlet], template: '<router-outlet />' })
class Host {}

describe('routes', () => {
  async function visit(url: string): Promise<HTMLElement> {
    // Même configuration que `app.config.ts` : les paramètres de l'URL alimentent les entrées des composants.
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes, withComponentInputBinding()),
        provideLocationMocks(),
        { provide: APP_CONFIG, useValue: { apiBaseUrl: 'https://api.example' } },
        // Aucun appel réseau réel : l'écran « Rejoindre » vérifie la session au chargement.
        { provide: FETCH, useValue: async () => new Response('{}', { status: 200 }) },
      ],
    });
    const fixture = TestBed.createComponent(Host);
    await TestBed.inject(Router).navigateByUrl(url);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('/ shows the home page', async () => {
    expect((await visit('/')).querySelector('h1')?.textContent).toBe(
      'Priorisation Fonctionnalités',
    );
  });

  it('/s/:sessionId asks a newcomer to join', async () => {
    // Aucun jeton de participant n'est rangé dans ce navigateur : écran « Rejoindre ».
    expect((await visit('/s/k3Jx9QvT2mLpZ8wR4nYb7A')).querySelector('h1')?.textContent).toBe(
      'Rejoindre la session',
    );
  });

  it('/s/:sessionId/animer shows the animation page', async () => {
    expect((await visit('/s/k3Jx9QvT2mLpZ8wR4nYb7A/animer')).querySelector('h1')?.textContent).toBe(
      'Animation de la session',
    );
  });

  it('redirects an unknown path to the home page', async () => {
    expect((await visit('/nimporte/quoi')).querySelector('h1')?.textContent).toBe(
      'Priorisation Fonctionnalités',
    );
  });
});
