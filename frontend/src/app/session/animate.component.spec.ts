import { Location } from '@angular/common';
import { SpyLocation, provideLocationMocks } from '@angular/common/testing';
import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, provideRouter, withComponentInputBinding } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';

import { BrowserStorage, LOCAL_STORAGE } from '../storage/browser-storage';
import { SESSION_ID } from '../testing/fixtures';
import { AnimateComponent } from './animate.component';

@Component({ selector: 'app-host', imports: [RouterOutlet], template: '<router-outlet />' })
class Host {}

@Component({ selector: 'app-session-stub', template: '<p>session</p>' })
class SessionStub {}

describe('AnimateComponent', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    const backing = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    } as Storage;
    TestBed.configureTestingModule({
      providers: [
        BrowserStorage,
        { provide: LOCAL_STORAGE, useValue: () => backing },
        provideRouter(
          [
            { path: 's/:sessionId/animer', component: AnimateComponent },
            { path: 's/:sessionId', component: SessionStub },
          ],
          withComponentInputBinding(),
        ),
        provideLocationMocks(),
      ],
    });
  });

  async function visit(url: string) {
    const fixture = TestBed.createComponent(Host);
    const router = TestBed.inject(Router);
    await router.navigateByUrl(url);
    fixture.detectChanges();
    await fixture.whenStable();
    return {
      router,
      location: TestBed.inject(Location),
      root: fixture.nativeElement as HTMLElement,
    };
  }

  it('keeps the token from the fragment in this browser', async () => {
    await visit(`/s/${SESSION_ID}/animer#secret-token`);
    expect(store.get(`pe.animation.${SESSION_ID}`)).toBe('secret-token');
  });

  it('opens the session and leaves no token in the address', async () => {
    const { router, location, root } = await visit(`/s/${SESSION_ID}/animer#secret-token`);
    expect(router.url).toBe(`/s/${SESSION_ID}`);
    expect(location.path(true)).toBe(`/s/${SESSION_ID}`);
    expect(location.path(true)).not.toContain('secret-token');
    expect(root.textContent).toContain('session');
  });

  it('replaces the history entry instead of adding one, so Back never returns to the link with the token', async () => {
    await visit(`/s/${SESSION_ID}/animer#secret-token`);
    const changes = (TestBed.inject(Location) as SpyLocation).urlChanges;
    // La première entrée est celle que l'utilisateur a ouverte ; la seule suivante la remplace, sans jeton.
    expect(changes.slice(1)).toEqual([`replace: /s/${SESSION_ID}`]);
  });

  it('keeps the existing token when the link has no fragment, and still opens the session', async () => {
    store.set(`pe.animation.${SESSION_ID}`, 'already-there');
    const { router } = await visit(`/s/${SESSION_ID}/animer`);
    expect(store.get(`pe.animation.${SESSION_ID}`)).toBe('already-there');
    expect(router.url).toBe(`/s/${SESSION_ID}`);
  });

  it('keeps one token per session', async () => {
    await visit(`/s/${SESSION_ID}/animer#token-a`);
    expect(store.get(`pe.animation.${SESSION_ID}`)).toBe('token-a');
    expect([...store.keys()].filter((k) => k.startsWith('pe.animation.'))).toEqual([
      `pe.animation.${SESSION_ID}`,
    ]);
  });
});
