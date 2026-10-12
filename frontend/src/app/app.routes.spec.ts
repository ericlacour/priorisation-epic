import { Component } from '@angular/core';
import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { routes } from './app.routes';

@Component({ selector: 'app-host', imports: [RouterOutlet], template: '<router-outlet />' })
class Host {}

describe('routes', () => {
  async function visit(url: string): Promise<HTMLElement> {
    TestBed.configureTestingModule({ providers: [provideRouter(routes), provideLocationMocks()] });
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

  it('/s/:sessionId shows the session entry', async () => {
    expect((await visit('/s/k3Jx9QvT2mLpZ8wR4nYb7A')).querySelector('h1')?.textContent).toBe(
      'Session',
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
