import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { CriterionTermComponent } from './criterion-term.component';

describe('CriterionTermComponent', () => {
  function render() {
    const fixture = TestBed.createComponent(CriterionTermComponent);
    fixture.componentRef.setInput('code', 'BV');
    fixture.componentRef.setInput('label', 'Business Value');
    fixture.componentRef.setInput('definition', 'Valeur apportée aux utilisateurs ou au business.');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return { fixture, element, button: element.querySelector<HTMLButtonElement>('button')! };
  }

  it('shows the code and announces code, name and definition to screen readers', () => {
    const { button } = render();
    expect(button.textContent?.trim()).toBe('BV');
    expect(button.getAttribute('aria-label')).toBe(
      'BV, Business Value : Valeur apportée aux utilisateurs ou au business.',
    );
  });

  it('shows the definition on keyboard focus and hides it on blur', () => {
    const { fixture, element, button } = render();
    expect(element.querySelector('[role="tooltip"]')).toBeNull();

    button.dispatchEvent(new Event('focus'));
    fixture.detectChanges();
    const tip = element.querySelector('[role="tooltip"]');
    expect(tip?.textContent).toContain('Valeur apportée aux utilisateurs ou au business.');
    expect(button.getAttribute('aria-describedby')).toBe(tip?.id);

    button.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(element.querySelector('[role="tooltip"]')).toBeNull();
  });

  it('shows the definition on hover and on touch (click), and closes it with Escape', () => {
    const { fixture, element, button } = render();

    button.dispatchEvent(new Event('mouseenter'));
    fixture.detectChanges();
    expect(element.querySelector('[role="tooltip"]')).not.toBeNull();
    button.dispatchEvent(new Event('mouseleave'));
    fixture.detectChanges();
    expect(element.querySelector('[role="tooltip"]')).toBeNull();

    button.click();
    fixture.detectChanges();
    expect(element.querySelector('[role="tooltip"]')).not.toBeNull();
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(element.querySelector('[role="tooltip"]')).toBeNull();
  });
});
