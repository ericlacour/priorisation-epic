import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LinkBoxComponent } from './link-box.component';

function mount() {
  const fixture = TestBed.createComponent(LinkBoxComponent);
  fixture.componentRef.setInput('url', 'https://app.example/s/abc');
  fixture.componentRef.setInput('label', "le lien d'invitation");
  fixture.detectChanges();
  return { fixture, root: fixture.nativeElement as HTMLElement };
}

const button = (root: HTMLElement) => root.querySelector('button') as HTMLButtonElement;

describe('LinkBoxComponent', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the link and a button named after it', () => {
    const { root } = mount();
    expect(root.querySelector('code')?.textContent).toBe('https://app.example/s/abc');
    expect(button(root).getAttribute('aria-label')).toBe("Copier le lien d'invitation");
    expect(button(root).textContent?.trim()).toBe('Copier');
  });

  it('copies the link to the clipboard and says so', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const { fixture, root } = mount();
    button(root).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(writeText).toHaveBeenCalledWith('https://app.example/s/abc');
    expect(button(root).textContent?.trim()).toBe('Copié');
    expect(root.querySelector('[role="alert"]')).toBeNull();
  });

  it('keeps the link selectable and explains when copying is refused', async () => {
    const writeText = vi.fn(async () => {
      throw new Error('refused');
    });
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    const { fixture, root } = mount();
    button(root).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('Copie impossible');
    expect(button(root).textContent?.trim()).toBe('Copier');
    expect(root.querySelector('code')?.textContent).toBe('https://app.example/s/abc');
  });
});
