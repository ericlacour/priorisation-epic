import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { DrawerComponent } from './drawer.component';

@Component({
  imports: [DrawerComponent],
  template: `
    <button id="opener" type="button">ouvrir</button>
    @if (open()) {
      <app-drawer labelledBy="t" [suspended]="suspended()" (closed)="onClosed()">
        <h2 drawer-head id="t">Titre</h2>
        <input id="field" />
        <button id="last" type="button" drawer-foot>Dernier</button>
      </app-drawer>
    }
  `,
})
class Host {
  open = signal(true);
  suspended = signal(false);
  closed = 0;
  onClosed(): void {
    this.closed++;
  }
}

async function mount() {
  const fixture = TestBed.createComponent(Host);
  const root = fixture.nativeElement as HTMLElement;
  document.body.appendChild(root);
  fixture.detectChanges();
  await Promise.resolve();
  return { fixture, root, host: fixture.componentInstance };
}

const press = (key: string, shiftKey = false) =>
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }),
  );

describe('DrawerComponent', () => {
  it('is a modal dialog labelled by its title, with projected head, body and foot', async () => {
    const { root } = await mount();
    const dialog = root.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('t');
    expect(root.querySelector('.drawer-head #t')?.textContent).toBe('Titre');
    expect(root.querySelector('.drawer-body #field')).not.toBeNull();
    expect(root.querySelector('.drawer-foot #last')).not.toBeNull();
    root.remove();
  });

  it('makes the scrollable body reachable by keyboard and named by the title', async () => {
    const { root } = await mount();
    const body = root.querySelector('.drawer-body')!;
    expect(body.getAttribute('tabindex')).toBe('0');
    expect(body.getAttribute('role')).toBe('region');
    expect(body.getAttribute('aria-labelledby')).toBe('t');
    // Tab passe du bouton de fermeture au corps du panneau
    const tabbable = Array.from(
      root.querySelectorAll<HTMLElement>('aside button, aside input, aside [tabindex="0"]'),
    );
    expect(tabbable.slice(0, 2)).toEqual([root.querySelector('.drawer-close'), body]);
    root.remove();
  });

  it('puts the focus on the close button when it opens', async () => {
    const { root } = await mount();
    expect(document.activeElement).toBe(root.querySelector('.drawer-close'));
    root.remove();
  });

  it('closes with the cross', async () => {
    const { host, root } = await mount();
    (root.querySelector('.drawer-close') as HTMLButtonElement).click();
    expect(host.closed).toBe(1);
    root.remove();
  });

  it('closes with a click beside the panel', async () => {
    const { host, root } = await mount();
    (root.querySelector('.drawer-backdrop') as HTMLElement).click();
    expect(host.closed).toBe(1);
    root.remove();
  });

  it('closes with Escape', async () => {
    const { host, root } = await mount();
    press('Escape');
    expect(host.closed).toBe(1);
    root.remove();
  });

  it('keeps the focus inside: Tab from the last element goes back to the first', async () => {
    const { root } = await mount();
    const last = root.querySelector('#last') as HTMLElement;
    last.focus();
    press('Tab');
    expect(document.activeElement).toBe(root.querySelector('.drawer-close'));
    root.remove();
  });

  it('keeps the focus inside: Shift+Tab from the first element goes to the last', async () => {
    const { root } = await mount();
    (root.querySelector('.drawer-close') as HTMLElement).focus();
    press('Tab', true);
    expect(document.activeElement).toBe(root.querySelector('#last'));
    root.remove();
  });

  it('pulls a focus that escaped back into the panel', async () => {
    const { root } = await mount();
    (document.querySelector('#opener') as HTMLElement).focus();
    press('Tab');
    expect(root.contains(document.activeElement)).toBe(true);
    root.remove();
  });

  it('lets Tab move normally between inner elements', async () => {
    const { root } = await mount();
    const field = root.querySelector('#field') as HTMLElement;
    field.focus();
    const spy = vi.fn();
    document.addEventListener('keydown', (e) => spy(e.defaultPrevented), { once: true });
    press('Tab');
    expect(spy).toHaveBeenCalledWith(false);
    root.remove();
  });

  it('gives the focus back to the previous element when it closes', async () => {
    const fixture = TestBed.createComponent(Host);
    const root = fixture.nativeElement as HTMLElement;
    document.body.appendChild(root);
    const host = fixture.componentInstance;
    host.open.set(false);
    fixture.detectChanges();
    const opener = root.querySelector('#opener') as HTMLElement;
    opener.focus();
    host.open.set(true);
    fixture.detectChanges();
    await Promise.resolve();
    expect(document.activeElement).toBe(root.querySelector('.drawer-close'));
    host.open.set(false);
    fixture.detectChanges();
    expect(document.activeElement).toBe(opener);
    root.remove();
  });

  it('ignores the keyboard and hides while suspended', async () => {
    const { host, root, fixture } = await mount();
    const drawer = root.querySelector('app-drawer') as HTMLElement;
    host.suspended.set(true);
    fixture.detectChanges();
    expect(drawer.classList.contains('suspended')).toBe(true);
    press('Escape');
    expect(host.closed).toBe(0);
    root.remove();
  });
});
