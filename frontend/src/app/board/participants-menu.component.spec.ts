import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { PEOPLE } from '../testing/fixtures';
import { ParticipantsMenuComponent } from './participants-menu.component';

describe('ParticipantsMenuComponent', () => {
  afterEach(() => document.body.replaceChildren());

  function render() {
    const fixture = TestBed.createComponent(ParticipantsMenuComponent);
    fixture.componentRef.setInput('participants', PEOPLE);
    fixture.componentRef.setInput('meId', 'p1');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    // Attaché au document : le focus et les clics ailleurs s'y vérifient.
    document.body.append(element);
    const toggle = element.querySelector('button')!;
    const open = async () => {
      toggle.click();
      fixture.detectChanges();
      await fixture.whenStable();
    };
    return { fixture, element, toggle, open };
  }

  it('shows the participants and their presence only on demand (FR-005), focusing the list', async () => {
    const { element, toggle, open } = render();
    expect(toggle.textContent).toContain('Participants (2)');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(element.querySelector('.plist')).toBeNull();

    await open();

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const items = [...element.querySelectorAll('.plist li')];
    expect(items[0].textContent?.replace(/\s+/g, ' ')).toContain('Éric (vous)');
    expect(items[0].textContent).toContain('animateur');
    expect(items[0].querySelector('.dot.on')).not.toBeNull();
    expect(items[1].textContent).toContain('hors ligne');
    expect(items[1].querySelector('.dot.off')).not.toBeNull();
    expect(document.activeElement).toBe(element.querySelector('#participants-list'));
  });

  it('closes on Escape and gives the focus back to the button', async () => {
    const { fixture, element, toggle, open } = render();
    await open();

    element
      .querySelector('#participants-list')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(element.querySelector('.plist')).toBeNull();
    expect(document.activeElement).toBe(toggle);
  });

  it('closes when the focus leaves it (Tab) and on a click elsewhere', async () => {
    const { fixture, element, open } = render();
    const outside = document.createElement('button');
    document.body.append(outside);

    await open();
    element
      .querySelector('#participants-list')!
      .dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: outside }));
    fixture.detectChanges();
    expect(element.querySelector('.plist')).toBeNull();

    await open();
    outside.click();
    fixture.detectChanges();
    expect(element.querySelector('.plist')).toBeNull();
  });

  it('stays open on a click inside the list', async () => {
    const { fixture, element, open } = render();
    await open();
    element.querySelector<HTMLElement>('.plist li')!.click();
    fixture.detectChanges();
    expect(element.querySelector('.plist')).not.toBeNull();
  });
});
