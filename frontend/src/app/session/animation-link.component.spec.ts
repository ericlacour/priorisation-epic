import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';

import { BrowserStorage, LOCAL_STORAGE } from '../storage/browser-storage';
import { SESSION_ID } from '../testing/fixtures';
import { AnimationLinkComponent, animationUrl } from './animation-link.component';

describe('animationUrl', () => {
  it('keeps the token after the # so it never reaches the server', () => {
    expect(animationUrl('https://app.example', SESSION_ID, 'tok')).toBe(
      `https://app.example/s/${SESSION_ID}/animer#tok`,
    );
  });
});

describe('AnimationLinkComponent', () => {
  let store: Map<string, string>;

  beforeEach(() => {
    store = new Map();
    const backing = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    } as Storage;
    TestBed.configureTestingModule({
      providers: [BrowserStorage, { provide: LOCAL_STORAGE, useValue: () => backing }],
    });
  });

  function mount() {
    const fixture = TestBed.createComponent(AnimationLinkComponent);
    fixture.componentRef.setInput('sessionId', SESSION_ID);
    fixture.detectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  const click = (fixture: { detectChanges(): void }, root: HTMLElement, selector = 'button') => {
    (root.querySelector(selector) as HTMLButtonElement).click();
    fixture.detectChanges();
  };

  it('shows nothing but the action at first', () => {
    const { root } = mount();
    expect(root.querySelector('button')?.textContent).toContain("Afficher mon lien d'animation");
    expect(root.querySelector('.secret')).toBeNull();
  });

  it('rebuilds the private link from the token kept in this browser, with a warning', () => {
    store.set(`pe.animation.${SESSION_ID}`, 'secret-token');
    const { fixture, root } = mount();
    click(fixture, root);
    expect(root.querySelector('.secret code')?.textContent).toBe(
      `${window.location.origin}/s/${SESSION_ID}/animer#secret-token`,
    );
    expect(root.textContent).toContain('À garder pour vous.');
    expect(root.querySelector('app-link-box button')).not.toBeNull();
  });

  it('says so when this browser has no animation token', () => {
    const { fixture, root } = mount();
    click(fixture, root);
    expect(root.querySelector('[role="status"]')?.textContent).toContain(
      "ne garde pas de lien d'animation",
    );
    expect(root.querySelector('code')).toBeNull();
  });

  it('hides the link again', () => {
    store.set(`pe.animation.${SESSION_ID}`, 'secret-token');
    const { fixture, root } = mount();
    click(fixture, root);
    click(fixture, root, '.secret > button');
    expect(root.querySelector('.secret')).toBeNull();
  });
});
