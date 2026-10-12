import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { CriterionDefinition } from '../api/contract';
import { REACH_EFFORT, WSJF } from '../testing/fixtures';
import { CriterionTermComponent } from './criterion-term.component';

@Component({
  imports: [CriterionTermComponent],
  template: `<app-criterion-term [term]="term" />`,
})
class Host {
  term: Pick<CriterionDefinition, 'code' | 'label' | 'definition'> = WSJF.criteria[0];
}

function setup(): { root: HTMLElement; button: HTMLButtonElement; host: Host } {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  return {
    root,
    button: root.querySelector('button') as HTMLButtonElement,
    host: fixture.componentInstance,
  };
}

const tip = (root: HTMLElement): HTMLElement | null => root.querySelector('.term-tip');

describe('CriterionTermComponent', () => {
  it('shows the code and announces the full definition to screen readers', () => {
    const { button } = setup();
    expect(button.textContent?.trim()).toBe('BV');
    expect(button.getAttribute('aria-label')).toBe(
      'BV, Business Value : Valeur apportée aux utilisateurs ou à l’entreprise.',
    );
  });

  it('shows the definition on hover and hides it when the pointer leaves', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const button = root.querySelector('button')!;
    expect(tip(root)).toBeNull();
    button.dispatchEvent(new Event('mouseenter'));
    fixture.detectChanges();
    expect(tip(root)?.textContent).toContain('Business Value');
    expect(tip(root)?.textContent).toContain('Valeur apportée');
    button.dispatchEvent(new Event('mouseleave'));
    fixture.detectChanges();
    expect(tip(root)).toBeNull();
  });

  it('shows the definition on keyboard focus and hides it on blur or Escape', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const button = root.querySelector('button')!;
    button.dispatchEvent(new Event('focus'));
    fixture.detectChanges();
    expect(tip(root)).not.toBeNull();
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(tip(root)).toBeNull();
    button.dispatchEvent(new Event('focus'));
    fixture.detectChanges();
    button.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(tip(root)).toBeNull();
  });

  it('toggles on tap, for touch screens', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const button = root.querySelector('button')!;
    button.click();
    fixture.detectChanges();
    expect(tip(root)).not.toBeNull();
    button.click();
    fixture.detectChanges();
    expect(tip(root)).toBeNull();
  });

  it('takes its texts from the method definition, not from the code', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.term = REACH_EFFORT.criteria[0];
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const button = root.querySelector('button')!;
    expect(button.textContent?.trim()).toBe('Portée');
    button.click();
    fixture.detectChanges();
    expect(tip(root)?.textContent).toContain('Nombre de personnes touchées.');
  });

  it('aligns the tip to the right near the right edge of the window', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const wrap = root.querySelector('app-criterion-term') as HTMLElement;
    wrap.getBoundingClientRect = () => ({ left: window.innerWidth - 10 }) as DOMRect;
    root.querySelector('button')!.click();
    fixture.detectChanges();
    expect(tip(root)?.classList.contains('term-tip-right')).toBe(true);
  });

  it('does not render a tip before any interaction', () => {
    expect(tip(setup().root)).toBeNull();
  });
});
