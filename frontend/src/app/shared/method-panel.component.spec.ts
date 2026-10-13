import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { TWO_CRITERIA, WSJF } from '../testing/fixtures';
import { MethodPanelComponent } from './method-panel.component';

describe('MethodPanelComponent', () => {
  function render(definition = WSJF, withScale = true) {
    const fixture = TestBed.createComponent(MethodPanelComponent);
    fixture.componentRef.setInput('definition', definition);
    fixture.componentRef.setInput(
      'scale',
      withScale ? { type: 'CONTINUOUS', max: 10, allowedValues: [1, 2] } : null,
    );
    const closed: number[] = [];
    fixture.componentInstance.closed.subscribe(() => closed.push(1));
    fixture.detectChanges();
    return { element: fixture.nativeElement as HTMLElement, closed };
  }

  const rows = (element: HTMLElement, table: number) =>
    [...element.querySelectorAll('table')[table].querySelectorAll('tbody tr')].map((row) =>
      [...row.querySelectorAll('td')].map((cell) => cell.textContent?.trim()),
    );

  it('shows the WSJF definition: name, version, formula, criteria, computed values, tie-break and scale', () => {
    const { element } = render();

    expect(element.querySelector('h2')?.textContent).toContain('WSJF');
    expect(element.querySelector('h2 .badge')?.textContent).toBe('version 1');
    expect(element.querySelector('.formula')?.textContent).toBe(
      'CoD = BV + TC + RR/OE ; WSJF = CoD / JS',
    );
    expect(rows(element, 0)).toHaveLength(4);
    expect(rows(element, 0)[2]).toEqual([
      'RR/OE',
      'Risk Reduction / Opportunity Enablement',
      'Capacité à réduire un risque ou à permettre une opportunité.',
      'RR/OE',
    ]);
    expect(rows(element, 1)).toEqual([
      ['CoD', 'Cost of Delay', 'Coût du retard : BV + TC + RR/OE.', 'Entier'],
      [
        'WSJF',
        'Weighted Shortest Job First',
        'CoD / JS ; plus il est élevé, plus la fonctionnalité est prioritaire.',
        '2 décimales',
      ],
    ]);
    expect(element.textContent).toContain('WSJF décroissant, puis CoD décroissant');
    expect(element.textContent).toContain('Entiers de 1 à 10');
    expect(element.textContent).toContain(
      'La méthode est choisie à la création de la session et ne peut plus être modifiée',
    );
  });

  it('shows another method from its definition alone', () => {
    const { element } = render(TWO_CRITERIA);
    expect(element.querySelector('h2')?.textContent).toContain('Reach / Effort');
    expect(rows(element, 0).map((row) => row[0])).toEqual(['Reach', 'Effort']);
    expect(rows(element, 1).map((row) => row[0])).toEqual(['Ratio']);
    expect(element.textContent).not.toContain('Business Value');
  });

  it('omits the scale when there is no session yet', () => {
    expect(render(WSJF, false).element.textContent).not.toContain('Échelle de la session');
  });

  it('closes with the cross, Escape and a click outside', () => {
    const { element, closed } = render();
    element.querySelector<HTMLButtonElement>('.panel-close')!.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    element.querySelector<HTMLButtonElement>('[data-testid="panel-backdrop"]')!.click();
    expect(closed).toHaveLength(3);
  });
});
