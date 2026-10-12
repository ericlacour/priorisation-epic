import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { LOCAL_STORAGE } from '../storage/browser-storage';
import { TopBarComponent } from './top-bar.component';

describe('TopBarComponent', () => {
  afterEach(() => document.documentElement.removeAttribute('data-theme'));

  function render() {
    const data = new Map<string, string>();
    const backing = {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => void data.set(k, v),
      removeItem: (k: string) => void data.delete(k),
    } as Storage;
    TestBed.configureTestingModule({
      providers: [{ provide: LOCAL_STORAGE, useValue: () => backing }],
    });
    const fixture = TestBed.createComponent(TopBarComponent);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement, data };
  }

  const items = (element: HTMLElement) => [
    ...element.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'),
  ];

  it('shows the PF badge and the application name', () => {
    const { element } = render();
    expect(element.querySelector('.brand-mark')?.textContent?.trim()).toBe('PF');
    expect(element.querySelector('.brand-name')?.textContent).toBe('Priorisation Fonctionnalités');
  });

  it('opens the theme menu, chooses a theme, applies and stores it, and returns focus to the button', () => {
    const { fixture, element, data } = render();
    const trigger = element.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!;
    expect(items(element)).toHaveLength(0);
    trigger.click();
    fixture.detectChanges();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(items(element).map((i) => i.textContent?.trim())).toEqual([
      '✓ Automatique',
      'Clair',
      'Sombre',
    ]);

    items(element)[2].click();
    fixture.detectChanges();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(data.get('pe.theme')).toBe('dark');
    expect(items(element)).toHaveLength(0);
    expect(document.activeElement).toBe(trigger);
  });

  it('choosing the current theme only closes the menu', () => {
    const { fixture, element, data } = render();
    element.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!.click();
    fixture.detectChanges();
    items(element)[0].click();
    fixture.detectChanges();
    expect(data.has('pe.theme')).toBe(false);
    expect(items(element)).toHaveLength(0);
  });

  it('navigates with the keyboard and closes on Escape, Tab or an outside click', () => {
    const { fixture, element } = render();
    const trigger = element.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]')!;
    const open = () => {
      trigger.click();
      fixture.detectChanges();
    };
    const press = (key: string, target: Element) => {
      target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
      fixture.detectChanges();
    };

    open();
    const list = items(element);
    press('ArrowDown', list[0]);
    expect(document.activeElement).toBe(list[1]);
    press('ArrowUp', list[0]);
    expect(document.activeElement).toBe(list[2]);
    press('Home', list[2]);
    expect(document.activeElement).toBe(list[0]);
    press('End', list[0]);
    expect(document.activeElement).toBe(list[2]);
    press('Escape', list[2]);
    expect(items(element)).toHaveLength(0);

    open();
    press('Tab', items(element)[0]);
    expect(items(element)).toHaveLength(0);

    open();
    trigger.click();
    fixture.detectChanges();
    expect(items(element)).toHaveLength(0);

    open();
    document.body.click();
    fixture.detectChanges();
    expect(items(element)).toHaveLength(0);
  });
});
