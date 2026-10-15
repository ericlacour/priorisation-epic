import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { ModalComponent } from './modal.component';

@Component({
  imports: [ModalComponent],
  template: `
    <button type="button" id="opener">Ouvrir</button>
    @if (open()) {
      <app-modal labelledBy="t" (closed)="closes = closes + 1"><h2 id="t">Titre</h2></app-modal>
    }
  `,
})
class HostComponent {
  readonly open = signal(true);
  closes = 0;
}

describe('ModalComponent', () => {
  async function render() {
    const fixture = TestBed.createComponent(HostComponent);
    const opener = fixture.nativeElement.querySelector('#opener') as HTMLButtonElement;
    document.body.appendChild(fixture.nativeElement);
    opener.focus();
    fixture.detectChanges();
    await Promise.resolve();
    return { fixture, opener, element: fixture.nativeElement as HTMLElement };
  }

  it('is a labelled modal dialog that takes the focus, then gives it back', async () => {
    const { fixture, opener, element } = await render();
    const dialog = element.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBe('t');
    expect(document.activeElement).toBe(dialog);

    fixture.componentInstance.open.set(false);
    fixture.detectChanges();
    expect(document.activeElement).toBe(opener);
    fixture.nativeElement.remove();
  });

  it('closes with the cross, Escape or a click beside it', async () => {
    const { fixture, element } = await render();
    (element.querySelector('.panel-close') as HTMLButtonElement).click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    (element.querySelector('[data-testid="modal-backdrop"]') as HTMLButtonElement).click();
    expect(fixture.componentInstance.closes).toBe(3);
    fixture.nativeElement.remove();
  });
});
