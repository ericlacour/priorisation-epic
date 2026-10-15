import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { CLIPBOARD } from '../shared/clipboard';
import { SESSION_ID } from '../testing/fixtures';
import { memoryStorage } from '../testing/helpers';
import { LinksMenuComponent } from './links-menu.component';

const INVITE = `https://app.example/s/${SESSION_ID}`;

describe('LinksMenuComponent', () => {
  async function render(withAnimation = true) {
    const storage = memoryStorage();
    storage.data.set(`pe.animation.${SESSION_ID}`, 'secret');
    const clipboard = vi.fn(async () => undefined);
    TestBed.configureTestingModule({
      providers: [storage.provider, { provide: CLIPBOARD, useValue: clipboard }],
    });
    const fixture = TestBed.createComponent(LinksMenuComponent);
    fixture.componentRef.setInput('sessionId', SESSION_ID);
    fixture.componentRef.setInput('inviteUrl', INVITE);
    fixture.componentRef.setInput('withAnimation', withAnimation);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const trigger = element.querySelector('button') as HTMLButtonElement;
    const open = async () => {
      trigger.click();
      fixture.detectChanges();
      await fixture.whenStable();
    };
    const list = () => element.querySelector<HTMLElement>('#links-list');
    const labels = () =>
      [...(list()?.querySelectorAll('button') ?? [])].map((b) => b.textContent?.trim());
    return { fixture, element, trigger, open, list, labels, clipboard };
  }

  it('is closed at first, then shows both links without displaying them, the list focused', async () => {
    const { fixture, element, trigger, open, list, labels } = await render();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(list()).toBeNull();
    await open();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(trigger.getAttribute('aria-controls')).toBe('links-list');
    expect(labels()).toEqual(['Copier le lien d’invitation', 'Copier mon lien d’animation']);
    expect(document.activeElement).toBe(list());
    expect(element.textContent).not.toContain(INVITE);
    expect(element.textContent).not.toContain('secret');
    fixture.nativeElement.remove();
  });

  it('copies the invitation link', async () => {
    const { fixture, open, list, clipboard } = await render();
    await open();
    (list()!.querySelector('button') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(clipboard).toHaveBeenCalledWith(INVITE);
    fixture.nativeElement.remove();
  });

  it('offers no animation link when told so (phone)', async () => {
    const { fixture, open, labels } = await render(false);
    await open();
    expect(labels()).toEqual(['Copier le lien d’invitation']);
    fixture.nativeElement.remove();
  });

  it('closes on Escape with the focus back on the button, and toggles on the button', async () => {
    const { fixture, trigger, open, list } = await render();
    await open();
    list()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(list()).toBeNull();
    expect(document.activeElement).toBe(trigger);

    await open();
    await open();
    expect(list()).toBeNull();
    fixture.nativeElement.remove();
  });

  it('closes on a click elsewhere or when the focus leaves it', async () => {
    const { fixture, open, list } = await render();
    const outside = document.createElement('button');
    document.body.appendChild(outside);

    await open();
    document.body.click();
    fixture.detectChanges();
    expect(list()).toBeNull();

    await open();
    list()!.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: outside }));
    fixture.detectChanges();
    expect(list()).toBeNull();

    outside.remove();
    fixture.nativeElement.remove();
  });
});
