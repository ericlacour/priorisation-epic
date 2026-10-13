import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { TWO_CRITERIA, WSJF } from '../testing/fixtures';
import { memoryStorage } from '../testing/helpers';
import { MethodGlossaryComponent } from './method-glossary.component';

describe('MethodGlossaryComponent', () => {
  function render(definition = WSJF, stored?: 'open' | 'closed') {
    const storage = memoryStorage();
    if (stored) storage.data.set('pe.glossary', stored);
    TestBed.configureTestingModule({ providers: [storage.provider] });
    const fixture = TestBed.createComponent(MethodGlossaryComponent);
    fixture.componentRef.setInput('definition', definition);
    const requested: number[] = [];
    fixture.componentInstance.methodRequested.subscribe(() => requested.push(1));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return { fixture, element, storage, requested };
  }

  const toggle = (element: HTMLElement) =>
    element.querySelector<HTMLButtonElement>('.glossary-toggle')!;

  it('is open by default and titled after the method', () => {
    const { element } = render();
    expect(element.querySelector('h2')?.textContent).toBe('Comprendre le WSJF');
    expect(toggle(element).getAttribute('aria-expanded')).toBe('true');
    expect(element.querySelector('dl')).not.toBeNull();
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

  it('folds, unfolds and remembers the choice in the browser', () => {
    const { fixture, element, storage } = render();

    toggle(element).click();
    fixture.detectChanges();
    expect(element.querySelector('dl')).toBeNull();
    expect(toggle(element).getAttribute('aria-expanded')).toBe('false');
    expect(toggle(element).textContent).toContain('Déplier');
    expect(storage.data.get('pe.glossary')).toBe('closed');

    toggle(element).click();
    fixture.detectChanges();
    expect(element.querySelector('dl')).not.toBeNull();
    expect(toggle(element).textContent).toContain('Replier');
    expect(storage.data.get('pe.glossary')).toBe('open');
  });

  it('starts folded when the choice was stored', () => {
    const { element } = render(WSJF, 'closed');
    expect(element.querySelector('dl')).toBeNull();
  });

  it('asks for the full method', () => {
    const { element, requested } = render();
    element.querySelector<HTMLButtonElement>('.link-button')!.click();
    expect(requested).toHaveLength(1);
  });
});
