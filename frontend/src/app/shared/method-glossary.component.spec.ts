import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { TWO_CRITERIA, WSJF } from '../testing/fixtures';
import { MethodGlossaryComponent } from './method-glossary.component';

describe('MethodGlossaryComponent', () => {
  function render(definition = WSJF) {
    const fixture = TestBed.createComponent(MethodGlossaryComponent);
    fixture.componentRef.setInput('definition', definition);
    const requested: number[] = [];
    const closed: number[] = [];
    fixture.componentInstance.methodRequested.subscribe(() => requested.push(1));
    fixture.componentInstance.closed.subscribe(() => closed.push(1));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return { fixture, element, requested, closed };
  }

  it('is a panel titled after the method', () => {
    const { element } = render();
    expect(element.querySelector('[role="dialog"]')?.getAttribute('aria-labelledby')).toBe(
      'glossary-title',
    );
    expect(element.querySelector('h2')?.textContent).toBe('Comprendre le WSJF');
  });

  it('lists every criterion and computed value of the definition, with name and definition', () => {
    const { element } = render();
    const terms = [...element.querySelectorAll('dt')].map((dt) => dt.textContent?.trim());
    expect(terms).toEqual([
      'BV · Business Value',
      'TC · Time Criticality',
      'RR/OE · Risk Reduction / Opportunity Enablement',
      'JS · Job Size',
      'CoD · Cost of Delay',
      'WSJF · Weighted Shortest Job First',
    ]);
    expect(element.querySelector('dd')?.textContent).toBe(
      'Valeur apportée aux utilisateurs ou au business.',
    );
  });

  it('follows another method without any WSJF code', () => {
    const { element } = render(TWO_CRITERIA);
    expect(element.querySelector('h2')?.textContent).toBe('Comprendre le Reach / Effort');
    expect([...element.querySelectorAll('dt')].map((dt) => dt.textContent?.trim())).toEqual([
      'Reach · Reach',
      'Effort · Effort',
      'Ratio · Reach / Effort',
    ]);
  });

  it('asks for the full method', () => {
    const { element, requested } = render();
    element.querySelector<HTMLButtonElement>('.link-button')!.click();
    expect(requested).toHaveLength(1);
  });

  it('closes with the cross', () => {
    const { element, closed } = render();
    element.querySelector<HTMLButtonElement>('.panel-close')!.click();
    expect(closed).toHaveLength(1);
  });
});
