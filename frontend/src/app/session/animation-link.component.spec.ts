import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { SESSION_ID } from '../testing/fixtures';
import { memoryStorage } from '../testing/helpers';
import { CLIPBOARD } from '../shared/clipboard';
import { AnimationLinkComponent } from './animation-link.component';

describe('AnimationLinkComponent', () => {
  function render(token: string | null, clipboard = vi.fn(async () => undefined)) {
    const storage = memoryStorage();
    if (token) storage.data.set(`pe.animation.${SESSION_ID}`, token);
    TestBed.configureTestingModule({
      providers: [storage.provider, { provide: CLIPBOARD, useValue: clipboard }],
    });
    const fixture = TestBed.createComponent(AnimationLinkComponent);
    fixture.componentRef.setInput('sessionId', SESSION_ID);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return { fixture, element, clipboard };
  }

  it('offers « Afficher mon lien d’animation » and shows nothing else at first', () => {
    const { element } = render('secret');
    expect(element.querySelector('button')?.textContent?.trim()).toBe(
      "Afficher mon lien d'animation",
    );
    expect(element.querySelector('code')).toBeNull();
  });

  it('rebuilds the private link from the stored token, with a warning, and copies it', async () => {
    const { fixture, element, clipboard } = render('secret');

    element.querySelector<HTMLButtonElement>('button')!.click();
    fixture.detectChanges();

    expect(element.querySelector('code')?.textContent).toBe(
      `${location.origin}/s/${SESSION_ID}/animer#secret`,
    );
    expect(element.textContent).toContain('À garder pour vous.');
    element.querySelector<HTMLButtonElement>('.linkbox button')!.click();
    await Promise.resolve();
    expect(clipboard).toHaveBeenCalledWith(`${location.origin}/s/${SESSION_ID}/animer#secret`);
  });

  it('hides the link again', () => {
    const { fixture, element } = render('secret');
    element.querySelector<HTMLButtonElement>('button')!.click();
    fixture.detectChanges();

    element.querySelector<HTMLButtonElement>('.secret > button')!.click();
    fixture.detectChanges();

    expect(element.querySelector('code')).toBeNull();
  });

  it('says so when this browser has no animation token', () => {
    const { fixture, element } = render(null);

    element.querySelector<HTMLButtonElement>('button')!.click();
    fixture.detectChanges();

    expect(element.querySelector('[role="alert"]')?.textContent).toContain("jeton d'animation");
    expect(element.querySelector('code')).toBeNull();
  });
});
