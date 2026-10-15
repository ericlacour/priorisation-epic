import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { MethodInfoComponent } from './method-info.component';

describe('MethodInfoComponent', () => {
  function render(formula = 'A = B + C') {
    const fixture = TestBed.createComponent(MethodInfoComponent);
    fixture.componentRef.setInput('formula', formula);
    fixture.componentRef.setInput(
      'tieBreakRule',
      'A décroissant, puis identifiant croissant. Les incomplètes viennent en fin de liste.',
    );
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return { fixture, element, button: element.querySelector('button')! };
  }

  it('announces the formula and the sort rule, which come from the session state', () => {
    const { button } = render();
    expect(button.textContent?.trim()).toBe('');
    expect(button.getAttribute('aria-label')).toBe(
      'Formule et règle de tri : A = B + C. Tri : A décroissant, puis identifiant croissant. ' +
        'Les incomplètes viennent en fin de liste.',
    );
  });

  it('adds no second period after a formula that already ends with one', () => {
    const { button } = render('A = B + C. Il faut C.');
    expect(button.getAttribute('aria-label')).toContain('Il faut C. Tri :');
  });

  it('shows them on hover, keyboard focus and touch, and hides them on Escape', () => {
    const { fixture, element, button } = render();
    const tip = () => element.querySelector('[role="tooltip"]');

    button.dispatchEvent(new Event('mouseenter'));
    fixture.detectChanges();
    expect(tip()?.textContent).toContain('A = B + C');
    expect(button.getAttribute('aria-describedby')).toBe(tip()?.id);
    button.dispatchEvent(new Event('mouseleave'));
    fixture.detectChanges();
    expect(tip()).toBeNull();

    button.dispatchEvent(new Event('focus'));
    fixture.detectChanges();
    expect(tip()).not.toBeNull();
    button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    fixture.detectChanges();
    expect(tip()).toBeNull();

    button.click();
    fixture.detectChanges();
    expect(tip()?.textContent).toContain('fin de liste');
  });
});
