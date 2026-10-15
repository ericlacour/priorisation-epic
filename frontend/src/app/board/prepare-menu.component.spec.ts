import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { PrepareMenuComponent } from './prepare-menu.component';

describe('PrepareMenuComponent', () => {
  async function render() {
    const fixture = TestBed.createComponent(PrepareMenuComponent);
    const chosen = vi.fn();
    fixture.componentInstance.chosen.subscribe(chosen);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const trigger = element.querySelector('button') as HTMLButtonElement;
    const open = async () => {
      trigger.click();
      fixture.detectChanges();
      await fixture.whenStable();
    };
    return { fixture, element, trigger, chosen, open };
  }

  const items = (element: HTMLElement) => [
    ...element.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'),
  ];

  it('opens a menu with the two preparation actions, the first one focused', async () => {
    const { element, trigger, open, fixture } = await render();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    await open();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(items(element).map((item) => item.textContent?.trim())).toEqual([
      'Importer des fonctionnalités',
      'Échelle des valeurs',
    ]);
    expect(document.activeElement).toBe(items(element)[0]);
    fixture.nativeElement.remove();
  });

  it('emits the chosen action and closes', async () => {
    const { element, open, chosen, fixture } = await render();
    await open();
    items(element)[1].click();
    fixture.detectChanges();
    expect(chosen).toHaveBeenCalledWith('scale');
    expect(items(element)).toHaveLength(0);
    fixture.nativeElement.remove();
  });

  it('moves with the arrows, Home and End, and closes on Escape with the focus back', async () => {
    const { element, trigger, open, fixture } = await render();
    await open();
    const menu = element.querySelector('[role="menu"]') as HTMLElement;
    const key = (k: string) =>
      document.activeElement?.dispatchEvent(
        new KeyboardEvent('keydown', { key: k, bubbles: true }),
      );
    key('ArrowDown');
    expect(document.activeElement).toBe(items(element)[1]);
    key('ArrowDown');
    expect(document.activeElement).toBe(items(element)[0]);
    key('ArrowUp');
    expect(document.activeElement).toBe(items(element)[1]);
    key('Home');
    expect(document.activeElement).toBe(items(element)[0]);
    key('End');
    expect(document.activeElement).toBe(items(element)[1]);
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    fixture.detectChanges();
    expect(items(element)).toHaveLength(0);

    await open();
    key('Escape');
    fixture.detectChanges();
    expect(items(element)).toHaveLength(0);
    expect(document.activeElement).toBe(trigger);
    fixture.nativeElement.remove();
  });

  it('closes on a click elsewhere and toggles on the button', async () => {
    const { element, trigger, open, fixture } = await render();
    await open();
    document.body.click();
    fixture.detectChanges();
    expect(items(element)).toHaveLength(0);
    await open();
    trigger.click();
    fixture.detectChanges();
    expect(items(element)).toHaveLength(0);
    fixture.nativeElement.remove();
  });
});
