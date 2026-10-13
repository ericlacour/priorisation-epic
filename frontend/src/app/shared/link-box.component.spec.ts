import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { settle } from '../testing/helpers';
import { CLIPBOARD } from './clipboard';
import { LinkBoxComponent } from './link-box.component';

describe('LinkBoxComponent', () => {
  function render(clipboard: (text: string) => Promise<void>) {
    TestBed.configureTestingModule({ providers: [{ provide: CLIPBOARD, useValue: clipboard }] });
    const fixture = TestBed.createComponent(LinkBoxComponent);
    fixture.componentRef.setInput('url', 'https://x.example/s/abc');
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('copies the link and says so', async () => {
    const clipboard = vi.fn(async () => undefined);
    const { fixture, element } = render(clipboard);
    expect(element.querySelector('code')?.textContent).toBe('https://x.example/s/abc');

    element.querySelector('button')!.click();
    await settle(fixture);

    expect(clipboard).toHaveBeenCalledWith('https://x.example/s/abc');
    expect(element.querySelector('button')?.textContent?.trim()).toBe('Copié');
  });

  it('says when the browser refuses to copy', async () => {
    const { fixture, element } = render(() => Promise.reject(new Error('refusé')));

    element.querySelector('button')!.click();
    await settle(fixture);

    expect(element.querySelector('[role="alert"]')?.textContent).toContain('Copie impossible');
    expect(element.querySelector('button')?.textContent?.trim()).toBe('Copier');
  });

  it('uses the browser clipboard by default and fails cleanly without it', async () => {
    const { CLIPBOARD: token } = await import('./clipboard');
    TestBed.configureTestingModule({});
    const copy = TestBed.inject(token);
    const original = Object.getOwnPropertyDescriptor(globalThis.navigator, 'clipboard');
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: undefined,
      configurable: true,
    });
    await expect(copy('x')).rejects.toThrow('clipboard unavailable');
    const written: string[] = [];
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: { writeText: async (text: string) => void written.push(text) },
      configurable: true,
    });
    await copy('abc');
    expect(written).toEqual(['abc']);
    if (original) Object.defineProperty(globalThis.navigator, 'clipboard', original);
    else delete (globalThis.navigator as unknown as Record<string, unknown>)['clipboard'];
  });
});
