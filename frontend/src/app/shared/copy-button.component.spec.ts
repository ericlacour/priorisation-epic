import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CLIPBOARD } from './clipboard';
import { CopyButtonComponent } from './copy-button.component';

describe('CopyButtonComponent', () => {
  afterEach(() => vi.useRealTimers());

  function render(
    text: string | null,
    clipboard = vi.fn<(text: string) => Promise<void>>(async () => undefined),
  ) {
    TestBed.configureTestingModule({ providers: [{ provide: CLIPBOARD, useValue: clipboard }] });
    const fixture = TestBed.createComponent(CopyButtonComponent);
    fixture.componentRef.setInput('label', 'Copier Session');
    fixture.componentRef.setInput('hint', "Copie le lien d'invitation");
    fixture.componentRef.setInput('text', text);
    fixture.componentRef.setInput('unavailable', 'Lien indisponible.');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const button = element.querySelector('button')!;
    return { fixture, element, button, clipboard };
  }

  it('copies the link without showing it, says « Copié », then goes back to its label', async () => {
    vi.useFakeTimers();
    const { fixture, element, button, clipboard } = render('https://exemple.test/s/1');
    expect(button.getAttribute('title')).toBe("Copie le lien d'invitation");
    expect(element.textContent).not.toContain('https://exemple.test/s/1');

    button.click();
    await vi.advanceTimersByTimeAsync(0);
    fixture.detectChanges();
    expect(clipboard).toHaveBeenCalledWith('https://exemple.test/s/1');
    expect(button.textContent?.trim()).toBe('Copié');

    await vi.advanceTimersByTimeAsync(2000);
    fixture.detectChanges();
    expect(button.textContent?.trim()).toBe('Copier Session');
  });

  it('shows the link to copy by hand when the browser refuses', async () => {
    const refuse = vi.fn(async () => Promise.reject(new Error('denied')));
    const { fixture, element, button } = render('https://exemple.test/s/1', refuse);

    button.click();
    await new Promise((resolve) => setTimeout(resolve));
    fixture.detectChanges();

    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Copie impossible');
    expect(element.querySelector('code')?.textContent).toBe('https://exemple.test/s/1');
  });

  it('closes the message with its ×, with Escape and with a click elsewhere', async () => {
    const refuse = vi.fn(async () => Promise.reject(new Error('denied')));
    const { fixture, element, button } = render('https://exemple.test/s/1', refuse);
    const fail = async () => {
      button.click();
      await new Promise((resolve) => setTimeout(resolve));
      fixture.detectChanges();
      expect(element.querySelector('[role="alert"]')).not.toBeNull();
    };

    await fail();
    element.querySelector<HTMLButtonElement>('button[aria-label="Fermer"]')!.click();
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')).toBeNull();

    await fail();
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')).toBeNull();

    await fail();
    document.body.click();
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')).toBeNull();
  });

  it('stops its « Copié » timer when destroyed', async () => {
    vi.useFakeTimers();
    const { fixture, button } = render('https://exemple.test/s/1');
    button.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);

    fixture.destroy();

    expect(vi.getTimerCount()).toBe(0);
  });

  it('says the link is unavailable when there is nothing to copy', () => {
    const { fixture, element, button, clipboard } = render(null);

    button.click();
    fixture.detectChanges();

    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Lien indisponible.');
    expect(clipboard).not.toHaveBeenCalled();
  });
});
